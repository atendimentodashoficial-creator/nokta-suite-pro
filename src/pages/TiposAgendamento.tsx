import { useState } from "react";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useTiposAgendamento, TipoAgendamento } from "@/hooks/useTiposAgendamento";
import { Skeleton } from "@/components/ui/skeleton";
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

interface SortableTipoItemProps {
  tipo: TipoAgendamento;
  onEdit: (tipo: TipoAgendamento) => void;
  onDelete: (id: string) => void;
  onToggleAtivo: (tipo: TipoAgendamento) => void;
}

function SortableTipoItem({ tipo, onEdit, onDelete, onToggleAtivo }: SortableTipoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tipo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${
        tipo.ativo === false ? "opacity-50 bg-muted/50" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        <span className="font-medium text-sm truncate">{tipo.nome}</span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(tipo)}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete(tipo.id)}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
        <Switch
          checked={tipo.ativo !== false}
          onCheckedChange={() => onToggleAtivo(tipo)}
        />
      </div>
    </div>
  );
}

export default function TiposAgendamento() {
  const { tipos, isLoading, createTipo, updateTipo, deleteTipo } = useTiposAgendamento();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoAgendamento | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nome: "" });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleOpenCreate = () => {
    setEditingTipo(null);
    setFormData({ nome: "" });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (tipo: TipoAgendamento) => {
    setEditingTipo(tipo);
    setFormData({ nome: tipo.nome });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) return;

    if (editingTipo) {
      await updateTipo.mutateAsync({
        id: editingTipo.id,
        nome: formData.nome,
      });
    } else {
      await createTipo.mutateAsync({
        nome: formData.nome,
      });
    }

    setIsDialogOpen(false);
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTipo.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleToggleAtivo = async (tipo: TipoAgendamento) => {
    await updateTipo.mutateAsync({
      id: tipo.id,
      ativo: !tipo.ativo,
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tipos.findIndex((t) => t.id === active.id);
      const newIndex = tipos.findIndex((t) => t.id === over.id);
      
      const newOrder = arrayMove(tipos, oldIndex, newIndex);
      
      // Update order in database for all affected items
      for (let i = 0; i < newOrder.length; i++) {
        if (newOrder[i].ordem !== i + 1) {
          await updateTipo.mutateAsync({
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
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Tipos de Agendamento</CardTitle>
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
          <CardTitle className="text-lg font-semibold">Tipos de Agendamento</CardTitle>
          <Button onClick={handleOpenCreate} size="sm" className="flex-shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Novo Tipo
          </Button>
        </CardHeader>
        <CardContent>
          {tipos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum tipo cadastrado.</p>
              <p className="text-sm mt-1">Crie tipos personalizados para seus agendamentos.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={tipos.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {tipos.map((tipo) => (
                    <SortableTipoItem
                      key={tipo.id}
                      tipo={tipo}
                      onEdit={handleOpenEdit}
                      onDelete={setDeleteId}
                      onToggleAtivo={handleToggleAtivo}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTipo ? "Editar Tipo" : "Novo Tipo de Agendamento"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                placeholder="Ex: Consulta, Retorno, Avaliação..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formData.nome.trim()}>
              {editingTipo ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O tipo será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}