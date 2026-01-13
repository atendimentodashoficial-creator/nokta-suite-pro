import { useState, useMemo } from "react";
import { Plus, Trash2, Users, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVinculos, useCreateVinculo, useDeleteVinculo, useUpdateVinculoOrdem } from "@/hooks/useProcedimentoProfissional";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
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

interface SortableProfissionalItemProps {
  vinculoId: string;
  profissionalNome: string;
  onDelete: (id: string) => void;
}

function SortableProfissionalItem({ vinculoId, profissionalNome, onDelete }: SortableProfissionalItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: vinculoId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 rounded-lg border bg-card"
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <span className="text-sm font-medium">{profissionalNome}</span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(vinculoId)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function VinculosProcedimentos() {
  const [procedimentoId, setProcedimentoId] = useState<string>("");
  const [profissionalId, setProfissionalId] = useState<string>("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: vinculos, isLoading } = useVinculos();
  const { data: procedimentos } = useProcedimentos(true);
  const { data: profissionais } = useProfissionais(true);
  const createVinculo = useCreateVinculo();
  const deleteVinculo = useDeleteVinculo();
  const updateOrdem = useUpdateVinculoOrdem();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Group vinculos by procedimento
  const vinculosPorProcedimento = useMemo(() => {
    if (!vinculos || !procedimentos) return [];
    
    return procedimentos.map((proc) => {
      const profissionaisVinculados = vinculos
        .filter((v: any) => v.procedimento_id === proc.id)
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((v: any) => ({
          vinculoId: v.id,
          profissional: v.profissionais,
          ordem: v.ordem ?? 0,
        }));
      
      return {
        procedimento: proc,
        profissionais: profissionaisVinculados,
      };
    }).filter((item) => item.profissionais.length > 0 || procedimentos.length > 0);
  }, [vinculos, procedimentos]);

  // Procedimentos that have at least one vinculo
  const procedimentosComVinculos = useMemo(() => {
    return vinculosPorProcedimento.filter((item) => item.profissionais.length > 0);
  }, [vinculosPorProcedimento]);

  const handleCreate = () => {
    if (!procedimentoId || !profissionalId) return;

    // Verificar se já existe esse vínculo
    const vinculoExiste = vinculos?.some(
      (v: any) => v.procedimento_id === procedimentoId && v.profissional_id === profissionalId
    );

    if (vinculoExiste) {
      return;
    }

    // Get max ordem for this procedimento
    const vinculosDoProc = vinculos?.filter((v: any) => v.procedimento_id === procedimentoId) || [];
    const maxOrdem = vinculosDoProc.reduce((max: number, v: any) => Math.max(max, v.ordem ?? 0), 0);

    createVinculo.mutate(
      { procedimento_id: procedimentoId, profissional_id: profissionalId, ordem: maxOrdem + 1 },
      {
        onSuccess: () => {
          setProcedimentoId("");
          setProfissionalId("");
        },
      }
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteVinculo.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };

  const handleDragEnd = (procedimentoItemId: string) => (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const item = procedimentosComVinculos.find((i) => i.procedimento.id === procedimentoItemId);
      if (!item) return;

      const oldIndex = item.profissionais.findIndex((p) => p.vinculoId === active.id);
      const newIndex = item.profissionais.findIndex((p) => p.vinculoId === over.id);

      const reordered = arrayMove(item.profissionais, oldIndex, newIndex);

      // Update ordem for all items
      reordered.forEach((prof, index) => {
        updateOrdem.mutate({ id: prof.vinculoId, ordem: index });
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Vincular Profissional a Procedimento</CardTitle>
          <CardDescription>
            Defina quais procedimentos cada profissional pode realizar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select value={procedimentoId} onValueChange={setProcedimentoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o procedimento" />
                </SelectTrigger>
                <SelectContent>
                  {procedimentos?.map((proc) => (
                    <SelectItem key={proc.id} value={proc.id}>
                      {proc.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Select value={profissionalId} onValueChange={setProfissionalId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o profissional" />
                </SelectTrigger>
                <SelectContent>
                  {profissionais?.map((prof) => (
                    <SelectItem key={prof.id} value={prof.id}>
                      {prof.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleCreate}
              disabled={!procedimentoId || !profissionalId || createVinculo.isPending}
              className="sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Vínculos por Procedimento</CardTitle>
          <CardDescription>
            {vinculos?.length || 0} vínculo(s) cadastrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : procedimentosComVinculos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum vínculo cadastrado ainda
            </div>
          ) : (
            <div className="space-y-4">
              {procedimentosComVinculos.map((item) => (
                <div key={item.procedimento.id} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-base">{item.procedimento.nome}</h3>
                    <Badge variant="secondary" className="text-xs">
                      <Users className="w-3 h-3 mr-1" />
                      {item.profissionais.length}
                    </Badge>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd(item.procedimento.id)}
                  >
                    <SortableContext
                      items={item.profissionais.map((p) => p.vinculoId)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {item.profissionais.map((prof) => (
                          <SortableProfissionalItem
                            key={prof.vinculoId}
                            vinculoId={prof.vinculoId}
                            profissionalNome={prof.profissional?.nome || ""}
                            onDelete={setDeleteId}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover vínculo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este vínculo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}