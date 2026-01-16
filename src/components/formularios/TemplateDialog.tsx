import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateTemplate, useUpdateTemplate, FormularioTemplate, MediaItem } from "@/hooks/useFormularios";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, X, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Poppins", label: "Poppins" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Nunito", label: "Nunito" },
  { value: "Raleway", label: "Raleway" },
  { value: "Source Sans Pro", label: "Source Sans Pro" },
  { value: "PT Sans", label: "PT Sans" },
];

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FormularioTemplate | null;
}

export default function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [layoutTipo, setLayoutTipo] = useState<"multi_step" | "single_page">("multi_step");
  const [corPrimaria, setCorPrimaria] = useState("#8B5CF6");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [cardColor, setCardColor] = useState("#ffffff");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [textColor, setTextColor] = useState("#1f2937");
  const [buttonTextColor, setButtonTextColor] = useState("#ffffff");
  const [borderRadius, setBorderRadius] = useState("12");
  const [progressBackgroundColor, setProgressBackgroundColor] = useState("#e5e5e5");
  const [cardBorderColor, setCardBorderColor] = useState("transparent");
  const [backButtonColor, setBackButtonColor] = useState("#6b7280");
  const [backButtonTextColor, setBackButtonTextColor] = useState("#ffffff");
  const [answerTextColor, setAnswerTextColor] = useState("#1f2937");
  const [errorTextColor, setErrorTextColor] = useState("#ef4444");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paginaObrigadoTitulo, setPaginaObrigadoTitulo] = useState("Obrigado!");
  const [paginaObrigadoMensagem, setPaginaObrigadoMensagem] = useState("Recebemos suas informações. Em breve entraremos em contato.");
  const [paginaObrigadoCtaTexto, setPaginaObrigadoCtaTexto] = useState("");
  const [paginaObrigadoCtaLink, setPaginaObrigadoCtaLink] = useState("");
  const [paginaObrigadoVideoUrl, setPaginaObrigadoVideoUrl] = useState("");
  const [paginaObrigadoVideoTitulo, setPaginaObrigadoVideoTitulo] = useState("");
  const [paginaObrigadoVideoSubtitulo, setPaginaObrigadoVideoSubtitulo] = useState("");
  const [paginaObrigadoVideoPosicao, setPaginaObrigadoVideoPosicao] = useState<"acima" | "abaixo">("abaixo");
  const [paginaObrigadoImagemUrl, setPaginaObrigadoImagemUrl] = useState<string | null>(null);
  const [uploadingObrigadoImagem, setUploadingObrigadoImagem] = useState(false);
  const obrigadoImageInputRef = useRef<HTMLInputElement>(null);
  
  // Arrays for multiple images/videos
  const [imagens, setImagens] = useState<MediaItem[]>([]);
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [uploadingImagemIndex, setUploadingImagemIndex] = useState<number | null>(null);
  const imagemInputRefs = useRef<(HTMLInputElement | null)[]>([]);

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
      setLayoutTipo((template as any).layout_tipo || "multi_step");
      setCorPrimaria(template.cor_primaria || "#8B5CF6");
      setBackgroundColor(template.background_color || "#ffffff");
      setCardColor(template.card_color || "#ffffff");
      setFontFamily(template.font_family || "Inter");
      setTextColor(template.text_color || "#1f2937");
      setButtonTextColor(template.button_text_color || "#ffffff");
      setBorderRadius(template.border_radius || "12");
      setProgressBackgroundColor((template as any).progress_background_color || "#e5e5e5");
      setCardBorderColor((template as any).card_border_color || "transparent");
      setBackButtonColor((template as any).back_button_color || "#6b7280");
      setBackButtonTextColor((template as any).back_button_text_color || "#ffffff");
      setAnswerTextColor((template as any).answer_text_color || "#1f2937");
      setErrorTextColor((template as any).error_text_color || "#ef4444");
      setLogoUrl(template.logo_url || null);
      setPaginaObrigadoTitulo(template.pagina_obrigado_titulo || "Obrigado!");
      setPaginaObrigadoMensagem(template.pagina_obrigado_mensagem || "");
      setPaginaObrigadoCtaTexto(template.pagina_obrigado_cta_texto || "");
      setPaginaObrigadoCtaLink(template.pagina_obrigado_cta_link || "");
      setPaginaObrigadoVideoUrl(template.pagina_obrigado_video_url || "");
      setPaginaObrigadoVideoTitulo((template as any).pagina_obrigado_video_titulo || "");
      setPaginaObrigadoVideoSubtitulo((template as any).pagina_obrigado_video_subtitulo || "");
      setPaginaObrigadoVideoPosicao((template as any).pagina_obrigado_video_posicao || "abaixo");
      setPaginaObrigadoImagemUrl(template.pagina_obrigado_imagem_url || null);
      
      // Load arrays - parse from JSON if needed
      const loadedImagens = (template as any).pagina_obrigado_imagens;
      setImagens(Array.isArray(loadedImagens) ? loadedImagens : []);
      
      const loadedVideos = (template as any).pagina_obrigado_videos;
      setVideos(Array.isArray(loadedVideos) ? loadedVideos : []);
    } else {
      setNome("");
      setSlug("");
      setDescricao("");
      setStatus("ativo");
      setLayoutTipo("multi_step");
      setCorPrimaria("#8B5CF6");
      setBackgroundColor("#ffffff");
      setCardColor("#ffffff");
      setFontFamily("Inter");
      setTextColor("#1f2937");
      setButtonTextColor("#ffffff");
      setBorderRadius("12");
      setProgressBackgroundColor("#e5e5e5");
      setCardBorderColor("transparent");
      setBackButtonColor("#6b7280");
      setBackButtonTextColor("#ffffff");
      setAnswerTextColor("#1f2937");
      setErrorTextColor("#ef4444");
      setLogoUrl(null);
      setPaginaObrigadoTitulo("Obrigado!");
      setPaginaObrigadoMensagem("Recebemos suas informações. Em breve entraremos em contato.");
      setPaginaObrigadoCtaTexto("");
      setPaginaObrigadoCtaLink("");
      setPaginaObrigadoVideoUrl("");
      setPaginaObrigadoVideoTitulo("");
      setPaginaObrigadoVideoSubtitulo("");
      setPaginaObrigadoVideoPosicao("abaixo");
      setPaginaObrigadoImagemUrl(null);
      setImagens([]);
      setVideos([]);
    }
  }, [template, open]);

  // Handle multiple image upload
  const handleMultiImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploadingImagemIndex(index);
    try {
      const fileExt = file.name.split(".").pop();
      const userId = user?.id || "anonymous";
      const fileName = `${userId}/obrigado-img-${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(fileName);

      const newImagens = [...imagens];
      newImagens[index] = { ...newImagens[index], url: urlData.publicUrl };
      setImagens(newImagens);
      toast.success("Imagem enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar imagem:", error);
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingImagemIndex(null);
    }
  };

  const addImagem = () => {
    setImagens([...imagens, { url: "", titulo: "", subtitulo: "" }]);
  };

  const removeImagem = (index: number) => {
    setImagens(imagens.filter((_, i) => i !== index));
  };

  const updateImagem = (index: number, field: keyof MediaItem, value: string) => {
    const newImagens = [...imagens];
    newImagens[index] = { ...newImagens[index], [field]: value };
    setImagens(newImagens);
  };

  const addVideo = () => {
    setVideos([...videos, { url: "", titulo: "", subtitulo: "" }]);
  };

  const removeVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  const updateVideo = (index: number, field: keyof MediaItem, value: string) => {
    const newVideos = [...videos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setVideos(newVideos);
  };

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
      const userId = user?.id || "anonymous";
      const fileName = `${userId}/${crypto.randomUUID()}.${fileExt}`;

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

  const handleObrigadoImagemUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem válida");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setUploadingObrigadoImagem(true);
    try {
      const fileExt = file.name.split(".").pop();
      const userId = user?.id || "anonymous";
      const fileName = `${userId}/obrigado-${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(fileName);

      setPaginaObrigadoImagemUrl(urlData.publicUrl);
      toast.success("Imagem enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar imagem:", error);
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingObrigadoImagem(false);
    }
  };

  const handleRemoveObrigadoImagem = () => {
    setPaginaObrigadoImagemUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const data = {
      nome,
      slug: slug || generateSlug(nome),
      descricao: descricao || null,
      status,
      layout_tipo: layoutTipo,
      cor_primaria: corPrimaria,
      background_color: backgroundColor,
      card_color: cardColor,
      font_family: fontFamily,
      text_color: textColor,
      button_text_color: buttonTextColor,
      border_radius: borderRadius,
      progress_background_color: progressBackgroundColor,
      card_border_color: cardBorderColor,
      back_button_color: backButtonColor,
      back_button_text_color: backButtonTextColor,
      answer_text_color: answerTextColor,
      error_text_color: errorTextColor,
      logo_url: logoUrl,
      pagina_obrigado_titulo: paginaObrigadoTitulo,
      pagina_obrigado_mensagem: paginaObrigadoMensagem,
      pagina_obrigado_cta_texto: paginaObrigadoCtaTexto || null,
      pagina_obrigado_cta_link: paginaObrigadoCtaLink || null,
      pagina_obrigado_video_url: paginaObrigadoVideoUrl || null,
      pagina_obrigado_video_titulo: paginaObrigadoVideoTitulo || null,
      pagina_obrigado_video_subtitulo: paginaObrigadoVideoSubtitulo || null,
      pagina_obrigado_video_posicao: paginaObrigadoVideoPosicao,
      pagina_obrigado_imagem_url: paginaObrigadoImagemUrl,
      pagina_obrigado_imagens: imagens.filter(img => img.url),
      pagina_obrigado_videos: videos.filter(vid => vid.url),
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
                <Label>Layout do Formulário</Label>
                <Select value={layoutTipo} onValueChange={(v: "multi_step" | "single_page") => setLayoutTipo(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multi_step">Multi-etapas (uma pergunta por vez)</SelectItem>
                    <SelectItem value="single_page">Página única (todas as perguntas juntas)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Escolha como as etapas serão exibidas para o usuário
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

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cor">Cor Primária (Botões)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="cor"
                      type="color"
                      value={corPrimaria}
                      onChange={(e) => setCorPrimaria(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={corPrimaria}
                      onChange={(e) => setCorPrimaria(e.target.value)}
                      placeholder="#8B5CF6"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buttonTextColor">Cor do Texto do Botão</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="buttonTextColor"
                      type="color"
                      value={buttonTextColor}
                      onChange={(e) => setButtonTextColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={buttonTextColor}
                      onChange={(e) => setButtonTextColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bg">Cor de Fundo</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="bg"
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardColor">Cor do Card</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="cardColor"
                      type="color"
                      value={cardColor}
                      onChange={(e) => setCardColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={cardColor}
                      onChange={(e) => setCardColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="textColor">Cor do Texto</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="textColor"
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      placeholder="#1f2937"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fontFamily">Fonte</Label>
                  <Select value={fontFamily} onValueChange={setFontFamily}>
                    <SelectTrigger id="fontFamily">
                      <SelectValue placeholder="Selecione uma fonte" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          <span style={{ fontFamily: font.value }}>{font.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="borderRadius">Arredondamento dos Cantos: {borderRadius}px</Label>
                <Input
                  id="borderRadius"
                  type="range"
                  min="0"
                  max="32"
                  value={borderRadius}
                  onChange={(e) => setBorderRadius(e.target.value)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Quadrado</span>
                  <span>Arredondado</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="progressBg">Fundo da Barra de Progresso</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="progressBg"
                      type="color"
                      value={progressBackgroundColor}
                      onChange={(e) => setProgressBackgroundColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={progressBackgroundColor}
                      onChange={(e) => setProgressBackgroundColor(e.target.value)}
                      placeholder="#e5e5e5"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardBorder">Cor da Borda do Card</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="cardBorder"
                      type="color"
                      value={cardBorderColor === "transparent" ? "#ffffff" : cardBorderColor}
                      onChange={(e) => setCardBorderColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={cardBorderColor}
                      onChange={(e) => setCardBorderColor(e.target.value)}
                      placeholder="transparent"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use "transparent" para sem borda
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="backButtonColor">Cor do Botão Voltar</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="backButtonColor"
                      type="color"
                      value={backButtonColor}
                      onChange={(e) => setBackButtonColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={backButtonColor}
                      onChange={(e) => setBackButtonColor(e.target.value)}
                      placeholder="#6b7280"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backButtonTextColor">Texto do Botão Voltar</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="backButtonTextColor"
                      type="color"
                      value={backButtonTextColor}
                      onChange={(e) => setBackButtonTextColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={backButtonTextColor}
                      onChange={(e) => setBackButtonTextColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="answerTextColor">Cor do Texto das Respostas</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="answerTextColor"
                      type="color"
                      value={answerTextColor}
                      onChange={(e) => setAnswerTextColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={answerTextColor}
                      onChange={(e) => setAnswerTextColor(e.target.value)}
                      placeholder="#1f2937"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cor do texto digitado
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="errorTextColor">Cor das Mensagens de Erro</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="errorTextColor"
                      type="color"
                      value={errorTextColor}
                      onChange={(e) => setErrorTextColor(e.target.value)}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={errorTextColor}
                      onChange={(e) => setErrorTextColor(e.target.value)}
                      placeholder="#ef4444"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cor dos erros de validação
                  </p>
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

              {/* Multiple Images Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Imagens (opcional)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addImagem}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Imagem
                  </Button>
                </div>
                
                {imagens.map((img, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeImagem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex items-center gap-3">
                      {img.url ? (
                        <div className="relative">
                          <img src={img.url} alt={`Imagem ${index + 1}`} className="h-16 w-auto max-w-24 object-contain rounded border" />
                          <button
                            type="button"
                            onClick={() => updateImagem(index, "url", "")}
                            className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => imagemInputRefs.current[index]?.click()}
                          disabled={uploadingImagemIndex === index}
                        >
                          {uploadingImagemIndex === index ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3 mr-1" />
                          )}
                          Upload
                        </Button>
                      )}
                      <input
                        ref={(el) => (imagemInputRefs.current[index] = el)}
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleMultiImageUpload(e, index)}
                        className="hidden"
                      />
                    </div>
                    
                    <Input
                      placeholder="Título da imagem (opcional)"
                      value={img.titulo}
                      onChange={(e) => updateImagem(index, "titulo", e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder="Subtítulo da imagem (opcional)"
                      value={img.subtitulo}
                      onChange={(e) => updateImagem(index, "subtitulo", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                ))}
                
                {imagens.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Clique em "Adicionar Imagem" para incluir imagens na página de obrigado
                  </p>
                )}
              </div>

              {/* Multiple Videos Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Vídeos (opcional)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addVideo}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar Vídeo
                  </Button>
                </div>
                
                {videos.map((video, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2 relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeVideo(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    
                    <Input
                      placeholder="URL do vídeo (YouTube ou Vimeo)"
                      value={video.url}
                      onChange={(e) => updateVideo(index, "url", e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder="Título do vídeo (opcional)"
                      value={video.titulo}
                      onChange={(e) => updateVideo(index, "titulo", e.target.value)}
                      className="text-sm"
                    />
                    <Input
                      placeholder="Subtítulo do vídeo (opcional)"
                      value={video.subtitulo}
                      onChange={(e) => updateVideo(index, "subtitulo", e.target.value)}
                      className="text-sm"
                    />
                  </div>
                ))}
                
                {videos.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Clique em "Adicionar Vídeo" para incluir vídeos do YouTube ou Vimeo
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Posição da Mídia</Label>
                <Select value={paginaObrigadoVideoPosicao} onValueChange={(v: "acima" | "abaixo") => setPaginaObrigadoVideoPosicao(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="acima">Acima do "Obrigado"</SelectItem>
                    <SelectItem value="abaixo">Abaixo do "Obrigado"</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Escolha se as imagens e vídeos aparecem antes ou depois do título
                </p>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2">Preview</h4>
                <div className="text-center space-y-3">
                  {imagens.filter(i => i.url).length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {imagens.filter(i => i.url).map((img, idx) => (
                        <img key={idx} src={img.url} alt={`Preview ${idx}`} className="h-12 w-auto object-contain rounded" />
                      ))}
                    </div>
                  )}
                  {videos.filter(v => v.url).length > 0 && (
                    <div className="text-xs text-muted-foreground bg-background/50 p-2 rounded">
                      🎬 {videos.filter(v => v.url).length} vídeo(s) configurado(s)
                    </div>
                  )}
                  {imagens.filter(i => i.url).length === 0 && videos.filter(v => v.url).length === 0 && (
                    <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: corPrimaria + "20" }}>
                      <svg className="w-8 h-8" style={{ color: corPrimaria }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
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
