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
import { Upload, X, Loader2, Plus, Trash2, ChevronDown, Palette, Type, Link2, Film, ImageIcon, GripVertical, Settings2 } from "lucide-react";
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
  { value: "Source Sans Pro", label: "Source Sans Pro" },
  { value: "PT Sans", label: "PT Sans" },
];

const FONT_SIZE_OPTIONS = [
  { value: "12px", label: "12px - Pequeno" },
  { value: "14px", label: "14px - Normal" },
  { value: "16px", label: "16px - Médio" },
  { value: "18px", label: "18px - Grande" },
  { value: "20px", label: "20px - Maior" },
  { value: "24px", label: "24px - Extra Grande" },
  { value: "28px", label: "28px - Título" },
  { value: "32px", label: "32px - Destaque" },
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
  
  // New title fields
  const [titulo, setTitulo] = useState("");
  const [subtitulo, setSubtitulo] = useState("");
  const [tituloCor, setTituloCor] = useState("#1f2937");
  const [fonteTamanhoTitulo, setFonteTamanhoTitulo] = useState("24px");
  const [fonteTamanhoSubtitulo, setFonteTamanhoSubtitulo] = useState("16px");
  const [fonteTamanhoCampos, setFonteTamanhoCampos] = useState("14px");
  const [fonteTamanhoObrigadoTitulo, setFonteTamanhoObrigadoTitulo] = useState("28px");
  const [fonteTamanhoObrigadoTexto, setFonteTamanhoObrigadoTexto] = useState("16px");
  
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
      setFonteTamanhoTitulo((template as any).fonte_tamanho_titulo || "24px");
      setFonteTamanhoSubtitulo((template as any).fonte_tamanho_subtitulo || "16px");
      setFonteTamanhoCampos((template as any).fonte_tamanho_campos || "14px");
      setFonteTamanhoObrigadoTitulo((template as any).fonte_tamanho_obrigado_titulo || "28px");
      setFonteTamanhoObrigadoTexto((template as any).fonte_tamanho_obrigado_texto || "16px");
      
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
      // Reset new title fields
      setTitulo("");
      setSubtitulo("");
      setTituloCor("#1f2937");
      setFonteTamanhoTitulo("24px");
      setFonteTamanhoSubtitulo("16px");
      setFonteTamanhoCampos("14px");
      setFonteTamanhoObrigadoTitulo("28px");
      setFonteTamanhoObrigadoTexto("16px");
      
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
      fonte_tamanho_titulo: fonteTamanhoTitulo,
      fonte_tamanho_subtitulo: fonteTamanhoSubtitulo,
      fonte_tamanho_campos: fonteTamanhoCampos,
      fonte_tamanho_obrigado_titulo: fonteTamanhoObrigadoTitulo,
      fonte_tamanho_obrigado_texto: fonteTamanhoObrigadoTexto,
      
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
    fonteTamanhoTitulo,
    fonteTamanhoSubtitulo,
    fonteTamanhoCampos,
    fonteTamanhoObrigadoTitulo,
    fonteTamanhoObrigadoTexto,
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

              {/* Title & Subtitle Section */}
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <Label className="text-base font-semibold">Título e Subtítulo</Label>
                <p className="text-xs text-muted-foreground -mt-2">
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
                    <Label htmlFor="tituloCor" className="text-sm">Cor do Título</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        value={tituloCor}
                        onChange={(e) => setTituloCor(e.target.value)}
                        className="w-10 h-9 p-1 cursor-pointer"
                      />
                      <Input
                        value={tituloCor}
                        onChange={(e) => setTituloCor(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                  </div>
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
                      <Label className="text-sm">Tamanho Título</Label>
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
                      <Label className="text-sm">Tamanho Subtítulo</Label>
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
                  <div className="space-y-1.5">
                    <Label className="text-sm">Tamanho Campos/Labels</Label>
                    <Select value={fonteTamanhoCampos} onValueChange={setFonteTamanhoCampos}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FONT_SIZE_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
                </CollapsibleContent>
              </Collapsible>

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

              {/* Personalização Visual - Always at the end */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="outline" type="button" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Personalização Visual
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  {/* Tamanhos de Fonte */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Tamanhos de Fonte</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Título Principal</Label>
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
                        <Label className="text-xs text-muted-foreground">Mensagem</Label>
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
                  </div>

                  {/* Cores */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Cores</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cor do Fundo</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
                          />
                          <Input
                            value={backgroundColor}
                            onChange={(e) => setBackgroundColor(e.target.value)}
                            placeholder="#ffffff"
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cor do Texto</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={textColor}
                            onChange={(e) => setTextColor(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
                          />
                          <Input
                            value={textColor}
                            onChange={(e) => setTextColor(e.target.value)}
                            placeholder="#1f2937"
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cor do Botão</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={corPrimaria}
                            onChange={(e) => setCorPrimaria(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
                          />
                          <Input
                            value={corPrimaria}
                            onChange={(e) => setCorPrimaria(e.target.value)}
                            placeholder="#8B5CF6"
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Texto do Botão</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={buttonTextColor}
                            onChange={(e) => setButtonTextColor(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
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
                  </div>

                  {/* Estilos de Mídia */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Estilos de Mídia</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Arredondamento</Label>
                        <Select value={borderRadius} onValueChange={setBorderRadius}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">Sem arredondamento</SelectItem>
                            <SelectItem value="4">Leve (4px)</SelectItem>
                            <SelectItem value="8">Médio (8px)</SelectItem>
                            <SelectItem value="12">Padrão (12px)</SelectItem>
                            <SelectItem value="16">Grande (16px)</SelectItem>
                            <SelectItem value="24">Extra Grande (24px)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cor do Card</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={cardColor}
                            onChange={(e) => setCardColor(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
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
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Borda do Card</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={cardBorderColor === "transparent" ? "#ffffff" : cardBorderColor}
                            onChange={(e) => setCardBorderColor(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
                          />
                          <Input
                            value={cardBorderColor}
                            onChange={(e) => setCardBorderColor(e.target.value)}
                            placeholder="transparent"
                            className="flex-1"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Cor de Progresso</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            type="color"
                            value={progressBackgroundColor}
                            onChange={(e) => setProgressBackgroundColor(e.target.value)}
                            className="w-10 h-9 p-1 cursor-pointer"
                          />
                          <Input
                            value={progressBackgroundColor}
                            onChange={(e) => setProgressBackgroundColor(e.target.value)}
                            placeholder="#e5e5e5"
                            className="flex-1"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
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
