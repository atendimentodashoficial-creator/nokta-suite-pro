import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useCreateTemplate, useUpdateTemplate, useFormularioTemplate, FormularioTemplate, MediaItem, FormularioEtapa } from "@/hooks/useFormularios";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Upload, X, Loader2, Plus, Trash2, ChevronDown, Palette, Type, Link2, Film, ImageIcon, GripVertical, Settings2, Heading, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import FormPreviewPanel from "./FormPreviewPanel";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Roboto", label: "Roboto" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Lato", label: "Lato" },
  { value: "Poppins", label: "Poppins" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Nunito", label: "Nunito" },
  { value: "Raleway", label: "Raleway" },
  { value: "'Source Sans 3'", label: "Source Sans" },
  { value: "PT Sans", label: "PT Sans" },
];

const FONT_SIZE_OPTIONS = [
  { value: "12px", label: "12px" },
  { value: "14px", label: "14px" },
  { value: "16px", label: "16px" },
  { value: "18px", label: "18px" },
  { value: "20px", label: "20px" },
  { value: "24px", label: "24px" },
  { value: "28px", label: "28px" },
  { value: "32px", label: "32px" },
  { value: "34px", label: "34px" },
  { value: "36px", label: "36px" },
  { value: "38px", label: "38px" },
  { value: "40px", label: "40px" },
];

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: FormularioTemplate | null;
}

type SectionType = "titulo" | "cta" | "imagens" | "videos";

interface SortableSectionProps {
  id: SectionType;
  sectionType: SectionType;
  imagens: MediaItem[];
  videos: MediaItem[];
  paginaObrigadoTitulo: string;
  setPaginaObrigadoTitulo: (v: string) => void;
  paginaObrigadoMensagem: string;
  setPaginaObrigadoMensagem: (v: string) => void;
  paginaObrigadoCtaTexto: string;
  setPaginaObrigadoCtaTexto: (v: string) => void;
  paginaObrigadoCtaLink: string;
  setPaginaObrigadoCtaLink: (v: string) => void;
  removeImagem: (index: number) => void;
  updateImagem: (index: number, field: string, value: string) => void;
  addSideImage: (index: number) => void;
  removeSideImage: (index: number, sideIndex: number) => void;
  handleMultiImageUpload: (e: React.ChangeEvent<HTMLInputElement>, index: number) => void;
  handleSideImageUpload: (e: React.ChangeEvent<HTMLInputElement>, index: number, sideIndex: number) => void;
  imagemInputRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  uploadingImagemIndex: number | null;
  addImagem: () => void;
  removeVideo: (index: number) => void;
  updateVideo: (index: number, field: string, value: string) => void;
  addSideVideo: (index: number) => void;
  removeSideVideo: (index: number, sideIndex: number) => void;
  updateSideVideo: (index: number, sideIndex: number, value: string) => void;
  addVideo: () => void;
}

