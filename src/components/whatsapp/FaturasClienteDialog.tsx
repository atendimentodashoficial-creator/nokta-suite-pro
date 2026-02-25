import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DollarSign, FileText, Calendar, ChevronRight, ArrowLeft, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RetornoResumo {
  id: string;
  data_agendamento: string;
  status: string;
  procedimento_nome: string | null;
  profissional_nome: string | null;
}

export interface FaturaResumo {
  id: string;
  valor: number;
  status: string;
  observacoes: string | null;
  data_fatura: string | null;
  data_follow_up: string | null;
  created_at: string;
  meio_pagamento: string | null;
  forma_pagamento: string | null;
  procedimento_nome: string | null;
  profissional_nome: string | null;
  retornos?: RetornoResumo[];
}

interface FaturasClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faturas: FaturaResumo[];
  clienteNome: string;
}

export function FaturasClienteDialog({
  open,
  onOpenChange,
  faturas,
  clienteNome,
}: FaturasClienteDialogProps) {
  const [selectedFatura, setSelectedFatura] = useState<FaturaResumo | null>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const negociacoes = faturas.filter((f) => f.status === "negociacao");
  const fechadas = faturas.filter((f) => f.status === "fechado");

  const handleClose = (v: boolean) => {
    if (!v) setSelectedFatura(null);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {selectedFatura ? (
              <button
                onClick={() => setSelectedFatura(null)}
                className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>
            ) : (
              <>Faturas — {clienteNome}</>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          {selectedFatura ? (
            <FaturaDetalhes fatura={selectedFatura} formatCurrency={formatCurrency} />
          ) : (
            <div className="space-y-4">
              {negociacoes.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    Em Negociação ({negociacoes.length})
                  </h4>
                  <div className="space-y-1.5">
                    {negociacoes.map((f) => (
                      <FaturaRow
                        key={f.id}
                        fatura={f}
                        formatCurrency={formatCurrency}
                        onClick={() => setSelectedFatura(f)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {fechadas.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-green-600 dark:text-green-400 mb-2 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Faturas Fechadas ({fechadas.length})
                  </h4>
                  <div className="space-y-1.5">
                    {fechadas.map((f) => (
                      <FaturaRow
                        key={f.id}
                        fatura={f}
                        formatCurrency={formatCurrency}
                        onClick={() => setSelectedFatura(f)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {faturas.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma fatura encontrada.
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** Compact row shown in the list */
function FaturaRow({
  fatura,
  formatCurrency,
  onClick,
}: {
  fatura: FaturaResumo;
  formatCurrency: (v: number) => string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full border rounded-lg px-3 py-2.5 flex items-center justify-between bg-card hover:bg-accent/50 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-semibold text-sm whitespace-nowrap">
          {formatCurrency(fatura.valor)}
        </span>
        {fatura.procedimento_nome && (
          <span className="text-xs text-muted-foreground truncate">
            {fatura.procedimento_nome}
          </span>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
    </button>
  );
}

/** Full details shown when a fatura is selected */
function FaturaDetalhes({
  fatura,
  formatCurrency,
}: {
  fatura: FaturaResumo;
  formatCurrency: (v: number) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-lg font-bold">{formatCurrency(fatura.valor)}</span>
        <Badge
          variant={fatura.status === "fechado" ? "default" : "secondary"}
          className="text-xs"
        >
          {fatura.status === "fechado" ? "Fechado" : "Negociação"}
        </Badge>
      </div>

      <div className="space-y-3 text-sm">
        {fatura.procedimento_nome && (
          <div>
            <span className="text-xs text-muted-foreground">Procedimento</span>
            <p>{fatura.procedimento_nome}</p>
          </div>
        )}

        {fatura.profissional_nome && (
          <div>
            <span className="text-xs text-muted-foreground">Profissional</span>
            <p>Dr(a). {fatura.profissional_nome}</p>
          </div>
        )}

        {fatura.meio_pagamento && (
          <div>
            <span className="text-xs text-muted-foreground">Pagamento</span>
            <p className="capitalize">
              {fatura.meio_pagamento}
              {fatura.forma_pagamento ? ` — ${fatura.forma_pagamento}` : ""}
            </p>
          </div>
        )}

        {fatura.data_follow_up && (
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <div>
              <span className="text-xs text-muted-foreground">Follow-up: </span>
              <span className="text-xs">
                {format(new Date(fatura.data_follow_up + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {fatura.data_fatura
              ? format(new Date(fatura.data_fatura + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })
              : format(new Date(fatura.created_at), "dd/MM/yyyy", { locale: ptBR })}
          </span>
        </div>

        {fatura.observacoes && (
          <div>
            <span className="text-xs text-muted-foreground">Observações</span>
            <p className="text-xs whitespace-pre-wrap mt-0.5">{fatura.observacoes}</p>
          </div>
        )}

        {fatura.retornos && fatura.retornos.length > 0 && (
          <div>
            <h5 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1.5 flex items-center gap-1">
              <RotateCcw className="w-3 h-3" />
              Retornos ({fatura.retornos.length})
            </h5>
            <div className="space-y-1.5">
              {fatura.retornos.map((r) => {
                const rDate = new Date(r.data_agendamento);
                const statusMap: Record<string, string> = {
                  agendado: "Agendado",
                  confirmado: "Confirmado",
                  realizado: "Realizado",
                  cancelado: "Não compareceu",
                };
                return (
                  <div key={r.id} className="border rounded-md px-2.5 py-2 bg-purple-50 dark:bg-purple-950/30 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">
                        {format(rDate, "dd/MM/yyyy", { locale: ptBR })} às {format(rDate, "HH:mm")}
                      </span>
                      <Badge variant="secondary" className="text-[10px] bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300">
                        {statusMap[r.status] || r.status}
                      </Badge>
                    </div>
                    {r.procedimento_nome && (
                      <p className="text-[11px] text-muted-foreground">{r.procedimento_nome}</p>
                    )}
                    {r.profissional_nome && (
                      <p className="text-[11px] text-muted-foreground">Dr(a). {r.profissional_nome}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
