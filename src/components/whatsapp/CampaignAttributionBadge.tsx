import { useState, useEffect } from "react";
import { Megaphone, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/whatsapp";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AttributionEntry {
  id: string;
  source: 'meta' | 'google' | 'other';
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

interface CampaignAttributionBadgeProps {
  contactNumber: string;
  chatId?: string; // whatsapp_chats.id (uuid)
}

export function CampaignAttributionBadge({ contactNumber, chatId }: CampaignAttributionBadgeProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [attributions, setAttributions] = useState<AttributionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Mantém o userId em sincronia com a sessão real (sem depender do AuthContext).
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
      // Sem sessão válida não dá pra ler as tabelas (RLS). Mantém o ícone, mas sem dados.
      if (!userId) {
        if (isMounted) {
          setIsLoading(false);
          setHasLoadedOnce(true);
          setAttributions([]);
        }
        return;
      }

      setIsLoading(true);
      try {

        const last8Digits = getLast8Digits(contactNumber);
        if (!last8Digits || last8Digits.length < 8) {
          if (isMounted && !hasLoadedOnce) {
            setAttributions([]);
          }
          return;
        }

        const allAttributions: AttributionEntry[] = [];
        const seenAdIds = new Set<string>();

        // 1) WhatsApp: tenta pelo chatId; se não achar, cai para busca por telefone (últimos 8 dígitos)
        let wpChatIds = chatId ? [chatId] : [];

        // Fallback: algumas telas podem abrir o ChatWindow com id diferente/temporário;
        // então garantimos que vamos achar o chat do usuário pelo telefone.
        if (wpChatIds.length === 0) {
          const { data: wpChats } = await supabase
            .from('whatsapp_chats')
            .select('id, contact_number, normalized_number')
            .eq('user_id', userId)
            .or(`contact_number.like.%${last8Digits},normalized_number.like.%${last8Digits}`)
            .limit(20);

          wpChatIds = (wpChats || [])
            .filter((c) => getLast8Digits(c.contact_number || c.normalized_number || '') === last8Digits)
            .map((c) => c.id);
        }

        if (wpChatIds.length > 0) {
          const { data: wpMessages } = await supabase
            .from('whatsapp_messages')
            .select(
              'id, fb_ad_id, fb_ad_name, fb_campaign_name, fb_adset_name, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, ad_thumbnail_url, timestamp, chat_id'
            )
            .in('chat_id', wpChatIds)
            .or('fb_ad_id.not.is.null,fbclid.not.is.null,utm_source.not.is.null')
            .order('timestamp', { ascending: false })
            .limit(50);

          for (const msg of wpMessages || []) {
            const key = msg.fb_ad_id || msg.fbclid || `${msg.utm_source}-${msg.utm_campaign}-${msg.timestamp}`;
            if (seenAdIds.has(key)) continue;
            seenAdIds.add(key);

            allAttributions.push({
              id: msg.id,
              source: msg.fb_ad_id || msg.fbclid ? 'meta' : 'other',
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

        // 2) Disparos (opcional): mantém como estava, mas filtrando por user quando possível.
        const { data: dispChats } = await supabase
          .from('disparos_chats')
          .select('id, contact_number')
          .eq('user_id', userId || '00000000-0000-0000-0000-000000000000');

        const dispChatIds = (dispChats || [])
          .filter((c) => getLast8Digits(c.contact_number) === last8Digits)
          .map((c) => c.id);

        if (dispChatIds.length > 0) {
          const { data: dispMessages } = await supabase
            .from('disparos_messages')
            .select(
              'id, fb_ad_id, fb_ad_name, fb_campaign_name, fb_adset_name, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, ad_thumbnail_url, timestamp, chat_id'
            )
            .in('chat_id', dispChatIds)
            .or('fb_ad_id.not.is.null,fbclid.not.is.null,utm_source.not.is.null')
            .order('timestamp', { ascending: false })
            .limit(50);

          for (const msg of dispMessages || []) {
            const key = msg.fb_ad_id || msg.fbclid || `${msg.utm_source}-${msg.utm_campaign}-${msg.timestamp}`;
            if (seenAdIds.has(key)) continue;
            seenAdIds.add(key);

            allAttributions.push({
              id: msg.id,
              source: msg.fb_ad_id || msg.fbclid ? 'meta' : 'other',
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

        // 3) Leads: filtra por user quando possível.
        const leadsQuery = supabase
          .from('leads')
          .select(
            'id, fb_ad_id, fb_ad_name, fb_campaign_name, fb_adset_name, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, gclid, telefone, created_at'
          )
          .is('deleted_at', null)
          .like('telefone', `%${last8Digits}`)
          .order('created_at', { ascending: false })
          .limit(50);

        const { data: leads } = userId ? await leadsQuery.eq('user_id', userId) : await leadsQuery;

        for (const lead of leads || []) {
          if (getLast8Digits(lead.telefone) !== last8Digits) continue;

          const hasAttribution = lead.fb_ad_id || lead.utm_source || lead.fbclid || lead.gclid;
          if (!hasAttribution) continue;

          const key = lead.fb_ad_id || lead.gclid || lead.fbclid || `${lead.utm_source}-${lead.utm_campaign}-${lead.created_at}`;
          if (seenAdIds.has(key)) continue;
          seenAdIds.add(key);

          allAttributions.push({
            id: lead.id,
            source: lead.gclid ? 'google' : lead.fb_ad_id || lead.fbclid ? 'meta' : 'other',
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
            ad_thumbnail_url: null,
            timestamp: lead.created_at || new Date().toISOString(),
          });
        }

        // Enriquecer Meta Ads (campanha/conjunto/anúncio) via backend quando só temos o fb_ad_id.
        // (Isso é o que deixa igual ao da Lenir.)
        const needEnrich = allAttributions
          .filter((a) => a.source === 'meta' && a.fb_ad_id)
          .filter((a) => !a.fb_campaign_name || !a.fb_adset_name || !a.fb_ad_name || !a.ad_thumbnail_url);

        if (needEnrich.length > 0) {
          const { data: sessionData } = await supabase.auth.getSession();
          const token = sessionData.session?.access_token;

          const cache = new Map<string, Partial<AttributionEntry>>();
          const uniqueAdIds = Array.from(new Set(needEnrich.map((a) => a.fb_ad_id!).filter(Boolean)));

          await Promise.all(
            uniqueAdIds.map(async (adId) => {
              try {
                const resp = await supabase.functions.invoke('fetch-facebook-ad-info', {
                  headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  body: { ad_id: adId },
                });

                if (resp.error) return;

                const r: any = resp.data;
                cache.set(adId, {
                  fb_ad_id: r.ad_id ?? adId,
                  fb_ad_name: r.ad_name ?? null,
                  fb_campaign_name: r.campaign_name ?? null,
                  fb_adset_name: r.adset_name ?? null,
                  ad_thumbnail_url: r.thumbnail_url ?? null,
                });
              } catch {
                // silencioso
              }
            })
          );

          // aplica cache
          for (let i = 0; i < allAttributions.length; i++) {
            const a = allAttributions[i];
            if (a.source !== 'meta' || !a.fb_ad_id) continue;
            const extra = cache.get(a.fb_ad_id);
            if (!extra) continue;
            allAttributions[i] = {
              ...a,
              fb_ad_name: a.fb_ad_name ?? extra.fb_ad_name ?? null,
              fb_campaign_name: a.fb_campaign_name ?? extra.fb_campaign_name ?? null,
              fb_adset_name: a.fb_adset_name ?? extra.fb_adset_name ?? null,
              ad_thumbnail_url: a.ad_thumbnail_url ?? extra.ad_thumbnail_url ?? null,
            };
          }
        }

        if (!isMounted) return;

        // Ordenar por data (mais recente primeiro)
        allAttributions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        setAttributions(allAttributions);
      } catch (error) {
        console.error('Error loading campaign attributions:', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      }
    };

    loadAttributions();

    return () => {
      isMounted = false;
    };
  }, [contactNumber, chatId, userId]);

  // Sempre renderiza o ícone: quando não há atribuição, ele aparece em estado “neutro”.
  const hasAttribution = attributions.length > 0;

  const isDetectedByAICheck = (campaign: string | null) => 
    campaign === "Detectado por I.A" || campaign === "Detectado por IA";

  const getSourceInfo = (attr: AttributionEntry) => {
    // Check if detected by AI
    if (isDetectedByAICheck(attr.utm_campaign)) {
      return { label: 'Anúncios', className: 'bg-purple-500 text-white', isAI: true };
    }
    if (attr.source === 'meta') {
      return { label: 'Meta Ads', className: 'bg-primary text-primary-foreground', isAI: false };
    }
    if (attr.source === 'google') {
      return { label: 'Google Ads', className: 'bg-secondary text-secondary-foreground', isAI: false };
    }
    if (attr.utm_source) {
      return { label: attr.utm_source, className: 'bg-muted text-foreground', isAI: false };
    }
    return { label: 'Campanha', className: 'bg-muted text-foreground', isAI: false };
  };

  // Check if any attribution was detected by AI
  const hasAIDetection = attributions.some(attr => isDetectedByAICheck(attr.utm_campaign));

  const formatDate = (timestamp: string) => {
    try {
      return format(new Date(timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return timestamp;
    }
  };

  const iconColorClass = hasAIDetection ? "text-purple-500" : "text-primary";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0 relative"
          title={hasAttribution ? "Ver origens de campanhas" : "Sem dados de campanha"}
        >
          <Megaphone className={hasAttribution ? `w-4 h-4 ${iconColorClass}` : "w-4 h-4 text-muted-foreground"} />
          {attributions.length > 1 && (
            <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {attributions.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className={hasAttribution ? `w-4 h-4 ${iconColorClass}` : "w-4 h-4 text-muted-foreground"} />
            <span className="font-semibold text-sm">
              {hasAttribution ? `Histórico de Campanhas (${attributions.length})` : "Sem dados de campanha"}
            </span>
          </div>
          
          {!hasAttribution ? (
            <div className="text-xs text-muted-foreground">
              Se este contato veio de anúncio, verifique se há mensagens com UTM/FB Ad ID ou se o lead foi criado com atribuição.
            </div>
          ) : (
            <ScrollArea className={attributions.length > 2 ? "h-64" : ""}>
              <div className="space-y-3 pr-2">
                {attributions.map((attr, index) => {
                  const sourceInfo = getSourceInfo(attr);
                  return (
                    <div
                      key={attr.id}
                      className={`space-y-2 p-2 rounded-lg ${index === 0 ? 'bg-muted/60 border border-border' : 'bg-muted/40'}`}
                    >
                      {/* Header com data e fonte */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(attr.timestamp)}</span>
                        </div>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${sourceInfo.className}`}>
                          {sourceInfo.label}
                        </Badge>
                      </div>

                    {/* Thumbnail do anúncio */}
                    {attr.ad_thumbnail_url && (
                      <div className="flex justify-center">
                        <img 
                          src={attr.ad_thumbnail_url} 
                          alt="Anúncio" 
                          className="max-h-16 rounded object-contain"
                        />
                      </div>
                    )}

                    {/* Detalhes do anúncio */}
                    <div className="space-y-1 text-xs">
                      {/* Campanha */}
                      {(attr.fb_campaign_name || attr.utm_campaign) && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Campanha:</span>
                          <span className="font-medium text-right truncate" title={attr.fb_campaign_name || attr.utm_campaign || ''}>
                            {attr.fb_campaign_name || attr.utm_campaign}
                          </span>
                        </div>
                      )}

                      {/* Conjunto */}
                      {attr.fb_adset_name && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Conjunto:</span>
                          <span className="font-medium text-right truncate" title={attr.fb_adset_name}>
                            {attr.fb_adset_name}
                          </span>
                        </div>
                      )}

                      {/* Anúncio */}
                      {attr.fb_ad_name && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Anúncio:</span>
                          <span className="font-medium text-right truncate" title={attr.fb_ad_name}>
                            {attr.fb_ad_name}
                          </span>
                        </div>
                      )}

                      {/* Meio */}
                      {attr.utm_medium && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">Meio:</span>
                          <span className="font-medium">{attr.utm_medium}</span>
                        </div>
                      )}

                      {/* ID do Anúncio */}
                      {attr.fb_ad_id && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-muted-foreground shrink-0">ID:</span>
                          <span className="font-mono text-[10px] truncate max-w-[140px]" title={attr.fb_ad_id}>
                            {attr.fb_ad_id}
                          </span>
                        </div>
                      )}

                      {/* Click IDs */}
                      {(attr.fbclid || attr.gclid) && (
                        <div className="flex items-start justify-between gap-2 pt-1 border-t border-muted">
                          <span className="text-muted-foreground shrink-0">
                            {attr.fbclid ? 'FBCLID:' : 'GCLID:'}
                          </span>
                          <span className="font-mono text-[10px] truncate max-w-[140px]" title={attr.fbclid || attr.gclid || ''}>
                            {(attr.fbclid || attr.gclid || '').slice(0, 16)}...
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Indicador de mais recente */}
                    {index === 0 && attributions.length > 1 && (
                      <div className="text-[10px] text-primary font-medium">
                        ★ Mais recente
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