function SortableSection({
  id,
  sectionType,
  imagens,
  videos,
  paginaObrigadoTitulo,
  setPaginaObrigadoTitulo,
  paginaObrigadoMensagem,
  setPaginaObrigadoMensagem,
  paginaObrigadoCtaTexto,
  setPaginaObrigadoCtaTexto,
  paginaObrigadoCtaLink,
  setPaginaObrigadoCtaLink,
  removeImagem,
  updateImagem,
  addSideImage,
  removeSideImage,
  handleMultiImageUpload,
  handleSideImageUpload,
  imagemInputRefs,
  uploadingImagemIndex,
  addImagem,
  removeVideo,
  updateVideo,
  addSideVideo,
  removeSideVideo,
  updateSideVideo,
  addVideo,
}: SortableSectionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getSectionConfig = () => {
    switch (sectionType) {
      case "titulo":
        return { icon: Type, title: "Título e Mensagem" };
      case "cta":
        return { icon: Link2, title: "Botão de Ação (CTA)" };
      case "imagens":
        return { icon: ImageIcon, title: `Imagens ${imagens.length > 0 ? `(${imagens.length})` : ''}` };
      case "videos":
        return { icon: Film, title: `Vídeos ${videos.length > 0 ? `(${videos.length})` : ''}` };
    }
  };

  const config = getSectionConfig();
  const Icon = config.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 z-50")}
    >
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="outline" type="button" className="w-full justify-between">
            <div className="flex items-center gap-2 flex-1">
              <button
                type="button"
                className="cursor-grab active:cursor-grabbing touch-none"
                {...attributes}
                {...listeners}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
              </button>
              <Icon className="h-4 w-4" />
              <span>{config.title}</span>
            </div>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-3">
          {sectionType === "titulo" && (
            <>
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
            </>
          )}
          
          {sectionType === "cta" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="ctaTexto">Texto do Botão</Label>
                <Input
                  id="ctaTexto"
                  value={paginaObrigadoCtaTexto}
                  onChange={(e) => setPaginaObrigadoCtaTexto(e.target.value)}
                  placeholder="Ex: Voltar ao Site"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ctaLink">Link do Botão</Label>
                <Input
                  id="ctaLink"
                  value={paginaObrigadoCtaLink}
                  onChange={(e) => setPaginaObrigadoCtaLink(e.target.value)}
                  placeholder="https://exemplo.com"
                />
              </div>
            </>
          )}
          
          {sectionType === "imagens" && (
            <>
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
                  
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      placeholder="Título da imagem (opcional)"
                      value={img.titulo}
                      onChange={(e) => updateImagem(index, "titulo", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Subtítulo</Label>
                    <Input
                      placeholder="Subtítulo da imagem (opcional)"
                      value={img.subtitulo}
                      onChange={(e) => updateImagem(index, "subtitulo", e.target.value)}
                    />
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {img.url ? (
                      <div className="relative group">
                        <img 
                          src={img.url} 
                          alt={`Imagem ${index + 1}`} 
                          className="h-16 w-auto max-w-24 object-contain rounded border" 
                        />
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
                        className="h-16 w-16"
                      >
                        {uploadingImagemIndex === index ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    <input
                      ref={(el) => (imagemInputRefs.current[index] = el)}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleMultiImageUpload(e, index)}
                      className="hidden"
                    />
                    
                    {img.url && img.sideImages?.map((sideImg, sideIndex) => (
                      <div key={sideIndex} className="relative group">
                        {sideImg.url ? (
                          <>
                            <img 
                              src={sideImg.url} 
                              alt={`Imagem ${index + 1}.${sideIndex + 1}`} 
                              className="h-16 w-auto max-w-24 object-contain rounded border" 
                            />
                            <button
                              type="button"
                              onClick={() => removeSideImage(index, sideIndex)}
                              className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/90"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*';
                                input.onchange = (e) => handleSideImageUpload(e as any, index, sideIndex);
                                input.click();
                              }}
                              className="h-16 w-16"
                            >
                              <Upload className="h-4 w-4" />
                            </Button>
                            <button
                              type="button"
                              onClick={() => removeSideImage(index, sideIndex)}
                              className="text-destructive hover:text-destructive/80"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {img.url && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSideImage(index)}
                        className="h-16 w-16 border-dashed"
                        title="Adicionar imagem ao lado"
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addImagem} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Adicionar Imagem
              </Button>
            </>
          )}
          
          {sectionType === "videos" && (
            <>
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
                  
                  <div className="space-y-2">
                    <Label>Título</Label>
                    <Input
                      placeholder="Título do vídeo (opcional)"
                      value={video.titulo}
                      onChange={(e) => updateVideo(index, "titulo", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Subtítulo</Label>
                    <Input
                      placeholder="Subtítulo do vídeo (opcional)"
                      value={video.subtitulo}
                      onChange={(e) => updateVideo(index, "subtitulo", e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>URLs dos Vídeos</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <Input
                          placeholder="URL do vídeo (YouTube ou Vimeo)"
                          value={video.url}
                          onChange={(e) => updateVideo(index, "url", e.target.value)}
                        />
                      </div>
                      
                      {video.sideVideos?.map((sideVideo, sideIndex) => (
                        <div key={sideIndex} className="flex items-center gap-1 flex-1 min-w-[200px]">
                          <Input
                            placeholder="URL do vídeo ao lado"
                            value={sideVideo.url}
                            onChange={(e) => updateSideVideo(index, sideIndex, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeSideVideo(index, sideIndex)}
                            className="text-destructive hover:text-destructive/80 p-1"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSideVideo(index)}
                        className="h-9 px-3 border-dashed"
                        title="Adicionar vídeo ao lado"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addVideo} className="w-full">
                <Plus className="h-4 w-4 mr-1" /> Adicionar Vídeo
              </Button>
            </>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const { user } = useAuth();
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [descricao, setDescricao] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [layoutTipo, setLayoutTipo] = useState<"multi_step" | "single_page">("multi_step");
  const [corPrimaria, setCorPrimaria] = useState("#00d5ff");
  const [backgroundColor, setBackgroundColor] = useState("#003666");
  const [cardColor, setCardColor] = useState("#ffffff");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [textColor, setTextColor] = useState("#003666");
  const [buttonTextColor, setButtonTextColor] = useState("#ffffff");
  const [borderRadius, setBorderRadius] = useState("16");
  const [progressBackgroundColor, setProgressBackgroundColor] = useState("#6b7280");
  const [cardBorderColor, setCardBorderColor] = useState("transparent");
  const [backButtonColor, setBackButtonColor] = useState("#2cb5e2");
  const [backButtonTextColor, setBackButtonTextColor] = useState("#ffffff");
  const [answerTextColor, setAnswerTextColor] = useState("#003666");
  const [errorTextColor, setErrorTextColor] = useState("#ff0000");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // New title fields
  const [titulo, setTitulo] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [tituloCor, setTituloCor] = useState("#00d5ff");
  const [subtituloCor, setSubtituloCor] = useState("#6b7280");
  // Font sizes - Formulário
  const [fonteTamanhoTitulo, setFonteTamanhoTitulo] = useState("24px");
  const [fonteTamanhoSubtitulo, setFonteTamanhoSubtitulo] = useState("16px");
  const [fonteTamanhoPerguntas, setFonteTamanhoPerguntas] = useState("18px");
  const [fonteTamanhoCampos, setFonteTamanhoCampos] = useState("14px");
  const [fonteTamanhoRespostas, setFonteTamanhoRespostas] = useState("16px");
  const [fonteTamanhoBotoes, setFonteTamanhoBotoes] = useState("18px");
  // Font sizes - Página de Obrigado
  const [fonteTamanhoObrigadoTitulo, setFonteTamanhoObrigadoTitulo] = useState("40px");
  const [fonteTamanhoObrigadoTexto, setFonteTamanhoObrigadoTexto] = useState("20px");
  const [fonteTamanhoObrigadoBotao, setFonteTamanhoObrigadoBotao] = useState("32px");
  const [fonteTamanhoMidiaTitulo, setFonteTamanhoMidiaTitulo] = useState("28px");
  const [fonteTamanhoMidiaSubtitulo, setFonteTamanhoMidiaSubtitulo] = useState("18px");
  const [fonteMidia, setFonteMidia] = useState("Inter");
  // Step description styling
  const [fonteTamanhoDescricaoEtapa, setFonteTamanhoDescricaoEtapa] = useState("14px");
  const [fonteTamanhoIndicadorEtapa, setFonteTamanhoIndicadorEtapa] = useState("12px");
  const [fonteTamanhoPaginacao, setFonteTamanhoPaginacao] = useState("14px");
  const [corDescricaoEtapa, setCorDescricaoEtapa] = useState("#6b7280");
  const [corIndicadorEtapa, setCorIndicadorEtapa] = useState("#6b7280");
  const [corPaginacao, setCorPaginacao] = useState("#6b7280");
  // Independent colors for thank you page
  const [corTituloPrincipal, setCorTituloPrincipal] = useState("#1f2937");
  const [corMensagem, setCorMensagem] = useState("#6b7280");
  const [corTituloMidia, setCorTituloMidia] = useState("#1f2937");
  const [corSubtituloMidia, setCorSubtituloMidia] = useState("#6b7280");
  // Independent styling for thank you page (separate from general settings)
  const [obrigadoBackgroundColor, setObrigadoBackgroundColor] = useState("#003666");
  const [obrigadoCardColor, setObrigadoCardColor] = useState("#ffffff");
  const [obrigadoCorPrimaria, setObrigadoCorPrimaria] = useState("#00d5ff");
  const [obrigadoButtonTextColor, setObrigadoButtonTextColor] = useState("#ffffff");
  const [obrigadoCardBorderColor, setObrigadoCardBorderColor] = useState("transparent");
  const [obrigadoBorderRadius, setObrigadoBorderRadius] = useState("16");
  
  // Progress bar visibility
  const [barraProgressoVisivel, setBarraProgressoVisivel] = useState(true);
  
  // Collapsible states
  const [colorsOpen, setColorsOpen] = useState(false);
  const [fontsOpen, setFontsOpen] = useState(false);
  const [buttonsOpen, setButtonsOpen] = useState(false);
  
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
  const [imagensLayout, setImagensLayout] = useState<"horizontal" | "vertical">("vertical");
  const [uploadingImagemIndex, setUploadingImagemIndex] = useState<number | null>(null);
  const imagemInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  
  // Section order for thank you page
  const [sectionOrder, setSectionOrder] = useState<SectionType[]>(["titulo", "cta", "imagens", "videos"]);
  
  // WhatsApp notification settings
  const [whatsappInstanciaId, setWhatsappInstanciaId] = useState<string | null>(null);
  const [whatsappMensagemSucesso, setWhatsappMensagemSucesso] = useState("");
  const [whatsappNotificacaoAtiva, setWhatsappNotificacaoAtiva] = useState(false);
  const [whatsappInstancias, setWhatsappInstancias] = useState<{ id: string; nome: string }[]>([]);
  
  // DnD sensors
  const sectionSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSectionOrder((items) => {
        const oldIndex = items.indexOf(active.id as SectionType);
        const newIndex = items.indexOf(over.id as SectionType);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

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
  
  // Fetch template with etapas for preview
  const { data: templateWithEtapas } = useFormularioTemplate(template?.id);
  
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
      // New title fields
      setTitulo((template as any).titulo || "");
      setSubtitulo((template as any).subtitulo || "");
      setTituloCor((template as any).titulo_cor || "#1f2937");
      setSubtituloCor((template as any).subtitulo_cor || "#6b7280");
      setFonteTamanhoTitulo((template as any).fonte_tamanho_titulo || "28px");
      setFonteTamanhoSubtitulo((template as any).fonte_tamanho_subtitulo || "18px");
      setFonteTamanhoPerguntas((template as any).fonte_tamanho_perguntas || "16px");
      setFonteTamanhoCampos((template as any).fonte_tamanho_campos || "14px");
      setFonteTamanhoRespostas((template as any).fonte_tamanho_respostas || "14px");
      setFonteTamanhoBotoes((template as any).fonte_tamanho_botoes || "18px");
      setFonteTamanhoObrigadoTitulo((template as any).fonte_tamanho_obrigado_titulo || "28px");
      setFonteTamanhoObrigadoTexto((template as any).fonte_tamanho_obrigado_texto || "16px");
      setFonteTamanhoObrigadoBotao((template as any).fonte_tamanho_obrigado_botao || "16px");
      setFonteTamanhoDescricaoEtapa((template as any).fonte_tamanho_descricao_etapa || "14px");
      setFonteTamanhoIndicadorEtapa((template as any).fonte_tamanho_indicador_etapa || "14px");
      setFonteTamanhoPaginacao((template as any).fonte_tamanho_paginacao || "14px");
      setCorDescricaoEtapa((template as any).cor_descricao_etapa || "#6b7280");
      setCorIndicadorEtapa((template as any).cor_indicador_etapa || "#6b7280");
      setCorPaginacao((template as any).cor_paginacao || "#6b7280");
      setBarraProgressoVisivel((template as any).barra_progresso_visivel !== false);
      
      // Independent thank you page styling
      setObrigadoBackgroundColor((template as any).obrigado_background_color || backgroundColor || "#ffffff");
      setObrigadoCardColor((template as any).obrigado_card_color || cardColor || "#ffffff");
      setObrigadoCorPrimaria((template as any).obrigado_cor_primaria || corPrimaria || "#00d5ff");
      setObrigadoButtonTextColor((template as any).obrigado_button_text_color || buttonTextColor || "#ffffff");
      setObrigadoCardBorderColor((template as any).obrigado_card_border_color || cardBorderColor || "transparent");
      setObrigadoBorderRadius((template as any).obrigado_border_radius || borderRadius || "16");
      
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
      
      setImagensLayout((template as any).imagens_layout || "horizontal");
      
      // WhatsApp settings
      setWhatsappInstanciaId((template as any).whatsapp_instancia_id || null);
      setWhatsappMensagemSucesso((template as any).whatsapp_mensagem_sucesso || "");
      setWhatsappNotificacaoAtiva((template as any).whatsapp_notificacao_ativa || false);
    } else {
      setNome("");
      setSlug("");
      setDescricao("");
      setStatus("ativo");
      setLayoutTipo("multi_step");
      setCorPrimaria("#00d5ff");
      setBackgroundColor("#003666");
      setCardColor("#ffffff");
      setFontFamily("Inter");
      setTextColor("#003666");
      setButtonTextColor("#ffffff");
      setBorderRadius("16");
      setProgressBackgroundColor("#6b7280");
      setCardBorderColor("transparent");
      setBackButtonColor("#2cb5e2");
      setBackButtonTextColor("#ffffff");
      setAnswerTextColor("#003666");
      setErrorTextColor("#ff0000");
      setLogoUrl(null);
      // Reset new title fields
      setTitulo("");
      setSubtitulo("");
      setTituloCor("#00d5ff");
      setSubtituloCor("#6b7280");
      setFonteTamanhoTitulo("28px");
      setFonteTamanhoSubtitulo("18px");
      setFonteTamanhoPerguntas("16px");
      setFonteTamanhoCampos("14px");
      setFonteTamanhoRespostas("14px");
      setFonteTamanhoBotoes("18px");
      setFonteTamanhoObrigadoTitulo("28px");
      setFonteTamanhoObrigadoTexto("16px");
      // Reset step description styling
      setFonteTamanhoDescricaoEtapa("14px");
      setCorDescricaoEtapa("#6b7280");
      setFonteTamanhoIndicadorEtapa("14px");
      setCorIndicadorEtapa("#6b7280");
      setBarraProgressoVisivel(true);
      
      // Reset independent thank you page styling
      setObrigadoBackgroundColor("#ffffff");
      setObrigadoCardColor("#ffffff");
      setObrigadoCorPrimaria("#00d5ff");
      setObrigadoButtonTextColor("#ffffff");
      setObrigadoCardBorderColor("transparent");
      setObrigadoBorderRadius("16");
      
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
      setImagensLayout("vertical");
      
      // Reset WhatsApp settings
      setWhatsappInstanciaId(null);
      setWhatsappMensagemSucesso("");
      setWhatsappNotificacaoAtiva(false);
    }
  }, [template, open]);

  // Fetch WhatsApp instances
  useEffect(() => {
    if (!user || !open) return;
    
    const fetchInstancias = async () => {
      const { data } = await supabase
        .from("disparos_instancias")
        .select("id, nome")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("nome");
      
      if (data) {
        setWhatsappInstancias(data);
      }
    };
    
    fetchInstancias();
  }, [user, open]);

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
    setImagens([...imagens, { url: "", titulo: "", subtitulo: "", sideImages: [] }]);
  };

  const removeImagem = (index: number) => {
    setImagens(imagens.filter((_, i) => i !== index));
  };

  const updateImagem = (index: number, field: keyof MediaItem, value: string) => {
    const newImagens = [...imagens];
    newImagens[index] = { ...newImagens[index], [field]: value };
    setImagens(newImagens);
  };

  const addSideImage = (parentIndex: number) => {
    const newImagens = [...imagens];
    if (!newImagens[parentIndex].sideImages) {
      newImagens[parentIndex].sideImages = [];
    }
    newImagens[parentIndex].sideImages!.push({ url: "" });
    setImagens(newImagens);
  };

  const removeSideImage = (parentIndex: number, sideIndex: number) => {
    const newImagens = [...imagens];
    if (newImagens[parentIndex].sideImages) {
      newImagens[parentIndex].sideImages = newImagens[parentIndex].sideImages!.filter((_, i) => i !== sideIndex);
    }
    setImagens(newImagens);
  };

  const handleSideImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, parentIndex: number, sideIndex: number) => {
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

    try {
      const fileExt = file.name.split(".").pop();
      const userId = user?.id || "anonymous";
      const fileName = `${userId}/obrigado-side-${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("logos")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("logos")
        .getPublicUrl(fileName);

      const newImagens = [...imagens];
      if (newImagens[parentIndex].sideImages) {
        newImagens[parentIndex].sideImages![sideIndex] = { url: urlData.publicUrl };
      }
      setImagens(newImagens);
      toast.success("Imagem enviada com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar imagem:", error);
      toast.error("Erro ao enviar imagem");
    }
  };

  const addVideo = () => {
    setVideos([...videos, { url: "", titulo: "", subtitulo: "", sideVideos: [] }]);
  };

  const removeVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  const updateVideo = (index: number, field: keyof MediaItem, value: string) => {
    const newVideos = [...videos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setVideos(newVideos);
  };

  const addSideVideo = (parentIndex: number) => {
    const newVideos = [...videos];
    if (!newVideos[parentIndex].sideVideos) {
      newVideos[parentIndex].sideVideos = [];
    }
    newVideos[parentIndex].sideVideos!.push({ url: "" });
    setVideos(newVideos);
  };

  const removeSideVideo = (parentIndex: number, sideIndex: number) => {
    const newVideos = [...videos];
    if (newVideos[parentIndex].sideVideos) {
      newVideos[parentIndex].sideVideos = newVideos[parentIndex].sideVideos!.filter((_, i) => i !== sideIndex);
    }
    setVideos(newVideos);
  };

  const updateSideVideo = (parentIndex: number, sideIndex: number, url: string) => {
    const newVideos = [...videos];
    if (newVideos[parentIndex].sideVideos) {
      newVideos[parentIndex].sideVideos![sideIndex] = { url };
    }
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
      // New title fields
      titulo: titulo || null,
      subtitulo: subtitulo || null,
      titulo_cor: tituloCor,
      subtitulo_cor: subtituloCor,
      fonte_tamanho_titulo: fonteTamanhoTitulo,
      fonte_tamanho_subtitulo: fonteTamanhoSubtitulo,
      fonte_tamanho_perguntas: fonteTamanhoPerguntas,
      fonte_tamanho_campos: fonteTamanhoCampos,
      fonte_tamanho_respostas: fonteTamanhoRespostas,
      fonte_tamanho_botoes: fonteTamanhoBotoes,
      fonte_tamanho_obrigado_titulo: fonteTamanhoObrigadoTitulo,
      fonte_tamanho_obrigado_texto: fonteTamanhoObrigadoTexto,
      fonte_tamanho_obrigado_botao: fonteTamanhoObrigadoBotao,
      // Step description styling
      fonte_tamanho_descricao_etapa: fonteTamanhoDescricaoEtapa,
      fonte_tamanho_indicador_etapa: fonteTamanhoIndicadorEtapa,
      fonte_tamanho_paginacao: fonteTamanhoPaginacao,
      cor_descricao_etapa: corDescricaoEtapa,
      cor_indicador_etapa: corIndicadorEtapa,
      cor_paginacao: corPaginacao,
      barra_progresso_visivel: barraProgressoVisivel,
      
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
      imagens_layout: imagensLayout,
      
      // Independent thank you page styling
      obrigado_background_color: obrigadoBackgroundColor,
      obrigado_card_color: obrigadoCardColor,
      obrigado_cor_primaria: obrigadoCorPrimaria,
      obrigado_button_text_color: obrigadoButtonTextColor,
      obrigado_card_border_color: obrigadoCardBorderColor,
      obrigado_border_radius: obrigadoBorderRadius,
      
      // WhatsApp notification
      whatsapp_instancia_id: whatsappNotificacaoAtiva ? whatsappInstanciaId : null,
      whatsapp_mensagem_sucesso: whatsappNotificacaoAtiva ? whatsappMensagemSucesso : null,
      whatsapp_notificacao_ativa: whatsappNotificacaoAtiva,
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

  const [activeTab, setActiveTab] = useState("geral");
  const [previewMode, setPreviewMode] = useState<"form" | "obrigado">("form");

  // Get etapas sorted by ordem
  const etapas: FormularioEtapa[] = templateWithEtapas?.formularios_etapas
    ?.filter(e => e.ativo)
    ?.sort((a, b) => a.ordem - b.ordem) || [];

  const previewConfig = {
    nome,
    logoUrl,
    corPrimaria,
    backgroundColor,
    cardColor,
    fontFamily,
    textColor,
    buttonTextColor,
    borderRadius,
    progressBackgroundColor,
    cardBorderColor,
    answerTextColor,
    layoutTipo,
    paginaObrigadoTitulo,
    paginaObrigadoMensagem,
    paginaObrigadoCtaTexto,
    paginaObrigadoCtaLink,
    imagens,
    videos,
    imagensLayout,
    sectionOrder,
    etapas,
    // New title fields
    titulo,
    subtitulo,
    tituloCor,
    subtituloCor,
    fonteTamanhoTitulo,
    fonteTamanhoSubtitulo,
    fonteTamanhoPerguntas,
    fonteTamanhoCampos,
    fonteTamanhoRespostas,
    fonteTamanhoBotoes,
    fonteTamanhoObrigadoTitulo,
    fonteTamanhoObrigadoTexto,
    fonteTamanhoObrigadoBotao,
    // Media styling
    fonteTamanhoMidiaTitulo,
    fonteTamanhoMidiaSubtitulo,
    fonteMidia,
    // Independent colors
    corTituloPrincipal,
    corMensagem,
    corTituloMidia,
    corSubtituloMidia,
    // Step description styling
    fonteTamanhoDescricaoEtapa,
    fonteTamanhoIndicadorEtapa,
    fonteTamanhoPaginacao,
    corDescricaoEtapa,
    corIndicadorEtapa,
    corPaginacao,
    barraProgressoVisivel,
    // Independent thank you page styling
    obrigadoBackgroundColor,
    obrigadoCardColor,
    obrigadoCorPrimaria,
    obrigadoButtonTextColor,
    obrigadoCardBorderColor,
    obrigadoBorderRadius,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex flex-col lg:flex-row h-full max-h-[90vh]">
          {/* Form Settings Panel */}
          <div className="flex-1 overflow-y-auto p-6">
            <DialogHeader className="mb-4">
              <DialogTitle>{isEditing ? "Editar Template" : "Novo Template"}</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="geral" className="flex-1">Informações Gerais</TabsTrigger>
                  <TabsTrigger value="obrigado" className="flex-1">Página de Obrigado</TabsTrigger>
                </TabsList>

            <TabsContent value="geral" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome do Template (interno) *</Label>
                <Input
                  id="nome"
                  value={nome}
                  onChange={(e) => handleNomeChange(e.target.value)}
                  placeholder="Ex: Formulário de Contato"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Nome interno para identificação - não aparece no formulário
                </p>
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

              {/* Title & Subtitle Section - Collapsible */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Heading className="h-4 w-4" />
                      Título e Subtítulo
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <p className="text-xs text-muted-foreground">
                    Aparece no formulário apenas se preenchido
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="titulo" className="text-sm">Título</Label>
                      <Input
                        id="titulo"
                        value={titulo}
                        onChange={(e) => setTitulo(e.target.value)}
                        placeholder="Ex: Preencha seus dados"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="subtitulo" className="text-sm">Subtítulo</Label>
                      <Input
                        id="subtitulo"
                        value={subtitulo}
                        onChange={(e) => setSubtitulo(e.target.value)}
                        placeholder="Ex: É rápido e fácil"
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Font Sizes Collapsible */}
              <Collapsible open={fontsOpen} onOpenChange={setFontsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      Tamanhos de Fonte
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${fontsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Título</Label>
                      <Select value={fonteTamanhoTitulo} onValueChange={setFonteTamanhoTitulo}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Subtítulo</Label>
                      <Select value={fonteTamanhoSubtitulo} onValueChange={setFonteTamanhoSubtitulo}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Perguntas</Label>
                      <Select value={fonteTamanhoPerguntas} onValueChange={setFonteTamanhoPerguntas}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Respostas</Label>
                      <Select value={fonteTamanhoRespostas} onValueChange={setFonteTamanhoRespostas}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Opções</Label>
                      <Select value={fonteTamanhoCampos} onValueChange={setFonteTamanhoCampos}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Botões</Label>
                      <Select value={fonteTamanhoBotoes} onValueChange={setFonteTamanhoBotoes}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {layoutTipo === "multi_step" && (
                    <div className="grid grid-cols-2 gap-3">
                      {!barraProgressoVisivel && (
                        <div className="space-y-1.5">
                          <Label className="text-sm">Paginação</Label>
                          <Select value={fonteTamanhoPaginacao} onValueChange={setFonteTamanhoPaginacao}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FONT_SIZE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {barraProgressoVisivel && (
                        <div className="space-y-1.5">
                          <Label className="text-sm">Etapas</Label>
                          <Select value={fonteTamanhoIndicadorEtapa} onValueChange={setFonteTamanhoIndicadorEtapa}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {FONT_SIZE_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label className="text-sm">Fonte</Label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger>
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
                </CollapsibleContent>
              </Collapsible>

              {/* Colors Collapsible */}
              <Collapsible open={colorsOpen} onOpenChange={setColorsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Cores e Aparência
                    </span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${colorsOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
              {/* Linha 1: Cor de Fundo, Cor do Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bg">Background</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: backgroundColor }}
                      onClick={() => document.getElementById('bg')?.click()}
                    >
                      <Input
                        id="bg"
                        type="color"
                        value={backgroundColor}
                        onChange={(e) => setBackgroundColor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={backgroundColor}
                      onChange={(e) => setBackgroundColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardColor">Card</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: cardColor }}
                      onClick={() => document.getElementById('cardColor')?.click()}
                    >
                      <Input
                        id="cardColor"
                        type="color"
                        value={cardColor}
                        onChange={(e) => setCardColor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={cardColor}
                      onChange={(e) => setCardColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Linha 2: Título e Subtítulo cores */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tituloCor">Título</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: tituloCor }}
                      onClick={() => document.getElementById('tituloCor')?.click()}
                    >
                      <Input
                        id="tituloCor"
                        type="color"
                        value={tituloCor}
                        onChange={(e) => setTituloCor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={tituloCor}
                      onChange={(e) => setTituloCor(e.target.value)}
                      placeholder="#1f2937"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subtituloCor">Subtítulo</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: subtituloCor }}
                      onClick={() => document.getElementById('subtituloCor')?.click()}
                    >
                      <Input
                        id="subtituloCor"
                        type="color"
                        value={subtituloCor}
                        onChange={(e) => setSubtituloCor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={subtituloCor}
                      onChange={(e) => setSubtituloCor(e.target.value)}
                      placeholder="#6b7280"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Linha: Perguntas, Respostas */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="textColor">Perguntas</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: textColor }}
                      onClick={() => document.getElementById('textColor')?.click()}
                    >
                      <Input
                        id="textColor"
                        type="color"
                        value={textColor}
                        onChange={(e) => setTextColor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      placeholder="#1f2937"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="corDescricaoEtapa">Descrição da Pergunta</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: corDescricaoEtapa }}
                      onClick={() => document.getElementById('corDescricaoEtapa')?.click()}
                    >
                      <Input
                        id="corDescricaoEtapa"
                        type="color"
                        value={corDescricaoEtapa}
                        onChange={(e) => setCorDescricaoEtapa(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={corDescricaoEtapa}
                      onChange={(e) => setCorDescricaoEtapa(e.target.value)}
                      placeholder="#6b7280"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Linha: Respostas, Etapas (1/3) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="answerTextColor">Respostas</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: answerTextColor }}
                      onClick={() => document.getElementById('answerTextColor')?.click()}
                    >
                      <Input
                        id="answerTextColor"
                        type="color"
                        value={answerTextColor}
                        onChange={(e) => setAnswerTextColor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={answerTextColor}
                      onChange={(e) => setAnswerTextColor(e.target.value)}
                      placeholder="#1f2937"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="errorColor">Mensagem de Erro</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: errorTextColor }}
                      onClick={() => document.getElementById('errorColor')?.click()}
                    >
                      <Input
                        id="errorColor"
                        type="color"
                        value={errorTextColor}
                        onChange={(e) => setErrorTextColor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={errorTextColor}
                      onChange={(e) => setErrorTextColor(e.target.value)}
                      placeholder="#ef4444"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Linha: Cor Primária (Botão), Cor do Texto (Botão) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cor">Botão Principal</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: corPrimaria }}
                      onClick={() => document.getElementById('cor')?.click()}
                    >
                      <Input
                        id="cor"
                        type="color"
                        value={corPrimaria}
                        onChange={(e) => setCorPrimaria(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={corPrimaria}
                      onChange={(e) => setCorPrimaria(e.target.value)}
                      placeholder="#8B5CF6"
                      className="flex-1"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="buttonTextColor">Texto Botão Principal</Label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                      style={{ backgroundColor: buttonTextColor }}
                      onClick={() => document.getElementById('buttonTextColor')?.click()}
                    >
                      <Input
                        id="buttonTextColor"
                        type="color"
                        value={buttonTextColor}
                        onChange={(e) => setButtonTextColor(e.target.value)}
                        className="opacity-0 w-full h-full cursor-pointer"
                      />
                    </div>
                    <Input
                      value={buttonTextColor}
                      onChange={(e) => setButtonTextColor(e.target.value)}
                      placeholder="#ffffff"
                      className="flex-1"
                    />
                  </div>
                </div>
              </div>

              {/* Linha: Botão Voltar, Texto Botão Voltar (apenas multi_step) */}
              {layoutTipo === "multi_step" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="backButtonColor">Botão Voltar</Label>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                        style={{ backgroundColor: backButtonColor }}
                        onClick={() => document.getElementById('backButtonColor')?.click()}
                      >
                        <Input
                          id="backButtonColor"
                          type="color"
                          value={backButtonColor}
                          onChange={(e) => setBackButtonColor(e.target.value)}
                          className="opacity-0 w-full h-full cursor-pointer"
                        />
                      </div>
                      <Input
                        value={backButtonColor}
                        onChange={(e) => setBackButtonColor(e.target.value)}
                        placeholder="#6b7280"
                        className="flex-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="backButtonTextColor">Texto Botão Voltar</Label>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                        style={{ backgroundColor: backButtonTextColor }}
                        onClick={() => document.getElementById('backButtonTextColor')?.click()}
                      >
                        <Input
                          id="backButtonTextColor"
                          type="color"
                          value={backButtonTextColor}
                          onChange={(e) => setBackButtonTextColor(e.target.value)}
                          className="opacity-0 w-full h-full cursor-pointer"
                        />
                      </div>
                      <Input
                        value={backButtonTextColor}
                        onChange={(e) => setBackButtonTextColor(e.target.value)}
                        placeholder="#ffffff"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Paginação + Borda do Card - sempre visível quando multi_step */}
              {layoutTipo === "multi_step" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cardBorderMulti">Borda do Card</Label>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                        style={{ backgroundColor: cardBorderColor === "transparent" ? "#f3f4f6" : cardBorderColor }}
                        onClick={() => document.getElementById('cardBorderMulti')?.click()}
                      >
                        <Input
                          id="cardBorderMulti"
                          type="color"
                          value={cardBorderColor === "transparent" ? "#ffffff" : cardBorderColor}
                          onChange={(e) => setCardBorderColor(e.target.value)}
                          className="opacity-0 w-full h-full cursor-pointer"
                        />
                      </div>
                      <Input
                        value={cardBorderColor}
                        onChange={(e) => setCardBorderColor(e.target.value)}
                        placeholder="transparent"
                        className="flex-1"
                      />
                    </div>
                  </div>
                  {!barraProgressoVisivel && (
                    <div className="space-y-2">
                      <Label htmlFor="corPaginacao">Paginação</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corPaginacao }}
                          onClick={() => document.getElementById('corPaginacao')?.click()}
                        >
                          <Input
                            id="corPaginacao"
                            type="color"
                            value={corPaginacao}
                            onChange={(e) => setCorPaginacao(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corPaginacao}
                          onChange={(e) => setCorPaginacao(e.target.value)}
                          placeholder="#6b7280"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Borda do Card - mostrar separadamente quando não multi_step */}
              {layoutTipo !== "multi_step" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cardBorder">Borda do Card</Label>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                        style={{ backgroundColor: cardBorderColor === "transparent" ? "#f3f4f6" : cardBorderColor }}
                        onClick={() => document.getElementById('cardBorder')?.click()}
                      >
                        <Input
                          id="cardBorder"
                          type="color"
                          value={cardBorderColor === "transparent" ? "#ffffff" : cardBorderColor}
                          onChange={(e) => setCardBorderColor(e.target.value)}
                          className="opacity-0 w-full h-full cursor-pointer"
                        />
                      </div>
                      <Input
                        value={cardBorderColor}
                        onChange={(e) => setCardBorderColor(e.target.value)}
                        placeholder="transparent"
                        className="flex-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Barra de Progresso + Fundo Barra (penúltima linha - apenas multi_step e visível) */}
              {layoutTipo === "multi_step" && barraProgressoVisivel && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="progressColor">Barra de Progresso</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corPrimaria }}
                          onClick={() => document.getElementById('progressColor')?.click()}
                        >
                          <Input
                            id="progressColor"
                            type="color"
                            value={corPrimaria}
                            onChange={(e) => setCorPrimaria(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corPrimaria}
                          onChange={(e) => setCorPrimaria(e.target.value)}
                          placeholder="#8B5CF6"
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="progressBg">Fundo Barra</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: progressBackgroundColor }}
                          onClick={() => document.getElementById('progressBg')?.click()}
                        >
                          <Input
                            id="progressBg"
                            type="color"
                            value={progressBackgroundColor}
                            onChange={(e) => setProgressBackgroundColor(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={progressBackgroundColor}
                          onChange={(e) => setProgressBackgroundColor(e.target.value)}
                          placeholder="#e5e5e5"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Etapas - última linha */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="corIndicadorEtapa">Etapas</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corIndicadorEtapa }}
                          onClick={() => document.getElementById('corIndicadorEtapa')?.click()}
                        >
                          <Input
                            id="corIndicadorEtapa"
                            type="color"
                            value={corIndicadorEtapa}
                            onChange={(e) => setCorIndicadorEtapa(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corIndicadorEtapa}
                          onChange={(e) => setCorIndicadorEtapa(e.target.value)}
                          placeholder="#6b7280"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

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
                </CollapsibleContent>
              </Collapsible>

              {/* Exibir Barra de Progresso (apenas multi_step) */}
              {layoutTipo === "multi_step" && (
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Exibir Barra de Progresso</Label>
                    <p className="text-sm text-muted-foreground">
                      Mostra o progresso do formulário para o usuário
                    </p>
                  </div>
                  <Switch
                    checked={barraProgressoVisivel}
                    onCheckedChange={setBarraProgressoVisivel}
                  />
                </div>
              )}

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
              {/* Render sections in order with drag-and-drop */}
              <DndContext
                sensors={sectionSensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                  {sectionOrder.map((sectionType) => (
                    <SortableSection
                      key={sectionType}
                      id={sectionType}
                      sectionType={sectionType}
                      imagens={imagens}
                      videos={videos}
                      paginaObrigadoTitulo={paginaObrigadoTitulo}
                      setPaginaObrigadoTitulo={setPaginaObrigadoTitulo}
                      paginaObrigadoMensagem={paginaObrigadoMensagem}
                      setPaginaObrigadoMensagem={setPaginaObrigadoMensagem}
                      paginaObrigadoCtaTexto={paginaObrigadoCtaTexto}
                      setPaginaObrigadoCtaTexto={setPaginaObrigadoCtaTexto}
                      paginaObrigadoCtaLink={paginaObrigadoCtaLink}
                      setPaginaObrigadoCtaLink={setPaginaObrigadoCtaLink}
                      removeImagem={removeImagem}
                      updateImagem={updateImagem}
                      addSideImage={addSideImage}
                      removeSideImage={removeSideImage}
                      handleMultiImageUpload={handleMultiImageUpload}
                      handleSideImageUpload={handleSideImageUpload}
                      imagemInputRefs={imagemInputRefs}
                      uploadingImagemIndex={uploadingImagemIndex}
                      addImagem={addImagem}
                      removeVideo={removeVideo}
                      updateVideo={updateVideo}
                      addSideVideo={addSideVideo}
                      removeSideVideo={removeSideVideo}
                      updateSideVideo={updateSideVideo}
                      addVideo={addVideo}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Tamanhos de Fonte Collapsible */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      Tamanhos de Fonte
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Título Principal</Label>
                      <Select value={fonteTamanhoObrigadoTitulo} onValueChange={setFonteTamanhoObrigadoTitulo}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Mensagem</Label>
                      <Select value={fonteTamanhoObrigadoTexto} onValueChange={setFonteTamanhoObrigadoTexto}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Título Mídias</Label>
                      <Select value={fonteTamanhoMidiaTitulo} onValueChange={setFonteTamanhoMidiaTitulo}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Subtítulo Mídias</Label>
                      <Select value={fonteTamanhoMidiaSubtitulo} onValueChange={setFonteTamanhoMidiaSubtitulo}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-sm">Botão</Label>
                      <Select value={fonteTamanhoObrigadoBotao} onValueChange={setFonteTamanhoObrigadoBotao}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FONT_SIZE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Fonte das Mídias</Label>
                    <Select value={fonteMidia} onValueChange={setFonteMidia}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((font) => (
                          <SelectItem key={font.value} value={font.value}>
                            <span style={{ fontFamily: font.value }}>{font.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Cores e Aparência Collapsible */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Cores e Aparência
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  {/* Linha 1: Background e Card */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-bg">Background</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: obrigadoBackgroundColor }}
                          onClick={() => document.getElementById('obrigado-bg')?.click()}
                        >
                          <Input
                            id="obrigado-bg"
                            type="color"
                            value={obrigadoBackgroundColor}
                            onChange={(e) => setObrigadoBackgroundColor(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={obrigadoBackgroundColor}
                          onChange={(e) => setObrigadoBackgroundColor(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-card">Card</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: obrigadoCardColor }}
                          onClick={() => document.getElementById('obrigado-card')?.click()}
                        >
                          <Input
                            id="obrigado-card"
                            type="color"
                            value={obrigadoCardColor}
                            onChange={(e) => setObrigadoCardColor(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={obrigadoCardColor}
                          onChange={(e) => setObrigadoCardColor(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Linha 2: Título Principal e Mensagem */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-titulo-cor">Título Principal</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corTituloPrincipal }}
                          onClick={() => document.getElementById('obrigado-titulo-cor')?.click()}
                        >
                          <Input
                            id="obrigado-titulo-cor"
                            type="color"
                            value={corTituloPrincipal}
                            onChange={(e) => setCorTituloPrincipal(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corTituloPrincipal}
                          onChange={(e) => setCorTituloPrincipal(e.target.value)}
                          placeholder="#1f2937"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-mensagem-cor">Mensagem</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corMensagem }}
                          onClick={() => document.getElementById('obrigado-mensagem-cor')?.click()}
                        >
                          <Input
                            id="obrigado-mensagem-cor"
                            type="color"
                            value={corMensagem}
                            onChange={(e) => setCorMensagem(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corMensagem}
                          onChange={(e) => setCorMensagem(e.target.value)}
                          placeholder="#6b7280"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Linha 3: Título Mídia e Subtítulo Mídia */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-midia-titulo">Título Mídia</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corTituloMidia }}
                          onClick={() => document.getElementById('obrigado-midia-titulo')?.click()}
                        >
                          <Input
                            id="obrigado-midia-titulo"
                            type="color"
                            value={corTituloMidia}
                            onChange={(e) => setCorTituloMidia(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corTituloMidia}
                          onChange={(e) => setCorTituloMidia(e.target.value)}
                          placeholder="#1f2937"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-midia-subtitulo">Subtítulo Mídia</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: corSubtituloMidia }}
                          onClick={() => document.getElementById('obrigado-midia-subtitulo')?.click()}
                        >
                          <Input
                            id="obrigado-midia-subtitulo"
                            type="color"
                            value={corSubtituloMidia}
                            onChange={(e) => setCorSubtituloMidia(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={corSubtituloMidia}
                          onChange={(e) => setCorSubtituloMidia(e.target.value)}
                          placeholder="#6b7280"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Linha 4: Botão e Texto Botão */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-botao">Botão</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: obrigadoCorPrimaria }}
                          onClick={() => document.getElementById('obrigado-botao')?.click()}
                        >
                          <Input
                            id="obrigado-botao"
                            type="color"
                            value={obrigadoCorPrimaria}
                            onChange={(e) => setObrigadoCorPrimaria(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={obrigadoCorPrimaria}
                          onChange={(e) => setObrigadoCorPrimaria(e.target.value)}
                          placeholder="#8B5CF6"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-botao-texto">Texto Botão</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: obrigadoButtonTextColor }}
                          onClick={() => document.getElementById('obrigado-botao-texto')?.click()}
                        >
                          <Input
                            id="obrigado-botao-texto"
                            type="color"
                            value={obrigadoButtonTextColor}
                            onChange={(e) => setObrigadoButtonTextColor(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={obrigadoButtonTextColor}
                          onChange={(e) => setObrigadoButtonTextColor(e.target.value)}
                          placeholder="#ffffff"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Linha 5: Borda do Card */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="obrigado-borda">Borda do Card</Label>
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-12 h-10 rounded-md border cursor-pointer shrink-0"
                          style={{ backgroundColor: obrigadoCardBorderColor === "transparent" ? "#ffffff" : obrigadoCardBorderColor }}
                          onClick={() => document.getElementById('obrigado-borda')?.click()}
                        >
                          <Input
                            id="obrigado-borda"
                            type="color"
                            value={obrigadoCardBorderColor === "transparent" ? "#ffffff" : obrigadoCardBorderColor}
                            onChange={(e) => setObrigadoCardBorderColor(e.target.value)}
                            className="opacity-0 w-full h-full cursor-pointer"
                          />
                        </div>
                        <Input
                          value={obrigadoCardBorderColor}
                          onChange={(e) => setObrigadoCardBorderColor(e.target.value)}
                          placeholder="transparent"
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Arredondamento */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Arredondamento: {obrigadoBorderRadius}px</Label>
                    <Input
                      type="range"
                      min="0"
                      max="32"
                      value={obrigadoBorderRadius}
                      onChange={(e) => setObrigadoBorderRadius(e.target.value)}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Quadrado</span>
                      <span>Arredondado</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* WhatsApp Notification Section */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Notificação WhatsApp
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enviar mensagem automática</Label>
                      <p className="text-sm text-muted-foreground">
                        Envie uma mensagem WhatsApp quando o lead completar o formulário
                      </p>
                    </div>
                    <Switch
                      checked={whatsappNotificacaoAtiva}
                      onCheckedChange={setWhatsappNotificacaoAtiva}
                    />
                  </div>
                  
                  {whatsappNotificacaoAtiva && (
                    <div className="space-y-4 pl-4 border-l-2 border-primary/20">
                      <div className="space-y-2">
                        <Label>Instância WhatsApp</Label>
                        {whatsappInstancias.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Nenhuma instância de disparo conectada. Configure em Disparos → Instâncias.
                          </p>
                        ) : (
                          <Select
                            value={whatsappInstanciaId || ""}
                            onValueChange={(value) => setWhatsappInstanciaId(value || null)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione uma instância" />
                            </SelectTrigger>
                            <SelectContent>
                              {whatsappInstancias.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>
                                  {inst.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Mensagem</Label>
                        <Textarea
                          value={whatsappMensagemSucesso}
                          onChange={(e) => setWhatsappMensagemSucesso(e.target.value)}
                          placeholder="Olá {nome}! Obrigado por se cadastrar..."
                          rows={4}
                        />
                        <p className="text-xs text-muted-foreground">
                          Use {"{nome}"}, {"{email}"}, {"{telefone}"} para personalizar a mensagem
                        </p>
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

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
          </div>

          {/* Live Preview Panel - Desktop only */}
          <div className="hidden lg:flex flex-col w-[380px] border-l bg-muted/30">
            <div className="p-4 border-b bg-muted/50 space-y-2">
              <h3 className="font-medium text-sm text-center">
                Preview em tempo real
              </h3>
              {/* Toggle buttons for preview type */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <button
                  type="button"
                  onClick={() => setPreviewMode("form")}
                  className={`flex-1 text-xs py-1.5 px-2 rounded-md transition-colors ${
                    previewMode === "form" 
                      ? "bg-background shadow-sm font-medium" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Formulário
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("obrigado")}
                  className={`flex-1 text-xs py-1.5 px-2 rounded-md transition-colors ${
                    previewMode === "obrigado" 
                      ? "bg-background shadow-sm font-medium" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Página de Obrigado
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <FormPreviewPanel 
                config={previewConfig} 
                showThankYou={previewMode === "obrigado"}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
