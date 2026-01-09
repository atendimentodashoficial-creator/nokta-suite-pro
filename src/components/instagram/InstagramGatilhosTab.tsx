import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Zap, MessageCircle, AtSign, Image, Link2, MousePointerClick, X, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const gatilhoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  palavras_chave: z.string().min(1, "Ao menos uma palavra-chave é obrigatória"),
  tipo: z.enum(["dm", "comentario"]),
  resposta_texto: z.string().optional(),
  resposta_midia_url: z.string().optional(),
  resposta_midia_tipo: z.enum(["image", "video", "audio", "file"]).optional(),
  resposta_link_url: z.string().optional(),
  resposta_link_texto: z.string().optional(),
  resposta_botoes: z.array(z.object({
    type: z.string(),
    title: z.string(),
    payload: z.string().optional(),
    url: z.string().optional(),
  })).optional(),
});

type GatilhoFormData = z.infer<typeof gatilhoSchema>;

interface Gatilho {
  id: string;
  nome: string;
  palavras_chave: string[];
  tipo: string;
  resposta_texto: string | null;
  resposta_midia_url: string | null;
  resposta_midia_tipo: string | null;
  resposta_link_url: string | null;
  resposta_link_texto: string | null;
  resposta_botoes: any[] | null;
  ativo: boolean;
  created_at: string;
}

interface QuickReplyButton {
  type: string;
  title: string;
  payload?: string;
  url?: string;
}

