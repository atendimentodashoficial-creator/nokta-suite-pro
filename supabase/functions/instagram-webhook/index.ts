import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process spintax by randomly selecting one option from each {option1|option2} block
function processSpintax(input: string): string {
  const text = (input ?? "").toString();
  if (!text.includes("{") || !text.includes("|")) return text;

  let result = text;
  const regex = /\{([^{}]+)\}/g;
  
  let match;
  while ((match = regex.exec(result)) !== null) {
    const inside = match[1];
    if (inside.includes("|")) {
      const options = inside.split("|").map((s) => s.trim()).filter(Boolean);
      if (options.length > 0) {
        const randomOption = options[Math.floor(Math.random() * options.length)];
        result = result.slice(0, match.index) + randomOption + result.slice(match.index + match[0].length);
        // Reset regex to search from the beginning since string changed
        regex.lastIndex = 0;
      }
    }
  }
  
  return result;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // GET request = Meta webhook verification
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      console.log('Webhook verification request:', { mode, token, challenge });

      if (mode === 'subscribe' && token && challenge) {
        // Find config with matching verify token
        const { data: config } = await supabase
          .from('instagram_config')
          .select('webhook_verify_token')
          .eq('webhook_verify_token', token)
          .single();

        if (config) {
          console.log('Token verified successfully');
          return new Response(challenge, {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        } else {
          console.log('Token not found in database');
        }
      }

      return new Response('Verification failed', { status: 403 });
    }

    // POST request = incoming webhook event
    if (req.method === 'POST') {
      const body = await req.json();
      console.log('Webhook event received:', JSON.stringify(body, null, 2));

      // Process Instagram messaging events
      if (body.object === 'instagram') {
        for (const entry of body.entry || []) {
          // Handle messages
          if (entry.messaging) {
            for (const event of entry.messaging) {
              await processMessage(supabase, event);
            }
          }
          // Handle comments
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'comments') {
                await processComment(supabase, change.value);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405 });
  } catch (error: unknown) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processMessage(supabase: any, event: any) {
  const senderId = event.sender?.id;
  const message = event.message;

  if (!senderId || !message) return;

  // Skip echo messages (messages sent by ourselves)
  if (message.is_echo) {
    console.log('Skipping echo message');
    return;
  }

  console.log('Processing message from:', senderId, 'Content:', message.text);

  // Find active config
  const { data: configs } = await supabase
    .from('instagram_config')
    .select('*')
    .eq('is_active', true);

  if (!configs || configs.length === 0) {
    console.log('No active Instagram config found');
    return;
  }

  const config = configs[0];

  // Check if this is first interaction
  const isFirstInteraction = await checkAndTrackInteraction(supabase, config.user_id, senderId);

  // Log the message
  await supabase.from('instagram_mensagens').insert({
    user_id: config.user_id,
    instagram_user_id: senderId,
    tipo: 'dm_recebida',
    conteudo: message.text || '',
    metadata: event,
  });

  // If first interaction, check for welcome trigger
  if (isFirstInteraction) {
    console.log('First interaction detected for user:', senderId);
    
    const { data: welcomeGatilho } = await supabase
      .from('instagram_gatilhos')
      .select('*')
      .eq('user_id', config.user_id)
      .eq('ativo', true)
      .eq('tipo', 'primeira_interacao')
      .maybeSingle();

    if (welcomeGatilho?.resposta_texto) {
      console.log('Sending welcome message');
      
      const welcomeText = processSpintax(welcomeGatilho.resposta_texto);
      
      await sendInstagramMessage(
        config.page_access_token,
        config.instagram_account_id,
        senderId,
        welcomeText
      );

      // Log response
      await supabase.from('instagram_mensagens').insert({
        user_id: config.user_id,
        instagram_user_id: senderId,
        tipo: 'dm_enviada',
        conteudo: welcomeText,
        gatilho_id: welcomeGatilho.id,
      });

      // Don't process other triggers for first interaction
      return;
    }
  }

  // Check keyword triggers - now using ativo_em_dm flag
  const { data: gatilhos } = await supabase
    .from('instagram_gatilhos')
    .select('*')
    .eq('user_id', config.user_id)
    .eq('ativo', true)
    .eq('ativo_em_dm', true);

  for (const gatilho of gatilhos || []) {
    const messageText = (message.text || '').toLowerCase();
    const triggered = gatilho.palavras_chave.some((kw: string) => 
      messageText.includes(kw.toLowerCase())
    );

    if (triggered) {
      console.log('Trigger matched:', gatilho.nome);
      
      // Check if this trigger requires follower verification
      if (gatilho.verificar_seguidor && gatilho.mensagem_pedir_seguir) {
        const followerInfo = await checkIfFollower(config.page_access_token, senderId);
        
        if (followerInfo && !followerInfo.is_user_follow_business) {
          console.log('User does not follow business, sending follow request for trigger:', gatilho.nome);
          
          // Replace {nome} with username if available and process spintax
          let followMessage = processSpintax(gatilho.mensagem_pedir_seguir);
          if (followerInfo.username) {
            followMessage = followMessage.replace(/{nome}/g, followerInfo.username);
          }

          await sendInstagramMessage(
            config.page_access_token,
            config.instagram_account_id,
            senderId,
            followMessage
          );

          // Log the message
          await supabase.from('instagram_mensagens').insert({
            user_id: config.user_id,
            instagram_user_id: senderId,
            instagram_username: followerInfo.username,
            tipo: 'dm_enviada',
            conteudo: followMessage,
            gatilho_id: gatilho.id,
            metadata: { tipo: 'pedir_seguir', follower_info: followerInfo },
          });

          break; // Stop processing - user needs to follow first
        }
      }
      
      // If a form is required, send the form with a button
      if (gatilho.formulario_id) {
        console.log('Trigger has form requirement:', gatilho.formulario_id);
        
        // Build form URL with tracking
        const formUrl = `https://app.noktaodonto.com.br/f/${gatilho.formulario_id}?t=${senderId}`;
        
        let formMessage = gatilho.mensagem_formulario || 'Olá! Para liberar seu material, preencha o formulário abaixo:';
        formMessage = processSpintax(formMessage);
        
        // Get username for {nome} replacement
        const userInfo = await checkIfFollower(config.page_access_token, senderId);
        if (userInfo?.username) {
          formMessage = formMessage.replace(/{nome}/g, userInfo.username);
        }
        
        const buttonText = gatilho.botao_formulario_texto || 'Preencher Formulário';
        
        // Send button with form link - using the message as the template title
        await sendInstagramButtons(
          config.page_access_token,
          config.instagram_account_id,
          senderId,
          [{ type: 'url', title: buttonText, url: formUrl }],
          formMessage // Use the message as the title above the button
        );

        // Log response
        await supabase.from('instagram_mensagens').insert({
          user_id: config.user_id,
          instagram_user_id: senderId,
          tipo: 'dm_enviada',
          conteudo: `${formMessage}\n[Botão: ${buttonText}]`,
          gatilho_id: gatilho.id,
          metadata: { tipo: 'formulario', formulario_id: gatilho.formulario_id, formUrl },
        });
        
        break; // Form was sent, don't send other content
      }
      
      // Send text response
      if (gatilho.resposta_texto) {
        const responseText = processSpintax(gatilho.resposta_texto);
        
        await sendInstagramMessage(
          config.page_access_token,
          config.instagram_account_id,
          senderId,
          responseText
        );

        // Log response
        await supabase.from('instagram_mensagens').insert({
          user_id: config.user_id,
          instagram_user_id: senderId,
          tipo: 'dm_enviada',
          conteudo: responseText,
          gatilho_id: gatilho.id,
        });
      }

      // Send media if configured
      if (gatilho.resposta_midia_url && gatilho.resposta_midia_tipo) {
        await sendInstagramMedia(
          config.page_access_token,
          config.instagram_account_id,
          senderId,
          gatilho.resposta_midia_url,
          gatilho.resposta_midia_tipo
        );
      }

      // Send buttons if configured
      if (gatilho.resposta_botoes && Array.isArray(gatilho.resposta_botoes) && gatilho.resposta_botoes.length > 0) {
        console.log('Sending buttons for trigger:', gatilho.nome, 'Buttons:', JSON.stringify(gatilho.resposta_botoes));
        
        await sendInstagramButtons(
          config.page_access_token,
          config.instagram_account_id,
          senderId,
          gatilho.resposta_botoes,
          gatilho.resposta_texto // Use text as title if available
        );

        // Log response
        await supabase.from('instagram_mensagens').insert({
          user_id: config.user_id,
          instagram_user_id: senderId,
          tipo: 'dm_enviada_botoes',
          conteudo: JSON.stringify(gatilho.resposta_botoes),
          gatilho_id: gatilho.id,
        });
      }

      // Send link if configured
      if (gatilho.resposta_link_url) {
        const linkText = processSpintax(gatilho.resposta_link_texto || gatilho.resposta_link_url);
        await sendInstagramMessage(
          config.page_access_token,
          config.instagram_account_id,
          senderId,
          `${linkText}\n${gatilho.resposta_link_url}`
        );
      }

      break; // Only one response per message
    }
  }

  // Also check ice breaker payloads
  await checkIceBreakerPayload(supabase, config, senderId, message.text);
}

async function checkIfFollower(accessToken: string, userId: string): Promise<any | null> {
  try {
    const trimmed = (accessToken || "").trim();
    const isInstagramGraphToken = trimmed.startsWith("IG");

    const fields = 'username,profile_pic,is_user_follow_business,is_business_follow_user,follower_count';
    
    let url: string;
    if (isInstagramGraphToken) {
      url = `https://graph.instagram.com/v24.0/${userId}?fields=${fields}`;
    } else {
      url = `https://graph.facebook.com/v18.0/${userId}?fields=${fields}&access_token=${trimmed}`;
    }

    const headers: Record<string, string> = {};
    if (isInstagramGraphToken) {
      headers['Authorization'] = `Bearer ${trimmed}`;
    }

    const response = await fetch(url, { headers });
    const result = await response.json();
    
    console.log('Follower check result:', result);

    if (!response.ok) {
      console.error('Failed to check follower status:', result);
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error checking follower status:', error);
    return null;
  }
}

async function checkAndTrackInteraction(supabase: any, userId: string, instagramUserId: string): Promise<boolean> {
  // Check if this user has interacted before
  const { data: existing } = await supabase
    .from('instagram_interacoes')
    .select('id, total_mensagens')
    .eq('user_id', userId)
    .eq('instagram_user_id', instagramUserId)
    .maybeSingle();

  if (existing) {
    // Update last interaction - increment total_mensagens manually
    await supabase
      .from('instagram_interacoes')
      .update({ 
        ultima_interacao_em: new Date().toISOString(),
        total_mensagens: (existing.total_mensagens || 0) + 1
      })
      .eq('id', existing.id);
    return false;
  }

  // First interaction - insert new record
  await supabase
    .from('instagram_interacoes')
    .insert({
      user_id: userId,
      instagram_user_id: instagramUserId,
    });

  return true;
}

async function checkIceBreakerPayload(supabase: any, config: any, senderId: string, messageText: string) {
  if (!messageText) return;

  const iceBreakers = config.ice_breakers || [];
  
  for (const ib of iceBreakers) {
    // Check if the message matches the ice breaker question or payload
    const normalizedMessage = messageText.toLowerCase().trim();
    const normalizedQuestion = (ib.question || '').toLowerCase().trim();
    const normalizedPayload = (ib.payload || '').toLowerCase().trim();

    if (normalizedMessage === normalizedQuestion || normalizedMessage === normalizedPayload) {
      console.log('Ice breaker matched:', ib.question);

      // Look for a trigger that matches this payload
      const { data: gatilhos } = await supabase
        .from('instagram_gatilhos')
        .select('*')
        .eq('user_id', config.user_id)
        .eq('ativo', true);

      for (const gatilho of gatilhos || []) {
        const triggered = gatilho.palavras_chave.some((kw: string) => 
          normalizedPayload.includes(kw.toLowerCase()) || 
          normalizedQuestion.includes(kw.toLowerCase())
        );

        if (triggered && gatilho.resposta_texto) {
          const iceBreakerText = processSpintax(gatilho.resposta_texto);
          
          await sendInstagramMessage(
            config.page_access_token,
            config.instagram_account_id,
            senderId,
            iceBreakerText
          );

          await supabase.from('instagram_mensagens').insert({
            user_id: config.user_id,
            instagram_user_id: senderId,
            tipo: 'dm_enviada',
            conteudo: iceBreakerText,
            gatilho_id: gatilho.id,
          });

          break;
        }
      }
      break;
    }
  }
}

async function processComment(supabase: any, comment: any) {
  console.log('Processing comment:', comment);

  // Find active config
  const { data: configs } = await supabase
    .from('instagram_config')
    .select('*')
    .eq('is_active', true);

  if (!configs || configs.length === 0) return;

  const config = configs[0];

  // IMPORTANT: Skip comments from own account to prevent infinite loops
  const commenterId = comment.from?.id;
  const ownAccountId = config.instagram_account_id;
  
  if (commenterId && ownAccountId && commenterId === ownAccountId) {
    console.log('Skipping comment from own account:', commenterId);
    return;
  }

  // Also skip if the commenter ID matches the entry ID (self-comment)
  if (comment.from?.self_ig_scoped_id) {
    console.log('Skipping self-scoped comment');
    // This indicates it might be a comment from the page itself
  }

  // Log the comment
  await supabase.from('instagram_mensagens').insert({
    user_id: config.user_id,
    instagram_user_id: comment.from?.id || 'unknown',
    instagram_username: comment.from?.username,
    tipo: 'comentario',
    conteudo: comment.text || '',
    post_id: comment.media?.id,
    metadata: comment,
  });

  // Check comment triggers - now using ativo_em_comentario flag
  const { data: gatilhos } = await supabase
    .from('instagram_gatilhos')
    .select('*')
    .eq('user_id', config.user_id)
    .eq('ativo', true)
    .eq('ativo_em_comentario', true);

  for (const gatilho of gatilhos || []) {
    const commentText = (comment.text || '').toLowerCase();
    const triggered = gatilho.palavras_chave.some((kw: string) => 
      commentText.includes(kw.toLowerCase())
    );

    if (triggered && comment.from?.id) {
      console.log('Comment trigger matched:', gatilho.nome);

      const commentId = comment.id as string | undefined;

      // 1. Reply publicly to the comment if configured (idempotent)
      if (gatilho.responder_comentario && gatilho.resposta_comentario_texto && commentId) {
        // Avoid double replies if Meta retries the webhook
        const { data: existingPublic } = await supabase
          .from('instagram_mensagens')
          .select('id')
          .eq('user_id', config.user_id)
          .eq('gatilho_id', gatilho.id)
          .eq('tipo', 'resposta_comentario')
          .contains('metadata', { comment_id: commentId })
          .limit(1);

        if (existingPublic && existingPublic.length > 0) {
          console.log('Skipping duplicate public reply for comment:', commentId);
        } else {
          console.log('Replying to comment publicly:', commentId);

          // Process spintax first, then replace {nome}
          let replyText = processSpintax(gatilho.resposta_comentario_texto);
          if (comment.from?.username) {
            replyText = replyText.replace(/{nome}/g, comment.from.username);
          }

          await replyToComment(config.page_access_token, commentId, replyText);

          // Log the public reply (store comment_id for idempotency)
          await supabase.from('instagram_mensagens').insert({
            user_id: config.user_id,
            instagram_user_id: comment.from.id,
            instagram_username: comment.from.username,
            tipo: 'resposta_comentario',
            conteudo: replyText,
            post_id: comment.media?.id,
            gatilho_id: gatilho.id,
            metadata: { via: 'public_reply', comment_id: commentId },
          });
        }
      }
      
      // 2. Send "DM" to commenter.
      // IMPORTANT: Instagram does not allow initiating a normal DM to a user just from a comment.
      // The correct behavior is a *private reply to the comment*, which appears in Inbox/Requests.
      if (commentId && (gatilho.resposta_texto || gatilho.verificar_seguidor)) {
        // Avoid double private replies if Meta retries the webhook
        const { data: existingPrivate } = await supabase
          .from('instagram_mensagens')
          .select('id')
          .eq('user_id', config.user_id)
          .eq('gatilho_id', gatilho.id)
          .eq('tipo', 'dm_enviada')
          .contains('metadata', { comment_id: commentId })
          .limit(1);

        if (existingPrivate && existingPrivate.length > 0) {
          console.log('Skipping duplicate private reply for comment:', commentId);
          break;
        }

        // If follower verification is enabled and user is not a follower, send the follow request first
        if (gatilho.verificar_seguidor && gatilho.mensagem_pedir_seguir) {
          const followerInfo = await checkIfFollower(config.page_access_token, comment.from.id);
          console.log('Follower check for commenter:', followerInfo);

          if (followerInfo && !followerInfo.is_user_follow_business) {
            console.log('Commenter does not follow business, sending follow request (private reply)');

            let followMessage = processSpintax(gatilho.mensagem_pedir_seguir);
            if (comment.from?.username) {
              followMessage = followMessage.replace(/{nome}/g, comment.from.username);
            }

            await sendPrivateReplyToComment(config.page_access_token, commentId, followMessage);

            await supabase.from('instagram_mensagens').insert({
              user_id: config.user_id,
              instagram_user_id: comment.from.id,
              instagram_username: comment.from.username,
              tipo: 'dm_enviada',
              conteudo: followMessage,
              gatilho_id: gatilho.id,
              metadata: { tipo: 'pedir_seguir_comentario', via: 'private_reply', follower_info: followerInfo, comment_id: commentId },
            });

            break; // Stop processing - user needs to follow first
          }
        }

        // If a form is required, send the form link (private replies don't support buttons)
        if (gatilho.formulario_id) {
          console.log('Comment trigger has form requirement:', gatilho.formulario_id);
          
          // Build form URL with tracking
          const formUrl = `https://app.noktaodonto.com.br/f/${gatilho.formulario_id}?t=${comment.from.id}`;
          
          let formMessage = gatilho.mensagem_formulario || 'Olá! Para liberar seu material, preencha o formulário abaixo:';
          formMessage = processSpintax(formMessage);
          
          if (comment.from?.username) {
            formMessage = formMessage.replace(/{nome}/g, comment.from.username);
          }
          
          const buttonText = gatilho.botao_formulario_texto || 'Preencher Formulário';
          
          // For private replies, include the link in the message (buttons not supported)
          const finalMessage = `${formMessage}\n\n👉 ${buttonText}:\n${formUrl}`;
          
          await sendPrivateReplyToComment(config.page_access_token, commentId, finalMessage);

          await supabase.from('instagram_mensagens').insert({
            user_id: config.user_id,
            instagram_user_id: comment.from.id,
            instagram_username: comment.from.username,
            tipo: 'dm_enviada',
            conteudo: finalMessage,
            gatilho_id: gatilho.id,
            metadata: { via: 'private_reply', comment_id: commentId, tipo: 'formulario', formulario_id: gatilho.formulario_id },
          });
        } else {
          // User follows or no verification required - send the actual DM response (private reply)
          const hasDmText = !!gatilho.resposta_texto;
          const hasDmLink = !!gatilho.resposta_link_url;

          if (hasDmText || hasDmLink) {
            const parts: string[] = [];

            if (hasDmText) {
              parts.push(processSpintax(gatilho.resposta_texto));
            }

            if (hasDmLink) {
              const linkLabel = processSpintax(gatilho.resposta_link_texto || gatilho.resposta_link_url);
              parts.push(`${linkLabel}\n${gatilho.resposta_link_url}`);
            }

            const dmText = parts.filter(Boolean).join("\n\n");

            await sendPrivateReplyToComment(config.page_access_token, commentId, dmText);

            await supabase.from('instagram_mensagens').insert({
              user_id: config.user_id,
              instagram_user_id: comment.from.id,
              instagram_username: comment.from.username,
              tipo: 'dm_enviada',
              conteudo: dmText,
              gatilho_id: gatilho.id,
              metadata: { via: 'private_reply', comment_id: commentId, includes_link: hasDmLink },
            });
          }
        }
      }

      break;
    }
  }
}

async function replyToComment(
  accessToken: string,
  commentId: string,
  text: string,
) {
  const trimmed = (accessToken || "").trim();
  const isInstagramGraphToken = trimmed.startsWith("IG");

  // Use the comment ID to reply to the comment
  const url = isInstagramGraphToken
    ? `https://graph.instagram.com/v24.0/${commentId}/replies`
    : `https://graph.facebook.com/v18.0/${commentId}/replies`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isInstagramGraphToken) {
    headers['Authorization'] = `Bearer ${trimmed}`;
  }

  const body = isInstagramGraphToken
    ? { message: text }
    : { message: text, access_token: trimmed };

  console.log('Replying to comment:', { commentId, text, url });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  console.log('Reply to comment result:', { url, status: response.status, result });

  if (!response.ok) {
    console.error('Failed to reply to comment:', result);
    // Don't throw - we still want to proceed
    return null;
  }

  return result;
}

// Sends a DM to a commenter using the /me/messages endpoint with comment_id in recipient.
// This is the approach that works (same as n8n workflow).
async function sendPrivateReplyToComment(
  accessToken: string,
  commentId: string,
  text: string,
) {
  const trimmed = (accessToken || "").trim();
  const isInstagramGraphToken = trimmed.startsWith("IG");

  // Use /me/messages with comment_id in recipient (same as n8n workflow)
  const url = isInstagramGraphToken
    ? `https://graph.instagram.com/v23.0/me/messages`
    : `https://graph.facebook.com/v18.0/me/messages`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isInstagramGraphToken) {
    headers['Authorization'] = `Bearer ${trimmed}`;
  }

  // The key: use comment_id in recipient to send DM to the commenter
  const body = isInstagramGraphToken
    ? {
        recipient: { comment_id: commentId },
        message: { text },
      }
    : {
        recipient: { comment_id: commentId },
        message: { text },
        access_token: trimmed,
      };

  console.log('Sending DM to commenter via /me/messages:', { commentId, text, url });

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  console.log('DM to commenter result:', { url, status: response.status, result });

  if (!response.ok) {
    console.error('DM to commenter failed:', result);
    return null;
  }

  return result;
}

async function sendInstagramMessage(
  accessToken: string,
  instagramAccountId: string | null,
  recipientId: string,
  text: string,
) {
  const trimmed = (accessToken || "").trim();
  const isInstagramGraphToken = trimmed.startsWith("IG");

  const url = isInstagramGraphToken
    ? `https://graph.instagram.com/v24.0/${instagramAccountId ?? 'me'}/messages`
    : `https://graph.facebook.com/v18.0/me/messages`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isInstagramGraphToken) {
    headers['Authorization'] = `Bearer ${trimmed}`;
  }

  const body = isInstagramGraphToken
    ? {
        recipient: { id: recipientId },
        message: { text },
      }
    : {
        recipient: { id: recipientId },
        message: { text },
        access_token: trimmed,
      };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  console.log('Message sent result:', { url, status: response.status, result });

  if (!response.ok) {
    throw new Error(`Send message failed (${response.status}): ${JSON.stringify(result)}`);
  }

  return result;
}

