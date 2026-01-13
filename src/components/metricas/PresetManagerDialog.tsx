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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GripVertical, Plus, Trash2, Save, X } from "lucide-react";

export type ColumnKey = "status" | "impressions" | "clicks" | "ctr" | "cpc" | "cpm" | "reach" | "results" | "cost_per_result" | "spend" | "daily_budget";

export interface ColumnConfig {
  key: ColumnKey;
  label: string;
  align: "left" | "right";
}

export interface Preset {
  id: string;
  name: string;
  columns: ColumnKey[];
}

export const ALL_COLUMNS: ColumnConfig[] = [
  { key: "status", label: "Status", align: "left" },
  { key: "daily_budget", label: "Orçamento", align: "right" },
  { key: "impressions", label: "Impressões", align: "right" },
  { key: "clicks", label: "Cliques", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "cpc", label: "CPC", align: "right" },
  { key: "cpm", label: "CPM", align: "right" },
  { key: "reach", label: "Alcance", align: "right" },
  { key: "results", label: "Conversas", align: "right" },
  { key: "cost_per_result", label: "Custo/Conversa", align: "right" },
  { key: "spend", label: "Gasto", align: "right" },
];

const DEFAULT_PRESETS: Preset[] = [
  {
    id: "default",
    name: "Padrão",
    columns: ["status", "impressions", "clicks", "ctr", "spend"],
  },
  {
    id: "complete",
    name: "Completo",
    columns: ["status", "impressions", "clicks", "ctr", "cpc", "cpm", "reach", "results", "cost_per_result", "spend"],
  },
];

interface PresetManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: Preset[];
  onPresetsChange: (presets: Preset[]) => void;
  onApplyPreset: (columns: ColumnKey[]) => void;
}

export function PresetManagerDialog({
  open,
  onOpenChange,
  presets,
  onPresetsChange,
  onApplyPreset,
}: PresetManagerDialogProps) {
  const [editingPreset, setEditingPreset] = useState<Preset | null>(null);
  const [presetName, setPresetName] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<ColumnKey[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setEditingPreset(null);
      setIsCreating(false);
      setPresetName("");
      setSelectedColumns([]);
    }
  }, [open]);

  const handleStartCreate = () => {
    setIsCreating(true);
    setEditingPreset(null);
    setPresetName("");
    setSelectedColumns(["status", "impressions", "clicks", "ctr", "spend"]);
  };

  const handleStartEdit = (preset: Preset) => {
    setEditingPreset(preset);
    setIsCreating(false);
    setPresetName(preset.name);
    setSelectedColumns([...preset.columns]);
  };

  const handleToggleColumn = (column: ColumnKey) => {
    if (selectedColumns.includes(column)) {
      setSelectedColumns(selectedColumns.filter((c) => c !== column));
    } else {
      setSelectedColumns([...selectedColumns, column]);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newColumns = [...selectedColumns];
    const draggedColumn = newColumns[draggedIndex];
    newColumns.splice(draggedIndex, 1);
    newColumns.splice(index, 0, draggedColumn);
    setSelectedColumns(newColumns);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const handleSave = () => {
    if (!presetName.trim() || selectedColumns.length === 0) return;

    if (isCreating) {
      const newPreset: Preset = {
        id: `custom_${Date.now()}`,
        name: presetName.trim(),
        columns: selectedColumns,
      };
      onPresetsChange([...presets, newPreset]);
    } else if (editingPreset) {
      const updatedPresets = presets.map((p) =>
        p.id === editingPreset.id
          ? { ...p, name: presetName.trim(), columns: selectedColumns }
          : p
      );
      onPresetsChange(updatedPresets);
    }

    setEditingPreset(null);
    setIsCreating(false);
    setPresetName("");
    setSelectedColumns([]);
  };

  const handleDelete = (presetId: string) => {
    onPresetsChange(presets.filter((p) => p.id !== presetId));
    if (editingPreset?.id === presetId) {
      setEditingPreset(null);
      setPresetName("");
      setSelectedColumns([]);
    }
  };

  const handleApply = (preset: Preset) => {
    onApplyPreset(preset.columns);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setEditingPreset(null);
    setIsCreating(false);
    setPresetName("");
    setSelectedColumns([]);
  };

  const isEditing = isCreating || editingPreset !== null;
  const allPresets = [...DEFAULT_PRESETS, ...presets];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEditing
              ? isCreating
                ? "Criar Preset"
                : "Editar Preset"
              : "Gerenciar Presets"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Configure as colunas e a ordem de exibição"
              : "Selecione, crie ou edite presets de colunas"}
          </DialogDescription>
        </DialogHeader>

        {isEditing ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Nome do preset</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Ex: Métricas de Performance"
              />
            </div>

            <div className="space-y-2">
              <Label>Colunas disponíveis</Label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_COLUMNS.map((column) => (
                  <div
                    key={column.key}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`col-${column.key}`}
                      checked={selectedColumns.includes(column.key)}
                      onCheckedChange={() => handleToggleColumn(column.key)}
                    />
                    <label
                      htmlFor={`col-${column.key}`}
                      className="text-sm cursor-pointer"
                    >
                      {column.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ordem das colunas (arraste para reordenar)</Label>
              <ScrollArea className="h-[200px] border rounded-md p-2">
                <div className="space-y-1">
                  {selectedColumns.map((columnKey, index) => {
                    const column = ALL_COLUMNS.find((c) => c.key === columnKey);
                    if (!column) return null;

                    return (
                      <div
                        key={columnKey}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-2 p-2 rounded-md bg-muted/50 border cursor-move transition-colors ${
                          draggedIndex === index ? "bg-primary/10 border-primary" : "hover:bg-muted"
                        }`}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1">{column.label}</span>
                        <span className="text-xs text-muted-foreground">
                          #{index + 1}
                        </span>
                      </div>
                    );
                  })}
                  {selectedColumns.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Selecione pelo menos uma coluna
                    </p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleCancel}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={!presetName.trim() || selectedColumns.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {allPresets.map((preset) => {
                  const isDefault = DEFAULT_PRESETS.some(
                    (p) => p.id === preset.id
                  );

                  return (
                    <div
                      key={preset.id}
                      className="flex items-center gap-2 p-3 rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{preset.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {preset.columns.length} colunas:{" "}
                          {preset.columns
                            .slice(0, 3)
                            .map(
                              (c) =>
                                ALL_COLUMNS.find((col) => col.key === c)?.label
                            )
                            .join(", ")}
                          {preset.columns.length > 3 && "..."}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApply(preset)}
                        >
                          Aplicar
                        </Button>
                        {!isDefault && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleStartEdit(preset)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(preset.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button onClick={handleStartCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Novo Preset
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
