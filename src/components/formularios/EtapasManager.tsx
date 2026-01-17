import { useState } from "react";
import { ArrowLeft, Plus, Pencil, Trash2, GripVertical, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FormularioTemplate, FormularioEtapa, useUpdateEtapa, useDeleteEtapa, useReorderEtapas } from "@/hooks/useFormularios";
import EtapaDialog from "./EtapaDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface EtapasManagerProps {
  template: FormularioTemplate & { formularios_etapas: FormularioEtapa[] };
  onBack: () => void;
}

const tipoLabels: Record<string, string> = {
  texto: "Texto",
  email: "E-mail",
  telefone: "Telefone",
  opcoes: "Opções",
  multiplos_campos: "Múltiplos Campos",
  textarea: "Texto Longo",
  numero: "Número",
};

function SortableEtapa({ 
  etapa, 
  onEdit, 
  onDelete, 
  onToggle 
}: { 
  etapa: FormularioEtapa; 
  onEdit: () => void; 
  onDelete: () => void; 
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: etapa.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 p-4 bg-card border rounded-lg ${!etapa.ativo ? "opacity-60" : ""}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium">
        {etapa.ordem}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium truncate">{etapa.titulo}</p>
          {etapa.obrigatorio && (
            <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs">
              Obrigatório
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="secondary" className="text-xs">
            {tipoLabels[etapa.tipo] || etapa.tipo}
          </Badge>
          {etapa.descricao && (
            <span className="text-xs text-muted-foreground truncate">{etapa.descricao}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onEdit}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
        <Switch
          checked={etapa.ativo}
          onCheckedChange={onToggle}
          aria-label={etapa.ativo ? "Desativar" : "Ativar"}
        />
      </div>
    </div>
  );
}

export default function EtapasManager({ template, onBack }: EtapasManagerProps) {
  const [etapaDialogOpen, setEtapaDialogOpen] = useState(false);
  const [editingEtapa, setEditingEtapa] = useState<FormularioEtapa | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [etapaToDelete, setEtapaToDelete] = useState<string | null>(null);
  
  const updateEtapa = useUpdateEtapa();
  const deleteEtapa = useDeleteEtapa();
  const reorderEtapas = useReorderEtapas();

  const etapas = [...(template.formularios_etapas || [])].sort((a, b) => a.ordem - b.ordem);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = etapas.findIndex((e) => e.id === active.id);
      const newIndex = etapas.findIndex((e) => e.id === over.id);

      const newEtapas = arrayMove(etapas, oldIndex, newIndex);
      const updates = newEtapas.map((etapa, index) => ({
        id: etapa.id,
        ordem: index + 1,
      }));

      reorderEtapas.mutate(updates);
    }
  };

  const handleToggleAtivo = (etapa: FormularioEtapa) => {
    updateEtapa.mutate({ id: etapa.id, ativo: !etapa.ativo });
  };

  const handleDelete = () => {
    if (etapaToDelete) {
      deleteEtapa.mutate(etapaToDelete);
      setEtapaToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold">{template.nome}</h2>
          <p className="text-sm text-muted-foreground">Gerenciar etapas do formulário</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {etapas.length} etapa(s) • Arraste para reordenar
        </p>
        <Button onClick={() => { setEditingEtapa(null); setEtapaDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Etapa
        </Button>
      </div>

      {etapas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              Nenhuma etapa criada. Adicione etapas para construir seu formulário.
            </p>
            <Button onClick={() => setEtapaDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Primeira Etapa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={etapas.map(e => e.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-3">
              {etapas.map((etapa) => (
                <SortableEtapa
                  key={etapa.id}
                  etapa={etapa}
                  onEdit={() => { setEditingEtapa(etapa); setEtapaDialogOpen(true); }}
                  onDelete={() => { setEtapaToDelete(etapa.id); setDeleteDialogOpen(true); }}
                  onToggle={() => handleToggleAtivo(etapa)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <EtapaDialog
        open={etapaDialogOpen}
        onOpenChange={setEtapaDialogOpen}
        templateId={template.id}
        etapa={editingEtapa}
        nextOrdem={etapas.length + 1}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Etapa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta etapa? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
