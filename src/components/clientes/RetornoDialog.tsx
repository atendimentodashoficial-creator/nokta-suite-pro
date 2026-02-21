import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFaturas } from "@/hooks/useFaturas";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DollarSign, FileText, User, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useUpdateAgendamentoStatus } from "@/hooks/useAgendamentos";

interface RetornoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string;
  clienteNome: string;
  agendamentoId: string;
}

export function RetornoDialog({
  open,
  onOpenChange,
  clienteId,
  clienteNome,
  agendamentoId,
}: RetornoDialogProps) {
  const [selectedFaturaId, setSelectedFaturaId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const updateStatus = useUpdateAgendamentoStatus();
  const { data: faturas, isLoading } = useFaturas();

  const clienteFaturas = faturas?.filter((f) => f.cliente_id === clienteId) || [];

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFaturaId) throw new Error("Selecione uma fatura");

      // Update agendamento with retorno_fatura_id and mark as realizado
      const { error } = await supabase
        .from("agendamentos")
        .update({
          retorno_fatura_id: selectedFaturaId,
          status: "realizado" as any,
        })
        .eq("id", agendamentoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["faturas"] });
      toast.success("Retorno registrado com sucesso!");
      setSelectedFaturaId(null);
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao registrar retorno:", error);
      toast.error("Erro ao registrar retorno");
    },
  });

  const handleClose = () => {
    setSelectedFaturaId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-blue-600" />
            Registrar Retorno
          </DialogTitle>
          <DialogDescription>
            Selecione a fatura referente a este retorno de <strong>{clienteNome}</strong>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 max-h-[50vh] pr-2">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Carregando faturas...</p>
          ) : clienteFaturas.length > 0 ? (
            <div className="space-y-2">
              {clienteFaturas.map((fatura) => (
                <Card
                  key={fatura.id}
                  onClick={() => setSelectedFaturaId(fatura.id)}
                  className={`p-3 cursor-pointer transition-all ${
                    selectedFaturaId === fatura.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {(fatura as any).procedimentos?.nome || "Sem procedimento"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-600 flex-shrink-0" />
                        <span className="text-sm font-semibold text-green-600">
                          R$ {Number(fatura.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {(fatura as any).profissionais?.nome && (
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-xs text-muted-foreground truncate">
                            {(fatura as any).profissionais.nome}
                          </span>
                        </div>
                      )}
                      <Badge
                        className={
                          fatura.status === "fechado"
                            ? "bg-green-500/20 text-green-700"
                            : "bg-yellow-500/20 text-yellow-700"
                        }
                      >
                        {fatura.status === "fechado" ? "Fechado" : "Negociação"}
                      </Badge>
                    </div>
                    {selectedFaturaId === fatura.id && (
                      <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Nenhuma fatura encontrada para este cliente.</p>
            </div>
          )}
        </ScrollArea>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 gap-2"
            disabled={!selectedFaturaId || confirmMutation.isPending}
            onClick={() => confirmMutation.mutate()}
          >
            <RotateCcw className="w-4 h-4" />
            {confirmMutation.isPending ? "Registrando..." : "Confirmar Retorno"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
