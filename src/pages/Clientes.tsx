import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Phone, Mail, Calendar, Tag, CalendarPlus, MessageCircle, Trash2, Edit, Users, CheckSquare, Square, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useLeads, Lead } from "@/hooks/useLeads";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { NovaFaturaDialog } from "@/components/clientes/NovaFaturaDialog";
import { NovoClienteDialog } from "@/components/clientes/NovoClienteDialog";
import { EditarClienteDialog } from "@/components/clientes/EditarClienteDialog";
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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";

export default function Clientes() {
  const [searchTerm, setSearchTerm] = useState("");
  const [clienteSelecionado, setClienteSelecionado] = useState<any>(null);
  const [novoAgendamentoOpen, setNovoAgendamentoOpen] = useState(false);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [clienteParaDeletar, setClienteParaDeletar] = useState<{ id: string; nome: string } | null>(null);
  const [editarClienteOpen, setEditarClienteOpen] = useState(false);
  const [clienteParaEditar, setClienteParaEditar] = useState<Lead | null>(null);
  
  // Period filter
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd, filterByPeriod } = usePeriodFilter("max");
  
  // Selection state for bulk delete
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedClienteIds, setSelectedClienteIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const { data: clientes, isLoading } = useLeads("cliente");
  
  // Filtra por período primeiro
  const clientesInPeriod = filterByPeriod(clientes);

  const handleAbrirAgendamento = (cliente: any) => {
    setClienteSelecionado(cliente);
    setNovoAgendamentoOpen(true);
  };

  const handleAbrirFatura = (cliente: any) => {
    setClienteSelecionado(cliente);
    setNovaFaturaOpen(true);
  };

  const deletarCliente = useMutation({
    mutationFn: async (clienteId: string) => {
      console.log('Tentando deletar cliente:', clienteId);
      
      // Refresh da sessão antes de operações críticas
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.error('Nenhuma sessão ativa encontrada');
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const { error } = await supabase.rpc('soft_delete_lead', {
        lead_id: clienteId
      });

      if (error) {
        console.error('Erro ao deletar cliente:', error);
        throw error;
      }
      console.log('Cliente deletado com sucesso');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      toast.success("Cliente deletado com sucesso");
      setDeleteOpen(false);
      setClienteParaDeletar(null);
    },
    onError: (error: any) => {
      console.error('Erro na mutation:', error);
      if (error?.message?.includes('Sessão expirada')) {
        toast.error('Sua sessão expirou. Faça login novamente.');
        setTimeout(() => window.location.href = '/auth', 2000);
      } else {
        toast.error(`Erro ao deletar cliente: ${error.message || 'Erro desconhecido'}`);
      }
    },
  });

  const handleDeletar = (cliente: { id: string; nome: string }) => {
    setClienteParaDeletar(cliente);
    setDeleteOpen(true);
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedClienteIds(new Set());
  };

  // Toggle cliente selection
  const toggleClienteSelection = (clienteId: string, e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedClienteIds(prev => {
      const next = new Set(prev);
      if (next.has(clienteId)) {
        next.delete(clienteId);
      } else {
        next.add(clienteId);
      }
      return next;
    });
  };

  // Select all clientes
  const selectAllClientes = () => {
    const allIds = new Set(filteredClientes?.map(c => c.id) || []);
    setSelectedClienteIds(allIds);
  };

  // Deselect all clientes
  const deselectAllClientes = () => {
    setSelectedClienteIds(new Set());
  };

  // Bulk delete selected clientes
  const handleBulkDelete = async () => {
    if (selectedClienteIds.size === 0) return;
    
    setIsBulkDeleting(true);
    try {
      const idsToDelete = Array.from(selectedClienteIds);
      
      const deletePromises = idsToDelete.map(id => 
        supabase.rpc('soft_delete_lead', { lead_id: id })
      );
      
      const results = await Promise.all(deletePromises);
      
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('Some deletes failed:', errors);
        if (errors.length === idsToDelete.length) {
          throw errors[0].error;
        }
        toast.warning(`${idsToDelete.length - errors.length} cliente(s) excluído(s), ${errors.length} falharam.`);
      } else {
        toast.success(`${idsToDelete.length} cliente(s) excluído(s) com sucesso!`);
      }
      
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      
      setSelectedClienteIds(new Set());
      setIsSelectionMode(false);
      setBulkDeleteDialogOpen(false);
    } catch (error: any) {
      console.error('Error deleting clientes:', error);
      toast.error('Erro ao excluir clientes');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const filteredClientes = clientesInPeriod?.filter((cliente) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      cliente.nome.toLowerCase().includes(searchLower) ||
      cliente.telefone.includes(searchTerm) ||
      (cliente.email && cliente.email.toLowerCase().includes(searchLower))
    );
  });

  const allSelected = (filteredClientes?.length || 0) > 0 && filteredClientes?.every(c => selectedClienteIds.has(c.id));
  const someSelected = selectedClienteIds.size > 0;

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
              <span className="font-semibold text-lg">{selectedClienteIds.size} selecionado(s)</span>
            </>
          ) : (
            <>
              <Users className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Clientes</h1>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {isSelectionMode ? (
            <>
              <Button
                variant="outline"
                onClick={allSelected ? deselectAllClientes : selectAllClientes}
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
                onClick={() => setBulkDeleteDialogOpen(true)}
                disabled={!someSelected}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir ({selectedClienteIds.size})
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectionMode}
                title="Selecionar clientes"
              >
                <CheckSquare className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline text-sm">Selecionar</span>
              </Button>
              <NovoClienteDialog />
            </>
          )}
        </div>
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir clientes selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedClienteIds.size} cliente(s). 
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

      {/* Period Filter & Search */}
      <Card className="p-4 shadow-card space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <PeriodFilter
            showLabel
            value={periodFilter}
            onChange={setPeriodFilter}
            dateStart={dateStart}
            dateEnd={dateEnd}
            onDateStartChange={setDateStart}
            onDateEndChange={setDateEnd}
          />
          <span className="text-sm text-muted-foreground">
            {clientesInPeriod?.length || 0} clientes no período
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            className="pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </Card>

      {/* Clientes Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredClientes && filteredClientes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClientes.map((cliente) => (
            <Card 
              key={cliente.id} 
              className={`p-6 shadow-card hover:shadow-elegant transition-all animate-fade-in flex flex-col h-full ${
                selectedClienteIds.has(cliente.id) ? 'ring-2 ring-primary bg-accent/50' : ''
              } ${isSelectionMode ? 'cursor-pointer' : ''}`}
              onClick={() => isSelectionMode && toggleClienteSelection(cliente.id)}
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isSelectionMode && (
                      <Checkbox
                        checked={selectedClienteIds.has(cliente.id)}
                        onCheckedChange={() => toggleClienteSelection(cliente.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-foreground break-words">{cliente.nome}</h3>
                      <Badge variant="outline" className="mt-1 bg-blue-500/10 text-blue-700 border-blue-500/20">
                        <Tag className="h-3 w-3 mr-1" />
                        Origem: {(cliente as any).origem || (cliente as any).origem_tipo || "Manual"}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      setClienteParaEditar(cliente);
                      setEditarClienteOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-3 text-sm mt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{formatPhoneDisplay(cliente.telefone)}</span>
                  </div>
                  
                  {cliente.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{cliente.email}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>Cliente desde {new Date(cliente.updated_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>

                <div className="flex-1" />

                <div className="pt-3 border-t border-border mt-4 space-y-2">
                  <Button 
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/clientes/${cliente.id}`);
                    }}
                  >
                    Ver Detalhes
                  </Button>
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAbrirAgendamento(cliente);
                      }}
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToChat(navigate, cliente.telefone, cliente.origem);
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletar({ id: cliente.id, nome: cliente.nome });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12">
          <p className="text-center text-muted-foreground">
            Nenhum cliente encontrado
          </p>
        </Card>
      )}

      {clienteSelecionado && (
        <>
          <NovoAgendamentoDialog
            open={novoAgendamentoOpen}
            onOpenChange={(open) => {
              setNovoAgendamentoOpen(open);
              if (!open) setClienteSelecionado(null);
            }}
            clienteId={clienteSelecionado.id}
            initialData={{
              nome: clienteSelecionado.nome,
              telefone: clienteSelecionado.telefone,
              email: clienteSelecionado.email || undefined,
            }}
          />
          <NovaFaturaDialog
            clienteId={clienteSelecionado.id}
            clienteNome={clienteSelecionado.nome}
            open={novaFaturaOpen}
            onOpenChange={(open) => {
              setNovaFaturaOpen(open);
              if (!open) setClienteSelecionado(null);
            }}
          />
          </>
        )}

      {/* AlertDialog Deletar */}
      {clienteParaDeletar && (
        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja deletar o cliente <strong>{clienteParaDeletar.nome}</strong>? 
                Esta ação não pode ser desfeita e irá remover todos os agendamentos e faturas relacionados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletarCliente.mutate(clienteParaDeletar.id)}
                disabled={deletarCliente.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletarCliente.isPending ? "Deletando..." : "Deletar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Dialog Editar Cliente */}
      {clienteParaEditar && (
        <EditarClienteDialog
          cliente={clienteParaEditar}
          open={editarClienteOpen}
          onOpenChange={setEditarClienteOpen}
        />
      )}
    </div>
  );
}