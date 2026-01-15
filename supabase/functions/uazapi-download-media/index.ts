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

    const { messageId, returnBase64, generateMp3, returnLink, transcribe, downloadQuoted, instanciaId, mediaType } = await req.json();
    if (!messageId) {
      throw new Error('messageId is required');
    }

    console.log('Downloading media for message:', messageId, 'instanciaId:', instanciaId);

    let config: { base_url: string; api_key: string } | null = null;

    // If instanciaId is provided, try to get from disparos_instancias first
    if (instanciaId) {
      const { data: disparosConfig, error: disparosError } = await supabase
        .from('disparos_instancias')
        .select('base_url, api_key')
        .eq('id', instanciaId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (!disparosError && disparosConfig) {
        config = disparosConfig;
        console.log('Using disparos_instancias config');
      }
    }

    // Fallback to uazapi_config if no config found
    if (!config) {
      const { data: uazapiConfig, error: configError } = await supabase
        .from('uazapi_config')
        .select('base_url, api_key')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (configError || !uazapiConfig) {
        throw new Error('UAZapi não configurado');
      }
      config = uazapiConfig;
      console.log('Using uazapi_config');
    }

    // At this point config is guaranteed to be non-null
    const base_url = config!.base_url;
    const api_key = config!.api_key;

    const mediaTypeStr = (mediaType ?? '').toString().toLowerCase();
    const isAudio = mediaTypeStr === 'audio' || mediaTypeStr === 'ptt' || mediaTypeStr.startsWith('audio');

    const candidateIds = Array.from(
      new Set([
        messageId,
        messageId.includes(':') ? messageId.split(':').pop() : null,
      ].filter(Boolean))
    ) as string[];

    const attemptConfigs = [
      // Respect request flags if provided
      {
        return_base64: returnBase64 !== false,
        generate_mp3: generateMp3 || false,
        return_link: returnLink || false,
      },
      // Hard default
      {
        return_base64: true,
        generate_mp3: false,
        return_link: false,
      },
      ...(isAudio
        ? [
            // Many providers are more stable returning MP3 for audio
            { return_base64: true, generate_mp3: true, return_link: false },
            // As a last resort, request a link instead of base64
            { return_base64: false, generate_mp3: false, return_link: true },
          ]
        : [
            // Fallback for non-audio: try link
            { return_base64: false, generate_mp3: false, return_link: true },
          ]),
    ];

    let result: any | null = null;
    let lastError: string | null = null;

    for (const id of candidateIds) {
      for (const cfg of attemptConfigs) {
        console.log('Trying download with id:', id, 'options:', cfg);

        const response = await fetch(`${base_url}/message/download`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'token': api_key,
          },
          body: JSON.stringify({
            id,
            ...cfg,
            transcribe: transcribe || false,
            download_quoted: downloadQuoted || false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          lastError = `${response.status} ${errorText}`;
          console.error('UAZapi download error:', response.status, errorText);
          continue;
        }

        try {
          result = await response.json();
        } catch (e) {
          lastError = 'Failed to parse JSON from provider';
          console.error('Failed to parse JSON from provider:', e);
          continue;
        }

        console.log('Media download API response keys:', Object.keys(result ?? {}));
        break;
      }

      if (result) break;
    }

    if (!result) {
      throw new Error(`UAZapi download failed: ${lastError ?? 'unknown error'}`);
    }

    // Normalize the response to always provide fileURL and mimetype
    // UAZapi may return different field names depending on options
    let fileURL: string | null = null;
    let mimetype: string | null = null;

    // Check various possible field names from provider response
    // Priority: base64 data URI > direct URL
    if ((result.base64Data || result.base64_data) && result.mimetype) {
      const b64 = (result.base64Data || result.base64_data) as string;
      fileURL = b64.startsWith('data:') ? b64 : `data:${result.mimetype};base64,${b64}`;
      mimetype = result.mimetype;
    } else if (result.base64 && result.mimetype) {
      // Build a data URI from base64
      fileURL = `data:${result.mimetype};base64,${result.base64}`;
      mimetype = result.mimetype;
    } else if (result.fileURL) {
      fileURL = result.fileURL;
      mimetype = result.mimetype || result.mimeType || 'application/octet-stream';
    } else if (result.fileUrl) {
      fileURL = result.fileUrl;
      mimetype = result.mimetype || result.mimeType || 'application/octet-stream';
    } else if (result.url) {
      fileURL = result.url;
      mimetype = result.mimetype || result.mimeType || 'application/octet-stream';
    } else if ((result.data?.base64Data || result.data?.base64_data) && result.data?.mimetype) {
      const b64 = (result.data.base64Data || result.data.base64_data) as string;
      fileURL = b64.startsWith('data:') ? b64 : `data:${result.data.mimetype};base64,${b64}`;
      mimetype = result.data.mimetype;
    } else if (result.data?.base64 && result.data?.mimetype) {
      // Nested format
      fileURL = `data:${result.data.mimetype};base64,${result.data.base64}`;
      mimetype = result.data.mimetype;
    } else if (result.data?.url) {
      fileURL = result.data.url;
      mimetype = result.data.mimetype || result.data.mimeType || 'application/octet-stream';
    }

    // If we still don't have a URL, log the full result for debugging
    if (!fileURL) {
      console.error('Could not extract media URL from response:', JSON.stringify(result));
      throw new Error('Could not extract media URL from response');
    }

    console.log('Media downloaded successfully, mimetype:', mimetype);

    return new Response(
      JSON.stringify({ fileURL, mimetype }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in uazapi-download-media:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