export function InstagramGatilhosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [buttons, setButtons] = useState<QuickReplyButton[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const form = useForm<GatilhoFormData>({
    resolver: zodResolver(gatilhoSchema),
    defaultValues: {
      nome: "",
      palavras_chave: "",
      tipo: "dm",
      resposta_texto: "",
      resposta_midia_url: "",
      resposta_midia_tipo: undefined,
      resposta_link_url: "",
      resposta_link_texto: "",
      resposta_botoes: [],
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('instagram-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('instagram-media')
        .getPublicUrl(fileName);

      // Determine media type
      let mediaType: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) mediaType = "image";
      else if (file.type.startsWith("video/")) mediaType = "video";
      else if (file.type.startsWith("audio/")) mediaType = "audio";

      form.setValue("resposta_midia_url", publicUrl);
      form.setValue("resposta_midia_tipo", mediaType);
      setPreviewImage(mediaType === "image" ? publicUrl : null);
      toast.success("Arquivo enviado com sucesso!");
    } catch (error) {
      console.error("Erro no upload:", error);
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const addButton = (type: "quick_reply" | "url") => {
    if (buttons.length >= 3) {
      toast.error("Máximo de 3 botões permitido");
      return;
    }
    setButtons([...buttons, { type, title: "", payload: "", url: "" }]);
  };

  const updateButton = (index: number, field: keyof QuickReplyButton, value: string) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], [field]: value };
    setButtons(newButtons);
  };

  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const createGatilho = useMutation({
    mutationFn: async (data: GatilhoFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const palavrasArray = data.palavras_chave
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter((p) => p.length > 0);

      const insertData: any = {
        user_id: user.id,
        nome: data.nome,
        palavras_chave: palavrasArray,
        tipo: data.tipo,
        resposta_texto: data.resposta_texto || null,
        resposta_midia_url: data.resposta_midia_url || null,
        resposta_midia_tipo: data.resposta_midia_tipo || null,
        resposta_link_url: data.resposta_link_url || null,
        resposta_link_texto: data.resposta_link_texto || null,
        resposta_botoes: buttons.length > 0 ? buttons : null,
        ativo: true,
      };

      const { error } = await supabase.from("instagram_gatilhos").insert([insertData]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-gatilhos"] });
      toast.success("Gatilho criado com sucesso!");
      setDialogOpen(false);
      form.reset();
      setButtons([]);
      setPreviewImage(null);
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
            Configure respostas automáticas com texto, mídia, links e botões
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            form.reset();
            setButtons([]);
            setPreviewImage(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Gatilho
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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

                <div className="grid grid-cols-2 gap-4">
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
                                DM
                              </div>
                            </SelectItem>
                            <SelectItem value="comentario">
                              <div className="flex items-center gap-2">
                                <AtSign className="h-4 w-4" />
                                Comentário
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
                          <Input placeholder="preço, valor" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Separe por vírgula
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Tabs defaultValue="texto" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="texto" className="text-xs">
                      <MessageCircle className="h-3 w-3 mr-1" />
                      Texto
                    </TabsTrigger>
                    <TabsTrigger value="midia" className="text-xs">
                      <Image className="h-3 w-3 mr-1" />
                      Mídia
                    </TabsTrigger>
                    <TabsTrigger value="link" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      Link
                    </TabsTrigger>
                    <TabsTrigger value="botoes" className="text-xs">
                      <MousePointerClick className="h-3 w-3 mr-1" />
                      Botões
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="texto" className="mt-4">
                    <FormField
                      control={form.control}
                      name="resposta_texto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mensagem de Texto</FormLabel>
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
                  </TabsContent>

                  <TabsContent value="midia" className="mt-4 space-y-4">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                        onChange={handleFileUpload}
                      />
                      
                      {previewImage ? (
                        <div className="relative">
                          <img src={previewImage} alt="Preview" className="max-h-40 mx-auto rounded" />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute top-0 right-0"
                            onClick={() => {
                              setPreviewImage(null);
                              form.setValue("resposta_midia_url", "");
                              form.setValue("resposta_midia_tipo", undefined);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : form.watch("resposta_midia_url") ? (
                        <div className="flex items-center justify-center gap-2">
                          <Badge variant="secondary">{form.watch("resposta_midia_tipo")}</Badge>
                          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                            Arquivo enviado
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              form.setValue("resposta_midia_url", "");
                              form.setValue("resposta_midia_tipo", undefined);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">
                            Arraste um arquivo ou clique para enviar
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                          >
                            {uploading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Upload className="h-4 w-4 mr-2" />
                            )}
                            Escolher Arquivo
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            Imagem, vídeo, áudio ou documento
                          </p>
                        </>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="link" className="mt-4 space-y-4">
                    <FormField
                      control={form.control}
                      name="resposta_link_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>URL do Link</FormLabel>
                          <FormControl>
                            <Input placeholder="https://seusite.com/produto" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="resposta_link_texto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Texto do Link (opcional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Clique aqui para ver mais" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>

                  <TabsContent value="botoes" className="mt-4 space-y-4">
                    <div className="space-y-3">
                      {buttons.map((button, index) => (
                        <div key={index} className="flex gap-2 items-start p-3 border rounded-lg">
                          <div className="flex-1 space-y-2">
                            <Input
                              placeholder="Texto do botão"
                              value={button.title}
                              onChange={(e) => updateButton(index, "title", e.target.value)}
                            />
                            {button.type === "url" ? (
                              <Input
                                placeholder="https://..."
                                value={button.url || ""}
                                onChange={(e) => updateButton(index, "url", e.target.value)}
                              />
                            ) : (
                              <Input
                                placeholder="Payload (identificador)"
                                value={button.payload || ""}
                                onChange={(e) => updateButton(index, "payload", e.target.value)}
                              />
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeButton(index)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>

                    {buttons.length < 3 && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addButton("quick_reply")}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Quick Reply
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addButton("url")}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Botão URL
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Máximo de 3 botões por mensagem
                    </p>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-2 justify-end pt-4">
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
                    {gatilho.resposta_midia_url && (
                      <Badge variant="outline">
                        <Image className="h-3 w-3 mr-1" />
                        {gatilho.resposta_midia_tipo}
                      </Badge>
                    )}
                    {gatilho.resposta_link_url && (
                      <Badge variant="outline">
                        <Link2 className="h-3 w-3 mr-1" />
                        Link
                      </Badge>
                    )}
                    {gatilho.resposta_botoes && gatilho.resposta_botoes.length > 0 && (
                      <Badge variant="outline">
                        <MousePointerClick className="h-3 w-3 mr-1" />
                        {gatilho.resposta_botoes.length} botões
                      </Badge>
                    )}
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
                {gatilho.resposta_texto && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Texto:</p>
                    <p className="text-sm bg-muted p-2 rounded-md line-clamp-2">
                      {gatilho.resposta_texto}
                    </p>
                  </div>
                )}
                {gatilho.resposta_midia_url && gatilho.resposta_midia_tipo === "image" && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Imagem:</p>
                    <img 
                      src={gatilho.resposta_midia_url} 
                      alt="Mídia" 
                      className="max-h-20 rounded"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
