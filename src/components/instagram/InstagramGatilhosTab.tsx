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
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Zap, MessageCircle, AtSign, Image, Link2, MousePointerClick, X, Upload, UserCheck, Pencil, FileText, Reply } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PrimeiraInteracaoConfig } from "./PrimeiraInteracaoConfig";
import { IceBreakersConfig } from "./IceBreakersConfig";
const gatilhoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  palavras_chave: z.string().min(1, "Ao menos uma palavra-chave é obrigatória"),
  tipo: z.enum(["dm", "comentario"]),
  ativo_em_dm: z.boolean().optional(),
  ativo_em_comentario: z.boolean().optional(),
  resposta_texto: z.string().optional(),
  resposta_midia_url: z.string().optional(),
  resposta_midia_tipo: z.enum(["image", "video", "audio", "file"]).optional(),
  resposta_link_url: z.string().optional(),
  resposta_link_texto: z.string().optional(),
  resposta_botoes: z.array(z.object({
    type: z.string(),
    title: z.string(),
    payload: z.string().optional(),
    url: z.string().optional()
  })).optional(),
  titulo_botoes: z.string().optional(),
  verificar_seguidor: z.boolean().optional(),
  mensagem_pedir_seguir: z.string().optional(),
  botao_liberar_texto: z.string().optional(),
  formulario_id: z.string().optional(),
  mensagem_formulario: z.string().optional(),
  botao_formulario_texto: z.string().optional(),
  responder_comentario: z.boolean().optional(),
  resposta_comentario_texto: z.string().optional()
});
type GatilhoFormData = z.infer<typeof gatilhoSchema>;
interface Gatilho {
  id: string;
  nome: string;
  palavras_chave: string[];
  tipo: string;
  ativo_em_dm: boolean | null;
  ativo_em_comentario: boolean | null;
  resposta_texto: string | null;
  resposta_midia_url: string | null;
  resposta_midia_tipo: string | null;
  resposta_link_url: string | null;
  resposta_link_texto: string | null;
  resposta_botoes: any[] | null;
  titulo_botoes: string | null;
  verificar_seguidor: boolean | null;
  mensagem_pedir_seguir: string | null;
  botao_liberar_texto: string | null;
  formulario_id: string | null;
  mensagem_formulario: string | null;
  botao_formulario_texto: string | null;
  responder_comentario: boolean | null;
  resposta_comentario_texto: string | null;
  ativo: boolean;
  created_at: string;
}
interface Formulario {
  id: string;
  nome: string;
  ativo: boolean;
}
interface QuickReplyButton {
  type: string;
  title: string;
  payload?: string;
  url?: string;
}
export function InstagramGatilhosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGatilho, setEditingGatilho] = useState<Gatilho | null>(null);
  const [uploading, setUploading] = useState(false);
  const [buttons, setButtons] = useState<QuickReplyButton[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeResponseTab, setActiveResponseTab] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const form = useForm<GatilhoFormData>({
    resolver: zodResolver(gatilhoSchema),
    defaultValues: {
      nome: "",
      palavras_chave: "",
      tipo: "dm",
      ativo_em_dm: true,
      ativo_em_comentario: false,
      resposta_texto: "",
      resposta_midia_url: "",
      resposta_midia_tipo: undefined,
      resposta_link_url: "",
      resposta_link_texto: "",
      resposta_botoes: [],
      titulo_botoes: "",
      verificar_seguidor: false,
      mensagem_pedir_seguir: "",
      botao_liberar_texto: "",
      formulario_id: "",
      mensagem_formulario: "",
      botao_formulario_texto: "Preencher Formulário",
      responder_comentario: false,
      resposta_comentario_texto: ""
    }
  });
  const {
    data: config
  } = useQuery({
    queryKey: ["instagram-config"],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const {
        data,
        error
      } = await supabase.from("instagram_config").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const {
    data: gatilhos,
    isLoading
  } = useQuery({
    queryKey: ["instagram-gatilhos"],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const {
        data,
        error
      } = await supabase.from("instagram_gatilhos").select("*").eq("user_id", user.id).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data as Gatilho[];
    }
  });
  const {
    data: formularios
  } = useQuery({
    queryKey: ["instagram-formularios-select"],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const {
        data,
        error
      } = await supabase.from("instagram_formularios").select("id, nome, ativo").eq("user_id", user.id).eq("ativo", true).order("nome", {
        ascending: true
      });
      if (error) throw error;
      return data as Formulario[];
    }
  });
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const {
        error: uploadError
      } = await supabase.storage.from('instagram-media').upload(fileName, file);
      if (uploadError) throw uploadError;
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('instagram-media').getPublicUrl(fileName);

      // Determine media type
      let mediaType: "image" | "video" | "audio" | "file" = "file";
      if (file.type.startsWith("image/")) mediaType = "image";else if (file.type.startsWith("video/")) mediaType = "video";else if (file.type.startsWith("audio/")) mediaType = "audio";
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
    setButtons([...buttons, {
      type,
      title: "",
      payload: "",
      url: ""
    }]);
  };
  const updateButton = (index: number, field: keyof QuickReplyButton, value: string) => {
    const newButtons = [...buttons];
    newButtons[index] = {
      ...newButtons[index],
      [field]: value
    };
    setButtons(newButtons);
  };
  const removeButton = (index: number) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };
  const createGatilho = useMutation({
    mutationFn: async (data: GatilhoFormData) => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const palavrasArray = data.palavras_chave.split(",").map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
      const insertData: any = {
        user_id: user.id,
        nome: data.nome,
        palavras_chave: palavrasArray,
        tipo: data.tipo,
        ativo_em_dm: data.ativo_em_dm ?? data.tipo === "dm",
        ativo_em_comentario: data.ativo_em_comentario ?? data.tipo === "comentario",
        resposta_texto: data.resposta_texto || null,
        resposta_midia_url: data.resposta_midia_url || null,
        resposta_midia_tipo: data.resposta_midia_tipo || null,
        resposta_link_url: data.resposta_link_url || null,
        resposta_link_texto: data.resposta_link_texto || null,
        resposta_botoes: buttons.length > 0 ? buttons : null,
        titulo_botoes: data.titulo_botoes || null,
        verificar_seguidor: data.verificar_seguidor || false,
        mensagem_pedir_seguir: data.mensagem_pedir_seguir || null,
        botao_liberar_texto: data.botao_liberar_texto || 'Já sigo! Liberar material',
        formulario_id: data.formulario_id || null,
        mensagem_formulario: data.mensagem_formulario || null,
        botao_formulario_texto: data.botao_formulario_texto || 'Preencher Formulário',
        responder_comentario: data.responder_comentario || false,
        resposta_comentario_texto: data.resposta_comentario_texto || null,
        ativo: true
      };
      const {
        error
      } = await supabase.from("instagram_gatilhos").insert([insertData]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-gatilhos"]
      });
      toast.success("Gatilho criado com sucesso!");
      closeDialog();
    },
    onError: error => {
      console.error("Erro ao criar gatilho:", error);
      toast.error("Erro ao criar gatilho");
    }
  });
  const updateGatilho = useMutation({
    mutationFn: async (data: GatilhoFormData & {
      id: string;
    }) => {
      const palavrasArray = data.palavras_chave.split(",").map(p => p.trim().toLowerCase()).filter(p => p.length > 0);
      const updateData: any = {
        nome: data.nome,
        palavras_chave: palavrasArray,
        tipo: data.tipo,
        ativo_em_dm: data.ativo_em_dm ?? false,
        ativo_em_comentario: data.ativo_em_comentario ?? false,
        resposta_texto: data.resposta_texto || null,
        resposta_midia_url: data.resposta_midia_url || null,
        resposta_midia_tipo: data.resposta_midia_tipo || null,
        resposta_link_url: data.resposta_link_url || null,
        resposta_link_texto: data.resposta_link_texto || null,
        resposta_botoes: buttons.length > 0 ? buttons : null,
        titulo_botoes: data.titulo_botoes || null,
        verificar_seguidor: data.verificar_seguidor || false,
        mensagem_pedir_seguir: data.mensagem_pedir_seguir || null,
        botao_liberar_texto: data.botao_liberar_texto || 'Já sigo! Liberar material',
        formulario_id: data.formulario_id || null,
        mensagem_formulario: data.mensagem_formulario || null,
        botao_formulario_texto: data.botao_formulario_texto || 'Preencher Formulário',
        responder_comentario: data.responder_comentario || false,
        resposta_comentario_texto: data.resposta_comentario_texto || null
      };
      const {
        error
      } = await supabase.from("instagram_gatilhos").update(updateData).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-gatilhos"]
      });
      toast.success("Gatilho atualizado com sucesso!");
      closeDialog();
    },
    onError: error => {
      console.error("Erro ao atualizar gatilho:", error);
      toast.error("Erro ao atualizar gatilho");
    }
  });
  const toggleGatilho = useMutation({
    mutationFn: async ({
      id,
      ativo
    }: {
      id: string;
      ativo: boolean;
    }) => {
      const {
        error
      } = await supabase.from("instagram_gatilhos").update({
        ativo
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-gatilhos"]
      });
    }
  });
  const deleteGatilho = useMutation({
    mutationFn: async (id: string) => {
      const {
        error
      } = await supabase.from("instagram_gatilhos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-gatilhos"]
      });
      toast.success("Gatilho excluído");
    }
  });
  const closeDialog = () => {
    setDialogOpen(false);
    setEditingGatilho(null);
    form.reset();
    setButtons([]);
    setPreviewImage(null);
    setActiveResponseTab(null);
  };
  const openEditDialog = (gatilho: Gatilho) => {
    setEditingGatilho(gatilho);
    form.reset({
      nome: gatilho.nome,
      palavras_chave: gatilho.palavras_chave.join(", "),
      tipo: gatilho.tipo as "dm" | "comentario",
      ativo_em_dm: gatilho.ativo_em_dm ?? false,
      ativo_em_comentario: gatilho.ativo_em_comentario ?? false,
      resposta_texto: gatilho.resposta_texto || "",
      resposta_midia_url: gatilho.resposta_midia_url || "",
      resposta_midia_tipo: gatilho.resposta_midia_tipo as any || undefined,
      resposta_link_url: gatilho.resposta_link_url || "",
      resposta_link_texto: gatilho.resposta_link_texto || "",
      titulo_botoes: gatilho.titulo_botoes || "",
      verificar_seguidor: gatilho.verificar_seguidor || false,
      mensagem_pedir_seguir: gatilho.mensagem_pedir_seguir || "",
      botao_liberar_texto: (gatilho as any).botao_liberar_texto || "Já sigo! Liberar material",
      formulario_id: gatilho.formulario_id || "",
      mensagem_formulario: gatilho.mensagem_formulario || "",
      botao_formulario_texto: gatilho.botao_formulario_texto || "Preencher Formulário",
      responder_comentario: gatilho.responder_comentario || false,
      resposta_comentario_texto: gatilho.resposta_comentario_texto || ""
    });
    setButtons(gatilho.resposta_botoes || []);
    setPreviewImage(gatilho.resposta_midia_tipo === "image" ? gatilho.resposta_midia_url : null);

    // Determinar aba ativa baseada no conteúdo configurado
    if (gatilho.formulario_id) {
      setActiveResponseTab("formulario");
    } else if (gatilho.resposta_botoes && gatilho.resposta_botoes.length > 0) {
      setActiveResponseTab("botoes");
    } else if (gatilho.resposta_link_url) {
      setActiveResponseTab("link");
    } else if (gatilho.resposta_midia_url) {
      setActiveResponseTab("midia");
    } else {
      setActiveResponseTab("texto");
    }
    setDialogOpen(true);
  };
  const handleSubmit = (data: GatilhoFormData) => {
    if (editingGatilho) {
      updateGatilho.mutate({
        ...data,
        id: editingGatilho.id
      });
    } else {
      createGatilho.mutate(data);
    }
  };
  if (isLoading) {
    return <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>;
  }
  return <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Gatilhos por Palavra-chave</h2>
          <p className="text-xs text-muted-foreground">
            Configure respostas automáticas
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={open => {
        if (!open) closeDialog();else setDialogOpen(open);
      }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => {
            setEditingGatilho(null);
            form.reset();
            setButtons([]);
            setPreviewImage(null);
            setActiveResponseTab(null);
          }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Gatilho
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingGatilho ? "Editar Gatilho" : "Criar Novo Gatilho"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField control={form.control} name="nome" render={({
                field
              }) => <FormItem>
                      <FormLabel>Nome do Gatilho</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Preço do produto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="palavras_chave" render={({
                field
              }) => <FormItem>
                      <FormLabel>Palavras-chave</FormLabel>
                      <FormControl>
                        <Input placeholder="preço, valor" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Separe por vírgula
                      </FormDescription>
                      <FormMessage />
                    </FormItem>} />

                <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Ativar gatilho em:</span>
                  <FormField control={form.control} name="ativo_em_dm" render={({
                  field
                }) => <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <FormLabel className="text-sm font-normal flex items-center gap-1 cursor-pointer">
                          <MessageCircle className="h-4 w-4" />
                          DM
                        </FormLabel>
                      </FormItem>} />
                  <FormField control={form.control} name="ativo_em_comentario" render={({
                  field
                }) => <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={checked => {
                      field.onChange(checked);
                      // Quando comentário é ativado, ativa resposta pública por padrão
                      if (checked) {
                        form.setValue("responder_comentario", true);
                      }
                    }} />
                        </FormControl>
                        <FormLabel className="text-sm font-normal flex items-center gap-1 cursor-pointer">
                          <AtSign className="h-4 w-4" />
                          Comentário
                        </FormLabel>
                      </FormItem>} />
                </div>

                <div className="w-full space-y-4">
                  <div className="grid w-full grid-cols-5 gap-1 p-1 bg-muted rounded-lg">
                    <button type="button" onClick={() => setActiveResponseTab(activeResponseTab === "texto" ? null : "texto")} className={`text-xs relative flex items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors ${activeResponseTab === "texto" ? "bg-background shadow-sm" : form.watch("resposta_texto") ? "ring-2 ring-primary ring-offset-1" : "hover:bg-background/50"}`}>
                      <MessageCircle className="h-3 w-3" />
                      Texto
                      {form.watch("resposta_texto") && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
                    </button>
                    <button type="button" onClick={() => setActiveResponseTab(activeResponseTab === "midia" ? null : "midia")} className={`text-xs relative flex items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors ${activeResponseTab === "midia" ? "bg-background shadow-sm" : form.watch("resposta_midia_url") ? "ring-2 ring-primary ring-offset-1" : "hover:bg-background/50"}`}>
                      <Image className="h-3 w-3" />
                      Mídia
                      {form.watch("resposta_midia_url") && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
                    </button>
                    <button type="button" onClick={() => setActiveResponseTab(activeResponseTab === "link" ? null : "link")} className={`text-xs relative flex items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors ${activeResponseTab === "link" ? "bg-background shadow-sm" : form.watch("resposta_link_url") ? "ring-2 ring-primary ring-offset-1" : "hover:bg-background/50"}`}>
                      <Link2 className="h-3 w-3" />
                      Link
                      {form.watch("resposta_link_url") && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
                    </button>
                    <button type="button" onClick={() => setActiveResponseTab(activeResponseTab === "botoes" ? null : "botoes")} className={`text-xs relative flex items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors ${activeResponseTab === "botoes" ? "bg-background shadow-sm" : buttons.length > 0 ? "ring-2 ring-primary ring-offset-1" : "hover:bg-background/50"}`}>
                      <MousePointerClick className="h-3 w-3" />
                      Botões
                      {buttons.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
                    </button>
                    <button type="button" onClick={() => setActiveResponseTab(activeResponseTab === "formulario" ? null : "formulario")} className={`text-xs relative flex items-center justify-center gap-1 px-3 py-2 rounded-md transition-colors ${activeResponseTab === "formulario" ? "bg-background shadow-sm" : form.watch("formulario_id") ? "ring-2 ring-primary ring-offset-1" : "hover:bg-background/50"}`}>
                      <FileText className="h-3 w-3" />
                      Formulário
                      {form.watch("formulario_id") && <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />}
                    </button>
                  </div>

                  {activeResponseTab === "texto" && <FormField control={form.control} name="resposta_texto" render={({
                  field
                }) => <FormItem>
                          <FormLabel>Mensagem de Texto</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Olá! O valor do nosso produto é R$ 99,90..." rows={4} {...field} />
                          </FormControl>
                          <FormDescription>
                            Use {"{nome}"} para incluir o nome do usuário
                          </FormDescription>
                          <FormMessage />
                        </FormItem>} />}

                  {activeResponseTab === "midia" && <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      <input type="file" ref={fileInputRef} className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" onChange={handleFileUpload} />
                      
                      {previewImage ? <div className="relative">
                          <img src={previewImage} alt="Preview" className="max-h-40 mx-auto rounded" />
                          <Button type="button" variant="destructive" size="icon" className="absolute top-0 right-0" onClick={() => {
                      setPreviewImage(null);
                      form.setValue("resposta_midia_url", "");
                      form.setValue("resposta_midia_tipo", undefined);
                    }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div> : form.watch("resposta_midia_url") ? <div className="flex items-center justify-center gap-2">
                          <Badge variant="secondary">{form.watch("resposta_midia_tipo")}</Badge>
                          <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                            Arquivo enviado
                          </span>
                          <Button type="button" variant="ghost" size="sm" onClick={() => {
                      form.setValue("resposta_midia_url", "");
                      form.setValue("resposta_midia_tipo", undefined);
                    }}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div> : <>
                          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">
                            Arraste um arquivo ou clique para enviar
                          </p>
                          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                            Escolher Arquivo
                          </Button>
                          <p className="text-xs text-muted-foreground mt-2">
                            Imagem, vídeo, áudio ou documento
                          </p>
                        </>}
                    </div>}

                  {activeResponseTab === "link" && <div className="space-y-4">
                      <FormField control={form.control} name="resposta_link_url" render={({
                    field
                  }) => <FormItem>
                            <FormLabel>URL do Link</FormLabel>
                            <FormControl>
                              <Input placeholder="https://seusite.com/produto" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>} />
                      <FormField control={form.control} name="resposta_link_texto" render={({
                    field
                  }) => <FormItem>
                            <FormLabel>Texto do Link (opcional)</FormLabel>
                            <FormControl>
                              <Input placeholder="Clique aqui para ver mais" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>} />
                    </div>}

                  {activeResponseTab === "botoes" && <div className="space-y-4">
                      <FormField control={form.control} name="titulo_botoes" render={({
                    field
                  }) => <FormItem>
                            <FormLabel>Título acima dos botões</FormLabel>
                            <FormControl>
                              <Input placeholder="Escolha uma opção:" {...field} />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Texto que aparece acima dos botões. Deixe vazio para usar o texto da aba "Texto".
                            </FormDescription>
                            <FormMessage />
                          </FormItem>} />

                      <div className="space-y-3">
                        {buttons.map((button, index) => <div key={index} className="flex gap-2 items-start p-3 border rounded-lg">
                            <div className="flex-1 space-y-2">
                              <Input placeholder="Texto do botão" value={button.title} onChange={e => updateButton(index, "title", e.target.value)} />
                              {button.type === "url" ? <Input placeholder="https://..." value={button.url || ""} onChange={e => updateButton(index, "url", e.target.value)} /> : <Input placeholder="Payload (identificador)" value={button.payload || ""} onChange={e => updateButton(index, "payload", e.target.value)} />}
                            </div>
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeButton(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>)}
                      </div>

                      {buttons.length < 3 && <div className="flex gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => addButton("quick_reply")}>
                            <Plus className="h-4 w-4 mr-1" />
                            Quick Reply
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => addButton("url")}>
                            <Link2 className="h-4 w-4 mr-1" />
                            Botão URL
                          </Button>
                        </div>}
                      <p className="text-xs text-muted-foreground">
                        Máximo de 3 botões por mensagem
                      </p>
                    </div>}

                  {activeResponseTab === "formulario" && <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                      <div className="flex items-start gap-3">
                        <FileText className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium">Enviar formulário de captura</p>
                          <p className="text-xs text-muted-foreground">
                            Envia uma mensagem com um botão para abrir o formulário
                          </p>
                        </div>
                      </div>

                      <FormField control={form.control} name="formulario_id" render={({
                    field
                  }) => <FormItem>
                            <FormLabel>Formulário</FormLabel>
                            <Select onValueChange={v => field.onChange(v === "none" ? "" : v)} value={field.value || "none"}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Selecione um formulário" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">Nenhum</SelectItem>
                                {formularios?.map(f => <SelectItem key={f.id} value={f.id}>
                                    {f.nome}
                                  </SelectItem>)}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>} />

                      {form.watch("formulario_id") && <>
                          <FormField control={form.control} name="mensagem_formulario" render={({
                      field
                    }) => <FormItem>
                                <FormLabel>Texto da mensagem</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="Olá {nome}! 👋 Para liberar seu material, preencha o formulário abaixo:" rows={3} {...field} />
                                </FormControl>
                                <FormDescription className="text-xs">
                                  Texto que aparece acima do botão. Use {"{nome}"} para incluir o nome do usuário.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>} />

                          <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="titulo_botoes" render={({
                        field
                      }) => <FormItem>
                                  <FormLabel>Título acima do botão</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Escolha uma opção:" {...field} />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Texto que aparece como título (opcional)
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>} />

                            <FormField control={form.control} name="botao_formulario_texto" render={({
                        field
                      }) => <FormItem>
                                  <FormLabel>Texto do botão</FormLabel>
                                  <FormControl>
                                    <Input placeholder="Preencher Formulário" maxLength={20} {...field} />
                                  </FormControl>
                                  <FormDescription className="text-xs">
                                    Texto no botão (máx. 20 caracteres)
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>} />
                          </div>

                          <div className="p-3 bg-background rounded-lg border">
                            <p className="text-xs text-muted-foreground mb-2">Prévia:</p>
                            <div className="space-y-2">
                              <p className="text-sm">{form.watch("mensagem_formulario") || "Olá! Para liberar seu material, preencha o formulário abaixo:"}</p>
                              {form.watch("titulo_botoes") && <p className="text-xs text-muted-foreground">{form.watch("titulo_botoes")}</p>}
                              <div className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium">
                                {form.watch("botao_formulario_texto") || "Preencher Formulário"}
                              </div>
                            </div>
                          </div>
                        </>}

                      {!formularios?.length && <p className="text-xs text-amber-600">
                          Nenhum formulário ativo. Crie um na aba "Formulários".
                        </p>}
                    </div>}
                </div>

                {/* Seção de Verificar Seguidor - Toggle separado */}
                <div className="p-4 border rounded-lg space-y-4">
                  <FormField control={form.control} name="verificar_seguidor" render={({
                  field
                }) => <FormItem className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <UserCheck className="h-5 w-5 text-primary" />
                          <div>
                            <FormLabel className="text-base font-medium">Verificar se segue</FormLabel>
                            <FormDescription className="text-xs">
                              Só envia a resposta se a pessoa te seguir
                            </FormDescription>
                          </div>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>} />

                  {form.watch("verificar_seguidor") && <>
                      <FormField control={form.control} name="mensagem_pedir_seguir" render={({
                    field
                  }) => <FormItem>
                            <FormLabel>Mensagem se NÃO seguir</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Olá! 👋 Antes de continuar, me segue lá pra não perder nenhuma novidade! Depois clique no botão abaixo 💜" rows={3} {...field} />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Enviada quando a pessoa não te segue. Use {"{nome}"} para incluir o nome.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>} />
                      
                      <FormField control={form.control} name="botao_liberar_texto" render={({
                    field
                  }) => <FormItem>
                            <FormLabel>Texto do botão para liberar</FormLabel>
                            <FormControl>
                              <Input placeholder="Já sigo! Liberar material" maxLength={20} {...field} />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Botão que a pessoa clica após seguir para liberar o material. Máx 20 caracteres.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>} />
                    </>}
                </div>

                {/* Seção de Resposta Pública - só aparece quando comentário está ativado */}
                {form.watch("ativo_em_comentario") && <div className="p-4 border rounded-lg space-y-4">
                    <FormField control={form.control} name="responder_comentario" render={({
                  field
                }) => <FormItem className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Reply className="h-5 w-5 text-primary" />
                            <div>
                              <FormLabel className="text-base font-medium">Resposta pública no comentário</FormLabel>
                              {form.watch("ativo_em_dm") && <FormDescription className="text-xs">
                                  Além da DM, responde diretamente no comentário
                                </FormDescription>}
                            </div>
                          </div>
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                        </FormItem>} />

                    {form.watch("responder_comentario") && <FormField control={form.control} name="resposta_comentario_texto" render={({
                  field
                }) => <FormItem>
                            <FormLabel>Texto da resposta pública</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Olá! 👋 Enviamos uma mensagem no seu Direct com as informações!" rows={3} {...field} />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Esta mensagem será postada como resposta ao comentário. Use {"{nome}"} para incluir o nome.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>} />}
                  </div>}

                <div className="flex gap-2 justify-end pt-4">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createGatilho.isPending || updateGatilho.isPending}>
                    {(createGatilho.isPending || updateGatilho.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {editingGatilho ? "Salvar Alterações" : "Criar Gatilho"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {gatilhos?.length === 0 ? <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Nenhum gatilho configurado</h3>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Crie seu primeiro gatilho automático
            </p>
          </CardContent>
        </Card> : <div className="grid gap-3">
          {gatilhos?.map(gatilho => <Card key={gatilho.id} className={`transition-all hover:shadow-md ${!gatilho.ativo ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Header com nome e badges */}
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <h3 className="font-medium text-sm">{gatilho.nome}</h3>
                      {gatilho.ativo_em_dm && <Badge variant="default" className="text-[10px] h-5 rounded">
                          <MessageCircle className="h-3 w-3 mr-1" />
                          DM
                        </Badge>}
                      {gatilho.ativo_em_comentario && <Badge variant="secondary" className="text-[10px] h-5 rounded">
                          <AtSign className="h-3 w-3 mr-1" />
                          Comentário
                        </Badge>}
                      {gatilho.resposta_midia_url && <Badge variant="outline" className="text-[10px] h-5">
                          <Image className="h-3 w-3 mr-1" />
                          {gatilho.resposta_midia_tipo}
                        </Badge>}
                      {gatilho.responder_comentario && <Badge variant="outline" className="text-[10px] h-5 bg-blue-500/10 text-blue-700 border-blue-500/20 rounded">
                          <Reply className="h-3 w-3 mr-1" />
                          Público
                        </Badge>}
                    </div>

                    {/* Palavras-chave */}
                    <div className="flex flex-wrap gap-1 mb-2">
                      {gatilho.palavras_chave.slice(0, 5).map((palavra, i) => <span key={i} className="text-[10px] px-2 py-0.5 bg-muted rounded-full">
                          {palavra}
                        </span>)}
                      {gatilho.palavras_chave.length > 5 && <span className="text-[10px] px-2 py-0.5 text-muted-foreground">
                          +{gatilho.palavras_chave.length - 5}
                        </span>}
                    </div>

                    {/* Texto de resposta */}
                    {gatilho.resposta_texto && <p className="text-xs text-muted-foreground line-clamp-1 bg-muted/50 px-2 py-1 rounded">
                        {gatilho.resposta_texto}
                      </p>}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Switch checked={gatilho.ativo} onCheckedChange={ativo => toggleGatilho.mutate({
                id: gatilho.id,
                ativo
              })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(gatilho)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteGatilho.mutate(gatilho.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>)}
        </div>}

      {/* Primeira Interação - Boas Vindas */}
      <PrimeiraInteracaoConfig />

      {/* Ice Breakers Configuration */}
      {config?.id && <IceBreakersConfig configId={config.id} iceBreakers={(config as any).ice_breakers || []} pageAccessToken={config.page_access_token} instagramAccountId={config.instagram_account_id} />}
    </div>;
}