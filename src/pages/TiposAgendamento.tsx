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

const defaultColors = ["#10b981"];

export default function TiposAgendamento() {
  const { tipos, isLoading, createTipo, updateTipo, deleteTipo } = useTiposAgendamento();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTipo, setEditingTipo] = useState<TipoAgendamento | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ nome: "" });

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

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tipos de Agendamento</CardTitle>
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Tipos de Agendamento</CardTitle>
          <Button onClick={handleOpenCreate} size="sm">
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
            <div className="space-y-2">
              {tipos.map((tipo) => (
                <div
                  key={tipo.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    tipo.ativo === false ? "opacity-50 bg-muted/50" : "bg-card"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                    <span className="font-medium">{tipo.nome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={tipo.ativo !== false}
                      onCheckedChange={() => handleToggleAtivo(tipo)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(tipo)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(tipo.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
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
