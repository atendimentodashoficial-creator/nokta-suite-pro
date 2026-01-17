import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface CampoPersonalizado {
  id: string;
  label: string;
  tipo: "text" | "tel" | "email" | "textarea" | "multipla_escolha" | "sim_nao";
  obrigatorio: boolean;
  opcoes?: string[];
}

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formulario: Formulario | null;
}

const camposPadrao = [
  { id: "nome", label: "Nome" },
  { id: "telefone", label: "Telefone" },
  { id: "email", label: "Email" },
];

export default function InstagramFormularioDialog({ open, onOpenChange, formulario }: Props) {
  const [nome, setNome] = useState("");
  const [tituloPagina, setTituloPagina] = useState("");
  const [subtituloPagina, setSubtituloPagina] = useState("");
  const [textoBotao, setTextoBotao] = useState("");
  const [mensagemSucesso, setMensagemSucesso] = useState("");
  const [corPrimaria, setCorPrimaria] = useState("#00D4FF");
  const [imagemUrl, setImagemUrl] = useState("");
  const [botaoSucessoTexto, setBotaoSucessoTexto] = useState("");
  const [botaoSucessoUrl, setBotaoSucessoUrl] = useState("");
  const [selectedCampos, setSelectedCampos] = useState<string[]>(["nome", "telefone", "email"]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [novoCampoLabel, setNovoCampoLabel] = useState("");
  const [novoCampoTipo, setNovoCampoTipo] = useState<"text" | "textarea" | "multipla_escolha" | "sim_nao">("text");
  const [novasOpcoes, setNovasOpcoes] = useState<string[]>(["", ""]);
  const [simNaoOpcoes, setSimNaoOpcoes] = useState<[string, string]>(["Sim", "Não"]);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (formulario) {
      setNome(formulario.nome);
      setTituloPagina(formulario.titulo_pagina);
      setSubtituloPagina(formulario.subtitulo_pagina || "");
      setTextoBotao(formulario.texto_botao);
      setMensagemSucesso(formulario.mensagem_sucesso);
      setCorPrimaria(formulario.cor_primaria);
      setImagemUrl(formulario.imagem_url || "");
      setBotaoSucessoTexto(formulario.botao_sucesso_texto || "");
      setBotaoSucessoUrl(formulario.botao_sucesso_url || "");
      
      // Parse campos
      const camposPadraoIds: string[] = [];
      const camposCustom: CampoPersonalizado[] = [];
      
      formulario.campos.forEach(c => {
        if (typeof c === "string") {
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
    } else {
      resetForm();
    }
  }, [formulario, open]);

  const resetForm = () => {
    setNome("");
    setTituloPagina("");
    setSubtituloPagina("");
    setTextoBotao("");
    setMensagemSucesso("");
    setCorPrimaria("#00D4FF");
    setImagemUrl("");
    setBotaoSucessoTexto("");
    setBotaoSucessoUrl("");
    setSelectedCampos(["nome", "telefone", "email"]);
    setCamposPersonalizados([]);
    setNovoCampoLabel("");
    setNovoCampoTipo("text");
    setNovasOpcoes(["", ""]);
    setSimNaoOpcoes(["Sim", "Não"]);
  };

  const createFormulario = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      const todosCampos = [...selectedCampos, ...camposPersonalizados.map(c => JSON.stringify(c))];
      if (todosCampos.length === 0) {
        throw new Error("Selecione ao menos um campo");
      }
      
      const { error } = await supabase.from("instagram_formularios").insert({
        user_id: user.id,
        nome,
        titulo_pagina: tituloPagina,
        subtitulo_pagina: subtituloPagina || null,
        texto_botao: textoBotao,
        mensagem_sucesso: mensagemSucesso,
        cor_primaria: corPrimaria || "#00D4FF",
        imagem_url: imagemUrl || null,
        campos: todosCampos,
        ativo: true,
        botao_sucesso_texto: botaoSucessoTexto || null,
        botao_sucesso_url: botaoSucessoUrl || null,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
      toast.success("Formulário criado com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao criar formulário:", error);
      toast.error("Erro ao criar formulário");
    },
  });

  const updateFormulario = useMutation({
    mutationFn: async () => {
      if (!formulario) return;
      
      const todosCampos = [...selectedCampos, ...camposPersonalizados.map(c => JSON.stringify(c))];
      
      const { error } = await supabase.from("instagram_formularios").update({
        nome,
        titulo_pagina: tituloPagina,
        subtitulo_pagina: subtituloPagina || null,
        texto_botao: textoBotao,
        mensagem_sucesso: mensagemSucesso,
        cor_primaria: corPrimaria || "#00D4FF",
        imagem_url: imagemUrl || null,
        campos: todosCampos,
        botao_sucesso_texto: botaoSucessoTexto || null,
        botao_sucesso_url: botaoSucessoUrl || null,
      }).eq("id", formulario.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-formularios"] });
      toast.success("Formulário atualizado com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao atualizar formulário:", error);
      toast.error("Erro ao atualizar formulário");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nome || !tituloPagina || !textoBotao || !mensagemSucesso) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    
    if (formulario) {
      updateFormulario.mutate();
    } else {
      createFormulario.mutate();
    }
  };

  const addCampoPersonalizado = () => {
    if (!novoCampoLabel.trim()) return;
    
    let opcoes: string[] | undefined;
    if (novoCampoTipo === "multipla_escolha") {
      opcoes = novasOpcoes.filter(o => o.trim());
      if (opcoes.length < 2) {
        toast.error("Adicione pelo menos 2 opções");
        return;
      }
    } else if (novoCampoTipo === "sim_nao") {
      opcoes = simNaoOpcoes;
    }
    
    const novoCampo: CampoPersonalizado = {
      id: `custom_${Date.now()}`,
      label: novoCampoLabel,
      tipo: novoCampoTipo,
      obrigatorio: true,
      ...(opcoes && { opcoes }),
    };
    
    setCamposPersonalizados([...camposPersonalizados, novoCampo]);
    setNovoCampoLabel("");
    setNovoCampoTipo("text");
    setNovasOpcoes(["", ""]);
    setSimNaoOpcoes(["Sim", "Não"]);
  };

  const removeCampoPersonalizado = (id: string) => {
    setCamposPersonalizados(camposPersonalizados.filter(c => c.id !== id));
  };

  const isPending = createFormulario.isPending || updateFormulario.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{formulario ? "Editar Formulário" : "Novo Formulário"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div className="space-y-2">
            <Label>Nome do Formulário *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Captura E-book"
            />
            <p className="text-xs text-muted-foreground">Apenas para organização interna</p>
          </div>

          <div className="space-y-2">
            <Label>Título da Página *</Label>
            <Input
              value={tituloPagina}
              onChange={(e) => setTituloPagina(e.target.value)}
              placeholder="Preencha seus dados"
            />
          </div>

          <div className="space-y-2">
            <Label>Subtítulo (opcional)</Label>
            <Input
              value={subtituloPagina}
              onChange={(e) => setSubtituloPagina(e.target.value)}
              placeholder="Receba seu material exclusivo"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Texto do Botão *</Label>
              <Input
                value={textoBotao}
                onChange={(e) => setTextoBotao(e.target.value)}
                placeholder="Enviar"
              />
            </div>

            <div className="space-y-2">
              <Label>Cor do Botão</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  className="w-12 h-10 p-1"
                  value={corPrimaria}
                  onChange={(e) => setCorPrimaria(e.target.value)}
                />
                <Input
                  value={corPrimaria}
                  onChange={(e) => setCorPrimaria(e.target.value)}
                  placeholder="#00D4FF"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Mensagem de Sucesso *</Label>
            <Textarea
              value={mensagemSucesso}
              onChange={(e) => setMensagemSucesso(e.target.value)}
              placeholder="Obrigado! Seus dados foram enviados com sucesso."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Texto do Botão de Sucesso</Label>
              <Input
                value={botaoSucessoTexto}
                onChange={(e) => setBotaoSucessoTexto(e.target.value)}
                placeholder="Ex: Acessar Material"
              />
              <p className="text-xs text-muted-foreground">Opcional - botão exibido após envio</p>
            </div>

            <div className="space-y-2">
              <Label>Link do Botão</Label>
              <Input
                value={botaoSucessoUrl}
                onChange={(e) => setBotaoSucessoUrl(e.target.value)}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">URL para onde o botão redireciona</p>
            </div>
          </div>

          {/* Campos padrão */}
          <div className="space-y-3">
            <Label>Campos do Formulário</Label>
            <div className="space-y-2">
              {camposPadrao.map((campo) => (
                <div key={campo.id} className="flex items-center gap-2">
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
                  <Label htmlFor={campo.id} className="cursor-pointer">{campo.label}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* Campos personalizados */}
          {camposPersonalizados.length > 0 && (
            <div className="space-y-2">
              <Label>Campos Personalizados</Label>
              {camposPersonalizados.map((campo) => (
                <div key={campo.id} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{campo.label}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {campo.tipo === "multipla_escolha" ? "Múltipla Escolha" : 
                       campo.tipo === "sim_nao" ? "Sim/Não" : 
                       campo.tipo}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeCampoPersonalizado(campo.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Adicionar campo personalizado */}
          <div className="space-y-3 p-3 border rounded-lg">
            <Label>Adicionar Campo Personalizado</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={novoCampoLabel}
                onChange={(e) => setNovoCampoLabel(e.target.value)}
                placeholder="Nome do campo"
              />
              <Select value={novoCampoTipo} onValueChange={(v) => setNovoCampoTipo(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="textarea">Texto Longo</SelectItem>
                  <SelectItem value="multipla_escolha">Múltipla Escolha</SelectItem>
                  <SelectItem value="sim_nao">Sim/Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {novoCampoTipo === "multipla_escolha" && (
              <div className="space-y-2">
                <Label className="text-sm">Opções</Label>
                {novasOpcoes.map((opcao, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={opcao}
                      onChange={(e) => {
                        const novas = [...novasOpcoes];
                        novas[index] = e.target.value;
                        setNovasOpcoes(novas);
                      }}
                      placeholder={`Opção ${index + 1}`}
                    />
                    {index >= 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setNovasOpcoes(novasOpcoes.filter((_, i) => i !== index));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNovasOpcoes([...novasOpcoes, ""])}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Opção
                </Button>
              </div>
            )}

            {novoCampoTipo === "sim_nao" && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={simNaoOpcoes[0]}
                  onChange={(e) => setSimNaoOpcoes([e.target.value, simNaoOpcoes[1]])}
                  placeholder="Texto para Sim"
                />
                <Input
                  value={simNaoOpcoes[1]}
                  onChange={(e) => setSimNaoOpcoes([simNaoOpcoes[0], e.target.value])}
                  placeholder="Texto para Não"
                />
              </div>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addCampoPersonalizado}
              disabled={!novoCampoLabel.trim()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Campo
            </Button>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : formulario ? "Salvar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
