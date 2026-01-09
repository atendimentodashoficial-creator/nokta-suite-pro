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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Zap, MessageCircle, AtSign } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const gatilhoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  palavras_chave: z.string().min(1, "Ao menos uma palavra-chave é obrigatória"),
  tipo: z.enum(["dm", "comentario"]),
  resposta_texto: z.string().min(1, "Resposta é obrigatória"),
});

type GatilhoFormData = z.infer<typeof gatilhoSchema>;

interface Gatilho {
  id: string;
  nome: string;
  palavras_chave: string[];
  tipo: string;
  resposta_texto: string | null;
  ativo: boolean;
  created_at: string;
}

export function InstagramGatilhosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<GatilhoFormData>({
    resolver: zodResolver(gatilhoSchema),
    defaultValues: {
      nome: "",
      palavras_chave: "",
      tipo: "dm",
      resposta_texto: "",
    },
  });

  const { data: gatilhos, isLoading } = useQuery({
    queryKey: ["instagram-gatilhos"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("instagram_gatilhos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Gatilho[];
    },
  });

  const createGatilho = useMutation({
    mutationFn: async (data: GatilhoFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const palavrasArray = data.palavras_chave
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.length > 0);

      const { error } = await supabase.from("instagram_gatilhos").insert({
        user_id: user.id,
        nome: data.nome,
        palavras_chave: palavrasArray,
        tipo: data.tipo,
        resposta_texto: data.resposta_texto,
        ativo: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-gatilhos"] });
      toast.success("Gatilho criado com sucesso!");
      setDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      console.error("Erro ao criar gatilho:", error);
      toast.error("Erro ao criar gatilho");
    },
  });

  const toggleGatilho = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from("instagram_gatilhos")
        .update({ ativo })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-gatilhos"] });
    },
  });

  const deleteGatilho = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instagram_gatilhos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-gatilhos"] });
      toast.success("Gatilho excluído");
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
          <h2 className="text-lg font-semibold">Gatilhos por Palavra-chave</h2>
          <p className="text-sm text-muted-foreground">
            Configure respostas automáticas baseadas em palavras-chave
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Gatilho
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Criar Novo Gatilho</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => createGatilho.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Gatilho</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Preço do produto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Mensagem</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="dm">
                            <div className="flex items-center gap-2">
                              <MessageCircle className="h-4 w-4" />
                              Mensagem Direta (DM)
                            </div>
                          </SelectItem>
                          <SelectItem value="comentario">
                            <div className="flex items-center gap-2">
                              <AtSign className="h-4 w-4" />
                              Comentário em Post
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="palavras_chave"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Palavras-chave</FormLabel>
                      <FormControl>
                        <Input placeholder="preço, valor, quanto custa" {...field} />
                      </FormControl>
                      <FormDescription>
                        Separe múltiplas palavras por vírgula
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="resposta_texto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resposta Automática</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Olá! O valor do nosso produto é R$ 99,90..."
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Use {"{nome}"} para incluir o nome do usuário
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createGatilho.isPending}>
                    {createGatilho.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Criar Gatilho
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {gatilhos?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Zap className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum gatilho configurado</h3>
            <p className="text-sm text-muted-foreground">
              Crie seu primeiro gatilho para responder automaticamente
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {gatilhos?.map((gatilho) => (
            <Card key={gatilho.id} className={!gatilho.ativo ? "opacity-60" : ""}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{gatilho.nome}</CardTitle>
                    <Badge variant={gatilho.tipo === "dm" ? "default" : "secondary"}>
                      {gatilho.tipo === "dm" ? "DM" : "Comentário"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={gatilho.ativo}
                      onCheckedChange={(ativo) =>
                        toggleGatilho.mutate({ id: gatilho.id, ativo })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteGatilho.mutate(gatilho.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Palavras-chave:</p>
                  <div className="flex flex-wrap gap-1">
                    {gatilho.palavras_chave.map((palavra, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {palavra}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Resposta:</p>
                  <p className="text-sm bg-muted p-2 rounded-md">
                    {gatilho.resposta_texto}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
