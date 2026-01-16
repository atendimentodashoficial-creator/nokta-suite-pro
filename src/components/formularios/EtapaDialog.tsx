import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateEtapa, useUpdateEtapa, FormularioEtapa } from "@/hooks/useFormularios";

interface EtapaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  etapa: FormularioEtapa | null;
  nextOrdem: number;
}

interface CampoConfig {
  id: string;
  label: string;
  tipo: string;
  obrigatorio: boolean;
}

export default function EtapaDialog({ open, onOpenChange, templateId, etapa, nextOrdem }: EtapaDialogProps) {
  const [ordem, setOrdem] = useState(nextOrdem);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState<string>("texto");
  const [obrigatorio, setObrigatorio] = useState(true);
  const [ativo, setAtivo] = useState(true);
  const [opcoes, setOpcoes] = useState<string[]>([""]);
  const [campos, setCampos] = useState<CampoConfig[]>([]);

  const createEtapa = useCreateEtapa();
  const updateEtapa = useUpdateEtapa();
  
  const isEditing = !!etapa;
  const isPending = createEtapa.isPending || updateEtapa.isPending;

  useEffect(() => {
    if (etapa) {
      setOrdem(etapa.ordem);
      setTitulo(etapa.titulo);
      setDescricao(etapa.descricao || "");
      setTipo(etapa.tipo);
      setObrigatorio(etapa.obrigatorio);
      setAtivo(etapa.ativo);
      
      const config = etapa.configuracao as Record<string, unknown>;
      if (config.opcoes) {
        setOpcoes(config.opcoes as string[]);
      }
      if (config.campos) {
        setCampos(config.campos as CampoConfig[]);
      }
    } else {
      setOrdem(nextOrdem);
      setTitulo("");
      setDescricao("");
      setTipo("texto");
      setObrigatorio(true);
      setAtivo(true);
      setOpcoes([""]);
      setCampos([]);
    }
  }, [etapa, nextOrdem, open]);

  const handleAddOpcao = () => {
    setOpcoes([...opcoes, ""]);
  };

  const handleRemoveOpcao = (index: number) => {
    setOpcoes(opcoes.filter((_, i) => i !== index));
  };

  const handleOpcaoChange = (index: number, value: string) => {
    const newOpcoes = [...opcoes];
    newOpcoes[index] = value;
    setOpcoes(newOpcoes);
  };

  const handleAddCampo = () => {
    setCampos([...campos, { id: crypto.randomUUID(), label: "", tipo: "texto", obrigatorio: true }]);
  };

  const handleRemoveCampo = (index: number) => {
    setCampos(campos.filter((_, i) => i !== index));
  };

  const handleCampoChange = (index: number, field: keyof CampoConfig, value: string | boolean) => {
    const newCampos = [...campos];
    newCampos[index] = { ...newCampos[index], [field]: value };
    setCampos(newCampos);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const configuracao: Record<string, unknown> = {};
    
    if (tipo === "opcoes" || tipo === "multipla_escolha") {
      configuracao.opcoes = opcoes.filter(o => o.trim());
    }
    if (tipo === "multiplos_campos") {
      configuracao.campos = campos.filter(c => c.label.trim());
    }

    const data = {
      template_id: templateId,
      ordem,
      titulo,
      descricao: descricao || null,
      tipo,
      obrigatorio,
      ativo,
      configuracao,
    };

    try {
      if (isEditing) {
        await updateEtapa.mutateAsync({ id: etapa.id, ...data });
      } else {
        await createEtapa.mutateAsync(data);
      }
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Etapa" : "Nova Etapa"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ordem">Ordem *</Label>
              <Input
                id="ordem"
                type="number"
                min={1}
                value={ordem}
                onChange={(e) => setOrdem(parseInt(e.target.value) || 1)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Input *</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="textarea">Texto Longo</SelectItem>
                  <SelectItem value="numero">Número</SelectItem>
                  <SelectItem value="opcoes">Opções (escolha única)</SelectItem>
                  <SelectItem value="multipla_escolha">Múltipla Escolha</SelectItem>
                  <SelectItem value="multiplos_campos">Múltiplos Campos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="titulo">Título/Pergunta *</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Qual seu nome?"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição (opcional)</Label>
            <Textarea
              id="descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Texto explicativo para o usuário..."
              rows={2}
            />
          </div>

          {(tipo === "opcoes" || tipo === "multipla_escolha") && (
            <div className="space-y-3">
              <Label>Opções de Escolha</Label>
              {opcoes.map((opcao, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={opcao}
                    onChange={(e) => handleOpcaoChange(index, e.target.value)}
                    placeholder={`Opção ${index + 1}`}
                  />
                  {opcoes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveOpcao(index)}
                      className="text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddOpcao}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Opção
              </Button>
            </div>
          )}

          {tipo === "multiplos_campos" && (
            <div className="space-y-3">
              <Label>Campos do Formulário</Label>
              {campos.map((campo, index) => (
                <div key={campo.id} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <Input
                      value={campo.label}
                      onChange={(e) => handleCampoChange(index, "label", e.target.value)}
                      placeholder="Nome do campo"
                    />
                    <Select
                      value={campo.tipo}
                      onValueChange={(value) => handleCampoChange(index, "tipo", value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="texto">Texto</SelectItem>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="telefone">Telefone</SelectItem>
                        <SelectItem value="numero">Número</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={campo.obrigatorio}
                        onCheckedChange={(checked) => handleCampoChange(index, "obrigatorio", checked)}
                      />
                      <span className="text-sm">Obrigatório</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveCampo(index)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={handleAddCampo}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Campo
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={obrigatorio}
                  onCheckedChange={setObrigatorio}
                />
                <Label>Campo Obrigatório</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={ativo}
                  onCheckedChange={setAtivo}
                />
                <Label>Etapa Ativa</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!titulo || isPending}>
              {isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar Etapa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
