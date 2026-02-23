import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Providers may include message identifiers in different shapes (e.g. `messageid` vs `id`)
// and sometimes prefix them with the owner number (e.g. `5534...:3EB0...`).
// This normalizes them to a stable id so we can deduplicate reliably.
function normalizeProviderMessageId(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  // If the provider prefixes with something like "owner:messageId", keep only the last part.
  const parts = s.split(':').filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 1] : s).trim();
}

function extractStableMessageId(message: any): string {
  // Try a few common variants.
  const candidates = [
    message?.messageid,
    message?.messageId,
    message?.id,
    message?.messageID,
  ];

  for (const c of candidates) {
    const normalized = normalizeProviderMessageId(c);
    if (normalized) return normalized;
  }
  return '';
}

// Global idempotency gate for keyword triggers.
// The same inbound WhatsApp message can arrive multiple times via different webhook tokens/instances.
// We must ensure the keyword handler runs only once per inbound message.
const KEYWORD_DEDUP_USER_ID = '00000000-0000-0000-0000-000000000000';

function normalizeKeywordText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toMsTimestamp(ts: number): number {
  // Some providers send seconds, others send ms.
  return ts > 9999999999 ? ts : ts * 1000;
}

async function canRunKeywordTrigger(params: {
  supabase: any;
  phoneLast8: string;
  stableMessageId: string;
  messageText: string;
  messageTimestamp: number;
}): Promise<boolean> {
  const { supabase, phoneLast8, stableMessageId, messageText, messageTimestamp } = params;

  if (!phoneLast8) return false;

  // Prefer stable message id; otherwise fall back to a short time bucket + normalized text.
  const ms = toMsTimestamp(Number(messageTimestamp) || 0);
  const bucketMs = ms ? Math.floor(ms / 15000) * 15000 : 0; // 15s bucket
  const normalizedText = normalizeKeywordText(messageText).slice(0, 120);

  const hash = stableMessageId
    ? `kwid:${stableMessageId}`
    : `kw:${bucketMs}:${normalizedText || 'empty'}`;

  const ts = stableMessageId ? 0 : bucketMs;

  const { error } = await supabase
    .from('webhook_message_dedup')
    .insert({
      user_id: KEYWORD_DEDUP_USER_ID,
      instancia_id: null,
      phone_last8: phoneLast8,
      message_timestamp: ts,
      message_hash: hash,
    });

  if (!error) return true;
  if ((error as any).code === '23505') return false;
  // Fail-closed: if we can't guarantee idempotency, do not run.
  console.error('[Keyword Dedup] Unexpected error inserting keyword dedup record:', error);
  return false;
}

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

