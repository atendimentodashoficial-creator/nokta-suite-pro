import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Pencil, Copy, Trash2, Eye, Link2, MoreHorizontal, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useFormulariosTemplates, useUpdateTemplate, useDeleteTemplate, useCreateTemplate, FormularioTemplate, FormularioEtapa } from "@/hooks/useFormularios";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import TemplateDialog from "./TemplateDialog";
import EtapasManager from "./EtapasManager";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function FormulariosTemplates() {
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FormularioTemplate | null>(null);
  const [managingEtapas, setManagingEtapas] = useState<(FormularioTemplate & { formularios_etapas: FormularioEtapa[] }) | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  
  const { data: templates, isLoading } = useFormulariosTemplates();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const createTemplate = useCreateTemplate();

  const handleToggleStatus = (template: FormularioTemplate) => {
    updateTemplate.mutate({
      id: template.id,
      status: template.status === "ativo" ? "inativo" : "ativo",
    });
  };

  const handleDuplicate = async (template: FormularioTemplate & { formularios_etapas: FormularioEtapa[] }) => {
    try {
      const { id, created_at, updated_at, formularios_etapas, ...data } = template;
      await createTemplate.mutateAsync({
        ...data,
        nome: `${data.nome} (Cópia)`,
      });
      toast.success("Template duplicado com sucesso!");
    } catch {
      // Error handled by mutation
    }
  };

  const handleCopyLink = (template: FormularioTemplate) => {
    const slug = template.slug || template.id;
    const url = `${window.location.origin}/formulario/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado para a área de transferência!");
  };

  const handleDelete = () => {
    if (templateToDelete) {
      deleteTemplate.mutate(templateToDelete);
      setTemplateToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const handlePreview = (template: FormularioTemplate) => {
    const slug = template.slug || template.id;
    window.open(`/formulario/${slug}?preview=true`, "_blank");
  };

  if (managingEtapas) {
    return (
      <EtapasManager 
        template={managingEtapas} 
        onBack={() => setManagingEtapas(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-start">
        <Button onClick={() => { setEditingTemplate(null); setTemplateDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-[200px]" />
          ))}
        </div>
      ) : templates?.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum template criado</h3>
            <p className="text-muted-foreground mb-4">
              Crie seu primeiro template de formulário para começar a capturar leads.
            </p>
            <Button onClick={() => setTemplateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates?.map((template) => (
            <Card key={template.id} className="relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{template.nome}</CardTitle>
                    {template.descricao && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {template.descricao}
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
                      <DropdownMenuItem onClick={() => handlePreview(template)}>
                        <Eye className="h-4 w-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleCopyLink(template)}>
                        <Link2 className="h-4 w-4 mr-2" />
                        Copiar Link
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditingTemplate(template); setTemplateDialogOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(template)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => { setTemplateToDelete(template.id); setDeleteDialogOpen(true); }}
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
                    {template.formularios_etapas?.length || 0} etapa(s)
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={template.status === "ativo" 
                      ? "bg-green-500/10 text-green-500 border-green-500/20" 
                      : "bg-muted text-muted-foreground"
                    }
                  >
                    {template.status === "ativo" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  Criado em {format(new Date(template.created_at), "dd/MM/yyyy", { locale: ptBR })}
                </p>

                <div className="flex items-center justify-between pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManagingEtapas(template)}
                  >
                    Gerenciar Etapas
                  </Button>
                  <Switch
                    checked={template.status === "ativo"}
                    onCheckedChange={() => handleToggleStatus(template)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editingTemplate}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Template</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este template? Esta ação excluirá também todas as etapas, leads e sessões associadas. Esta ação não pode ser desfeita.
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
