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

    const { ad_id } = await req.json();
    if (!ad_id) {
      throw new Error('ad_id is required');
    }

    console.log('Fetching Facebook ad info for:', ad_id);

    // Get user's Facebook access token
    const { data: fbConfig, error: configError } = await supabase
      .from('facebook_config')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle();

    if (configError || !fbConfig?.access_token) {
      throw new Error('Facebook não configurado. Configure o token em Métricas de Campanhas.');
    }

    const accessToken = fbConfig.access_token;

    // Fetch ad info including campaign id/name, adset id/name, creative details
    const adUrl = `https://graph.facebook.com/v22.0/${ad_id}?fields=name,status,campaign{id,name,status},adset{id,name,status},creative{id,name,title,body,thumbnail_url,image_url,object_story_spec}&access_token=${accessToken}`;
    
    console.log('Calling Facebook API...');
    const response = await fetch(adUrl);
    const data = await response.json();

    if (data.error) {
      console.error('Facebook API error:', data.error);
      throw new Error(data.error.message || 'Erro ao buscar dados do Facebook');
    }

    // Extract thumbnail from creative
    let thumbnailUrl = null;
    if (data.creative) {
      thumbnailUrl = data.creative.thumbnail_url || data.creative.image_url || null;
      
      // If no direct thumbnail, try to get from object_story_spec
      if (!thumbnailUrl && data.creative.object_story_spec) {
        const story = data.creative.object_story_spec;
        if (story.link_data?.image_hash || story.link_data?.picture) {
          thumbnailUrl = story.link_data.picture || null;
        }
        if (story.video_data?.image_url) {
          thumbnailUrl = story.video_data.image_url;
        }
      }
    }

    const result = {
      ad_id: ad_id,
      ad_name: data.name || null,
      ad_status: data.status || null,
      campaign_id: data.campaign?.id || null,
      campaign_name: data.campaign?.name || null,
      campaign_status: data.campaign?.status || null,
      adset_id: data.adset?.id || null,
      adset_name: data.adset?.name || null,
      adset_status: data.adset?.status || null,
      thumbnail_url: thumbnailUrl,
      creative_title: data.creative?.title || null,
      creative_body: data.creative?.body || null,
    };

    console.log('Facebook ad info fetched:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-facebook-ad-info:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});