import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, Pencil, Trash2, FileText, Image, Video, Music, X, ChevronDown, ChevronUp, Layers, Shuffle, Copy, Eye, Clock, MessageSquare, RefreshCw } from "lucide-react";
import { processSpintaxRandom } from "@/utils/spintax";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
interface Template {
  id: string;
  nome: string;
  delay_bloco_min: number;
  delay_bloco_max: number;
  created_at: string;
  variacoes?: TemplateVariacao[];
}
interface TemplateVariacao {
  id: string;
  template_id: string;
  bloco: number;
  ordem: number;
  tipo_mensagem: string;
  mensagem: string | null;
  media_base64: string | null;
}
interface MensagemVariacao {
  id: string;
  tipo: "text" | "image" | "audio" | "video" | "document";
  mensagem: string;
  mediaFile: File | null;
  mediaPreview: string | null;
  mediaBase64: string | null;
}
interface BlocoMensagem {
  id: string;
  variacoes: MensagemVariacao[];
}
export function TemplatesTab() {
  const {
    user
  } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [nome, setNome] = useState("");
  const [blocos, setBlocos] = useState<BlocoMensagem[]>([{
    id: crypto.randomUUID(),
    variacoes: [{
      id: crypto.randomUUID(),
      tipo: "text",
      mensagem: "",
      mediaFile: null,
      mediaPreview: null,
      mediaBase64: null
    }]
  }]);
  const [blocosAbertos, setBlocosAbertos] = useState<Record<string, boolean>>({});
  const [variacoesAbertas, setVariacoesAbertas] = useState<Record<string, boolean>>({});
  const [delayBlocoMin, setDelayBlocoMin] = useState(3);
  const [delayBlocoMax, setDelayBlocoMax] = useState(8);
  const mediaInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Preview state - stores randomly generated messages for each block (form preview)
  const [formPreviewMessages, setFormPreviewMessages] = useState<Record<number, { variacaoIdx: number; text: string; mediaPreview?: string | null; tipo: string }>>({});
  const [formPreviewKey, setFormPreviewKey] = useState(0);

  // Preview state for preview dialog
  const [dialogPreviewMessages, setDialogPreviewMessages] = useState<Record<number, { variacaoIdx: number; text: string; mediaBase64?: string | null; tipo: string }>>({});
  const [dialogPreviewKey, setDialogPreviewKey] = useState(0);

  // Generate random preview for form blocks
  const generateFormRandomPreview = useCallback(() => {
    const newPreview: Record<number, { variacaoIdx: number; text: string; mediaPreview?: string | null; tipo: string }> = {};
    
    blocos.forEach((bloco, blocoIndex) => {
      // Filter variations with content
      const validVariacoes = bloco.variacoes.filter(v => 
        (v.tipo === "text" && v.mensagem) || (v.tipo !== "text" && (v.mediaPreview || v.mediaBase64))
      );
      
      if (validVariacoes.length > 0) {
        // Pick a random variation
        const randomIdx = Math.floor(Math.random() * validVariacoes.length);
        const selectedVariacao = validVariacoes[randomIdx];
        
        // Process spintax if it's text
        const processedText = selectedVariacao.tipo === "text" 
          ? processSpintaxRandom(selectedVariacao.mensagem)
          : selectedVariacao.mensagem;
        
        newPreview[blocoIndex] = {
          variacaoIdx: randomIdx,
          text: processedText,
          mediaPreview: selectedVariacao.mediaPreview || selectedVariacao.mediaBase64,
          tipo: selectedVariacao.tipo
        };
      }
    });
    
    setFormPreviewMessages(newPreview);
    setFormPreviewKey(prev => prev + 1);
  }, [blocos]);

  // Generate random preview for dialog preview
  const generateDialogRandomPreview = useCallback(() => {
    if (!previewTemplate?.variacoes) return;
    
    const blocosAgrupados = groupVariacoesByBloco(previewTemplate.variacoes);
    const newPreview: Record<number, { variacaoIdx: number; text: string; mediaBase64?: string | null; tipo: string }> = {};
    
    blocosAgrupados.forEach(({ blocoNum, variacoes }) => {
      // Filter variations with content
      const validVariacoes = variacoes.filter(v => 
        (v.tipo_mensagem === "text" && v.mensagem) || (v.tipo_mensagem !== "text" && v.media_base64)
      );
      
      if (validVariacoes.length > 0) {
        // Pick a random variation
        const randomIdx = Math.floor(Math.random() * validVariacoes.length);
        const selectedVariacao = validVariacoes[randomIdx];
        
        // Process spintax if it's text
        const processedText = selectedVariacao.tipo_mensagem === "text" 
          ? processSpintaxRandom(selectedVariacao.mensagem || "")
          : selectedVariacao.mensagem || "";
        
        newPreview[blocoNum] = {
          variacaoIdx: randomIdx,
          text: processedText,
          mediaBase64: selectedVariacao.media_base64,
          tipo: selectedVariacao.tipo_mensagem
        };
      }
    });
    
    setDialogPreviewMessages(newPreview);
    setDialogPreviewKey(prev => prev + 1);
  }, [previewTemplate]);
  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      const {
        data: templatesData,
        error: templatesError
      } = await supabase.from("disparos_templates").select("*").order("created_at", {
        ascending: false
      });
      if (templatesError) throw templatesError;

      // Load variations for each template
      const templatesWithVariacoes = await Promise.all((templatesData || []).map(async template => {
        const {
          data: variacoes
        } = await supabase.from("disparos_template_variacoes").select("*").eq("template_id", template.id).order("bloco", {
          ascending: true
        }).order("ordem", {
          ascending: true
        });
        return {
          ...template,
          variacoes: variacoes || []
        };
      }));
      setTemplates(templatesWithVariacoes);
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast.error("Erro ao carregar templates");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => {
    if (user) {
      loadTemplates();
    }
  }, [user]);

  // Initialize first block as open
  useEffect(() => {
    if (blocos.length > 0 && Object.keys(blocosAbertos).length === 0) {
      const firstBlockId = blocos[0].id;
      setBlocosAbertos({
        [firstBlockId]: true
      });
      if (blocos[0].variacoes.length > 0) {
        setVariacoesAbertas({
          [blocos[0].variacoes[0].id]: true
        });
      }
    }
  }, [blocos]);
  const resetForm = () => {
    setNome("");
    setBlocos([{
      id: crypto.randomUUID(),
      variacoes: [{
        id: crypto.randomUUID(),
        tipo: "text",
        mensagem: "",
        mediaFile: null,
        mediaPreview: null,
        mediaBase64: null
      }]
    }]);
    setBlocosAbertos({});
    setVariacoesAbertas({});
    setDelayBlocoMin(3);
    setDelayBlocoMax(8);
    setEditingTemplate(null);
    setFormPreviewMessages({});
  };
  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };
  const openEditDialog = async (template: Template) => {
    setEditingTemplate(template);
    setNome(template.nome);
    setDelayBlocoMin(template.delay_bloco_min || 3);
    setDelayBlocoMax(template.delay_bloco_max || 8);

    // Convert variations to blocos structure
    const variacoes = template.variacoes || [];
    const blocosMap = new Map<number, MensagemVariacao[]>();
    for (const v of variacoes) {
      const blocoNum = v.bloco ?? 0;
      if (!blocosMap.has(blocoNum)) {
        blocosMap.set(blocoNum, []);
      }
      blocosMap.get(blocoNum)!.push({
        id: v.id,
        tipo: v.tipo_mensagem as any,
        mensagem: v.mensagem || "",
        mediaFile: null,
        mediaPreview: v.media_base64,
        mediaBase64: v.media_base64
      });
    }
    const blocosArray: BlocoMensagem[] = Array.from(blocosMap.entries()).sort(([a], [b]) => a - b).map(([_, vars]) => ({
      id: crypto.randomUUID(),
      variacoes: vars
    }));
    if (blocosArray.length === 0) {
      blocosArray.push({
        id: crypto.randomUUID(),
        variacoes: [{
          id: crypto.randomUUID(),
          tipo: "text",
          mensagem: "",
          mediaFile: null,
          mediaPreview: null,
          mediaBase64: null
        }]
      });
    }
    setBlocos(blocosArray);
    setBlocosAbertos({
      [blocosArray[0].id]: true
    });
    if (blocosArray[0].variacoes.length > 0) {
      setVariacoesAbertas({
        [blocosArray[0].variacoes[0].id]: true
      });
    }
    setDialogOpen(true);
  };

  // Bloco functions
  const addBloco = () => {
    const newBlocoId = crypto.randomUUID();
    const newVariacaoId = crypto.randomUUID();
    setBlocos([...blocos, {
      id: newBlocoId,
      variacoes: [{
        id: newVariacaoId,
        tipo: "text",
        mensagem: "",
        mediaFile: null,
        mediaPreview: null,
        mediaBase64: null
      }]
    }]);
    setBlocosAbertos(prev => ({
      ...prev,
      [newBlocoId]: true
    }));
    setVariacoesAbertas(prev => ({
      ...prev,
      [newVariacaoId]: true
    }));
  };
  const removeBloco = (blocoId: string) => {
    if (blocos.length <= 1) {
      toast.error("O template deve ter pelo menos um bloco");
      return;
    }
    setBlocos(blocos.filter(b => b.id !== blocoId));
  };
  const duplicateBloco = (blocoId: string) => {
    const bloco = blocos.find(b => b.id === blocoId);
    if (!bloco) return;
    const newBlocoId = crypto.randomUUID();
    const newVariacoes = bloco.variacoes.map(v => ({
      ...v,
      id: crypto.randomUUID()
    }));
    const blocoIndex = blocos.findIndex(b => b.id === blocoId);
    const newBlocos = [...blocos];
    newBlocos.splice(blocoIndex + 1, 0, {
      id: newBlocoId,
      variacoes: newVariacoes
    });
    setBlocos(newBlocos);
    setBlocosAbertos(prev => ({
      ...prev,
      [newBlocoId]: true
    }));
  };

  // Variacao functions
  const addVariacao = (blocoId: string) => {
    const newVariacaoId = crypto.randomUUID();
    setBlocos(blocos.map(b => b.id === blocoId ? {
      ...b,
      variacoes: [...b.variacoes, {
        id: newVariacaoId,
        tipo: "text",
        mensagem: "",
        mediaFile: null,
        mediaPreview: null,
        mediaBase64: null
      }]
    } : b));
    setVariacoesAbertas(prev => ({
      ...prev,
      [newVariacaoId]: true
    }));
  };
  const removeVariacao = (blocoId: string, variacaoId: string) => {
    const bloco = blocos.find(b => b.id === blocoId);
    if (!bloco || bloco.variacoes.length <= 1) {
      toast.error("O bloco deve ter pelo menos uma variação");
      return;
    }
    setBlocos(blocos.map(b => b.id === blocoId ? {
      ...b,
      variacoes: b.variacoes.filter(v => v.id !== variacaoId)
    } : b));
  };
  const updateVariacao = (blocoId: string, variacaoId: string, updates: Partial<MensagemVariacao>) => {
    setBlocos(blocos.map(b => b.id === blocoId ? {
      ...b,
      variacoes: b.variacoes.map(v => v.id === variacaoId ? {
        ...v,
        ...updates
      } : v)
    } : b));
  };
  const handleMediaChange = async (blocoId: string, variacaoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const base64 = event.target?.result as string;
      updateVariacao(blocoId, variacaoId, {
        mediaFile: file,
        mediaPreview: base64,
        mediaBase64: base64
      });
    };
    reader.readAsDataURL(file);
  };
  const clearMedia = (blocoId: string, variacaoId: string) => {
    updateVariacao(blocoId, variacaoId, {
      mediaFile: null,
      mediaPreview: null,
      mediaBase64: null
    });
    const key = `${blocoId}-${variacaoId}`;
    if (mediaInputRefs.current[key]) {
      mediaInputRefs.current[key]!.value = "";
    }
  };
  const getAcceptedFileTypes = (tipo: string) => {
    switch (tipo) {
      case "image":
        return "image/*";
      case "video":
        return "video/*";
      case "audio":
        return "audio/*";
      case "document":
        return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";
      default:
        return "";
    }
  };
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "image":
        return <Image className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "audio":
        return <Music className="h-4 w-4" />;
      case "document":
        return <FileText className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };
  const getTypeLabel = (type: string) => {
    switch (type) {
      case "image":
        return "Imagem";
      case "video":
        return "Vídeo";
      case "audio":
        return "Áudio";
      case "document":
        return "Documento";
      default:
        return "Texto";
    }
  };
  const handleSave = async () => {
    if (!user) return;
    if (!nome.trim()) {
      toast.error("Digite um nome para o template");
      return;
    }

    // Validate at least one variation has content
    const hasContent = blocos.some(b => b.variacoes.some(v => v.tipo === "text" && v.mensagem.trim() || v.tipo !== "text" && v.mediaBase64));
    if (!hasContent) {
      toast.error("Adicione pelo menos uma mensagem ou mídia");
      return;
    }
    setIsSaving(true);
    try {
      let templateId: string;
      if (editingTemplate) {
        // Update existing template
        const {
          error: updateError
        } = await supabase.from("disparos_templates").update({
          nome: nome.trim(),
          delay_bloco_min: delayBlocoMin,
          delay_bloco_max: delayBlocoMax
        }).eq("id", editingTemplate.id);
        if (updateError) throw updateError;
        templateId = editingTemplate.id;

        // Delete old variations
        await supabase.from("disparos_template_variacoes").delete().eq("template_id", templateId);
      } else {
        // Create new template
        const {
          data: newTemplate,
          error: insertError
        } = await supabase.from("disparos_templates").insert({
          user_id: user.id,
          nome: nome.trim(),
          tipo_mensagem: "text",
          // Legacy field
          delay_bloco_min: delayBlocoMin,
          delay_bloco_max: delayBlocoMax
        }).select("id").single();
        if (insertError) throw insertError;
        templateId = newTemplate.id;
      }

      // Insert variations
      const variacoesToInsert = blocos.flatMap((bloco, blocoIndex) => bloco.variacoes.map((variacao, variacaoIndex) => ({
        template_id: templateId,
        bloco: blocoIndex,
        ordem: variacaoIndex,
        tipo_mensagem: variacao.tipo,
        mensagem: variacao.mensagem.trim() || null,
        media_base64: variacao.tipo !== "text" ? variacao.mediaBase64 : null
      })));
      const {
        error: variacoesError
      } = await supabase.from("disparos_template_variacoes").insert(variacoesToInsert);
      if (variacoesError) throw variacoesError;
      toast.success(editingTemplate ? "Template atualizado!" : "Template criado!");
      setDialogOpen(false);
      resetForm();
      loadTemplates();
    } catch (error: any) {
      console.error("Error saving template:", error);
      toast.error("Erro ao salvar template");
    } finally {
      setIsSaving(false);
    }
  };
  const handleDelete = async () => {
    if (!templateToDelete) return;
    try {
      const {
        error
      } = await supabase.from("disparos_templates").delete().eq("id", templateToDelete);
      if (error) throw error;
      toast.success("Template excluído!");
      loadTemplates();
    } catch (error: any) {
      console.error("Error deleting template:", error);
      toast.error("Erro ao excluir template");
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  const handleDuplicate = async (template: Template) => {
    if (!user) return;
    try {
      // Create new template with duplicated data
      const { data: newTemplate, error: insertError } = await supabase
        .from("disparos_templates")
        .insert({
          user_id: user.id,
          nome: `${template.nome} (cópia)`,
          tipo_mensagem: "text",
          delay_bloco_min: template.delay_bloco_min,
          delay_bloco_max: template.delay_bloco_max
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Duplicate variations if any
      if (template.variacoes && template.variacoes.length > 0) {
        const variacoesToInsert = template.variacoes.map(v => ({
          template_id: newTemplate.id,
          bloco: v.bloco,
          ordem: v.ordem,
          tipo_mensagem: v.tipo_mensagem,
          mensagem: v.mensagem,
          media_base64: v.media_base64
        }));

        const { error: variacoesError } = await supabase
          .from("disparos_template_variacoes")
          .insert(variacoesToInsert);

        if (variacoesError) throw variacoesError;
      }

      toast.success("Template duplicado!");
      loadTemplates();
    } catch (error: any) {
      console.error("Error duplicating template:", error);
      toast.error("Erro ao duplicar template");
    }
  };
  const openPreviewDialog = (template: Template) => {
    setPreviewTemplate(template);
    setPreviewDialogOpen(true);
    
    // Generate initial random preview immediately
    if (template.variacoes) {
      const blocosAgrupados = groupVariacoesByBloco(template.variacoes);
      const newPreview: Record<number, { variacaoIdx: number; text: string; mediaBase64?: string | null; tipo: string }> = {};
      
      blocosAgrupados.forEach(({ blocoNum, variacoes }) => {
        const validVariacoes = variacoes.filter(v => 
          (v.tipo_mensagem === "text" && v.mensagem) || (v.tipo_mensagem !== "text" && v.media_base64)
        );
        
        if (validVariacoes.length > 0) {
          const randomIdx = Math.floor(Math.random() * validVariacoes.length);
          const selectedVariacao = validVariacoes[randomIdx];
          const processedText = selectedVariacao.tipo_mensagem === "text" 
            ? processSpintaxRandom(selectedVariacao.mensagem || "")
            : selectedVariacao.mensagem || "";
          
          newPreview[blocoNum] = {
            variacaoIdx: randomIdx,
            text: processedText,
            mediaBase64: selectedVariacao.media_base64,
            tipo: selectedVariacao.tipo_mensagem
          };
        }
      });
      
      setDialogPreviewMessages(newPreview);
      setDialogPreviewKey(prev => prev + 1);
    }
  };
  const getTemplateSummary = (template: Template) => {
    const variacoes = template.variacoes || [];
    const blocosCount = new Set(variacoes.map(v => v.bloco)).size || 1;
    const variacoesCount = variacoes.length || 0;
    return {
      blocosCount,
      variacoesCount
    };
  };
  const groupVariacoesByBloco = (variacoes: TemplateVariacao[]) => {
    const blocosMap = new Map<number, TemplateVariacao[]>();
    for (const v of variacoes) {
      const blocoNum = v.bloco ?? 0;
      if (!blocosMap.has(blocoNum)) {
        blocosMap.set(blocoNum, []);
      }
      blocosMap.get(blocoNum)!.push(v);
    }
    return Array.from(blocosMap.entries()).sort(([a], [b]) => a - b).map(([blocoNum, vars]) => ({
      blocoNum,
      variacoes: vars.sort((a, b) => a.ordem - b.ordem)
    }));
  };
  if (isLoading) {
    return <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>;
  }
  return <div className="space-y-4">
      <div className="flex items-center justify-start pb-2">
        <Button size="sm" onClick={openCreateDialog} className="gap-1">
          <Plus className="h-4 w-4" />
          Novo Template
        </Button>
      </div>

      {templates.length === 0 ? <Card>
          <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12">
            <FileText className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center text-sm sm:text-base">
              Nenhum template criado ainda.
              <br />
              Crie seu primeiro template para usar nas campanhas.
            </p>
          </CardContent>
        </Card> : <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(template => {
        const {
          blocosCount,
          variacoesCount
        } = getTemplateSummary(template);
        
        // Get unique media types from all variations
        const mediaTypes = new Set<string>();
        template.variacoes?.forEach(v => mediaTypes.add(v.tipo_mensagem));
        
        // Get first text content for preview
        const firstTextVariation = template.variacoes?.find(v => v.mensagem);
        
        return <Card key={template.id} className="group hover:shadow-md transition-shadow">
                <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm sm:text-base font-semibold truncate">{template.nome}</CardTitle>
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                        Criado em {new Date(template.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex gap-0.5 sm:gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => openPreviewDialog(template)} title="Pré-visualizar">
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => handleDuplicate(template)} title="Duplicar">
                        <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8" onClick={() => openEditDialog(template)} title="Editar">
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive" onClick={() => {
                  setTemplateToDelete(template.id);
                  setDeleteDialogOpen(true);
                }} title="Excluir">
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3 sm:p-4 pt-0 space-y-2 sm:space-y-3">
                  {/* Preview text */}
                  {firstTextVariation?.mensagem && (
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 bg-muted/50 rounded-md p-1.5 sm:p-2 italic">
                      "{firstTextVariation.mensagem}"
                    </p>
                  )}
                  
                  {/* Stats row */}
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    <Badge variant="secondary" className="text-[10px] sm:text-xs font-normal px-1.5 sm:px-2 py-0.5">
                      <Layers className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                      {blocosCount} bloco{blocosCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] sm:text-xs font-normal px-1.5 sm:px-2 py-0.5">
                      <Shuffle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                      {variacoesCount} variação{variacoesCount !== 1 ? "ões" : ""}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] sm:text-xs font-normal px-1.5 sm:px-2 py-0.5">
                      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                      {template.delay_bloco_min}-{template.delay_bloco_max}s
                    </Badge>
                  </div>
                  
                  {/* Media types */}
                  <div className="flex items-center gap-1.5 sm:gap-2 pt-1 sm:pt-1 border-t">
                    <span className="text-[10px] sm:text-xs text-muted-foreground">Tipos:</span>
                    <div className="flex gap-0.5 sm:gap-1">
                      {mediaTypes.has("text") && (
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center" title="Texto">
                          <MessageSquare className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-blue-600 dark:text-blue-400" />
                        </div>
                      )}
                      {mediaTypes.has("image") && (
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-green-100 dark:bg-green-900/30 flex items-center justify-center" title="Imagem">
                          <Image className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-green-600 dark:text-green-400" />
                        </div>
                      )}
                      {mediaTypes.has("audio") && (
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center" title="Áudio">
                          <Music className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-purple-600 dark:text-purple-400" />
                        </div>
                      )}
                      {mediaTypes.has("video") && (
                        <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-red-100 dark:bg-red-900/30 flex items-center justify-center" title="Vídeo">
                          <Video className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-red-600 dark:text-red-400" />
                        </div>
                      )}
                      {mediaTypes.has("document") && (
                        <div className="w-6 h-6 rounded bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center" title="Documento">
                          <FileText className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>;
      })}
        </div>}

      {/* Preview Dialog - WhatsApp Style */}
      <Dialog open={previewDialogOpen} onOpenChange={(open) => {
        setPreviewDialogOpen(open);
        if (!open) {
          setDialogPreviewMessages({});
        }
      }}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0 [&>button]:text-foreground [&>button]:top-3 [&>button]:right-3">
          {/* Header with generate button */}
          <div className="p-3 border-b bg-background flex items-center gap-2">
            <p className="font-medium text-sm">Prévia do Disparo - {previewTemplate?.nome}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={generateDialogRandomPreview}
              className="h-6 w-6"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* WhatsApp-style header - from sender's perspective */}
            <div className="bg-[#075E54] text-white p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
                C
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">Cliente</p>
                <p className="text-[10px] text-white/70">online</p>
              </div>
            </div>

            {/* WhatsApp-style chat background */}
            {previewTemplate && <div className="p-4 min-h-[300px] max-h-[60vh] overflow-y-auto relative" style={{
            backgroundColor: "#ECE5DD",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
          }}>
                {/* Delay badge - top left, shown once */}
                {groupVariacoesByBloco(previewTemplate.variacoes || []).length > 1 && <div className="absolute top-2 left-2">
                    <span className="bg-[#FFF3CD] text-[#856404] text-[10px] px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
                      ⏱️ {previewTemplate.delay_bloco_min}s - {previewTemplate.delay_bloco_max}s entre blocos
                    </span>
                  </div>}
                
                <div className="space-y-4 pt-6" key={dialogPreviewKey}>
                  {/* Show generated preview if available */}
                  {Object.keys(dialogPreviewMessages).length > 0 ? (
                    groupVariacoesByBloco(previewTemplate.variacoes || []).map(({ blocoNum }) => {
                      const preview = dialogPreviewMessages[blocoNum];
                      if (!preview) return null;
                      
                      return (
                        <div key={`${blocoNum}-preview`} className="space-y-2">
                          {groupVariacoesByBloco(previewTemplate.variacoes || []).length > 1 && (
                            <div className="flex justify-center">
                              <span className="bg-[#E1F3FB] text-[#54656F] text-xs px-3 py-1 rounded-full shadow-sm">
                                Bloco {blocoNum + 1}
                              </span>
                            </div>
                          )}
                          
                          <div className="flex justify-end">
                            <div className="max-w-[85%] bg-[#D9FDD3] rounded-lg shadow-sm">
                              <div className="p-2">
                                {preview.tipo === "image" && preview.mediaBase64 && (
                                  <img src={preview.mediaBase64} alt="Preview" className="rounded-md max-w-full max-h-48 object-contain mb-1" />
                                )}
                                {preview.tipo === "video" && preview.mediaBase64 && (
                                  <div className="w-full h-20 bg-black/20 rounded flex items-center justify-center mb-1">
                                    <Video className="h-8 w-8 text-white/70" />
                                  </div>
                                )}
                                {preview.tipo === "audio" && preview.mediaBase64 && (
                                  <div className="flex items-center gap-2 py-2 px-1 min-w-[150px]">
                                    <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
                                      <Music className="h-4 w-4 text-white" />
                                    </div>
                                    <div className="flex-1 h-1 bg-[#075E54]/30 rounded-full" />
                                    <span className="text-[10px] text-[#667781]">0:00</span>
                                  </div>
                                )}
                                {preview.tipo === "document" && preview.mediaBase64 && (
                                  <div className="flex items-center gap-2 p-2 bg-[#C8E6C9] rounded mb-1 min-w-[120px]">
                                    <FileText className="h-6 w-6 text-[#075E54]" />
                                    <span className="text-xs text-[#111B21]">Documento</span>
                                  </div>
                                )}

                                {!!preview.text && (
                                  <p className="text-sm text-[#111B21] whitespace-pre-wrap break-words">
                                    {preview.text}
                                  </p>
                                )}

                                <div className="flex justify-end items-center gap-0.5 mt-1">
                                  <span className="text-[10px] text-[#667781]">
                                    {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <svg className="w-3 h-3 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor">
                                    <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    /* Show placeholder or hint to generate */
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Shuffle className="h-6 w-6 text-[#667781]/50" />
                      <span className="text-[#667781] text-xs text-center px-4">
                        Clique no ícone para gerar uma possível mensagem
                      </span>
                    </div>
                  )}
                </div>
              </div>}
              
              {/* Footer - input area */}
              <div className="bg-[#F0F2F5] p-2 flex items-center gap-2">
                <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-[#667781]">
                  Digite uma mensagem
                </div>
                <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z" />
                  </svg>
                </div>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
          <div className="flex flex-col lg:flex-row h-full max-h-[90vh]">
            {/* Form Section */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <DialogHeader className="p-6 pb-2">
                <DialogTitle>
                  {editingTemplate ? "Editar Template" : "Novo Template"}
                </DialogTitle>
                <DialogDescription>
                  Configure blocos e variações de mensagem. Use {"{nome}"} para nome completo, {"{primeironome}"} para primeiro nome e {"{opção1|opção2}"} para variações.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-y-auto px-6 pb-4">
                <div className="space-y-6">
                  <div className="my-[20px]">
                    <Label className="mb-2 block">Nome do Template</Label>
                    <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Boas-vindas, Promoção..." />
                  </div>

                  {/* Delay entre blocos */}
                  <div className="space-y-3 mb-[30px]">
                    <div className="flex items-center gap-2 mt-[30px] my-[20px]">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <Label>Intervalo entre blocos ({delayBlocoMin} a {delayBlocoMax} seg)</Label>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Mínimo: {delayBlocoMin}s</span>
                          <span>Máximo: {delayBlocoMax}s</span>
                        </div>
                        <Slider value={[delayBlocoMin, delayBlocoMax]} min={1} max={30} step={1} onValueChange={([min, max]) => {
                        setDelayBlocoMin(min);
                        setDelayBlocoMax(max);
                      }} />
                      </div>
                    </div>
                  </div>

                  {/* Blocos */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between my-[20px]">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <Label>Blocos de Mensagem ({blocos.length})</Label>
                      </div>
                      <Button size="sm" variant="outline" onClick={addBloco}>
                        <Plus className="h-4 w-4 mr-1" />
                        Adicionar Bloco
                      </Button>
                    </div>

                    {blocos.map((bloco, blocoIndex) => <Collapsible key={bloco.id} open={blocosAbertos[bloco.id]} onOpenChange={open => setBlocosAbertos(prev => ({
                    ...prev,
                    [bloco.id]: open
                  }))}>
                        <Card>
                          <CollapsibleTrigger asChild>
                            <CardHeader className="py-2 px-3 cursor-pointer hover:bg-muted/50">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium text-sm">Bloco {blocoIndex + 1}</span>
                                  <Badge variant="secondary" className="text-xs rounded">
                                    {bloco.variacoes.length} variação{bloco.variacoes.length !== 1 ? "ões" : ""}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => {
                                e.stopPropagation();
                                duplicateBloco(bloco.id);
                              }}>
                                    <Copy className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => {
                                e.stopPropagation();
                                removeBloco(bloco.id);
                              }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                  {blocosAbertos[bloco.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <CardContent className="pt-0 space-y-3">
                              {bloco.variacoes.map((variacao, variacaoIndex) => <Collapsible key={variacao.id} open={variacoesAbertas[variacao.id]} onOpenChange={open => setVariacoesAbertas(prev => ({
                            ...prev,
                            [variacao.id]: open
                          }))}>
                                  <div className="border rounded-lg">
                                    <CollapsibleTrigger asChild>
                                      <div className="flex items-center justify-between p-2 cursor-pointer hover:bg-muted/30">
                                        <div className="flex items-center gap-2">
                                          <Shuffle className="h-3.5 w-3.5 text-muted-foreground" />
                                          <span className="text-sm">Variação {variacaoIndex + 1}</span>
                                          <Badge variant="outline" className="text-xs rounded">
                                            {getTypeIcon(variacao.tipo)}
                                            <span className="ml-1">{getTypeLabel(variacao.tipo)}</span>
                                          </Badge>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={e => {
                                      e.stopPropagation();
                                      removeVariacao(bloco.id, variacao.id);
                                    }}>
                                            <X className="h-3 w-3" />
                                          </Button>
                                          {variacoesAbertas[variacao.id] ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                        </div>
                                      </div>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <div className="p-3 pt-0 space-y-3">
                                        <Select value={variacao.tipo} onValueChange={v => updateVariacao(bloco.id, variacao.id, {
                                    tipo: v as any,
                                    mediaFile: null,
                                    mediaPreview: null,
                                    mediaBase64: null
                                  })}>
                                          <SelectTrigger className="h-8">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="text">Texto</SelectItem>
                                            <SelectItem value="image">Imagem</SelectItem>
                                            <SelectItem value="video">Vídeo</SelectItem>
                                            <SelectItem value="audio">Áudio (PTT)</SelectItem>
                                            <SelectItem value="document">Documento</SelectItem>
                                          </SelectContent>
                                        </Select>

                                        {variacao.tipo !== "audio" && <Textarea value={variacao.mensagem} onChange={e => updateVariacao(bloco.id, variacao.id, {
                                    mensagem: e.target.value
                                  })} placeholder={variacao.tipo === "text" ? "Digite a mensagem..." : "Legenda (opcional)..."} rows={3} className="text-sm" />}

                                        {variacao.tipo !== "text" && <div>
                                            <input ref={el => {
                                      mediaInputRefs.current[`${bloco.id}-${variacao.id}`] = el;
                                    }} type="file" accept={getAcceptedFileTypes(variacao.tipo)} onChange={e => handleMediaChange(bloco.id, variacao.id, e)} className="hidden" />

                                            {variacao.mediaPreview ? <div className="relative">
                                                {variacao.tipo === "image" && <img src={variacao.mediaPreview} alt="Preview" className="rounded-md max-h-32 object-contain" />}
                                                {variacao.tipo === "video" && <video src={variacao.mediaPreview} className="rounded-md max-h-32" controls />}
                                                {variacao.tipo === "audio" && <audio src={variacao.mediaPreview} controls className="w-full" />}
                                                {variacao.tipo === "document" && <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                                    <FileText className="h-5 w-5" />
                                                    <span className="text-sm truncate">{variacao.mediaFile?.name || "Documento"}</span>
                                                  </div>}
                                                <Button variant="destructive" size="icon" className="absolute top-1 right-1 h-6 w-6" onClick={() => clearMedia(bloco.id, variacao.id)}>
                                                  <X className="h-3 w-3" />
                                                </Button>
                                              </div> : <Button variant="outline" size="sm" className="w-full" onClick={() => mediaInputRefs.current[`${bloco.id}-${variacao.id}`]?.click()}>
                                                Selecionar {getTypeLabel(variacao.tipo)}
                                              </Button>}
                                          </div>}
                                      </div>
                                    </CollapsibleContent>
                                  </div>
                                </Collapsible>)}

                              <Button size="sm" variant="ghost" className="w-full" onClick={() => addVariacao(bloco.id)}>
                                <Plus className="h-4 w-4 mr-1" />
                                Adicionar Variação
                              </Button>
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>)}
                  </div>
                </div>
              </div>

              <DialogFooter className="p-6 pt-4 border-t">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? "Salvando..." : editingTemplate ? "Salvar" : "Criar"}
                </Button>
              </DialogFooter>
            </div>

            {/* Live Preview Section - Desktop only */}
            <div className="hidden lg:flex w-80 border-l flex-col bg-muted/30">
              <div className="p-3 border-b bg-background flex items-center gap-2">
                <p className="font-medium text-sm">Prévia do Disparo</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={generateFormRandomPreview}
                  className="h-6 w-6"
                  disabled={blocos.length === 0 || blocos.every(b => b.variacoes.every(v => !(v.tipo === "text" && v.mensagem) && !(v.tipo !== "text" && (v.mediaPreview || v.mediaBase64))))}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </div>
              
              <div className="flex-1 overflow-hidden flex flex-col min-h-[300px] lg:min-h-0">
                {/* WhatsApp-style header - from sender's perspective */}
                <div className="bg-[#075E54] text-white p-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">
                    C
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">Cliente</p>
                    <p className="text-[10px] text-white/70">online</p>
                  </div>
                </div>

                {/* Chat area */}
                <div className="flex-1 overflow-y-auto p-3 relative" style={{
                backgroundColor: "#ECE5DD",
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
              }}>
                  {/* Delay badge */}
                  {blocos.length > 1 && <div className="absolute top-1 left-1">
                      <span className="bg-[#FFF3CD] text-[#856404] text-[9px] px-1.5 py-0.5 rounded-full shadow-sm">
                        ⏱️ {delayBlocoMin}s - {delayBlocoMax}s entre blocos
                      </span>
                    </div>}
                  
                  <div className="space-y-3 pt-4" key={formPreviewKey}>
                    {/* Show generated preview if available */}
                    {Object.keys(formPreviewMessages).length > 0 ? (
                      blocos.map((bloco, blocoIndex) => {
                        const preview = formPreviewMessages[blocoIndex];
                        if (!preview) return null;
                        
                        return (
                          <div key={`${bloco.id}-preview`} className="space-y-2">
                            {blocos.length > 1 && (
                              <div className="flex justify-center">
                                <span className="bg-[#E1F3FB] text-[#54656F] text-[10px] px-2 py-0.5 rounded-full shadow-sm">
                                  Bloco {blocoIndex + 1}
                                </span>
                              </div>
                            )}
                            
                            <div className="flex justify-end">
                              <div className="max-w-[90%] bg-[#D9FDD3] rounded-lg shadow-sm">
                                <div className="p-2">
                                  {preview.tipo === "image" && preview.mediaPreview && (
                                    <img src={preview.mediaPreview} alt="Preview" className="rounded max-h-32 object-contain mb-1" />
                                  )}
                                  {preview.tipo === "video" && preview.mediaPreview && (
                                    <div className="w-full h-20 bg-black/20 rounded flex items-center justify-center mb-1">
                                      <Video className="h-8 w-8 text-white/70" />
                                    </div>
                                  )}
                                  {preview.tipo === "audio" && preview.mediaPreview && (
                                    <div className="flex items-center gap-2 py-2 px-1 min-w-[150px]">
                                      <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0">
                                        <Music className="h-4 w-4 text-white" />
                                      </div>
                                      <div className="flex-1 h-1 bg-[#075E54]/30 rounded-full" />
                                      <span className="text-[10px] text-[#667781]">0:00</span>
                                    </div>
                                  )}
                                  {preview.tipo === "document" && preview.mediaPreview && (
                                    <div className="flex items-center gap-2 p-2 bg-[#C8E6C9] rounded mb-1 min-w-[120px]">
                                      <FileText className="h-6 w-6 text-[#075E54]" />
                                      <span className="text-xs text-[#111B21]">Documento</span>
                                    </div>
                                  )}

                                  {!!preview.text && (
                                    <p className="text-xs text-[#111B21] whitespace-pre-wrap break-words">
                                      {preview.text}
                                    </p>
                                  )}

                                  <div className="flex justify-end items-center gap-0.5 mt-1">
                                    <span className="text-[9px] text-[#667781]">00:00</span>
                                    <svg className="w-3 h-3 text-[#53BDEB]" viewBox="0 0 16 15" fill="currentColor">
                                      <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.48a.418.418 0 0 0 .036.54l1.32 1.267a.32.32 0 0 0 .484-.034l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.516.005l-.423.433a.364.364 0 0 0 .006.514l3.255 3.185a.32.32 0 0 0 .484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      /* Show placeholder or hint to generate */
                      <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <Shuffle className="h-6 w-6 text-[#667781]/50" />
                        <span className="text-[#667781] text-xs text-center px-4">
                          {blocos.length === 0 || blocos.every(b => b.variacoes.every(v => !(v.tipo === "text" && v.mensagem) && !(v.tipo !== "text" && (v.mediaPreview || v.mediaBase64)))) 
                            ? "Adicione conteúdo para ver a prévia"
                            : "Clique em \"Gerar\" para ver uma possível mensagem"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer - client's input area */}
                <div className="bg-[#F0F2F5] p-2 flex items-center gap-2">
                  <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-[#667781]">
                    Digite uma mensagem
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z" />
                      <path d="M17 12c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir template?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O template será excluído permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}