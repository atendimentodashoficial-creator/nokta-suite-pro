import { useState, useMemo } from "react";
import { Search, DollarSign, Calendar as CalendarIcon, User, FileText, MessageCircle, ShoppingBag, Edit, Trash2, Clock, Handshake, Phone, Plus, RotateCcw, Columns3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useFaturas, useDeleteFatura } from "@/hooks/useFaturas";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useLeads } from "@/hooks/useLeads";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { NovaFaturaDialog } from "@/components/clientes/NovaFaturaDialog";
import { EditarFaturaDialog } from "@/components/clientes/EditarFaturaDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { toZonedBrasilia, startOfDayBrasilia, endOfDayBrasilia } from "@/utils/timezone";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { KanbanMoverDialog } from "@/components/clientes/KanbanMoverDialog";
import { RetornosDialog } from "@/components/clientes/RetornosDialog";
import { FaturaResumoDialog } from "@/components/clientes/FaturaResumoDialog";

export default function EmNegociacao() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd } = usePeriodFilter("this_month");
  const [filtroProcedimento, setFiltroProcedimento] = useState<string>("all");
  const [filtroProfissional, setFiltroProfissional] = useState<string>("all");
  const [selecionarClienteOpen, setSelecionarClienteOpen] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<{
    id: string;
    nome: string;
  } | null>(null);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [editarFatura, setEditarFatura] = useState<any>(null);
  const [faturaParaExcluir, setFaturaParaExcluir] = useState<any>(null);
  const [kanbanMoverOpen, setKanbanMoverOpen] = useState(false);
  const [kanbanMoverTelefone, setKanbanMoverTelefone] = useState<string | null>(null);
  const [faturaResumoOpen, setFaturaResumoOpen] = useState<any>(null);
  const {
    data: todasFaturas,
    isLoading
  } = useFaturas("negociacao");
  const deleteFatura = useDeleteFatura();
  const {
    data: clientes
  } = useLeads("cliente");
  const {
    data: procedimentos
  } = useProcedimentos();
  const {
    data: profissionais
  } = useProfissionais();
  const { data: allAgendamentos } = useAgendamentos();

  const retornosPorFatura = useMemo(() => {
    const map: Record<string, any[]> = {};
    (allAgendamentos || []).forEach((ag: any) => {
      if (ag.retorno_fatura_id) {
        if (!map[ag.retorno_fatura_id]) map[ag.retorno_fatura_id] = [];
        map[ag.retorno_fatura_id].push(ag);
      }
    });
    return map;
  }, [allAgendamentos]);
  const [retornosDialogOpen, setRetornosDialogOpen] = useState(false);
  const [retornosDialogData, setRetornosDialogData] = useState<{ retornos: any[]; label: string }>({ retornos: [], label: "" });
  const faturasFiltradas = todasFaturas?.filter(fatura => {
    // Converter UTC para Brasília para comparar com filtros locais
    const faturaDate = toZonedBrasilia(fatura.created_at);
    if (faturaDate < startOfDayBrasilia(dateStart)) return false;
    if (faturaDate > endOfDayBrasilia(dateEnd)) return false;
    // Aplicar filtros de profissional e procedimento
    if (filtroProcedimento !== "all" && fatura.procedimento_id !== filtroProcedimento) return false;
    if (filtroProfissional !== "all" && fatura.profissional_id !== filtroProfissional) return false;
    return true;
  });
  const totalNegociacao = faturasFiltradas?.reduce((sum, f) => sum + Number(f.valor), 0) || 0;
  const contagemTotal = faturasFiltradas?.length || 0;
  const filteredFaturas = faturasFiltradas?.filter(fatura => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (fatura.leads as any)?.nome?.toLowerCase().includes(searchLower) || (fatura.leads as any)?.telefone?.includes(searchTerm) || fatura.valor.toString().includes(searchTerm);
    return matchesSearch;
  });
  const handleWhatsAppClick = (e: React.MouseEvent, telefone: string, origem?: string | null) => {
    e.stopPropagation();
    navigateToChat(navigate, telefone, origem);
  };
  return <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Handshake className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" />
          <h1 className="text-xl sm:text-2xl font-bold truncate">Negociação</h1>
        </div>
        <Button size="sm" onClick={() => setSelecionarClienteOpen(true)} className="flex-shrink-0">
          <Plus className="h-4 w-4 mr-1" />
          <span className="text-xs sm:text-sm">Nova</span>
          <span className="hidden sm:inline text-xs sm:text-sm ml-1">Negociação</span>
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap gap-4 items-center">
          <PeriodFilter
            showLabel
            value={periodFilter}
            onChange={setPeriodFilter}
            dateStart={dateStart}
            dateEnd={dateEnd}
            onDateStartChange={setDateStart}
            onDateEndChange={setDateEnd}
          />

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Profissional:</span>
            <Select value={filtroProfissional} onValueChange={setFiltroProfissional}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profissionais?.map(prof => <SelectItem key={prof.id} value={prof.id}>
                    {prof.nome}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Procedimento:</span>
            <Select value={filtroProcedimento} onValueChange={setFiltroProcedimento}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {procedimentos?.map(proc => <SelectItem key={proc.id} value={proc.id}>
                    {proc.nome}
                  </SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(filtroProcedimento !== "all" || filtroProfissional !== "all") && (
            <Button variant="outline" size="sm" onClick={() => {
              setFiltroProcedimento("all");
              setFiltroProfissional("all");
            }}>
              Limpar Filtros
            </Button>
          )}
        </div>
      </Card>

      {/* Stats */}
      <Card className="p-4 shadow-card">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
            <DollarSign className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-muted-foreground">Total Negociação</p>
            <p className="text-2xl font-bold text-blue-600">R$ {totalNegociacao.toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}</p>
            <p className="text-xs text-muted-foreground mt-1">{contagemTotal} faturas</p>
          </div>
        </div>
      </Card>

      {/* Search */}
      <Card className="p-4 shadow-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, telefone ou valor..." className="pl-9" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        </div>
      </Card>

      {/* Cards */}
      <div className="mt-6">
        {isLoading ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div> : filteredFaturas && filteredFaturas.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFaturas.map(fatura => <Card key={fatura.id} className="p-6 shadow-card hover:shadow-elegant transition-all animate-fade-in flex flex-col h-full">
                <div className="flex flex-col flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold text-foreground truncate">
                        {(fatura.leads as any)?.nome || "Cliente não identificado"}
                      </h3>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge className="bg-blue-500/20 text-blue-700 rounded-md cursor-pointer hover:bg-blue-500/30 transition-colors" onClick={(e) => {
                          e.stopPropagation();
                          setFaturaResumoOpen(fatura);
                        }}>
                          Negociação
                        </Badge>
                        {retornosPorFatura[fatura.id]?.length > 0 && (
                          <Badge className="bg-purple-500/20 text-purple-700 rounded-md gap-1 cursor-pointer hover:bg-purple-500/30 transition-colors" onClick={(e) => {
                            e.stopPropagation();
                            setRetornosDialogData({
                              retornos: retornosPorFatura[fatura.id],
                              label: (fatura.leads as any)?.nome || "Cliente"
                            });
                            setRetornosDialogOpen(true);
                          }}>
                            <RotateCcw className="h-3 w-3" />
                            {retornosPorFatura[fatura.id].length} retorno{retornosPorFatura[fatura.id].length > 1 ? "s" : ""}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3 text-sm mt-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <DollarSign className="h-4 w-4 flex-shrink-0" />
                      <span className="font-semibold text-blue-600">
                        R$ {Number(fatura.valor).toLocaleString('pt-BR', {
                    minimumFractionDigits: 2
                  })}
                      </span>
                    </div>

                    {(fatura.leads as any)?.telefone && <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{formatPhoneDisplay((fatura.leads as any).telefone)}</span>
                      </div>}

                    {(fatura.profissionais as any)?.nome && <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{(fatura.profissionais as any).nome}</span>
                      </div>}

                    {(fatura.procedimentos as any)?.nome && <div className="flex items-center gap-2 text-muted-foreground">
                        <FileText className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{(fatura.procedimentos as any).nome}</span>
                      </div>}

                    {(fatura.fatura_upsells as any)?.length > 0 && <div className="flex items-start gap-2 text-muted-foreground">
                        <ShoppingBag className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <div className="flex flex-wrap gap-1">
                          {(fatura.fatura_upsells as any).map((upsell: any) => <Badge key={upsell.id} variant="secondary" className="text-xs rounded">
                              {upsell.descricao}
                            </Badge>)}
                        </div>
                      </div>}
                    
                    {(fatura.fatura_agendamentos as any)?.[0]?.agendamentos?.data_agendamento && <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4 flex-shrink-0" />
                        <span>Atendido em: {new Date((fatura.fatura_agendamentos as any)[0].agendamentos.data_agendamento).toLocaleDateString('pt-BR')} às {new Date((fatura.fatura_agendamentos as any)[0].agendamentos.data_agendamento).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</span>
                      </div>}

                    {fatura.data_follow_up && <div className="flex items-center gap-2 text-muted-foreground">
                        <CalendarIcon className="h-4 w-4 flex-shrink-0" />
                        <span>Follow-up: {new Date(fatura.data_follow_up).toLocaleDateString('pt-BR')}</span>
                      </div>}
                  </div>

                  {fatura.observacoes && <div className="pt-2 border-t border-border mt-4">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {fatura.observacoes}
                      </p>
                    </div>}

                  <div className="flex-1" />

                  <div className="pt-3 border-t border-border grid grid-cols-4 gap-2 mt-4">
                    <Button variant="outline" size="sm" onClick={() => setEditarFatura(fatura)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-50" onClick={e => handleWhatsAppClick(e, (fatura.leads as any)?.telefone, (fatura.leads as any)?.origem)} disabled={!(fatura.leads as any)?.telefone}>
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      setKanbanMoverTelefone((fatura.leads as any)?.telefone || null);
                      setKanbanMoverOpen(true);
                    }} disabled={!(fatura.leads as any)?.telefone} title="Mover no Kanban">
                      <Columns3 className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setFaturaParaExcluir(fatura)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>)}
          </div> : <Card className="p-12">
            <p className="text-center text-muted-foreground">
              Nenhuma negociação encontrada
            </p>
          </Card>}
      </div>

      <Dialog open={selecionarClienteOpen} onOpenChange={setSelecionarClienteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Cliente</DialogTitle>
            <DialogDescription>
              Escolha o cliente para criar a negociação
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Select onValueChange={value => {
            const cliente = clientes?.find(c => c.id === value);
            if (cliente) {
              setClienteSelecionado({
                id: cliente.id,
                nome: cliente.nome
              });
            }
          }}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientes?.map(cliente => <SelectItem key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
              setSelecionarClienteOpen(false);
              setClienteSelecionado(null);
            }}>
                Cancelar
              </Button>
              <Button onClick={() => {
              if (clienteSelecionado) {
                setSelecionarClienteOpen(false);
                setNovaFaturaOpen(true);
              }
            }} disabled={!clienteSelecionado}>
                Continuar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {clienteSelecionado && <NovaFaturaDialog clienteId={clienteSelecionado.id} clienteNome={clienteSelecionado.nome} open={novaFaturaOpen} onOpenChange={open => {
      setNovaFaturaOpen(open);
      if (!open) {
        setClienteSelecionado(null);
      }
    }} />}

      {editarFatura && <EditarFaturaDialog fatura={editarFatura} open={!!editarFatura} onOpenChange={open => {
      if (!open) {
        setEditarFatura(null);
      }
    }} />}

      <AlertDialog open={!!faturaParaExcluir} onOpenChange={open => !open && setFaturaParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Negociação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta negociação de {(faturaParaExcluir?.leads as any)?.nome || "Cliente"}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
            if (faturaParaExcluir) {
              deleteFatura.mutate(faturaParaExcluir.id, {
                onSuccess: () => {
                  toast.success("Negociação excluída com sucesso");
                  setFaturaParaExcluir(null);
                },
                onError: () => {
                  toast.error("Erro ao excluir negociação");
                }
              });
            }
          }}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RetornosDialog
        open={retornosDialogOpen}
        onOpenChange={setRetornosDialogOpen}
        retornos={retornosDialogData.retornos}
        faturaLabel={retornosDialogData.label}
      />

      <FaturaResumoDialog
        open={!!faturaResumoOpen}
        onOpenChange={(open) => !open && setFaturaResumoOpen(null)}
        fatura={faturaResumoOpen}
      />

      <KanbanMoverDialog
        open={kanbanMoverOpen}
        onOpenChange={(open) => {
          setKanbanMoverOpen(open);
          if (!open) setKanbanMoverTelefone(null);
        }}
        clienteTelefone={kanbanMoverTelefone}
      />
    </div>;
}