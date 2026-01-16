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
            <h4 className="font-semibold mb-4">Progresso das Etapas</h4>
            <div className="space-y-3">
              {etapas.map((etapa) => {
                const isCompleted = etapa.ordem < sessao.etapa_atual;
                const isCurrent = etapa.ordem === sessao.etapa_atual;
                const isAbandoned = isCurrent;
                
                // Buscar dados preenchidos desta etapa baseado na configuração
                const etapaConfig = etapa.configuracao as { campos?: { nome: string; label?: string }[] } | null;
                const camposEtapa = etapaConfig?.campos || [];
                const dadosEtapa = camposEtapa
                  .map(campo => ({
                    key: campo.nome,
                    label: campo.label || campo.nome,
                    value: dadosParciais[campo.nome]
                  }))
                  .filter(d => d.value !== undefined && d.value !== null && d.value !== "");
                
                return (
                  <div
                    key={etapa.id}
                    className={`p-3 rounded-lg border ${
                      isAbandoned 
                        ? "border-destructive/50 bg-destructive/5" 
                        : isCompleted 
                          ? "border-green-500/50 bg-green-500/5"
                          : "border-muted"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {isCompleted ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : isAbandoned ? (
                          <XCircle className="h-5 w-5 text-destructive" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">Etapa {etapa.ordem}: {etapa.titulo}</p>
                          {isAbandoned && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                              Abandonou aqui
                            </Badge>
                          )}
                        </div>
                        {etapa.descricao && (
                          <p className="text-sm text-muted-foreground">{etapa.descricao}</p>
                        )}
                        {tempoPorEtapa[etapa.ordem.toString()] && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Tempo: {formatDuration(tempoPorEtapa[etapa.ordem.toString()])}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Dados preenchidos nesta etapa */}
                    {dadosEtapa.length > 0 && (
                      <div className="mt-3 ml-8 space-y-2">
                        {dadosEtapa.map(({ key, label, value }) => (
                          <div key={key} className="bg-muted/50 p-2 rounded text-sm">
                            <span className="text-muted-foreground capitalize">{label.replace(/_/g, " ")}: </span>
                            <span className="font-medium">
                              {Array.isArray(value) ? value.join(", ") : String(value)}
                            </span>
                          </div>
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
