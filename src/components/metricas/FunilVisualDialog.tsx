import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Calendar, 
  Handshake, 
  CheckCircle,
  DollarSign,
  TrendingDown,
  ArrowDown
} from "lucide-react";

interface FunnelData {
  campaign_name: string;
  adset_name: string | null;
  ad_name: string | null;
  leads: number;
  agendados: number;
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
    if (total === 0) return "0%";
    return `${((value / total) * 100).toFixed(1)}%`;
  };

  const stages = [
    {
      name: "Leads",
      value: data.leads,
      icon: Users,
      color: "bg-slate-500",
      textColor: "text-slate-600",
      bgLight: "bg-slate-100",
      metric: data.spend > 0 && data.leads > 0 ? `CPL: ${formatCurrency(data.spend / data.leads)}` : null,
    },
    {
      name: "Agendados",
      value: data.agendados,
      icon: Calendar,
      color: "bg-blue-500",
      textColor: "text-blue-600",
      bgLight: "bg-blue-100",
      metric: data.spend > 0 && data.agendados > 0 ? `CPA: ${formatCurrency(data.spend / data.agendados)}` : null,
      conversion: data.leads > 0 ? formatPercentage(data.agendados, data.leads) : null,
    },
    {
      name: "Em Negociação",
      value: data.em_negociacao,
      icon: Handshake,
      color: "bg-yellow-500",
      textColor: "text-yellow-600",
      bgLight: "bg-yellow-100",
      metric: null,
      conversion: data.agendados > 0 ? formatPercentage(data.em_negociacao, data.agendados) : null,
    },
    {
      name: "Clientes",
      value: data.clientes,
      icon: CheckCircle,
      color: "bg-green-500",
      textColor: "text-green-600",
      bgLight: "bg-green-100",
      metric: data.spend > 0 && data.clientes > 0 ? `CAC: ${formatCurrency(data.spend / data.clientes)}` : null,
      conversion: data.leads > 0 ? formatPercentage(data.clientes, data.leads) : null,
    },
  ];

  const roas = data.spend > 0 ? data.valor_fechado / data.spend : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">
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

        <div className="py-4">
          {/* Investimento */}
          {data.spend > 0 && (
            <div className="text-center mb-6 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground">Investimento</p>
              <p className="text-2xl font-bold">{formatCurrency(data.spend)}</p>
            </div>
          )}

          {/* Funil Visual */}
          <div className="relative flex flex-col items-center gap-2">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              // Calcular largura proporcional (mínimo 40%, máximo 100%)
              const maxValue = Math.max(...stages.map(s => s.value));
              const widthPercent = maxValue > 0 
                ? Math.max(40, (stage.value / maxValue) * 100) 
                : 100 - (index * 15);

              return (
                <div key={stage.name} className="w-full flex flex-col items-center">
                  {/* Seta de conversão */}
                  {index > 0 && stage.conversion && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground my-1">
                      <ArrowDown className="h-3 w-3" />
                      <span>{stage.conversion}</span>
                    </div>
                  )}
                  
                  {/* Barra do funil */}
                  <div 
                    className={`relative transition-all duration-500 ease-out ${stage.bgLight} rounded-lg p-4 flex items-center justify-between`}
                    style={{ width: `${widthPercent}%` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${stage.color} text-white`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={`font-semibold ${stage.textColor}`}>{stage.name}</p>
                        {stage.metric && (
                          <p className="text-xs text-muted-foreground">{stage.metric}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-2xl font-bold ${stage.textColor}`}>{stage.value}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resultado Final */}
          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600 font-medium">Faturamento</span>
              </div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(data.valor_fechado)}
              </p>
            </div>
            
            <div className={`p-4 rounded-lg border ${
              roas >= 1 
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900" 
                : roas > 0 
                  ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900"
                  : "bg-muted/50 border-border"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className={`h-4 w-4 ${roas >= 1 ? "text-green-600 rotate-180" : "text-yellow-600"}`} />
                <span className={`text-sm font-medium ${roas >= 1 ? "text-green-600" : "text-yellow-600"}`}>ROAS</span>
              </div>
              <p className={`text-2xl font-bold ${
                roas >= 1 ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"
              }`}>
                {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
              </p>
              {roas > 0 && data.spend > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {roas >= 1 
                    ? `Lucro: ${formatCurrency(data.valor_fechado - data.spend)}`
                    : `Prejuízo: ${formatCurrency(data.spend - data.valor_fechado)}`
                  }
                </p>
              )}
            </div>
          </div>

          {/* Taxas de Conversão */}
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <p className="text-sm font-medium mb-2">Taxas de Conversão</p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-muted-foreground">Lead → Agendado</p>
                <p className="font-semibold text-blue-600">
                  {formatPercentage(data.agendados, data.leads)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Agendado → Negoc.</p>
                <p className="font-semibold text-yellow-600">
                  {formatPercentage(data.em_negociacao, data.agendados)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Lead → Cliente</p>
                <p className="font-semibold text-green-600">
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
