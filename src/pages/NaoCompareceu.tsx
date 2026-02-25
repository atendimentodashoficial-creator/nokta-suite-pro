import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Clock, User, Phone, MessageCircle, RefreshCw, Trash2, FileText, UserX, CheckSquare, Square, X, Columns3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAgendamentos, useDeleteAgendamento } from "@/hooks/useAgendamentos";
import { formatInTimeZone } from "date-fns-tz";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { toast } from "sonner";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ReagendarDialog } from "@/components/clientes/ReagendarDialog";
import { KanbanMoverDialog } from "@/components/clientes/KanbanMoverDialog";

export default function NaoCompareceu() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState<any>(null);
  const [deleteAgendamentoState, setDeleteAgendamentoState] = useState<any>(null);
  const [dialogReagendarOpen, setDialogReagendarOpen] = useState(false);
  
  // Selection state for bulk delete
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedAgendamentoIds, setSelectedAgendamentoIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [kanbanMoverOpen, setKanbanMoverOpen] = useState(false);
  const [kanbanMoverTelefone, setKanbanMoverTelefone] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const deleteAgendamento = useDeleteAgendamento();
  
  // Period filter - default to this month
  const {
    periodFilter,
    setPeriodFilter,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    filterByPeriod,
  } = usePeriodFilter("this_month");
  
  const { data: todosAgendamentos, isLoading } = useAgendamentos();

  // Filter by status and period
  const agendamentosCancelados = (todosAgendamentos?.filter(ag => ag.status === "cancelado") || [])
    .filter(ag => {
      const agDate = new Date(ag.data_agendamento);
      const startOfPeriod = new Date(dateStart.getFullYear(), dateStart.getMonth(), dateStart.getDate(), 0, 0, 0, 0);
      const endOfPeriod = new Date(dateEnd.getFullYear(), dateEnd.getMonth(), dateEnd.getDate(), 23, 59, 59, 999);
      return agDate >= startOfPeriod && agDate <= endOfPeriod;
    });

  const filteredAgendamentos = agendamentosCancelados.filter((agendamento) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      agendamento.leads?.nome?.toLowerCase().includes(searchLower) ||
      agendamento.leads?.telefone?.includes(searchTerm)
    );
  });

  const handleReagendar = (agendamento: any) => {
    setAgendamentoSelecionado(agendamento);
    setDialogReagendarOpen(true);
  };

  const handleDeletar = (agendamento: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteAgendamentoState(agendamento);
  };

  const confirmarDeletar = async () => {
    if (!deleteAgendamentoState) return;
    try {
      await deleteAgendamento.mutateAsync(deleteAgendamentoState.id);
      toast.success("Agendamento deletado com sucesso");
      setDeleteAgendamentoState(null);
    } catch (error) {
      toast.error("Erro ao deletar agendamento");
    }
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedAgendamentoIds(new Set());
  };

  // Toggle agendamento selection
  const toggleAgendamentoSelection = (agendamentoId: string, e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedAgendamentoIds(prev => {
      const next = new Set(prev);
      if (next.has(agendamentoId)) {
        next.delete(agendamentoId);
      } else {
        next.add(agendamentoId);
      }
      return next;
    });
  };

  // Select all agendamentos
  const selectAllAgendamentos = () => {
    const allIds = new Set(filteredAgendamentos.map(a => a.id));
    setSelectedAgendamentoIds(allIds);
  };

  // Deselect all agendamentos
  const deselectAllAgendamentos = () => {
    setSelectedAgendamentoIds(new Set());
  };

  // Bulk delete selected agendamentos
  const handleBulkDelete = async () => {
    if (selectedAgendamentoIds.size === 0) return;
    
    setIsBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedAgendamentoIds);
      
      // Delete one by one to ensure logging
      for (const id of idsToDelete) {
        await deleteAgendamento.mutateAsync(id);
      }
      
      toast.success(`${idsToDelete.length} agendamento(s) excluído(s) com sucesso!`);
      
      setSelectedAgendamentoIds(new Set());
      setIsSelectionMode(false);
      setBulkDeleteDialogOpen(false);
    } catch (error: any) {
      console.error('Error deleting agendamentos:', error);
      toast.error('Erro ao excluir agendamentos');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const allSelected = filteredAgendamentos.length > 0 && filteredAgendamentos.every(a => selectedAgendamentoIds.has(a.id));
  const someSelected = selectedAgendamentoIds.size > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          {isSelectionMode ? (
            <>
              <Button variant="ghost" size="icon" onClick={toggleSelectionMode}>
                <X className="w-5 h-5" />
              </Button>
              <span className="font-semibold text-lg">{selectedAgendamentoIds.size} selecionado(s)</span>
            </>
          ) : (
            <>
              <UserX className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Não Compareceu</h1>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {isSelectionMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={allSelected ? deselectAllAgendamentos : selectAllAgendamentos}
              >
                {allSelected ? (
                  <>
                    <Square className="w-4 h-4 mr-2" />
                    Desmarcar todos
                  </>
                ) : (
                  <>
                    <CheckSquare className="w-4 h-4 mr-2" />
                    Selecionar todos
                  </>
                )}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkDeleteDialogOpen(true)}
                disabled={!someSelected}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir ({selectedAgendamentoIds.size})
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectionMode}
              title="Selecionar agendamentos"
            >
              <CheckSquare className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline text-sm">Selecionar</span>
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamentos selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedAgendamentoIds.size} agendamento(s). 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBulkDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Period Filter and Search */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-col gap-4">
          <PeriodFilter
            showLabel
            value={periodFilter}
            onChange={setPeriodFilter}
            dateStart={dateStart}
            dateEnd={dateEnd}
            onDateStartChange={setDateStart}
            onDateEndChange={setDateEnd}
          />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou telefone..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {/* Agendamentos Cancelados */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : filteredAgendamentos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgendamentos.map((agendamento: any) => (
            <Card 
              key={agendamento.id} 
              className={`shadow-card hover:shadow-elegant transition-all flex flex-col h-full ${
                selectedAgendamentoIds.has(agendamento.id) ? 'ring-2 ring-primary bg-accent/50' : ''
              } ${isSelectionMode ? 'cursor-pointer' : ''}`}
              onClick={() => isSelectionMode && toggleAgendamentoSelection(agendamento.id)}
            >
              <CardContent className="p-6 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1">
                    {isSelectionMode && (
                      <Checkbox
                        checked={selectedAgendamentoIds.has(agendamento.id)}
                        onCheckedChange={() => toggleAgendamentoSelection(agendamento.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0"
                      />
                    )}
                    <div className="space-y-2 flex-1">
                      <h3 className="font-semibold text-lg">{agendamento.leads?.nome}</h3>
                      <Badge className="bg-red-500/20 text-red-700">Não Compareceu</Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm mt-4">
                  {agendamento.leads?.telefone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      {formatPhoneDisplay(agendamento.leads.telefone)}
                    </div>
                  )}
                  {agendamento.profissionais?.nome && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      {agendamento.profissionais.nome}
                    </div>
                  )}
                  {(agendamento.tipo || agendamento.procedimentos?.nome) && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      {agendamento.tipo && agendamento.procedimentos?.nome
                        ? `${agendamento.tipo} - ${agendamento.procedimentos.nome}`
                        : agendamento.procedimentos?.nome || agendamento.tipo}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {formatInTimeZone(agendamento.data_agendamento as any, 'America/Sao_Paulo', "dd/MM/yyyy 'às' HH:mm")}
                  </div>
                </div>

                {agendamento.observacoes && (
                  <p className="text-sm text-muted-foreground italic mt-2">
                    {agendamento.observacoes}
                  </p>
                )}

                <div className="flex-1" />

                <div className="pt-3 border-t border-border grid grid-cols-4 gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReagendar(agendamento)}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToChat(navigate, agendamento.leads?.telefone || '', agendamento.leads?.origem);
                    }}
                    disabled={!agendamento.leads?.telefone}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setKanbanMoverTelefone(agendamento.leads?.telefone || null);
                      setKanbanMoverOpen(true);
                    }}
                    disabled={!agendamento.leads?.telefone}
                    title="Mover no Kanban"
                  >
                    <Columns3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDeletar(agendamento, e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12">
          <p className="text-center text-muted-foreground">
            Nenhum agendamento de não comparecimento encontrado
          </p>
        </Card>
      )}

      {/* Dialog para reagendar */}
      <ReagendarDialog
        open={dialogReagendarOpen}
        onOpenChange={(open) => {
          setDialogReagendarOpen(open);
          if (!open) setAgendamentoSelecionado(null);
        }}
        agendamento={agendamentoSelecionado}
      />

      {/* AlertDialog Deletar */}
      {deleteAgendamentoState && (
        <AlertDialog open={!!deleteAgendamentoState} onOpenChange={(open) => !open && setDeleteAgendamentoState(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja deletar o agendamento de <strong>{deleteAgendamentoState.leads?.nome}</strong>? 
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmarDeletar}
                disabled={deleteAgendamento.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteAgendamento.isPending ? "Deletando..." : "Deletar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <KanbanMoverDialog
        open={kanbanMoverOpen}
        onOpenChange={(open) => {
          setKanbanMoverOpen(open);
          if (!open) setKanbanMoverTelefone(null);
        }}
        clienteTelefone={kanbanMoverTelefone}
      />
    </div>
  );
}