async function sendInstagramMedia(
  accessToken: string,
  instagramAccountId: string | null,
  recipientId: string,
  mediaUrl: string,
  mediaType: string,
) {
  const trimmed = (accessToken || "").trim();
  const isInstagramGraphToken = trimmed.startsWith("IG");

  const url = isInstagramGraphToken
    ? `https://graph.instagram.com/v24.0/${instagramAccountId ?? 'me'}/messages`
    : `https://graph.facebook.com/v18.0/me/messages`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isInstagramGraphToken) {
    headers['Authorization'] = `Bearer ${trimmed}`;
  }

  // Map media type to Instagram API format
  const attachmentType = mediaType === 'video' ? 'video' 
    : mediaType === 'audio' ? 'audio' 
    : 'image';

  const messagePayload = {
    attachment: {
      type: attachmentType,
      payload: {
        url: mediaUrl,
        is_reusable: true,
      },
    },
  };

  const body = isInstagramGraphToken
    ? {
        recipient: { id: recipientId },
        message: messagePayload,
      }
    : {
        recipient: { id: recipientId },
        message: messagePayload,
        access_token: trimmed,
      };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const result = await response.json().catch(() => ({}));
  console.log('Media sent result:', { url, status: response.status, mediaType, result });

  return result;
}

async function sendInstagramButtons(
  accessToken: string,
  instagramAccountId: string | null,
  recipientId: string,
  buttons: any[],
  messageText?: string | null,
) {
  const trimmed = (accessToken || "").trim();
  const isInstagramGraphToken = trimmed.startsWith("IG");

  const url = isInstagramGraphToken
    ? `https://graph.instagram.com/v24.0/${instagramAccountId ?? 'me'}/messages`
    : `https://graph.facebook.com/v18.0/me/messages`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (isInstagramGraphToken) {
    headers['Authorization'] = `Bearer ${trimmed}`;
  }

  // Separate URL buttons and quick replies
  const urlButtons = buttons.filter((b: any) => b.type === 'url' && b.url);
  const quickReplies = buttons.filter((b: any) => b.type === 'quick_reply');

  console.log('Processing buttons - URL buttons:', urlButtons.length, 'Quick replies:', quickReplies.length);

  // If we have URL buttons, use generic template
  if (urlButtons.length > 0) {
    const templateButtons = urlButtons.map((b: any) => ({
      type: "web_url",
      url: b.url.startsWith('http') ? b.url : `https://${b.url}`,
      title: b.title
    }));

    const messagePayload = {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: messageText || "Clique no botão abaixo:",
            buttons: templateButtons.slice(0, 3) // Max 3 buttons per element
          }]
        }
      }
    };

    const body = isInstagramGraphToken
      ? { recipient: { id: recipientId }, message: messagePayload }
      : { recipient: { id: recipientId }, message: messagePayload, access_token: trimmed };

    console.log('Sending template with buttons:', JSON.stringify(body));

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));
    console.log('Template buttons sent result:', { url, status: response.status, result });
    
    if (!response.ok) {
      console.error('Error sending template buttons:', result);
    }
  }

  // If we have quick replies, send them with a text message
  if (quickReplies.length > 0) {
    const messagePayload = {
      text: messageText || "Escolha uma opção:",
      quick_replies: quickReplies.map((b: any) => ({
        content_type: "text",
        title: b.title,
        payload: b.payload || b.title
      }))
    };

    const body = isInstagramGraphToken
      ? { recipient: { id: recipientId }, message: messagePayload }
      : { recipient: { id: recipientId }, message: messagePayload, access_token: trimmed };

    console.log('Sending quick replies:', JSON.stringify(body));

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));
    console.log('Quick replies sent result:', { url, status: response.status, result });
    
    if (!response.ok) {
      console.error('Error sending quick replies:', result);
    }

    return result;
  }

  return { success: true };
}
