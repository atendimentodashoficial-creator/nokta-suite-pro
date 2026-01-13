import { Fragment, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { type ColumnKey } from "./PresetManagerDialog";

interface BaseMetrics {
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  ctr: number;
  cpc: number;
  cpm: number;
  results: number;
  cost_per_result: number;
  daily_budget?: number;
}

interface CampaignData extends BaseMetrics {
  campaign_id: string;
  campaign_name: string;
  status: string;
  objective: string;
}

interface AdsetData extends BaseMetrics {
  adset_id: string;
  adset_name: string;
  status: string;
  daily_budget?: number;
}

interface AdData extends BaseMetrics {
  ad_id: string;
  ad_name: string;
  status: string;
  thumbnail_url?: string | null;
}

interface CampaignRowProps {
  campaign: CampaignData;
  visibleColumns: ColumnKey[];
  dateStart: string;
  dateEnd: string;
  formatNumber: (value: number) => string;
  formatCurrency: (value: number) => string;
  formatPercentage: (value: number) => string;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string) => string;
  focusedAdsetId?: string | null;
  filterActiveAdsets?: boolean;
  filterActiveAds?: boolean;
  nameColumnWidth?: number;
  onCampaignExpand?: (expanded: boolean) => void;
  onAdsetExpand?: (adsetId: string | null) => void;
}

function friendlyApiError(message: string) {
  if (message.toLowerCase().includes("user request limit reached")) {
    return "Limite de requisições da API atingido. Aguarde alguns minutos e tente novamente.";
  }
  return message;
}

