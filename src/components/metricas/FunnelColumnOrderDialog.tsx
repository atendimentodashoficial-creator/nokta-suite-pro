import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { GripVertical, Save, RotateCcw } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { FunnelColumnKey } from "@/hooks/useMetricasPreferencias";

export const FUNNEL_COLUMNS: { key: FunnelColumnKey; label: string }[] = [
  { key: "name", label: "Nome (Campanha/Conjunto/Anúncio)" },
  { key: "spend", label: "Gasto" },
  { key: "leads", label: "Leads" },
  { key: "cpl", label: "CPL" },
  { key: "agendados", label: "Agendados" },
  { key: "cpa_agendado", label: "CPA Agend." },
  { key: "faltou", label: "Faltou" },
  { key: "em_negociacao", label: "Em Negoc." },
  { key: "conversoes", label: "Conversões" },
  { key: "cac", label: "CAC" },
  { key: "faturado", label: "Faturado" },
  { key: "roas", label: "ROAS" },
];

export const DEFAULT_FUNNEL_COLUMN_ORDER: FunnelColumnKey[] = [
  "name", "spend", "leads", "cpl", "agendados", "cpa_agendado", 
  "faltou", "em_negociacao", "conversoes", "cac", "faturado", "roas"
];

interface SortableItemProps {
  id: string;
  label: string;
}

function SortableItem({ id, label }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 p-3 bg-background border rounded-lg",
        isDragging && "opacity-50 shadow-lg z-50"
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

interface FunnelColumnOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentOrder: FunnelColumnKey[];
  onSave: (order: FunnelColumnKey[]) => Promise<void>;
}

export function FunnelColumnOrderDialog({
  open,
  onOpenChange,
  currentOrder,
  onSave,
}: FunnelColumnOrderDialogProps) {
  const [columnOrder, setColumnOrder] = useState<FunnelColumnKey[]>(currentOrder);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setColumnOrder(currentOrder);
  }, [currentOrder, open]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as FunnelColumnKey);
        const newIndex = items.indexOf(over.id as FunnelColumnKey);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(columnOrder);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setColumnOrder(DEFAULT_FUNNEL_COLUMN_ORDER);
  };

  const getColumnLabel = (key: FunnelColumnKey) => {
    return FUNNEL_COLUMNS.find(c => c.key === key)?.label || key;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ordenar Colunas</DialogTitle>
          <DialogDescription>
            Arraste e solte para reorganizar a ordem das colunas da tabela.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto space-y-2 py-2">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={columnOrder} strategy={verticalListSortingStrategy}>
              {columnOrder.map((key) => (
                <SortableItem
                  key={key}
                  id={key}
                  label={getColumnLabel(key)}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Restaurar Padrão
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}