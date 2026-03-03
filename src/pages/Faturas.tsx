import { useState, useMemo } from "react";
import { Search, DollarSign, Calendar as CalendarIcon, User, FileText, MessageCircle, ShoppingBag, Edit, Trash2, Clock, CreditCard, Receipt, Phone, Plus, RotateCcw, Columns3 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useFaturas, useDeleteFatura } from "@/hooks/useFaturas";
import { useLeads } from "@/hooks/useLeads";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useAllFaturaPagamentos } from "@/hooks/useFaturaPagamentos";
import { NovaFaturaDialog } from "@/components/clientes/NovaFaturaDialog";
import { EditarFaturaDialog } from "@/components/clientes/EditarFaturaDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { toZonedBrasilia, startOfDayBrasilia, endOfDayBrasilia } from "@/utils/timezone";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { KanbanMoverDialog } from "@/components/clientes/KanbanMoverDialog";
import { RetornosDialog } from "@/components/clientes/RetornosDialog";
import { FaturaResumoDialog } from "@/components/clientes/FaturaResumoDialog";
import { FaturaPagamentosSection } from "@/components/clientes/FaturaPagamentosSection";

export default function Faturas() {
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
  const [detalhesPagamentoFatura, setDetalhesPagamentoFatura] = useState<any>(null);
  const [kanbanMoverOpen, setKanbanMoverOpen] = useState(false);
  const [kanbanMoverTelefone, setKanbanMoverTelefone] = useState<string | null>(null);
  const [faturaResumoOpen, setFaturaResumoOpen] = useState<any>(null);
  const {
    data: todasFaturas,
    isLoading
  } = useFaturas("fechado");
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
  const { data: allPagamentos } = useAllFaturaPagamentos();
  // Compute retornos per fatura (full data)
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
  const totalFechado = faturasFiltradas?.reduce((sum, f) => {
    const valorBruto = Number(f.valor);
    const taxa = Number(f.taxa_parcelamento) || 0;
    const jurosPagoPor = (f as any).juros_pago_por;
    let valorLiquido = valorBruto;
    if (jurosPagoPor === "cliente" && taxa > 0) {
      valorLiquido = valorBruto / (1 + taxa / 100);
    } else if (jurosPagoPor === "empresa" && taxa > 0) {
      const valorTaxa = valorBruto * (taxa / 100);
      valorLiquido = valorBruto - valorTaxa;
    }
    return sum + valorLiquido;
  }, 0) || 0;
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <FileText className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Faturas</h1>
        </div>
        <Button size="sm" onClick={() => setSelecionarClienteOpen(true)}>
          <Plus className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="text-xs sm:text-sm">Nova Fatura</span>
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
            <p className="text-sm text-muted-foreground">Total Fechado</p>
            <p className="text-2xl font-bold text-green-600">R$ {totalFechado.toLocaleString('pt-BR', {
              minimumFractionDigits: 2
            })}</p>
            <p className="text-xs text-muted-foreground mt-1">{contagemTotal} faturas</p>
          </div>
        </div>
        {/* Paid/Pending summary */}
        {(() => {
          const totalPago = filteredFaturas?.reduce((sum, f) => {
            const pagamentos = allPagamentos?.[f.id] || [];
            return sum + pagamentos.reduce((s, p) => s + Number(p.valor), 0);
          }, 0) || 0;
          const totalPendente = Math.max(totalFechado - totalPago, 0);
          
          if (totalPago === 0) return null;
          
          const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
          const percentPago = totalFechado > 0 ? Math.min((totalPago / totalFechado) * 100, 100) : 0;
          
          return (
            <div className="mt-3 pt-3 border-t border-border space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Recebido: <span className="font-semibold text-green-600">{fmt(totalPago)}</span></span>
                <span>Pendente: <span className="font-semibold text-orange-600">{fmt(totalPendente)}</span></span>
              </div>
              <Progress
                value={percentPago}
                className="h-2.5"
                style={{
                  "--progress-color": percentPago >= 100 ? "hsl(var(--chart-2))" : "hsl(var(--primary))",
                  "--progress-background": "hsl(var(--muted))",
                } as any}
              />
              <p className="text-[11px] text-right text-muted-foreground">{percentPago.toFixed(0)}% recebido</p>
            </div>
          );
        })()}
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
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge className="bg-green-500/20 text-green-700 rounded-md cursor-pointer hover:bg-green-500/30 transition-colors" onClick={(e) => {
                          e.stopPropagation();
                          setFaturaResumoOpen(fatura);
                        }}>
                          Fechado
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
                      <span className="font-semibold text-green-600">
                        R$ {(() => {
                    const valorBruto = Number(fatura.valor);
                    const taxa = Number(fatura.taxa_parcelamento) || 0;
                    const jurosPagoPor = (fatura as any).juros_pago_por;
                    if (jurosPagoPor === "cliente" && taxa > 0) {
                      return (valorBruto / (1 + taxa / 100)).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2
                      });
                    } else if (jurosPagoPor === "empresa" && taxa > 0) {
                      const valorTaxa = valorBruto * (taxa / 100);
                      return (valorBruto - valorTaxa).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2
                      });
                    }
                    return valorBruto.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2
                    });
                  })()}
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
                  </div>

                  {fatura.observacoes && <div className="pt-2 border-t border-border mt-4">
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {fatura.observacoes}
                      </p>
                    </div>}

                  {/* Payment progress bar */}
                  {(() => {
                    const pagamentos = allPagamentos?.[fatura.id] || [];
                    const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
                    const valorTotal = Number(fatura.valor);
                    const percentPago = valorTotal > 0 ? Math.min((totalPago / valorTotal) * 100, 100) : 0;
                    const restante = Math.max(valorTotal - totalPago, 0);
                    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
                    
                    if (pagamentos.length === 0) return null;
                    
                    return (
                      <div className="pt-2 border-t border-border mt-3 space-y-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Pago: {fmt(totalPago)}</span>
                          <span>Restante: {fmt(restante)}</span>
                        </div>
                        <Progress
                          value={percentPago}
                          className="h-2"
                          style={{
                            "--progress-color": percentPago >= 100 ? "hsl(var(--chart-2))" : "hsl(var(--primary))",
                            "--progress-background": "hsl(var(--muted))",
                          } as any}
                        />
                        <p className="text-[11px] text-right text-muted-foreground">{percentPago.toFixed(0)}%</p>
                      </div>
                    );
                  })()}

                  <div className="flex-1" />

                  <div className="pt-3 border-t border-border space-y-2 mt-4">
                    <Button size="sm" className="w-full" onClick={() => setDetalhesPagamentoFatura(fatura)}>
                      <CreditCard className="h-4 w-4 mr-2" />
                      Detalhes do Pagamento
                    </Button>
                    <div className="grid grid-cols-4 gap-2">
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
                </div>
              </Card>)}
          </div> : <Card className="p-12">
            <p className="text-center text-muted-foreground">
              Nenhuma fatura fechada encontrada
            </p>
          </Card>}
      </div>

      <Dialog open={selecionarClienteOpen} onOpenChange={setSelecionarClienteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Selecionar Cliente</DialogTitle>
            <DialogDescription>
              Escolha o cliente para criar a fatura
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
      if (!open) setClienteSelecionado(null);
    }} />}

      {editarFatura && <EditarFaturaDialog fatura={editarFatura} open={!!editarFatura} onOpenChange={open => !open && setEditarFatura(null)} />}

      {/* Dialog de Detalhes do Pagamento */}
      <Dialog open={!!detalhesPagamentoFatura} onOpenChange={open => !open && setDetalhesPagamentoFatura(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col min-h-0">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-cyan-500" />
              Detalhes do Pagamento
            </DialogTitle>
            <DialogDescription>
              {(detalhesPagamentoFatura?.leads as any)?.nome || "Cliente"}
            </DialogDescription>
          </DialogHeader>
          
          {detalhesPagamentoFatura && (
            <div className="flex-1 min-h-0 overflow-y-auto pr-4">
              <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Valor Total</span>
                  <span className="text-xl font-bold text-green-600">
                    R$ {Number(detalhesPagamentoFatura.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Informações de Pagamento */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Informações de Pagamento</h4>
                
                {/* Meio de Pagamento */}
                {(detalhesPagamentoFatura as any).meio_pagamento && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Meio de Pagamento</span>
                    <Badge variant="outline" className="font-medium rounded">
                      {(detalhesPagamentoFatura as any).meio_pagamento === "pix" && "Pix"}
                      {(detalhesPagamentoFatura as any).meio_pagamento === "cartao_credito" && "Cartão de Crédito"}
                      {(detalhesPagamentoFatura as any).meio_pagamento === "cartao_debito" && "Cartão de Débito"}
                      {(detalhesPagamentoFatura as any).meio_pagamento === "boleto" && "Boleto"}
                      {(detalhesPagamentoFatura as any).meio_pagamento === "dinheiro" && "Dinheiro"}
                    </Badge>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Condição</span>
                  <Badge variant="secondary" className="font-medium rounded">
                    {detalhesPagamentoFatura.forma_pagamento === "a_vista" && "À Vista"}
                    {detalhesPagamentoFatura.forma_pagamento === "parcelado" && "Parcelado"}
                    {detalhesPagamentoFatura.forma_pagamento === "entrada_parcelado" && "Entrada + Parcelado"}
                    {!detalhesPagamentoFatura.forma_pagamento && "À Vista"}
                  </Badge>
                </div>

                {/* Entrada */}
                {detalhesPagamentoFatura.forma_pagamento === "entrada_parcelado" && detalhesPagamentoFatura.valor_entrada > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Valor de Entrada</span>
                    <span className="font-semibold text-green-600">
                      R$ {Number(detalhesPagamentoFatura.valor_entrada).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Número de Parcelas */}
                {(detalhesPagamentoFatura.forma_pagamento === "parcelado" || detalhesPagamentoFatura.forma_pagamento === "entrada_parcelado") && detalhesPagamentoFatura.numero_parcelas > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Número de Parcelas</span>
                    <span className="font-medium">{detalhesPagamentoFatura.numero_parcelas}x</span>
                  </div>
                )}

                {/* Valor da Parcela */}
                {(detalhesPagamentoFatura.forma_pagamento === "parcelado" || detalhesPagamentoFatura.forma_pagamento === "entrada_parcelado") && detalhesPagamentoFatura.valor_parcela > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Valor da Parcela</span>
                    <span className="font-medium">
                      R$ {Number(detalhesPagamentoFatura.valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}

                {/* Taxa de Parcelamento */}
                {detalhesPagamentoFatura.taxa_parcelamento > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Taxa de Parcelamento</span>
                      <span className={`font-medium ${(detalhesPagamentoFatura as any).juros_pago_por === "empresa" ? "text-red-600" : "text-orange-600"}`}>
                        {detalhesPagamentoFatura.taxa_parcelamento}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Juros pago por</span>
                      <Badge variant={(detalhesPagamentoFatura as any).juros_pago_por === "empresa" ? "destructive" : "secondary"} className="rounded">
                        {(detalhesPagamentoFatura as any).juros_pago_por === "empresa" ? "Empresa" : "Cliente"}
                      </Badge>
                    </div>
                  </>
                )}
              </div>

              {/* Resumo Financeiro - apenas quando há taxa */}
              {detalhesPagamentoFatura.taxa_parcelamento > 0 && (detalhesPagamentoFatura.forma_pagamento === "parcelado" || detalhesPagamentoFatura.forma_pagamento === "entrada_parcelado") && (
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Resumo Financeiro</h4>
                  
                  {(detalhesPagamentoFatura as any).juros_pago_por === "cliente" && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Valor cobrado do cliente</span>
                        <span className="font-medium">
                          R$ {Number(detalhesPagamentoFatura.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Valor recebido pela empresa</span>
                        <span className="font-medium text-green-600">
                          R$ {(Number(detalhesPagamentoFatura.valor) / (1 + detalhesPagamentoFatura.taxa_parcelamento / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Parcela paga pelo cliente</span>
                        <span className="font-medium">
                          R$ {Number(detalhesPagamentoFatura.valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Parcela recebida pela empresa</span>
                        <span className="font-medium text-green-600">
                          R$ {(Number(detalhesPagamentoFatura.valor_parcela) / (1 + detalhesPagamentoFatura.taxa_parcelamento / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </>
                  )}
                  
                  {(detalhesPagamentoFatura as any).juros_pago_por === "empresa" && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Valor cobrado do cliente</span>
                        <span className="font-medium">
                          R$ {Number(detalhesPagamentoFatura.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Desconto da taxa</span>
                        <span className="font-medium text-red-600">
                          - R$ {(Number(detalhesPagamentoFatura.valor) * (detalhesPagamentoFatura.taxa_parcelamento / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Valor recebido pela empresa</span>
                        <span className="font-medium text-green-600">
                          R$ {(Number(detalhesPagamentoFatura.valor) * (1 - detalhesPagamentoFatura.taxa_parcelamento / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Parcela paga pelo cliente</span>
                        <span className="font-medium">
                          R$ {Number(detalhesPagamentoFatura.valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Parcela recebida pela empresa</span>
                        <span className="font-medium text-green-600">
                          R$ {(Number(detalhesPagamentoFatura.valor_parcela) * (1 - detalhesPagamentoFatura.taxa_parcelamento / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Pagamentos Parciais */}
              <div className="bg-muted/50 rounded-lg p-4">
                <FaturaPagamentosSection
                  faturaId={detalhesPagamentoFatura.id}
                  valorTotal={Number(detalhesPagamentoFatura.valor)}
                />
              </div>

              {/* Observações */}
              {detalhesPagamentoFatura.observacoes && (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">Observações</span>
                  <p className="text-sm bg-muted/30 rounded-lg p-3">
                    {detalhesPagamentoFatura.observacoes}
                  </p>
                </div>
              )}
            </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!faturaParaExcluir} onOpenChange={open => !open && setFaturaParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Fatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta fatura de {(faturaParaExcluir?.leads as any)?.nome || "Cliente"}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => {
            if (faturaParaExcluir) {
              deleteFatura.mutate(faturaParaExcluir.id, {
                onSuccess: () => {
                  toast.success("Fatura excluída com sucesso");
                  setFaturaParaExcluir(null);
                },
                onError: () => {
                  toast.error("Erro ao excluir fatura");
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