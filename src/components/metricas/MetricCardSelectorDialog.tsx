import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Save } from "lucide-react";
import { 
  Eye, 
  MousePointerClick, 
  Target, 
  DollarSign, 
  Users,
  TrendingUp,
  BarChart3,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

export type MetricCardKey = "impressions" | "clicks" | "results" | "cost_per_result" | "spend" | "reach" | "ctr" | "cpc" | "cpm" | "active_budget";

export interface MetricCardConfig {
  key: MetricCardKey;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
  format: "number" | "currency" | "percentage";
  highlight?: boolean;
}

export const ALL_METRIC_CARDS: MetricCardConfig[] = [
  { key: "impressions", label: "Impressões", icon: Eye, format: "number" },
  { key: "clicks", label: "Cliques", icon: MousePointerClick, format: "number" },
  { key: "results", label: "Conversas", icon: Target, format: "number" },
  { key: "cost_per_result", label: "Custo / Conversa", icon: Target, format: "currency" },
  { key: "spend", label: "Gasto Total", icon: DollarSign, format: "currency", highlight: true },
  { key: "active_budget", label: "Orçamento Ativo", subtitle: "CBO + ABO Ativos", icon: Wallet, format: "currency" },
  { key: "reach", label: "Alcance", icon: Users, format: "number" },
  { key: "ctr", label: "CTR", icon: TrendingUp, format: "percentage" },
  { key: "cpc", label: "CPC", icon: DollarSign, format: "currency" },
  { key: "cpm", label: "CPM", icon: BarChart3, format: "currency" },
];

export const DEFAULT_VISIBLE_CARDS: MetricCardKey[] = ["impressions", "clicks", "results", "cost_per_result", "spend"];

interface SortableMetricItemProps {
  id: MetricCardKey;
  index: number;
}

function SortableMetricItem({ id, index }: SortableMetricItemProps) {
  const card = ALL_METRIC_CARDS.find((c) => c.key === id);
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

  if (!card) return null;
  const IconComponent = card.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 rounded-md bg-muted/50 border transition-colors",
        isDragging && "opacity-50 shadow-lg z-50 bg-primary/10 border-primary"
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
      <IconComponent className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm flex-1">{card.label}</span>
      <span className="text-xs text-muted-foreground">
        #{index + 1}
      </span>
    </div>
  );
}

interface MetricCardSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleCards: MetricCardKey[];
  onVisibleCardsChange: (cards: MetricCardKey[]) => void;
}

export function MetricCardSelectorDialog({
  open,
  onOpenChange,
  visibleCards,
  onVisibleCardsChange,
}: MetricCardSelectorDialogProps) {
  const [selectedCards, setSelectedCards] = useState<MetricCardKey[]>(visibleCards);

  useEffect(() => {
    if (open) {
      setSelectedCards(visibleCards);
    }
  }, [open, visibleCards]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleToggleCard = (cardKey: MetricCardKey) => {
    if (selectedCards.includes(cardKey)) {
      if (selectedCards.length > 1) {
        setSelectedCards(selectedCards.filter((c) => c !== cardKey));
      }
    } else {
      setSelectedCards([...selectedCards, cardKey]);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSelectedCards((items) => {
        const oldIndex = items.indexOf(active.id as MetricCardKey);
        const newIndex = items.indexOf(over.id as MetricCardKey);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleSave = () => {
    onVisibleCardsChange(selectedCards);
    onOpenChange(false);
  };

  const handleReset = () => {
    setSelectedCards(DEFAULT_VISIBLE_CARDS);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Personalizar Métricas</DialogTitle>
          <DialogDescription>
            Selecione e ordene os cards de métricas que deseja exibir
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Métricas disponíveis</p>
            <div className="grid grid-cols-2 gap-2">
              {ALL_METRIC_CARDS.map((card) => {
                const IconComponent = card.icon;
                return (
                  <div
                    key={card.key}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`card-${card.key}`}
                      checked={selectedCards.includes(card.key)}
                      onCheckedChange={() => handleToggleCard(card.key)}
                    />
                    <IconComponent className="h-4 w-4 text-muted-foreground" />
                    <label
                      htmlFor={`card-${card.key}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {card.label}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Ordem de exibição (arraste para reordenar)</p>
            <ScrollArea className="h-[180px] border rounded-md p-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={selectedCards} strategy={verticalListSortingStrategy}>
                  <div className="space-y-1">
                    {selectedCards.map((cardKey, index) => (
                      <SortableMetricItem
                        key={cardKey}
                        id={cardKey}
                        index={index}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleReset}>
            Restaurar Padrão
          </Button>
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
