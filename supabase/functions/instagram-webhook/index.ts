import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

  // Log the message
  await supabase.from('instagram_mensagens').insert({
    user_id: config.user_id,
    instagram_user_id: senderId,
    tipo: 'dm_recebida',
    conteudo: message.text || '',
    metadata: event,
  });

  // Check triggers
  const { data: gatilhos } = await supabase
    .from('instagram_gatilhos')
    .select('*')
    .eq('user_id', config.user_id)
    .eq('ativo', true)
    .eq('tipo', 'dm');

  for (const gatilho of gatilhos || []) {
    const messageText = (message.text || '').toLowerCase();
    const triggered = gatilho.palavras_chave.some((kw: string) => 
      messageText.includes(kw.toLowerCase())
    );

    if (triggered && gatilho.resposta_texto) {
      console.log('Trigger matched:', gatilho.nome);
      
      // Send response via Instagram API
      await sendInstagramMessage(
        config.page_access_token,
        senderId,
        gatilho.resposta_texto
      );

      // Log response
      await supabase.from('instagram_mensagens').insert({
        user_id: config.user_id,
        instagram_user_id: senderId,
        tipo: 'dm_enviada',
        conteudo: gatilho.resposta_texto,
        gatilho_id: gatilho.id,
      });

      break; // Only one response per message
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

  // Check comment triggers
  const { data: gatilhos } = await supabase
    .from('instagram_gatilhos')
    .select('*')
    .eq('user_id', config.user_id)
    .eq('ativo', true)
    .eq('tipo', 'comentario');

  for (const gatilho of gatilhos || []) {
    const commentText = (comment.text || '').toLowerCase();
    const triggered = gatilho.palavras_chave.some((kw: string) => 
      commentText.includes(kw.toLowerCase())
    );

    if (triggered && gatilho.resposta_texto && comment.from?.id) {
      console.log('Comment trigger matched:', gatilho.nome);
      
      // Send DM to commenter
      await sendInstagramMessage(
        config.page_access_token,
        comment.from.id,
        gatilho.resposta_texto
      );

      // Log response
      await supabase.from('instagram_mensagens').insert({
        user_id: config.user_id,
        instagram_user_id: comment.from.id,
        instagram_username: comment.from.username,
        tipo: 'dm_enviada',
        conteudo: gatilho.resposta_texto,
        gatilho_id: gatilho.id,
      });

      break;
    }
  }
}

async function sendInstagramMessage(accessToken: string, recipientId: string, text: string) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          access_token: accessToken,
        }),
      }
    );

    const result = await response.json();
    console.log('Message sent result:', result);
    return result;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}
