import { useEffect, useMemo, useState } from "react";
import { Megaphone, ChevronDown, ChevronUp, Maximize2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchMetaAdInfo, parseMetaAdId } from "@/utils/metaAdEnrichment";

interface Lead {
  id?: string;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_medium?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  fbclid?: string | null;
  gclid?: string | null;
  fb_campaign_name?: string | null;
  fb_adset_name?: string | null;
  fb_ad_name?: string | null;
  fb_ad_id?: string | null;
  ad_thumbnail_url?: string | null;
}

interface LeadCampaignBadgeProps {
  lead: Lead;
}

export function LeadCampaignBadge({ lead }: LeadCampaignBadgeProps) {
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [localLead, setLocalLead] = useState<Lead>(lead);

  useEffect(() => {
    setLocalLead(lead);
  }, [lead]);

  const hasAttribution = Boolean(localLead.utm_source || localLead.utm_campaign || localLead.fbclid || localLead.gclid);

  // Check if detected by AI (utm_campaign = "Detectado por I.A" or "Detectado por IA")
  const isDetectedByAI = localLead.utm_campaign === "Detectado por I.A" || localLead.utm_campaign === "Detectado por IA";

  const sourceInfo = useMemo(() => {
    // AI detected - show purple with "Anúncios" label
    if (isDetectedByAI) {
      return { label: "Anúncios", bgColor: "bg-purple-100 dark:bg-purple-900", textColor: "text-purple-700 dark:text-purple-300" };
    }
    if (localLead.utm_source === "facebook" || localLead.fbclid) {
      return { label: "Meta Ads", bgColor: "bg-blue-100 dark:bg-blue-900", textColor: "text-blue-700 dark:text-blue-300" };
    }
    if (localLead.gclid) {
      return { label: "Google Ads", bgColor: "bg-green-100 dark:bg-green-900", textColor: "text-green-700 dark:text-green-300" };
    }
    if (localLead.utm_source) {
      return { label: localLead.utm_source, bgColor: "bg-purple-100 dark:bg-purple-900", textColor: "text-purple-700 dark:text-purple-300" };
    }
    return { label: "Campanha", bgColor: "bg-gray-100 dark:bg-gray-800", textColor: "text-gray-700 dark:text-gray-300" };
  }, [localLead.utm_source, localLead.fbclid, localLead.gclid, isDetectedByAI]);

  // Enriquecer automaticamente quando temos ID do anúncio (ou utm_content numérico), mas faltam os nomes.
  useEffect(() => {
    const run = async () => {
      const isMeta = localLead.utm_source === "facebook" || Boolean(localLead.fbclid);
      if (!isMeta) return;

      const adId = localLead.fb_ad_id || parseMetaAdId(localLead.utm_content);
      if (!adId) return;

      const needs = !localLead.fb_campaign_name || !localLead.fb_adset_name || !localLead.fb_ad_name || !localLead.ad_thumbnail_url;
      if (!needs) return;

      const info = await fetchMetaAdInfo(adId);
      if (!info) return;

      const next: Lead = {
        ...localLead,
        fb_ad_id: localLead.fb_ad_id || info.fb_ad_id,
        fb_campaign_name: localLead.fb_campaign_name || info.fb_campaign_name,
        fb_adset_name: localLead.fb_adset_name || info.fb_adset_name,
        fb_ad_name: localLead.fb_ad_name || info.fb_ad_name,
        ad_thumbnail_url: localLead.ad_thumbnail_url || info.ad_thumbnail_url,
      };

      setLocalLead(next);

      if (localLead.id) {
        // Persistência para o card ficar sempre completo nas próximas aberturas.
        await supabase
          .from("leads")
          .update({
            fb_ad_id: next.fb_ad_id,
            fb_campaign_name: next.fb_campaign_name,
            fb_adset_name: next.fb_adset_name,
            fb_ad_name: next.fb_ad_name,
            ad_thumbnail_url: next.ad_thumbnail_url,
            utm_content: next.utm_content,
            utm_source: next.utm_source,
            utm_campaign: next.utm_campaign,
            utm_medium: next.utm_medium,
            utm_term: next.utm_term,
            fbclid: next.fbclid,
          })
          .eq("id", localLead.id);
      }
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localLead.id, localLead.utm_source, localLead.fbclid, localLead.fb_ad_id, localLead.utm_content]);

  if (!hasAttribution) return null;

  const textContent = localLead.utm_term || "";
  const isTextLong = textContent.length > 100;
  const displayText = isTextExpanded ? textContent : textContent.slice(0, 100);

  return (
    <>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              title="Ver detalhes da campanha"
            >
              <Megaphone className={`h-4 w-4 flex-shrink-0 ${isDetectedByAI ? 'text-purple-500' : 'text-blue-500'}`} />
              <span className={`text-xs px-2 py-0.5 rounded ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
                {sourceInfo.label}
              </span>
            </button>
          </PopoverTrigger>

          <PopoverContent
            className="w-[280px] sm:w-96 p-0 max-w-[calc(100vw-24px)]"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex flex-col h-[55vh] sm:h-auto sm:max-h-[70vh] min-h-0">
              <div className="flex items-center gap-2 p-2 sm:p-3 border-b bg-background shrink-0">
                <Megaphone className={`w-4 h-4 ${isDetectedByAI ? 'text-purple-500' : 'text-blue-500'}`} />
                <span className="font-semibold text-xs sm:text-sm">Origem do Anúncio</span>
              </div>

              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3 space-y-2 sm:space-y-3"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                {localLead.ad_thumbnail_url && (
                  <div className="relative group cursor-pointer" onClick={() => setIsImageModalOpen(true)}>
                    <img
                      src={localLead.ad_thumbnail_url}
                      alt="Thumbnail do anúncio"
                      className="w-full h-auto max-h-40 object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                      <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fonte:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
                    {sourceInfo.label}
                  </span>
                </div>

                {(localLead.fb_campaign_name || localLead.utm_campaign) && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Rastreamento:</span>
                    <div className={`${isDetectedByAI ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800' : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'} border rounded-md p-2`}>
                      <span className={`text-xs font-semibold break-words ${isDetectedByAI ? 'text-purple-700 dark:text-purple-300' : 'text-blue-700 dark:text-blue-300'}`}>
                        {localLead.fb_campaign_name || localLead.utm_campaign}
                      </span>
                    </div>
                  </div>
                )}

                {localLead.fb_adset_name && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Conjunto de Anúncios:</span>
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-green-700 dark:text-green-300 break-words">
                        {localLead.fb_adset_name}
                      </span>
                    </div>
                  </div>
                )}

                {localLead.fb_ad_name && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Nome do Anúncio:</span>
                    <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 break-words">
                        {localLead.fb_ad_name}
                      </span>
                    </div>
                  </div>
                )}

                {textContent && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Texto do Anúncio:</span>
                    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-2">
                      <span className="text-xs break-words whitespace-pre-wrap">
                        {displayText}
                        {isTextLong && !isTextExpanded && "..."}
                      </span>
                      {isTextLong && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsTextExpanded(!isTextExpanded);
                          }}
                          className="flex items-center gap-1 mt-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          {isTextExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              Mostrar menos
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              Mostrar mais
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Dados Técnicos
                  </span>

                  {(localLead.fb_ad_id || localLead.utm_content) && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">ID:</span>
                      <span className="text-[10px] font-mono text-right break-all max-w-[180px]">
                        {localLead.fb_ad_id || localLead.utm_content}
                      </span>
                    </div>
                  )}

                  {localLead.utm_medium && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Meio:</span>
                      <span className="text-xs">{localLead.utm_medium}</span>
                    </div>
                  )}

                  {localLead.fbclid && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">FBCLID:</span>
                      <span className="text-[10px] font-mono text-right break-all text-muted-foreground max-w-[160px]">
                        {localLead.fbclid}
                      </span>
                    </div>
                  )}

                  {localLead.gclid && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">GCLID:</span>
                      <span className="text-[10px] font-mono text-right break-all text-muted-foreground max-w-[160px]">
                        {localLead.gclid}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-blue-500" />
              Imagem do Anúncio
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {localLead.ad_thumbnail_url && (
              <img
                src={localLead.ad_thumbnail_url}
                alt="Imagem do anúncio em tamanho completo"
                className="w-full h-auto rounded-lg"
                onError={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const fallback = document.createElement('div');
                  fallback.className = 'flex flex-col items-center justify-center p-8 text-muted-foreground bg-muted rounded-lg';
                  fallback.innerHTML = '<p class="text-sm">A imagem do anúncio expirou ou não está disponível.</p><p class="text-xs mt-1">As imagens do Meta Ads possuem validade limitada.</p>';
                  target.parentElement?.appendChild(fallback);
                }}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
