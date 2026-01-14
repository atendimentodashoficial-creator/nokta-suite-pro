import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Users, 
  Calendar, 
  Handshake, 
  CheckCircle,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowDown,
  UserX,
  UserCheck
} from "lucide-react";

interface FunnelData {
  campaign_name: string;
  adset_name: string | null;
  ad_name: string | null;
  leads: number;
  agendados: number;
  compareceu: number;
  nao_compareceu: number;
  em_negociacao: number;
  clientes: number;
  valor_fechado: number;
  spend: number;
}

interface FunilVisualDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: FunnelData | null;
}

export function FunilVisualDialog({ open, onOpenChange, data }: FunilVisualDialogProps) {
  if (!data) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const formatPercentage = (value: number, total: number) => {
    if (total === 0) return "0.0%";
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  const stages = [
    {
      name: "Leads",
      value: data.leads,
      icon: Users,
      bgColor: "bg-slate-500",
      textColor: "text-slate-600",
      bgLight: "bg-slate-100 dark:bg-slate-900/50",
      width: 100,
      metric: data.spend > 0 && data.leads > 0 ? `CPL: ${formatCurrency(data.spend / data.leads)}` : null,
    },
    {
      name: "Agendados",
      value: data.agendados,
      icon: Calendar,
      bgColor: "bg-blue-500",
      textColor: "text-blue-600",
      bgLight: "bg-blue-100 dark:bg-blue-900/50",
      width: 88,
      metric: data.spend > 0 && data.agendados > 0 ? `CPA: ${formatCurrency(data.spend / data.agendados)}` : null,
      conversionRate: formatPercentage(data.agendados, data.leads),
    },
    {
      name: "Compareceu",
      value: data.compareceu,
      icon: UserCheck,
      bgColor: "bg-emerald-500",
      textColor: "text-emerald-600",
      bgLight: "bg-emerald-100 dark:bg-emerald-900/50",
      width: 76,
      metric: null,
      conversionRate: formatPercentage(data.compareceu, data.agendados),
    },
    {
      name: "Não Compareceu",
      value: data.nao_compareceu,
      icon: UserX,
      bgColor: "bg-red-500",
      textColor: "text-red-600",
      bgLight: "bg-red-100 dark:bg-red-900/50",
      width: 76,
      metric: null,
      conversionRate: formatPercentage(data.nao_compareceu, data.agendados),
      isNegative: true,
    },
    {
      name: "Negociação",
      value: data.em_negociacao,
      icon: Handshake,
      bgColor: "bg-yellow-500",
      textColor: "text-yellow-600",
      bgLight: "bg-yellow-100 dark:bg-yellow-900/50",
      width: 64,
      metric: null,
      conversionRate: formatPercentage(data.em_negociacao, data.agendados),
    },
    {
      name: "Clientes",
      value: data.clientes,
      icon: CheckCircle,
      bgColor: "bg-green-500",
      textColor: "text-green-600",
      bgLight: "bg-green-100 dark:bg-green-900/50",
      width: 52,
      metric: data.spend > 0 && data.clientes > 0 ? `CAC: ${formatCurrency(data.spend / data.clientes)}` : null,
      conversionRate: formatPercentage(data.clientes, data.leads),
    },
  ];

  const roas = data.spend > 0 ? data.valor_fechado / data.spend : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">
            <span className="block truncate">{data.campaign_name}</span>
            {data.adset_name && (
              <span className="block text-sm font-normal text-muted-foreground truncate mt-1">
                {data.adset_name}
              </span>
            )}
            {data.ad_name && (
              <span className="block text-xs font-normal text-muted-foreground/70 truncate">
                {data.ad_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 space-y-4">
          {/* Investimento */}
          {data.spend > 0 && (
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Investimento</p>
              <p className="text-lg sm:text-xl font-bold">{formatCurrency(data.spend)}</p>
            </div>
          )}

          {/* Funil Visual com cards diminuindo */}
          <div className="relative flex flex-col items-center gap-1">
            {stages.map((stage, index) => {
              const Icon = stage.icon;

              return (
                <div key={stage.name} className="w-full flex flex-col items-center">
                  {/* Seta de conversão entre etapas */}
                  {index > 0 && stage.conversionRate && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground my-1">
                      <ArrowDown className="h-3 w-3" />
                      <span>{stage.conversionRate}</span>
                    </div>
                  )}
                  
                  {/* Card do funil */}
                  <div 
                    className={`${stage.bgLight} rounded-lg p-2 sm:p-3 flex items-center justify-between transition-all duration-300 min-w-0`}
                    style={{ width: `${Math.max(stage.width, 70)}%` }}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className={`p-1 sm:p-1.5 rounded-full ${stage.bgColor} text-white flex-shrink-0`}>
                        <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className={`font-semibold text-xs sm:text-sm ${stage.textColor} truncate`}>{stage.name}</p>
                        {stage.metric && (
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stage.metric}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-2">
                      <p className={`text-lg sm:text-xl font-bold ${stage.textColor}`}>{stage.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resultado Final */}
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div className="p-2 sm:p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                <span className="text-[10px] sm:text-xs text-green-600 font-medium">Faturamento</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(data.valor_fechado)}
              </p>
            </div>
            
            <div className={`p-2 sm:p-3 rounded-lg border ${
              roas >= 1 
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900" 
                : roas > 0 
                  ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900"
                  : "bg-muted/50 border-border"
            }`}>
              <div className="flex items-center gap-1.5 sm:gap-2 mb-1">
                {roas >= 1 ? (
                  <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-yellow-600" />
                )}
                <span className={`text-[10px] sm:text-xs font-medium ${roas >= 1 ? "text-green-600" : "text-yellow-600"}`}>ROAS</span>
              </div>
              <p className={`text-base sm:text-xl font-bold ${
                roas >= 1 ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"
              }`}>
                {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
              </p>
              {roas > 0 && data.spend > 0 && (
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                  {roas >= 1 
                    ? `+${formatCurrency(data.valor_fechado - data.spend)}`
                    : `-${formatCurrency(data.spend - data.valor_fechado)}`
                  }
                </p>
              )}
            </div>
          </div>

          {/* Taxas de Conversão */}
          <div className="p-2 bg-muted/30 rounded-lg">
            <p className="text-xs font-medium mb-2">Taxas de Conversão</p>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-center text-xs">
              <div className="p-1 sm:p-1.5 rounded bg-background">
                <p className="text-muted-foreground text-[9px] sm:text-[10px]">Lead → Agend.</p>
                <p className="font-semibold text-blue-600 text-xs sm:text-sm">
                  {formatPercentage(data.agendados, data.leads)}
                </p>
              </div>
              <div className="p-1 sm:p-1.5 rounded bg-background">
                <p className="text-muted-foreground text-[9px] sm:text-[10px]">Agend. → Negoc.</p>
                <p className="font-semibold text-yellow-600 text-xs sm:text-sm">
                  {formatPercentage(data.em_negociacao, data.agendados)}
                </p>
              </div>
              <div className="p-1 sm:p-1.5 rounded bg-background">
                <p className="text-muted-foreground text-[9px] sm:text-[10px]">Lead → Cliente</p>
                <p className="font-semibold text-green-600 text-xs sm:text-sm">
                  {formatPercentage(data.clientes, data.leads)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
