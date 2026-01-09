import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppWebhookPayload {
  EventType: string;
  type?: string;
  chat?: {
    phone?: string;
    name?: string;
    wa_chatid: string;
    wa_name?: string;
  };
  message?: {
    text?: string;
    content?: string;
    fromMe: boolean;
    messageTimestamp: number;
    sender_pn?: string;
    senderName?: string;
    messageType?: string;
    mediaType?: string;
    type?: string;
    // Click-to-WhatsApp Ad referral data
    referral?: {
      source_url?: string;
      source_type?: string;
      source_id?: string;
      headline?: string;
      body?: string;
      ctwa_clid?: string;
      media_type?: string;
    };
  };
  // Some providers send referral at root level
  referral?: {
    source_url?: string;
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    ctwa_clid?: string;
    media_type?: string;
  };
  event?: {
    Chat?: string;
    MessageIDs?: string[];
    Type?: string;
  };
  owner: string;
}

// Helper to get media placeholder based on message type
function getMediaPlaceholder(message: WhatsAppWebhookPayload['message']): string | null {
  if (!message) return null;
  
  const msgType = (message.messageType || message.type || '').toLowerCase();
  const mediaType = (message.mediaType || '').toLowerCase();
  
  // Check for audio
  if (msgType.includes('audio') || msgType.includes('ptt') || mediaType.includes('audio')) {
    return '🎵 Áudio';
  }
  
  // Check for image
  if (msgType.includes('image') || mediaType.includes('image')) {
    return '📷 Imagem';
  }
  
  // Check for video
  if (msgType.includes('video') || mediaType.includes('video')) {
    return '🎥 Vídeo';
  }
  
  // Check for document
  if (msgType.includes('document') || mediaType.includes('document') || mediaType.includes('application')) {
    return '📄 Documento';
  }
  
  // Check for sticker
  if (msgType.includes('sticker')) {
    return '🏷️ Figurinha';
  }
  
  // Check for location
  if (msgType.includes('location')) {
    return '📍 Localização';
  }
  
  // Check for contact
  if (msgType.includes('contact') || msgType.includes('vcard')) {
    return '👤 Contato';
  }
  
  return null;
}

// Function to normalize phone numbers for comparison
function normalizePhone(phone: string): string {
  if (!phone) return '';
  
  // Remove all non-numeric characters
  let normalized = phone.replace(/\D/g, '');
  
  // Remove country code (55) if present at the start
  if (normalized.startsWith('55') && normalized.length >= 12) {
    normalized = normalized.substring(2);
  }
  
  // Now we should have: DDD + number (prefer 11 digits: DDD + 9 digits)
  if (normalized.length >= 11) {
    // Keep only the last 11 digits (drop country code and any prefix)
    normalized = normalized.slice(-11);
  }
  
  // If we have only 10 digits (DDD + 8 digits), add 9 after DDD
  if (normalized.length === 10) {
    // Format: DDD + 8 digits -> DDD + 9 + 8 digits
    normalized = normalized.slice(0, 2) + '9' + normalized.slice(2);
  }
  
  // Final format: DDD + 9 digits (11 digits total)
  return normalized;
}

// Get last 8 digits of a phone number for matching
function getLast8Digits(phone: string): string {
  if (!phone) return '';
  const normalized = phone.replace(/\D/g, '');
  return normalized.slice(-8);
}

