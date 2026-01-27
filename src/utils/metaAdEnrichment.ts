import { supabase } from "@/integrations/supabase/client";

export type MetaAdInfo = {
  fb_ad_id: string;
  fb_campaign_name: string | null;
  fb_adset_name: string | null;
  fb_ad_name: string | null;
  ad_thumbnail_url: string | null;
};

type CachedAdInfo = MetaAdInfo & {
  cached_at: number;
};

const CACHE_KEY_PREFIX = "meta_ad_cache_";
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory cache for current session (fast lookup)
const memoryCache = new Map<string, MetaAdInfo>();

const getCacheKey = (adId: string) => `${CACHE_KEY_PREFIX}${adId}`;

const getFromLocalStorage = (adId: string): MetaAdInfo | null => {
  try {
    const cached = localStorage.getItem(getCacheKey(adId));
    if (!cached) return null;
    
    const parsed: CachedAdInfo = JSON.parse(cached);
    const age = Date.now() - parsed.cached_at;
    
    // Check if cache is still valid (30 days)
    if (age > CACHE_DURATION_MS) {
      localStorage.removeItem(getCacheKey(adId));
      return null;
    }
    
    // Return without cached_at field
    const { cached_at, ...info } = parsed;
    return info;
  } catch {
    return null;
  }
};

const saveToLocalStorage = (adId: string, info: MetaAdInfo) => {
  try {
    const cached: CachedAdInfo = {
      ...info,
      cached_at: Date.now(),
    };
    localStorage.setItem(getCacheKey(adId), JSON.stringify(cached));
  } catch {
    // localStorage might be full or disabled - ignore
  }
};

export const parseMetaAdId = (value?: string | null): string | null => {
  if (!value) return null;
  const v = String(value).trim();
  // Meta IDs são numéricos e longos.
  if (/^\d{8,}$/.test(v)) return v;
  return null;
};

export const fetchMetaAdInfo = async (adId: string): Promise<MetaAdInfo | null> => {
  // 1. Check memory cache first (fastest)
  const memoryCached = memoryCache.get(adId);
  if (memoryCached) return memoryCached;

  // 2. Check localStorage (persists 30 days)
  const storageCached = getFromLocalStorage(adId);
  if (storageCached) {
    memoryCache.set(adId, storageCached); // Warm up memory cache
    return storageCached;
  }

  // 3. Fetch from API
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const resp = await supabase.functions.invoke("fetch-facebook-ad-info", {
    headers: { Authorization: `Bearer ${token}` },
    body: { ad_id: adId },
  });

  if (resp.error || !resp.data) return null;

  const r: any = resp.data;
  const info: MetaAdInfo = {
    fb_ad_id: String(r.ad_id ?? adId),
    fb_campaign_name: r.campaign_name ?? null,
    fb_adset_name: r.adset_name ?? null,
    fb_ad_name: r.ad_name ?? null,
    ad_thumbnail_url: r.thumbnail_url ?? null,
  };

  // Save to both caches
  memoryCache.set(adId, info);
  saveToLocalStorage(adId, info);
  
  return info;
};
