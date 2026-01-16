import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Phone, Mail, Calendar, MessageCircle, Trash2, CheckSquare, Square, X, UserPlus, MessageSquare } from "lucide-react";
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
import { LeadCampaignBadge } from "@/components/leads/LeadCampaignBadge";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { useTabPersistence } from "@/hooks/useTabPersistence";

export default function Leads() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [origemFilter, setOrigemFilter] = useTabPersistence("origem", "whatsapp");
  
  // Period filter
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd, filterByPeriod } = usePeriodFilter("max");
  
  // Selection state for bulk delete
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { data: leads, isLoading } = useLeads(); // Sem filtro de status - exclui apenas "cliente" por padrão

  // Filtra por período primeiro
  const leadsInPeriod = filterByPeriod(leads);

  // Função para verificar origem original do lead
  const isWhatsAppOrigin = (origem: string | null) => {
    const o = (origem || "").toLowerCase();
    return o === "whatsapp" || o === "";
  };

  const isDisparosOrigin = (origem: string | null) => {
    return (origem || "").toLowerCase() === "disparos";
  };

  // Conta leads por origem ORIGINAL no período
  const leadsWhatsAppCount = leadsInPeriod?.filter((lead) => isWhatsAppOrigin(lead.origem)).length || 0;
  const leadsDisparosCount = leadsInPeriod?.filter((lead) => isDisparosOrigin(lead.origem)).length || 0;

  // Leads de WhatsApp que também têm CHAT REAL em Disparos (para mostrar na aba Disparos como "extras")
  const whatsAppLeadsWithDisparos = leadsInPeriod?.filter((lead) => 
    isWhatsAppOrigin(lead.origem) && lead.hasDisparosChat
  ) || [];

  // Leads de Disparos que também têm CHAT REAL em WhatsApp (para mostrar na aba WhatsApp como "extras")
  const disparosLeadsWithWhatsApp = leadsInPeriod?.filter((lead) => 
    isDisparosOrigin(lead.origem) && lead.hasWhatsAppChat
  ) || [];

  // Filtra por origem baseado em CHATS REAIS
  const leadsByOrigem = leadsInPeriod?.filter((lead) => {
    if (origemFilter === "whatsapp") {
      // Aba WhatsApp: leads originalmente de WhatsApp + leads de Disparos que TÊM chat real em WhatsApp
      return isWhatsAppOrigin(lead.origem) || (isDisparosOrigin(lead.origem) && lead.hasWhatsAppChat);
    }
    // Aba Disparos: leads originalmente de Disparos + leads de WhatsApp que TÊM chat real em Disparos
    return isDisparosOrigin(lead.origem) || (isWhatsAppOrigin(lead.origem) && lead.hasDisparosChat);
  });

  // Marca quais leads são "extras" (aparecendo em aba diferente da origem, baseado em chat real)
  const isExtraLead = (lead: typeof leads[0]) => {
    if (origemFilter === "disparos") {
      return isWhatsAppOrigin(lead.origem) && lead.hasDisparosChat;
    }
    if (origemFilter === "whatsapp") {
      return isDisparosOrigin(lead.origem) && lead.hasWhatsAppChat;
    }
    return false;
  };

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
                size="sm"
                onClick={toggleSelectionMode}
                title="Selecionar leads"
              >
                <CheckSquare className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline text-sm">Selecionar</span>
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
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {origemFilter === "whatsapp" ? (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  WhatsApp: <strong className="text-foreground">{leadsWhatsAppCount}</strong>
                </span>
                {disparosLeadsWithWhatsApp.length > 0 && (
                  <>
                    <span className="text-border">|</span>
                    <span className="flex items-center gap-1.5 text-amber-600">
                      +{disparosLeadsWithWhatsApp.length} de Disparos
                    </span>
                  </>
                )}
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Disparos: <strong className="text-foreground">{leadsDisparosCount}</strong>
                </span>
                {whatsAppLeadsWithDisparos.length > 0 && (
                  <>
                    <span className="text-border">|</span>
                    <span className="flex items-center gap-1.5 text-amber-600">
                      +{whatsAppLeadsWithDisparos.length} de WhatsApp
                    </span>
                  </>
                )}
              </>
            )}
          </div>
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

      {/* Lista de Leads */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : filteredLeads && filteredLeads.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => {
            const isExtra = isExtraLead(lead);
            return (
            <Card 
              key={lead.id} 
              className={`p-6 shadow-card hover:shadow-elegant transition-all animate-fade-in flex flex-col h-full ${
                selectedLeadIds.has(lead.id) ? 'ring-2 ring-primary bg-accent/50' : ''
              } ${isSelectionMode ? 'cursor-pointer' : ''} ${isExtra ? 'border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/20' : ''}`}
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
                    {isExtra && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 flex-shrink-0">
                        {origemFilter === "disparos" ? "Via WhatsApp" : "Via Disparos"}
                      </span>
                    )}
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

                  {/* Respondeu badge - only show for Disparos leads */}
                  {origemFilter === "disparos" && (
                    <div className="flex items-center gap-2">
                      {lead.respondeu ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                          <MessageSquare className="h-3 w-3" />
                          Respondeu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          Aguardando resposta
                        </span>
                      )}
                    </div>
                  )}

                  {/* Attribution / Campaign info */}
                  <LeadCampaignBadge lead={lead} />

                  {/* Show all presences (instances where this contact appeared) */}
                  {(() => {
                    // Build presence badges - include current tab's presence if lead is "extra"
                    const presences = lead.allPresences || [];
                    const hasWhatsAppPresence = presences.some(p => p.origem?.toLowerCase() === "whatsapp");
                    const hasDisparosPresence = presences.some(p => p.origem?.toLowerCase() !== "whatsapp");
                    
                    // If this is an "extra" lead, ensure the current tab's presence is shown
                    const shouldAddWhatsAppBadge = isExtra && origemFilter === "whatsapp" && !hasWhatsAppPresence && lead.hasWhatsAppChat;
                    const shouldAddDisparosBadge = isExtra && origemFilter === "disparos" && !hasDisparosPresence && lead.hasDisparosChat;
                    
                    const allBadges: Array<{ label: string; isWhatsApp: boolean; date?: string }> = [];
                    
                    // Add existing presences
                    presences.forEach((presence) => {
                      const label = presence.origem?.toLowerCase() === "whatsapp"
                        ? "WhatsApp"
                        : presence.instancia_nome || "Disparos";
                      allBadges.push({
                        label,
                        isWhatsApp: presence.origem?.toLowerCase() === "whatsapp",
                        date: presence.created_at
                      });
                    });
                    
                    // Add missing badges for extra leads
                    if (shouldAddWhatsAppBadge) {
                      allBadges.push({ label: "WhatsApp", isWhatsApp: true });
                    }
                    if (shouldAddDisparosBadge) {
                      allBadges.push({ label: "Disparos", isWhatsApp: false });
                    }
                    
                    if (allBadges.length === 0) return null;
                    
                    return (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="flex flex-wrap gap-1">
                          {allBadges.map((badge, idx) => (
                            <span
                              key={`${badge.label}-${idx}`}
                              className={`text-xs px-2 py-0.5 rounded ${
                                badge.isWhatsApp
                                  ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                                  : "bg-accent text-accent-foreground"
                              }`}
                              title={badge.date ? `Primeiro contato: ${new Date(badge.date).toLocaleDateString('pt-BR')}` : undefined}
                            >
                              {badge.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
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
                        // Se for lead "extra", usar a origem da aba atual, não a origem original
                        const chatOrigem = isExtra 
                          ? (origemFilter === "disparos" ? "disparos" : "whatsapp")
                          : lead.origem;
                        navigateToChat(navigate, lead.telefone, chatOrigem);
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
          );
          })}
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
