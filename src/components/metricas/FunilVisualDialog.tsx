import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Users, 
  Calendar, 
  Handshake, 
  CheckCircle,
  DollarSign,
  TrendingUp,
  TrendingDown
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
      color: "#64748b",
      bgColor: "bg-slate-500",
      metric: data.spend > 0 && data.leads > 0 ? `CPL: ${formatCurrency(data.spend / data.leads)}` : null,
    },
    {
      name: "Agendados",
      value: data.agendados,
      icon: Calendar,
      color: "#3b82f6",
      bgColor: "bg-blue-500",
      metric: data.spend > 0 && data.agendados > 0 ? `CPA: ${formatCurrency(data.spend / data.agendados)}` : null,
      conversionRate: data.leads > 0 ? formatPercentage(data.agendados, data.leads) : null,
    },
    {
      name: "Em Negociação",
      value: data.em_negociacao,
      icon: Handshake,
      color: "#eab308",
      bgColor: "bg-yellow-500",
      metric: null,
      conversionRate: data.agendados > 0 ? formatPercentage(data.em_negociacao, data.agendados) : null,
    },
    {
      name: "Clientes",
      value: data.clientes,
      icon: CheckCircle,
      color: "#22c55e",
      bgColor: "bg-green-500",
      metric: data.spend > 0 && data.clientes > 0 ? `CAC: ${formatCurrency(data.spend / data.clientes)}` : null,
      conversionRate: data.leads > 0 ? formatPercentage(data.clientes, data.leads) : null,
    },
  ];

  const roas = data.spend > 0 ? data.valor_fechado / data.spend : 0;
  const maxValue = Math.max(...stages.map(s => s.value), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">
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

        <div className="py-2">
          {/* Investimento */}
          {data.spend > 0 && (
            <div className="text-center mb-4 p-2 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">Investimento</p>
              <p className="text-xl font-bold">{formatCurrency(data.spend)}</p>
            </div>
          )}

          {/* Funil Visual em formato de trapézio */}
          <div className="relative flex flex-col items-center">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              // Calcular largura proporcional ao valor (formato de funil)
              const widthPercent = maxValue > 0 
                ? Math.max(25, (stage.value / maxValue) * 100) 
                : 100 - (index * 20);
              
              // Calcular o clip-path para formato de trapézio
              const nextWidthPercent = index < stages.length - 1 
                ? Math.max(25, (stages[index + 1].value / maxValue) * 100)
                : widthPercent * 0.8;
              
              const leftInset = (100 - widthPercent) / 2;
              const rightInset = (100 - widthPercent) / 2;
              const nextLeftInset = (100 - nextWidthPercent) / 2;
              const nextRightInset = (100 - nextWidthPercent) / 2;

              return (
                <div key={stage.name} className="w-full flex flex-col items-center">
                  {/* Trapézio do funil */}
                  <div 
                    className="relative transition-all duration-500 ease-out"
                    style={{ 
                      width: '100%',
                      height: '70px',
                    }}
                  >
                    <svg 
                      viewBox="0 0 100 100" 
                      preserveAspectRatio="none"
                      className="absolute inset-0 w-full h-full"
                    >
                      <polygon
                        points={`${leftInset},0 ${100 - rightInset},0 ${100 - nextRightInset},100 ${nextLeftInset},100`}
                        fill={stage.color}
                        className="transition-all duration-500"
                      />
                    </svg>
                    
                    {/* Conteúdo sobre o trapézio */}
                    <div className="absolute inset-0 flex items-center justify-between px-4 text-white z-10">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        <div>
                          <p className="font-semibold text-sm">{stage.name}</p>
                          {stage.metric && (
                            <p className="text-xs opacity-90">{stage.metric}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">{stage.value}</p>
                        {stage.conversionRate && (
                          <p className="text-xs opacity-90">{stage.conversionRate}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resultado Final */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span className="text-xs text-green-600 font-medium">Faturamento</span>
              </div>
              <p className="text-xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(data.valor_fechado)}
              </p>
            </div>
            
            <div className={`p-3 rounded-lg border ${
              roas >= 1 
                ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900" 
                : roas > 0 
                  ? "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-200 dark:border-yellow-900"
                  : "bg-muted/50 border-border"
            }`}>
              <div className="flex items-center gap-2 mb-1">
                {roas >= 1 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-yellow-600" />
                )}
                <span className={`text-xs font-medium ${roas >= 1 ? "text-green-600" : "text-yellow-600"}`}>ROAS</span>
              </div>
              <p className={`text-xl font-bold ${
                roas >= 1 ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"
              }`}>
                {roas > 0 ? `${roas.toFixed(2)}x` : "—"}
              </p>
              {roas > 0 && data.spend > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {roas >= 1 
                    ? `+${formatCurrency(data.valor_fechado - data.spend)}`
                    : `-${formatCurrency(data.spend - data.valor_fechado)}`
                  }
                </p>
              )}
            </div>
          </div>

          {/* Taxas de Conversão */}
          <div className="mt-3 p-2 bg-muted/30 rounded-lg">
            <p className="text-xs font-medium mb-2">Taxas de Conversão</p>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-1.5 rounded bg-background">
                <p className="text-muted-foreground text-[10px]">Lead → Agend.</p>
                <p className="font-semibold text-blue-600">
                  {formatPercentage(data.agendados, data.leads)}
                </p>
              </div>
              <div className="p-1.5 rounded bg-background">
                <p className="text-muted-foreground text-[10px]">Agend. → Negoc.</p>
                <p className="font-semibold text-yellow-600">
                  {formatPercentage(data.em_negociacao, data.agendados)}
                </p>
              </div>
              <div className="p-1.5 rounded bg-background">
                <p className="text-muted-foreground text-[10px]">Lead → Cliente</p>
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
