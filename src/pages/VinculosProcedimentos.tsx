import { useMemo } from "react";
import { Users, GripVertical } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useVinculos, useCreateVinculo, useDeleteVinculo, useUpdateVinculoOrdem } from "@/hooks/useProcedimentoProfissional";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
interface SortableProfissionalItemProps {
  id: string;
  profissionalId: string;
  profissionalNome: string;
  vinculoId: string | null;
  isActive: boolean;
  onToggle: (profissionalId: string, isActive: boolean, vinculoId: string | null) => void;
  isPending: boolean;
}
function SortableProfissionalItem({
  id,
  profissionalId,
  profissionalNome,
  vinculoId,
  isActive,
  onToggle,
  isPending
}: SortableProfissionalItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id,
    disabled: !isActive
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center justify-between gap-2 p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {isActive && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded flex-shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
        {!isActive && <div className="w-6 flex-shrink-0" />}
        <span className={`text-sm font-medium truncate ${!isActive ? 'text-muted-foreground' : ''}`}>
          {profissionalNome}
        </span>
      </div>
      <Switch checked={isActive} onCheckedChange={checked => onToggle(profissionalId, checked, vinculoId)} disabled={isPending} className="flex-shrink-0" />
    </div>
  );
}
export default function VinculosProcedimentos() {
  const {
    data: vinculos,
    isLoading
  } = useVinculos();
  const {
    data: procedimentos
  } = useProcedimentos(true);
  const {
    data: profissionais
  } = useProfissionais(true);
  const createVinculo = useCreateVinculo();
  const deleteVinculo = useDeleteVinculo();
  const updateOrdem = useUpdateVinculoOrdem();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates
  }));

  // Build data structure: for each procedure, list all professionals with their vinculo status
  const procedimentosComProfissionais = useMemo(() => {
    if (!procedimentos || !profissionais) return [];
    return procedimentos.map(proc => {
      // Get all vinculos for this procedure
      const vinculosDoProc = vinculos?.filter((v: any) => v.procedimento_id === proc.id) || [];

      // Map all professionals, marking which ones are linked
      const profissionaisComStatus = profissionais.map(prof => {
        const vinculo = vinculosDoProc.find((v: any) => v.profissional_id === prof.id);
        return {
          profissionalId: prof.id,
          profissionalNome: prof.nome,
          vinculoId: vinculo?.id || null,
          isActive: !!vinculo,
          ordem: vinculo?.ordem ?? 999
        };
      });

      // Sort: active ones first by ordem, then inactive ones alphabetically
      profissionaisComStatus.sort((a, b) => {
        if (a.isActive && !b.isActive) return -1;
        if (!a.isActive && b.isActive) return 1;
        if (a.isActive && b.isActive) return a.ordem - b.ordem;
        return a.profissionalNome.localeCompare(b.profissionalNome);
      });
      const activeCount = profissionaisComStatus.filter(p => p.isActive).length;
      return {
        procedimento: proc,
        profissionais: profissionaisComStatus,
        activeCount
      };
    });
  }, [vinculos, procedimentos, profissionais]);
  const handleToggle = (procedimentoId: string) => (profissionalId: string, isActive: boolean, vinculoId: string | null) => {
    if (isActive) {
      // Create new vinculo
      const vinculosDoProc = vinculos?.filter((v: any) => v.procedimento_id === procedimentoId) || [];
      const maxOrdem = vinculosDoProc.reduce((max: number, v: any) => Math.max(max, v.ordem ?? 0), 0);
      createVinculo.mutate({
        procedimento_id: procedimentoId,
        profissional_id: profissionalId,
        ordem: maxOrdem + 1
      });
    } else if (vinculoId) {
      // Delete existing vinculo
      deleteVinculo.mutate(vinculoId);
    }
  };
  const handleDragEnd = (procedimentoId: string, profissionaisAtivos: typeof procedimentosComProfissionais[0]['profissionais']) => (event: DragEndEvent) => {
    const {
      active,
      over
    } = event;
    if (over && active.id !== over.id) {
      const activeProfissionais = profissionaisAtivos.filter(p => p.isActive);
      const oldIndex = activeProfissionais.findIndex(p => p.profissionalId === active.id);
      const newIndex = activeProfissionais.findIndex(p => p.profissionalId === over.id);
      const reordered = arrayMove(activeProfissionais, oldIndex, newIndex);

      // Update ordem for all active items
      reordered.forEach((prof, index) => {
        if (prof.vinculoId) {
          updateOrdem.mutate({
            id: prof.vinculoId,
            ordem: index
          });
        }
      });
    }
  };
  const totalVinculos = vinculos?.length || 0;
  return <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Vínculos por Procedimento</CardTitle>
          
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : procedimentosComProfissionais.length === 0 ? <div className="text-center py-8 text-muted-foreground">
              Cadastre procedimentos e profissionais primeiro
            </div> : <div className="space-y-4">
              {procedimentosComProfissionais.map(item => {
            const activeProfissionais = item.profissionais.filter(p => p.isActive);
            return <div key={item.procedimento.id} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="font-semibold text-base">{item.procedimento.nome}</h3>
                      <Badge variant="secondary" className="text-xs">
                        <Users className="w-3 h-3 mr-1" />
                        {item.activeCount}
                      </Badge>
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd(item.procedimento.id, item.profissionais)}>
                      <SortableContext items={activeProfissionais.map(p => p.profissionalId)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                          {item.profissionais.map(prof => <SortableProfissionalItem key={prof.profissionalId} id={prof.profissionalId} profissionalId={prof.profissionalId} profissionalNome={prof.profissionalNome} vinculoId={prof.vinculoId} isActive={prof.isActive} onToggle={handleToggle(item.procedimento.id)} isPending={createVinculo.isPending || deleteVinculo.isPending} />)}
                        </div>
                      </SortableContext>
                    </DndContext>
                  </div>;
          })}
            </div>}
        </CardContent>
      </Card>
    </div>;
}