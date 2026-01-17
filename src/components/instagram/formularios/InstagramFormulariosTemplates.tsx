import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Pencil, Copy, Trash2, MoreHorizontal, FileText, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import InstagramFormularioDialog from "./InstagramFormularioDialog";

interface Formulario {
  id: string;
  nome: string;
  titulo_pagina: string;
  subtitulo_pagina: string | null;
  texto_botao: string;
  mensagem_sucesso: string;
  campos: any[];
  cor_primaria: string;
  imagem_url: string | null;
  botao_sucesso_texto: string | null;
  botao_sucesso_url: string | null;
  ativo: boolean;
  created_at: string;
}

export default function InstagramFormulariosTemplates() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormulario, setEditingFormulario] = useState<Formulario | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formularioToDelete, setFormularioToDelete] = useState<string | null>(null);
  
  const queryClient = useQueryClient();

  const { data: formularios, isLoading } = useQuery({
    queryKey: ["instagram-formularios"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      const { data, error } = await supabase
        .from("instagram_formularios")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return (data || []).map(f => ({
        ...f,
        campos: Array.isArray(f.campos) ? f.campos : JSON.parse(f.campos as string)
      })) as Formulario[];
    },
  });

  const toggleFormulario = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("instagram_formularios")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
    },
  });

  const deleteFormulario = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("instagram_formularios")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
      toast.success("Formulário excluído");
    },
  });

  const handleCopyLink = (formulario: Formulario) => {
    const url = `${window.location.origin}/formulario/${formulario.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const handleDelete = () => {
    if (formularioToDelete) {
      deleteFormulario.mutate(formularioToDelete);
      setFormularioToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handleEdit = (formulario: Formulario) => {
    setEditingFormulario(formulario);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingFormulario(null);
    setDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-[200px]" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Formulários</h2>
        <Button onClick={handleNew}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Formulário
        </Button>
      </div>

      {formularios?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum formulário criado</h3>
            <p className="text-muted-foreground mb-4">
              Crie seu primeiro formulário para capturar leads via Instagram.
            </p>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Formulário
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formularios?.map((formulario) => (
            <Card key={formulario.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{formulario.nome}</CardTitle>
                    {formulario.titulo_pagina && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {formulario.titulo_pagina}
                      </p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleCopyLink(formulario)}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Copiar Link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleEdit(formulario)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => { setFormularioToDelete(formulario.id); setDeleteDialogOpen(true); }}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    {formulario.campos?.length || 0} campo(s)
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={formulario.ativo 
                      ? "bg-green-500/10 text-green-500 border-green-500/20" 
                      : "bg-muted text-muted-foreground"
                    }
                  >
                    {formulario.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  Criado em {format(new Date(formulario.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>

                <div className="flex items-center justify-between pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(formulario)}
                  >
                    Editar
                  </Button>
                  <Switch
                    checked={formulario.ativo}
                    onCheckedChange={(ativo) => toggleFormulario.mutate({ id: formulario.id, ativo })}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <InstagramFormularioDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        formulario={editingFormulario}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Formulário</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este formulário? Esta ação excluirá também todas as respostas associadas. Esta ação não pode ser desfeita.
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
