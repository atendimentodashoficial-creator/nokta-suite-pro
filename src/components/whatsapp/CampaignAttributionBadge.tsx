import { useState, useEffect } from "react";
import { Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLast8Digits } from "@/utils/whatsapp";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CampaignAttributionData {
  utm_source: string | null;
  utm_campaign: string | null;
  utm_medium: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
}

interface CampaignAttributionBadgeProps {
  contactNumber: string;
}

export function CampaignAttributionBadge({ contactNumber }: CampaignAttributionBadgeProps) {
  const [attribution, setAttribution] = useState<CampaignAttributionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadAttribution = async () => {
      // Important: don't clear existing attribution while reloading,
      // otherwise the megaphone flickers (appears then disappears).
      setIsLoading(true);
      try {
        const last8Digits = getLast8Digits(contactNumber);
        if (!last8Digits || last8Digits.length < 8) {
          if (isMounted && !hasLoadedOnce) {
            setAttribution(null);
          }
          return;
        }

        // Buscar todos os leads para comparar pelos últimos 8 dígitos
        const { data: allLeads } = await supabase
          .from('leads')
          .select('utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, gclid, telefone')
          .is('deleted_at', null);

        // Encontrar lead pelos últimos 8 dígitos que tenha algum dado de atribuição
        const leadWithAttribution = allLeads?.find(l => {
          const hasAttribution = l.utm_source || l.utm_campaign || l.fbclid || l.gclid;
          return getLast8Digits(l.telefone) === last8Digits && hasAttribution;
        });

        if (!isMounted) return;

        if (leadWithAttribution) {
          setAttribution({
            utm_source: leadWithAttribution.utm_source,
            utm_campaign: leadWithAttribution.utm_campaign,
            utm_medium: leadWithAttribution.utm_medium,
            utm_content: leadWithAttribution.utm_content,
            utm_term: leadWithAttribution.utm_term,
            fbclid: leadWithAttribution.fbclid,
            gclid: leadWithAttribution.gclid,
          });
        }
        // Se não encontrou, NÃO limpar o estado - manter o que já temos
      } catch (error) {
        console.error('Error loading campaign attribution:', error);
        // Keep previous attribution on transient errors.
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setHasLoadedOnce(true);
        }
      }
    };

    loadAttribution();

    return () => {
      isMounted = false;
    };
  }, [contactNumber]);

  // Não mostrar nada se não há dados de atribuição E já carregou pelo menos uma vez
  if (!attribution && hasLoadedOnce) {
    return null;
  }

  // Ainda carregando pela primeira vez - não mostrar nada ainda
  if (!attribution && isLoading) {
    return null;
  }

  // Determinar a fonte principal para exibição
  const getSourceInfo = () => {
    if (attribution.utm_source === 'facebook' || attribution.fbclid) {
      return { label: 'Meta Ads', color: 'bg-blue-500' };
    }
    if (attribution.gclid) {
      return { label: 'Google Ads', color: 'bg-green-500' };
    }
    if (attribution.utm_source) {
      return { label: attribution.utm_source, color: 'bg-purple-500' };
    }
    return { label: 'Campanha', color: 'bg-gray-500' };
  };

  const sourceInfo = getSourceInfo();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          title="Ver origem da campanha"
        >
          <Megaphone className="w-4 h-4 text-blue-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm">Origem do Lead</span>
          </div>
          
          <div className="space-y-2">
            {/* Fonte */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Fonte:</span>
              <Badge variant="secondary" className={`text-white ${sourceInfo.color}`}>
                {sourceInfo.label}
              </Badge>
            </div>

            {/* Campanha */}
            {attribution.utm_campaign && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Campanha:</span>
                <span className="text-xs font-medium truncate max-w-[160px]" title={attribution.utm_campaign}>
                  {attribution.utm_campaign}
                </span>
              </div>
            )}

            {/* Meio */}
            {attribution.utm_medium && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Meio:</span>
                <span className="text-xs font-medium">{attribution.utm_medium}</span>
              </div>
            )}

            {/* Conteúdo (ID do anúncio) */}
            {attribution.utm_content && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">ID Anúncio:</span>
                <span className="text-xs font-mono truncate max-w-[140px]" title={attribution.utm_content}>
                  {attribution.utm_content}
                </span>
              </div>
            )}

            {/* Termo/Body */}
            {attribution.utm_term && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Texto:</span>
                <span className="text-xs truncate max-w-[160px]" title={attribution.utm_term}>
                  {attribution.utm_term}
                </span>
              </div>
            )}

            {/* Click IDs */}
            {(attribution.fbclid || attribution.gclid) && (
              <div className="pt-2 border-t">
                {attribution.fbclid && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">FBCLID:</span>
                    <span className="text-xs font-mono truncate max-w-[140px]" title={attribution.fbclid}>
                      {attribution.fbclid.slice(0, 12)}...
                    </span>
                  </div>
                )}
                {attribution.gclid && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">GCLID:</span>
                    <span className="text-xs font-mono truncate max-w-[140px]" title={attribution.gclid}>
                      {attribution.gclid.slice(0, 12)}...
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
