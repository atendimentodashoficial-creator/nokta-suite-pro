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

    const { number, text, chatDbId } = await req.json();
    
    if (!number || !text) {
      throw new Error('number and text are required');
    }

    console.log('Sending message to:', number);

    // Get user's profile for signature
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    // const agentName = profile?.full_name || 'Volta Redonda';
    // const signature = `*${agentName}*\n\n`;
    // const messageToSend = signature + text;
    const messageToSend = text;

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

    // Send message via UAZapi
    const response = await fetch(`${config.base_url}/send/text`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': config.api_key,
      },
      body: JSON.stringify({
        number,
        text: messageToSend,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('UAZapi send error:', response.status, errorText);

      let friendlyMessage: string | null = null;

      // Try to parse the error message from UAZapi (do NOT throw inside this try/catch)
      try {
        const errorJson = JSON.parse(errorText);
        const apiMsg = String(errorJson?.error || '');
        if (apiMsg.includes('is not on WhatsApp')) {
          friendlyMessage = 'Este número não está registrado no WhatsApp.';
        }
      } catch {
        // ignore JSON parse errors
      }

      if (friendlyMessage) {
        return new Response(
          JSON.stringify({ error: friendlyMessage }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 503 || response.status === 502) {
        throw new Error('Serviço WhatsApp temporariamente indisponível. Tente novamente em alguns segundos.');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error('Erro de autenticação com UAZapi. Verifique suas credenciais.');
      }
      throw new Error(`Erro ao enviar mensagem: ${response.status}`);
    }

    const result = await response.json();
    console.log('Message sent successfully:', result);

    // Normalize provider message id to a stable form (strip optional "owner:" prefix)
    const normalizeProviderMessageId = (raw: unknown): string => {
      const s = String(raw ?? '').trim();
      if (!s) return '';
      const parts = s.split(':').filter(Boolean);
      return (parts.length > 1 ? parts[parts.length - 1] : s).trim();
    };

    const stableMessageId = normalizeProviderMessageId(result.id) || `local_${Date.now()}`;

    // Save message to database + update chat preview if chatDbId is provided
    if (chatDbId) {
      const nowIso = new Date().toISOString();

      const { error: insertError } = await supabase
        .from('whatsapp_messages')
        .insert({
          chat_id: chatDbId,
          message_id: stableMessageId,
          sender_type: 'agent',
          admin_id: user.id,
          content: messageToSend,
          media_type: 'text',
          timestamp: nowIso,
          status: 'sent',
        });

      if (insertError) {
        console.error('Error saving message to database:', insertError);
      }

      // Update chat list preview immediately (so the card updates without waiting for sync/webhook)
      const { error: chatUpdateError } = await supabase
        .from('whatsapp_chats')
        .update({
          last_message: messageToSend,
          last_message_time: nowIso,
          updated_at: nowIso,
        })
        .eq('id', chatDbId);

      if (chatUpdateError) {
        console.error('Error updating chat preview:', chatUpdateError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, messageId: stableMessageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in uazapi-send-message:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
