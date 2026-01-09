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

    const { messageId, returnBase64, generateMp3, returnLink, transcribe, downloadQuoted } = await req.json();
    
    if (!messageId) {
      throw new Error('messageId is required');
    }

    console.log('Downloading media for message:', messageId);

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

    // Download media from UAZapi
    const response = await fetch(`${config.base_url}/message/download`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'token': config.api_key,
      },
      body: JSON.stringify({ 
        id: messageId,
        return_base64: returnBase64 || false,
        generate_mp3: generateMp3 || false,
        return_link: returnLink || false,
        transcribe: transcribe || false,
        download_quoted: downloadQuoted || false,
      }),
    });

    if (!response.ok) {
      throw new Error(`UAZapi error: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Media downloaded successfully');

    return new Response(
      JSON.stringify(result),
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
