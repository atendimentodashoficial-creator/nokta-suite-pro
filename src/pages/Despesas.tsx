import { useState, useMemo, useEffect } from "react";
import { format, addMonths } from "date-fns";
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
  Wallet
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
  useDeleteCategoriaDespesa,
} from "@/hooks/useCategoriasDespesas";
import { PeriodFilter, usePeriodFilter } from "@/components/filters/PeriodFilter";
import { toZonedBrasilia, startOfDayBrasilia, endOfDayBrasilia } from "@/utils/timezone";


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
  const { periodFilter, setPeriodFilter, dateStart, setDateStart, dateEnd, setDateEnd } = usePeriodFilter("this_month");
  
  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoriaDialogOpen, setCategoriaDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [despesaParaExcluir, setDespesaParaExcluir] = useState<string | null>(null);
  const [despesaEditando, setDespesaEditando] = useState<DespesaComCategoria | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<DespesaFormData>(initialFormData);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [corCategoria, setCorCategoria] = useState("#6366f1");

  // Queries and mutations
  const { data: despesas, isLoading: isLoadingDespesas } = useDespesas();
  const { data: categorias, isLoading: isLoadingCategorias } = useCategoriasDespesas();
  const createDespesa = useCreateDespesa();
  const updateDespesa = useUpdateDespesa();
  const deleteDespesa = useDeleteDespesa();
  const createCategoria = useCreateCategoriaDespesa();
  const deleteCategoria = useDeleteCategoriaDespesa();

  // Filtered despesas by period first
  const despesasFiltradas = useMemo(() => {
    if (!despesas) return [];
    
    return despesas.filter((d) => {
      // Filter by period (using data_despesa or data_inicio for installment)
      const despesaDate = d.data_despesa ? toZonedBrasilia(d.data_despesa) : d.data_inicio ? toZonedBrasilia(d.data_inicio) : toZonedBrasilia(d.created_at || new Date().toISOString());
      if (despesaDate < startOfDayBrasilia(dateStart)) return false;
      if (despesaDate > endOfDayBrasilia(dateEnd)) return false;
      
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
  }, [despesas, busca, filtroCategoria, filtroTipo, dateStart, dateEnd]);

  // Total
  const totalDespesas = useMemo(() => {
    return despesasFiltradas.reduce((acc, d) => acc + Number(d.valor), 0);
  }, [despesasFiltradas]);

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
      await deleteDespesa.mutateAsync(despesaParaExcluir);
      toast({ title: "Sucesso", description: "Despesa excluída com sucesso" });
      setDeleteDialogOpen(false);
      setDespesaParaExcluir(null);
    } catch (error) {
      toast({ title: "Erro", description: "Erro ao excluir despesa", variant: "destructive" });
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-6 h-6" />
          <h1 className="text-2xl font-bold text-foreground">Despesas</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoriaDialogOpen(true)}>
            <Tag className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Categorias</span>
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Despesa
          </Button>
        </div>
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
          {despesasFiltradas.map((despesa) => (
            <Card key={despesa.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-foreground break-words">{despesa.descricao}</h3>
                      {despesa.recorrente && (
                        <Badge variant="secondary" className="text-xs">
                          <RefreshCcw className="h-3 w-3 mr-1" />
                          Recorrente
                        </Badge>
                      )}
                      {despesa.parcelada && (
                        <Badge variant="outline" className="text-xs border-orange-500 text-orange-600">
                          <CreditCard className="h-3 w-3 mr-1" />
                          {despesa.numero_parcelas}x
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                      {despesa.parcelada ? (
                        <>
                          {despesa.data_inicio && despesa.data_fim && (
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-3.5 w-3.5" />
                              {format(new Date(despesa.data_inicio), "dd/MM/yyyy")} - {format(new Date(despesa.data_fim), "dd/MM/yyyy")}
                            </span>
                          )}
                        </>
                      ) : (
                        despesa.data_despesa && (
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            {format(new Date(despesa.data_despesa), "dd/MM/yyyy")}
                          </span>
                        )
                      )}
                      {despesa.categorias_despesas && (
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                          style={{ 
                            borderColor: despesa.categorias_despesas.cor || undefined,
                            color: despesa.categorias_despesas.cor || undefined
                          }}
                        >
                          {despesa.categorias_despesas.nome}
                        </Badge>
                      )}
                    </div>
                    {despesa.observacoes && (
                      <p className="text-xs text-muted-foreground line-clamp-1">{despesa.observacoes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-lg font-semibold text-destructive">
                      {formatCurrency(Number(despesa.valor))}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(despesa)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => {
                        setDespesaParaExcluir(despesa.id);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
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
                  <Label>Data</Label>
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
                    <div className="flex items-center gap-2">
                      {cat.cor && (
                        <div 
                          className="h-4 w-4 rounded-full" 
                          style={{ backgroundColor: cat.cor }}
                        />
                      )}
                      <span className="text-sm">{cat.nome}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteCategoria.mutate(cat.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
            <AlertDialogTitle>Excluir Despesa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta despesa? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