// Helper function to normalize media type for database enum compatibility
// Converts raw API values like "ptt", "AudioMessage" to valid enum values like "audio"
function normalizeMediaType(rawMediaType: string | null | undefined, messageType: string | null | undefined): string | null {
  const raw = (rawMediaType || messageType || '').toLowerCase();
  
  if (!raw) return null;
  
  // Map common variations to valid enum values
  if (raw === 'ptt' || raw.includes('audio')) return 'audio';
  if (raw.includes('image')) return 'image';
  if (raw.includes('video')) return 'video';
  if (raw.includes('document') || raw.includes('application')) return 'document';
  if (raw.includes('sticker')) return 'sticker';
  
  // Return the raw value if it's already a valid enum value
  return raw;
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

// Keywords that indicate the message came from an ad
const AD_KEYWORDS = [
  "vi seu anúncio", "vi o anúncio", "vi no instagram", "vi no facebook",
  "vi na propaganda", "vi a propaganda", "vi pelo instagram", "vi pelo facebook",
  "vi uma publicação", "vi um post", "vi o post", "vi sua publicação",
  "vim pelo anúncio", "vim do anúncio", "vim pelo instagram", "vim do instagram",
  "vim pelo facebook", "vim do facebook", "através do anúncio", "através do instagram",
  "através do facebook", "pelo anúncio", "do anúncio"
];

// Detect if message text indicates it came from an ad
function detectAdMentionInText(text: string): { isFromAd: boolean; source: string | null } {
  if (!text) return { isFromAd: false, source: null };
  
  const normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const textWithAccents = text.toLowerCase();
  
  for (const keyword of AD_KEYWORDS) {
    const normalizedKeyword = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes(normalizedKeyword) || textWithAccents.includes(keyword)) {
      // Determine source
      if (keyword.includes("instagram")) return { isFromAd: true, source: "instagram" };
      if (keyword.includes("facebook")) return { isFromAd: true, source: "facebook" };
      return { isFromAd: true, source: "meta" };
    }
  }
  return { isFromAd: false, source: null };
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

    // Parse webhook payload FIRST to extract token (api_key) for instance resolution
    const payload: WhatsAppWebhookPayload = await req.json();
    console.log('Payload received:', JSON.stringify(payload, null, 2));

    const anyPayload: any = payload as any;
    const payloadToken = anyPayload?.token || null;
    const payloadInstanceName = anyPayload?.instanceName || null;

    // Identify user/instance from URL (legacy support)
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const fnIdx = pathParts.findIndex((p) => p === 'whatsapp-webhook');
    const userIdFromPath = fnIdx >= 0 ? pathParts[fnIdx + 1] : null;
    const instanciaIdFromPath = fnIdx >= 0 ? pathParts[fnIdx + 2] : null;
    const userIdFromUrl = url.searchParams.get('user_id') || userIdFromPath;
    const rawInstanciaId = url.searchParams.get('instancia_id') || instanciaIdFromPath;
    const rawInstanciaKey = rawInstanciaId ? rawInstanciaId.split('/')[0] : null;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const hasInstanceParam = Boolean(rawInstanciaKey);

    // PRIORITY 1: Resolve instance by token (api_key) in payload - most reliable method
    // This allows multiple clients to share the same UAZapi server without interference
    let instanciaId: string | null = null;
    let instanciaNomeFromDb: string | null = null;
    let effectiveUserId: string | null = null;
    let adminNotificationInstanceId: string | null = null;
    let isAdminNotificationInstance = false;
    let effectiveUazapiConfig: { whatsapp_instancia_id: string | null } | null = null;
    let isMainWhatsAppInstance = false;
    let resolvedFromToken = false;

    if (payloadToken) {
      console.log('PRIORITY 1: Resolving instance from payload token (api_key):', payloadToken);
      
      // First check disparos_instancias
      const { data: instanciaFromToken } = await supabase
        .from('disparos_instancias')
        .select('id, nome, instance_name, user_id')
        .eq('api_key', payloadToken)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (instanciaFromToken?.id) {
        instanciaId = instanciaFromToken.id;
        instanciaNomeFromDb = instanciaFromToken.nome || payloadInstanceName;
        effectiveUserId = instanciaFromToken.user_id;
        resolvedFromToken = true;
        console.log('SUCCESS: Resolved instance from disparos_instancias token:', {
          instanciaId,
          instanciaNome: instanciaNomeFromDb,
          effectiveUserId,
        });

        // Fetch uazapiConfig for the resolved user
        const { data: userUazapiConfig } = await supabase
          .from('uazapi_config')
          .select('whatsapp_instancia_id')
          .eq('user_id', effectiveUserId)
          .eq('is_active', true)
          .maybeSingle();
        
        effectiveUazapiConfig = userUazapiConfig;
        isMainWhatsAppInstance = Boolean(
          userUazapiConfig?.whatsapp_instancia_id && userUazapiConfig.whatsapp_instancia_id === instanciaId
        );

        // Update last_webhook_at for this instance
        await supabase
          .from('disparos_instancias')
          .update({ last_webhook_at: new Date().toISOString() })
          .eq('id', instanciaId);
      } else {
        // PRIORITY 1B: Check if token matches uazapi_config (main WhatsApp instance)
        console.log('PRIORITY 1B: Checking uazapi_config for main WhatsApp instance');
        const { data: uazapiFromToken } = await supabase
          .from('uazapi_config')
          .select('id, user_id, instance_name')
          .eq('api_key', payloadToken)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (uazapiFromToken?.user_id) {
          effectiveUserId = uazapiFromToken.user_id;
          instanciaNomeFromDb = uazapiFromToken.instance_name || payloadInstanceName;
          isMainWhatsAppInstance = true; // This IS the main WhatsApp instance
          resolvedFromToken = true;
          effectiveUazapiConfig = { whatsapp_instancia_id: null }; // No linked disparos instance
          
          console.log('SUCCESS: Resolved instance from uazapi_config (main WhatsApp):', {
            effectiveUserId,
            instanciaNome: instanciaNomeFromDb,
            isMainWhatsAppInstance,
          });
        } else {
          // PRIORITY 1C: Check if token matches admin_notification_instances (admin WhatsApp for system notifications)
          const { data: adminNotifInstance } = await supabase
            .from('admin_notification_instances')
            .select('id, nome, is_active')
            .eq('api_key', payloadToken)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (adminNotifInstance?.id) {
            adminNotificationInstanceId = adminNotifInstance.id;
            isAdminNotificationInstance = true;
            resolvedFromToken = true;
            instanciaNomeFromDb = adminNotifInstance.nome || payloadInstanceName;
            console.log('SUCCESS: Resolved admin notification instance from token:', {
              adminNotificationInstanceId,
              instanciaNome: instanciaNomeFromDb,
            });
          }
        }
      }
    }

    // PRIORITY 2: If token resolution failed, try URL parameters (legacy support)
    if (!resolvedFromToken && userIdFromUrl) {
      console.log('PRIORITY 2: Falling back to URL parameters, userId:', userIdFromUrl);
      effectiveUserId = userIdFromUrl;

      const { data: uazapiConfig } = await supabase
        .from('uazapi_config')
        .select('whatsapp_instancia_id')
        .eq('user_id', userIdFromUrl)
        .eq('is_active', true)
        .maybeSingle();
      
      effectiveUazapiConfig = uazapiConfig;

      if (rawInstanciaKey) {
        // Try matching by id, instance_name or friendly nome
        const { data: instanciaRow } = await supabase
          .from('disparos_instancias')
          .select('id, nome, instance_name')
          .eq('user_id', userIdFromUrl)
          .or(`id.eq.${rawInstanciaKey},instance_name.eq.${rawInstanciaKey},nome.eq.${rawInstanciaKey}`)
          .limit(1)
          .maybeSingle();

        if (instanciaRow?.id) {
          instanciaId = instanciaRow.id;
          instanciaNomeFromDb = instanciaRow.nome || null;
          isMainWhatsAppInstance = Boolean(
            uazapiConfig?.whatsapp_instancia_id && uazapiConfig.whatsapp_instancia_id === instanciaId
          );
        }
      }
    }

    // If still no user, reject (unless this is the admin notification instance webhook)
    if (!effectiveUserId) {
      if (isAdminNotificationInstance && adminNotificationInstanceId) {
        console.log('No effectiveUserId, but admin notification instance was resolved; continuing with admin-only flow');
        // Use a placeholder user id for non-critical logs only.
        effectiveUserId = '00000000-0000-0000-0000-000000000000';
      } else {
        console.error('Could not resolve user from token or URL');
        await logEvent('00000000-0000-0000-0000-000000000000', 'error', 'Could not resolve user from token or URL');
        return new Response(
          JSON.stringify({ error: 'Could not identify instance. Ensure the instance is registered.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Instance resolution complete:', {
      resolvedFromToken,
      effectiveUserId,
      instanciaId,
      instanciaNomeFromDb,
      isMainWhatsAppInstance,
      hasInstanceParam,
    });

    await logEvent(
      effectiveUserId,
      'info',
      `Webhook recebido${resolvedFromToken ? ' (via token)' : ''}${hasInstanceParam ? ` (instancia: ${rawInstanciaKey})` : ''}`,
    );

    // Determine if we should update WhatsApp or Disparos tables
    // If there's no instance param => WhatsApp (legacy behavior)
    // If there IS an instance param => it's WhatsApp if it's the main instance, otherwise Disparos
    const effectiveHasInstanceParam = hasInstanceParam || Boolean(payloadInstanceName);

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
          await logEvent(effectiveUserId, 'error', `Erro ao marcar mensagens como deletadas: ${deleteError.message}`);
        } else {
          console.log(`Marked ${messageIds.length} message(s) as deleted`);
          await logEvent(effectiveUserId, 'info', `${messageIds.length} mensagem(s) marcada(s) como deletada(s)`);
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
      await logEvent(effectiveUserId, 'error', 'Estrutura de payload inválida', payload);
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
      await logEvent(effectiveUserId, 'info', 'Mensagem enviada pelo usuário (fromMe=true)');
    }

    // Extract data from payload
    const chatId = normalizedPayload.chat?.wa_chatid || normalizedPayload.chat?.wa_chatid || '';
    
    // Check if this is a group message (chatId ends with @g.us)
    const isGroupMessage = chatId.endsWith('@g.us');
    if (isGroupMessage && !isAdminNotificationInstance) {
      // Before ignoring group messages, check if this group matches a keyword-enabled admin notification config
      const messageTextForGroup = typeof normalizedPayload.message?.text === 'string' ? normalizedPayload.message.text.trim() : '';
      const wasSentByApiGroup = Boolean((normalizedPayload.message as any)?.wasSentByApi);
      const isFromMeGroup = Boolean(normalizedPayload.message?.fromMe);
      
      // Allow keyword triggers from anyone in the group (including fromMe)
      // Only skip if the message was sent by our API (bot response) to prevent loops
      // Also skip long messages (>50 chars) or messages with formatting (*, 💰, 📊, etc.) 
      // since these are likely bot responses, not user keyword triggers
      const looksLikeBotResponse = messageTextForGroup.length > 50 
        || /^[💰📊❌⚠️🔔📈•]/.test(messageTextForGroup)
        || (isFromMeGroup && messageTextForGroup.includes('\n'));
      if (messageTextForGroup && !wasSentByApiGroup && !looksLikeBotResponse) {
        // Check if this group ID has keyword triggers configured
        const { data: groupKeywordConfigs } = await supabase
          .from('admin_client_notifications')
          .select('id, admin_instancia_id')
          .eq('destination_type', 'group')
          .eq('destination_value', chatId)
          .eq('keyword_enabled', true)
          .limit(1);
        
        if (groupKeywordConfigs && groupKeywordConfigs.length > 0) {
          let adminInstanciaId = groupKeywordConfigs[0].admin_instancia_id;
          console.log(`[Group Keyword] Group ${chatId} matches keyword config, admin_instancia_id: ${adminInstanciaId}`);
          
          // If admin_instancia_id is null, try to find any active admin notification instance as fallback
          if (!adminInstanciaId) {
            console.log('[Group Keyword] admin_instancia_id is null, looking for fallback admin instance...');
            const { data: fallbackInstance } = await supabase
              .from('admin_notification_instances')
              .select('id')
              .eq('is_active', true)
              .limit(1)
              .maybeSingle();
            
            if (fallbackInstance?.id) {
              adminInstanciaId = fallbackInstance.id;
              console.log(`[Group Keyword] Using fallback admin instance: ${adminInstanciaId}`);
            } else {
              console.error('[Group Keyword] No active admin notification instance found, cannot send keyword response');
            }
          }
          
          // Extract sender phone for group messages
          const senderPn = (normalizedPayload.message as any)?.sender_pn || '';
          const senderPhone = senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '');

          // Use dedup to prevent the same message from triggering multiple times
          const stableId = extractStableMessageId(normalizedPayload.message as any);
          const phoneLast8ForDedup = getLast8Digits(senderPhone || chatId.replace('@g.us', ''));
          const canRun = await canRunKeywordTrigger({
            supabase,
            phoneLast8: phoneLast8ForDedup,
            stableMessageId: stableId,
            messageText: messageTextForGroup,
            messageTimestamp: Number((normalizedPayload.message as any)?.messageTimestamp) || 0,
          });
          
          if (adminInstanciaId && canRun) {
            try {
              console.log(`[Group Keyword] Calling admin-keyword-handler for group ${chatId}, text: "${messageTextForGroup.substring(0, 30)}"`);
              const kwResponse = await fetch(`${supabaseUrl}/functions/v1/admin-keyword-handler`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                },
                body: JSON.stringify({
                  admin_instancia_id: adminInstanciaId,
                  phone: senderPhone || 'group',
                  message_text: messageTextForGroup,
                  chat_id: chatId,
                }),
              });
              const kwResult = await kwResponse.text();
              console.log(`[Group Keyword] Handler response: ${kwResponse.status} - ${kwResult}`);
            } catch (err: any) {
              console.error('[Group Keyword] Error calling keyword handler:', err?.message || err);
            }
          } else if (!canRun) {
            console.log('[Group Keyword] Skipped - dedup prevented duplicate trigger');
          } else {
            console.error(`[Group Keyword] Cannot trigger: adminInstanciaId=${adminInstanciaId}, canRun=${canRun}`);
          }
        } else {
          console.log(`[Group Keyword] No keyword config found for group ${chatId}`);
        }
      }
      
      console.log('Ignoring group message (non-keyword), chatId:', chatId);
      return new Response(
        JSON.stringify({ message: 'Group messages are ignored' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For fromMe messages, we need the RECIPIENT's number (from chat.wa_chatid or chat.phone)
    // For incoming messages, we need the SENDER's number (from message.sender_pn or chat.phone)
    // IMPORTANT: Extract the full number from wa_chatid for consistency with uazapi-get-chats
    const extractNumberFromChatId = (chatId: string): string => {
      if (!chatId) return '';
      // Remove @s.whatsapp.net and any non-digits
      return chatId.replace('@s.whatsapp.net', '').replace(/\D/g, '');
    };
    
    // Get the contact number - prefer wa_chatid as it contains the full international number
    const chatIdNumber = extractNumberFromChatId(chatId);
    
    let phone: string;
    if (isFromMe) {
      // For outgoing messages, use the wa_chatid number (recipient)
      phone = normalizedPayload.chat?.phone?.trim() || chatIdNumber || '';
    } else {
      // For incoming messages, prefer wa_chatid, then sender_pn, then chat.phone
      phone = normalizedPayload.chat?.phone?.trim() ||
        extractNumberFromChatId((normalizedPayload.message as any)?.sender_pn || '') ||
        String((normalizedPayload.message as any)?.sender || '').replace(/\D/g, '') ||
        chatIdNumber ||
        '';
    }

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

    // Some providers may resend outbound messages (sent by our API) as if they were inbound.
    // If we don't guard against that, keyword triggers can enter a loop:
    // user sends "saldo" -> we reply with "Saldo Meta Ads" -> webhook receives our reply -> triggers again -> ...
    const wasSentByApi = Boolean((normalizedPayload.message as any)?.wasSentByApi);

    // Extra safety: sometimes the provider misreports `fromMe` / omits `wasSentByApi`.
    // If the sender is the instance owner number, we treat it as outbound and NEVER run keyword triggers.
    const msgForDirection = normalizedPayload.message as any;
    const ownerDigits = String((normalizedPayload as any)?.owner || (normalizedPayload.chat as any)?.owner || '')
      .replace(/\D/g, '');
    const senderDigits = (
      extractNumberFromChatId(String(msgForDirection?.sender_pn || '')) ||
      String(msgForDirection?.sender || '').replace(/\D/g, '')
    );
    const isOutboundBySender = Boolean(ownerDigits && senderDigits && ownerDigits === senderDigits);

    // === Extract quoted message info (for reply messages) ===
    const msgForQuote = normalizedPayload.message as any;
    const ctxForQuote = msgForQuote?.content?.contextInfo || msgForQuote?.contextInfo;
    const quotedMessage = ctxForQuote?.quotedMessage;
    let quotedMessageId: string | null = null;
    let quotedContent: string | null = null;
    let quotedSenderType: string | null = null;

    if (quotedMessage || ctxForQuote?.stanzaId) {
      quotedMessageId = ctxForQuote?.stanzaId || null;
      
      // Extract quoted text from various possible locations
      quotedContent = quotedMessage?.conversation || 
        quotedMessage?.extendedTextMessage?.text ||
        quotedMessage?.text ||
        ctxForQuote?.quotedMessageText ||
        null;
      
      // Determine if quoted message was from the user (fromMe) or the contact
      const quotedFromMe = ctxForQuote?.participant === undefined || ctxForQuote?.fromMe === true;
      quotedSenderType = quotedFromMe ? 'agent' : 'customer';
      
      console.log('Quoted message detected:', { quotedMessageId, quotedContent: quotedContent?.substring(0, 50), quotedSenderType });
    }

    if (!phone) {
      console.error('Missing phone number in payload');
      await logEvent(effectiveUserId, 'error', 'Número de telefone não encontrado no payload', payload);
      return new Response(
        JSON.stringify({ error: 'Missing phone number' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the wa_chatid number for normalized_number if it starts with 55 (has country code)
    // Otherwise use the normalizePhone function
    // For group messages, chatIdNumber is the group ID, so always use phone-based normalization
    const normalizedIncoming = (!isGroupMessage && chatIdNumber.startsWith('55')) ? chatIdNumber : normalizePhone(phone);
    console.log('Contact info - Phone:', phone, 'Name:', name);
    console.log('Normalized incoming phone:', normalizedIncoming, '(from chatId:', chatIdNumber, ')');
    await logEvent(effectiveUserId, 'info', `Contato identificado - Telefone: ${phone} (normalizado: ${normalizedIncoming}), Nome: ${name}`);

    // === Admin notification instance webhook: only run keyword handler and exit ===
    if (isAdminNotificationInstance && adminNotificationInstanceId) {
      console.log('[Admin Instance] Webhook received for admin notification instance:', adminNotificationInstanceId);

      if (!isFromMe && !wasSentByApi && !isOutboundBySender && messageText) {
        // Deduplicate admin instance webhook events too (provider retries can cause duplicates)
        const msgAny = normalizedPayload.message as any;
        const messageId = extractStableMessageId(msgAny);

        // IMPORTANT: the provider may resend the same message with slightly different timestamps.
        // Our DB unique index includes message_timestamp, so when we have a stable messageId we
        // force message_timestamp=0 and put the unique identifier into message_hash.
        const messageTimestampRaw = Number(msgAny?.messageTimestamp);
        const messageTimestamp = messageId ? 0 : (Number.isFinite(messageTimestampRaw) ? Math.trunc(messageTimestampRaw) : 0);

        const messageHash = messageId ? `id:${messageId}` : `text:${messageText?.substring(0, 80) || 'empty'}`;
        const last8Incoming = getLast8Digits(normalizedIncoming);

        let isDuplicateAdmin = false;
        if (last8Incoming) {
          const { error: dedupError } = await supabase
            .from('webhook_message_dedup')
            .insert({
              // IMPORTANT: for admin-instance keyword triggers we must NOT use effectiveUserId here.
              // The webhook can run with different "effectiveUserId" values depending on routing/auth,
              // which would bypass the unique index and cause duplicate replies.
              // We use a constant placeholder user_id so dedup is stable across retries.
              user_id: '00000000-0000-0000-0000-000000000000',
              // Store the admin instance id as instancia_id so duplicates are scoped correctly
              instancia_id: adminNotificationInstanceId,
              phone_last8: last8Incoming,
              message_timestamp: messageTimestamp,
              message_hash: messageHash,
            });

          if (dedupError) {
            if (dedupError.code === '23505') {
              console.log('[Admin Instance] Duplicate webhook event detected; skipping keyword handler');
              isDuplicateAdmin = true;
            } else {
              console.error('[Admin Instance] Error inserting dedup record:', dedupError);
              // Fail-closed for keyword triggers: if we can't guarantee idempotency,
              // we prefer to skip rather than send duplicates.
              isDuplicateAdmin = true;
            }
          }
        }

        // Global keyword dedup (prevents double triggers across different tokens/instances)
        const canRun = await canRunKeywordTrigger({
          supabase,
          phoneLast8: last8Incoming,
          stableMessageId: messageId,
          messageText,
          messageTimestamp: messageTimestampRaw,
        });
        if (!canRun) {
          console.log('[Admin Instance] Global keyword dedup blocked; skipping keyword handler');
          isDuplicateAdmin = true;
        }

        console.log('[Admin Instance] Checking keyword triggers via admin-keyword-handler...');
        if (!isDuplicateAdmin) {
          fetch(`${supabaseUrl}/functions/v1/admin-keyword-handler`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              admin_instancia_id: adminNotificationInstanceId,
              phone: normalizedIncoming,
              message_text: messageText,
              chat_id: chatId,
            }),
          }).catch((err) => {
            console.error('[Admin Instance] Error calling keyword handler:', err?.message || err);
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Admin instance processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === Deduplicate webhook events to prevent double-counting unread messages ===
    const msgAny = normalizedPayload.message as any;
    const stableMessageId = extractStableMessageId(msgAny);
    const messageTimestamp = normalizedPayload.message!.messageTimestamp;
    // When we have a stable provider message id, we intentionally ignore timestamp drift
    // (providers can resend the same message with slightly different timestamps).
    const dedupTimestamp = stableMessageId ? 0 : messageTimestamp;
    const messageHash = stableMessageId
      ? `id:${stableMessageId}`
      : `text:${messageText?.substring(0, 80) || 'empty'}`;
    const last8Incoming = getLast8Digits(phone);
    
    // Try to insert a dedup record - if it already exists, skip incrementing unread
    let isDuplicate = false;
    if (last8Incoming && (dedupTimestamp || stableMessageId)) {
      const { error: dedupError } = await supabase
        .from('webhook_message_dedup')
        .insert({
          user_id: effectiveUserId,
          instancia_id: instanciaId || null,
          phone_last8: last8Incoming,
          message_timestamp: dedupTimestamp,
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
      fbCampaignInfo = await fetchFacebookCampaignInfo(supabase, effectiveUserId, earlyUtmData.fb_ad_id);
    }
    
    if (hasEarlyUtm) {
      console.log('Early UTM extraction successful:', earlyUtmData, 'FB Campaign:', fbCampaignInfo);
    }

    // NOTE: Keyword triggers are ONLY processed via admin notification instances.
    // The keyword check block that was here has been removed intentionally.
    // All keyword trigger logic now runs exclusively in the admin instance flow above (lines ~820-900).

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
            .eq('user_id', effectiveUserId)
            .is('deleted_at', null);

          // First try exact match by normalized_number (most reliable)
          let matchingChat = existingChats?.find(c => c.normalized_number === normalizedIncoming);
          
          // If no exact match, try by last 8 digits (handles format variations)
          if (!matchingChat) {
            matchingChat = existingChats?.find(c =>
              getLast8Digits(c.contact_number) === last8Incoming ||
              getLast8Digits(c.normalized_number) === last8Incoming ||
              getLast8Digits(c.chat_id) === last8Incoming
            );
          }

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
            const msgTimeMs = messageTimestamp > 9999999999 ? messageTimestamp : messageTimestamp * 1000;
            const msgTime = new Date(msgTimeMs).toISOString();
            const currentSenderType = isFromMe ? 'agent' : 'customer';
            const currentContent = messageText || '';
            
            // Check for edited messages: same sender, very similar content, within 2 minutes
            // WhatsApp sends edited messages as new messages with different IDs
            let isEditedMessage = false;
            const TWO_MINUTES_MS = 2 * 60 * 1000;
            const msgTimeDate = new Date(msgTimeMs);
            const twoMinAgo = new Date(msgTimeDate.getTime() - TWO_MINUTES_MS).toISOString();
            
            // Look for similar recent messages from same sender
            const { data: recentMessages } = await supabase
              .from('whatsapp_messages')
              .select('id, message_id, content, timestamp')
              .eq('chat_id', matchingChat.id)
              .eq('sender_type', currentSenderType)
              .gte('timestamp', twoMinAgo)
              .order('timestamp', { ascending: false })
              .limit(5);
            
            // Helper to check if two strings are similar (edit distance-like check)
            const isSimilarContent = (a: string, b: string): boolean => {
              if (!a || !b) return false;
              const aNorm = a.toLowerCase().replace(/\s+/g, ' ').trim();
              const bNorm = b.toLowerCase().replace(/\s+/g, ' ').trim();
              if (aNorm === bNorm) return true;
              // Check if one is a slight variation of the other (typo fix)
              const lenDiff = Math.abs(aNorm.length - bNorm.length);
              if (lenDiff > 3) return false; // Too different in length
              // Simple character overlap check
              const shorter = aNorm.length <= bNorm.length ? aNorm : bNorm;
              const longer = aNorm.length > bNorm.length ? aNorm : bNorm;
              let matches = 0;
              for (let i = 0; i < shorter.length; i++) {
                if (longer.includes(shorter[i])) matches++;
              }
              return matches >= shorter.length * 0.8; // 80% character overlap
            };
            
            // Check if this is an edited message
            if (recentMessages && recentMessages.length > 0) {
              for (const recent of recentMessages) {
                if (recent.message_id === messageId) continue; // Same message ID, skip
                if (isSimilarContent(recent.content, currentContent)) {
                  // This looks like an edit - update the existing message instead
                  console.log('[WhatsApp] Detected edited message, updating existing:', recent.id);
                  const { error: updateError } = await supabase
                    .from('whatsapp_messages')
                    .update({ 
                      content: currentContent, 
                      message_id: messageId, // Update to new message ID
                      timestamp: msgTime 
                    })
                    .eq('id', recent.id);
                  
                  if (updateError) {
                    console.error('Error updating edited message:', updateError);
                  } else {
                    isEditedMessage = true;
                  }
                  break;
                }
              }
            }

            // Only insert if this is not an edited message
            if (!isEditedMessage) {
              const { error: msgInsertError } = await supabase
                .from('whatsapp_messages')
                .insert({
                  chat_id: matchingChat.id,
                  message_id: messageId,
                  content: currentContent,
                  sender_type: currentSenderType,
                  media_type: mediaPlaceholder ? normalizeMediaType(anyMsg?.mediaType, anyMsg?.messageType) : null,
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
                  // Include quoted message info
                  quoted_message_id: quotedMessageId,
                  quoted_content: quotedContent,
                  quoted_sender_type: quotedSenderType,
                });

              if (msgInsertError) {
                // If it's a duplicate, that's ok - just log it
                if ((msgInsertError as any).code === '23505') {
                  console.log('Message already exists (duplicate):', messageId);
                } else {
                  console.error('Error saving WhatsApp message:', msgInsertError, 'chat_id:', matchingChat.id, 'message_id:', messageId);
                }
              } else {
                console.log('Saved WhatsApp message:', messageId, 'to chat:', matchingChat.id);
              }
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
              .eq('user_id', effectiveUserId)
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
                .eq('user_id', effectiveUserId)
                .eq('phone_last8', last8Incoming);

              // Create a brand new chat with history_cleared_at set
              let chatIdForMessage: string | null = null;

              const { data: newChat, error: createError } = await supabase
                .from('whatsapp_chats')
                .insert({
                  user_id: effectiveUserId,
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
                    .eq('user_id', effectiveUserId)
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
                const rawMessageId = anyMsg?.messageid || anyMsg?.id;
                const messageId = normalizeProviderMessageId(rawMessageId) || `msg_${Date.now()}`;

                const { error: msgInsertError } = await supabase
                  .from('whatsapp_messages')
                  .upsert({
                    chat_id: chatIdForMessage,
                    message_id: messageId,
                    content: messageText || '',
                    sender_type: isFromMe ? 'agent' : 'customer',
                    media_type: mediaPlaceholder ? normalizeMediaType(anyMsg?.mediaType, anyMsg?.messageType) : null,
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
              
              // NOTE: Do NOT return here - we must continue to lead creation logic below
            }

            // No tombstone - create chat normally
            let chatIdForMessage: string | null = null;

            const { data: newChat, error: createError } = await supabase
              .from('whatsapp_chats')
              .insert({
                user_id: effectiveUserId,
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
                  .eq('user_id', effectiveUserId)
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
              const rawMessageId = anyMsg?.messageid || anyMsg?.id;
              const messageId = normalizeProviderMessageId(rawMessageId) || `msg_${Date.now()}`;

              const { error: msgInsertError } = await supabase
                .from('whatsapp_messages')
                .insert({
                  chat_id: chatIdForMessage,
                  message_id: messageId,
                  content: messageText || '',
                  sender_type: isFromMe ? 'agent' : 'customer',
                  media_type: mediaPlaceholder ? normalizeMediaType(anyMsg?.mediaType, anyMsg?.messageType) : null,
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
                });

              if (msgInsertError) {
                if ((msgInsertError as any).code === '23505') {
                  console.log('First message already exists (duplicate):', messageId);
                } else {
                  console.error('Error saving first WhatsApp message:', msgInsertError, 'chat_id:', chatIdForMessage, 'message_id:', messageId);
                }
              } else {
                console.log('Saved first WhatsApp message:', messageId, 'to new chat:', chatIdForMessage);
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
            .eq('user_id', effectiveUserId)
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
                sender_type: isFromMe ? 'agent' : 'customer',
                media_type: mediaPlaceholder ? normalizeMediaType(anyMsg?.mediaType, anyMsg?.messageType) : null,
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
                // Include quoted message info
                quoted_message_id: quotedMessageId,
                quoted_content: quotedContent,
                quoted_sender_type: quotedSenderType,
              }, { onConflict: 'chat_id,message_id', ignoreDuplicates: true });

            if (msgInsertError) {
              console.error('Error saving Disparos message:', msgInsertError);
            } else {
              console.log('Saved Disparos message with UTM:', messageId, hasEarlyUtm ? earlyUtmData : '(no UTM)');
            }

            // === Auto-move kanban card on first customer reply ===
            // Only runs when the message is FROM the customer (not from us/agent)
            if (!isFromMe && !wasSentByApi && !isOutboundBySender) {
              try {
                // Check if user has auto-move configured
                const { data: kanbanConfig } = await supabase
                  .from('disparos_kanban_config')
                  .select('auto_move_column_id')
                  .eq('user_id', effectiveUserId)
                  .maybeSingle();

                if (kanbanConfig?.auto_move_column_id) {
                  // Check if the chat has a kanban entry and whether it was already auto-moved
                  const { data: kanbanEntry } = await supabase
                    .from('disparos_chat_kanban')
                    .select('id, column_id, first_reply_moved')
                    .eq('chat_id', matchingDisparosChat.id)
                    .maybeSingle();

                  if (!kanbanEntry) {
                    // Chat has no kanban entry yet - create one and move to configured column
                    const { error: insertErr } = await supabase
                      .from('disparos_chat_kanban')
                      .insert({
                        user_id: effectiveUserId,
                        chat_id: matchingDisparosChat.id,
                        column_id: kanbanConfig.auto_move_column_id,
                        first_reply_moved: true,
                      });
                    if (insertErr) {
                      console.error('[AutoMove] Error inserting kanban entry:', insertErr);
                    } else {
                      console.log('[AutoMove] Chat auto-moved (new entry) to column', kanbanConfig.auto_move_column_id);
                    }
                  } else if (!kanbanEntry.first_reply_moved) {
                    // Chat already exists in kanban but was NOT yet auto-moved - move it now
                    const { error: updateErr } = await supabase
                      .from('disparos_chat_kanban')
                      .update({
                        column_id: kanbanConfig.auto_move_column_id,
                        first_reply_moved: true,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', kanbanEntry.id);
                    if (updateErr) {
                      console.error('[AutoMove] Error updating kanban entry:', updateErr);
                    } else {
                      console.log('[AutoMove] Chat auto-moved (existing entry) to column', kanbanConfig.auto_move_column_id);
                    }
                  } else {
                    console.log('[AutoMove] Chat already auto-moved once, skipping.');
                  }
                }
              } catch (autoMoveError) {
                console.error('[AutoMove] Unexpected error during auto-move:', autoMoveError);
              }
            }
          } else if (instanciaId) {
            // Chat doesn't exist for this instance - check tombstone first
            const { data: tombstone } = await supabase
              .from('disparos_chat_deletions')
              .select('deleted_at')
              .eq('user_id', effectiveUserId)
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
                .eq('user_id', effectiveUserId)
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
                user_id: effectiveUserId,
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
                    .eq('user_id', effectiveUserId)
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
                    sender_type: isFromMe ? 'agent' : 'customer',
                  media_type: mediaPlaceholder ? normalizeMediaType(anyMsgLocal?.mediaType, anyMsgLocal?.messageType) : null,
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
                user_id: effectiveUserId,
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
                  .eq('user_id', effectiveUserId)
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
                  sender_type: isFromMe ? 'agent' : 'customer',
                  media_type: mediaPlaceholder ? normalizeMediaType(anyMsg?.mediaType, anyMsg?.messageType) : null,
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
      .eq('id', effectiveUserId)
      .maybeSingle();

    if (profileError) {
      console.error('Error fetching user profile:', profileError);
      await logEvent(effectiveUserId, 'error', `Erro ao buscar perfil do usuário: ${profileError.message}`);
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
      await logEvent(effectiveUserId, 'info', `Mensagem anterior à criação do usuário ignorada: ${name} (${phone})`);
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
      await logEvent(effectiveUserId, 'info', `Dados de anúncio CTWA detectados: ${JSON.stringify(referral)}`);
      
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
      await logEvent(effectiveUserId, 'info', `Dados de anúncio CTWA (UAZAPI) detectados: ${JSON.stringify(externalAdReply)}`);

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
          await logEvent(effectiveUserId, 'info', `CTWA payload decodificado: adId=${adId}`);
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
      leadFbCampaignInfo = await fetchFacebookCampaignInfo(supabase, effectiveUserId, utmData.fb_ad_id);
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
      .eq('user_id', effectiveUserId);

    if (searchError) {
      console.error('Error searching for existing leads:', searchError);
      await logEvent(effectiveUserId, 'error', `Erro ao buscar leads existentes: ${searchError.message}`);
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
      await logEvent(effectiveUserId, 'info', `Contato já é cliente: ${name} (${phone})`);
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
        await logEvent(effectiveUserId, 'error', `Erro ao restaurar lead: ${restoreError.message}`);
        return new Response(
          JSON.stringify({ error: 'Failed to restore lead', details: restoreError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Lead restored successfully from webhook (keeping original created_at):', matchingLead.id);
      await logEvent(effectiveUserId, 'info', `Lead restaurado com dados originais: ${name} (ID: ${matchingLead.id})`);

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
        await logEvent(effectiveUserId, 'info', `Dados UTM adicionados ao lead existente: ${JSON.stringify(utmData)}`);
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
        await logEvent(effectiveUserId, 'error', `Erro ao atualizar lead: ${updateError.message}`);
        return new Response(
          JSON.stringify({ error: 'Failed to update lead', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await logEvent(effectiveUserId, 'info', `Lead atualizado: ${name} (${phone})`);
      return new Response(
        JSON.stringify({ message: 'Lead updated successfully', lead_id: matchingLead.id, action: 'updated' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Não existe -> criar
    console.log('No matching lead found, creating new lead...');
    await logEvent(effectiveUserId, 'info', `Criando novo lead para ${name} (${phone})`);

    // If no UTM data from referral, try to detect ad mention in message text
    let finalUtmData = { ...utmData };
    let adDetectedFromText = false;
    
    if (!utmData.utm_source && messageText) {
      const adDetection = detectAdMentionInText(messageText);
      if (adDetection.isFromAd) {
        console.log('Ad mention detected in message text:', adDetection.source);
        finalUtmData.utm_source = adDetection.source || 'facebook';
        finalUtmData.utm_medium = 'cpc';
        finalUtmData.utm_campaign = 'Detectado por I.A';
        adDetectedFromText = true;
        await logEvent(effectiveUserId, 'info', `Anúncio detectado no texto: "${messageText.substring(0, 50)}..."`);
      }
    }

    const observacoes = messageText 
      ? `Primeira mensagem: ${messageText}${adDetectedFromText ? ' [Anúncio detectado por I.A]' : ''}`
      : `Contato recebido via ${leadOrigem}`;

    const { data: newLead, error: insertError } = await supabase
      .from('leads')
      .insert({
        user_id: effectiveUserId,
        nome: name,
        telefone: normalizedIncoming,
        procedimento_nome: `Contato via ${leadOrigem}`,
        origem: leadOrigem,
        observacoes,
        status: 'lead',
        origem_lead: true,
        data_contato: today,
        instancia_nome: instanciaNome,
        respondeu: true, // Lead created from incoming message = already responded
        // UTM data from Click-to-WhatsApp ads (or detected from text)
        utm_source: finalUtmData.utm_source,
        utm_campaign: finalUtmData.utm_campaign,
        utm_medium: finalUtmData.utm_medium,
        utm_content: finalUtmData.utm_content,
        utm_term: finalUtmData.utm_term,
        fbclid: finalUtmData.fbclid,
        // Facebook Ad enriched data
        fb_ad_id: finalUtmData.fb_ad_id,
        fb_campaign_id: finalUtmData.fb_campaign_id,
        fb_campaign_name: finalUtmData.fb_campaign_name,
        fb_adset_id: finalUtmData.fb_adset_id,
        fb_adset_name: finalUtmData.fb_adset_name,
        fb_ad_name: finalUtmData.fb_ad_name,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating lead:', insertError);
      await logEvent(effectiveUserId, 'error', `Erro ao criar lead: ${insertError.message}`, { name, phone, normalizedIncoming });
      return new Response(
        JSON.stringify({ error: 'Failed to create lead', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Lead created successfully from webhook:', newLead.id);
    await logEvent(effectiveUserId, 'info', `Lead criado com sucesso: ${name} (ID: ${newLead.id})`);

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
