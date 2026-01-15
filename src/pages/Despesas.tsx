import { useState, useMemo, useEffect } from "react";
import { format, addMonths, startOfMonth, endOfMonth, differenceInMonths, isBefore, isAfter, isSameMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Calendar as CalendarIcon,
  Tag,
  RefreshCcw,
  DollarSign,
  CreditCard,
  Wallet,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  useDespesas,
  useCreateDespesa,
  useUpdateDespesa,
  useDeleteDespesa,
  DespesaComCategoria,
} from "@/hooks/useDespesasCrud";
import {
  useCategoriasDespesas,
  useCreateCategoriaDespesa,
  useUpdateCategoriaDespesa,
  useDeleteCategoriaDespesa,
  CategoriaDespesa,
} from "@/hooks/useCategoriasDespesas";
import {
  useDespesasAjustes,
  useCreateDespesaAjuste,
} from "@/hooks/useDespesasAjustes";
import {
  useDespesasExclusoes,
  useCreateDespesaExclusao,
  isDespesaExcluidaNoMes,
} from "@/hooks/useDespesasExclusoes";
import { DespesasPeriodFilter, useDespesasPeriodFilter } from "@/components/filters/DespesasPeriodFilter";
import { toZonedBrasilia, startOfDayBrasilia, endOfDayBrasilia, formatBrasilia, parseDateStringBrasilia } from "@/utils/timezone";



interface DespesaFormData {
  descricao: string;
  valor: string;
  categoria_id: string;
  data_despesa: Date | undefined;
  recorrente: boolean;
  parcelada: boolean;
  numero_parcelas: string;
  data_inicio: Date | undefined;
  data_fim: Date | undefined;
  observacoes: string;
}

const initialFormData: DespesaFormData = {
  descricao: "",
  valor: "",
  categoria_id: "",
  data_despesa: new Date(),
  recorrente: false,
  parcelada: false,
  numero_parcelas: "",
  data_inicio: undefined,
  data_fim: undefined,
  observacoes: "",
};

