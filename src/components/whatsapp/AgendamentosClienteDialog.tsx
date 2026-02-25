import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO, isToday, isTomorrow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronRight, ArrowLeft, Clock, User, FileText, RefreshCw } from "lucide-react";

export interface AgendamentoResumo {
  id: string;
  data_agendamento: string;
  status: string;
  tipo: string;
  observacoes: string | null;
  data_follow_up: string | null;
  numero_reagendamentos: number;
  origem_agendamento: string | null;
  procedimento_nome: string | null;
  profissional_nome: string | null;
}

interface AgendamentosClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamentos: AgendamentoResumo[];
  clienteNome: string;
}

function getStatusInfo(status: string, dataAgendamento: string) {
  const date = parseISO(dataAgendamento);
  const hoje = isToday(date);
  const amanha = isTomorrow(date);
  const passado = isPast(date) && !hoje;

  if (status === "realizado") return { label: "Realizado", variant: "default" as const, color: "text-blue-700 dark:text-blue-400" };
  if (status === "cancelado") return { label: "Não compareceu", variant: "destructive" as const, color: "text-red-700 dark:text-red-400" };
  if (status === "confirmado") {
    if (hoje) return { label: "Confirmado · Hoje", variant: "default" as const, color: "text-green-700 dark:text-green-400" };
    return { label: "Confirmado", variant: "default" as const, color: "text-green-700 dark:text-green-400" };
  }
  // agendado
  if (passado) return { label: "Atrasado", variant: "secondary" as const, color: "text-yellow-700 dark:text-yellow-400" };
  if (hoje) return { label: "Hoje", variant: "default" as const, color: "text-green-700 dark:text-green-400" };
  if (amanha) return { label: "Amanhã", variant: "secondary" as const, color: "text-orange-700 dark:text-orange-400" };
  return { label: "Agendado", variant: "secondary" as const, color: "text-foreground" };
}

export function AgendamentosClienteDialog({
  open,
  onOpenChange,
  agendamentos,
  clienteNome,
}: AgendamentosClienteDialogProps) {
  const [selected, setSelected] = useState<AgendamentoResumo | null>(null);

  const handleClose = (v: boolean) => {
    if (!v) setSelected(null);
    onOpenChange(v);
  };

  // Separate by status groups
  const pendentes = agendamentos.filter(a => a.status === "agendado" || a.status === "confirmado");
  const realizados = agendamentos.filter(a => a.status === "realizado");
  const cancelados = agendamentos.filter(a => a.status === "cancelado");

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {selected ? (
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
            ) : (
              <>Consultas — {clienteNome}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {selected ? (
            <AgendamentoDetalhes agendamento={selected} />
          ) : (
            <div className="space-y-4">
              {pendentes.length > 0 && (
                <AgendamentoGroup
                  title="Pendentes"
                  icon={<Calendar className="w-3 h-3" />}
                  colorClass="text-blue-600 dark:text-blue-400"
                  items={pendentes}
                  onSelect={setSelected}
                />
              )}
              {realizados.length > 0 && (
                <AgendamentoGroup
                  title="Realizados"
                  icon={<Calendar className="w-3 h-3" />}
                  colorClass="text-green-600 dark:text-green-400"
                  items={realizados}
                  onSelect={setSelected}
                />
              )}
              {cancelados.length > 0 && (
                <AgendamentoGroup
                  title="Não Compareceu"
                  icon={<Calendar className="w-3 h-3" />}
                  colorClass="text-red-600 dark:text-red-400"
                  items={cancelados}
                  onSelect={setSelected}
                />
              )}
              {agendamentos.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum agendamento encontrado.
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function AgendamentoGroup({
  title,
  icon,
  colorClass,
  items,
  onSelect,
}: {
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  items: AgendamentoResumo[];
  onSelect: (a: AgendamentoResumo) => void;
}) {
  return (
    <div>
      <h4 className={`text-xs font-semibold ${colorClass} mb-2 flex items-center gap-1`}>
        {icon}
        {title} ({items.length})
      </h4>
      <div className="space-y-1.5">
        {items.map((a) => (
          <AgendamentoRow key={a.id} agendamento={a} onClick={() => onSelect(a)} />
        ))}
      </div>
    </div>
  );
}

function AgendamentoRow({
  agendamento,
  onClick,
}: {
  agendamento: AgendamentoResumo;
  onClick: () => void;
}) {
  const date = parseISO(agendamento.data_agendamento);
  const statusInfo = getStatusInfo(agendamento.status, agendamento.data_agendamento);

  return (
    <button
      onClick={onClick}
      className="w-full border rounded-lg px-3 py-2.5 flex items-center justify-between bg-card hover:bg-accent/50 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-sm font-medium whitespace-nowrap">
          {format(date, "dd/MM", { locale: ptBR })} às {format(date, "HH:mm")}
        </span>
        {agendamento.procedimento_nome && (
          <span className="text-xs text-muted-foreground truncate">
            {agendamento.procedimento_nome}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

function AgendamentoDetalhes({ agendamento }: { agendamento: AgendamentoResumo }) {
  const date = parseISO(agendamento.data_agendamento);
  const statusInfo = getStatusInfo(agendamento.status, agendamento.data_agendamento);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">
          {format(date, "dd/MM/yyyy", { locale: ptBR })} às {format(date, "HH:mm")}
        </span>
        <Badge variant={statusInfo.variant} className="text-xs">
          {statusInfo.label}
        </Badge>
      </div>

      <div className="space-y-3 text-sm">
        {agendamento.procedimento_nome && (
          <div>
            <span className="text-xs text-muted-foreground">Procedimento</span>
            <p>{agendamento.procedimento_nome}</p>
          </div>
        )}

        {agendamento.profissional_nome && (
          <div>
            <span className="text-xs text-muted-foreground">Profissional</span>
            <p>Dr(a). {agendamento.profissional_nome}</p>
          </div>
        )}

        {agendamento.tipo && (
          <div>
            <span className="text-xs text-muted-foreground">Tipo</span>
            <p className="capitalize">{agendamento.tipo}</p>
          </div>
        )}

        {agendamento.origem_agendamento && (
          <div>
            <span className="text-xs text-muted-foreground">Origem</span>
            <p className="capitalize">{agendamento.origem_agendamento}</p>
          </div>
        )}

        {agendamento.numero_reagendamentos > 0 && (
          <div className="flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs">
              {agendamento.numero_reagendamentos} reagendamento{agendamento.numero_reagendamentos > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {agendamento.data_follow_up && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <span className="text-xs text-muted-foreground">Follow-up: </span>
              <span className="text-xs">
                {format(new Date(agendamento.data_follow_up + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
        )}

        {agendamento.observacoes && (
          <div>
            <span className="text-xs text-muted-foreground">Observações</span>
            <p className="text-xs whitespace-pre-wrap mt-0.5">{agendamento.observacoes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
