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
  botao_sucesso_url: z.string().optional(),
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
  const [novaOpcaoTexto, setNovaOpcaoTexto] = useState("");
  const queryClient = useQueryClient();

  const camposPadrao = [
    { id: "nome", label: "Nome" },
    { id: "telefone", label: "Telefone" },
    { id: "email", label: "Email" },
  ];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      nome: "",
      titulo_pagina: "Preencha seus dados",
      subtitulo_pagina: "",
      texto_botao: "Enviar",
      mensagem_sucesso: "Obrigado! Seus dados foram enviados com sucesso.",
      cor_primaria: "#8B5CF6",
      imagem_url: "",
      botao_sucesso_texto: "",
      botao_sucesso_url: "",
    },
  });

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

  const { data: respostas, isLoading: loadingRespostas } = useQuery({
    queryKey: ["instagram-formularios-respostas", selectedFormId],
    queryFn: async () => {
      if (!selectedFormId) return [];

      const { data, error } = await supabase
        .from("instagram_formularios_respostas")
        .select("*")
        .eq("formulario_id", selectedFormId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Resposta[];
    },
    enabled: !!selectedFormId,
  });

  const createFormulario = useMutation({
    mutationFn: async (data: FormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const todosCampos = [
        ...selectedCampos,
        ...camposPersonalizados.map(c => JSON.stringify(c))
      ];

      if (todosCampos.length === 0) {
        throw new Error("Selecione ao menos um campo");
      }

      const { error } = await supabase.from("instagram_formularios").insert({
        user_id: user.id,
        nome: data.nome,
        titulo_pagina: data.titulo_pagina,
        subtitulo_pagina: data.subtitulo_pagina || null,
        texto_botao: data.texto_botao,
        mensagem_sucesso: data.mensagem_sucesso,
        cor_primaria: data.cor_primaria || "#8B5CF6",
        imagem_url: data.imagem_url || null,
        campos: todosCampos,
        ativo: true,
        botao_sucesso_texto: data.botao_sucesso_texto || null,
        botao_sucesso_url: data.botao_sucesso_url || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
      toast.success("Formulário criado com sucesso!");
      closeDialog();
    },
    onError: (error) => {
      console.error("Erro ao criar formulário:", error);
      toast.error("Erro ao criar formulário");
    },
  });

  const updateFormulario = useMutation({
    mutationFn: async (data: FormData & { id: string }) => {
      const todosCampos = [
        ...selectedCampos,
        ...camposPersonalizados.map(c => JSON.stringify(c))
      ];

      const { error } = await supabase
        .from("instagram_formularios")
        .update({
          nome: data.nome,
          titulo_pagina: data.titulo_pagina,
          subtitulo_pagina: data.subtitulo_pagina || null,
          texto_botao: data.texto_botao,
          mensagem_sucesso: data.mensagem_sucesso,
          cor_primaria: data.cor_primaria || "#8B5CF6",
          imagem_url: data.imagem_url || null,
          campos: todosCampos,
          botao_sucesso_texto: data.botao_sucesso_texto || null,
          botao_sucesso_url: data.botao_sucesso_url || null,
        })
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
      toast.success("Formulário atualizado com sucesso!");
      closeDialog();
    },
    onError: (error) => {
      console.error("Erro ao atualizar formulário:", error);
      toast.error("Erro ao atualizar formulário");
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
      const { error } = await supabase.from("instagram_formularios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
      toast.success("Formulário excluído");
    },
  });

  const openEditDialog = (formulario: Formulario) => {
    setEditingFormulario(formulario);
    
    // Parse campos - separar padrão de personalizados
    const camposPadraoIds: string[] = [];
    const camposCustom: CampoPersonalizado[] = [];
    
    formulario.campos.forEach((c) => {
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
      botao_sucesso_url: formulario.botao_sucesso_url || "",
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
  };

  const handleFormSubmit = (data: FormData) => {
    if (editingFormulario) {
      updateFormulario.mutate({ ...data, id: editingFormulario.id });
    } else {
      createFormulario.mutate(data);
    }
  };

  const getFormUrl = (formId: string) => {
    return `${window.location.origin}/f/${formId}`;
  };

  const copyFormUrl = (formId: string) => {
    navigator.clipboard.writeText(getFormUrl(formId));
    toast.success("Link copiado!");
  };

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
          <h2 className="text-lg font-semibold">Formulários de Captura</h2>
          <p className="text-sm text-muted-foreground">
            Crie formulários para capturar dados dos seus leads via Instagram
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog();
          else setDialogOpen(true);
        }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingFormulario(null); setDialogOpen(true); }}>
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
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do Formulário</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Captura E-book" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Apenas para organização interna
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="titulo_pagina"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título da Página</FormLabel>
                      <FormControl>
                        <Input placeholder="Preencha seus dados" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subtitulo_pagina"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subtítulo (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Receba seu material exclusivo" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="texto_botao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Texto do Botão</FormLabel>
                        <FormControl>
                          <Input placeholder="Enviar" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cor_primaria"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cor do Botão</FormLabel>
                        <FormControl>
                          <div className="flex gap-2">
                            <Input type="color" className="w-12 h-10 p-1" {...field} />
                            <Input placeholder="#8B5CF6" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="mensagem_sucesso"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mensagem de Sucesso</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Obrigado! Seus dados foram enviados com sucesso." 
                          rows={2}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="botao_sucesso_texto"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Texto do Botão de Sucesso</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Acessar Material" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          Opcional - botão exibido após envio
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="botao_sucesso_url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Link do Botão</FormLabel>
                        <FormControl>
                          <Input placeholder="https://..." {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          URL para onde o botão redireciona
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-3">
                  <FormLabel>Campos do Formulário</FormLabel>
                  
                  {/* Campos padrão */}
                  <div className="flex flex-wrap gap-4 p-3 border rounded-lg">
                    {camposPadrao.map((campo) => (
                      <div key={campo.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={campo.id}
                          checked={selectedCampos.includes(campo.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCampos([...selectedCampos, campo.id]);
                            } else {
                              setSelectedCampos(selectedCampos.filter(c => c !== campo.id));
                            }
                          }}
                        />
                        <label
                          htmlFor={campo.id}
                          className="text-sm font-medium leading-none"
                        >
                          {campo.label}
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Campos personalizados */}
                  {camposPersonalizados.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Perguntas adicionais:</p>
                      {camposPersonalizados.map((campo, index) => (
                        <div key={campo.id} className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
                          <div className="flex-1">
                            <span className="text-sm">{campo.label}</span>
                            {campo.tipo === "multipla_escolha" && campo.opcoes && (
                              <p className="text-xs text-muted-foreground">
                                Opções: {campo.opcoes.join(", ")}
                              </p>
                            )}
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {campo.tipo === "textarea" ? "Texto longo" : 
                             campo.tipo === "multipla_escolha" ? "Múltipla escolha" : 
                             campo.tipo === "sim_nao" ? "Sim/Não" : "Texto curto"}
                          </Badge>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setCamposPersonalizados(camposPersonalizados.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Adicionar nova pergunta */}
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                    <p className="text-sm font-medium">Adicionar pergunta personalizada</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ex: Qual seu interesse?"
                        value={novoCampoLabel}
                        onChange={(e) => setNovoCampoLabel(e.target.value)}
                        className="flex-1"
                      />
                      <Select value={novoCampoTipo} onValueChange={(v: "text" | "textarea" | "multipla_escolha" | "sim_nao") => {
                        setNovoCampoTipo(v);
                        if (v === "multipla_escolha") {
                          setNovasOpcoes(["", ""]);
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
                    {novoCampoTipo === "multipla_escolha" && (
                      <div className="space-y-2 pl-2 border-l-2 border-muted">
                        <p className="text-xs text-muted-foreground">Adicione as opções de resposta:</p>
                        {novasOpcoes.map((opcao, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              placeholder={`Opção ${idx + 1}`}
                              value={opcao}
                              onChange={(e) => {
                                const updated = [...novasOpcoes];
                                updated[idx] = e.target.value;
                                setNovasOpcoes(updated);
                              }}
                              className="flex-1 h-8 text-sm"
                            />
                            {novasOpcoes.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setNovasOpcoes(novasOpcoes.filter((_, i) => i !== idx));
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                        {novasOpcoes.length < 6 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setNovasOpcoes([...novasOpcoes, ""])}
                          >
                            <Plus className="h-3 w-3 mr-1" />
                            Adicionar opção
                          </Button>
                        )}
                      </div>
                    )}
                    
                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          if (novoCampoLabel.trim()) {
                            // Validar opções para múltipla escolha
                            if (novoCampoTipo === "multipla_escolha") {
                              const opcoesValidas = novasOpcoes.filter(o => o.trim());
                              if (opcoesValidas.length < 2) {
                                return; // Precisa de pelo menos 2 opções
                              }
                            }
                            
                            const novoId = `custom_${Date.now()}`;
                            const novoCampo: CampoPersonalizado = {
                              id: novoId,
                              label: novoCampoLabel.trim(),
                              tipo: novoCampoTipo as CampoPersonalizado["tipo"],
                              obrigatorio: true,
                            };
                            
                            if (novoCampoTipo === "multipla_escolha") {
                              novoCampo.opcoes = novasOpcoes.filter(o => o.trim());
                            }
                            
                            setCamposPersonalizados([...camposPersonalizados, novoCampo]);
                            setNovoCampoLabel("");
                            setNovoCampoTipo("text");
                            setNovasOpcoes(["", ""]);
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar pergunta
                      </Button>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Selecione os campos padrão e/ou adicione perguntas personalizadas
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="imagem_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL da Imagem (opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Imagem exibida no topo do formulário
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

      {formularios?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhum formulário criado</h3>
            <p className="text-sm text-muted-foreground">
              Crie seu primeiro formulário para capturar leads
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="formularios">
          <TabsList>
            <TabsTrigger value="formularios">Formulários</TabsTrigger>
            <TabsTrigger value="respostas" disabled={!selectedFormId}>
              <Users className="h-4 w-4 mr-1" />
              Respostas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="formularios" className="mt-4">
            <div className="grid gap-4">
              {formularios?.map((formulario) => (
                <Card 
                  key={formulario.id} 
                  className={`cursor-pointer transition-colors ${
                    selectedFormId === formulario.id ? "ring-2 ring-primary" : ""
                  } ${!formulario.ativo ? "opacity-60" : ""}`}
                  onClick={() => setSelectedFormId(formulario.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CardTitle className="text-base">{formulario.nome}</CardTitle>
                        <Badge variant="outline">
                          {formulario.campos.length} campos
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(formulario)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyFormUrl(formulario.id)}
                          title="Copiar link"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(getFormUrl(formulario.id), "_blank")}
                          title="Visualizar"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Switch
                          checked={formulario.ativo}
                          onCheckedChange={(ativo) =>
                            toggleFormulario.mutate({ id: formulario.id, ativo })
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteFormulario.mutate(formulario.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Título: {formulario.titulo_pagina}</span>
                      <span>•</span>
                      <span
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: formulario.cor_primaria }}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="respostas" className="mt-4">
            {selectedFormId ? (
              <div className="space-y-4">
                {/* Header com título do formulário */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Users className="h-5 w-5" />
                          Respostas: {formularios?.find(f => f.id === selectedFormId)?.nome}
                        </CardTitle>
                        <CardDescription>
                          {respostas?.length || 0} resposta{respostas?.length !== 1 ? 's' : ''} recebida{respostas?.length !== 1 ? 's' : ''}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {formularios?.find(f => f.id === selectedFormId)?.titulo_pagina}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>

                {loadingRespostas ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : respostas?.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">Nenhuma resposta ainda</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        As respostas aparecerão aqui quando alguém preencher o formulário
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {respostas?.map((resposta) => {
                      const phoneFormatted = resposta.telefone ? formatPhoneDisplay(resposta.telefone) : null;
                      const { countryCode } = resposta.telefone ? extractCountryCode(resposta.telefone) : { countryCode: "55" };
                      const countryFlag = countries.find(c => c.dialCode === countryCode)?.flag || "🇧🇷";
                      
                      return (
                        <Card key={resposta.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-3">
                                {/* Nome */}
                                {resposta.nome && (
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="font-medium">{resposta.nome}</span>
                                  </div>
                                )}
                                
                                <div className="flex flex-wrap gap-4 text-sm">
                                  {/* Telefone */}
                                  {resposta.telefone && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <span className="text-base">{countryFlag}</span>
                                      <Phone className="h-3.5 w-3.5" />
                                      <span>{phoneFormatted}</span>
                                    </div>
                                  )}
                                  
                                  {/* Email */}
                                  {resposta.email && (
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                      <Mail className="h-3.5 w-3.5" />
                                      <span>{resposta.email}</span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Dados extras */}
                                {resposta.dados_extras && Object.keys(resposta.dados_extras).length > 0 && (
                                  <div className="pt-2 border-t space-y-1">
                                    {Object.entries(resposta.dados_extras).map(([key, value]) => (
                                      <div key={key} className="text-sm">
                                        <span className="text-muted-foreground">{key}:</span>{" "}
                                        <span>{value}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              
                              {/* Data */}
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                                <Calendar className="h-3.5 w-3.5" />
                                {format(new Date(resposta.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Selecione um formulário</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique em um formulário na aba "Formulários" para ver suas respostas
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
