import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SocialMediaOptions {
  facebooks: boolean;
  instagrams: boolean;
  tiktoks: boolean;
  twitters: boolean;
  youtubes: boolean;
}

interface FilterOptions {
  scrapeSocialMediaProfiles?: SocialMediaOptions;
  placeMinimumStars?: string;
  websiteFilter?: string;
  searchMatching?: string;
  searchQuery?: string;
  scrapeContacts?: boolean;
}

interface StartBody {
  searchStringsArray: string[];
  locationQuery: string;
  maxCrawledPlacesPerSearch?: number;
  language?: string;
  skipClosedPlaces?: boolean;
  scrapeContacts?: boolean;
  scrapePlaceDetailPage?: boolean;
  scrapeSocialMediaProfiles?: SocialMediaOptions;
  placeMinimumStars?: string;
  website?: string;
  searchMatching?: string;
}

interface StatusBody {
  runId: string;
  filters?: FilterOptions;
}

type RequestBody = Partial<StartBody> & Partial<StatusBody>;

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Convert star filter string to numeric value
function getMinRating(placeMinimumStars?: string): number {
  if (!placeMinimumStars) return 0;
  const starMap: Record<string, number> = {
    "two": 2,
    "twoAndHalf": 2.5,
    "three": 3,
    "threeAndHalf": 3.5,
    "four": 4,
    "fourAndHalf": 4.5,
  };
  return starMap[placeMinimumStars] || 0;
}

