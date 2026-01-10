import { supabase } from "@/integrations/supabase/client";

export type MetaAdInfo = {
  fb_ad_id: string;
  fb_campaign_name: string | null;
  fb_adset_name: string | null;
  fb_ad_name: string | null;
  ad_thumbnail_url: string | null;
};

const metaAdCache = new Map<string, MetaAdInfo>();

export const parseMetaAdId = (value?: string | null): string | null => {
  if (!value) return null;
  const v = String(value).trim();
  // Meta IDs são numéricos e longos.
  if (/^\d{8,}$/.test(v)) return v;
  return null;
};

export const fetchMetaAdInfo = async (adId: string): Promise<MetaAdInfo | null> => {
  const cached = metaAdCache.get(adId);
  if (cached) return cached;

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

  metaAdCache.set(adId, info);
  return info;
};
