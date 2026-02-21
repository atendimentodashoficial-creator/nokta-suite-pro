import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Phone, Mail, Calendar, Tag, DollarSign, CalendarCheck, Edit, Plus, RefreshCw, UserCheck, ChevronDown, ShoppingBag, Clock, CreditCard, Trash2, MessageCircle, Send, History, CalendarX, FileText, Copy, ExternalLink, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useLeads } from "@/hooks/useLeads";
import { useAgendamentos, Agendamento, useDeleteAgendamento, useAgendamentosExcluidos, useDeleteAgendamentoExcluidoLog } from "@/hooks/useAgendamentos";
import { useFaturas, useDeleteFatura, useFaturasExcluidas, useDeleteFaturaExcluidaLog } from "@/hooks/useFaturas";
import { EditarClienteDialog } from "@/components/clientes/EditarClienteDialog";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { NovaFaturaDialog } from "@/components/clientes/NovaFaturaDialog";
import { EditarAgendamentoDialog } from "@/components/clientes/EditarAgendamentoDialog";
import { EditarFaturaDialog } from "@/components/clientes/EditarFaturaDialog";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { useTabPersistence } from "@/hooks/useTabPersistence";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const statusConfig = {
  agendado: {
    label: "Agendado",
    color: "bg-blue-500/20 text-blue-700"
  },
  confirmado: {
    label: "Confirmado",
    color: "bg-green-500/20 text-green-700"
  },
  cancelado: {
    label: "Cancelado",
    color: "bg-red-500/20 text-red-700"
  },
  realizado: {
    label: "Realizado",
    color: "bg-purple-500/20 text-purple-700"
  }
};

const origemAgendamentoConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  WhatsApp: {
    label: "WhatsApp",
    color: "bg-green-500/20 text-green-700 border-green-500/30",
    icon: <MessageCircle className="h-3 w-3 mr-1" />
  },
  Disparos: {
    label: "Disparos",
    color: "bg-purple-500/20 text-purple-700 border-purple-500/30",
    icon: <Send className="h-3 w-3 mr-1" />
  },
  Manual: {
    label: "Manual",
    color: "bg-gray-500/20 text-gray-700 border-gray-500/30",
    icon: <CalendarCheck className="h-3 w-3 mr-1" />
  }
};
const statusFaturaConfig = {
  negociacao: {
    label: "Negociação",
    color: "bg-yellow-500/20 text-yellow-700"
  },
  follow_up: {
    label: "Follow-up",
    color: "bg-blue-500/20 text-blue-700"
  },
  fechado: {
    label: "Fechado",
    color: "bg-green-500/20 text-green-700"
  }
};
export default function ClienteDetalhes() {
  const {
    id
  } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useTabPersistence("tab", "proximos");
  const [editarClienteOpen, setEditarClienteOpen] = useState(false);
  const [novoAgendamentoOpen, setNovoAgendamentoOpen] = useState(false);
  const [novaFaturaOpen, setNovaFaturaOpen] = useState(false);
  const [agendamentoSelecionado, setAgendamentoSelecionado] = useState<Agendamento | null>(null);
  const [faturaSelecionada, setFaturaSelecionada] = useState<any>(null);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const {
    data: clientes
  } = useLeads("cliente");
  const {
    data: agendamentos
  } = useAgendamentos();
  const {
    data: faturas
  } = useFaturas();
  const {
    data: agendamentosExcluidos
  } = useAgendamentosExcluidos();
  const {
    data: faturasExcluidas
  } = useFaturasExcluidas();
  const { toast } = useToast();
  const deleteAgendamento = useDeleteAgendamento();
  const deleteFatura = useDeleteFatura();
  const deleteAgendamentoLog = useDeleteAgendamentoExcluidoLog();
  const deleteFaturaLog = useDeleteFaturaExcluidaLog();
  const cliente = clientes?.find(c => c.id === id);
  const clienteAgendamentos = agendamentos?.filter(a => a.cliente_id === id) || [];
  const now = new Date();
  const agendamentosPassados = clienteAgendamentos.filter(a => new Date(a.data_agendamento) < now);
  const proximosAgendamentos = clienteAgendamentos.filter(a => new Date(a.data_agendamento) >= now);
  const clienteAgendamentosExcluidos = agendamentosExcluidos?.filter(a => a.cliente_id === id) || [];
  const clienteFaturasExcluidas = faturasExcluidas?.filter(f => f.cliente_id === id) || [];
  const clienteFaturas = faturas?.filter(f => f.cliente_id === id) || [];
  const receitaFechada = clienteFaturas.filter(f => f.status === "fechado").reduce((sum, f) => {
    const valorBruto = Number(f.valor);
    const taxa = Number((f as any).taxa_parcelamento) || 0;
    const jurosPagoPor = (f as any).juros_pago_por;
    
    let valorLiquido = valorBruto;
    if (jurosPagoPor === "cliente" && taxa > 0) {
      valorLiquido = valorBruto / (1 + taxa / 100);
    } else if (jurosPagoPor === "empresa" && taxa > 0) {
      const valorTaxa = valorBruto * (taxa / 100);
      valorLiquido = valorBruto - valorTaxa;
    }
    return sum + valorLiquido;
  }, 0);
  const totalReagendamentos = clienteAgendamentos.reduce((sum, a) => sum + (a.numero_reagendamentos || 0), 0);

  // Compute retorno counts per fatura
  const retornosPorFatura = useMemo(() => {
    const map: Record<string, number> = {};
    clienteAgendamentos.forEach((ag: any) => {
      if (ag.retorno_fatura_id) {
        map[ag.retorno_fatura_id] = (map[ag.retorno_fatura_id] || 0) + 1;
      }
    });
    return map;
  }, [clienteAgendamentos]);

  const handleDeleteAgendamento = async (e: React.MouseEvent, agendamentoId: string) => {
    e.stopPropagation();
    try {
      await deleteAgendamento.mutateAsync(agendamentoId);
      toast({
        title: "Agendamento excluído",
        description: "O agendamento foi removido com sucesso."
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir o agendamento.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteFatura = async (e: React.MouseEvent, faturaId: string) => {
    e.stopPropagation();
    try {
      await deleteFatura.mutateAsync(faturaId);
      toast({
        title: "Fatura excluída",
        description: "A fatura foi removida com sucesso."
      });
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: "Não foi possível excluir a fatura.",
        variant: "destructive"
      });
    }
  };

  if (!cliente) {
    return <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/clientes")} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Card className="p-12">
          <p className="text-center text-muted-foreground">Cliente não encontrado</p>
        </Card>
      </div>;
  }
  return <div className="space-y-4 md:space-y-6">
      {/* Header com botão voltar */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/clientes")} className="gap-2 self-start">
          <ArrowLeft className="h-4 w-4" />
          {isMobile ? "Voltar" : "Voltar para Clientes"}
        </Button>

        <div className="flex gap-2 justify-end">
          {isMobile ? (
            <>
              <Button variant="outline" size="icon" onClick={() => setEditarClienteOpen(true)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => setNovoAgendamentoOpen(true)}>
                <CalendarCheck className="h-4 w-4" />
              </Button>
              <Button size="icon" className="bg-gradient-primary" onClick={() => setNovaFaturaOpen(true)}>
                <DollarSign className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="gap-2" onClick={() => setEditarClienteOpen(true)}>
                <Edit className="h-4 w-4" />
                Editar Cliente
              </Button>
              <Button variant="outline" className="gap-2" onClick={() => setNovoAgendamentoOpen(true)}>
                <Plus className="h-4 w-4" />
                Novo Agendamento
              </Button>
              <Button className="bg-gradient-primary gap-2" onClick={() => setNovaFaturaOpen(true)}>
                <Plus className="h-4 w-4" />
                Nova Fatura
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Informações do Cliente */}
      <Card className="shadow-elegant">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{cliente.nome}</CardTitle>
              {cliente.origem_lead && <Badge variant="outline" className="mt-2 bg-blue-500/10 text-blue-700 border-blue-500/20">
                  <Tag className="h-3 w-3 mr-1" />
                  Origem: Lead
                </Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Telefone</p>
                <p className="font-medium">{formatPhoneDisplay(cliente.telefone)}</p>
              </div>
            </div>
            
            {cliente.email && <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{cliente.email}</p>
                </div>
              </div>}
            
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Cliente desde</p>
                <p className="font-medium">
                  {new Date(cliente.updated_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>

          {/* Botão para enviar formulário de dados completos */}
          <div className="pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Formulário de Dados</p>
                <p className="text-xs text-muted-foreground">Envie o link para o cliente completar seus dados</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setFormDialogOpen(true)}
                      className="gap-1.5"
                    >
                      <FileText className="h-4 w-4" />
                      Enviar formulário
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enviar link do formulário para o cliente preencher</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog para enviar formulário */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Enviar Formulário de Dados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Envie este link para o cliente preencher ou atualizar seus dados pessoais (email, endereço, data de nascimento, etc).
            </p>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Link do formulário:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-background p-2 rounded flex-1 overflow-hidden text-ellipsis">
                  {`${window.location.origin}/cliente-form/${cliente.id}`}
                </code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/cliente-form/${cliente.id}`);
                    toast({ title: "Link copiado!" });
                  }}
                  className="h-8 w-8"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => window.open(`${window.location.origin}/cliente-form/${cliente.id}`, "_blank")}
                variant="outline"
                className="w-full"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir formulário
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Métricas do Cliente */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
              <DollarSign className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Receita Total (Fechada)</p>
              <p className="text-2xl font-bold">
                {receitaFechada.toLocaleString('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              })}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
              <CalendarCheck className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Total de Agendamentos</p>
              <p className="text-2xl font-bold">{clienteAgendamentos.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
              <DollarSign className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Total de Faturas</p>
              <p className="text-2xl font-bold">{clienteFaturas.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-gradient-primary">
              <RefreshCw className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Total de Reagendamentos</p>
              <p className="text-2xl font-bold">{totalReagendamentos}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabs com Agendamentos e Faturas */}
      <Card className="shadow-elegant">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <CardHeader>
            {isMobile ? <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  <SelectItem value="proximos">Próximos Agendamentos</SelectItem>
                  <SelectItem value="agendamentos">Agendamentos Passados</SelectItem>
                  <SelectItem value="faturas">Faturas</SelectItem>
                  <SelectItem value="historico">Histórico de Exclusões</SelectItem>
                </SelectContent>
              </Select> : <TabsList className="h-8">
                <TabsTrigger value="proximos" className="text-xs px-3 h-7">Próximos Agendamentos</TabsTrigger>
                <TabsTrigger value="agendamentos" className="text-xs px-3 h-7">Agendamentos Passados</TabsTrigger>
                <TabsTrigger value="faturas" className="text-xs px-3 h-7">Faturas</TabsTrigger>
                <TabsTrigger value="historico" className="text-xs px-3 h-7">Histórico de Exclusões</TabsTrigger>
              </TabsList>}
          </CardHeader>

          <CardContent>
            <TabsContent value="proximos" className="mt-0">
              <ScrollArea className="h-[400px] pr-4">
                {proximosAgendamentos.length > 0 ? <div className="space-y-3">
                    {proximosAgendamentos.map(agendamento => <Card key={agendamento.id} className="p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setAgendamentoSelecionado(agendamento)}>
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={statusConfig[agendamento.status as keyof typeof statusConfig].color}>
                                {statusConfig[agendamento.status as keyof typeof statusConfig].label}
                              </Badge>
                              {agendamento.tipo && <Badge variant="outline">{agendamento.tipo}</Badge>}
                              {(() => {
                                const origemKey = agendamento.origem_agendamento || "Manual";
                                const origemConfig = origemAgendamentoConfig[origemKey] || origemAgendamentoConfig.Manual;
                                return (
                                  <Badge variant="outline" className={origemConfig.color}>
                                    {origemConfig.icon}
                                    {origemConfig.label}
                                  </Badge>
                                );
                              })()}
                              {agendamento.numero_reagendamentos > 0 && <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/20">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Reagendado {agendamento.numero_reagendamentos}x
                                </Badge>}
                              {(agendamento as any).retorno_fatura_id && (
                                <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-500/20 gap-1">
                                  <RotateCcw className="h-3 w-3" />
                                  Retorno
                                </Badge>
                              )}
                            </div>
                            <p className="font-medium">
                              {new Date(agendamento.data_agendamento).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                            </p>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              {(agendamento as any).procedimentos && <p>📋 {(agendamento as any).procedimentos.nome}</p>}
                              {(agendamento as any).profissionais && <p>👤 {(agendamento as any).profissionais.nome}</p>}
                            </div>
                            {agendamento.observacoes && <p className="text-sm text-muted-foreground">
                                {agendamento.observacoes}
                              </p>}
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Agendamento</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={(e) => handleDeleteAgendamento(e, agendamento.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>)}
                  </div> : <p className="text-center text-muted-foreground py-8">
                    Nenhum agendamento futuro encontrado
                  </p>}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="agendamentos" className="mt-0">
              <ScrollArea className="h-[400px] pr-4">
                {agendamentosPassados.length > 0 ? <div className="space-y-3">
                    {agendamentosPassados.map(agendamento => <Card key={agendamento.id} className="p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setAgendamentoSelecionado(agendamento)}>
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={statusConfig[agendamento.status as keyof typeof statusConfig].color}>
                                {statusConfig[agendamento.status as keyof typeof statusConfig].label}
                              </Badge>
                              {agendamento.tipo && <Badge variant="outline">{agendamento.tipo}</Badge>}
                              {(() => {
                                const origemKey = agendamento.origem_agendamento || "Manual";
                                const origemConfig = origemAgendamentoConfig[origemKey] || origemAgendamentoConfig.Manual;
                                return (
                                  <Badge variant="outline" className={origemConfig.color}>
                                    {origemConfig.icon}
                                    {origemConfig.label}
                                  </Badge>
                                );
                              })()}
                              {agendamento.numero_reagendamentos > 0 && <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/20">
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Reagendado {agendamento.numero_reagendamentos}x
                                </Badge>}
                              {(agendamento as any).retorno_fatura_id && (
                                <Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-500/20 gap-1">
                                  <RotateCcw className="h-3 w-3" />
                                  Retorno
                                </Badge>
                              )}
                            </div>
                            <p className="font-medium">
                              {new Date(agendamento.data_agendamento).toLocaleString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                            </p>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              {(agendamento as any).procedimentos && <p>📋 {(agendamento as any).procedimentos.nome}</p>}
                              {(agendamento as any).profissionais && <p>👤 {(agendamento as any).profissionais.nome}</p>}
                            </div>
                            {agendamento.observacoes && <p className="text-sm text-muted-foreground">
                                {agendamento.observacoes}
                              </p>}
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir Agendamento</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja excluir este agendamento? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={(e) => handleDeleteAgendamento(e, agendamento.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>)}
                  </div> : <p className="text-center text-muted-foreground py-8">
                    Nenhum agendamento passado encontrado
                  </p>}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="faturas" className="mt-0">
              <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">Receita total de faturas fechadas</p>
                <p className="text-2xl font-bold text-green-600">
                  {receitaFechada.toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })}
                </p>
              </div>
              
              <ScrollArea className="h-[350px] pr-4">
                {clienteFaturas.length > 0 ? <div className="space-y-3">
                    {clienteFaturas.map(fatura => {
                      const valorBruto = Number(fatura.valor);
                      const taxa = Number((fatura as any).taxa_parcelamento) || 0;
                      const jurosPagoPor = (fatura as any).juros_pago_por;
                      
                      let valorLiquido = valorBruto;
                      if (jurosPagoPor === "cliente" && taxa > 0) {
                        valorLiquido = valorBruto / (1 + taxa / 100);
                      } else if (jurosPagoPor === "empresa" && taxa > 0) {
                        const valorTaxa = valorBruto * (taxa / 100);
                        valorLiquido = valorBruto - valorTaxa;
                      }
                      
                      return (
                        <Card key={fatura.id} className="p-4 cursor-pointer hover:bg-muted/50 transition-all shadow-card hover:shadow-elegant" onClick={() => setFaturaSelecionada(fatura)}>
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-foreground line-clamp-2">
                                  {(fatura.procedimentos as any)?.nome || "Procedimento não especificado"}
                                </h3>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  <Badge className={statusFaturaConfig[fatura.status].color}>
                                    {statusFaturaConfig[fatura.status].label}
                                  </Badge>
                                  {retornosPorFatura[fatura.id] > 0 && (
                                    <Badge className="bg-blue-500/20 text-blue-700 gap-1">
                                      <RotateCcw className="h-3 w-3" />
                                      {retornosPorFatura[fatura.id]} retorno{retornosPorFatura[fatura.id] > 1 ? "s" : ""}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <AlertDialog>
                                <AlertDialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Fatura</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir esta fatura? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={(e) => handleDeleteFatura(e, fatura.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                      Excluir
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                            
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <DollarSign className="h-4 w-4 flex-shrink-0" />
                                <span className="font-semibold text-green-600 text-lg">
                                  R$ {valorLiquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>

                              {(fatura.profissionais as any)?.nome && <div className="flex items-center gap-2 text-muted-foreground">
                                  <UserCheck className="h-4 w-4 flex-shrink-0" />
                                  <span className="truncate">{(fatura.profissionais as any).nome}</span>
                                </div>}

                              {(fatura as any).fatura_agendamentos?.[0]?.agendamentos?.data_agendamento && <div className="flex items-center gap-2 text-muted-foreground">
                                  <Clock className="h-4 w-4 flex-shrink-0" />
                                  <span className="text-xs sm:text-sm">{new Date((fatura as any).fatura_agendamentos[0].agendamentos.data_agendamento).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>}

                              {(fatura as any).fatura_upsells?.length > 0 && <div className="flex items-start gap-2 text-muted-foreground">
                                  <ShoppingBag className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                  <div className="flex flex-wrap gap-1">
                                    {(fatura as any).fatura_upsells.map((upsell: any) => <Badge key={upsell.id} variant="secondary" className="text-xs rounded">
                                        {upsell.descricao} - R$ {Number(upsell.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                      </Badge>)}
                                  </div>
                                </div>}
                              
                              {fatura.status !== "fechado" && fatura.data_follow_up && <div className="flex items-center gap-2 text-muted-foreground">
                                  <Calendar className="h-4 w-4 flex-shrink-0" />
                                  <span className="text-xs sm:text-sm">Follow-up: {new Date(fatura.data_follow_up).toLocaleDateString('pt-BR')}</span>
                                </div>}
                            </div>

                            {fatura.observacoes && <div className="pt-2 border-t border-border">
                                <p className="text-sm text-muted-foreground line-clamp-2">
                                  {fatura.observacoes}
                                </p>
                              </div>}

                            {/* Botão Detalhes do Pagamento para faturas fechadas */}
                            {fatura.status === "fechado" && (
                              <Dialog>
                                <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Button variant="outline" className="w-full gap-2">
                                    <CreditCard className="h-4 w-4" />
                                    Detalhes do Pagamento
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col min-h-0" onClick={(e) => e.stopPropagation()}>
                                  <DialogHeader>
                                    <DialogTitle className="flex items-center gap-2">
                                      <CreditCard className="h-5 w-5 text-cyan-500" />
                                      Detalhes do Pagamento
                                    </DialogTitle>
                                  </DialogHeader>
                                  <div className="flex-1 min-h-0 overflow-y-auto pr-4">
                                    <div className="space-y-4">
                                      {/* Valor Total */}
                                      <div className="bg-muted/50 rounded-lg p-4">
                                        <div className="flex justify-between items-center">
                                          <span className="text-muted-foreground">Valor Total</span>
                                          <span className="text-xl font-bold text-green-600">
                                            R$ {valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Informações de Pagamento */}
                                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                                        <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Informações de Pagamento</h4>
                                        
                                        {/* Meio de Pagamento */}
                                        {(fatura as any).meio_pagamento && (
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Meio de Pagamento</span>
                                            <Badge variant="outline" className="font-medium rounded">
                                              {(fatura as any).meio_pagamento === "pix" && "Pix"}
                                              {(fatura as any).meio_pagamento === "cartao_credito" && "Cartão de Crédito"}
                                              {(fatura as any).meio_pagamento === "cartao_debito" && "Cartão de Débito"}
                                              {(fatura as any).meio_pagamento === "boleto" && "Boleto"}
                                              {(fatura as any).meio_pagamento === "dinheiro" && "Dinheiro"}
                                            </Badge>
                                          </div>
                                        )}

                                        <div className="flex justify-between items-center">
                                          <span className="text-muted-foreground">Condição</span>
                                          <Badge variant="secondary" className="font-medium rounded">
                                            {(fatura as any).forma_pagamento === "a_vista" && "À Vista"}
                                            {(fatura as any).forma_pagamento === "parcelado" && "Parcelado"}
                                            {(fatura as any).forma_pagamento === "entrada_parcelado" && "Entrada + Parcelado"}
                                            {!(fatura as any).forma_pagamento && "À Vista"}
                                          </Badge>
                                        </div>

                                        {/* Entrada */}
                                        {(fatura as any).forma_pagamento === "entrada_parcelado" && Number((fatura as any).valor_entrada) > 0 && (
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Valor de Entrada</span>
                                            <span className="font-semibold text-green-600">
                                              R$ {Number((fatura as any).valor_entrada).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        )}

                                        {/* Número de Parcelas */}
                                        {((fatura as any).forma_pagamento === "parcelado" || (fatura as any).forma_pagamento === "entrada_parcelado") && Number((fatura as any).numero_parcelas) > 0 && (
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Número de Parcelas</span>
                                            <span className="font-medium">{(fatura as any).numero_parcelas}x</span>
                                          </div>
                                        )}

                                        {/* Valor da Parcela */}
                                        {((fatura as any).forma_pagamento === "parcelado" || (fatura as any).forma_pagamento === "entrada_parcelado") && Number((fatura as any).valor_parcela) > 0 && (
                                          <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground">Valor da Parcela</span>
                                            <span className="font-medium">
                                              R$ {Number((fatura as any).valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                          </div>
                                        )}

                                        {/* Taxa de Parcelamento */}
                                        {taxa > 0 && (
                                          <>
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">Taxa de Parcelamento</span>
                                              <span className={`font-medium ${jurosPagoPor === "empresa" ? "text-red-600" : "text-orange-600"}`}>
                                                {taxa}%
                                              </span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                              <span className="text-muted-foreground">Juros pago por</span>
                                              <Badge variant={jurosPagoPor === "empresa" ? "destructive" : "secondary"} className="rounded">
                                                {jurosPagoPor === "empresa" ? "Empresa" : "Cliente"}
                                              </Badge>
                                            </div>
                                          </>
                                        )}
                                      </div>

                                      {/* Resumo Financeiro - apenas quando há taxa */}
                                      {taxa > 0 && ((fatura as any).forma_pagamento === "parcelado" || (fatura as any).forma_pagamento === "entrada_parcelado") && (
                                        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                                          <h4 className="font-medium text-sm text-foreground border-b border-border pb-2">Resumo Financeiro</h4>
                                          
                                          {jurosPagoPor === "cliente" && (
                                            <>
                                              <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Valor cobrado do cliente</span>
                                                <span className="font-medium">
                                                  R$ {valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Valor recebido pela empresa</span>
                                                <span className="font-medium text-green-600">
                                                  R$ {(valorBruto / (1 + taxa / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                              </div>
                                              {Number((fatura as any).valor_parcela) > 0 && (
                                                <>
                                                  <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Parcela paga pelo cliente</span>
                                                    <span className="font-medium">
                                                      R$ {Number((fatura as any).valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Parcela recebida pela empresa</span>
                                                    <span className="font-medium text-green-600">
                                                      R$ {(Number((fatura as any).valor_parcela) / (1 + taxa / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                  </div>
                                                </>
                                              )}
                                            </>
                                          )}
                                          
                                          {jurosPagoPor === "empresa" && (
                                            <>
                                              <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Valor cobrado do cliente</span>
                                                <span className="font-medium">
                                                  R$ {valorBruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Desconto da taxa</span>
                                                <span className="font-medium text-red-600">
                                                  - R$ {(valorBruto * (taxa / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                              </div>
                                              <div className="flex justify-between items-center">
                                                <span className="text-muted-foreground">Valor recebido pela empresa</span>
                                                <span className="font-medium text-green-600">
                                                  R$ {(valorBruto * (1 - taxa / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </span>
                                              </div>
                                              {Number((fatura as any).valor_parcela) > 0 && (
                                                <>
                                                  <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Parcela paga pelo cliente</span>
                                                    <span className="font-medium">
                                                      R$ {Number((fatura as any).valor_parcela).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                  </div>
                                                  <div className="flex justify-between items-center">
                                                    <span className="text-muted-foreground">Parcela recebida pela empresa</span>
                                                    <span className="font-medium text-green-600">
                                                      R$ {(Number((fatura as any).valor_parcela) * (1 - taxa / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                  </div>
                                                </>
                                              )}
                                            </>
                                          )}
                                        </div>
                                      )}

                                      {/* Observações */}
                                      {fatura.observacoes && (
                                        <div className="space-y-2">
                                          <span className="text-sm font-medium text-muted-foreground">Observações</span>
                                          <p className="text-sm bg-muted/30 rounded-lg p-3">
                                            {fatura.observacoes}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div> : <p className="text-center text-muted-foreground py-8">
                    Nenhuma fatura encontrada
                  </p>}
              </ScrollArea>
            </TabsContent>

            {/* Aba Histórico de Exclusões */}
            <TabsContent value="historico" className="mt-0">
              <ScrollArea className="h-[400px] pr-4">
                {(clienteAgendamentosExcluidos.length > 0 || clienteFaturasExcluidas.length > 0) ? (
                  <div className="space-y-3">
                    {/* Agendamentos excluídos */}
                    {clienteAgendamentosExcluidos.map(agendamento => (
                      <Card key={`ag-${agendamento.id}`} className="p-4 bg-red-500/5 border-red-500/20">
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-red-500/20 text-red-700 border-red-500/30">
                                <Trash2 className="h-3 w-3 mr-1" />
                                Agendamento Excluído
                              </Badge>
                              {agendamento.tipo && (
                                <Badge variant="outline">{agendamento.tipo}</Badge>
                              )}
                              {agendamento.status && (
                                <Badge variant="outline" className="bg-muted">
                                  Status anterior: {agendamento.status}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                <span>Agendado para: {new Date(agendamento.data_agendamento).toLocaleString('pt-BR', {
                                  timeZone: 'America/Sao_Paulo',
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <CalendarX className="h-4 w-4" />
                                <span>Excluído em: {new Date(agendamento.excluido_em).toLocaleString('pt-BR', {
                                  timeZone: 'America/Sao_Paulo',
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}</span>
                              </div>
                            </div>

                            <div className="space-y-1 text-sm text-muted-foreground">
                              {agendamento.procedimento_nome && (
                                <p>📋 {agendamento.procedimento_nome}</p>
                              )}
                              {agendamento.profissional_nome && (
                                <p>👤 {agendamento.profissional_nome}</p>
                              )}
                            </div>

                            {agendamento.observacoes && (
                              <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                                {agendamento.observacoes}
                              </p>
                            )}

                            {agendamento.motivo_exclusao && (
                              <p className="text-sm text-red-600 bg-red-500/10 rounded p-2">
                                <strong>Motivo:</strong> {agendamento.motivo_exclusao}
                              </p>
                            )}
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover do histórico</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja remover este registro do histórico? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={async () => {
                                    try {
                                      await deleteAgendamentoLog.mutateAsync(agendamento.id);
                                      toast({ title: "Registro removido do histórico" });
                                    } catch {
                                      toast({ title: "Erro ao remover", variant: "destructive" });
                                    }
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>
                    ))}

                    {/* Faturas excluídas */}
                    {clienteFaturasExcluidas.map(fatura => (
                      <Card key={`fat-${fatura.id}`} className="p-4 bg-orange-500/5 border-orange-500/20">
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">
                                <DollarSign className="h-3 w-3 mr-1" />
                                Fatura Excluída
                              </Badge>
                              <Badge variant="outline" className="bg-muted">
                                Status anterior: {fatura.status === 'fechado' ? 'Fechado' : 'Negociação'}
                              </Badge>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <DollarSign className="h-4 w-4" />
                                <span>Valor: {Number(fatura.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <CalendarX className="h-4 w-4" />
                                <span>Excluído em: {new Date(fatura.excluido_em).toLocaleString('pt-BR', {
                                  timeZone: 'America/Sao_Paulo',
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}</span>
                              </div>
                            </div>

                            <div className="space-y-1 text-sm text-muted-foreground">
                              {fatura.procedimento_nome && (
                                <p>📋 {fatura.procedimento_nome}</p>
                              )}
                              {fatura.profissional_nome && (
                                <p>👤 {fatura.profissional_nome}</p>
                              )}
                              {fatura.forma_pagamento && (
                                <p>💳 {fatura.forma_pagamento}</p>
                              )}
                            </div>

                            {fatura.observacoes && (
                              <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2">
                                {fatura.observacoes}
                              </p>
                            )}

                            {fatura.motivo_exclusao && (
                              <p className="text-sm text-orange-600 bg-orange-500/10 rounded p-2">
                                <strong>Motivo:</strong> {fatura.motivo_exclusao}
                              </p>
                            )}
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover do histórico</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja remover este registro do histórico? Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={async () => {
                                    try {
                                      await deleteFaturaLog.mutateAsync(fatura.id);
                                      toast({ title: "Registro removido do histórico" });
                                    } catch {
                                      toast({ title: "Erro ao remover", variant: "destructive" });
                                    }
                                  }}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remover
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum registro excluído
                  </p>
                )}
              </ScrollArea>
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      {/* Modais */}
      {cliente && <>
          <EditarClienteDialog cliente={cliente} open={editarClienteOpen} onOpenChange={setEditarClienteOpen} />
          <NovoAgendamentoDialog open={novoAgendamentoOpen} onOpenChange={setNovoAgendamentoOpen} clienteId={cliente.id} initialData={{
        nome: cliente.nome,
        telefone: cliente.telefone,
        email: cliente.email || undefined
      }} />
          <NovaFaturaDialog clienteId={cliente.id} clienteNome={cliente.nome} open={novaFaturaOpen} onOpenChange={setNovaFaturaOpen} />
          {agendamentoSelecionado && <EditarAgendamentoDialog agendamento={agendamentoSelecionado} open={!!agendamentoSelecionado} onOpenChange={open => !open && setAgendamentoSelecionado(null)} />}
          {faturaSelecionada && <EditarFaturaDialog fatura={faturaSelecionada} open={!!faturaSelecionada} onOpenChange={open => !open && setFaturaSelecionada(null)} />}
        </>}
    </div>;
}