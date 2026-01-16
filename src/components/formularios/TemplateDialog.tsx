import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCreateTemplate, useUpdateTemplate, FormularioTemplate } from "@/hooks/useFormularios";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FormularioTemplate | null;
}

export default function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [corPrimaria, setCorPrimaria] = useState("#8B5CF6");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paginaObrigadoTitulo, setPaginaObrigadoTitulo] = useState("Obrigado!");
  const [paginaObrigadoMensagem, setPaginaObrigadoMensagem] = useState("Recebemos suas informações. Em breve entraremos em contato.");
  const [paginaObrigadoCtaTexto, setPaginaObrigadoCtaTexto] = useState("");
  const [paginaObrigadoCtaLink, setPaginaObrigadoCtaLink] = useState("");

  const generateSlug = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  };

  const handleNomeChange = (value: string) => {
    setNome(value);
    if (!template) {
      setSlug(generateSlug(value));
    }
  };
  
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  
  const isEditing = !!template;
  const isPending = createTemplate.isPending || updateTemplate.isPending;

  useEffect(() => {
    if (template) {
      setNome(template.nome);
      setSlug(template.slug || "");
      setDescricao(template.descricao || "");
      setStatus(template.status as "ativo" | "inativo");
      setCorPrimaria(template.cor_primaria || "#8B5CF6");
      setLogoUrl(template.logo_url || null);
      setPaginaObrigadoTitulo(template.pagina_obrigado_titulo || "Obrigado!");
      setPaginaObrigadoMensagem(template.pagina_obrigado_mensagem || "");
      setPaginaObrigadoCtaTexto(template.pagina_obrigado_cta_texto || "");
      setPaginaObrigadoCtaLink(template.pagina_obrigado_cta_link || "");
    } else {
      setNome("");
      setSlug("");
      setDescricao("");
      setStatus("ativo");
      setCorPrimaria("#8B5CF6");
      setLogoUrl(null);
      setPaginaObrigadoTitulo("Obrigado!");
      setPaginaObrigadoMensagem("Recebemos suas informações. Em breve entraremos em contato.");
      setPaginaObrigadoCtaTexto("");
      setPaginaObrigadoCtaLink("");
    }
  }, [template, open]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB");
      return;
    }

    setUploadingLogo(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `formularios/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(fileName);

      setLogoUrl(urlData.publicUrl);
      toast.success("Logo enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar logo:", error);
      toast.error("Erro ao enviar logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = () => {
    setLogoUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      nome,
      slug: slug || generateSlug(nome),
      descricao: descricao || null,
      status,
      cor_primaria: corPrimaria,
      logo_url: logoUrl,
      pagina_obrigado_titulo: paginaObrigadoTitulo,
      pagina_obrigado_mensagem: paginaObrigadoMensagem,
      pagina_obrigado_cta_texto: paginaObrigadoCtaTexto || null,
      pagina_obrigado_cta_link: paginaObrigadoCtaLink || null,
    };

    try {
      if (isEditing) {
        await updateTemplate.mutateAsync({ id: template.id, ...data });
      } else {
        await createTemplate.mutateAsync(data);
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
          <DialogTitle>{isEditing ? "Editar Template" : "Novo Template"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="geral" className="flex-1">Informações Gerais</TabsTrigger>
              <TabsTrigger value="obrigado" className="flex-1">Página de Obrigado</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Template *</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  placeholder="Ex: Formulário de Contato"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Link do Formulário *</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {window.location.origin}/formulario/
                  </span>
                  <Input
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(generateSlug(e.target.value))}
                    placeholder="meu-formulario"
                    required
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  URL amigável para compartilhar o formulário
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Descreva o propósito deste formulário..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Logo do Formulário</Label>
                <div className="flex items-center gap-4">
                  {logoUrl ? (
                    <div className="relative">
                      <img 
                        src={logoUrl} 
                        alt="Logo" 
                        className="h-16 w-auto max-w-32 object-contain rounded border"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="h-16"
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-2" />
                      )}
                      Enviar Logo
                    </Button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Imagem até 2MB. Será exibida no topo do formulário.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor">Cor Primária</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="cor"
                    type="color"
                    value={corPrimaria}
                    onChange={(e) => setCorPrimaria(e.target.value)}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input
                    value={corPrimaria}
                    onChange={(e) => setCorPrimaria(e.target.value)}
                    placeholder="#8B5CF6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Status</Label>
                  <p className="text-sm text-muted-foreground">
                    Templates inativos não recebem novos leads
                  </p>
                </div>
                <Switch
                  checked={status === "ativo"}
                  onCheckedChange={(checked) => setStatus(checked ? "ativo" : "inativo")}
                />
              </div>
            </TabsContent>

            <TabsContent value="obrigado" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="obrigadoTitulo">Título</Label>
                <Input
                  id="obrigadoTitulo"
                  value={paginaObrigadoTitulo}
                  onChange={(e) => setPaginaObrigadoTitulo(e.target.value)}
                  placeholder="Obrigado!"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="obrigadoMensagem">Mensagem</Label>
                <Textarea
                  id="obrigadoMensagem"
                  value={paginaObrigadoMensagem}
                  onChange={(e) => setPaginaObrigadoMensagem(e.target.value)}
                  placeholder="Recebemos suas informações..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ctaTexto">Texto do Botão (opcional)</Label>
                <Input
                  id="ctaTexto"
                  value={paginaObrigadoCtaTexto}
                  onChange={(e) => setPaginaObrigadoCtaTexto(e.target.value)}
                  placeholder="Ex: Voltar ao Site"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ctaLink">Link do Botão (opcional)</Label>
                <Input
                  id="ctaLink"
                  value={paginaObrigadoCtaLink}
                  onChange={(e) => setPaginaObrigadoCtaLink(e.target.value)}
                  placeholder="https://exemplo.com"
                />
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Preview</h4>
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: corPrimaria + "20" }}>
                    <svg className="w-8 h-8" style={{ color: corPrimaria }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold">{paginaObrigadoTitulo || "Obrigado!"}</h3>
                  <p className="text-muted-foreground text-sm">{paginaObrigadoMensagem}</p>
                  {paginaObrigadoCtaTexto && (
                    <button 
                      type="button"
                      className="px-4 py-2 rounded-lg text-white text-sm"
                      style={{ backgroundColor: corPrimaria }}
                    >
                      {paginaObrigadoCtaTexto}
                    </button>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!nome || isPending}>
              {isPending ? "Salvando..." : isEditing ? "Salvar" : "Criar Template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