// Function to check if two phone numbers match (by last 8 digits)
function phonesMatch(phone1: string, phone2: string): boolean {
  const last8_1 = getLast8Digits(phone1);
  const last8_2 = getLast8Digits(phone2);
  
  if (!last8_1 || !last8_2 || last8_1.length < 8 || last8_2.length < 8) return false;
  
  return last8_1 === last8_2;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Helper function to log events
  const logEvent = async (userId: string, level: string, message: string, payload?: any) => {
    try {
      await supabase.from('webhook_logs').insert({
        user_id: userId,
        event_type: 'webhook',
        level,
        event_message: message,
        payload: payload || null
      });
    } catch (error) {
      console.error('Failed to log event:', error);
    }
  };

  try {
    console.log('Webhook received:', req.method);

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user_id from query parameters
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    const instanciaId = url.searchParams.get('instancia_id'); // Optional: for Disparos instance-specific updates

    if (!userId) {
      console.error('Missing user_id parameter');
      await logEvent('00000000-0000-0000-0000-000000000000', 'error', 'Missing user_id parameter');
      return new Response(
        JSON.stringify({ error: 'Missing user_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await logEvent(userId, 'info', `Webhook recebido via POST${instanciaId ? ` (instancia: ${instanciaId})` : ''}`);
    console.log('Processing webhook for user:', userId, instanciaId ? `instancia: ${instanciaId}` : '');

    // Update last_webhook_at for the instance if instancia_id is provided
    if (instanciaId) {
      const { error: updateError } = await supabase
        .from('disparos_instancias')
        .update({ last_webhook_at: new Date().toISOString() })
        .eq('id', instanciaId)
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('Error updating last_webhook_at:', updateError);
      } else {
        console.log('Updated last_webhook_at for instance:', instanciaId);
      }
    }

    // Parse webhook payload
    const payload: WhatsAppWebhookPayload = await req.json();
    console.log('Payload received:', JSON.stringify(payload, null, 2));

    // Check if this is a deleted message event
    if (payload.type === 'DeletedMessage' && payload.event?.Type === 'Deleted') {
      console.log('Processing deleted message event');
      const messageIds = payload.event.MessageIDs || [];
      
      if (messageIds.length > 0) {
        // Update all messages with these IDs to mark as deleted
        const { error: deleteError } = await supabase
          .from('whatsapp_messages')
          .update({ deleted: true, content: 'Mensagem apagada' })
          .in('message_id', messageIds);

        if (deleteError) {
          console.error('Error marking messages as deleted:', deleteError);
          await logEvent(userId, 'error', `Erro ao marcar mensagens como deletadas: ${deleteError.message}`);
        } else {
          console.log(`Marked ${messageIds.length} message(s) as deleted`);
          await logEvent(userId, 'info', `${messageIds.length} mensagem(s) marcada(s) como deletada(s)`);
        }
      }

      return new Response(
        JSON.stringify({ message: 'Deleted message processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate payload for new message events
    if (!payload.chat || !payload.message) {
      console.error('Invalid payload structure');
      await logEvent(userId, 'error', 'Estrutura de payload inválida', payload);
      return new Response(
        JSON.stringify({ error: 'Invalid payload structure' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ignore messages sent by the user (fromMe = true)
    if (payload.message.fromMe) {
      console.log('Ignoring message sent by user');
      await logEvent(userId, 'info', 'Mensagem ignorada (enviada pelo usuário)');
      return new Response(
        JSON.stringify({ message: 'Message from user ignored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract data from payload
    const phone = payload.chat.phone?.trim() || 
                  payload.message?.sender_pn?.replace('@s.whatsapp.net', '') ||
                  payload.chat.wa_chatid?.replace('@s.whatsapp.net', '') ||
                  '';
    
    const name = payload.chat.wa_name?.trim() || 
                 payload.chat.name?.trim() || 
                 payload.message?.senderName?.trim() ||
                 'Contato WhatsApp';
    
    // Get text content or media placeholder
    const textFromPayload = typeof payload.message.text === 'string' ? payload.message.text : '';
    const contentFromPayload = typeof payload.message.content === 'string' ? payload.message.content : '';
    const rawText = (textFromPayload || contentFromPayload).trim();
    const mediaPlaceholder = getMediaPlaceholder(payload.message);
    const messageText = rawText || mediaPlaceholder || '';

    if (!phone) {
      console.error('Missing phone number in payload');
      await logEvent(userId, 'error', 'Número de telefone não encontrado no payload', payload);
      return new Response(
        JSON.stringify({ error: 'Missing phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Contact info - Phone:', phone, 'Name:', name);
    const normalizedIncoming = normalizePhone(phone);
    console.log('Normalized incoming phone:', normalizedIncoming);
    await logEvent(userId, 'info', `Contato identificado - Telefone: ${phone} (normalizado: ${normalizedIncoming}), Nome: ${name}`);

    // === Deduplicate webhook events to prevent double-counting unread messages ===
    const messageTimestamp = payload.message.messageTimestamp;
    const messageHash = `${messageText?.substring(0, 50) || 'empty'}`;
    const last8Incoming = getLast8Digits(phone);
    
    // Try to insert a dedup record - if it already exists, skip incrementing unread
    let isDuplicate = false;
    if (last8Incoming && messageTimestamp) {
      const { error: dedupError } = await supabase
        .from('webhook_message_dedup')
        .insert({
          user_id: userId,
          instancia_id: instanciaId || null,
          phone_last8: last8Incoming,
          message_timestamp: messageTimestamp,
          message_hash: messageHash,
        });
      
      if (dedupError) {
        // Unique constraint violation = duplicate message
        if (dedupError.code === '23505') {
          console.log('Duplicate webhook event detected, skipping unread increment');
          isDuplicate = true;
        } else {
          console.error('Error inserting dedup record:', dedupError);
        }
      }
    }

    // Increment unread_count for the chat (both WhatsApp and Disparos tables)
    // Only if this is NOT a duplicate event
    if (last8Incoming && !isDuplicate) {
      try {
        // ===== WhatsApp chats =====
        // Check if this instancia_id is the user's WhatsApp main instance
        // (referenced in uazapi_config.whatsapp_instancia_id)
        // If so, update whatsapp_chats. Otherwise, update only disparos_chats.

        let shouldUpdateWhatsApp = !instanciaId; // Default: no instancia_id = WhatsApp
        let shouldUpdateDisparos = !!instanciaId;

        if (instanciaId) {
          // Check if this instancia_id matches the WhatsApp main instance
          const { data: uazapiConfig } = await supabase
            .from('uazapi_config')
            .select('whatsapp_instancia_id')
            .eq('user_id', userId)
            .eq('is_active', true)
            .maybeSingle();

          if (uazapiConfig?.whatsapp_instancia_id === instanciaId) {
            // This is the WhatsApp main instance -> update whatsapp_chats, NOT disparos_chats
            shouldUpdateWhatsApp = true;
            shouldUpdateDisparos = false;
            console.log('Instance is WhatsApp main instance, updating whatsapp_chats only');
          }
        }

        if (shouldUpdateWhatsApp) {
          const { data: existingChats } = await supabase
            .from('whatsapp_chats')
            .select('id, contact_number, normalized_number, chat_id, unread_count')
            .eq('user_id', userId)
            .is('deleted_at', null);

          const matchingChat = existingChats?.find(c =>
            getLast8Digits(c.contact_number) === last8Incoming ||
            getLast8Digits(c.normalized_number) === last8Incoming ||
            getLast8Digits(c.chat_id) === last8Incoming
          );

          if (matchingChat) {
            // Use atomic RPC to avoid race conditions when multiple messages arrive quickly
            const { data: newUnread, error: rpcError } = await supabase.rpc(
              'increment_whatsapp_chat_unread',
              {
                p_chat_id: matchingChat.id,
                p_last_message: messageText || 'Nova mensagem',
                // Provider timestamp may be in ms or s – normalize
                p_last_message_time: new Date(
                  messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
                ).toISOString(),
              },
            );

            if (rpcError) {
              console.error('Error incrementing WhatsApp unread count via RPC:', rpcError);
            } else {
              console.log('Incremented WhatsApp unread_count to', newUnread, 'for chat', matchingChat.id);
            }
          } else {
            // Chat doesn't exist yet - create it automatically so the UI can show it immediately
            const chatId = payload.chat.wa_chatid || `${normalizedIncoming}@s.whatsapp.net`;
            const msgTime = new Date(
              messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
            ).toISOString();

            const { data: newChat, error: createError } = await supabase
              .from('whatsapp_chats')
              .insert({
                user_id: userId,
                chat_id: chatId,
                contact_number: phone,
                contact_name: name,
                normalized_number: normalizedIncoming,
                last_message: messageText || 'Nova mensagem',
                last_message_time: msgTime,
                unread_count: 1,
                provider_unread_baseline: 0,
                provider_unread_count: 1,
              })
              .select('id')
              .single();

            if (createError) {
              if (createError.code !== '23505') {
                console.error('Error creating WhatsApp chat:', createError);
              }
            } else {
              console.log('Created new WhatsApp chat:', newChat.id, 'for', name);
            }
          }
        }

        // ===== Disparos chats =====
        // Only update Disparos chats when instancia_id truly belongs to a Disparos instance.
        if (shouldUpdateDisparos) {
          // If instancia_id is provided, only update the chat for that specific instance
          // This prevents updating all chats when the same contact exists in multiple instances
          let disparosQuery = supabase
            .from('disparos_chats')
            .select('id, contact_number, normalized_number, chat_id, unread_count, instancia_id')
            .eq('user_id', userId)
            .is('deleted_at', null);

          if (instanciaId) {
            disparosQuery = disparosQuery.eq('instancia_id', instanciaId);
          }

          const { data: existingDisparosChats } = await disparosQuery;

          const matchingDisparosChat = existingDisparosChats?.find(c =>
            getLast8Digits(c.contact_number) === last8Incoming ||
            getLast8Digits(c.normalized_number) === last8Incoming ||
            getLast8Digits(c.chat_id) === last8Incoming
          );

          if (matchingDisparosChat) {
            // Use atomic RPC to avoid race conditions when multiple messages arrive quickly
            const { data: newUnread, error: rpcError } = await supabase.rpc(
              'increment_disparos_chat_unread',
              {
                p_chat_id: matchingDisparosChat.id,
                p_last_message: messageText || 'Nova mensagem',
                // Provider timestamp may be in ms or s – normalize
                p_last_message_time: new Date(
                  messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
                ).toISOString(),
              },
            );

            if (rpcError) {
              console.error('Error incrementing Disparos unread count via RPC:', rpcError);
            } else {
              console.log(
                'Incremented Disparos unread_count to',
                newUnread,
                'for chat',
                matchingDisparosChat.id,
                instanciaId ? `(instancia: ${instanciaId})` : ''
              );
            }
          } else if (instanciaId) {
            // Chat doesn't exist for this instance - create it automatically
            // Get instance info for the chat
            const { data: instanciaInfo } = await supabase
              .from('disparos_instancias')
              .select('nome')
              .eq('id', instanciaId)
              .maybeSingle();

            const chatId = payload.chat.wa_chatid || `${normalizedIncoming}@s.whatsapp.net`;
            const msgTime = new Date(
              messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
            ).toISOString();

            const { data: newChat, error: createError } = await supabase
              .from('disparos_chats')
              .insert({
                user_id: userId,
                chat_id: chatId,
                contact_number: phone,
                contact_name: name,
                normalized_number: normalizedIncoming,
                last_message: messageText || 'Nova mensagem',
                last_message_time: msgTime,
                unread_count: 1,
                instancia_id: instanciaId,
                instancia_nome: instanciaInfo?.nome || 'Instância',
              })
              .select('id')
              .single();

            if (createError) {
              // Might be a duplicate - ignore
              if (createError.code !== '23505') {
                console.error('Error creating Disparos chat:', createError);
              }
            } else {
              console.log('Created new Disparos chat:', newChat.id, 'for', name, `(instancia: ${instanciaId})`);
            }
          }
        }
      } catch (unreadError) {
        console.error('Error updating unread count:', unreadError);
        // Don't fail the webhook for this
      }
    }

    // Check user creation date to avoid importing old conversations
    // If profile is missing (shouldn't happen, but can), don't fail the webhook.
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('created_at')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      await logEvent(userId, 'error', `Erro ao buscar perfil do usuário: ${profileError.message}`);
      // Continue without blocking unread/preview updates
    }

    // Get message timestamp (Unix timestamp in seconds) - reusing the one captured earlier
    const messageDate = new Date(messageTimestamp * 1000);
    const userCreatedDate = userProfile?.created_at ? new Date(userProfile.created_at) : new Date(0);

    console.log('Message date:', messageDate.toISOString());
    console.log('User created date:', userCreatedDate.toISOString());

    // If message is older than user creation date, ignore it
    if (messageDate < userCreatedDate) {
      console.log('Message is older than user creation date, ignoring');
      await logEvent(userId, 'info', `Mensagem anterior à criação do usuário ignorada: ${name} (${phone})`);
      return new Response(
        JSON.stringify({ 
          message: 'Message predates user creation, ignoring',
          message_date: messageDate.toISOString(),
          user_created: userCreatedDate.toISOString()
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Lead creation for WhatsApp (same logic as Disparos) ===
    // Garantir que exista (ou seja RESTAURADO) um lead para o telefone (match por últimos 8 dígitos)
    const { data: allLeads, error: searchError } = await supabase
      .from('leads')
      .select('id, status, telefone, nome, deleted_at, origem')
      .eq('user_id', userId);

    if (searchError) {
      console.error('Error searching for existing leads:', searchError);
      await logEvent(userId, 'error', `Erro ao buscar leads existentes: ${searchError.message}`);
      return new Response(
        JSON.stringify({ error: 'Database error', details: searchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const matchingLead = allLeads?.find((lead) => phonesMatch(lead.telefone, phone));

    // Se já é cliente, não mexe
    if (matchingLead && !matchingLead.deleted_at && matchingLead.status === 'cliente') {
      console.log('Contact is already a client, ignoring');
      await logEvent(userId, 'info', `Contato já é cliente: ${name} (${phone})`);
      return new Response(
        JSON.stringify({ message: 'Contact is already a client', lead_id: matchingLead.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().split('T')[0];

    // Se existe e está deletado -> restaurar
    if (matchingLead && matchingLead.deleted_at) {
      const updateData: any = {
        deleted_at: null,
        status: 'lead',
        origem: 'WhatsApp',
        origem_lead: true,
        data_contato: today,
        updated_at: new Date().toISOString(),
      };

      // Atualiza nome se estiver vazio/legado
      if ((!matchingLead.nome || matchingLead.nome === 'Contato WhatsApp') && name) {
        updateData.nome = name;
      }

      const { error: restoreError } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', matchingLead.id);

      if (restoreError) {
        console.error('Error restoring lead:', restoreError);
        await logEvent(userId, 'error', `Erro ao restaurar lead: ${restoreError.message}`);
        return new Response(
          JSON.stringify({ error: 'Failed to restore lead', details: restoreError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Lead restored successfully from webhook:', matchingLead.id);
      await logEvent(userId, 'info', `Lead restaurado com sucesso: ${name} (ID: ${matchingLead.id})`);

      return new Response(
        JSON.stringify({ message: 'Lead restored successfully', lead_id: matchingLead.id, action: 'restored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se existe e está ativo -> atualizar data_contato (e reativar se sem_interesse)
    if (matchingLead && !matchingLead.deleted_at) {
      const updateData: any = {
        data_contato: today,
        updated_at: new Date().toISOString(),
      };

      if (matchingLead.status === 'sem_interesse') {
        updateData.status = 'lead';
      }

      const { error: updateError } = await supabase
        .from('leads')
        .update(updateData)
        .eq('id', matchingLead.id);

      if (updateError) {
        console.error('Error updating lead:', updateError);
        await logEvent(userId, 'error', `Erro ao atualizar lead: ${updateError.message}`);
        return new Response(
          JSON.stringify({ error: 'Failed to update lead', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logEvent(userId, 'info', `Lead atualizado: ${name} (${phone})`);
      return new Response(
        JSON.stringify({ message: 'Lead updated successfully', lead_id: matchingLead.id, action: 'updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Não existe -> criar
    console.log('No matching lead found, creating new lead...');
    await logEvent(userId, 'info', `Criando novo lead para ${name} (${phone})`);

    // Extract referral data from Click-to-WhatsApp ads
    const referral = payload.message?.referral || payload.referral;
    const utmData: Record<string, string | null> = {
      utm_source: null,
      utm_campaign: null,
      utm_medium: null,
      utm_content: null,
      fbclid: null,
    };

    if (referral) {
      console.log('Click-to-WhatsApp referral data detected:', JSON.stringify(referral));
      await logEvent(userId, 'info', `Dados de anúncio CTWA detectados: ${JSON.stringify(referral)}`);
      
      // Map referral data to UTM-like fields
      utmData.utm_source = 'facebook';
      utmData.utm_medium = 'cpc';
      utmData.utm_campaign = referral.headline || referral.source_id || null;
      utmData.utm_content = referral.source_id || null;
      utmData.fbclid = referral.ctwa_clid || null;
    }

    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        nome: name,
        telefone: normalizedIncoming,
        procedimento_nome: 'Contato via WhatsApp',
        origem: 'WhatsApp',
        observacoes: messageText ? `Primeira mensagem: ${messageText}` : 'Contato recebido via WhatsApp',
        status: 'lead',
        origem_lead: true,
        data_contato: today,
        // UTM data from Click-to-WhatsApp ads
        utm_source: utmData.utm_source,
        utm_campaign: utmData.utm_campaign,
        utm_medium: utmData.utm_medium,
        utm_content: utmData.utm_content,
        fbclid: utmData.fbclid,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating lead:', insertError);
      await logEvent(userId, 'error', `Erro ao criar lead: ${insertError.message}`, { name, phone, normalizedIncoming });
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Lead created successfully from webhook:', newLead.id);
    await logEvent(userId, 'info', `Lead criado com sucesso: ${name} (ID: ${newLead.id})`);

    return new Response(
      JSON.stringify({ message: 'Lead created successfully', lead_id: newLead.id, lead_name: newLead.nome, action: 'created' }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    if (userId) {
      await logEvent(userId, 'error', `Erro interno: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
