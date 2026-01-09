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
    const { data: existingChat, error: chatCheckError } = await supabase
      .from('whatsapp_chats')
      .select('id, created_at')
      .eq('user_id', user.id)
      .eq('chat_id', chatid)
      .is('deleted_at', null)
      .maybeSingle();

    if (chatCheckError) {
      console.error('Error checking chat:', chatCheckError);
    }

    // Se o chat não existe ou foi excluído - retornar vazio
    if (!existingChat) {
      console.log('Active chat not found in database (may have been deleted)');
      return new Response(
        JSON.stringify({ messages: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Usar created_at do chat para filtrar mensagens anteriores (lógica igual a Disparos)
    const chatCreatedAt = existingChat.created_at ? new Date(existingChat.created_at) : null;
    console.log(`Chat created_at: ${chatCreatedAt?.toISOString() || 'N/A'} - messages before this will be filtered`);


    // Garantir que exista um Lead para este chat (se não estiver nas abas Leads ou Clientes)
    try {
      const { data: chatRow } = await supabase
        .from('whatsapp_chats')
        .select('*')
        .eq('user_id', user.id)
        .eq('chat_id', chatid)
        .maybeSingle();

      if (chatRow) {
        const normalize = (p: string) => (p ? p.replace(/[^\d]/g, '') : '');
        const phoneNorm = chatRow.normalized_number || normalize(chatRow.contact_number);

        // Buscar telefones existentes deste usuário
        const { data: existingLeads } = await supabase
          .from('leads')
          .select('id, telefone')
          .eq('user_id', user.id);

        const exists = (existingLeads ?? []).some((l: any) => normalize(l.telefone) === phoneNorm);

        if (!exists && phoneNorm) {
          const { error: insertLeadError } = await supabase.from('leads').insert({
            user_id: user.id,
            nome: chatRow.contact_name || 'Contato WhatsApp',
            telefone: phoneNorm,
            procedimento_nome: 'Contato via WhatsApp',
            origem: 'WhatsApp',
            status: 'lead',
            origem_lead: true,
            data_contato: new Date().toISOString().split('T')[0],
            observacoes: chatRow.last_message ? `Primeira mensagem: ${chatRow.last_message}` : null,
          });
          if (insertLeadError) {
            console.error('Error inserting lead from messages:', insertLeadError);
          }
        }
      }
    } catch (e) {
      console.error('Lead ensure step failed:', e);
    }
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

      return {
        message_id: msg.id,
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

    // Overlay deletion status from database (webhook can mark messages as deleted)
    const messageIds = processedMessages.map((m: any) => m.message_id);
    let finalMessages = processedMessages;

    if (messageIds.length > 0) {
      const { data: dbMessages, error: dbError } = await supabase
        .from('whatsapp_messages')
        .select('message_id, deleted, content')
        .in('message_id', messageIds)
        .eq('chat_id', existingChat.id);

      if (dbError) {
        console.error('Error loading message deletion status:', dbError);
      } else if (dbMessages && dbMessages.length > 0) {
        const dbMap = new Map<string, { deleted: boolean | null; content: string | null }>();
        dbMessages.forEach((m: any) => {
          dbMap.set(m.message_id, { deleted: m.deleted, content: m.content });
        });

        finalMessages = processedMessages.map((msg: any) => {
          const db = dbMap.get(msg.message_id);
          if (db?.deleted) {
            return {
              ...msg,
              deleted: true,
              content: db.content || 'Mensagem apagada',
            };
          }
          return msg;
        });
      }
    }

    // Filtrar mensagens anteriores ao created_at do chat (histórico após exclusão)
    if (chatCreatedAt) {
      const beforeFilter = finalMessages.length;
      finalMessages = finalMessages.filter((msg: any) => {
        const msgTime = new Date(msg.timestamp);
        return msgTime >= chatCreatedAt;
      });
      const afterFilter = finalMessages.length;
      if (beforeFilter !== afterFilter) {
        console.log(`Filtered out ${beforeFilter - afterFilter} messages older than chat created_at`);
      }
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
