import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package } from "lucide-react";
import { useProdutos, useCreateProduto, useUpdateProduto, useDeleteProduto, Produto } from "@/hooks/useProdutos";
import { Badge } from "@/components/ui/badge";

const produtoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  descricao: z.string().max(500, "Descrição muito longa").optional(),
  valor: z.string().min(1, "Valor é obrigatório"),
  ativo: z.boolean().default(true),
});

type ProdutoFormData = z.infer<typeof produtoSchema>;

export default function Produtos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  
  const { data: produtos, isLoading } = useProdutos();
  const createProduto = useCreateProduto();
  const updateProduto = useUpdateProduto();
  const deleteProduto = useDeleteProduto();

  const form = useForm<ProdutoFormData>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      nome: "",
      descricao: "",
      valor: "",
      ativo: true,
    },
  });

  const openCreateDialog = () => {
    setEditingProduto(null);
    form.reset({
      nome: "",
      descricao: "",
      valor: "",
      ativo: true,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (produto: Produto) => {
    setEditingProduto(produto);
    form.reset({
      nome: produto.nome,
      descricao: produto.descricao || "",
      valor: produto.valor.toString().replace('.', ','),
      ativo: produto.ativo,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProdutoFormData) => {
    try {
      const valorNumerico = parseFloat(data.valor.replace(/[^\d,.-]/g, '').replace(',', '.'));

      if (editingProduto) {
        await updateProduto.mutateAsync({
          id: editingProduto.id,
          nome: data.nome,
          descricao: data.descricao || null,
          valor: valorNumerico,
          ativo: data.ativo,
        });
        toast.success("Produto atualizado com sucesso!");
      } else {
        await createProduto.mutateAsync({
          nome: data.nome,
          descricao: data.descricao || null,
          valor: valorNumerico,
          ativo: data.ativo,
        });
        toast.success("Produto criado com sucesso!");
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      toast.error("Erro ao salvar produto");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProduto.mutateAsync(id);
      toast.success("Produto excluído com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir produto:", error);
      toast.error("Erro ao excluir produto");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 flex-shrink-0" />
          <span>Produtos</span>
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog} size="sm" className="gap-2 flex-shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo</span> Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingProduto ? "Editar Produto" : "Novo Produto"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Nome do produto" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="text"
                          placeholder="R$ 0,00"
                          onChange={(e) => {
                            const value = e.target.value;
                            const formatted = value.replace(/[^\d,.-]/g, '');
                            field.onChange(formatted);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="descricao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Descrição do produto (opcional)"
                          className="resize-none"
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ativo"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Ativo</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Produtos inativos não aparecem nas opções de upsell
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 justify-end pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createProduto.isPending || updateProduto.isPending}>
                    {editingProduto ? "Salvar" : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            Carregando produtos...
          </div>
        ) : produtos?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum produto cadastrado.</p>
            <p className="text-sm">Clique em "Novo Produto" para adicionar.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {produtos?.map((produto) => (
              <div
                key={produto.id}
                className={`flex items-center justify-between gap-2 p-3 rounded-lg border ${
                  !produto.ativo ? "opacity-50 bg-muted/50" : "bg-card"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">{produto.nome}</span>
                    <Badge variant={produto.ativo ? "default" : "secondary"} className="text-xs flex-shrink-0">
                      {produto.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                    <span>R$ {produto.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    {produto.descricao && (
                      <span className="truncate hidden sm:inline">{produto.descricao}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(produto)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir "{produto.nome}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(produto.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
