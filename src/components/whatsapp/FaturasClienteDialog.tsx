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
import { DollarSign, FileText, Calendar } from "lucide-react";

export interface FaturaResumo {
  id: string;
  valor: number;
  status: string;
  observacoes: string | null;
  data_fatura: string | null;
  created_at: string;
  meio_pagamento: string | null;
  forma_pagamento: string | null;
  procedimento_nome: string | null;
  profissional_nome: string | null;
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
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const negociacoes = faturas.filter((f) => f.status === "negociacao");
  const fechadas = faturas.filter((f) => f.status === "fechado");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Faturas — {clienteNome}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-2">
          <div className="space-y-4">
            {negociacoes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-2 flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  Em Negociação ({negociacoes.length})
                </h4>
                <div className="space-y-2">
                  {negociacoes.map((f) => (
                    <FaturaCard key={f.id} fatura={f} formatCurrency={formatCurrency} />
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
                <div className="space-y-2">
                  {fechadas.map((f) => (
                    <FaturaCard key={f.id} fatura={f} formatCurrency={formatCurrency} />
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
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FaturaCard({
  fatura,
  formatCurrency,
}: {
  fatura: FaturaResumo;
  formatCurrency: (v: number) => string;
}) {
  return (
    <div className="border rounded-lg p-3 space-y-1.5 bg-card">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm">
          {formatCurrency(fatura.valor)}
        </span>
        <Badge
          variant={fatura.status === "fechado" ? "default" : "secondary"}
          className="text-[10px]"
        >
          {fatura.status === "fechado" ? "Fechado" : "Negociação"}
        </Badge>
      </div>

      {fatura.procedimento_nome && (
        <p className="text-xs text-muted-foreground">{fatura.procedimento_nome}</p>
      )}

      {fatura.profissional_nome && (
        <p className="text-xs text-muted-foreground">Dr(a). {fatura.profissional_nome}</p>
      )}

      {fatura.meio_pagamento && (
        <p className="text-xs text-muted-foreground capitalize">
          {fatura.meio_pagamento}{fatura.forma_pagamento ? ` — ${fatura.forma_pagamento}` : ""}
        </p>
      )}

      {fatura.observacoes && (
        <p className="text-xs text-muted-foreground line-clamp-2">{fatura.observacoes}</p>
      )}

      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1">
        <Calendar className="w-3 h-3" />
        {fatura.data_fatura
          ? format(new Date(fatura.data_fatura), "dd/MM/yyyy", { locale: ptBR })
          : format(new Date(fatura.created_at), "dd/MM/yyyy", { locale: ptBR })}
      </div>
    </div>
  );
}
