import { useState } from "react";
import { Megaphone, ChevronDown, ChevronUp, X, Maximize2 } from "lucide-react";
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
  ad_thumbnail_url?: string | null;
}

interface LeadCampaignBadgeProps {
  lead: Lead;
}

export function LeadCampaignBadge({ lead }: LeadCampaignBadgeProps) {
  const [isTextExpanded, setIsTextExpanded] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  
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
  
  // Check if text is long enough to need expansion
  const textContent = lead.utm_term || '';
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
              <Megaphone className="h-4 w-4 flex-shrink-0 text-blue-500" />
              <span className={`text-xs px-2 py-0.5 rounded ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
                {sourceInfo.label}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] sm:w-96 p-0 max-h-[70vh] overflow-hidden" align="start">
            <div className="flex flex-col max-h-[70vh]">
              {/* Header fixo */}
              <div className="flex items-center gap-2 p-3 border-b bg-background sticky top-0 z-10">
                <Megaphone className="w-4 h-4 text-blue-500" />
                <span className="font-semibold text-sm">Origem do Anúncio</span>
              </div>
              
              {/* Conteúdo com scroll */}
              <div className="overflow-y-auto flex-1 p-3 space-y-3">
                {/* Thumbnail da imagem do anúncio */}
                {lead.ad_thumbnail_url && (
                  <div className="relative group cursor-pointer" onClick={() => setIsImageModalOpen(true)}>
                    <img 
                      src={lead.ad_thumbnail_url} 
                      alt="Thumbnail do anúncio" 
                      className="w-full h-auto max-h-40 object-cover rounded-lg border shadow-sm hover:shadow-md transition-shadow"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                      <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                )}
                
                {/* Fonte */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fonte:</span>
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${sourceInfo.bgColor} ${sourceInfo.textColor}`}>
                    {sourceInfo.label}
                  </span>
                </div>

                {/* Campanha (Gerenciador) */}
                {(lead.fb_campaign_name || lead.utm_campaign) && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Campanha (Gerenciador):</span>
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 break-words">
                        {lead.fb_campaign_name || lead.utm_campaign}
                      </span>
                    </div>
                  </div>
                )}

                {/* Conjunto de Anúncios */}
                {lead.fb_adset_name && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Conjunto de Anúncios:</span>
                    <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-green-700 dark:text-green-300 break-words">
                        {lead.fb_adset_name}
                      </span>
                    </div>
                  </div>
                )}

                {/* Nome do Anúncio */}
                {lead.fb_ad_name && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Nome do Anúncio:</span>
                    <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md p-2">
                      <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 break-words">
                        {lead.fb_ad_name}
                      </span>
                    </div>
                  </div>
                )}

                {/* Texto do Anúncio (expandível) */}
                {textContent && (
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Texto do Anúncio:</span>
                    <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-2">
                      <span className="text-xs break-words whitespace-pre-wrap">
                        {displayText}
                        {isTextLong && !isTextExpanded && '...'}
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

                {/* Dados Técnicos */}
                <div className="pt-2 border-t space-y-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Dados Técnicos</span>
                  
                  {/* ID do Anúncio */}
                  {(lead.fb_ad_id || lead.utm_content) && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">ID:</span>
                      <span className="text-[10px] font-mono text-right break-all max-w-[180px]">
                        {lead.fb_ad_id || lead.utm_content}
                      </span>
                    </div>
                  )}

                  {/* Meio */}
                  {lead.utm_medium && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Meio:</span>
                      <span className="text-xs">{lead.utm_medium}</span>
                    </div>
                  )}

                  {/* Click IDs */}
                  {lead.fbclid && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">FBCLID:</span>
                      <span className="text-[10px] font-mono text-right break-all text-muted-foreground max-w-[160px]">
                        {lead.fbclid}
                      </span>
                    </div>
                  )}
                  {lead.gclid && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs text-muted-foreground">GCLID:</span>
                      <span className="text-[10px] font-mono text-right break-all text-muted-foreground max-w-[160px]">
                        {lead.gclid}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Modal para imagem expandida */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-blue-500" />
              Imagem do Anúncio
            </DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {lead.ad_thumbnail_url && (
              <img 
                src={lead.ad_thumbnail_url} 
                alt="Imagem do anúncio em tamanho completo" 
                className="w-full h-auto rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}