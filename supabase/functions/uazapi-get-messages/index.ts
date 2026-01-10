import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawAuth = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (!rawAuth || !rawAuth.startsWith('Bearer ')) {
      throw new Error('Missing authorization header');
    }

    const jwt = rawAuth.replace('Bearer ', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { chatid } = await req.json();
    if (!chatid) {
      throw new Error('chatid is required');
    }

    console.log('Fetching messages for chat:', chatid);

    // Get user's UAZapi configuration
    const { data: config, error: configError } = await supabase
      .from('uazapi_config')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      throw new Error('UAZapi não configurado');
    }

    // Verificar se o chat existe no banco antes de buscar mensagens
    // Filtrar apenas chats ATIVOS (deleted_at IS NULL) para evitar conflito com chats deletados
    // Use limit(1) instead of maybeSingle() to avoid errors when duplicates exist
    const { data: existingChats, error: chatCheckError } = await supabase
      .from('whatsapp_chats')
      .select('id, created_at, last_message, last_message_time')
      .eq('user_id', user.id)
      .eq('chat_id', chatid)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (chatCheckError) {
      console.error('Error checking chat:', chatCheckError);
    }

    const existingChat = existingChats?.[0] || null;

    // Se o chat não existe ou foi excluído - retornar vazio
    if (!existingChat) {
      console.log('Active chat not found in database (may have been deleted)');
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NOTE: We no longer filter messages by chat created_at since we want to show old conversations
    // The created_at filter was meant for chats recreated after deletion, but now we import all history

    // Lead creation is now handled ONLY by webhook for new incoming messages
    // Old conversations should NOT create leads when opened
    // Helper function to generate alternative chat IDs (with/without 9th digit)
    const generateAlternateChatIds = (originalChatId: string): string[] => {
      const chatIds = [originalChatId];
      
      // Extract number from chat_id (remove @s.whatsapp.net)
      const numberPart = originalChatId.replace('@s.whatsapp.net', '');
      
      // If it's a Brazilian number (starts with 55)
      if (numberPart.startsWith('55') && numberPart.length >= 12) {
        const countryCode = '55';
        const ddd = numberPart.substring(2, 4);
        const restOfNumber = numberPart.substring(4);
        
        // If number has 9 digits after DDD (has 9th digit), try without it
        if (restOfNumber.length === 9 && restOfNumber.startsWith('9')) {
          const withoutNinthDigit = `${countryCode}${ddd}${restOfNumber.substring(1)}@s.whatsapp.net`;
          chatIds.push(withoutNinthDigit);
        }
        // If number has 8 digits after DDD (no 9th digit), try with it
        else if (restOfNumber.length === 8) {
          const withNinthDigit = `${countryCode}${ddd}9${restOfNumber}@s.whatsapp.net`;
          chatIds.push(withNinthDigit);
        }
      }
      
      return chatIds;
    };

    const chatIdsToTry = generateAlternateChatIds(chatid);
    let messages: any[] = [];
    let successfulChatId = chatid;

    // Try each chat ID until we find messages
    for (const tryId of chatIdsToTry) {
      console.log(`Trying to fetch messages for: ${tryId}`);
      
      const response = await fetch(`${config.base_url}/message/find`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'token': config.api_key,
        },
        body: JSON.stringify({ 
          chatid: tryId,
          limit: 100
        }),
      });

      if (!response.ok) {
        console.error(`UAZapi error for ${tryId}: ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      const foundMessages = data.messages || [];
      console.log(`Found ${foundMessages.length} messages for ${tryId}`);
      
      if (foundMessages.length > 0) {
        messages = foundMessages;
        successfulChatId = tryId;
        break;
      }
    }

    console.log(`Final result: ${messages.length} messages using chat_id: ${successfulChatId}`);

    // Helper to extract the base message ID (after the colon if present)
    // API returns "5521995466754:ABC123" but DB stores just "ABC123"
    const extractBaseMessageId = (fullId: string): string => {
      const colonIndex = fullId.indexOf(':');
      return colonIndex >= 0 ? fullId.substring(colonIndex + 1) : fullId;
    };

    // Process messages from UAZapi
    const processedMessages = messages.map((msg: any) => {
      let mediaType = 'text';
      let mediaUrl: string | null = null;

      // Map message types
      if (msg.messageType === 'ImageMessage') {
        mediaType = 'image';
        mediaUrl = msg.content?.URL || null;
      } else if (msg.messageType === 'VideoMessage') {
        mediaType = 'video';
        mediaUrl = msg.content?.URL || null;
      } else if (msg.messageType === 'AudioMessage') {
        mediaType = 'audio';
        mediaUrl = msg.content?.URL || null;
      } else if (msg.messageType === 'DocumentMessage') {
        mediaType = 'document';
        mediaUrl = msg.content?.URL || null;
      }

      // Check if message was deleted
      const isDeleted = msg.status === 'Deleted';

      // Keep original full ID for frontend, but we'll use base ID for DB lookup
      const fullMessageId = msg.id;
      const baseMessageId = extractBaseMessageId(fullMessageId);

      return {
        message_id: fullMessageId,
        base_message_id: baseMessageId, // Used for DB lookup
        sender_type: msg.fromMe ? 'agent' : 'customer',
        content: isDeleted ? 'Mensagem apagada' : (msg.text || ''),
        media_type: mediaType,
        media_url: mediaUrl,
        timestamp: new Date(msg.messageTimestamp).toISOString(),
        status: msg.fromMe
          ? msg.status === 'Read'
            ? 'read'
            : msg.status === 'Delivered'
              ? 'delivered'
              : 'sent'
          : null,
        deleted: isDeleted,
      };
    });

    // Overlay deletion status and UTM data from database
    // Use base message IDs for lookup since DB stores without owner prefix
    const baseMessageIds = processedMessages.map((m: any) => m.base_message_id);
    let finalMessages: any[] = processedMessages;

    if (baseMessageIds.length > 0) {
      // Fetch ALL fields from database including UTM attribution data
      const { data: dbMessages, error: dbError } = await supabase
        .from('whatsapp_messages')
        .select('message_id, deleted, content, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, ad_thumbnail_url, fb_ad_id, fb_campaign_name, fb_adset_name, fb_ad_name')
        .in('message_id', baseMessageIds)
        .eq('chat_id', existingChat.id);

      if (dbError) {
        console.error('Error loading message data from database:', dbError);
      } else if (dbMessages && dbMessages.length > 0) {
        console.log(`Found ${dbMessages.length} messages in DB with UTM data to merge`);
        const dbMap = new Map<string, any>();
        dbMessages.forEach((m: any) => {
          dbMap.set(m.message_id, m);
        });

        finalMessages = processedMessages.map((msg: any) => {
          const db = dbMap.get(msg.base_message_id);
          // Remove the temporary base_message_id field before returning
          const { base_message_id, ...cleanMsg } = msg;
          
          if (db) {
            return {
              ...cleanMsg,
              // Override deletion status
              deleted: db.deleted || cleanMsg.deleted,
              content: db.deleted ? (db.content || 'Mensagem apagada') : cleanMsg.content,
              // Include UTM attribution data from database
              utm_source: db.utm_source,
              utm_campaign: db.utm_campaign,
              utm_medium: db.utm_medium,
              utm_content: db.utm_content,
              utm_term: db.utm_term,
              fbclid: db.fbclid,
              ad_thumbnail_url: db.ad_thumbnail_url,
              // Include real Facebook campaign names
              fb_ad_id: db.fb_ad_id,
              fb_campaign_name: db.fb_campaign_name,
              fb_adset_name: db.fb_adset_name,
              fb_ad_name: db.fb_ad_name,
            };
          }
          return cleanMsg;
        });
      } else {
        // Remove base_message_id from all messages even if no DB match
        finalMessages = processedMessages.map((msg: any) => {
          const { base_message_id, ...cleanMsg } = msg;
          return cleanMsg;
        });
      }
    }

    // If UAZapi returned no messages, fallback to database messages
    if (finalMessages.length === 0) {
      console.log('No messages from UAZapi, falling back to database messages');
      
      const { data: dbOnlyMessages, error: dbOnlyError } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('chat_id', existingChat.id)
        .order('timestamp', { ascending: true });
      
      if (dbOnlyError) {
        console.error('Error loading database messages:', dbOnlyError);
      } else if (dbOnlyMessages && dbOnlyMessages.length > 0) {
        console.log(`Found ${dbOnlyMessages.length} messages in database`);
        finalMessages = dbOnlyMessages.map((m: any) => ({
          message_id: m.message_id,
          sender_type: m.sender_type,
          content: m.deleted ? 'Mensagem apagada' : m.content,
          media_type: m.media_type || 'text',
          media_url: m.media_url,
          timestamp: m.timestamp,
          status: m.status,
          deleted: m.deleted || false,
          // Include UTM attribution data
          utm_source: m.utm_source,
          utm_campaign: m.utm_campaign,
          utm_medium: m.utm_medium,
          utm_content: m.utm_content,
          utm_term: m.utm_term,
          fbclid: m.fbclid,
          ad_thumbnail_url: m.ad_thumbnail_url,
          // Include real Facebook campaign names
          fb_ad_id: m.fb_ad_id,
          fb_campaign_name: m.fb_campaign_name,
          fb_adset_name: m.fb_adset_name,
          fb_ad_name: m.fb_ad_name,
        }));
      }
    }

    // Final fallback: if still no messages but chat has last_message, create a virtual message
    if (finalMessages.length === 0 && existingChat.last_message && existingChat.last_message_time) {
      console.log('No messages found anywhere, creating virtual message from chat preview');
      finalMessages = [{
        message_id: `virtual-${existingChat.id}`,
        sender_type: 'customer',
        content: existingChat.last_message,
        media_type: 'text',
        media_url: null,
        timestamp: existingChat.last_message_time,
        status: 'received',
        deleted: false,
      }];
    }

    // Sort by timestamp (oldest first)
    finalMessages.sort((a: any, b: any) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    return new Response(
      JSON.stringify({ messages: finalMessages }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in uazapi-get-messages:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
