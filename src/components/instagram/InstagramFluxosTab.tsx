import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, GitBranch, Edit2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const fluxoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  descricao: z.string().optional(),
});

type FluxoFormData = z.infer<typeof fluxoSchema>;

interface Fluxo {
  id: string;
  nome: string;
  descricao: string | null;
  etapas: any[];
  ativo: boolean;
  created_at: string;
}

export function InstagramFluxosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<FluxoFormData>({
    resolver: zodResolver(fluxoSchema),
    defaultValues: {
      nome: "",
      descricao: "",
    },
  });

  const { data: fluxos, isLoading } = useQuery({
    queryKey: ["instagram-fluxos"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("instagram_fluxos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Fluxo[];
    },
  });

  const createFluxo = useMutation({
    mutationFn: async (data: FluxoFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase.from("instagram_fluxos").insert({
        user_id: user.id,
        nome: data.nome,
        descricao: data.descricao || null,
        etapas: [],
        ativo: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
      toast.success("Fluxo criado com sucesso!");
      setDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      console.error("Erro ao criar fluxo:", error);
      toast.error("Erro ao criar fluxo");
    },
  });

  const toggleFluxo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("instagram_fluxos")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
    },
  });

  const deleteFluxo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instagram_fluxos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-fluxos"] });
      toast.success("Fluxo excluído");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Fluxos de Conversa</h2>
          <p className="text-sm text-muted-foreground">
            Crie jornadas automatizadas com múltiplas etapas
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Fluxo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Criar Novo Fluxo</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createFluxo.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Fluxo</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Boas-vindas novos seguidores" {...field} />
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
                      <FormLabel>Descrição (opcional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Descreva o objetivo deste fluxo..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createFluxo.isPending}>
                    {createFluxo.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Criar Fluxo
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {fluxos?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum fluxo criado</h3>
            <p className="text-sm text-muted-foreground">
              Crie fluxos para automatizar conversas complexas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {fluxos?.map((fluxo) => (
            <Card key={fluxo.id} className={!fluxo.ativo ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">{fluxo.nome}</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={fluxo.ativo}
                      onCheckedChange={(ativo) =>
                        toggleFluxo.mutate({ id: fluxo.id, ativo })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFluxo.mutate(fluxo.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {fluxo.descricao && (
                  <CardDescription>{fluxo.descricao}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {fluxo.etapas?.length || 0} etapas
                    </Badge>
                    <Badge variant={fluxo.ativo ? "default" : "secondary"}>
                      {fluxo.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <Button variant="outline" size="sm" disabled>
                    <Edit2 className="h-4 w-4 mr-2" />
                    Editar Fluxo
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Info sobre editor de fluxos */}
      <Card className="border-dashed">
        <CardContent className="py-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              O editor visual de fluxos está em desenvolvimento.
            </p>
            <p className="text-xs text-muted-foreground">
              Por enquanto, use os gatilhos por palavra-chave para respostas automáticas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
