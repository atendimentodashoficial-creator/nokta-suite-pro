import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lead } from "@/hooks/useLeads";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

interface EditarLeadDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarLeadDialog({ lead, open, onOpenChange }: EditarLeadDialogProps) {
  const [dataFollowUp, setDataFollowUp] = useState("");
  const [observacoes, setObservacoes] = useState("");
  
  const queryClient = useQueryClient();

  useEffect(() => {
    if (lead) {
      const dateStr = lead.data_agendamento ? formatInTimeZone(lead.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd') : "";
      setDataFollowUp(dateStr);
      setObservacoes(lead.observacoes || "");
    }
  }, [lead]);

  const atualizarLead = useMutation({
    mutationFn: async () => {
      if (!lead) return;

      const iso = dataFollowUp
        ? fromZonedTime(new Date(`${dataFollowUp}T12:00:00`), 'America/Sao_Paulo').toISOString()
        : null;

      const { error } = await supabase
        .from("leads")
        .update({
          data_agendamento: iso,
          observacoes: observacoes || null,
        })
        .eq("id", lead.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Follow-up atualizado com sucesso!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao atualizar follow-up");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataFollowUp) {
      toast.error("Data do follow-up é obrigatória");
      return;
    }
    atualizarLead.mutate();
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Follow-up - {lead.nome}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dataFollowUp">Data do Follow-up</Label>
            <Input
              id="dataFollowUp"
              type="date"
              value={dataFollowUp}
              onChange={(e) => setDataFollowUp(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Motivo do follow-up, próximos passos..."
              rows={4}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={atualizarLead.isPending}>
              {atualizarLead.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