export function CampaignRow({
  campaign,
  visibleColumns,
  dateStart,
  dateEnd,
  formatNumber,
  formatCurrency,
  formatPercentage,
  getStatusColor,
  getStatusLabel,
  focusedAdsetId,
  filterActiveAdsets,
  filterActiveAds,
  nameColumnWidth = 200,
  onCampaignExpand,
  onAdsetExpand,
}: CampaignRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const [adsets, setAdsets] = useState<AdsetData[]>([]);
  const [loadingAdsets, setLoadingAdsets] = useState(false);
  const [adsetsFetched, setAdsetsFetched] = useState(false);
  const [adsetsError, setAdsetsError] = useState<string | null>(null);

  const [expandedAdsets, setExpandedAdsets] = useState<Set<string>>(new Set());
  const [adsByAdset, setAdsByAdset] = useState<Record<string, AdData[]>>({});
  const [loadingAds, setLoadingAds] = useState<Set<string>>(new Set());
  const [adsFetched, setAdsFetched] = useState<Set<string>>(new Set());
  const [adsErrorByAdset, setAdsErrorByAdset] = useState<Record<string, string | null>>({});

  const colSpan = useMemo(() => visibleColumns.length + 1, [visibleColumns.length]);

  // Calcula totais/médias para um array de métricas
  const calculateSummary = (items: BaseMetrics[]): BaseMetrics & { daily_budget?: number } => {
    if (items.length === 0) {
      return {
        impressions: 0, clicks: 0, spend: 0, reach: 0,
        ctr: 0, cpc: 0, cpm: 0, results: 0, cost_per_result: 0,
        daily_budget: 0
      };
    }

    const totals = items.reduce(
      (acc, item) => ({
        impressions: acc.impressions + item.impressions,
        clicks: acc.clicks + item.clicks,
        spend: acc.spend + item.spend,
        reach: acc.reach + item.reach,
        results: acc.results + item.results,
        daily_budget: acc.daily_budget + (item.daily_budget ?? 0),
      }),
      { impressions: 0, clicks: 0, spend: 0, reach: 0, results: 0, daily_budget: 0 }
    );

    return {
      impressions: totals.impressions,
      clicks: totals.clicks,
      spend: totals.spend,
      reach: totals.reach,
      results: totals.results,
      daily_budget: totals.daily_budget,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
      cost_per_result: totals.results > 0 ? totals.spend / totals.results : 0,
    };
  };

  // Adsets filtrados
  const filteredAdsets = useMemo(() => 
    filterActiveAdsets 
      ? adsets.filter(a => a.status?.toUpperCase() === "ACTIVE")
      : adsets
  , [adsets, filterActiveAdsets]);

  const adsetsSummary = useMemo(() => calculateSummary(filteredAdsets), [filteredAdsets]);

  // Ads filtrados
  const getFilteredAds = (adsetId: string) => {
    const ads = adsByAdset[adsetId] || [];
    return filterActiveAds ? ads.filter(a => a.status?.toUpperCase() === "ACTIVE") : ads;
  };

  const getAdsSummary = (adsetId: string) => calculateSummary(getFilteredAds(adsetId));

  // Renderiza célula combinada Total/Média seguindo o padrão de campanhas
  const renderCombinedSummaryCell = (columnKey: ColumnKey, totals: BaseMetrics, averages: BaseMetrics) => {
    // Métricas que mostram média (em azul): CTR, CPC, CPM, Custo/Conversa
    const isAverageMetric = ["ctr", "cpc", "cpm", "cost_per_result"].includes(columnKey);
    const data = isAverageMetric ? averages : totals;
    const textClass = isAverageMetric ? "text-center font-bold text-primary" : "text-center font-bold";

    switch (columnKey) {
      case "status":
        return (
          <TableCell key={columnKey} className="text-center text-xs text-muted-foreground">
            —
          </TableCell>
        );
      case "daily_budget":
        // Soma os orçamentos dos adsets (para campanhas ABO)
        return (
          <TableCell key={columnKey} className={textClass}>
            {totals.daily_budget && totals.daily_budget > 0 ? formatCurrency(totals.daily_budget) : "—"}
          </TableCell>
        );
      case "impressions":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatNumber(data.impressions)}
          </TableCell>
        );
      case "clicks":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatNumber(data.clicks)}
          </TableCell>
        );
      case "ctr":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatPercentage(data.ctr)}
          </TableCell>
        );
      case "cpc":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatCurrency(data.cpc)}
          </TableCell>
        );
      case "cpm":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatCurrency(data.cpm)}
          </TableCell>
        );
      case "reach":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatNumber(data.reach)}
          </TableCell>
        );
      case "results":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatNumber(data.results)}
          </TableCell>
        );
      case "cost_per_result":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatCurrency(data.cost_per_result)}
          </TableCell>
        );
      case "spend":
        return (
          <TableCell key={columnKey} className={textClass}>
            {formatCurrency(data.spend)}
          </TableCell>
        );
      default:
        // Nunca retornar null para não desalinha as colunas
        return (
          <TableCell key={columnKey} className="text-center text-muted-foreground">
            —
          </TableCell>
        );
    }
  };

  // Calcula média para um array de métricas
  const calculateAverage = (items: BaseMetrics[]): BaseMetrics => {
    if (items.length === 0) {
      return {
        impressions: 0, clicks: 0, spend: 0, reach: 0,
        ctr: 0, cpc: 0, cpm: 0, results: 0, cost_per_result: 0
      };
    }

    const count = items.length;
    const totals = items.reduce(
      (acc, item) => ({
        impressions: acc.impressions + item.impressions,
        clicks: acc.clicks + item.clicks,
        spend: acc.spend + item.spend,
        reach: acc.reach + item.reach,
        results: acc.results + item.results,
        ctr: acc.ctr + item.ctr,
        cpc: acc.cpc + item.cpc,
        cpm: acc.cpm + item.cpm,
        cost_per_result: acc.cost_per_result + item.cost_per_result,
      }),
      { impressions: 0, clicks: 0, spend: 0, reach: 0, results: 0, ctr: 0, cpc: 0, cpm: 0, cost_per_result: 0 }
    );

    return {
      impressions: totals.impressions / count,
      clicks: totals.clicks / count,
      spend: totals.spend / count,
      reach: totals.reach / count,
      results: totals.results / count,
      ctr: totals.ctr / count,
      cpc: totals.cpc / count,
      cpm: totals.cpm / count,
      cost_per_result: totals.cost_per_result / count,
    };
  };

  const adsetsAverage = useMemo(() => calculateAverage(filteredAdsets), [filteredAdsets]);
  const getAdsAverage = (adsetId: string) => calculateAverage(getFilteredAds(adsetId));

  const fetchAdsets = async (opts?: { force?: boolean }) => {
    if (loadingAdsets) return;
    if (!opts?.force && (adsetsFetched || adsets.length > 0)) return;

    setLoadingAdsets(true);
    setAdsetsFetched(true);
    setAdsetsError(null);

    try {
      const { data, error } = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "get_adsets",
          campaign_id: campaign.campaign_id,
          date_start: dateStart,
          date_end: dateEnd,
        },
      });

      if (error) {
        setAdsetsError(friendlyApiError(error.message || "Erro ao buscar conjuntos"));
        return;
      }

      if (data?.success) {
        setAdsets(data.adsets || []);
        return;
      }

      if (data?.error) {
        setAdsetsError(friendlyApiError(String(data.error)));
        return;
      }

      setAdsetsError("Erro ao buscar conjuntos.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar conjuntos.";
      setAdsetsError(friendlyApiError(msg));
    } finally {
      setLoadingAdsets(false);
    }
  };

  const fetchAds = async (adsetId: string, opts?: { force?: boolean }) => {
    if (loadingAds.has(adsetId)) return;
    if (!opts?.force && (adsFetched.has(adsetId) || !!adsByAdset[adsetId])) return;

    setLoadingAds((prev) => new Set(prev).add(adsetId));
    setAdsFetched((prev) => new Set(prev).add(adsetId));
    setAdsErrorByAdset((prev) => ({ ...prev, [adsetId]: null }));

    try {
      const { data, error } = await supabase.functions.invoke("facebook-ads-api", {
        body: {
          action: "get_ads",
          adset_id: adsetId,
          date_start: dateStart,
          date_end: dateEnd,
        },
      });

      if (error) {
        setAdsErrorByAdset((prev) => ({
          ...prev,
          [adsetId]: friendlyApiError(error.message || "Erro ao buscar anúncios"),
        }));
        return;
      }

      if (data?.success) {
        setAdsByAdset((prev) => ({
          ...prev,
          [adsetId]: data.ads || [],
        }));
        return;
      }

      if (data?.error) {
        setAdsErrorByAdset((prev) => ({
          ...prev,
          [adsetId]: friendlyApiError(String(data.error)),
        }));
        return;
      }

      setAdsErrorByAdset((prev) => ({
        ...prev,
        [adsetId]: "Erro ao buscar anúncios.",
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao buscar anúncios.";
      setAdsErrorByAdset((prev) => ({
        ...prev,
        [adsetId]: friendlyApiError(msg),
      }));
    } finally {
      setLoadingAds((prev) => {
        const next = new Set(prev);
        next.delete(adsetId);
        return next;
      });
    }
  };

  const handleToggleCampaign = () => {
    const newExpanded = !isExpanded;
    if (newExpanded) {
      fetchAdsets();
    }
    setIsExpanded(newExpanded);
    onCampaignExpand?.(newExpanded);
    if (!newExpanded) {
      onAdsetExpand?.(null);
    }
  };

  const handleToggleAdset = (adsetId: string) => {
    const isCurrentlyExpanded = expandedAdsets.has(adsetId);
    if (!isCurrentlyExpanded) {
      fetchAds(adsetId);
    }
    setExpandedAdsets((prev) => {
      const next = new Set(prev);
      if (next.has(adsetId)) {
        next.delete(adsetId);
      } else {
        next.add(adsetId);
      }
      return next;
    });
    onAdsetExpand?.(isCurrentlyExpanded ? null : adsetId);
  };

  const renderMetricCell = (columnKey: ColumnKey, data: BaseMetrics & { status: string }) => {
    switch (columnKey) {
      case "status":
        return (
          <TableCell key={columnKey} className="text-center">
            <Badge variant="outline" className={getStatusColor(data.status)}>
              {getStatusLabel(data.status)}
            </Badge>
          </TableCell>
        );
      case "daily_budget":
        return (
          <TableCell key={columnKey} className="text-center">
            {data.daily_budget ? formatCurrency(data.daily_budget) : "—"}
          </TableCell>
        );
      case "impressions":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatNumber(data.impressions)}
          </TableCell>
        );
      case "clicks":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatNumber(data.clicks)}
          </TableCell>
        );
      case "ctr":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatPercentage(data.ctr)}
          </TableCell>
        );
      case "cpc":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatCurrency(data.cpc)}
          </TableCell>
        );
      case "cpm":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatCurrency(data.cpm)}
          </TableCell>
        );
      case "reach":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatNumber(data.reach)}
          </TableCell>
        );
      case "results":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatNumber(data.results)}
          </TableCell>
        );
      case "cost_per_result":
        return (
          <TableCell key={columnKey} className="text-center">
            {formatCurrency(data.cost_per_result)}
          </TableCell>
        );
      case "spend":
        return (
          <TableCell key={columnKey} className="text-center font-medium">
            {formatCurrency(data.spend)}
          </TableCell>
        );
      default:
        return null;
    }
  };

  return (
    <>
      {/* Campaign Row */}
      <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={handleToggleCampaign}>
        <TableCell className="font-medium" style={{ width: nameColumnWidth, minWidth: 120 }}>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <span className="truncate" style={{ maxWidth: Math.max(80, nameColumnWidth - 40) }}>{campaign.campaign_name}</span>
          </div>
        </TableCell>
        {/* Hide campaign metrics when expanded */}
        {isExpanded ? (
          visibleColumns.map((columnKey) => (
            <TableCell key={columnKey} className="text-center text-muted-foreground">—</TableCell>
          ))
        ) : (
          visibleColumns.map((columnKey) => renderMetricCell(columnKey, campaign))
        )}
      </TableRow>

      {/* Adsets */}
      {isExpanded && (
        <>
          {loadingAdsets ? (
            <TableRow>
              <TableCell colSpan={colSpan}>
                <div className="flex items-center gap-2 pl-8 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Carregando conjuntos...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : adsetsError ? (
            <TableRow>
              <TableCell colSpan={colSpan}>
                <div className="flex items-center justify-between gap-3 pl-8 py-2">
                  <span className="text-sm text-muted-foreground">{adsetsError}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAdsetsFetched(false);
                      fetchAdsets({ force: true });
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Tentar novamente
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ) : filteredAdsets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colSpan}>
                <div className="pl-8 py-2 text-sm text-muted-foreground">
                  {filterActiveAdsets && adsets.length > 0
                    ? "Nenhum conjunto ativo encontrado."
                    : "Nenhum conjunto de anúncios encontrado."
                  }
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <>
              {filteredAdsets
                .filter((adset) => !focusedAdsetId || adset.adset_id === focusedAdsetId)
                .map((adset) => (
                <Fragment key={adset.adset_id}>
                  {/* Adset Row */}
                  <TableRow
                    className="bg-muted/30 hover:bg-muted/50 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAdset(adset.adset_id);
                    }}
                  >
                    <TableCell className="font-medium" style={{ width: nameColumnWidth, minWidth: 120 }}>
                      <div className="flex items-center gap-2 pl-6">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0">
                          {expandedAdsets.has(adset.adset_id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                        <span className="truncate text-sm" style={{ maxWidth: Math.max(60, nameColumnWidth - 64) }}>{adset.adset_name}</span>
                      </div>
                    </TableCell>
                    {/* Hide adset metrics when expanded */}
                    {expandedAdsets.has(adset.adset_id) ? (
                      visibleColumns.map((columnKey) => (
                        <TableCell key={columnKey} className="text-center text-muted-foreground">—</TableCell>
                      ))
                    ) : (
                      visibleColumns.map((columnKey) => renderMetricCell(columnKey, adset))
                    )}
                  </TableRow>

                  {/* Ads */}
                  {expandedAdsets.has(adset.adset_id) && (
                    <>
                      {loadingAds.has(adset.adset_id) ? (
                        <TableRow>
                          <TableCell colSpan={colSpan}>
                            <div className="flex items-center gap-2 pl-14 py-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-sm text-muted-foreground">Carregando anúncios...</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : adsErrorByAdset[adset.adset_id] ? (
                        <TableRow>
                          <TableCell colSpan={colSpan}>
                            <div className="flex items-center justify-between gap-3 pl-14 py-2">
                              <span className="text-sm text-muted-foreground">{adsErrorByAdset[adset.adset_id]}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAdsFetched((prev) => {
                                    const next = new Set(prev);
                                    next.delete(adset.adset_id);
                                    return next;
                                  });
                                  fetchAds(adset.adset_id, { force: true });
                                }}
                              >
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Tentar novamente
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : getFilteredAds(adset.adset_id).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={colSpan}>
                            <div className="pl-14 py-2 text-sm text-muted-foreground">
                              {filterActiveAds && (adsByAdset[adset.adset_id] || []).length > 0
                                ? "Nenhum anúncio ativo encontrado."
                                : "Nenhum anúncio encontrado."
                              }
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {getFilteredAds(adset.adset_id).map((ad) => (
                            <TableRow key={ad.ad_id} className="bg-muted/10 hover:bg-muted/30">
                              <TableCell className="font-medium" style={{ width: nameColumnWidth, minWidth: 120 }}>
                                <div className="flex items-center gap-2 pl-12">
                                  {ad.thumbnail_url && (
                                    <img
                                      src={ad.thumbnail_url}
                                      alt={`Miniatura do anúncio ${ad.ad_name}`}
                                      loading="lazy"
                                      className="h-8 w-8 rounded object-cover shrink-0"
                                    />
                                  )}
                                  <span className="truncate text-sm text-muted-foreground" style={{ maxWidth: Math.max(40, nameColumnWidth - 96) }}>{ad.ad_name}</span>
                                </div>
                              </TableCell>
                              {visibleColumns.map((columnKey) => renderMetricCell(columnKey, ad))}
                            </TableRow>
                          ))}
                          {/* Linha de Total / Média dos anúncios */}
                          <TableRow className="border-t">
                            <TableCell className="font-bold">
                              <div className="pl-12">
                                Total / Média ({getFilteredAds(adset.adset_id).length} anúncios)
                              </div>
                            </TableCell>
                            {visibleColumns.map((columnKey) => 
                              renderCombinedSummaryCell(columnKey, getAdsSummary(adset.adset_id), getAdsAverage(adset.adset_id))
                            )}
                          </TableRow>
                        </>
                      )}
                    </>
                  )}
                </Fragment>
              ))}
              {/* Linha de Total / Média dos conjuntos - só aparece quando não há foco em adset */}
              {!focusedAdsetId && (
                <TableRow className="border-t-2">
                  <TableCell className="font-bold">
                    <div className="pl-6">
                      Total / Média ({filteredAdsets.length} conjuntos)
                    </div>
                  </TableCell>
                  {visibleColumns.map((columnKey) => 
                    renderCombinedSummaryCell(columnKey, adsetsSummary, adsetsAverage)
                  )}
                </TableRow>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
