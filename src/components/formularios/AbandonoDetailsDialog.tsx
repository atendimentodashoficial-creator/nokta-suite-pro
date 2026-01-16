import { format, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle, Circle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FormularioSessao, FormularioEtapa } from "@/hooks/useFormularios";

interface AbandonoDetailsDialogProps {
  sessao: (FormularioSessao & { 
    formularios_templates?: { nome: string; formularios_etapas: FormularioEtapa[] } | null 
  }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AbandonoDetailsDialog({ sessao, open, onOpenChange }: AbandonoDetailsDialogProps) {
  if (!sessao) return null;

  const etapas = sessao.formularios_templates?.formularios_etapas?.sort((a, b) => a.ordem - b.ordem) || [];
  const dadosParciais = sessao.dados_parciais || {};
  const tempoPorEtapa = sessao.tempo_por_etapa || {};

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const tempoTotal = sessao.abandoned_at 
    ? differenceInSeconds(new Date(sessao.abandoned_at), new Date(sessao.started_at))
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Abandono</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Formulário</p>
              <p className="font-medium">{sessao.formularios_templates?.nome || "-"}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Tempo Total na Sessão</p>
              <p className="font-medium">{formatDuration(tempoTotal)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Início</p>
              <p className="font-medium">
                {format(new Date(sessao.started_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Abandono</p>
              <p className="font-medium">
                {sessao.abandoned_at 
                  ? format(new Date(sessao.abandoned_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                  : "-"
                }
              </p>
            </div>
          </div>

          <Separator />

          <div>
            <h4 className="font-semibold mb-3">Progresso das Etapas</h4>
            <div className="grid grid-cols-1 gap-3">
              {etapas.map((etapa) => {
                // Buscar dados preenchidos desta etapa baseado na configuração
                const etapaConfig = etapa.configuracao as { 
                  campos?: { id: string; label?: string; nome?: string }[];
                  opcoes?: string[];
                } | null;
                
                let dadosEtapa: { key: string; value: unknown }[] = [];
                
                if (etapaConfig?.campos && etapaConfig.campos.length > 0) {
                  dadosEtapa = etapaConfig.campos
                    .map(campo => ({
                      key: campo.id,
                      value: dadosParciais[campo.id]
                    }))
                    .filter(d => d.value !== undefined && d.value !== null && d.value !== "");
                } else {
                  const value = dadosParciais[etapa.id];
                  if (value !== undefined && value !== null && value !== "") {
                    dadosEtapa = [{ key: etapa.id, value }];
                  }
                }
                
                // Uma etapa é completada se tem dados preenchidos
                const hasData = dadosEtapa.length > 0;
                const isCompleted = hasData;
                
                // A etapa abandonada é aquela sem dados que está na posição atual ou posterior
                // Encontrar a primeira etapa sem dados
                const isAbandoned = !hasData && etapas
                  .filter((e) => e.ordem < etapa.ordem)
                  .every((e) => {
                    // Verificar se etapas anteriores têm dados
                    const config = e.configuracao as { campos?: { id: string }[] } | null;
                    if (config?.campos && config.campos.length > 0) {
                      return config.campos.some(c => {
                        const val = dadosParciais[c.id];
                        return val !== undefined && val !== null && val !== "";
                      });
                    }
                    const val = dadosParciais[e.id];
                    return val !== undefined && val !== null && val !== "";
                  }) && etapas
                  .filter((e) => e.ordem > etapa.ordem)
                  .every((e) => {
                    // Verificar se etapas posteriores NÃO têm dados
                    const config = e.configuracao as { campos?: { id: string }[] } | null;
                    if (config?.campos && config.campos.length > 0) {
                      return !config.campos.some(c => {
                        const val = dadosParciais[c.id];
                        return val !== undefined && val !== null && val !== "";
                      });
                    }
                    const val = dadosParciais[e.id];
                    return val === undefined || val === null || val === "";
                  });
                
                return (
                  <div
                    key={etapa.id}
                    className={`bg-muted p-3 rounded-lg ${
                      isAbandoned 
                        ? "border-l-4 border-l-destructive" 
                        : isCompleted 
                          ? "border-l-4 border-l-green-500"
                          : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isCompleted ? (
                        <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : isAbandoned ? (
                        <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <p className="text-sm text-muted-foreground">{etapa.titulo}</p>
                      {isAbandoned && (
                        <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs ml-auto">
                          Abandonou aqui
                        </Badge>
                      )}
                    </div>
                    {dadosEtapa.length > 0 && (
                      <div className="mt-1 ml-6">
                        {dadosEtapa.map(({ key, value }) => (
                          <p key={key} className="font-medium">
                            {Array.isArray(value) ? value.join(", ") : String(value)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>


          {(sessao.utm_source || sessao.utm_medium || sessao.utm_campaign || sessao.fbclid || sessao.gclid) && (
            <>
              <Separator />
              <div>
                <h4 className="font-semibold mb-3">Parâmetros de Rastreamento</h4>
                <div className="grid grid-cols-2 gap-3">
                  {sessao.utm_source && (
                    <div>
                      <p className="text-sm text-muted-foreground">UTM Source</p>
                      <p className="font-medium">{sessao.utm_source}</p>
                    </div>
                  )}
                  {sessao.utm_medium && (
                    <div>
                      <p className="text-sm text-muted-foreground">UTM Medium</p>
                      <p className="font-medium">{sessao.utm_medium}</p>
                    </div>
                  )}
                  {sessao.utm_campaign && (
                    <div>
                      <p className="text-sm text-muted-foreground">UTM Campaign</p>
                      <p className="font-medium">{sessao.utm_campaign}</p>
                    </div>
                  )}
                  {sessao.fbclid && (
                    <div>
                      <p className="text-sm text-muted-foreground">Facebook Click ID</p>
                      <p className="font-medium text-xs truncate">{sessao.fbclid}</p>
                    </div>
                  )}
                  {sessao.gclid && (
                    <div>
                      <p className="text-sm text-muted-foreground">Google Click ID</p>
                      <p className="font-medium text-xs truncate">{sessao.gclid}</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
