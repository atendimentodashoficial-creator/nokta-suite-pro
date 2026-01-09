import { Megaphone } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
      return { label: 'Meta Ads', bgColor: 'bg-blue-100 dark:bg-blue-900', textColor: 'text-blue-700 dark:text-blue-300' };
    }
    if (lead.gclid) {
      return { label: 'Google Ads', bgColor: 'bg-green-100 dark:bg-green-900', textColor: 'text-green-700 dark:text-green-300' };
    }
    if (lead.utm_source) {
      return { label: lead.utm_source, bgColor: 'bg-purple-100 dark:bg-purple-900', textColor: 'text-purple-700 dark:text-purple-300' };
    }
    return { label: 'Campanha', bgColor: 'bg-gray-100 dark:bg-gray-800', textColor: 'text-gray-700 dark:text-gray-300' };
  };

  const sourceInfo = getSourceInfo();

  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Ver detalhes da campanha"
          >
            <Megaphone className="h-4 w-4 flex-shrink-0 text-blue-500" />
            <span className={`text-xs px-2 py-0.5 rounded ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
              {sourceInfo.label}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b">
              <Megaphone className="w-5 h-5 text-blue-500" />
              <span className="font-semibold">Origem do Lead</span>
            </div>
            
            <div className="space-y-3">
              {/* Fonte */}
              <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                <span className="text-sm text-muted-foreground">Fonte</span>
                <span className={`text-xs px-2 py-1 rounded w-fit ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
                  {sourceInfo.label}
                </span>
              </div>

              {/* Campanha */}
              {(lead.fb_campaign_name || lead.utm_campaign) && (
                <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                  <span className="text-sm text-muted-foreground">Campanha</span>
                  <span className="text-sm font-medium break-words">
                    {lead.fb_campaign_name || lead.utm_campaign}
                  </span>
                </div>
              )}

              {/* Conjunto de Anúncios */}
              {lead.fb_adset_name && (
                <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                  <span className="text-sm text-muted-foreground">Conjunto</span>
                  <span className="text-sm font-medium break-words">
                    {lead.fb_adset_name}
                  </span>
                </div>
              )}

              {/* Anúncio */}
              {lead.fb_ad_name && (
                <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                  <span className="text-sm text-muted-foreground">Anúncio</span>
                  <span className="text-sm font-medium break-words">
                    {lead.fb_ad_name}
                  </span>
                </div>
              )}

              {/* Meio */}
              {lead.utm_medium && (
                <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                  <span className="text-sm text-muted-foreground">Meio</span>
                  <span className="text-sm">{lead.utm_medium}</span>
                </div>
              )}

              {/* Conteúdo (ID do anúncio) */}
              {lead.utm_content && (
                <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                  <span className="text-sm text-muted-foreground">ID Anúncio</span>
                  <span className="text-sm font-mono text-xs break-all">
                    {lead.utm_content}
                  </span>
                </div>
              )}

              {/* Termo/Body */}
              {lead.utm_term && (
                <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                  <span className="text-sm text-muted-foreground">Texto</span>
                  <span className="text-sm break-words">
                    {lead.utm_term}
                  </span>
                </div>
              )}

              {/* Click IDs */}
              {(lead.fbclid || lead.gclid) && (
                <div className="pt-3 border-t space-y-2">
                  {lead.fbclid && (
                    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                      <span className="text-sm text-muted-foreground">FBCLID</span>
                      <span className="text-xs font-mono break-all text-muted-foreground">
                        {lead.fbclid}
                      </span>
                    </div>
                  )}
                  {lead.gclid && (
                    <div className="grid grid-cols-[100px_1fr] gap-2 items-start">
                      <span className="text-sm text-muted-foreground">GCLID</span>
                      <span className="text-xs font-mono break-all text-muted-foreground">
                        {lead.gclid}
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
