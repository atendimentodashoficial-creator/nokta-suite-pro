import { useState, useEffect, useMemo } from "react";
import { Megaphone, ChevronLeft, ChevronRight, Calendar, Maximize2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/whatsapp";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchMetaAdInfo, parseMetaAdId } from "@/utils/metaAdEnrichment";

interface AttributionEntry {
  id: string;
  source: "meta" | "google" | "other";
  fb_ad_id: string | null;
  fb_ad_name: string | null;
  fb_campaign_name: string | null;
  fb_adset_name: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  ad_thumbnail_url: string | null;
  timestamp: string;
}

interface HeaderAttributionBadgeProps {
  contactNumber: string;
  chatId?: string;
}

export function HeaderAttributionBadge({ contactNumber, chatId }: HeaderAttributionBadgeProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [attributions, setAttributions] = useState<AttributionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadAttributions = async () => {
      if (!userId) {
        if (isMounted) {
          setIsLoading(false);
          setAttributions([]);
        }
        return;
      }

      setIsLoading(true);
      try {
        const last8Digits = getLast8Digits(contactNumber);
        if (!last8Digits || last8Digits.length < 8) {
          if (isMounted) setAttributions([]);
          return;
        }

        const allAttributions: AttributionEntry[] = [];
        const seenKeys = new Set<string>();

        // 1) WhatsApp messages
        let wpChatIds = chatId ? [chatId] : [];
        if (wpChatIds.length === 0) {
          const { data: wpChats } = await supabase
            .from("whatsapp_chats")
            .select("id, contact_number, normalized_number")
            .eq("user_id", userId)
            .or(`contact_number.like.%${last8Digits},normalized_number.like.%${last8Digits}`)
            .limit(20);

          wpChatIds = (wpChats || [])
            .filter((c) => getLast8Digits(c.contact_number || c.normalized_number || "") === last8Digits)
            .map((c) => c.id);
        }

        if (wpChatIds.length > 0) {
          const { data: wpMessages } = await supabase
            .from("whatsapp_messages")
            .select(
              "id, fb_ad_id, fb_ad_name, fb_campaign_name, fb_adset_name, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, ad_thumbnail_url, timestamp"
            )
            .in("chat_id", wpChatIds)
            .or("fb_ad_id.not.is.null,fbclid.not.is.null,utm_source.not.is.null")
            .order("timestamp", { ascending: false })
            .limit(50);

          for (const msg of wpMessages || []) {
            const key = msg.fb_ad_id || msg.fbclid || `${msg.utm_source}-${msg.utm_campaign}-${msg.timestamp}`;
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            allAttributions.push({
              id: msg.id,
              source: msg.fb_ad_id || msg.fbclid ? "meta" : "other",
              fb_ad_id: msg.fb_ad_id,
              fb_ad_name: msg.fb_ad_name,
              fb_campaign_name: msg.fb_campaign_name,
              fb_adset_name: msg.fb_adset_name,
              utm_source: msg.utm_source,
              utm_campaign: msg.utm_campaign,
              utm_medium: msg.utm_medium,
              utm_content: msg.utm_content,
              utm_term: msg.utm_term,
              fbclid: msg.fbclid,
              gclid: null,
              ad_thumbnail_url: msg.ad_thumbnail_url,
              timestamp: msg.timestamp,
            });
          }
        }

        // 2) Leads table
        const { data: leads } = await supabase
          .from("leads")
          .select(
            "id, fb_ad_id, fb_ad_name, fb_campaign_name, fb_adset_name, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, gclid, telefone, ad_thumbnail_url, created_at"
          )
          .eq("user_id", userId)
          .is("deleted_at", null)
          .like("telefone", `%${last8Digits}`)
          .order("created_at", { ascending: false })
          .limit(50);

        for (const lead of leads || []) {
          if (getLast8Digits(lead.telefone) !== last8Digits) continue;
          const hasAttribution = lead.fb_ad_id || lead.utm_source || lead.fbclid || lead.gclid;
          if (!hasAttribution) continue;

          const key = lead.fb_ad_id || lead.gclid || lead.fbclid || `${lead.utm_source}-${lead.utm_campaign}-${lead.created_at}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);

          allAttributions.push({
            id: lead.id,
            source: lead.gclid ? "google" : lead.fb_ad_id || lead.fbclid ? "meta" : "other",
            fb_ad_id: lead.fb_ad_id,
            fb_ad_name: lead.fb_ad_name,
            fb_campaign_name: lead.fb_campaign_name,
            fb_adset_name: lead.fb_adset_name,
            utm_source: lead.utm_source,
            utm_campaign: lead.utm_campaign,
            utm_medium: lead.utm_medium,
            utm_content: lead.utm_content,
            utm_term: lead.utm_term,
            fbclid: lead.fbclid,
            gclid: lead.gclid,
            ad_thumbnail_url: lead.ad_thumbnail_url,
            timestamp: lead.created_at || new Date().toISOString(),
          });
        }

        // 3) Enrich Meta Ads missing data
        for (let i = 0; i < allAttributions.length; i++) {
          const a = allAttributions[i];
          if (a.source !== "meta") continue;

          const adId = a.fb_ad_id || parseMetaAdId(a.utm_content);
          if (!adId) continue;

          const needs = !a.fb_campaign_name || !a.fb_adset_name || !a.fb_ad_name || !a.ad_thumbnail_url;
          if (!needs) continue;

          const info = await fetchMetaAdInfo(adId);
          if (info) {
            allAttributions[i] = {
              ...a,
              fb_ad_id: a.fb_ad_id || info.fb_ad_id,
              fb_ad_name: a.fb_ad_name || info.fb_ad_name,
              fb_campaign_name: a.fb_campaign_name || info.fb_campaign_name,
              fb_adset_name: a.fb_adset_name || info.fb_adset_name,
              ad_thumbnail_url: a.ad_thumbnail_url || info.ad_thumbnail_url,
            };
          }
        }

        if (!isMounted) return;

        // Sort by date (most recent first)
        allAttributions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setAttributions(allAttributions);
        setCurrentIndex(0);
      } catch (error) {
        console.error("Error loading campaign attributions:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadAttributions();
    return () => {
      isMounted = false;
    };
  }, [contactNumber, chatId, userId]);

  const hasAttribution = attributions.length > 0;
  const current = attributions[currentIndex];

  const isDetectedByAI = (campaign: string | null) => 
    campaign === "Detectado por I.A" || campaign === "Detectado por IA";

  const getSourceInfo = (attr: AttributionEntry) => {
    // Check if detected by AI
    if (isDetectedByAI(attr.utm_campaign)) {
      return { label: "Anúncios", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", isAI: true };
    }
    if (attr.source === "meta") return { label: "Meta Ads", className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300", isAI: false };
    if (attr.source === "google") return { label: "Google Ads", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300", isAI: false };
    if (attr.utm_source) return { label: attr.utm_source, className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300", isAI: false };
    return { label: "Campanha", className: "bg-muted text-foreground", isAI: false };
  };

  // Check if any attribution was detected by AI
  const hasAIDetection = attributions.some(attr => isDetectedByAI(attr.utm_campaign));
  const iconColorClass = hasAIDetection ? "text-purple-500" : "text-blue-500";

  const formatDate = (timestamp: string) => {
    try {
      return format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return timestamp;
    }
  };

  const goNext = () => setCurrentIndex((prev) => Math.min(prev + 1, attributions.length - 1));
  const goPrev = () => setCurrentIndex((prev) => Math.max(prev - 1, 0));

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            title={hasAttribution ? "Ver origem do anúncio" : "Sem dados de campanha"}
          >
            <Megaphone className={hasAttribution ? `w-4 h-4 ${iconColorClass}` : "w-4 h-4 text-muted-foreground"} />
            {attributions.length > 1 && (
              <span className={`absolute -top-0.5 -right-0.5 ${hasAIDetection ? 'bg-purple-500' : 'bg-blue-500'} text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center`}>
                {attributions.length}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] sm:w-[360px] p-0" align="end" sideOffset={6}>
          <div className="flex flex-col max-h-[70vh]">
            {/* Header com navegação */}
            <div className="flex items-center justify-between gap-2 p-3 border-b bg-background">
              <div className="flex items-center gap-2">
                <Megaphone className={`w-4 h-4 ${iconColorClass}`} />
                <span className="font-semibold text-sm">Origem do Anúncio</span>
              </div>
              {attributions.length > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={goPrev}
                    disabled={currentIndex === 0}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[40px] text-center">
                    {currentIndex + 1}/{attributions.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={goNext}
                    disabled={currentIndex === attributions.length - 1}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Content */}
            {!hasAttribution ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                Nenhum dado de campanha encontrado para este contato.
              </div>
            ) : current ? (
              <div className="p-3 space-y-3 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
                {/* Data do rastreamento */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{formatDate(current.timestamp)}</span>
                </div>

                {/* Thumbnail */}
                {current.ad_thumbnail_url && (
                  <div
                    className="relative group cursor-pointer rounded-lg overflow-hidden border"
                    onClick={() => setIsImageModalOpen(true)}
                  >
                    <img
                      src={current.ad_thumbnail_url}
                      alt="Anúncio"
                      className="w-full h-auto max-h-36 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Maximize2 className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )}

                {/* Fonte */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fonte:</span>
                  <Badge variant="secondary" className={`text-xs ${getSourceInfo(current).className}`}>
                    {getSourceInfo(current).label}
                  </Badge>
                </div>

                {/* Campanha / Rastreamento */}
                {(current.fb_campaign_name || current.utm_campaign) && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Rastreamento:</span>
                    <div className={`${isDetectedByAI(current.utm_campaign) ? 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800' : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800'} border rounded-md p-2`}>
                      <span className={`text-xs font-semibold break-words ${isDetectedByAI(current.utm_campaign) ? 'text-purple-700 dark:text-purple-300' : 'text-blue-700 dark:text-blue-300'}`}>
                        {current.fb_campaign_name || current.utm_campaign}
                      </span>
                    </div>
                  </div>
                )}

                {/* Conjunto */}
                {current.fb_adset_name && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Conjunto de Anúncios:</span>
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-green-700 dark:text-green-300 break-words">
                        {current.fb_adset_name}
                      </span>
                    </div>
                  </div>
                )}

                {/* Anúncio */}
                {current.fb_ad_name && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Nome do Anúncio:</span>
                    <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 break-words">
                        {current.fb_ad_name}
                      </span>
                    </div>
                  </div>
                )}

                {/* Texto do Anúncio */}
                {current.utm_term && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Texto do Anúncio:</span>
                    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-2 max-h-24 overflow-y-auto">
                      <span className="text-xs break-words whitespace-pre-wrap">{current.utm_term}</span>
                    </div>
                  </div>
                )}

                {/* Dados Técnicos */}
                <div className="pt-2 border-t space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Dados Técnicos
                  </span>
                  {(current.fb_ad_id || current.utm_content) && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">ID do Anúncio:</span>
                      <span className="text-[10px] font-mono text-right break-all max-w-[140px]">
                        {current.fb_ad_id || current.utm_content}
                      </span>
                    </div>
                  )}
                  {current.fbclid && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">FBCLID:</span>
                      <span className="text-[10px] font-mono text-right truncate max-w-[140px]" title={current.fbclid}>
                        {current.fbclid.slice(0, 16)}...
                      </span>
                    </div>
                  )}
                  {current.gclid && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">GCLID:</span>
                      <span className="text-[10px] font-mono text-right truncate max-w-[140px]" title={current.gclid}>
                        {current.gclid.slice(0, 16)}...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>

      {/* Modal para imagem expandida */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className={`w-5 h-5 ${iconColorClass}`} />
              Imagem do Anúncio
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {current?.ad_thumbnail_url && (
              <img
                src={current.ad_thumbnail_url}
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
