import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, FileText, Copy, ExternalLink, Users, X, User, Phone, Mail, Calendar, MessageSquare, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneDisplay, extractCountryCode, formatPhoneByCountry } from "@/utils/phoneFormat";
import { countries } from "@/components/whatsapp/CountryCodeSelect";
const formSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  titulo_pagina: z.string().min(1, "Título é obrigatório"),
  subtitulo_pagina: z.string().optional(),
  texto_botao: z.string().min(1, "Texto do botão é obrigatório"),
  mensagem_sucesso: z.string().min(1, "Mensagem de sucesso é obrigatória"),
  cor_primaria: z.string().optional(),
  imagem_url: z.string().optional(),
  botao_sucesso_texto: z.string().optional(),
  botao_sucesso_url: z.string().optional()
});
type FormData = z.infer<typeof formSchema>;
interface Formulario {
  id: string;
  nome: string;
  titulo_pagina: string;
  subtitulo_pagina: string | null;
  texto_botao: string;
  mensagem_sucesso: string;
  campos: (string | CampoPersonalizado)[];
  cor_primaria: string;
  imagem_url: string | null;
  botao_sucesso_texto: string | null;
  botao_sucesso_url: string | null;
  ativo: boolean;
  created_at: string;
}
interface Resposta {
  id: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
  instagram_user_id: string | null;
  tracking_id: string | null;
  dados_extras: Record<string, string> | null;
  created_at: string;
}
interface CampoPersonalizado {
  id: string;
  label: string;
  tipo: "text" | "tel" | "email" | "textarea" | "multipla_escolha" | "sim_nao";
  obrigatorio: boolean;
  opcoes?: string[]; // Para múltipla escolha
}
export function InstagramFormulariosTab() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFormulario, setEditingFormulario] = useState<Formulario | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [selectedCampos, setSelectedCampos] = useState<string[]>(["nome", "telefone", "email"]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [novoCampoLabel, setNovoCampoLabel] = useState("");
  const [novoCampoTipo, setNovoCampoTipo] = useState<"text" | "textarea" | "multipla_escolha" | "sim_nao">("text");
  const [novasOpcoes, setNovasOpcoes] = useState<string[]>(["", ""]);
  const [simNaoOpcoes, setSimNaoOpcoes] = useState<[string, string]>(["Sim", "Não"]);
  const [novaOpcaoTexto, setNovaOpcaoTexto] = useState("");
  const queryClient = useQueryClient();
  const camposPadrao = [{
    id: "nome",
    label: "Nome"
  }, {
    id: "telefone",
    label: "Telefone"
  }, {
    id: "email",
    label: "Email"
  }];
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      titulo_pagina: "",
      subtitulo_pagina: "",
      texto_botao: "",
      mensagem_sucesso: "",
      cor_primaria: "#00D4FF",
      imagem_url: "",
      botao_sucesso_texto: "",
      botao_sucesso_url: ""
    }
  });
  const {
    data: formularios,
    isLoading
  } = useQuery({
    queryKey: ["instagram-formularios"],
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
      } = await supabase.from("instagram_formularios").select("*").eq("user_id", user.id).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return (data || []).map(f => ({
        ...f,
        campos: Array.isArray(f.campos) ? f.campos : JSON.parse(f.campos as string)
      })) as Formulario[];
    }
  });
  const {
    data: respostas,
    isLoading: loadingRespostas
  } = useQuery({
    queryKey: ["instagram-formularios-respostas", selectedFormId],
    queryFn: async () => {
      if (!selectedFormId) return [];
      const {
        data,
        error
      } = await supabase.from("instagram_formularios_respostas").select("*").eq("formulario_id", selectedFormId).order("created_at", {
        ascending: false
      });
      if (error) throw error;
      return data as Resposta[];
    },
    enabled: !!selectedFormId
  });
  const createFormulario = useMutation({
    mutationFn: async (data: FormData) => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const todosCampos = [...selectedCampos, ...camposPersonalizados.map(c => JSON.stringify(c))];
      if (todosCampos.length === 0) {
        throw new Error("Selecione ao menos um campo");
      }
      const {
        error
      } = await supabase.from("instagram_formularios").insert({
        user_id: user.id,
        nome: data.nome,
        titulo_pagina: data.titulo_pagina,
        subtitulo_pagina: data.subtitulo_pagina || null,
        texto_botao: data.texto_botao,
        mensagem_sucesso: data.mensagem_sucesso,
        cor_primaria: data.cor_primaria || "#00D4FF",
        imagem_url: data.imagem_url || null,
        campos: todosCampos,
        ativo: true,
        botao_sucesso_texto: data.botao_sucesso_texto || null,
        botao_sucesso_url: data.botao_sucesso_url || null
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-formularios"]
      });
      toast.success("Formulário criado com sucesso!");
      closeDialog();
    },
    onError: error => {
      console.error("Erro ao criar formulário:", error);
      toast.error("Erro ao criar formulário");
    }
  });
  const updateFormulario = useMutation({
    mutationFn: async (data: FormData & {
      id: string;
    }) => {
      const todosCampos = [...selectedCampos, ...camposPersonalizados.map(c => JSON.stringify(c))];
      const {
        error
      } = await supabase.from("instagram_formularios").update({
        nome: data.nome,
        titulo_pagina: data.titulo_pagina,
        subtitulo_pagina: data.subtitulo_pagina || null,
        texto_botao: data.texto_botao,
        mensagem_sucesso: data.mensagem_sucesso,
        cor_primaria: data.cor_primaria || "#00D4FF",
        imagem_url: data.imagem_url || null,
        campos: todosCampos,
        botao_sucesso_texto: data.botao_sucesso_texto || null,
        botao_sucesso_url: data.botao_sucesso_url || null
      }).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-formularios"]
      });
      toast.success("Formulário atualizado com sucesso!");
      closeDialog();
    },
    onError: error => {
      console.error("Erro ao atualizar formulário:", error);
      toast.error("Erro ao atualizar formulário");
    }
  });
  const toggleFormulario = useMutation({
    mutationFn: async ({
      id,
      ativo
    }: {
      id: string;
      ativo: boolean;
    }) => {
      const {
        error
      } = await supabase.from("instagram_formularios").update({
        ativo
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-formularios"]
      });
    }
  });
  const deleteFormulario = useMutation({
    mutationFn: async (id: string) => {
      const {
        error
      } = await supabase.from("instagram_formularios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-formularios"]
      });
      toast.success("Formulário excluído");
    }
  });
  const deleteResposta = useMutation({
    mutationFn: async (id: string) => {
      const {
        error
      } = await supabase.from("instagram_formularios_respostas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-formularios-respostas", selectedFormId]
      });
      toast.success("Resposta excluída");
    },
    onError: () => {
      toast.error("Erro ao excluir resposta");
    }
  });
  const openEditDialog = (formulario: Formulario) => {
    setEditingFormulario(formulario);

    // Parse campos - separar padrão de personalizados
    const camposPadraoIds: string[] = [];
    const camposCustom: CampoPersonalizado[] = [];
    formulario.campos.forEach(c => {
      if (typeof c === "string") {
        // Tentar parse como JSON
        try {
          const parsed = JSON.parse(c);
          if (parsed.id && parsed.label) {
            camposCustom.push(parsed as CampoPersonalizado);
          } else {
            camposPadraoIds.push(c);
          }
        } catch {
          camposPadraoIds.push(c);
        }
      } else {
        camposCustom.push(c);
      }
    });
    setSelectedCampos(camposPadraoIds);
    setCamposPersonalizados(camposCustom);
    form.reset({
      nome: formulario.nome,
      titulo_pagina: formulario.titulo_pagina,
      subtitulo_pagina: formulario.subtitulo_pagina || "",
      texto_botao: formulario.texto_botao,
      mensagem_sucesso: formulario.mensagem_sucesso,
      cor_primaria: formulario.cor_primaria,
      imagem_url: formulario.imagem_url || "",
      botao_sucesso_texto: formulario.botao_sucesso_texto || "",
      botao_sucesso_url: formulario.botao_sucesso_url || ""
    });
    setDialogOpen(true);
  };
  const closeDialog = () => {
    setDialogOpen(false);
    setEditingFormulario(null);
    form.reset();
    setSelectedCampos(["nome", "telefone", "email"]);
    setCamposPersonalizados([]);
    setNovoCampoLabel("");
    setNovoCampoTipo("text");
    setNovasOpcoes(["", ""]);
    setSimNaoOpcoes(["Sim", "Não"]);
  };
  const handleFormSubmit = (data: FormData) => {
    if (editingFormulario) {
      updateFormulario.mutate({
        ...data,
        id: editingFormulario.id
      });
    } else {
      createFormulario.mutate(data);
    }
  };
  const generateSlug = (nome: string) => {
    return nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-z0-9\s-]/g, "") // Remove special chars
      .replace(/\s+/g, "-") // Replace spaces with hyphens
      .replace(/-+/g, "-") // Remove multiple hyphens
      .trim();
  };

  const getFormUrl = (formNome: string) => {
    const slug = generateSlug(formNome);
    return `${window.location.origin}/formularioig/${slug}`;
  };
  const copyFormUrl = (formNome: string) => {
    navigator.clipboard.writeText(getFormUrl(formNome));
    toast.success("Link copiado!");
  };
  if (isLoading) {
    return <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>;
  }
  return <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Formulários de Captura</h2>
          <p className="text-xs text-muted-foreground">
            Capture dados dos seus leads via Instagram
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={open => {
        if (!open) closeDialog();else setDialogOpen(true);
      }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => {
              setEditingFormulario(null);
              form.reset();
              setSelectedCampos(["nome", "telefone", "email"]);
              setCamposPersonalizados([]);
              setNovoCampoLabel("");
              setNovoCampoTipo("text");
              setNovasOpcoes(["", ""]);
              setSimNaoOpcoes(["Sim", "Não"]);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Formulário
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{editingFormulario ? "Editar Formulário" : "Criar Novo Formulário"}</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
                <FormField control={form.control} name="nome" render={({
                  field
                }) => <FormItem>
                      <FormLabel>Nome do Formulário</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Captura E-book" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Apenas para organização interna
                      </FormDescription>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="titulo_pagina" render={({
                  field
                }) => <FormItem>
                      <FormLabel>Título da Página</FormLabel>
                      <FormControl>
                        <Input placeholder="Preencha seus dados" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <FormField control={form.control} name="subtitulo_pagina" render={({
                  field
                }) => <FormItem>
                      <FormLabel>Subtítulo (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Receba seu material exclusivo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <div className="space-y-3">
                  <FormLabel>Campos do Formulário</FormLabel>
                  
                  {/* Campos padrão */}
                  <div className="flex flex-wrap gap-4 p-3 border rounded-lg">
                    {camposPadrao.map(campo => <div key={campo.id} className="flex items-center space-x-2">
                        <Checkbox id={campo.id} checked={selectedCampos.includes(campo.id)} onCheckedChange={checked => {
                        if (checked) {
                          setSelectedCampos([...selectedCampos, campo.id]);
                        } else {
                          setSelectedCampos(selectedCampos.filter(c => c !== campo.id));
                        }
                      }} />
                        <label htmlFor={campo.id} className="text-sm font-medium leading-none">
                          {campo.label}
                        </label>
                      </div>)}
                  </div>

                  {/* Campos personalizados */}
                  {camposPersonalizados.length > 0 && <div className="space-y-2">
                      <p className="text-sm font-medium">Perguntas adicionais:</p>
                      {camposPersonalizados.map((campo, index) => <div key={campo.id} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
                          <div className="flex-1">
                            <span className="text-sm">{campo.label}</span>
                            {(campo.tipo === "multipla_escolha" || campo.tipo === "sim_nao") && campo.opcoes && <p className="text-xs text-muted-foreground">
                                Opções: {campo.opcoes.join(", ")}
                              </p>}
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {campo.tipo === "textarea" ? "Texto longo" : campo.tipo === "multipla_escolha" ? "Múltipla escolha" : campo.tipo === "sim_nao" ? "Sim/Não" : "Texto curto"}
                          </Badge>
                          <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                        setCamposPersonalizados(camposPersonalizados.filter((_, i) => i !== index));
                      }}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>)}
                    </div>}

                  {/* Adicionar nova pergunta */}
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                    <p className="text-sm font-medium">Adicionar pergunta personalizada</p>
                    <div className="flex gap-2">
                      <Input placeholder="Ex: Qual seu interesse?" value={novoCampoLabel} onChange={e => setNovoCampoLabel(e.target.value)} className="flex-1" />
                      <Select value={novoCampoTipo} onValueChange={(v: "text" | "textarea" | "multipla_escolha" | "sim_nao") => {
                        setNovoCampoTipo(v);
                        if (v === "multipla_escolha") {
                          setNovasOpcoes(["", ""]);
                        }
                        if (v === "sim_nao") {
                          setSimNaoOpcoes(["Sim", "Não"]);
                        }
                      }}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Texto curto</SelectItem>
                          <SelectItem value="textarea">Texto longo</SelectItem>
                          <SelectItem value="multipla_escolha">Múltipla escolha</SelectItem>
                          <SelectItem value="sim_nao">Sim/Não</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Opções para múltipla escolha */}
                    {novoCampoTipo === "multipla_escolha" && <div className="space-y-2 pl-2 border-l-2 border-muted">
                        <p className="text-xs text-muted-foreground">Adicione as opções de resposta:</p>
                        {novasOpcoes.map((opcao, idx) => <div key={idx} className="flex gap-2">
                            <Input placeholder={`Opção ${idx + 1}`} value={opcao} onChange={e => {
                          const updated = [...novasOpcoes];
                          updated[idx] = e.target.value;
                          setNovasOpcoes(updated);
                        }} className="flex-1 h-8 text-sm" />
                            {novasOpcoes.length > 2 && <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                          setNovasOpcoes(novasOpcoes.filter((_, i) => i !== idx));
                        }}>
                                <X className="h-3 w-3" />
                              </Button>}
                          </div>)}
                        {novasOpcoes.length < 6 && <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setNovasOpcoes([...novasOpcoes, ""])}>
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar opção
                          </Button>}
                      </div>}

                    {/* Opções para sim/não personalizadas */}
                    {novoCampoTipo === "sim_nao" && <div className="space-y-2 pl-2 border-l-2 border-muted">
                        <p className="text-xs text-muted-foreground">Personalize as opções (opcional):</p>
                        <div className="flex gap-2">
                          <Input placeholder="Sim" value={simNaoOpcoes[0]} onChange={e => setSimNaoOpcoes([e.target.value, simNaoOpcoes[1]])} className="flex-1 h-8 text-sm" />
                          <Input placeholder="Não" value={simNaoOpcoes[1]} onChange={e => setSimNaoOpcoes([simNaoOpcoes[0], e.target.value])} className="flex-1 h-8 text-sm" />
                        </div>
                      </div>}
                    
                      <Button type="button" variant="outline" className="w-full" onClick={() => {
                      if (!novoCampoLabel.trim()) {
                        toast.error("Digite o texto da pergunta");
                        return;
                      }
                      if (novoCampoTipo === "multipla_escolha") {
                        const opcoesValidas = novasOpcoes.map(o => o.trim()).filter(Boolean);
                        if (opcoesValidas.length < 2) {
                          toast.error("Adicione pelo menos 2 opções");
                          return;
                        }
                      }
                      const novoId = `custom_${Date.now()}`;
                      const novoCampo: CampoPersonalizado = {
                        id: novoId,
                        label: novoCampoLabel.trim(),
                        tipo: novoCampoTipo as CampoPersonalizado["tipo"],
                        obrigatorio: true,
                        ...(novoCampoTipo === "multipla_escolha" && {
                          opcoes: novasOpcoes.map(o => o.trim()).filter(Boolean)
                        }),
                        ...(novoCampoTipo === "sim_nao" && {
                          opcoes: simNaoOpcoes
                        })
                      };
                      setCamposPersonalizados([...camposPersonalizados, novoCampo]);
                      setNovoCampoLabel("");
                      setNovoCampoTipo("text");
                      setNovasOpcoes(["", ""]);
                      setSimNaoOpcoes(["Sim", "Não"]);
                    }}>
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar pergunta
                      </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="texto_botao" render={({
                    field
                  }) => <FormItem>
                        <FormLabel>Texto do Botão</FormLabel>
                        <FormControl>
                          <Input placeholder="Enviar" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="cor_primaria" render={({
                    field
                  }) => <FormItem>
                        <FormLabel>Cor do Botão</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-12 h-10 p-0 cursor-pointer rounded-md overflow-hidden color-swatch-full" {...field} />
                            <Input placeholder="#00D4FF" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>} />
                </div>

                <FormField control={form.control} name="mensagem_sucesso" render={({
                  field
                }) => <FormItem>
                      <FormLabel>Mensagem de Sucesso</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Obrigado! Seus dados foram enviados com sucesso." rows={2} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>} />

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="botao_sucesso_texto" render={({
                    field
                  }) => <FormItem>
                        <FormLabel>Texto do Botão de Sucesso</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Acessar Material" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Opcional - botão exibido após envio
                        </FormDescription>
                        <FormMessage />
                      </FormItem>} />

                  <FormField control={form.control} name="botao_sucesso_url" render={({
                    field
                  }) => <FormItem>
                        <FormLabel>Link do Botão</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          URL para onde o botão redireciona
                        </FormDescription>
                        <FormMessage />
                      </FormItem>} />
                </div>

                <FormField control={form.control} name="imagem_url" render={({
                  field
                }) => <FormItem>
                      <FormLabel>URL da Imagem (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Imagem exibida no topo do formulário
                      </FormDescription>
                      <FormMessage />
                    </FormItem>} />

                <div className="flex gap-2 justify-end pt-4">
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createFormulario.isPending || updateFormulario.isPending}>
                    {(createFormulario.isPending || updateFormulario.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {editingFormulario ? "Salvar Alterações" : "Criar Formulário"}
                  </Button>
                </div>
              </form>
            </Form>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {formularios?.length === 0 ? <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-4 rounded-full bg-muted mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium">Nenhum formulário criado</h3>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Crie seu primeiro formulário de captura
            </p>
          </CardContent>
        </Card> : <Tabs defaultValue="formularios">
          <TabsList className="h-9">
            <TabsTrigger value="formularios" className="text-xs">Formulários</TabsTrigger>
            <TabsTrigger value="respostas" className="text-xs" disabled={!selectedFormId}>
              <Users className="h-3.5 w-3.5 mr-1" />
              Respostas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="formularios" className="mt-3">
            <div className="grid gap-3">
              {formularios?.map(formulario => <Card key={formulario.id} className={`cursor-pointer transition-all hover:shadow-md ${selectedFormId === formulario.id ? "ring-2 ring-primary" : ""} ${!formulario.ativo ? "opacity-60" : ""}`} onClick={() => setSelectedFormId(formulario.id)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: formulario.cor_primaria }} />
                          <h3 className="font-medium text-sm truncate">{formulario.nome}</h3>
                          <Badge variant="outline" className="text-[10px] h-5">
                            {formulario.campos.length} campos
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{formulario.titulo_pagina}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyFormUrl(formulario.nome)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(formulario)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteFormulario.mutate(formulario.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <Switch checked={formulario.ativo} onCheckedChange={ativo => toggleFormulario.mutate({ id: formulario.id, ativo })} />
                      </div>
                    </div>
                  </CardContent>
                </Card>)}
            </div>
          </TabsContent>

          <TabsContent value="respostas" className="mt-3">
            {selectedFormId ? <div className="space-y-3">
                {/* Header compacto */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm">{formularios?.find(f => f.id === selectedFormId)?.nome}</h3>
                      <p className="text-xs text-muted-foreground">{respostas?.length || 0} resposta{respostas?.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {formularios?.find(f => f.id === selectedFormId)?.titulo_pagina}
                  </Badge>
                </div>

                {loadingRespostas ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : respostas?.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                        <MessageSquare className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Nenhuma resposta ainda</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">As respostas aparecerão aqui</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-2">
                    {respostas?.map(resposta => {
                      const phoneFormatted = resposta.telefone ? formatPhoneDisplay(resposta.telefone) : null;
                      const { countryCode } = resposta.telefone ? extractCountryCode(resposta.telefone) : { countryCode: "55" };
                      const countryFlag = countries.find(c => c.dialCode === countryCode)?.flag || "🇧🇷";
                      const formColor = formularios?.find(f => f.id === selectedFormId)?.cor_primaria || '#00D4FF';
                      
                      return (
                        <Card key={resposta.id} className="group hover:shadow-md transition-all border-l-2" style={{ borderLeftColor: formColor }}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {/* Avatar */}
                                <div 
                                  className="h-8 w-8 rounded-full flex items-center justify-center text-white font-medium text-xs flex-shrink-0" 
                                  style={{ backgroundColor: formColor }}
                                >
                                  {resposta.nome?.charAt(0).toUpperCase() || <User className="h-3.5 w-3.5" />}
                                </div>
                                
                                <div className="flex-1 min-w-0 space-y-1.5">
                                  {/* Nome e data */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-sm truncate">{resposta.nome || "Sem nome"}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(resposta.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                    </span>
                                  </div>
                                  
                                  {/* Contatos */}
                                  <div className="flex flex-wrap gap-1.5">
                                    {resposta.telefone && (
                                      <Badge variant="secondary" className="text-[10px] h-5 font-normal gap-1">
                                        <span>{countryFlag}</span>
                                        <Phone className="h-2.5 w-2.5" />
                                        {phoneFormatted}
                                      </Badge>
                                    )}
                                    {resposta.email && (
                                      <Badge variant="secondary" className="text-[10px] h-5 font-normal gap-1 max-w-[180px]">
                                        <Mail className="h-2.5 w-2.5 flex-shrink-0" />
                                        <span className="truncate">{resposta.email}</span>
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  {/* Dados extras */}
                                  {resposta.dados_extras && Object.keys(resposta.dados_extras).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-dashed mt-1.5">
                                      {Object.entries(resposta.dados_extras).map(([key, value]) => (
                                        <div key={key} className="flex items-center gap-1 text-[10px]">
                                          <span className="text-muted-foreground font-medium">{key}:</span>
                                          <span className="text-foreground">{value}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Botão de excluir */}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0" 
                                onClick={() => deleteResposta.mutate(resposta.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div> : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Selecione um formulário</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Clique em um formulário para ver as respostas</p>
                  </CardContent>
                </Card>
              )}
          </TabsContent>
        </Tabs>}
    </div>;
}