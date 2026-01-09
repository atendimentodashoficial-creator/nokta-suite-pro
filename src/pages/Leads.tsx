import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Phone, Mail, Calendar, MessageCircle, Trash2, CheckSquare, Square, X, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLeads } from "@/hooks/useLeads";
import { LeadForm } from "@/components/leads/LeadForm";
import { LeadActions } from "@/components/leads/LeadActions";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function Leads() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [origemFilter, setOrigemFilter] = useState<"whatsapp" | "disparos">("whatsapp");
  
  // Selection state for bulk delete
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { data: leads, isLoading } = useLeads("lead");

  // Filtra por origem (WhatsApp ou Disparos)
  const leadsByOrigem = leads?.filter((lead) => {
    const origem = (lead.origem || "").toLowerCase();
    if (origemFilter === "whatsapp") {
      return origem === "whatsapp" || origem === "";
    }
    return origem === "disparos";
  });

  const filteredLeads = leadsByOrigem?.filter((lead) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      lead.nome.toLowerCase().includes(searchLower) ||
      lead.telefone.includes(searchTerm) ||
      (lead.email && lead.email.toLowerCase().includes(searchLower))
    );
  });

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedLeadIds(new Set());
  };

  // Toggle lead selection
  const toggleLeadSelection = (leadId: string, e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedLeadIds(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  };

  // Select all leads
  const selectAllLeads = () => {
    const allIds = new Set(filteredLeads?.map(l => l.id) || []);
    setSelectedLeadIds(allIds);
  };

  // Deselect all leads
  const deselectAllLeads = () => {
    setSelectedLeadIds(new Set());
  };

  // Bulk delete selected leads using the soft_delete_lead RPC function
  const handleBulkDelete = async () => {
    if (selectedLeadIds.size === 0) return;
    
    setIsDeleting(true);
    try {
      const idsToDelete = Array.from(selectedLeadIds);
      
      // Use the soft_delete_lead function for each lead (respects RLS via SECURITY DEFINER)
      const deletePromises = idsToDelete.map(id => 
        supabase.rpc('soft_delete_lead', { lead_id: id })
      );
      
      const results = await Promise.all(deletePromises);
      
      // Check if any failed
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        console.error('Some deletes failed:', errors);
        if (errors.length === idsToDelete.length) {
          throw errors[0].error;
        }
        toast.warning(`${idsToDelete.length - errors.length} lead(s) excluído(s), ${errors.length} falharam.`);
      } else {
        toast.success(`${idsToDelete.length} lead(s) excluído(s) com sucesso!`);
      }
      
      // Invalidate queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
      
      // Clear selection
      setSelectedLeadIds(new Set());
      setIsSelectionMode(false);
      setDeleteDialogOpen(false);
    } catch (error: any) {
      console.error('Error deleting leads:', error);
      toast.error('Erro ao excluir leads');
    } finally {
      setIsDeleting(false);
    }
  };

  const allSelected = (filteredLeads?.length || 0) > 0 && filteredLeads?.every(l => selectedLeadIds.has(l.id));
  const someSelected = selectedLeadIds.size > 0;

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
              <span className="font-semibold text-lg">{selectedLeadIds.size} selecionado(s)</span>
            </>
          ) : (
            <>
              <UserPlus className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Leads</h1>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {isSelectionMode ? (
            <>
              <Button
                variant="outline"
                onClick={allSelected ? deselectAllLeads : selectAllLeads}
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
                onClick={() => setDeleteDialogOpen(true)}
                disabled={!someSelected}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir ({selectedLeadIds.size})
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={toggleSelectionMode}
                title="Selecionar leads"
              >
                <CheckSquare className="w-4 h-4" />
                <span className="ml-2 hidden md:inline">Selecionar</span>
              </Button>
              <LeadForm />
            </>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir leads selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedLeadIds.size} lead(s). 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Tabs de origem */}
      <Tabs value={origemFilter} onValueChange={(v) => {
        setOrigemFilter(v as "whatsapp" | "disparos");
        setSelectedLeadIds(new Set());
      }}>
        <TabsList className="h-8">
          <TabsTrigger value="whatsapp" className="text-xs px-3 h-7">WhatsApp</TabsTrigger>
          <TabsTrigger value="disparos" className="text-xs px-3 h-7">Disparos</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search */}
      <Card className="p-4 shadow-card">
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

      {/* Lista de Leads */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredLeads && filteredLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => (
            <Card 
              key={lead.id} 
              className={`p-6 shadow-card hover:shadow-elegant transition-all animate-fade-in flex flex-col h-full ${
                selectedLeadIds.has(lead.id) ? 'ring-2 ring-primary bg-accent/50' : ''
              } ${isSelectionMode ? 'cursor-pointer' : ''}`}
              onClick={() => isSelectionMode && toggleLeadSelection(lead.id)}
            >
              <div className="flex flex-col flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isSelectionMode && (
                      <Checkbox
                        checked={selectedLeadIds.has(lead.id)}
                        onCheckedChange={() => toggleLeadSelection(lead.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-shrink-0"
                      />
                    )}
                    <h3 className="text-lg font-semibold text-foreground truncate">{lead.nome}</h3>
                  </div>
                  {!isSelectionMode && (
                    <LeadActions 
                      leadId={lead.id} 
                      leadNome={lead.nome}
                      leadTelefone={lead.telefone}
                      leadEmail={lead.email || undefined}
                      leadOrigem={lead.origem}
                      editMode
                    />
                  )}
                </div>
                
                <div className="space-y-3 text-sm mt-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{formatPhoneDisplay(lead.telefone)}</span>
                  </div>
                  
                  {lead.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{lead.email}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>Lead desde {new Date(lead.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>

                  {/* Mostrar instância apenas para leads de Disparos */}
                  {origemFilter === "disparos" && lead.instancia_nome && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="text-xs bg-accent px-2 py-0.5 rounded">
                        {lead.instancia_nome}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1" />

                {!isSelectionMode && (
                  <div className="pt-3 border-t border-border grid grid-cols-3 gap-2 mt-4">
                    <LeadActions 
                      leadId={lead.id} 
                      leadNome={lead.nome}
                      leadTelefone={lead.telefone}
                      leadEmail={lead.email || undefined}
                      leadOrigem={lead.origem}
                      gridMode
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToChat(navigate, lead.telefone, lead.origem);
                      }}
                    >
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <LeadActions 
                      leadId={lead.id} 
                      leadNome={lead.nome}
                      leadTelefone={lead.telefone}
                      leadEmail={lead.email || undefined}
                      leadOrigem={lead.origem}
                      iconOnly
                    />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12">
          <p className="text-center text-muted-foreground">
            Nenhum lead encontrado
          </p>
        </Card>
      )}
    </div>
  );
}
