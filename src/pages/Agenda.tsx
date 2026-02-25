import { useState, useMemo } from "react";
import { useAgendamentos, useUpdateAgendamentoStatus, useDeleteAgendamento } from "@/hooks/useAgendamentos";
import { useLeads } from "@/hooks/useLeads";
import { useFaturas } from "@/hooks/useFaturas";
import { useProfissionais } from "@/hooks/useProfissionais";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Calendar, Calendar as CalendarIcon, Clock, User, Phone, Plus, Check, X, RefreshCw, MessageCircle, Trash2, FileText, Bell, History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { format, startOfDay, endOfDay, addDays, parseISO, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ReagendarDialog } from "@/components/clientes/ReagendarDialog";
import { NovaFaturaDialog } from "@/components/clientes/NovaFaturaDialog";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInTimeZone } from "date-fns-tz";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { AvisosTab } from "@/components/whatsapp/AvisosTab";
import { HistoricoAvisosTab } from "@/components/whatsapp/HistoricoAvisosTab";
import { DateRangeCalendars } from "@/components/filters/CalendarWithMonthSelect";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import { KanbanMoverDialog } from "@/components/clientes/KanbanMoverDialog";

export default function Agenda() {
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState<any>(null);
  const [activeTab, setActiveTab] = useTabPersistence("tab", "agendamentos");
  const [clienteParaFatura, setClienteParaFatura] = useState<{
    id: string;
    nome: string;
    procedimentoId?: string;
    profissionalId?: string;
    agendamentoId?: string;
    dataAgendamento?: string;
  } | null>(null);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [filtroProfissional, setFiltroProfissional] = useState<string>("all");
  const [novoAgendamentoOpen, setNovoAgendamentoOpen] = useState(false);
  const [deleteAgendamento, setDeleteAgendamento] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [kanbanMoverOpen, setKanbanMoverOpen] = useState(false);
  const [kanbanMoverTelefone, setKanbanMoverTelefone] = useState<string | null>(null);
  const [pendingNaoCompareceuId, setPendingNaoCompareceuId] = useState<string | null>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<string>("mes-atual");
  const [dataInicio, setDataInicio] = useState<Date>(startOfMonth(new Date()));
  const [dataFim, setDataFim] = useState<Date>(endOfMonth(new Date()));
  const navigate = useNavigate();
  const updateStatus = useUpdateAgendamentoStatus();
  const queryClient = useQueryClient();
  const {
    data: agendamentos,
    isLoading: loadingAgendamentos
  } = useAgendamentos();
  const {
    data: profissionais
  } = useProfissionais();
  const isLoading = loadingAgendamentos;

  // Calcular datas de início e fim baseado no filtro selecionado
  const {
    inicio,
    fim
  } = useMemo(() => {
    const hoje = new Date();
    switch (filtroPeriodo) {
      case "dia-atual":
        return {
          inicio: startOfDay(hoje),
          fim: endOfDay(hoje)
        };
      case "semana-atual":
        return {
          inicio: startOfWeek(hoje, {
            locale: ptBR
          }),
          fim: endOfWeek(hoje, {
            locale: ptBR
          })
        };
      case "semana-passada":
        const semanaPassada = subWeeks(hoje, 1);
        return {
          inicio: startOfWeek(semanaPassada, {
            locale: ptBR
          }),
          fim: endOfWeek(semanaPassada, {
            locale: ptBR
          })
        };
      case "proxima-semana":
        const proximaSemana = addDays(hoje, 7);
        return {
          inicio: startOfWeek(proximaSemana, {
            locale: ptBR
          }),
          fim: endOfWeek(proximaSemana, {
            locale: ptBR
          })
        };
      case "mes-atual":
        return {
          inicio: startOfMonth(hoje),
          fim: endOfMonth(hoje)
        };
      case "mes-passado":
        const mesPassado = subMonths(hoje, 1);
        return {
          inicio: startOfMonth(mesPassado),
          fim: endOfMonth(mesPassado)
        };
      case "proximo-mes":
        const proximoMes = addMonths(hoje, 1);
        return {
          inicio: startOfMonth(proximoMes),
          fim: endOfMonth(proximoMes)
        };
      case "personalizado":
        return {
          inicio: startOfDay(dataInicio),
          fim: endOfDay(dataFim)
        };
      default:
        return {
          inicio: startOfDay(hoje),
          fim: endOfDay(hoje)
        };
    }
  }, [filtroPeriodo, dataInicio, dataFim]);

  // Filtrar e agrupar agendamentos pelo período selecionado
  const agendamentosPorData = useMemo(() => {
    // Filtrar agendamentos pelo período
    let todosAgendamentos = (agendamentos || []).filter(ag => {
      const dataAg = parseISO(formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd'));
      // Excluir agendamentos cancelados (Não Compareceu) e realizados
      return dataAg >= startOfDay(inicio) && dataAg <= endOfDay(fim) && ag.status !== "cancelado" && ag.status !== "realizado";
    });

    // Aplicar filtro de profissional
    if (filtroProfissional !== "all") {
      todosAgendamentos = todosAgendamentos.filter(ag => ag.profissional_id === filtroProfissional);
    }

    // Aplicar filtro de busca
    if (searchTerm.trim()) {
      const termo = searchTerm.toLowerCase().trim();
      todosAgendamentos = todosAgendamentos.filter(ag => {
        const nome = (ag.leads?.nome || "").toLowerCase();
        const telefone = (ag.leads?.telefone || "").toLowerCase();
        const profissional = (ag.profissionais?.nome || "").toLowerCase();
        const procedimento = (ag.procedimentos?.nome || "").toLowerCase();
        const tipo = (ag.tipo || "").toLowerCase();
        return nome.includes(termo) || telefone.includes(termo) || profissional.includes(termo) || procedimento.includes(termo) || tipo.includes(termo);
      });
    }

    // Agrupar por data
    const grupos: {
      [key: string]: any[];
    } = {};
    todosAgendamentos.forEach(ag => {
      const dataKey = formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
      if (!grupos[dataKey]) grupos[dataKey] = [];
      grupos[dataKey].push(ag);
    });

    // Ordenar cada grupo por horário
    Object.keys(grupos).forEach(key => {
      grupos[key].sort((a, b) => {
        const timeA = formatInTimeZone(a.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm');
        const timeB = formatInTimeZone(b.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm');
        return timeA.localeCompare(timeB);
      });
    });

    // Retornar array ordenado por data
    return Object.keys(grupos).sort().map(dataKey => ({
      data: parseISO(dataKey),
      agendamentos: grupos[dataKey]
    }));
  }, [agendamentos, filtroProfissional, inicio, fim, searchTerm]);
  const totalItens = agendamentosPorData.reduce((sum, grupo) => sum + grupo.agendamentos.length, 0);
  const handleMarcarCompareceu = async (agendamento: any, e: React.MouseEvent) => {
    e.stopPropagation();
    // Store phone for kanban mover after fatura creation
    setKanbanMoverTelefone(agendamento.leads?.telefone || null);
    setClienteParaFatura({
      id: agendamento.cliente_id,
      nome: agendamento.leads?.nome || "Cliente",
      procedimentoId: agendamento.procedimento_id,
      profissionalId: agendamento.profissional_id,
      agendamentoId: agendamento.id,
      dataAgendamento: agendamento.data_agendamento
    });
    setNovaFaturaOpen(true);
  };
  const deleteAgendamentoMutation = useDeleteAgendamento();
  const handleMarcarNaoCompareceu = async (agendamento: any, e: React.MouseEvent) => {
    e.stopPropagation();
    // Store the agendamento ID and show kanban dialog first - status update happens after
    setPendingNaoCompareceuId(agendamento.id);
    setKanbanMoverTelefone(agendamento.leads?.telefone || null);
    setKanbanMoverOpen(true);
  };
  const handleReagendar = (agendamento: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setAgendamentoSelecionado(agendamento);
  };
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Calendário</h1>
        </div>
        
        {/* Botão Novo Agendamento */}
        {activeTab === "agendamentos" && (
          <Button onClick={() => setNovoAgendamentoOpen(true)} size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="text-xs sm:text-sm">Novo Agendamento</span>
          </Button>
        )}
      </div>
        
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="agendamentos" className="gap-1.5 text-xs px-3 h-7">
            <CalendarIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Agendamentos</span>
            <span className="sm:hidden">Agenda</span>
          </TabsTrigger>
          <TabsTrigger value="avisos" className="gap-1.5 text-xs px-3 h-7">
            <Bell className="h-3.5 w-3.5" />
            Avisos
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5 text-xs px-3 h-7">
            <History className="h-3.5 w-3.5" />
            Histórico
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {activeTab === "agendamentos" ? (
        <>
        {/* Filtros */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Filtro de Período */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Período:</span>
              <Select value={filtroPeriodo} onValueChange={setFiltroPeriodo}>
                <SelectTrigger className="w-[180px] bg-background">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="dia-atual">Dia Atual</SelectItem>
                  <SelectItem value="semana-passada">Semana Passada</SelectItem>
                  <SelectItem value="semana-atual">Semana Atual</SelectItem>
                  <SelectItem value="proxima-semana">Próxima Semana</SelectItem>
                  <SelectItem value="mes-passado">Mês Passado</SelectItem>
                  <SelectItem value="mes-atual">Mês Atual</SelectItem>
                  <SelectItem value="proximo-mes">Próximo Mês</SelectItem>
                  <SelectItem value="personalizado">Personalizado</SelectItem>
                </SelectContent>
              </Select>

              {/* Data Início e Fim - apenas quando personalizado */}
              {filtroPeriodo === "personalizado" && (
                <DateRangeCalendars
                  dateStart={dataInicio}
                  dateEnd={dataFim}
                  onDateStartChange={setDataInicio}
                  onDateEndChange={setDataFim}
                />
              )}
            </div>

            {/* Filtro de Profissional */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Profissional:</span>
              <Select value={filtroProfissional} onValueChange={setFiltroProfissional}>
                <SelectTrigger className="w-[200px] bg-background">
                  <SelectValue placeholder="Todos os profissionais" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">Todos</SelectItem>
                  {profissionais?.filter(p => p.ativo).map(prof => <SelectItem key={prof.id} value={prof.id}>{prof.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Campo de Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, profissional..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </Card>

      {/* Lista de Compromissos Agrupados por Data */}
      <div className="space-y-6">
        {isLoading ? <>
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </> : totalItens > 0 ? <>
            {agendamentosPorData.map(grupo => <div key={grupo.data.toISOString()} className="space-y-4">
                {/* Cabeçalho da Data */}
                <div className="rounded-lg p-4 shadow-md" style={{
            backgroundColor: '#043059'
          }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-white">
                        <CalendarIcon className="h-5 w-5" />
                        <span className="text-lg font-semibold">
                          {format(grupo.data, "dd/MM/yyyy")}
                        </span>
                      </div>
                      <p className="text-white/90 text-sm capitalize">
                        {format(grupo.data, "EEEE", {
                    locale: ptBR
                  })}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-white/20 text-white border-0">
                      {grupo.agendamentos.length} {grupo.agendamentos.length === 1 ? 'agendamento' : 'agendamentos'}
                    </Badge>
                  </div>
                </div>

                {/* Grid de Cards dos Agendamentos */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grupo.agendamentos.map((agendamento: any) => <Card key={agendamento.id} className="shadow-sm hover:shadow-md transition-all flex flex-col">
                      <CardContent className="p-4 flex-1 flex flex-col">
                        <div className="space-y-3 flex-1">
                          {/* Cabeçalho: Hora e Nome */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="font-semibold text-base">
                                {formatInTimeZone(agendamento.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm')}
                              </span>
                            </div>
                            <h3 className="font-semibold text-lg text-foreground">
                              {agendamento.leads?.nome}
                            </h3>
                          </div>

                          {/* Status Badges */}
                          <div className="flex flex-col gap-1.5 text-sm">
                            
                            
                          </div>

                          {/* Telefone */}
                          {agendamento.leads?.telefone && <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{formatPhoneDisplay(agendamento.leads.telefone)}</span>
                            </div>}

                          {/* Profissional */}
                          {agendamento.profissionais?.nome && <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <User className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{agendamento.profissionais.nome}</span>
                            </div>}
                          
                          {/* Tipo e Procedimento */}
                          {(agendamento.tipo || agendamento.procedimentos?.nome) && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">
                                {agendamento.tipo && agendamento.procedimentos?.nome
                                  ? `${agendamento.tipo} - ${agendamento.procedimentos.nome}`
                                  : agendamento.procedimentos?.nome || agendamento.tipo}
                              </span>
                            </div>
                          )}

                          {/* Observações */}
                          {agendamento.observacoes && <p className="text-sm text-muted-foreground italic border-t pt-2 line-clamp-2">
                              {agendamento.observacoes}
                            </p>}
                        </div>

                        {/* Ações - Botões Empilhados */}
                        <div className="mt-4 pt-3 border-t border-border space-y-2">
                          <div className="flex flex-col gap-2">
                            <Button variant="outline" size="sm" className="w-full text-green-600 border-green-600 hover:bg-green-600 hover:text-white" onClick={e => handleMarcarCompareceu(agendamento, e)}>
                              <Check className="h-4 w-4 mr-1" />
                              Compareceu
                            </Button>
                            <Button variant="outline" size="sm" className="w-full text-red-600 border-red-600 hover:bg-red-600 hover:text-white" onClick={e => handleMarcarNaoCompareceu(agendamento, e)}>
                              <X className="h-4 w-4 mr-1" />
                              Não Compareceu
                            </Button>
                            
                            {/* Grid de Ícones */}
                            <div className="grid grid-cols-3 gap-2 pt-2">
                              <Button variant="outline" size="sm" className="w-full aspect-square p-0 flex items-center justify-center" onClick={e => handleReagendar(agendamento, e)} title="Reagendar">
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              {agendamento.leads?.telefone ? <Button variant="outline" size="sm" className="w-full aspect-square p-0 flex items-center justify-center text-green-600 hover:text-green-700 hover:bg-green-50" onClick={e => {
                        e.stopPropagation();
                        navigateToChat(navigate, agendamento.leads.telefone, agendamento.leads?.origem);
                      }} title="WhatsApp">
                                  <MessageCircle className="h-4 w-4" />
                                </Button> : <div className="w-full" />}
                              <Button variant="outline" size="sm" className="w-full aspect-square p-0 flex items-center justify-center text-destructive hover:text-destructive hover:bg-destructive/10" onClick={e => {
                        e.stopPropagation();
                        setDeleteAgendamento(agendamento);
                      }} title="Deletar">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>)}
                </div>
              </div>)}
          </> : <Card className="shadow-card">
            <CardContent className="py-12 text-center text-muted-foreground">
              <CalendarIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum agendamento no período selecionado</p>
            </CardContent>
          </Card>}
      </div>
        </>
      ) : activeTab === "avisos" ? (
        <AvisosTab />
      ) : (
        <HistoricoAvisosTab />
      )}

      {/* Dialogs */}
      <ReagendarDialog
        agendamento={agendamentoSelecionado}
        open={!!agendamentoSelecionado}
        onOpenChange={(open) => !open && setAgendamentoSelecionado(null)}
      />

      {clienteParaFatura && <NovaFaturaDialog clienteId={clienteParaFatura.id} clienteNome={clienteParaFatura.nome} procedimentoId={clienteParaFatura.procedimentoId} profissionalId={clienteParaFatura.profissionalId} agendamentoId={clienteParaFatura.agendamentoId} dataAgendamento={clienteParaFatura.dataAgendamento} open={novaFaturaOpen} onOpenChange={open => {
      setNovaFaturaOpen(open);
      if (!open) setClienteParaFatura(null);
    }} onFaturaCreated={() => {
      if (kanbanMoverTelefone) {
        setKanbanMoverOpen(true);
      }
    }} />}

      <KanbanMoverDialog
        open={kanbanMoverOpen}
        onOpenChange={(open) => {
          if (!open) {
            // X button or escape: cancel the whole operation
            setPendingNaoCompareceuId(null);
            setKanbanMoverTelefone(null);
          }
          setKanbanMoverOpen(open);
        }}
        onConfirmed={async () => {
          // Only update status when user explicitly clicked "Mover" or "Não mover"
          if (pendingNaoCompareceuId) {
            try {
              await updateStatus.mutateAsync({
                id: pendingNaoCompareceuId,
                status: "cancelado"
              });
              queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
              toast.success("Agendamento marcado como não compareceu!");
            } catch {
              toast.error("Erro ao atualizar agendamento");
            }
            setPendingNaoCompareceuId(null);
          }
          setKanbanMoverTelefone(null);
        }}
        clienteTelefone={kanbanMoverTelefone}
      />

      {/* Novo Agendamento */}
      <NovoAgendamentoDialog open={novoAgendamentoOpen} onOpenChange={setNovoAgendamentoOpen} />

      {deleteAgendamento && <AlertDialog open={!!deleteAgendamento} onOpenChange={open => !open && setDeleteAgendamento(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Deletar agendamento de <strong>{deleteAgendamento.leads?.nome}</strong>?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={async () => {
                  try {
                    await deleteAgendamentoMutation.mutateAsync(deleteAgendamento.id);
                    toast.success("Agendamento deletado");
                    setDeleteAgendamento(null);
                  } catch {
                    toast.error("Erro ao deletar");
                  }
                }} 
                className="bg-destructive"
                disabled={deleteAgendamentoMutation.isPending}
              >
                {deleteAgendamentoMutation.isPending ? "Deletando..." : "Deletar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>}
    </div>;
}