export default function Despesas() {
  const [busca, setBusca] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");
  const [filtroTipo, setFiltroTipo] = useState<string>("todas");
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd } = useDespesasPeriodFilter();
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoriaDialogOpen, setCategoriaDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [despesaParaExcluir, setDespesaParaExcluir] = useState<DespesaComCategoria | null>(null);
  const [despesaEditando, setDespesaEditando] = useState<DespesaComCategoria | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<DespesaFormData>(initialFormData);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [corCategoria, setCorCategoria] = useState("#6366f1");
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaDespesa | null>(null);
  const [editNomeCategoria, setEditNomeCategoria] = useState("");
  const [editCorCategoria, setEditCorCategoria] = useState("#6366f1");
  
  // State for value adjustment
  const [ajusteDialogOpen, setAjusteDialogOpen] = useState(false);
  const [ajusteNovoValor, setAjusteNovoValor] = useState("");
  const [ajusteDataInicio, setAjusteDataInicio] = useState<Date | undefined>(new Date());
  const [ajusteObservacao, setAjusteObservacao] = useState("");

  // Queries and mutations
  const { data: despesas, isLoading: isLoadingDespesas } = useDespesas();
  const { data: categorias, isLoading: isLoadingCategorias } = useCategoriasDespesas();
  const { data: ajustesDespesa } = useDespesasAjustes(despesaEditando?.id);
  const { data: exclusoesMensais } = useDespesasExclusoes();
  const createDespesa = useCreateDespesa();
  const updateDespesa = useUpdateDespesa();
  const deleteDespesa = useDeleteDespesa();
  const createCategoria = useCreateCategoriaDespesa();
  const updateCategoria = useUpdateCategoriaDespesa();
  const deleteCategoria = useDeleteCategoriaDespesa();
  const createAjuste = useCreateDespesaAjuste();
  const createExclusao = useCreateDespesaExclusao();
  // Helper function to calculate occurrences in period
  const calcularOcorrenciasNoPeriodo = (despesa: DespesaComCategoria, periodStart: Date, periodEnd: Date): number => {
    if (despesa.recorrente) {
      // For recurring: count how many months overlap
      const dataInicio = despesa.data_despesa ? toZonedBrasilia(despesa.data_despesa) : toZonedBrasilia(despesa.created_at || new Date().toISOString());
      const dataFim = despesa.data_fim ? toZonedBrasilia(despesa.data_fim) : null;
      
      // Effective start is the later of despesa start or period start
      const effectiveStart = isBefore(dataInicio, periodStart) ? periodStart : dataInicio;
      // Effective end is the earlier of despesa end (or period end if no end) and period end
      const effectiveEnd = dataFim && isBefore(dataFim, periodEnd) ? dataFim : periodEnd;
      
      if (isBefore(effectiveEnd, effectiveStart)) return 0;
      
      // Count months between effective start and end (inclusive)
      let count = 0;
      let currentMonth = startOfMonth(effectiveStart);
      const lastMonth = startOfMonth(effectiveEnd);
      
      while (!isAfter(currentMonth, lastMonth)) {
        // Check if excluded for this month
        if (!exclusoesMensais || !isDespesaExcluidaNoMes(exclusoesMensais, despesa.id, currentMonth)) {
          count++;
        }
        currentMonth = addMonths(currentMonth, 1);
      }
      
      return count;
    } else if (despesa.parcelada && despesa.data_inicio && despesa.data_fim) {
      // For installments: count how many installments fall within period
      const dataInicio = toZonedBrasilia(despesa.data_inicio);
      const dataFim = toZonedBrasilia(despesa.data_fim);
      
      // Effective start is the later of despesa start or period start
      const effectiveStart = isBefore(dataInicio, periodStart) ? periodStart : dataInicio;
      // Effective end is the earlier of despesa end and period end
      const effectiveEnd = isBefore(dataFim, periodEnd) ? dataFim : periodEnd;
      
      if (isBefore(effectiveEnd, effectiveStart)) return 0;
      
      // Count months between effective start and end (inclusive)
      let count = 0;
      let currentMonth = startOfMonth(effectiveStart);
      const lastMonth = startOfMonth(effectiveEnd);
      
      while (!isAfter(currentMonth, lastMonth)) {
        count++;
        currentMonth = addMonths(currentMonth, 1);
      }
      
      return count;
    }
    
    // For single expenses, always 1
    return 1;
  };

  // Filtered despesas by period with occurrence count
  const despesasFiltradasComOcorrencias = useMemo(() => {
    if (!despesas) return [];
    
    const periodStart = startOfDayBrasilia(dateStart);
    const periodEnd = endOfDayBrasilia(dateEnd);
    
    return despesas
      .map((d) => {
        // Calculate occurrences
        const ocorrencias = calcularOcorrenciasNoPeriodo(d, periodStart, periodEnd);
        return { ...d, ocorrencias };
      })
      .filter((d) => {
        // Filter out items with no occurrences
        if (d.ocorrencias === 0) return false;
        
        // For non-recurring/non-installment, check date range
        if (!d.recorrente && !d.parcelada) {
          const despesaDate = d.data_despesa ? toZonedBrasilia(d.data_despesa) : toZonedBrasilia(d.created_at || new Date().toISOString());
          if (despesaDate < periodStart) return false;
          if (despesaDate > periodEnd) return false;
        }
        
        // Search filter
        const matchBusca = d.descricao.toLowerCase().includes(busca.toLowerCase()) ||
          d.categorias_despesas?.nome?.toLowerCase().includes(busca.toLowerCase());
        
        // Category filter
        const matchCategoria = filtroCategoria === "todas" || d.categoria_id === filtroCategoria;
        
        // Type filter (recorrente, variavel, parcelada)
        let matchTipo = filtroTipo === "todas";
        if (filtroTipo === "recorrente" && d.recorrente) matchTipo = true;
        if (filtroTipo === "variavel" && !d.recorrente && !d.parcelada) matchTipo = true;
        if (filtroTipo === "parcelada" && d.parcelada) matchTipo = true;
        
        return matchBusca && matchCategoria && matchTipo;
      });
  }, [despesas, busca, filtroCategoria, filtroTipo, dateStart, dateEnd, exclusoesMensais]);

  // Backwards compatibility alias
  const despesasFiltradas = despesasFiltradasComOcorrencias;

  // Total considering occurrences
  const totalDespesas = useMemo(() => {
    return despesasFiltradasComOcorrencias.reduce((acc, d) => {
      const multiplicador = (d.recorrente || d.parcelada) ? d.ocorrencias : 1;
      return acc + (Number(d.valor) * multiplicador);
    }, 0);
  }, [despesasFiltradasComOcorrencias]);

  const handleOpenDialog = (despesa?: DespesaComCategoria) => {
    if (despesa) {
      setDespesaEditando(despesa);
      setFormData({
        descricao: despesa.descricao,
        valor: despesa.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        categoria_id: despesa.categoria_id || "",
        data_despesa: despesa.data_despesa ? new Date(despesa.data_despesa) : new Date(),
        recorrente: despesa.recorrente || false,
        parcelada: despesa.parcelada || false,
        numero_parcelas: despesa.numero_parcelas?.toString() || "",
        data_inicio: despesa.data_inicio ? new Date(despesa.data_inicio) : undefined,
        data_fim: despesa.data_fim ? new Date(despesa.data_fim) : undefined,
        observacoes: despesa.observacoes || "",
      });
    } else {
      setDespesaEditando(null);
      setFormData(initialFormData);
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.descricao.trim()) {
      toast({ title: "Erro", description: "Descrição é obrigatória", variant: "destructive" });
      return;
    }

    const valor = parseCurrencyToNumber(formData.valor);
    if (valor <= 0) {
      toast({ title: "Erro", description: "Valor deve ser maior que zero", variant: "destructive" });
      return;
    }

    if (formData.parcelada && !formData.numero_parcelas) {
      toast({ title: "Erro", description: "Número de parcelas é obrigatório para despesa parcelada", variant: "destructive" });
      return;
    }

    if (formData.parcelada && (!formData.data_inicio || !formData.data_fim)) {
      toast({ title: "Erro", description: "Datas de início e fim são obrigatórias para despesa parcelada", variant: "destructive" });
      return;
    }

    try {
      const despesaData = {
        descricao: formData.descricao.trim(),
        valor,
        categoria_id: formData.categoria_id || null,
        data_despesa: formData.parcelada ? null : (formData.data_despesa ? format(formData.data_despesa, "yyyy-MM-dd") : null),
        recorrente: formData.parcelada ? false : formData.recorrente,
        parcelada: formData.parcelada,
        numero_parcelas: formData.parcelada ? parseInt(formData.numero_parcelas) : null,
        data_inicio: formData.parcelada && formData.data_inicio ? format(formData.data_inicio, "yyyy-MM-dd") : null,
        data_fim: formData.parcelada && formData.data_fim ? format(formData.data_fim, "yyyy-MM-dd") : null,
        observacoes: formData.observacoes.trim() || null,
      };

      if (despesaEditando) {
        await updateDespesa.mutateAsync({ id: despesaEditando.id, ...despesaData });
        toast({ title: "Sucesso", description: "Despesa atualizada com sucesso" });
      } else {
        await createDespesa.mutateAsync(despesaData);
        toast({ title: "Sucesso", description: "Despesa cadastrada com sucesso" });
      }
      
      setDialogOpen(false);
      setFormData(initialFormData);
      setDespesaEditando(null);
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao salvar despesa", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!despesaParaExcluir) return;
    
    try {
      // Para despesas recorrentes, apenas define data_fim ao invés de excluir permanentemente
      if (despesaParaExcluir.recorrente) {
        const hoje = format(new Date(), "yyyy-MM-dd");
        await updateDespesa.mutateAsync({
          id: despesaParaExcluir.id,
          data_fim: hoje,
        });
        toast({ title: "Sucesso", description: "Despesa recorrente encerrada. O histórico foi mantido." });
      } else {
        await deleteDespesa.mutateAsync(despesaParaExcluir.id);
        toast({ title: "Sucesso", description: "Despesa excluída com sucesso" });
      }
      setDeleteDialogOpen(false);
      setDespesaParaExcluir(null);
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao excluir despesa", variant: "destructive" });
    }
  };

  // Excluir despesa recorrente apenas do mês selecionado
  const handleExcluirDoMes = async () => {
    if (!despesaParaExcluir || !despesaParaExcluir.recorrente) return;
    
    try {
      await createExclusao.mutateAsync({
        despesa_id: despesaParaExcluir.id,
        mes: startOfMonth(dateStart),
        motivo: "Excluída manualmente deste mês",
      });
      toast({ 
        title: "Sucesso", 
        description: `Despesa removida de ${format(startOfMonth(dateStart), "MMMM/yyyy", { locale: ptBR })}` 
      });
      setDeleteDialogOpen(false);
      setDespesaParaExcluir(null);
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao excluir do mês", variant: "destructive" });
    }
  };

  const handleCreateCategoria = async () => {
    if (!novaCategoria.trim()) {
      toast({ title: "Erro", description: "Nome da categoria é obrigatório", variant: "destructive" });
      return;
    }

    try {
      await createCategoria.mutateAsync({ nome: novaCategoria.trim(), cor: corCategoria });
      toast({ title: "Sucesso", description: "Categoria criada com sucesso" });
      setNovaCategoria("");
      setCategoriaDialogOpen(false);
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao criar categoria", variant: "destructive" });
    }
  };

  const handleOpenAjusteDialog = () => {
    if (!despesaEditando) return;
    setAjusteNovoValor("");
    setAjusteDataInicio(new Date());
    setAjusteObservacao("");
    setAjusteDialogOpen(true);
  };

  const handleSalvarAjuste = async () => {
    if (!despesaEditando) return;
    
    const novoValor = parseCurrencyToNumber(ajusteNovoValor);
    if (novoValor <= 0) {
      toast({ title: "Erro", description: "Novo valor deve ser maior que zero", variant: "destructive" });
      return;
    }

    if (!ajusteDataInicio) {
      toast({ title: "Erro", description: "Data de início do ajuste é obrigatória", variant: "destructive" });
      return;
    }

    try {
      // Cria o registro de ajuste
      await createAjuste.mutateAsync({
        despesa_id: despesaEditando.id,
        valor_anterior: despesaEditando.valor,
        valor_novo: novoValor,
        data_ajuste: format(ajusteDataInicio, "yyyy-MM-dd"),
        observacao: ajusteObservacao.trim() || undefined,
      });

      // Atualiza o valor atual da despesa
      await updateDespesa.mutateAsync({
        id: despesaEditando.id,
        valor: novoValor,
      });

      toast({ title: "Sucesso", description: "Ajuste de valor registrado com sucesso" });
      setAjusteDialogOpen(false);
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao salvar ajuste", variant: "destructive" });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6" />
          <h1 className="text-2xl font-bold text-foreground">Despesas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCategoriaDialogOpen(true)} title="Categorias">
            <Tag className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline text-sm">Categorias</span>
          </Button>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="text-xs sm:text-sm">Nova Despesa</span>
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card className="p-4 shadow-card">
        <div className="flex flex-wrap gap-4 items-center">
          <DespesasPeriodFilter
            showLabel
            value={periodFilter}
            onChange={setPeriodFilter}
            dateStart={dateStart}
            dateEnd={dateEnd}
            onDateStartChange={setDateStart}
            onDateEndChange={setDateEnd}
          />

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Categoria:</span>
            <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {categorias?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Tipo:</span>
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos</SelectItem>
                <SelectItem value="recorrente">Recorrente</SelectItem>
                <SelectItem value="variavel">Variável</SelectItem>
                <SelectItem value="parcelada">Parcelada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(filtroCategoria !== "todas" || filtroTipo !== "todas") && (
            <Button variant="outline" size="sm" onClick={() => {
              setFiltroCategoria("todas");
              setFiltroTipo("todas");
            }}>
              Limpar Filtros
            </Button>
          )}
        </div>
      </Card>

      {/* Summary Card */}
      <Card className="bg-destructive/10 border-destructive/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-destructive/20">
                <DollarSign className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Despesas</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalDespesas)}</p>
                <p className="text-xs text-muted-foreground mt-1">{despesasFiltradas.length} despesas</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card className="p-4 shadow-card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por descrição ou categoria..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {/* Despesas List */}
      {isLoadingDespesas ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-6 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : despesasFiltradas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhuma despesa encontrada</p>
            <Button variant="outline" className="mt-4" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar primeira despesa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {despesasFiltradas.map((despesa) => {
            // Determinar ícone e cor baseado no tipo
            const getTipoConfig = () => {
              if (despesa.recorrente) return { icon: RefreshCcw, color: "bg-blue-500/10 text-blue-600", label: "Recorrente" };
              if (despesa.parcelada) return { icon: CreditCard, color: "bg-orange-500/10 text-orange-600", label: `${despesa.numero_parcelas}x` };
              return { icon: DollarSign, color: "bg-emerald-500/10 text-emerald-600", label: "Variável" };
            };
            const tipoConfig = getTipoConfig();
            const TipoIcon = tipoConfig.icon;
            
            // Calculate display values with occurrences
            const ocorrencias = despesa.ocorrencias || 1;
            const valorUnitario = Number(despesa.valor);
            const valorTotal = (despesa.recorrente || despesa.parcelada) ? valorUnitario * ocorrencias : valorUnitario;
            const mostrarOcorrencias = (despesa.recorrente || despesa.parcelada) && ocorrencias > 1;

            return (
              <Card key={despesa.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  {/* Desktop layout */}
                  <div className="hidden sm:flex items-center gap-4">
                    {/* Ícone de tipo à esquerda */}
                    <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", tipoConfig.color)}>
                      <TipoIcon className="h-5 w-5" />
                    </div>
                    
                    {/* Informações centrais */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate">{despesa.descricao}</h3>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                          {despesa.parcelada ? (
                          despesa.data_inicio && (
                            <span>{formatBrasilia(parseDateStringBrasilia(despesa.data_inicio), "dd/MM/yy")} - {despesa.data_fim && formatBrasilia(parseDateStringBrasilia(despesa.data_fim), "dd/MM/yy")}</span>
                          )
                        ) : (
                          despesa.data_despesa && (
                            <span>{formatBrasilia(parseDateStringBrasilia(despesa.data_despesa), "dd/MM/yyyy")}</span>
                          )
                        )}
                        {despesa.categorias_despesas && (
                          <>
                            <span>•</span>
                            <span style={{ color: despesa.categorias_despesas.cor || undefined }}>
                              {despesa.categorias_despesas.nome}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Valor à direita */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-destructive">
                        {formatCurrency(valorTotal)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {mostrarOcorrencias 
                          ? `${formatCurrency(valorUnitario)} × ${ocorrencias} meses`
                          : tipoConfig.label
                        }
                      </p>
                    </div>
                    
                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenDialog(despesa)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          setDespesaParaExcluir(despesa);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Mobile layout */}
                  <div className="sm:hidden space-y-3">
                    {/* Linha 1: Ícone + Descrição + Ações */}
                    <div className="flex items-start gap-3">
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", tipoConfig.color)}>
                        <TipoIcon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-foreground leading-tight">{despesa.descricao}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{tipoConfig.label}</p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => handleOpenDialog(despesa)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={() => {
                            setDespesaParaExcluir(despesa);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Linha 2: Data, Categoria e Valor */}
                    <div className="flex items-center justify-between pl-12">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {despesa.parcelada ? (
                          despesa.data_inicio && (
                            <span>{formatBrasilia(parseDateStringBrasilia(despesa.data_inicio), "dd/MM/yy")} - {despesa.data_fim && formatBrasilia(parseDateStringBrasilia(despesa.data_fim), "dd/MM/yy")}</span>
                          )
                        ) : (
                          despesa.data_despesa && (
                            <span>{formatBrasilia(parseDateStringBrasilia(despesa.data_despesa), "dd/MM/yy")}</span>
                          )
                        )}
                        {despesa.categorias_despesas && (
                          <>
                            <span>•</span>
                            <span style={{ color: despesa.categorias_despesas.cor || undefined }}>
                              {despesa.categorias_despesas.nome}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-destructive">
                          {formatCurrency(valorTotal)}
                        </p>
                        {mostrarOcorrencias && (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(valorUnitario)} × {ocorrencias}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Despesa Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{despesaEditando ? "Editar Despesa" : "Nova Despesa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input
                id="descricao"
                value={formData.descricao}
                onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                placeholder="Ex: Aluguel, Internet, Água..."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor">Valor *</Label>
                <CurrencyInput
                  id="valor"
                  value={formData.valor}
                  onChange={(v) => setFormData({ ...formData, valor: v })}
                />
              </div>
              {!formData.parcelada && (
                <div className="space-y-2">
                  <Label>{formData.recorrente ? "Dia de Pagamento" : "Data"}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.data_despesa && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.data_despesa ? (
                          format(formData.data_despesa, "dd/MM/yyyy")
                        ) : (
                          "Selecionar data"
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.data_despesa}
                        onSelect={(date) => setFormData({ ...formData, data_despesa: date })}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria</Label>
              <Select 
                value={formData.categoria_id} 
                onValueChange={(v) => setFormData({ ...formData, categoria_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <div className="flex items-center gap-2">
                        {cat.cor && (
                          <div 
                            className="h-3 w-3 rounded-full" 
                            style={{ backgroundColor: cat.cor }}
                          />
                        )}
                        {cat.nome}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tipo de despesa - recorrente ou parcelada */}
            <div className="space-y-4 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="recorrente">Despesa Recorrente</Label>
                  <p className="text-xs text-muted-foreground">Marque se esta despesa se repete mensalmente</p>
                </div>
                <Switch
                  id="recorrente"
                  checked={formData.recorrente}
                  disabled={formData.parcelada}
                  onCheckedChange={(checked) => setFormData({ ...formData, recorrente: checked, parcelada: false })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="parcelada">Despesa Parcelada</Label>
                  <p className="text-xs text-muted-foreground">Para despesas com parcelas definidas</p>
                </div>
                <Switch
                  id="parcelada"
                  checked={formData.parcelada}
                  onCheckedChange={(checked) => setFormData({ 
                    ...formData, 
                    parcelada: checked, 
                    recorrente: false,
                    numero_parcelas: checked ? formData.numero_parcelas : "",
                    data_inicio: checked ? formData.data_inicio : undefined,
                    data_fim: checked ? formData.data_fim : undefined
                  })}
                />
              </div>

              {/* Campos de parcelamento */}
              {formData.parcelada && (
                <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="numero_parcelas">Número de Parcelas *</Label>
                      <Input
                        id="numero_parcelas"
                        type="number"
                        min="1"
                        value={formData.numero_parcelas}
                        onChange={(e) => {
                          const parcelas = e.target.value;
                          const numParcelas = parseInt(parcelas);
                          let newDataFim = formData.data_fim;
                          
                          if (formData.data_inicio && numParcelas > 0) {
                            newDataFim = addMonths(formData.data_inicio, numParcelas - 1);
                          }
                          
                          setFormData({ ...formData, numero_parcelas: parcelas, data_fim: newDataFim });
                        }}
                        placeholder="Ex: 12"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Data Início *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !formData.data_inicio && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {formData.data_inicio ? (
                              format(formData.data_inicio, "dd/MM/yy")
                            ) : (
                              "Início"
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={formData.data_inicio}
                            onSelect={(date) => {
                              const numParcelas = parseInt(formData.numero_parcelas);
                              let newDataFim = formData.data_fim;
                              
                              if (date && numParcelas > 0) {
                                newDataFim = addMonths(date, numParcelas - 1);
                              }
                              
                              setFormData({ ...formData, data_inicio: date, data_fim: newDataFim });
                            }}
                            locale={ptBR}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Data Fim (calculada automaticamente)</Label>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal cursor-default",
                        !formData.data_fim && "text-muted-foreground"
                      )}
                      disabled
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.data_fim ? (
                        format(formData.data_fim, "dd/MM/yyyy")
                      ) : (
                        "Preencha parcelas e data início"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Seção de ajuste de valor para despesas recorrentes em edição */}
              {despesaEditando && formData.recorrente && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-medium">Ajuste de Valor</Label>
                      <p className="text-xs text-muted-foreground">
                        Altere o valor a partir de uma data (registros anteriores mantidos)
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleOpenAjusteDialog}
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Ajustar Valor
                    </Button>
                  </div>
                  
                  {/* Histórico de ajustes */}
                  {ajustesDespesa && ajustesDespesa.length > 0 && (
                    <div className="space-y-2 mt-3">
                      <Label className="text-xs text-muted-foreground">Histórico de ajustes:</Label>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {ajustesDespesa.map((ajuste) => (
                          <div key={ajuste.id} className="flex justify-between items-center text-xs p-2 bg-background rounded">
                            <span>{formatBrasilia(parseDateStringBrasilia(ajuste.data_ajuste), "dd/MM/yyyy")}</span>
                            <span className="text-muted-foreground">
                              {formatCurrency(ajuste.valor_anterior)} → {formatCurrency(ajuste.valor_novo)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea
                id="observacoes"
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createDespesa.isPending || updateDespesa.isPending}
            >
              {despesaEditando ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Categories Dialog */}
      <Dialog open={categoriaDialogOpen} onOpenChange={setCategoriaDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <Label>Nova Categoria</Label>
              <div className="flex gap-2">
                <Input
                  value={novaCategoria}
                  onChange={(e) => setNovaCategoria(e.target.value)}
                  placeholder="Nome da categoria"
                  className="flex-1"
                />
                <input
                  type="color"
                  value={corCategoria}
                  onChange={(e) => setCorCategoria(e.target.value)}
                  className="h-10 w-10 rounded border border-input cursor-pointer"
                />
                <Button onClick={handleCreateCategoria} disabled={createCategoria.isPending}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {isLoadingCategorias ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : categorias && categorias.length > 0 ? (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {categorias.map((cat) => (
                  <div 
                    key={cat.id} 
                    className="flex items-center justify-between p-2 rounded-lg border"
                  >
                    {categoriaEditando?.id === cat.id ? (
                      // Edit mode
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="color"
                          value={editCorCategoria}
                          onChange={(e) => setEditCorCategoria(e.target.value)}
                          className="h-8 w-8 rounded border border-input cursor-pointer"
                        />
                        <Input
                          value={editNomeCategoria}
                          onChange={(e) => setEditNomeCategoria(e.target.value)}
                          placeholder="Nome da categoria"
                          className="flex-1 h-8"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary"
                          onClick={() => {
                            if (editNomeCategoria.trim()) {
                              updateCategoria.mutate({
                                id: cat.id,
                                nome: editNomeCategoria.trim(),
                                cor: editCorCategoria,
                              }, {
                                onSuccess: () => {
                                  setCategoriaEditando(null);
                                  toast({ title: "Categoria atualizada!" });
                                },
                              });
                            }
                          }}
                          disabled={updateCategoria.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setCategoriaEditando(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <div className="flex items-center gap-2">
                          {cat.cor && (
                            <div 
                              className="h-4 w-4 rounded-full" 
                              style={{ backgroundColor: cat.cor }}
                            />
                          )}
                          <span className="text-sm">{cat.nome}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setCategoriaEditando(cat);
                              setEditNomeCategoria(cat.nome);
                              setEditCorCategoria(cat.cor || "#6366f1");
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => deleteCategoria.mutate(cat.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma categoria cadastrada
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {despesaParaExcluir?.recorrente 
                ? "Remover Despesa Recorrente"
                : "Excluir Despesa"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {despesaParaExcluir?.recorrente ? (
                <>
                  <span className="block">
                    Escolha uma opção para a despesa recorrente:
                  </span>
                  <span className="block text-sm">
                    • <strong>Remover deste mês:</strong> Remove apenas de{" "}
                    <strong>{format(startOfMonth(dateStart), "MMMM/yyyy", { locale: ptBR })}</strong>.
                  </span>
                  <span className="block text-sm">
                    • <strong>Excluir Futuras:</strong> Encerra a despesa a partir de hoje. O histórico será mantido.
                  </span>
                </>
              ) : (
                "Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {despesaParaExcluir?.recorrente && (
              <Button
                variant="outline"
                onClick={handleExcluirDoMes}
                disabled={createExclusao.isPending}
              >
                Remover deste mês
              </Button>
            )}
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {despesaParaExcluir?.recorrente ? "Excluir Futuras" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Ajuste de Valor Dialog */}
      <Dialog open={ajusteDialogOpen} onOpenChange={setAjusteDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Ajustar Valor da Despesa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {despesaEditando && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">{despesaEditando.descricao}</p>
                <p className="text-xs text-muted-foreground">
                  Valor atual: {formatCurrency(despesaEditando.valor)}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="ajuste_valor">Novo Valor *</Label>
              <CurrencyInput
                id="ajuste_valor"
                value={ajusteNovoValor}
                onChange={setAjusteNovoValor}
              />
            </div>

            <div className="space-y-2">
              <Label>A partir de *</Label>
              <p className="text-xs text-muted-foreground">
                O novo valor será aplicado a partir desta data. Registros anteriores não serão afetados.
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !ajusteDataInicio && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {ajusteDataInicio ? (
                      format(ajusteDataInicio, "dd/MM/yyyy")
                    ) : (
                      "Selecionar data"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={ajusteDataInicio}
                    onSelect={setAjusteDataInicio}
                    locale={ptBR}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ajuste_obs">Observação (opcional)</Label>
              <Input
                id="ajuste_obs"
                value={ajusteObservacao}
                onChange={(e) => setAjusteObservacao(e.target.value)}
                placeholder="Ex: Reajuste anual..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAjusteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSalvarAjuste}
              disabled={createAjuste.isPending || updateDespesa.isPending}
            >
              Salvar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
