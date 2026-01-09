import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface Lead {
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
}

interface LeadCampaignBadgeProps {
  lead: Lead;
}

export function LeadCampaignBadge({ lead }: LeadCampaignBadgeProps) {
  const hasAttribution = lead.utm_source || lead.utm_campaign || lead.fbclid || lead.gclid;
  
  if (!hasAttribution) {
    return null;
  }

  // Determinar a fonte principal para exibição
  const getSourceInfo = () => {
    if (lead.utm_source === 'facebook' || lead.fbclid) {
      return { label: 'Meta Ads', color: 'bg-blue-500' };
    }
    if (lead.gclid) {
      return { label: 'Google Ads', color: 'bg-green-500' };
    }
    if (lead.utm_source) {
      return { label: lead.utm_source, color: 'bg-purple-500' };
    }
    return { label: 'Campanha', color: 'bg-gray-500' };
  };

  const sourceInfo = getSourceInfo();

  return (
    <div className="flex items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 gap-1.5"
            title="Ver detalhes da campanha"
          >
            <Megaphone className="w-4 h-4 text-blue-500" />
            <Badge variant="secondary" className={`text-white text-xs ${sourceInfo.color}`}>
              {sourceInfo.label}
            </Badge>
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
              {(lead.fb_campaign_name || lead.utm_campaign) && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Campanha:</span>
                  <span className="text-xs font-medium truncate max-w-[160px]" title={lead.fb_campaign_name || lead.utm_campaign || ''}>
                    {lead.fb_campaign_name || lead.utm_campaign}
                  </span>
                </div>
              )}

              {/* Conjunto de Anúncios */}
              {lead.fb_adset_name && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Conjunto:</span>
                  <span className="text-xs font-medium truncate max-w-[160px]" title={lead.fb_adset_name}>
                    {lead.fb_adset_name}
                  </span>
                </div>
              )}

              {/* Anúncio */}
              {lead.fb_ad_name && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Anúncio:</span>
                  <span className="text-xs font-medium truncate max-w-[160px]" title={lead.fb_ad_name}>
                    {lead.fb_ad_name}
                  </span>
                </div>
              )}

              {/* Meio */}
              {lead.utm_medium && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Meio:</span>
                  <span className="text-xs font-medium">{lead.utm_medium}</span>
                </div>
              )}

              {/* Conteúdo (ID do anúncio) */}
              {lead.utm_content && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">ID Anúncio:</span>
                  <span className="text-xs font-mono truncate max-w-[140px]" title={lead.utm_content}>
                    {lead.utm_content}
                  </span>
                </div>
              )}

              {/* Termo/Body */}
              {lead.utm_term && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Texto:</span>
                  <span className="text-xs truncate max-w-[160px]" title={lead.utm_term}>
                    {lead.utm_term}
                  </span>
                </div>
              )}

              {/* Click IDs */}
              {(lead.fbclid || lead.gclid) && (
                <div className="pt-2 border-t">
                  {lead.fbclid && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">FBCLID:</span>
                      <span className="text-xs font-mono truncate max-w-[140px]" title={lead.fbclid}>
                        {lead.fbclid.slice(0, 12)}...
                      </span>
                    </div>
                  )}
                  {lead.gclid && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">GCLID:</span>
                      <span className="text-xs font-mono truncate max-w-[140px]" title={lead.gclid}>
                        {lead.gclid.slice(0, 12)}...
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
