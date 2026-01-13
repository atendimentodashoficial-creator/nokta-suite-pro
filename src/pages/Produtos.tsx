import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { Plus, Pencil, Trash2, GripVertical, FileText } from "lucide-react";
import { useProdutos, useCreateProduto, useUpdateProduto, useDeleteProduto, Produto } from "@/hooks/useProdutos";
import { CurrencyInput, parseCurrencyToNumber } from "@/components/ui/currency-input";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const produtoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  descricao: z.string().max(500, "Descrição muito longa").optional(),
  valor: z.string().min(1, "Valor é obrigatório"),
  ativo: z.boolean().default(true),
});

type ProdutoFormData = z.infer<typeof produtoSchema>;

interface SortableProdutoItemProps {
  produto: Produto;
  onEdit: (produto: Produto) => void;
  onDelete: (produto: Produto) => void;
  onToggleAtivo: (produto: Produto) => void;
}

function SortableProdutoItem({ produto, onEdit, onDelete, onToggleAtivo }: SortableProdutoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: produto.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative p-3 rounded-lg border ${
        !produto.ativo ? "opacity-50 bg-muted/50" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none flex-shrink-0"
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
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
                <span className="flex items-center gap-1 truncate hidden sm:inline-flex">
                  <FileText className="w-3 h-3 flex-shrink-0" />
                  {produto.descricao}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Switch
            checked={produto.ativo}
            onCheckedChange={() => onToggleAtivo(produto)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(produto)}
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onDelete(produto)}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Produtos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduto, setEditingProduto] = useState<Produto | null>(null);
  const [deletingProduto, setDeletingProduto] = useState<Produto | null>(null);

  const { data: produtos, isLoading } = useProdutos();
  const createProduto = useCreateProduto();
  const updateProduto = useUpdateProduto();
  const deleteProduto = useDeleteProduto();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort by ordem
  const sortedProdutos = useMemo(() => {
    if (!produtos) return [];
    return [...produtos].sort((a, b) => ((a as any).ordem || 0) - ((b as any).ordem || 0));
  }, [produtos]);

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
      valor: produto.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ativo: produto.ativo,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = async (data: ProdutoFormData) => {
    try {
      const valorNumerico = parseCurrencyToNumber(data.valor);

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
          ordem: (produtos?.length || 0) + 1,
        } as any);
        toast.success("Produto criado com sucesso!");
      }
      setIsDialogOpen(false);
      form.reset();
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      toast.error("Erro ao salvar produto");
    }
  };

  const handleDelete = async () => {
    if (!deletingProduto) return;
    try {
      await deleteProduto.mutateAsync(deletingProduto.id);
      toast.success("Produto excluído com sucesso!");
      setDeletingProduto(null);
    } catch (error) {
      console.error("Erro ao excluir produto:", error);
      toast.error("Erro ao excluir produto");
    }
  };

  const handleToggleAtivo = (produto: Produto) => {
    updateProduto.mutate({
      id: produto.id,
      ativo: !produto.ativo,
    });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = sortedProdutos.findIndex((p) => p.id === active.id);
      const newIndex = sortedProdutos.findIndex((p) => p.id === over.id);

      const newOrder = arrayMove(sortedProdutos, oldIndex, newIndex);

      // Update order in database for all affected items
      for (let i = 0; i < newOrder.length; i++) {
        if (((newOrder[i] as any).ordem || 0) !== i + 1) {
          updateProduto.mutate({
            id: newOrder[i].id,
            ordem: i + 1,
          } as any);
        }
      }
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Produtos</CardTitle>
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
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-lg font-semibold">Produtos</CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} size="sm" className="flex-shrink-0">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar
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
                          <CurrencyInput
                            value={field.value}
                            onChange={field.onChange}
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

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createProduto.isPending || updateProduto.isPending}>
                      {createProduto.isPending || updateProduto.isPending ? "Salvando..." : editingProduto ? "Salvar" : "Criar"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {sortedProdutos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Nenhum produto cadastrado.</p>
              <p className="text-sm mt-1">Adicione produtos para usar nos upsells.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortedProdutos.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sortedProdutos.map((produto) => (
                    <SortableProdutoItem
                      key={produto.id}
                      produto={produto}
                      onEdit={openEditDialog}
                      onDelete={setDeletingProduto}
                      onToggleAtivo={handleToggleAtivo}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingProduto} onOpenChange={(open) => !open && setDeletingProduto(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o produto <strong>{deletingProduto?.nome}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
