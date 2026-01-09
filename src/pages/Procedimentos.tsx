import { useState, useMemo } from "react";
import { useProcedimentos, useCreateProcedimento, useUpdateProcedimento, useDeleteProcedimento } from "@/hooks/useProcedimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, Filter, FileText } from "lucide-react";
import { Procedimento } from "@/hooks/useProcedimentos";
export default function Procedimentos() {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Procedimento | null>(null);
  const [excluindo, setExcluindo] = useState<Procedimento | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valorMedio, setValorMedio] = useState("");
  const [duracaoMinutos, setDuracaoMinutos] = useState("60");

  // Estados de filtro
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("todas");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const {
    data: procedimentos,
    isLoading
  } = useProcedimentos();
  const createProcedimento = useCreateProcedimento();
  const updateProcedimento = useUpdateProcedimento();
  const deleteProcedimento = useDeleteProcedimento();

  // Obter categorias únicas
  const categorias = useMemo(() => {
    if (!procedimentos) return [];
    const cats = procedimentos.map(p => p.categoria).filter((c): c is string => !!c);
    return Array.from(new Set(cats)).sort();
  }, [procedimentos]);

  // Filtrar procedimentos
  const procedimentosFiltrados = useMemo(() => {
    if (!procedimentos) return [];
    return procedimentos.filter(proc => {
      const matchNome = proc.nome.toLowerCase().includes(filtroNome.toLowerCase());
      const matchCategoria = filtroCategoria === "todas" || proc.categoria === filtroCategoria;
      const matchStatus = filtroStatus === "todos" || filtroStatus === "ativos" && proc.ativo || filtroStatus === "inativos" && !proc.ativo;
      return matchNome && matchCategoria && matchStatus;
    });
  }, [procedimentos, filtroNome, filtroCategoria, filtroStatus]);
  const handleEditar = (proc: Procedimento) => {
    setEditando(proc);
    setNome(proc.nome);
    setCategoria(proc.categoria || "");
    setDescricao(proc.descricao || "");
    setValorMedio(proc.valor_medio?.toString() || "");
    setDuracaoMinutos((proc.tempo_atendimento_minutos || proc.duracao_minutos || 60).toString());
    setOpen(true);
  };
  const limparFormulario = () => {
    setEditando(null);
    setNome("");
    setCategoria("");
    setDescricao("");
    setValorMedio("");
    setDuracaoMinutos("60");
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const dados = {
      nome,
      categoria: categoria || null,
      descricao: descricao || null,
      valor_medio: valorMedio ? parseFloat(valorMedio) : null,
      duracao_minutos: duracaoMinutos ? parseInt(duracaoMinutos) : 60,
      tempo_atendimento_minutos: duracaoMinutos ? parseInt(duracaoMinutos) : 60,
      ativo: true
    };
    if (editando) {
      updateProcedimento.mutate({
        id: editando.id,
        ...dados
      }, {
        onSuccess: () => {
          toast.success("Procedimento atualizado com sucesso!");
          setOpen(false);
          limparFormulario();
        },
        onError: () => {
          toast.error("Erro ao atualizar procedimento");
        }
      });
    } else {
      createProcedimento.mutate(dados, {
        onSuccess: () => {
          toast.success("Procedimento cadastrado com sucesso!");
          setOpen(false);
          limparFormulario();
        },
        onError: () => {
          toast.error("Erro ao cadastrar procedimento");
        }
      });
    }
  };
  const handleExcluir = () => {
    if (!excluindo) return;
    deleteProcedimento.mutate(excluindo.id, {
      onSuccess: () => {
        toast.success("Procedimento excluído com sucesso!");
        setExcluindo(null);
      },
      onError: () => {
        toast.error("Erro ao excluir procedimento");
      }
    });
  };
  return <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div />

        <Dialog open={open} onOpenChange={o => {
        setOpen(o);
        if (!o) limparFormulario();
      }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{editando ? "Editar Procedimento" : "Cadastrar Novo Procedimento"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do procedimento" required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria</Label>
                <Input id="categoria" value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Ex: Estética, Preventivo..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea id="descricao" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Descrição do procedimento" rows={3} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="valor">Valor Médio (R$)</Label>
                  <Input id="valor" type="number" step="0.01" value={valorMedio} onChange={e => setValorMedio(e.target.value)} placeholder="0,00" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duracao">Duração (minutos) *</Label>
                  <Input id="duracao" type="number" value={duracaoMinutos} onChange={e => setDuracaoMinutos(e.target.value)} placeholder="60" required />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createProcedimento.isPending || updateProcedimento.isPending}>
                  {createProcedimento.isPending || updateProcedimento.isPending ? "Salvando..." : editando ? "Atualizar" : "Cadastrar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <CardTitle className="text-base">Filtros</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="filtro-nome">Buscar por nome</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="filtro-nome" value={filtroNome} onChange={e => setFiltroNome(e.target.value)} placeholder="Digite o nome..." className="pl-9" />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="filtro-categoria">Categoria</Label>
              <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                <SelectTrigger id="filtro-categoria">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {categorias.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="filtro-status">Status</Label>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger id="filtro-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="inativos">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="mt-4 text-sm text-muted-foreground">
            Exibindo {procedimentosFiltrados.length} de {procedimentos?.length || 0} procedimento(s)
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? <>
            {[1, 2, 3].map(i => <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>)}
          </> : procedimentosFiltrados && procedimentosFiltrados.length > 0 ? procedimentosFiltrados.map(proc => <Card key={proc.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{proc.nome}</CardTitle>
                  <Badge variant={proc.ativo ? "default" : "secondary"}>
                    {proc.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                {proc.categoria && <Badge variant="outline" className="w-fit">
                    {proc.categoria}
                  </Badge>}
              </CardHeader>
              <CardContent className="space-y-3">
                {proc.descricao && <p className="text-sm text-muted-foreground">{proc.descricao}</p>}
                <div className="flex gap-4 text-sm">
                  <span>
                    <strong>Valor:</strong> {proc.valor_medio ? `R$ ${proc.valor_medio.toFixed(2)}` : 'Não definido'}
                  </span>
                  <span>
                    <strong>Duração:</strong> {proc.tempo_atendimento_minutos || proc.duracao_minutos || 60}min
                  </span>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" onClick={() => handleEditar(proc)} className="flex-1">
                    <Pencil className="h-4 w-4 mr-1" />
                    Editar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setExcluindo(proc)} className="flex-1">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </div>
              </CardContent>
            </Card>) : <Card className="col-span-full">
            <CardContent className="py-8 text-center text-muted-foreground">
              {procedimentos && procedimentos.length > 0 ? "Nenhum procedimento encontrado com os filtros aplicados" : "Nenhum procedimento cadastrado"}
            </CardContent>
          </Card>}
      </div>

      <AlertDialog open={!!excluindo} onOpenChange={open => !open && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o procedimento <strong>{excluindo?.nome}</strong>? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}