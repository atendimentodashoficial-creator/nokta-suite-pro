import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical, Pencil, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";

interface TemplateCampo {
  id: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
}

export function TemplateCamposDialog() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingCampo, setEditingCampo] = useState<TemplateCampo | null>(null);
  const [newCampo, setNewCampo] = useState({ nome: "", descricao: "" });

  const { data: campos, isLoading } = useQuery({
    queryKey: ["reuniao-template-campos", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reuniao_template_campos" as any)
        .select("*")
        .order("ordem", { ascending: true });
      
      if (error) throw error;
      return (data || []) as unknown as TemplateCampo[];
    },
    enabled: !!user?.id && open,
  });

  const createMutation = useMutation({
    mutationFn: async (campo: { nome: string; descricao: string }) => {
      const maxOrdem = campos?.reduce((max, c) => Math.max(max, c.ordem), 0) || 0;
      
      const { error } = await supabase
        .from("reuniao_template_campos" as any)
        .insert({
          user_id: user?.id,
          nome: campo.nome,
          descricao: campo.descricao || null,
          ordem: maxOrdem + 1,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reuniao-template-campos"] });
      setNewCampo({ nome: "", descricao: "" });
      toast.success("Campo adicionado");
    },
    onError: () => {
      toast.error("Erro ao adicionar campo");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (campo: TemplateCampo) => {
      const { error } = await supabase
        .from("reuniao_template_campos" as any)
        .update({
          nome: campo.nome,
          descricao: campo.descricao,
          ativo: campo.ativo,
        })
        .eq("id", campo.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reuniao-template-campos"] });
      setEditingCampo(null);
      toast.success("Campo atualizado");
    },
    onError: () => {
      toast.error("Erro ao atualizar campo");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("reuniao_template_campos" as any)
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reuniao-template-campos"] });
      toast.success("Campo removido");
    },
    onError: () => {
      toast.error("Erro ao remover campo");
    },
  });

  const handleCreate = () => {
    if (!newCampo.nome.trim()) {
      toast.error("Nome do campo é obrigatório");
      return;
    }
    createMutation.mutate(newCampo);
  };

  const handleUpdate = () => {
    if (!editingCampo) return;
    updateMutation.mutate(editingCampo);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Settings2 className="w-4 h-4" />
          Configurar Template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Template de Resumo</DialogTitle>
          <DialogDescription>
            Configure os campos que a IA deve preencher ao processar as reuniões.
            Alterações no template só afetam reuniões futuras.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Add new campo */}
          <Card>
            <CardContent className="pt-4 space-y-4">
              <h4 className="font-medium text-sm">Adicionar Novo Campo</h4>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="nome">Nome do Campo</Label>
                  <Input
                    id="nome"
                    placeholder="Ex: Decisões Tomadas"
                    value={newCampo.nome}
                    onChange={(e) => setNewCampo({ ...newCampo, nome: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="descricao">Descrição (instrução para a IA)</Label>
                  <Textarea
                    id="descricao"
                    placeholder="Ex: Liste as principais decisões acordadas durante a reunião"
                    value={newCampo.descricao}
                    onChange={(e) => setNewCampo({ ...newCampo, descricao: e.target.value })}
                    rows={2}
                  />
                </div>
                <Button 
                  onClick={handleCreate} 
                  disabled={createMutation.isPending}
                  className="w-full gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Adicionar Campo
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* List of campos */}
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Campos do Template</h4>
            
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : campos && campos.length > 0 ? (
              <div className="space-y-2">
                {campos.map((campo) => (
                  <Card key={campo.id} className={!campo.ativo ? "opacity-50" : ""}>
                    <CardContent className="py-3">
                      {editingCampo?.id === campo.id ? (
                        <div className="space-y-3">
                          <Input
                            value={editingCampo.nome}
                            onChange={(e) => setEditingCampo({ ...editingCampo, nome: e.target.value })}
                            placeholder="Nome do campo"
                          />
                          <Textarea
                            value={editingCampo.descricao || ""}
                            onChange={(e) => setEditingCampo({ ...editingCampo, descricao: e.target.value })}
                            placeholder="Descrição"
                            rows={2}
                          />
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={editingCampo.ativo}
                                onCheckedChange={(checked) => setEditingCampo({ ...editingCampo, ativo: checked })}
                              />
                              <Label className="text-sm">Ativo</Label>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="ghost" onClick={() => setEditingCampo(null)}>
                                Cancelar
                              </Button>
                              <Button size="sm" onClick={handleUpdate} disabled={updateMutation.isPending}>
                                Salvar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <GripVertical className="w-4 h-4 text-muted-foreground mt-1 cursor-grab" />
                            <div className="flex-1">
                              <p className="font-medium text-sm">{campo.nome}</p>
                              {campo.descricao && (
                                <p className="text-xs text-muted-foreground mt-1">{campo.descricao}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingCampo(campo)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => deleteMutation.mutate(campo.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhum campo configurado. Adicione campos acima para customizar o resumo das reuniões.
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
