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

// Helper function to extract UTM data from message payload EARLY (before saving messages)
interface ExtractedUtmData {
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  ad_thumbnail_url: string | null;
  fb_ad_id: string | null;
}

function base64ToUtf8(input: string): string | null {
  try {
    const normalized = input.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '==='.slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function extractCtwaIdsFromDecodedText(decodedText: string): { adId: string | null; fbclid: string | null } {
  const adIdMatch = decodedText.match(/(?:ad[_-]?id|source[_-]?id)["'=:\\s]*([0-9]{10,})/i);
  const fbclidMatch = decodedText.match(/fbclid["'=:\\s]*([A-Za-z0-9._-]{10,})/i);

  let adId = adIdMatch?.[1] ?? null;
  const fbclid = fbclidMatch?.[1] ?? null;

  // If we didn't find a tagged key, fall back to the first long numeric token.
  if (!adId) {
    const longNumbers = decodedText.match(/[0-9]{10,}/g);
    adId = longNumbers?.[0] ?? null;
  }

  return { adId, fbclid };
}

function extractCtwaIdsFromContextInfo(contextInfo: any): { adId: string | null; fbclid: string | null } {
  const payload = contextInfo?.ctwaPayload || contextInfo?.conversionData;
  if (!payload || typeof payload !== 'string') return { adId: null, fbclid: null };

  const decoded = base64ToUtf8(payload);
  if (!decoded) return { adId: null, fbclid: null };

  return extractCtwaIdsFromDecodedText(decoded);
}

function extractUtmDataFromMessage(message: any, payload: any): ExtractedUtmData {
  const utmData: ExtractedUtmData = {
    utm_source: null,
    utm_campaign: null,
    utm_medium: null,
    utm_content: null,
    utm_term: null,
    fbclid: null,
    ad_thumbnail_url: null,
    fb_ad_id: null,
  };

  if (!message) return utmData;

  // Check for standard referral format (message.referral or payload.referral)
  const referral = message?.referral || payload?.referral;

  // Check for UAZAPI format: message.content.contextInfo.externalAdReply
  const contextInfo = message?.content?.contextInfo;
  const externalAdReply = contextInfo?.externalAdReply;
  const conversionSource = contextInfo?.conversionSource;

  // Handle standard referral format
  if (referral) {
    console.log('UTM extraction: standard referral format detected:', JSON.stringify(referral));
    utmData.utm_source = 'facebook';
    utmData.utm_medium = 'cpc';
    utmData.utm_campaign = referral.headline || null;
    utmData.utm_content = referral.source_id || null;
    utmData.utm_term = referral.body || null;
    utmData.fbclid = referral.ctwa_clid || null;
    utmData.ad_thumbnail_url = referral.thumbnail_url || referral.thumbnailURL || null;
    utmData.fb_ad_id = referral.source_id || null;
  }
  // Handle UAZAPI format: externalAdReply in contextInfo
  else if (externalAdReply && conversionSource === 'FB_Ads') {
    console.log('UTM extraction: UAZAPI format detected:', JSON.stringify(externalAdReply));
    utmData.utm_source = 'facebook';
    utmData.utm_medium = 'cpc';
    utmData.utm_campaign = externalAdReply.title || null;
    // UAZAPI sends sourceID (uppercase D) - check both variants
    utmData.utm_content = externalAdReply.sourceID || externalAdReply.sourceId || externalAdReply.source_id || null;
    utmData.utm_term = externalAdReply.body || null;
    utmData.fbclid = externalAdReply.ctwa_clid || null;
    utmData.ad_thumbnail_url = externalAdReply.thumbnailURL || externalAdReply.thumbnail_url || null;
    utmData.fb_ad_id = externalAdReply.sourceID || externalAdReply.sourceId || externalAdReply.source_id || null;

    // Some UAZAPI payloads omit sourceId but include ctwaPayload/conversionData.
    if (!utmData.fb_ad_id || !utmData.utm_content || !utmData.fbclid) {
      const { adId, fbclid } = extractCtwaIdsFromContextInfo(contextInfo);
      utmData.utm_content = utmData.utm_content || adId;
      utmData.fb_ad_id = utmData.fb_ad_id || adId;
      utmData.fbclid = utmData.fbclid || fbclid;
    }
  }

  return utmData;
}

// Helper function to fetch campaign name from Facebook Ads API
async function fetchFacebookCampaignInfo(
  supabase: any,
  userId: string,
  adId: string
): Promise<{ campaign_id: string | null; campaign_name: string | null; adset_id: string | null; adset_name: string | null; ad_name: string | null }> {
  try {
    if (!adId) {
      return { campaign_id: null, campaign_name: null, adset_id: null, adset_name: null, ad_name: null };
    }

    // Get user's Facebook access token
    const { data: fbConfig, error: configError } = await supabase
      .from('facebook_config')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (configError || !fbConfig?.access_token) {
      console.log('No Facebook config found for user, skipping campaign name fetch');
      return { campaign_id: null, campaign_name: null, adset_id: null, adset_name: null, ad_name: null };
    }

    const accessToken = fbConfig.access_token;

    // Fetch ad info including campaign id/name and adset id/name
    const adUrl = `https://graph.facebook.com/v22.0/${adId}?fields=name,campaign{id,name},adset{id,name}&access_token=${accessToken}`;
    console.log('Fetching Facebook ad info for:', adId);

    const response = await fetch(adUrl);
    const data = await response.json();

    if (data.error) {
      console.error('Facebook API error fetching ad info:', data.error);
      return { campaign_id: null, campaign_name: null, adset_id: null, adset_name: null, ad_name: null };
    }

    const result = {
      campaign_id: data.campaign?.id || null,
      campaign_name: data.campaign?.name || null,
      adset_id: data.adset?.id || null,
      adset_name: data.adset?.name || null,
      ad_name: data.name || null,
    };

    console.log('Facebook campaign info fetched:', result);
    return result;
  } catch (error) {
    console.error('Error fetching Facebook campaign info:', error);
    return { campaign_id: null, campaign_name: null, adset_id: null, adset_name: null, ad_name: null };
  }
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

    // Identify user/instance from URL.
    // UAZAPI may append extra path segments when addUrlEvents/addUrlTypesMessages are enabled.
    const url = new URL(req.url);

    const pathParts = url.pathname.split('/').filter(Boolean);
    const fnIdx = pathParts.findIndex((p) => p === 'whatsapp-webhook');
    const userIdFromPath = fnIdx >= 0 ? pathParts[fnIdx + 1] : null;
    const instanciaIdFromPath = fnIdx >= 0 ? pathParts[fnIdx + 2] : null;

    const userId = url.searchParams.get('user_id') || userIdFromPath;
    // Sometimes providers incorrectly append "/..." onto query param values; sanitize.
    const rawInstanciaId = url.searchParams.get('instancia_id') || instanciaIdFromPath;
    const rawInstanciaKey = rawInstanciaId ? rawInstanciaId.split('/')[0] : null;

    if (!userId) {
      console.error('Missing user_id parameter');
      await logEvent('00000000-0000-0000-0000-000000000000', 'error', 'Missing user_id parameter');
      return new Response(
        JSON.stringify({ error: 'Missing user_id parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Resolve instance info (some providers send UUID, others send instance_name).
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const hasInstanceParam = Boolean(rawInstanciaKey);

    const { data: uazapiConfig } = await supabase
      .from('uazapi_config')
      .select('whatsapp_instancia_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    let instanciaId: string | null = null;
    let instanciaNomeFromDb: string | null = null;

    if (rawInstanciaKey) {
      // Try matching by id, instance_name or friendly nome (best-effort).
      const { data: instanciaRow } = await supabase
        .from('disparos_instancias')
        .select('id, nome, instance_name')
        .eq('user_id', userId)
        .or(`id.eq.${rawInstanciaKey},instance_name.eq.${rawInstanciaKey},nome.eq.${rawInstanciaKey}`)
        .limit(1)
        .maybeSingle();

      if (instanciaRow?.id) {
        instanciaId = instanciaRow.id;
        instanciaNomeFromDb = instanciaRow.nome || null;
      } else {
        // Instance not found in DB - REJECT the webhook to prevent phantom instances
        console.error('REJECTING webhook: Instance not found in DB:', rawInstanciaKey);
        await logEvent(userId, 'warn', `Webhook rejeitado: instância não registrada "${rawInstanciaKey}"`);
        return new Response(
          JSON.stringify({ error: 'Instance not registered. Please add this instance via WhatsApp or Disparos tab first.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    let isMainWhatsAppInstance = Boolean(
      uazapiConfig?.whatsapp_instancia_id && instanciaId && uazapiConfig.whatsapp_instancia_id === instanciaId
    );
    
    console.log('Main instance check:', {
      configuredMainId: uazapiConfig?.whatsapp_instancia_id,
      resolvedInstanciaId: instanciaId,
      isMainWhatsAppInstance,
      rawInstanciaKey,
    });

    await logEvent(
      userId,
      'info',
      `Webhook recebido via POST${hasInstanceParam ? ` (instancia: ${rawInstanciaKey})` : ''}`,
    );
    console.log(
      'Processing webhook for user:',
      userId,
      hasInstanceParam ? `instancia: ${rawInstanciaKey}` : ''
    );

    // Update last_webhook_at for the resolved instance (if we have a UUID id).
    if (instanciaId && uuidRegex.test(instanciaId)) {
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

    // === UAZAPI sends instanceName inside payload; re-resolve instance if needed ===
    const anyPayload: any = payload as any;
    const payloadInstanceName = anyPayload?.instanceName || null;

    // If we haven't resolved the instance from URL param, try using the payload's instanceName
    if (!instanciaId && payloadInstanceName) {
      console.log('Attempting to resolve instance from payload instanceName:', payloadInstanceName);
      const { data: instanciaFromPayload } = await supabase
        .from('disparos_instancias')
        .select('id, nome, instance_name')
        .eq('user_id', userId)
        .or(`instance_name.eq.${payloadInstanceName},nome.eq.${payloadInstanceName}`)
        .limit(1)
        .maybeSingle();

      if (instanciaFromPayload?.id) {
        instanciaId = instanciaFromPayload.id;
        instanciaNomeFromDb = instanciaFromPayload.nome || payloadInstanceName;
        console.log('Resolved instance from payload:', instanciaId, instanciaNomeFromDb);

        // Re-check if this is the main WhatsApp instance
        const isMain = uazapiConfig?.whatsapp_instancia_id === instanciaId;
        // Update the main flag directly (not using globalThis)
        isMainWhatsAppInstance = isMain;
        console.log('Updated isMainWhatsAppInstance from payload resolution:', isMain);
      } else {
        // Even if not resolved, we know there IS an instance (from payload)
        // Check if the payload instanceName matches the main instance's instance_name
        if (uazapiConfig?.whatsapp_instancia_id) {
          const { data: mainInstancia } = await supabase
            .from('disparos_instancias')
            .select('instance_name, nome')
            .eq('id', uazapiConfig.whatsapp_instancia_id)
            .maybeSingle();
          
          if (mainInstancia && (mainInstancia.instance_name === payloadInstanceName || mainInstancia.nome === payloadInstanceName)) {
            instanciaId = uazapiConfig.whatsapp_instancia_id;
            instanciaNomeFromDb = mainInstancia.nome || payloadInstanceName;
            isMainWhatsAppInstance = true;
            console.log('Matched payload instanceName to main WhatsApp instance:', instanciaId);
          } else {
            // Instance from payload not found in DB - REJECT the webhook
            console.error('REJECTING webhook: Instance from payload not found in DB:', payloadInstanceName);
            await logEvent(userId, 'warn', `Webhook rejeitado: instância não registrada "${payloadInstanceName}"`);
            return new Response(
              JSON.stringify({ error: 'Instance not registered. Please add this instance via WhatsApp or Disparos tab first.' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } else {
          // No main instance configured and instance from payload not found - REJECT
          console.error('REJECTING webhook: No main instance configured and instance not found:', payloadInstanceName);
          await logEvent(userId, 'warn', `Webhook rejeitado: instância não registrada "${payloadInstanceName}" e nenhuma instância principal configurada`);
          return new Response(
            JSON.stringify({ error: 'Instance not registered. Please add this instance via WhatsApp or Disparos tab first.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Determine if we should update WhatsApp or Disparos tables
    // If there's no instance param => WhatsApp (legacy behavior)
    // If there IS an instance param => it's WhatsApp if it's the main instance, otherwise Disparos
    const effectiveHasInstanceParam = hasInstanceParam || Boolean(payloadInstanceName);
    
    console.log('Final instance resolution:', {
      effectiveHasInstanceParam,
      isMainWhatsAppInstance,
      instanciaId,
      instanciaNomeFromDb,
    });

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

    // Normalize payload differences between providers.
    // UAZAPI (observed) may send: { EventType: 'messages', message: { chatid, content, text, sender, sender_pn, ... } }
    // Re-use anyPayload defined above
    const hasMessage = Boolean(anyPayload?.message);
    const hasChat = Boolean(anyPayload?.chat) || Boolean(anyPayload?.message?.chatid) || Boolean(anyPayload?.message?.chatId);

    if (!hasMessage || !hasChat) {
      console.error('Invalid payload structure');
      await logEvent(userId, 'error', 'Estrutura de payload inválida', payload);
      return new Response(
        JSON.stringify({ error: 'Invalid payload structure' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Ensure we have a chat object
    if (!anyPayload.chat) {
      anyPayload.chat = {
        wa_chatid: anyPayload?.message?.chatid || anyPayload?.message?.chatId,
        wa_name: anyPayload?.message?.senderName,
      };
    }

    // Ensure messageTimestamp field exists
    if (anyPayload?.message?.messageTimestamp == null && anyPayload?.message?.timestamp != null) {
      anyPayload.message.messageTimestamp = anyPayload.message.timestamp;
    }

    // Use normalized payload below
    const normalizedPayload = anyPayload as WhatsAppWebhookPayload;
    const isFromMe = Boolean(normalizedPayload.message?.fromMe);

    if (isFromMe) {
      console.log('Processing message sent by user (fromMe=true)');
      await logEvent(userId, 'info', 'Mensagem enviada pelo usuário (fromMe=true)');
    }

    // Extract data from payload
    const chatId = normalizedPayload.chat?.wa_chatid || normalizedPayload.chat?.wa_chatid || '';
    
    // Check if this is a group message (chatId ends with @g.us)
    const isGroupMessage = chatId.endsWith('@g.us');
    if (isGroupMessage) {
      console.log('Ignoring group message, chatId:', chatId);
      await logEvent(userId, 'info', `Mensagem de grupo ignorada: ${chatId}`);
      return new Response(
        JSON.stringify({ message: 'Group messages are ignored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const phone = normalizedPayload.chat?.phone?.trim() ||
      (normalizedPayload.message as any)?.sender_pn?.replace('@s.whatsapp.net', '') ||
      String((normalizedPayload.message as any)?.sender || '').replace(/\D/g, '') ||
      (chatId ? chatId.replace('@s.whatsapp.net', '').replace(/\D/g, '') : '') ||
      '';

    const name = normalizedPayload.chat?.wa_name?.trim() ||
      normalizedPayload.chat?.name?.trim() ||
      normalizedPayload.message?.senderName?.trim() ||
      'Contato WhatsApp';

    // Get text content or media placeholder
    const textFromPayload = typeof normalizedPayload.message?.text === 'string' ? normalizedPayload.message.text : '';
    const contentFromPayload = typeof normalizedPayload.message?.content === 'string' ? normalizedPayload.message.content : '';
    const rawText = (textFromPayload || contentFromPayload).trim();
    const mediaPlaceholder = getMediaPlaceholder(normalizedPayload.message);
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
    const messageTimestamp = normalizedPayload.message!.messageTimestamp;
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

    // === Extract UTM data EARLY before saving messages ===
    const earlyUtmData = extractUtmDataFromMessage(normalizedPayload.message, normalizedPayload);
    const hasEarlyUtm = Boolean(earlyUtmData.utm_source || earlyUtmData.utm_campaign || earlyUtmData.fbclid);
    
    // Fetch real campaign name from Facebook if we have an ad ID
    let fbCampaignInfo = { campaign_name: null as string | null, adset_name: null as string | null, ad_name: null as string | null };
    if (hasEarlyUtm && earlyUtmData.fb_ad_id) {
      console.log('Fetching Facebook campaign info for ad:', earlyUtmData.fb_ad_id);
      fbCampaignInfo = await fetchFacebookCampaignInfo(supabase, userId, earlyUtmData.fb_ad_id);
    }
    
    if (hasEarlyUtm) {
      console.log('Early UTM extraction successful:', earlyUtmData, 'FB Campaign:', fbCampaignInfo);
    }

    // Increment unread_count for the chat (both WhatsApp and Disparos tables)
    // Only if this is NOT a duplicate event
    const shouldIncrementUnread = Boolean(last8Incoming) && !isDuplicate && !isFromMe;

    if (last8Incoming) {
      try {
        // ===== WhatsApp chats =====
        // Check if this instancia_id is the user's WhatsApp main instance
        // (referenced in uazapi_config.whatsapp_instancia_id)
        // If so, update whatsapp_chats. Otherwise, update only disparos_chats.

        // If there's no instance param => WhatsApp.
        // If there IS an instance param => it's Disparos, unless it matches the configured main WhatsApp instance.
        const shouldUpdateWhatsApp = !effectiveHasInstanceParam || isMainWhatsAppInstance;
        const shouldUpdateDisparos = effectiveHasInstanceParam && !isMainWhatsAppInstance;
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
            const lastMessageTimeIso = new Date(
              messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
            ).toISOString();

            if (shouldIncrementUnread) {
              // Use atomic RPC to avoid race conditions when multiple messages arrive quickly
              const { data: newUnread, error: rpcError } = await supabase.rpc(
                'increment_whatsapp_chat_unread',
                {
                  p_chat_id: matchingChat.id,
                  p_last_message: messageText || 'Nova mensagem',
                  p_last_message_time: lastMessageTimeIso,
                },
              );

              if (rpcError) {
                console.error('Error incrementing WhatsApp unread count via RPC:', rpcError);
              } else {
                console.log('Incremented WhatsApp unread_count to', newUnread, 'for chat', matchingChat.id);
              }
            } else {
              const { error: updateError } = await supabase
                .from('whatsapp_chats')
                .update({
                  last_message: messageText || 'Nova mensagem',
                  last_message_time: lastMessageTimeIso,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', matchingChat.id);

              if (updateError) {
                console.error('Error updating WhatsApp chat last message:', updateError);
              }
            }

            // Save message to whatsapp_messages for realtime updates
            const anyMsg = normalizedPayload.message as any;
            const messageId = anyMsg?.messageid || anyMsg?.id || `msg_${Date.now()}`;
            const msgTime = new Date(
              messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
            ).toISOString();

            // Include UTM data directly in the insert (extracted earlier)
            const { error: msgInsertError } = await supabase
              .from('whatsapp_messages')
              .upsert({
                chat_id: matchingChat.id,
                message_id: messageId,
                content: messageText || '',
                sender_type: isFromMe ? 'admin' : 'customer',
                media_type: mediaPlaceholder ? (anyMsg?.mediaType || anyMsg?.messageType || null) : null,
                timestamp: msgTime,
                // Include UTM attribution directly
                utm_source: earlyUtmData.utm_source,
                utm_campaign: earlyUtmData.utm_campaign,
                utm_medium: earlyUtmData.utm_medium,
                utm_content: earlyUtmData.utm_content,
                utm_term: earlyUtmData.utm_term,
                fbclid: earlyUtmData.fbclid,
                ad_thumbnail_url: earlyUtmData.ad_thumbnail_url,
                // Include real Facebook campaign names
                fb_ad_id: earlyUtmData.fb_ad_id,
                fb_campaign_name: fbCampaignInfo.campaign_name,
                fb_adset_name: fbCampaignInfo.adset_name,
                fb_ad_name: fbCampaignInfo.ad_name,
              }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });

            if (msgInsertError) {
              console.error('Error saving WhatsApp message:', msgInsertError);
            } else {
              console.log('Saved WhatsApp message with UTM:', messageId, hasEarlyUtm ? earlyUtmData : '(no UTM)');
            }
          } else {
            // Chat doesn't exist yet. If the user deleted it recently, do NOT recreate it from old history.
            // We only bring it back when the contact sends a message AFTER the deletion moment.
            const waChatId = normalizedPayload.chat!.wa_chatid || `${normalizedIncoming}@s.whatsapp.net`;
            const msgTimeMs = messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000;
            const msgTime = new Date(msgTimeMs).toISOString();

            // ===== Check deletion tombstone first =====
            const { data: tombstone } = await supabase
              .from('whatsapp_chat_deletions')
              .select('deleted_at')
              .eq('user_id', userId)
              .eq('phone_last8', last8Incoming)
              .maybeSingle();

            if (tombstone?.deleted_at) {
              const tombstoneMs = new Date(tombstone.deleted_at).getTime();

              if (Number.isFinite(tombstoneMs) && msgTimeMs <= tombstoneMs) {
                console.log(
                  '[WhatsApp] Ignoring old webhook message for a deleted chat (tombstone check)',
                  { last8Incoming, msgTimeMs, tombstoneMs }
                );

                // Old message before deletion - ignore
                return new Response(JSON.stringify({ ok: true, ignored: true }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }

              // Message is NEWER than deletion - user wants to re-open the chat
              // Save the tombstone deleted_at to use as history_cleared_at
              const historyClearedAt = tombstone.deleted_at;
              
              // Remove the tombstone so future syncs won't skip this phone
              console.log('[WhatsApp] New message after deletion - removing tombstone for', last8Incoming);
              await supabase
                .from('whatsapp_chat_deletions')
                .delete()
                .eq('user_id', userId)
                .eq('phone_last8', last8Incoming);

              // Create a brand new chat with history_cleared_at set
              let chatIdForMessage: string | null = null;

              const { data: newChat, error: createError } = await supabase
                .from('whatsapp_chats')
                .insert({
                  user_id: userId,
                  chat_id: waChatId,
                  contact_number: phone,
                  contact_name: name,
                  normalized_number: normalizedIncoming,
                  last_message: messageText || 'Nova mensagem',
                  last_message_time: msgTime,
                  unread_count: isFromMe ? 0 : 1,
                  provider_unread_baseline: 0,
                  provider_unread_count: isFromMe ? 0 : 1,
                  history_cleared_at: historyClearedAt, // Don't show messages before this time
                })
                .select('id')
                .single();

              if (createError) {
                if ((createError as any).code === '23505') {
                  // Chat already exists (race condition) - fetch the existing chat ID
                  console.log('Chat already exists (race condition), fetching existing chat...');
                  const { data: existingChat } = await supabase
                    .from('whatsapp_chats')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('normalized_number', normalizedIncoming)
                    .is('deleted_at', null)
                    .maybeSingle();

                  if (existingChat) {
                    chatIdForMessage = existingChat.id;
                    console.log('Found existing chat:', chatIdForMessage);
                  }
                } else {
                  console.error('Error creating WhatsApp chat:', createError);
                }
              } else {
                console.log('Created new WhatsApp chat with history_cleared_at:', newChat.id, 'for', name);
                chatIdForMessage = newChat.id;
              }

              // Save the first message to whatsapp_messages
              if (chatIdForMessage) {
                const anyMsg = normalizedPayload.message as any;
                const messageId = anyMsg?.messageid || anyMsg?.id || `msg_${Date.now()}`;

                const { error: msgInsertError } = await supabase
                  .from('whatsapp_messages')
                  .upsert({
                    chat_id: chatIdForMessage,
                    message_id: messageId,
                    content: messageText || '',
                    sender_type: isFromMe ? 'admin' : 'customer',
                    media_type: mediaPlaceholder ? (anyMsg?.mediaType || anyMsg?.messageType || null) : null,
                    timestamp: msgTime,
                    utm_source: earlyUtmData.utm_source,
                    utm_campaign: earlyUtmData.utm_campaign,
                    utm_medium: earlyUtmData.utm_medium,
                    utm_content: earlyUtmData.utm_content,
                    utm_term: earlyUtmData.utm_term,
                    fbclid: earlyUtmData.fbclid,
                    ad_thumbnail_url: earlyUtmData.ad_thumbnail_url,
                    fb_ad_id: earlyUtmData.fb_ad_id,
                    fb_campaign_name: fbCampaignInfo.campaign_name,
                    fb_adset_name: fbCampaignInfo.adset_name,
                    fb_ad_name: fbCampaignInfo.ad_name,
                  }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });

                if (msgInsertError) {
                  console.error('Error saving first WhatsApp message:', msgInsertError);
                } else {
                  console.log('Saved first WhatsApp message with UTM:', messageId, hasEarlyUtm ? earlyUtmData : '(no UTM)');
                }
              }

              return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // No tombstone - create chat normally
            let chatIdForMessage: string | null = null;

            const { data: newChat, error: createError } = await supabase
              .from('whatsapp_chats')
              .insert({
                user_id: userId,
                chat_id: waChatId,
                contact_number: phone,
                contact_name: name,
                normalized_number: normalizedIncoming,
                last_message: messageText || 'Nova mensagem',
                last_message_time: msgTime,
                 unread_count: isFromMe ? 0 : 1,
                provider_unread_baseline: 0,
                provider_unread_count: isFromMe ? 0 : 1,
              })
              .select('id')
              .single();

            if (createError) {
              if ((createError as any).code === '23505') {
                // Chat already exists (race condition) - fetch the existing chat ID
                console.log('Chat already exists (race condition), fetching existing chat...');
                const { data: existingChat } = await supabase
                  .from('whatsapp_chats')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('normalized_number', normalizedIncoming)
                  .is('deleted_at', null)
                  .maybeSingle();

                if (existingChat) {
                  chatIdForMessage = existingChat.id;
                  console.log('Found existing chat:', chatIdForMessage);
                }
              } else {
                console.error('Error creating WhatsApp chat:', createError);
              }
            } else {
              console.log('Created new WhatsApp chat:', newChat.id, 'for', name);
              chatIdForMessage = newChat.id;
            }

            // Save the first message to whatsapp_messages (even if chat was created by another request)
            if (chatIdForMessage) {
              const anyMsg = normalizedPayload.message as any;
              const messageId = anyMsg?.messageid || anyMsg?.id || `msg_${Date.now()}`;

              const { error: msgInsertError } = await supabase
                .from('whatsapp_messages')
                .upsert({
                  chat_id: chatIdForMessage,
                  message_id: messageId,
                  content: messageText || '',
                  sender_type: isFromMe ? 'admin' : 'customer',
                  media_type: mediaPlaceholder ? (anyMsg?.mediaType || anyMsg?.messageType || null) : null,
                  timestamp: msgTime,
                  // Include UTM attribution directly
                  utm_source: earlyUtmData.utm_source,
                  utm_campaign: earlyUtmData.utm_campaign,
                  utm_medium: earlyUtmData.utm_medium,
                  utm_content: earlyUtmData.utm_content,
                  utm_term: earlyUtmData.utm_term,
                  fbclid: earlyUtmData.fbclid,
                  ad_thumbnail_url: earlyUtmData.ad_thumbnail_url,
                  // Include real Facebook campaign names
                  fb_ad_id: earlyUtmData.fb_ad_id,
                  fb_campaign_name: fbCampaignInfo.campaign_name,
                  fb_adset_name: fbCampaignInfo.adset_name,
                  fb_ad_name: fbCampaignInfo.ad_name,
                }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });

              if (msgInsertError) {
                console.error('Error saving first WhatsApp message:', msgInsertError);
              } else {
                console.log('Saved first WhatsApp message with UTM:', messageId, hasEarlyUtm ? earlyUtmData : '(no UTM)');
              }
            }
          }
        }

        // ===== Disparos chats =====
        // Only update Disparos chats when we can resolve the instance UUID.
        if (shouldUpdateDisparos && instanciaId) {
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
            const lastMessageTimeIso = new Date(
              messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
            ).toISOString();

            if (shouldIncrementUnread) {
              // Use atomic RPC to avoid race conditions when multiple messages arrive quickly
              const { data: newUnread, error: rpcError } = await supabase.rpc(
                'increment_disparos_chat_unread',
                {
                  p_chat_id: matchingDisparosChat.id,
                  p_last_message: messageText || 'Nova mensagem',
                  p_last_message_time: lastMessageTimeIso,
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
            } else {
              const { error: updateError } = await supabase
                .from('disparos_chats')
                .update({
                  last_message: messageText || 'Nova mensagem',
                  last_message_time: lastMessageTimeIso,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', matchingDisparosChat.id);

              if (updateError) {
                console.error('Error updating Disparos chat last message:', updateError);
              }
            }

            // Save message to disparos_messages for realtime updates
            const anyMsg = normalizedPayload.message as any;
            const messageId = anyMsg?.messageid || anyMsg?.id || `msg_${Date.now()}`;
            const msgTime = new Date(
              messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000
            ).toISOString();

            const { error: msgInsertError } = await supabase
              .from('disparos_messages')
              .upsert({
                chat_id: matchingDisparosChat.id,
                message_id: messageId,
                content: messageText || '',
                sender_type: isFromMe ? 'admin' : 'contact',
                media_type: mediaPlaceholder ? (anyMsg?.mediaType || anyMsg?.messageType || null) : null,
                timestamp: msgTime,
                // Include UTM attribution directly
                utm_source: earlyUtmData.utm_source,
                utm_campaign: earlyUtmData.utm_campaign,
                utm_medium: earlyUtmData.utm_medium,
                utm_content: earlyUtmData.utm_content,
                utm_term: earlyUtmData.utm_term,
                fbclid: earlyUtmData.fbclid,
                ad_thumbnail_url: earlyUtmData.ad_thumbnail_url,
                // Include real Facebook campaign names
                fb_ad_id: earlyUtmData.fb_ad_id,
                fb_campaign_name: fbCampaignInfo.campaign_name,
                fb_adset_name: fbCampaignInfo.adset_name,
                fb_ad_name: fbCampaignInfo.ad_name,
              }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });

            if (msgInsertError) {
              console.error('Error saving Disparos message:', msgInsertError);
            } else {
              console.log('Saved Disparos message with UTM:', messageId, hasEarlyUtm ? earlyUtmData : '(no UTM)');
            }
          } else if (instanciaId) {
            // Chat doesn't exist for this instance - check tombstone first
            const { data: tombstone } = await supabase
              .from('disparos_chat_deletions')
              .select('deleted_at')
              .eq('user_id', userId)
              .eq('phone_last8', last8Incoming)
              .eq('instancia_id', instanciaId)
              .maybeSingle();

            const disparosChatId = normalizedPayload.chat!.wa_chatid || `${normalizedIncoming}@s.whatsapp.net`;
            const msgTimeMs = messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000;
            const msgTime = new Date(msgTimeMs).toISOString();

            if (tombstone?.deleted_at) {
              const tombstoneMs = new Date(tombstone.deleted_at).getTime();

              if (Number.isFinite(tombstoneMs) && msgTimeMs <= tombstoneMs) {
                console.log(
                  '[Disparos] Ignoring old webhook message for a deleted chat (tombstone check)',
                  { last8Incoming, msgTimeMs, tombstoneMs, instanciaId }
                );

                return new Response(JSON.stringify({ ok: true, ignored: true }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }

              // Message is NEWER than deletion - user wants to re-open the chat
              // Save the tombstone deleted_at to use as history_cleared_at
              const historyClearedAt = tombstone.deleted_at;
              
              console.log('[Disparos] New message after deletion - removing tombstone for', last8Incoming);
              await supabase
                .from('disparos_chat_deletions')
                .delete()
                .eq('user_id', userId)
                .eq('phone_last8', last8Incoming)
                .eq('instancia_id', instanciaId);

              // Get instance info for the chat
              const { data: instanciaInfo } = await supabase
                .from('disparos_instancias')
                .select('nome')
                .eq('id', instanciaId)
                .maybeSingle();

              // Create a brand new chat with history_cleared_at set
              const { data: newChat, error: createError } = await supabase
                .from('disparos_chats')
                .insert({
                  user_id: userId,
                  chat_id: disparosChatId,
                  contact_number: phone,
                  contact_name: name,
                  normalized_number: normalizedIncoming,
                  last_message: messageText || 'Nova mensagem',
                  last_message_time: msgTime,
                  unread_count: isFromMe ? 0 : 1,
                  instancia_id: instanciaId,
                  instancia_nome: instanciaInfo?.nome || 'Instância',
                  history_cleared_at: historyClearedAt, // Don't show messages before this time
                })
                .select('id')
                .single();

              let disparosChatIdForMessage: string | null = null;

              if (createError) {
                if (createError.code === '23505') {
                  console.log('Disparos chat already exists (race condition), fetching existing chat...');
                  const { data: existingChat } = await supabase
                    .from('disparos_chats')
                    .select('id')
                    .eq('user_id', userId)
                    .eq('normalized_number', normalizedIncoming)
                    .eq('instancia_id', instanciaId)
                    .is('deleted_at', null)
                    .maybeSingle();
                  
                  if (existingChat) {
                    disparosChatIdForMessage = existingChat.id;
                  }
                } else {
                  console.error('Error creating Disparos chat:', createError);
                }
              } else {
                console.log('Created new Disparos chat with history_cleared_at:', newChat.id, 'for', name);
                disparosChatIdForMessage = newChat.id;
              }

              // Save the first message
              if (disparosChatIdForMessage) {
                const anyMsgLocal = normalizedPayload.message as any;
                const messageId = anyMsgLocal?.messageid || anyMsgLocal?.id || `msg_${Date.now()}`;

                await supabase
                  .from('disparos_messages')
                  .upsert({
                    chat_id: disparosChatIdForMessage,
                    message_id: messageId,
                    content: messageText || '',
                    sender_type: isFromMe ? 'admin' : 'contact',
                    media_type: mediaPlaceholder ? (anyMsgLocal?.mediaType || anyMsgLocal?.messageType || null) : null,
                    timestamp: msgTime,
                    utm_source: earlyUtmData.utm_source,
                    utm_campaign: earlyUtmData.utm_campaign,
                    utm_medium: earlyUtmData.utm_medium,
                    utm_content: earlyUtmData.utm_content,
                    utm_term: earlyUtmData.utm_term,
                    fbclid: earlyUtmData.fbclid,
                    ad_thumbnail_url: earlyUtmData.ad_thumbnail_url,
                    fb_ad_id: earlyUtmData.fb_ad_id,
                    fb_campaign_name: fbCampaignInfo.campaign_name,
                    fb_adset_name: fbCampaignInfo.adset_name,
                    fb_ad_name: fbCampaignInfo.ad_name,
                  }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });
              }

              // Return early - we handled everything
              return new Response(JSON.stringify({ ok: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // No tombstone - create chat normally
            const { data: instanciaInfo } = await supabase
              .from('disparos_instancias')
              .select('nome')
              .eq('id', instanciaId)
              .maybeSingle();

            const { data: newChat, error: createError } = await supabase
              .from('disparos_chats')
              .insert({
                user_id: userId,
                chat_id: disparosChatId,
                contact_number: phone,
                contact_name: name,
                normalized_number: normalizedIncoming,
                last_message: messageText || 'Nova mensagem',
                last_message_time: msgTime,
                unread_count: isFromMe ? 0 : 1,
                instancia_id: instanciaId,
                instancia_nome: instanciaInfo?.nome || 'Instância',
              })
              .select('id')
              .single();

            let disparosChatIdForMessage: string | null = null;

            if (createError) {
              if (createError.code === '23505') {
                console.log('Disparos chat already exists (race condition), fetching existing chat...');
                const { data: existingChat } = await supabase
                  .from('disparos_chats')
                  .select('id')
                  .eq('user_id', userId)
                  .eq('normalized_number', normalizedIncoming)
                  .eq('instancia_id', instanciaId)
                  .is('deleted_at', null)
                  .maybeSingle();
                
                if (existingChat) {
                  disparosChatIdForMessage = existingChat.id;
                  console.log('Found existing Disparos chat:', disparosChatIdForMessage);
                }
              } else {
                console.error('Error creating Disparos chat:', createError);
              }
            } else {
              console.log('Created new Disparos chat:', newChat.id, 'for', name, `(instancia: ${instanciaId})`);
              disparosChatIdForMessage = newChat.id;
            }

            // Save the first message to disparos_messages (even if chat was created by another request)
            if (disparosChatIdForMessage) {
              const anyMsg = normalizedPayload.message as any;
              const messageId = anyMsg?.messageid || anyMsg?.id || `msg_${Date.now()}`;

              const { error: msgInsertError } = await supabase
                .from('disparos_messages')
                .upsert({
                  chat_id: disparosChatIdForMessage,
                  message_id: messageId,
                  content: messageText || '',
                  sender_type: isFromMe ? 'admin' : 'contact',
                  media_type: mediaPlaceholder ? (anyMsg?.mediaType || anyMsg?.messageType || null) : null,
                  timestamp: msgTime,
                  // Include UTM attribution directly
                  utm_source: earlyUtmData.utm_source,
                  utm_campaign: earlyUtmData.utm_campaign,
                  utm_medium: earlyUtmData.utm_medium,
                  utm_content: earlyUtmData.utm_content,
                  utm_term: earlyUtmData.utm_term,
                  fbclid: earlyUtmData.fbclid,
                  ad_thumbnail_url: earlyUtmData.ad_thumbnail_url,
                  // Include real Facebook campaign names
                  fb_ad_id: earlyUtmData.fb_ad_id,
                  fb_campaign_name: fbCampaignInfo.campaign_name,
                  fb_adset_name: fbCampaignInfo.adset_name,
                  fb_ad_name: fbCampaignInfo.ad_name,
                }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });

              if (msgInsertError) {
                console.error('Error saving first Disparos message:', msgInsertError);
              } else {
                console.log('Saved first Disparos message with UTM:', messageId, hasEarlyUtm ? earlyUtmData : '(no UTM)');
              }
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

    // === SKIP lead creation/update when message is sent BY USER (fromMe=true) ===
    // We only want to track leads when the CONTACT sends a message (not when we send)
    // The "respondeu" field should only be true when the contact actually responded
    if (isFromMe) {
      console.log('Skipping lead creation/update for outgoing message (fromMe=true)');
      return new Response(
        JSON.stringify({ 
          message: 'Outgoing message processed, skipping lead update',
          action: 'skipped_outgoing'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Lead creation for WhatsApp (same logic as Disparos) ===
    // Extract referral data from Click-to-WhatsApp ads FIRST (before lead creation/update)
    // UAZAPI sends ad data in multiple possible locations:
    // 1. message.referral or payload.referral (standard WhatsApp Business API format)
    // 2. message.content.contextInfo.externalAdReply (UAZAPI format)
    const anyMsg = normalizedPayload.message as any;
    let referral = normalizedPayload.message?.referral || normalizedPayload.referral;
    
    // Check for UAZAPI format: message.content.contextInfo.externalAdReply
    const contextInfo = anyMsg?.content?.contextInfo;
    const externalAdReply = contextInfo?.externalAdReply;
    const conversionSource = contextInfo?.conversionSource;
    
    const utmData: Record<string, string | null> = {
      utm_source: null,
      utm_campaign: null,
      utm_medium: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      fb_ad_id: null,
      fb_campaign_id: null,
      fb_campaign_name: null,
      fb_adset_id: null,
      fb_adset_name: null,
      fb_ad_name: null,
    };

    // Handle standard referral format
    if (referral) {
      console.log('Click-to-WhatsApp referral data detected (standard format):', JSON.stringify(referral));
      await logEvent(userId, 'info', `Dados de anúncio CTWA detectados: ${JSON.stringify(referral)}`);
      
      // Map referral data to UTM-like fields
      utmData.utm_source = 'facebook';
      utmData.utm_medium = 'cpc';
      utmData.utm_campaign = referral.headline || null;
      utmData.utm_content = referral.source_id || null;
      utmData.utm_term = referral.body || null;
      utmData.fbclid = referral.ctwa_clid || null;
      utmData.fb_ad_id = referral.source_id || null;
    }
    // Handle UAZAPI format: externalAdReply in contextInfo
    else if (externalAdReply && conversionSource === 'FB_Ads') {
      console.log('Click-to-WhatsApp ad data detected (UAZAPI format):', JSON.stringify(externalAdReply));
      await logEvent(userId, 'info', `Dados de anúncio CTWA (UAZAPI) detectados: ${JSON.stringify(externalAdReply)}`);

      // Map externalAdReply data to UTM-like fields
      // UAZAPI sends sourceID (uppercase D) - check both variants
      utmData.utm_source = 'facebook';
      utmData.utm_medium = 'cpc';
      utmData.utm_campaign = externalAdReply.title || null;
      utmData.utm_content = externalAdReply.sourceID || externalAdReply.sourceId || externalAdReply.source_id || null;
      utmData.utm_term = externalAdReply.body || null;
      utmData.fbclid = externalAdReply.ctwa_clid || null;
      utmData.fb_ad_id = externalAdReply.sourceID || externalAdReply.sourceId || externalAdReply.source_id || null;

      // Fallback: some UAZAPI payloads omit sourceId but include ctwaPayload/conversionData.
      if (!utmData.utm_content || !utmData.fbclid) {
        const { adId, fbclid } = extractCtwaIdsFromContextInfo(contextInfo);
        utmData.utm_content = utmData.utm_content || adId;
        utmData.fbclid = utmData.fbclid || fbclid;

        if (adId) {
          await logEvent(userId, 'info', `CTWA payload decodificado: adId=${adId}`);
        }
      }

      // Create a referral-like object for downstream compatibility checks
      referral = {
        headline: externalAdReply.title,
        body: externalAdReply.body,
        source_id: utmData.utm_content || undefined,
        ctwa_clid: utmData.fbclid || undefined,
      };
    }

    // Fetch real Facebook campaign names if we have an ad ID (for lead enrichment)
    let leadFbCampaignInfo = { campaign_id: null as string | null, campaign_name: null as string | null, adset_id: null as string | null, adset_name: null as string | null, ad_name: null as string | null };
    if (utmData.fb_ad_id) {
      leadFbCampaignInfo = await fetchFacebookCampaignInfo(supabase, userId, utmData.fb_ad_id);
      console.log('Fetched Facebook campaign info for lead:', leadFbCampaignInfo);
      // Update utmData with enriched names and IDs
      utmData.fb_campaign_id = leadFbCampaignInfo.campaign_id;
      utmData.fb_campaign_name = leadFbCampaignInfo.campaign_name;
      utmData.fb_adset_id = leadFbCampaignInfo.adset_id;
      utmData.fb_adset_name = leadFbCampaignInfo.adset_name;
      utmData.fb_ad_name = leadFbCampaignInfo.ad_name;
    }

    // NOTE: UTM data is now included directly in message inserts (above), so no post-update needed

    // Rule: if webhook includes an instance param, treat it as Disparos unless it matches the configured main WhatsApp instance.
    let instanciaNome: string | null = instanciaNomeFromDb;

    if (effectiveHasInstanceParam && !instanciaNome && instanciaId) {
      const { data: instanciaInfo } = await supabase
        .from('disparos_instancias')
        .select('nome')
        .eq('id', instanciaId)
        .maybeSingle();

      instanciaNome = instanciaInfo?.nome || null;
    }

    const isDisparosInstance = effectiveHasInstanceParam && !isMainWhatsAppInstance;
    const leadOrigem = isDisparosInstance ? 'Disparos' : 'WhatsApp';
    console.log('Lead origin classification:', leadOrigem, 'effectiveHasInstanceParam:', effectiveHasInstanceParam, 'isMainWhatsAppInstance:', isMainWhatsAppInstance);

    // Find leads matching phone AND origem (WhatsApp or Disparos are treated as separate "buckets")
    // A contact can have a lead in WhatsApp AND a lead in Disparos (same phone, different origin)
    const { data: allLeads, error: searchError } = await supabase
      .from('leads')
      .select('id, status, telefone, nome, deleted_at, origem, utm_source, fbclid')
      .eq('user_id', userId);

    if (searchError) {
      console.error('Error searching for existing leads:', searchError);
      await logEvent(userId, 'error', `Erro ao buscar leads existentes: ${searchError.message}`);
      return new Response(
        JSON.stringify({ error: 'Database error', details: searchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Match by phone AND origem - each origin is a separate bucket
    // For WhatsApp leads, also match leads with null/empty origem (legacy or manual leads)
    const matchingLead = allLeads?.find((lead) => {
      const phoneMatches = phonesMatch(lead.telefone, phone);
      const leadOrigemNormalized = (lead.origem || '').toLowerCase();
      const targetOrigemNormalized = leadOrigem.toLowerCase();
      
      // WhatsApp leads should also match leads with no origem (null or empty)
      // This prevents duplicate leads when same contact has legacy record without origem
      const origemMatches = leadOrigemNormalized === targetOrigemNormalized ||
        (targetOrigemNormalized === 'whatsapp' && leadOrigemNormalized === '');
      
      return phoneMatches && origemMatches;
    });

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

    // Se existe e está deletado -> restaurar mantendo a data original (created_at)
    if (matchingLead && matchingLead.deleted_at) {
      const updateData: any = {
        deleted_at: null,
        status: 'lead',
        origem: leadOrigem,
        origem_lead: true,
        // NÃO sobrescrever data_contato - manter a data original do primeiro contato
        // O created_at já preserva quando o lead foi criado originalmente
        updated_at: new Date().toISOString(),
        respondeu: true, // Mark that lead has responded
      };

      // Atualiza nome se estiver vazio/legado
      if ((!matchingLead.nome || matchingLead.nome === 'Contato WhatsApp') && name) {
        updateData.nome = name;
      }

      // Add UTM data from Click-to-WhatsApp if available (overwrite even if lead had previous data)
      if (referral) {
        updateData.utm_source = utmData.utm_source;
        updateData.utm_medium = utmData.utm_medium;
        updateData.utm_campaign = utmData.utm_campaign;
        updateData.utm_content = utmData.utm_content;
        updateData.utm_term = utmData.utm_term;
        updateData.fbclid = utmData.fbclid;
        updateData.fb_ad_id = utmData.fb_ad_id;
        updateData.fb_campaign_id = utmData.fb_campaign_id;
        updateData.fb_campaign_name = utmData.fb_campaign_name;
        updateData.fb_adset_id = utmData.fb_adset_id;
        updateData.fb_adset_name = utmData.fb_adset_name;
        updateData.fb_ad_name = utmData.fb_ad_name;
      }

      // Add instance name if available
      if (instanciaNome) {
        updateData.instancia_nome = instanciaNome;
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

      console.log('Lead restored successfully from webhook (keeping original created_at):', matchingLead.id);
      await logEvent(userId, 'info', `Lead restaurado com dados originais: ${name} (ID: ${matchingLead.id})`);

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
        respondeu: true, // Mark that lead has responded
      };

      if (matchingLead.status === 'sem_interesse') {
        updateData.status = 'lead';
      }

      // Add UTM data from Click-to-WhatsApp if lead doesn't have attribution yet
      if (referral && !matchingLead.utm_source && !matchingLead.fbclid) {
        updateData.utm_source = utmData.utm_source;
        updateData.utm_medium = utmData.utm_medium;
        updateData.utm_campaign = utmData.utm_campaign;
        updateData.utm_content = utmData.utm_content;
        updateData.utm_term = utmData.utm_term;
        updateData.fbclid = utmData.fbclid;
        updateData.fb_ad_id = utmData.fb_ad_id;
        updateData.fb_campaign_id = utmData.fb_campaign_id;
        updateData.fb_campaign_name = utmData.fb_campaign_name;
        updateData.fb_adset_id = utmData.fb_adset_id;
        updateData.fb_adset_name = utmData.fb_adset_name;
        updateData.fb_ad_name = utmData.fb_ad_name;
        console.log('Adding UTM data to existing lead:', utmData);
        await logEvent(userId, 'info', `Dados UTM adicionados ao lead existente: ${JSON.stringify(utmData)}`);
      }

      // Add instance name if available and not set
      if (instanciaNome) {
        updateData.instancia_nome = instanciaNome;
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

    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        nome: name,
        telefone: normalizedIncoming,
        procedimento_nome: `Contato via ${leadOrigem}`,
        origem: leadOrigem,
        observacoes: messageText ? `Primeira mensagem: ${messageText}` : `Contato recebido via ${leadOrigem}`,
        status: 'lead',
        origem_lead: true,
        data_contato: today,
        instancia_nome: instanciaNome,
        respondeu: true, // Lead created from incoming message = already responded
        // UTM data from Click-to-WhatsApp ads
        utm_source: utmData.utm_source,
        utm_campaign: utmData.utm_campaign,
        utm_medium: utmData.utm_medium,
        utm_content: utmData.utm_content,
        utm_term: utmData.utm_term,
        fbclid: utmData.fbclid,
        // Facebook Ad enriched data
        fb_ad_id: utmData.fb_ad_id,
        fb_campaign_id: utmData.fb_campaign_id,
        fb_campaign_name: utmData.fb_campaign_name,
        fb_adset_id: utmData.fb_adset_id,
        fb_adset_name: utmData.fb_adset_name,
        fb_ad_name: utmData.fb_ad_name,
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
