import { useState, useMemo } from "react";
import { useProcedimentos, useCreateProcedimento, useUpdateProcedimento, useDeleteProcedimento, Procedimento } from "@/hooks/useProcedimentos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, Clock } from "lucide-react";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableProcedimentoItemProps {
  procedimento: Procedimento;
  onEdit: (proc: Procedimento) => void;
  onDelete: (proc: Procedimento) => void;
  onToggleAtivo: (proc: Procedimento) => void;
}

function SortableProcedimentoItem({ procedimento, onEdit, onDelete, onToggleAtivo }: SortableProcedimentoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: procedimento.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative p-3 rounded-lg border ${
        !procedimento.ativo ? "opacity-50 bg-muted/50" : "bg-card"
      }`}
    >
      {/* Desktop layout */}
      <div className="hidden sm:flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{procedimento.nome}</span>
              {procedimento.categoria && (
                <Badge variant="outline" className="text-xs flex-shrink-0">{procedimento.categoria}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
              <span>R$ {procedimento.valor_medio ? procedimento.valor_medio.toFixed(2) : 'N/D'}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {procedimento.tempo_atendimento_minutos || procedimento.duracao_minutos || 60}min
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(procedimento)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(procedimento)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
          <Switch
            checked={procedimento.ativo}
            onCheckedChange={() => onToggleAtivo(procedimento)}
          />
        </div>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{procedimento.nome}</span>
              {procedimento.categoria && (
                <Badge variant="outline" className="text-xs flex-shrink-0">{procedimento.categoria}</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
              <span>R$ {procedimento.valor_medio ? procedimento.valor_medio.toFixed(2) : 'N/D'}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {procedimento.tempo_atendimento_minutos || procedimento.duracao_minutos || 60}min
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(procedimento)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(procedimento)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
          <Switch
            checked={procedimento.ativo}
            onCheckedChange={() => onToggleAtivo(procedimento)}
          />
        </div>
      </div>
    </div>
  );
}

export default function Procedimentos() {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState<Procedimento | null>(null);
  const [excluindo, setExcluindo] = useState<Procedimento | null>(null);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [valorMedio, setValorMedio] = useState("");
  const [duracaoMinutos, setDuracaoMinutos] = useState("60");

  const { data: procedimentos, isLoading } = useProcedimentos();
  const createProcedimento = useCreateProcedimento();
  const updateProcedimento = useUpdateProcedimento();
  const deleteProcedimento = useDeleteProcedimento();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort by ordem
  const sortedProcedimentos = useMemo(() => {
    if (!procedimentos) return [];
    return [...procedimentos].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }, [procedimentos]);

  const handleEditar = (proc: Procedimento) => {
    setEditando(proc);
    setNome(proc.nome);
    setCategoria(proc.categoria || "");
    setValorMedio(proc.valor_medio ? proc.valor_medio.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
    setDuracaoMinutos((proc.tempo_atendimento_minutos || proc.duracao_minutos || 60).toString());
    setOpen(true);
  };

  const limparFormulario = () => {
    setEditando(null);
    setNome("");
    setCategoria("");
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
      valor_medio: valorMedio ? parseCurrencyToNumber(valorMedio) : null,
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
      createProcedimento.mutate({
        ...dados,
        ordem: (procedimentos?.length || 0) + 1
      }, {
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

  const handleToggleAtivo = (proc: Procedimento) => {
    updateProcedimento.mutate({
      id: proc.id,
      ativo: !proc.ativo
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedProcedimentos.findIndex((p) => p.id === active.id);
      const newIndex = sortedProcedimentos.findIndex((p) => p.id === over.id);
      
      const newOrder = arrayMove(sortedProcedimentos, oldIndex, newIndex);
      
      // Update order in database for all affected items
      for (let i = 0; i < newOrder.length; i++) {
        if ((newOrder[i].ordem || 0) !== i + 1) {
          updateProcedimento.mutate({
            id: newOrder[i].id,
            ordem: i + 1,
          });
        }
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Procedimentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg font-semibold">Procedimentos</CardTitle>
          <Dialog open={open} onOpenChange={o => {
            setOpen(o);
            if (!o) limparFormulario();
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="flex-shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{editando ? "Editar Procedimento" : "Novo Procedimento"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome</Label>
                  <Input id="nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome do procedimento" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="categoria">Categoria</Label>
                  <Input id="categoria" value={categoria} onChange={e => setCategoria(e.target.value)} placeholder="Ex: Estética, Preventivo..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valor">Valor Médio</Label>
                    <CurrencyInput id="valor" value={valorMedio} onChange={setValorMedio} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="duracao">Duração (minutos)</Label>
                    <Input id="duracao" type="number" value={duracaoMinutos} onChange={e => setDuracaoMinutos(e.target.value)} placeholder="60" required />
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createProcedimento.isPending || updateProcedimento.isPending}>
                    {createProcedimento.isPending || updateProcedimento.isPending ? "Salvando..." : editando ? "Atualizar" : "Cadastrar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {sortedProcedimentos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum procedimento cadastrado.</p>
              <p className="text-sm mt-1">Adicione procedimentos para usar nos agendamentos.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortedProcedimentos.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sortedProcedimentos.map((proc) => (
                    <SortableProcedimentoItem
                      key={proc.id}
                      procedimento={proc}
                      onEdit={handleEditar}
                      onDelete={setExcluindo}
                      onToggleAtivo={handleToggleAtivo}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

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
    </>
  );
}