function mapAndFilterBusinesses(results: any[], requestId: string, filters?: FilterOptions) {
  console.log(`[${requestId}] Raw results count: ${results?.length || 0}`);
  console.log(`[${requestId}] Applied filters:`, filters);
  
  if (results?.length) {
    console.log(`[${requestId}] Sample raw item keys:`, Object.keys(results[0] || {}));
    const sample = results[0];
    console.log(`[${requestId}] Sample data:`, {
      totalScore: sample.totalScore,
      website: sample.website,
      title: sample.title,
      facebooks: sample.facebooks,
      instagrams: sample.instagrams,
    });
  }

  const socialMediaOptions = filters?.scrapeSocialMediaProfiles;
  const minRating = getMinRating(filters?.placeMinimumStars);
  const websiteFilter = filters?.websiteFilter || "allPlaces";
  const searchMatching = filters?.searchMatching || "all";
  const searchQuery = (filters?.searchQuery || "").toLowerCase().trim();
  const scrapeContacts = filters?.scrapeContacts !== false;

  let filtered = (results || [])
    .map((item: any) => {
      const rating = item.totalScore || item.rating || null;
      const website = item.website || "";
      const name = item.title || item.name || "";
      
      const business: any = {
        name,
        phone: scrapeContacts ? (item.phone || item.phoneUnformatted || "") : "",
        email: scrapeContacts ? (Array.isArray(item.emails) ? item.emails[0] || "" : item.email || "") : "",
        address: item.address || item.street || "",
        category: item.categoryName || item.categories?.[0] || "",
        rating,
        reviewCount: item.reviewsCount || item.reviews || null,
        website,
        // Store raw for filtering
        _rawName: name,
        _hasWebsite: !!website,
      };

      // Apply social media filters
      if (!socialMediaOptions || socialMediaOptions.facebooks) {
        business.facebook = Array.isArray(item.facebooks) ? item.facebooks[0] || "" : item.facebookUrl || "";
      } else {
        business.facebook = "";
      }

      if (!socialMediaOptions || socialMediaOptions.instagrams) {
        business.instagram = Array.isArray(item.instagrams) ? item.instagrams[0] || "" : item.instagramUrl || "";
      } else {
        business.instagram = "";
      }

      if (!socialMediaOptions || socialMediaOptions.twitters) {
        business.twitter = Array.isArray(item.twitters) ? item.twitters[0] || "" : item.twitterUrl || "";
      } else {
        business.twitter = "";
      }

      if (!socialMediaOptions || socialMediaOptions.youtubes) {
        business.youtube = Array.isArray(item.youtubes) ? item.youtubes[0] || "" : item.youtubeUrl || "";
      } else {
        business.youtube = "";
      }

      if (!socialMediaOptions || socialMediaOptions.tiktoks) {
        business.tiktok = Array.isArray(item.tiktoks) ? item.tiktoks[0] || "" : item.tiktokUrl || "";
      } else {
        business.tiktok = "";
      }

      return business;
    })
    .filter((b: any) => b.name);

  const beforeFilterCount = filtered.length;

  // Apply minimum rating filter
  if (minRating > 0) {
    filtered = filtered.filter((b: any) => {
      const rating = b.rating || 0;
      return rating >= minRating;
    });
    console.log(`[${requestId}] After rating filter (min ${minRating}): ${filtered.length}/${beforeFilterCount}`);
  }

  // Apply website filter
  if (websiteFilter === "withWebsite") {
    filtered = filtered.filter((b: any) => b._hasWebsite);
    console.log(`[${requestId}] After website filter (withWebsite): ${filtered.length}`);
  } else if (websiteFilter === "withoutWebsite") {
    filtered = filtered.filter((b: any) => !b._hasWebsite);
    console.log(`[${requestId}] After website filter (withoutWebsite): ${filtered.length}`);
  }

  // Apply search matching filter
  if (searchQuery && searchMatching !== "all") {
    if (searchMatching === "only_includes") {
      filtered = filtered.filter((b: any) => {
        const name = (b._rawName || "").toLowerCase();
        return name.includes(searchQuery);
      });
      console.log(`[${requestId}] After searchMatching (only_includes): ${filtered.length}`);
    } else if (searchMatching === "only_exact") {
      filtered = filtered.filter((b: any) => {
        const name = (b._rawName || "").toLowerCase();
        return name === searchQuery;
      });
      console.log(`[${requestId}] After searchMatching (only_exact): ${filtered.length}`);
    }
  }

  // Remove internal fields
  return filtered.map((b: any) => {
    const { _rawName, _hasWebsite, ...clean } = b;
    return clean;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const requestId = crypto.randomUUID();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ success: false, error: "Não autorizado" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error(`[${requestId}] Missing env vars`);
      return jsonResponse({ success: false, error: "Configuração do servidor incompleta" });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error(`[${requestId}] Auth error`, authError);
      return jsonResponse({ success: false, error: "Token inválido" });
    }

    const body: RequestBody = await req.json();

    const { data: apifyConfig, error: configError } = await supabase
      .from("apify_config")
      .select("api_key")
      .eq("user_id", user.id)
      .single();

    if (configError || !apifyConfig?.api_key) {
      console.error(`[${requestId}] Apify config error`, configError);
      return jsonResponse({
        success: false,
        error: "API Key do Apify não configurada. Configure em Configurações → Conexões.",
      });
    }

    const actorId = "compass~crawler-google-places";
    const apiKey = apifyConfig.api_key;

    // MODE 1: status check
    if (body.runId) {
      const runId = body.runId;
      const filters = body.filters;
      
      const statusResp = await fetch(
        `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(apiKey)}`,
      );

      if (!statusResp.ok) {
        const t = await statusResp.text();
        console.error(`[${requestId}] Run status error`, statusResp.status, t);
        return jsonResponse({ success: false, error: "Erro ao verificar status" });
      }

      const statusJson = await statusResp.json();
      const status = statusJson?.data?.status as string | undefined;

      if (!status) return jsonResponse({ success: false, error: "Status inválido" });

      if (status === "SUCCEEDED") {
        const datasetResp = await fetch(
          `https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}/dataset/items?token=${encodeURIComponent(apiKey)}&format=json`,
        );

        if (!datasetResp.ok) {
          const t = await datasetResp.text();
          console.error(`[${requestId}] Dataset fetch error`, datasetResp.status, t);
          return jsonResponse({ success: false, error: "Erro ao obter resultados" });
        }

        const results = await datasetResp.json();
        const businesses = mapAndFilterBusinesses(results, requestId, filters);
        return jsonResponse({ success: true, done: true, status, data: businesses, total: businesses.length });
      }

      if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
        return jsonResponse({
          success: false,
          done: true,
          status,
          error: `Extração falhou: ${status}`,
        });
      }

      // READY / RUNNING
      return jsonResponse({ success: true, done: false, status });
    }

    // MODE 2: start run
    const {
      searchStringsArray,
      locationQuery,
      maxCrawledPlacesPerSearch = 20,
      language = "pt-BR",
      skipClosedPlaces = false,
      scrapeContacts = true,
      scrapePlaceDetailPage = true,
      scrapeSocialMediaProfiles = {
        facebooks: true,
        instagrams: true,
        tiktoks: false,
        twitters: false,
        youtubes: false,
      },
      placeMinimumStars,
      website = "allPlaces",
      searchMatching = "all",
    } = body as StartBody;

    if (!searchStringsArray?.length || !locationQuery) {
      return jsonResponse({ success: false, error: "Busca e localização são obrigatórios" });
    }

    const actorInput: Record<string, unknown> = {
      includeWebResults: false,
      language,
      locationQuery,
      maxCrawledPlacesPerSearch,
      maxImages: 0,
      maximumLeadsEnrichmentRecords: 0,
      scrapeContacts,
      scrapeDirectories: false,
      scrapeImageAuthors: false,
      scrapePlaceDetailPage,
      scrapeReviewsPersonalData: true,
      scrapeSocialMediaProfiles,
      scrapeTableReservationProvider: false,
      searchStringsArray,
      skipClosedPlaces,
      // These filters are also passed to Apify but we'll double-check in post-processing
      website,
      searchMatching,
    };

    if (placeMinimumStars) actorInput.placeMinimumStars = placeMinimumStars;

    console.log(`[${requestId}] Starting run`, JSON.stringify(actorInput));

    const startResp = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?token=${encodeURIComponent(apiKey)}&waitForFinish=0`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorInput),
      },
    );

    if (!startResp.ok) {
      const t = await startResp.text();
      console.error(`[${requestId}] Apify start error`, startResp.status, t);

      if (startResp.status === 401) {
        return jsonResponse({
          success: false,
          error: "API Key do Apify inválida. Verifique sua chave em Configurações → Conexões.",
        });
      }

      return jsonResponse({ success: false, error: `Erro ao iniciar extração: ${startResp.status}` });
    }

    const startJson = await startResp.json();
    const runId = startJson?.data?.id as string | undefined;

    if (!runId) {
      console.error(`[${requestId}] No runId returned`, startJson);
      return jsonResponse({ success: false, error: "Erro ao obter ID da extração" });
    }

    return jsonResponse({ success: true, runId });
  } catch (error) {
    console.error(`[${requestId}] Error in apify-google-maps`, error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : "Erro interno",
    });
  }
});
