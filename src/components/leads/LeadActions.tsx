import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Calendar, UserX, CalendarPlus, Trash2, Edit } from "lucide-react";
import { fromZonedTime } from "date-fns-tz";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { EditarClienteDialog } from "@/components/clientes/EditarClienteDialog";
import { Lead } from "@/hooks/useLeads";
import { getLast8Digits } from "@/utils/phoneFormat";

interface LeadActionsProps {
  leadId: string;
  leadNome: string;
  leadTelefone?: string;
  leadEmail?: string;
  leadOrigem?: string; // Origem do lead para passar ao agendamento
  compactMode?: boolean;
  iconOnly?: boolean;
  gridMode?: boolean;
  editMode?: boolean;
}


export function LeadActions({
  leadId,
  leadNome,
  leadTelefone,
  leadEmail,
  leadOrigem,
  compactMode = false,
  iconOnly = false,
  gridMode = false,
  editMode = false
}: LeadActionsProps) {
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [agendamentoOpen, setAgendamentoOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editarClienteOpen, setEditarClienteOpen] = useState(false);
  const [leadData, setLeadData] = useState<{ nome: string; telefone?: string; email?: string } | undefined>();
  const [leadCompleto, setLeadCompleto] = useState<Lead | null>(null);

  // Follow-up state
  const [dataFollowUp, setDataFollowUp] = useState("");
  const [observacaoFollowUp, setObservacaoFollowUp] = useState("");

  const queryClient = useQueryClient();

  // Buscar dados do lead quando abrir o diálogo de agendamento ou edição
  // Prioriza nome do cliente existente (status = cliente) com mesmo telefone
  useEffect(() => {
    if (agendamentoOpen || editarClienteOpen) {
      const carregarLead = async () => {
        const { data: lead } = await supabase
          .from("leads")
          .select("*")
          .eq("id", leadId)
          .single();
        
        if (lead) {
          setLeadCompleto(lead as Lead);
          
          // Buscar se existe cliente cadastrado com mesmo telefone (últimos 8 dígitos)
          const last8Digits = getLast8Digits(lead.telefone);
          if (last8Digits && last8Digits.length >= 8) {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: allClientes } = await supabase
                  .from("leads")
                  .select("nome, email, telefone")
                  .eq("user_id", user.id)
                  .eq("status", "cliente")
                  .is("deleted_at", null);

                const clienteExistente = allClientes?.find(cliente => 
                  getLast8Digits(cliente.telefone) === last8Digits
                );

                if (clienteExistente) {
                  // Usar nome do cliente existente
                  setLeadData({
                    nome: clienteExistente.nome,
                    telefone: lead.telefone || leadTelefone,
                    email: clienteExistente.email || lead.email || leadEmail,
                  });
                  return;
                }
              }
            } catch (error) {
              // Fallback para dados do lead
            }
          }
          
          // Fallback: usar dados do próprio lead
          setLeadData({
            nome: lead.nome || leadNome,
            telefone: lead.telefone || leadTelefone,
            email: lead.email || leadEmail,
          });
        } else {
          setLeadData({
            nome: leadNome,
            telefone: leadTelefone,
            email: leadEmail,
          });
        }
      };
      carregarLead();
    }
  }, [agendamentoOpen, editarClienteOpen, leadId, leadNome, leadTelefone, leadEmail]);

  const marcarSemInteresse = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("leads")
        .update({ status: "sem_interesse" })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead marcado como sem interesse");
    },
    onError: () => {
      toast.error("Erro ao marcar lead");
    }
  });

  const agendarFollowUp = useMutation({
    mutationFn: async () => {
      const dataHoraSP = new Date(`${dataFollowUp}T12:00:00`);
      const iso = fromZonedTime(dataHoraSP, 'America/Sao_Paulo').toISOString();
      
      const { error } = await supabase
        .from("leads")
        .update({
          status: "follow_up",
          data_agendamento: iso,
          observacoes: observacaoFollowUp || null
        })
        .eq("id", leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Follow-up agendado com sucesso!");
      setFollowUpOpen(false);
      setDataFollowUp("");
      setObservacaoFollowUp("");
    },
    onError: () => {
      toast.error("Erro ao agendar follow-up");
    }
  });


  const deletarLead = useMutation({
    mutationFn: async () => {
      console.log('Tentando deletar lead:', leadId);
      
      // Refresh da sessão antes de operações críticas
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('Nenhuma sessão ativa encontrada');
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      // Usar RPC ou service role para soft delete, pois UPDATE com RLS pode causar problemas
      const { error } = await supabase.rpc('soft_delete_lead', { lead_id: leadId });
      
      if (error) {
        console.error('Erro ao deletar lead:', error);
        throw error;
      }
      console.log('Lead deletado com sucesso');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Lead deletado com sucesso");
      setDeleteOpen(false);
    },
    onError: (error: any) => {
      console.error('Erro na mutation:', error);
      if (error?.message?.includes('Sessão expirada')) {
        toast.error('Sua sessão expirou. Faça login novamente.');
        setTimeout(() => window.location.href = '/auth', 2000);
      } else {
        toast.error(`Erro ao deletar lead: ${error.message || 'Erro desconhecido'}`);
      }
    }
  });

  const handleFollowUpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dataFollowUp || !observacaoFollowUp.trim()) {
      toast.error("Data e observação são obrigatórios");
      return;
    }
    agendarFollowUp.mutate();
  };

  return (
    <>
      {gridMode ? (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setAgendamentoOpen(true);
          }}
        >
          <CalendarPlus className="h-4 w-4" />
        </Button>
      ) : editMode ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            setEditarClienteOpen(true);
          }}
        >
          <Edit className="h-4 w-4" />
        </Button>
      ) : iconOnly ? (
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteOpen(true);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : compactMode ? (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" onClick={() => setAgendamentoOpen(true)} className="w-full bg-gradient-primary">
            <CalendarPlus className="h-4 w-4 mr-2" />
            Agendar
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)} className="w-full">
            <Trash2 className="h-4 w-4 mr-2" />
            Deletar
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => setFollowUpOpen(true)} className="w-full">
            <Calendar className="h-4 w-4 mr-2" />
            Follow-up
          </Button>

          <Button size="sm" onClick={() => setAgendamentoOpen(true)} className="w-full bg-gradient-primary">
            <CalendarPlus className="h-4 w-4 mr-2" />
            Agendar
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => marcarSemInteresse.mutate()}
            disabled={marcarSemInteresse.isPending}
            className="w-full"
          >
            <UserX className="h-4 w-4 mr-2" />
            Sem Interesse
          </Button>

        </div>
      )}

      {/* Dialog Follow-up */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar Follow-up - {leadNome}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleFollowUpSubmit} className="space-y-4">
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
              <Label htmlFor="observacao">Observação</Label>
              <Textarea
                id="observacao"
                value={observacaoFollowUp}
                onChange={(e) => setObservacaoFollowUp(e.target.value)}
                placeholder="Motivo do follow-up, próximos passos..."
                rows={4}
                required
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setFollowUpOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={agendarFollowUp.isPending}>
                {agendarFollowUp.isPending ? "Agendando..." : "Agendar Follow-up"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Agendamento - usa NovoAgendamentoDialog com regras de disponibilidade */}
      <NovoAgendamentoDialog
        open={agendamentoOpen}
        onOpenChange={(open) => {
          setAgendamentoOpen(open);
          if (!open) {
            // Atualizar lista de leads quando fechar o diálogo
            queryClient.invalidateQueries({ queryKey: ["leads"] });
          }
        }}
        initialData={leadData}
        origem={leadOrigem === "whatsapp" || leadOrigem === "WhatsApp" ? "WhatsApp" : leadOrigem === "disparos" || leadOrigem === "Disparos" ? "Disparos" : undefined}
      />

      {/* AlertDialog Deletar */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja deletar o lead <strong>{leadNome}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletarLead.mutate()}
              disabled={deletarLead.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletarLead.isPending ? "Deletando..." : "Deletar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Editar Cliente/Lead */}
      {leadCompleto && (
        <EditarClienteDialog
          cliente={leadCompleto}
          open={editarClienteOpen}
          onOpenChange={setEditarClienteOpen}
        />
      )}
    </>
  );
}
