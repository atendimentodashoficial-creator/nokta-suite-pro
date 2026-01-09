import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { Upload, FileText, Image, Video, Music, X, Plus, Trash2, Users, Kanban, Phone, Shuffle, ChevronDown, ChevronUp, Layers, Copy, FileDown, List, ClipboardPaste, Database, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhoneNumber } from "@/utils/whatsapp";
import { expandSpintax, processSpintaxRandom } from "@/utils/spintax";
interface TemplateData {
  id: string;
  nome: string;
  delay_bloco_min: number;
  delay_bloco_max: number;
  variacoes?: {
    bloco: number;
    ordem: number;
    tipo_mensagem: string;
    mensagem: string | null;
    media_base64: string | null;
  }[];
}
interface NovaCampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCampanhaCriada: () => void;
}
interface Contato {
  numero: string;
  nome?: string;
}
interface KanbanColumn {
  id: string;
  nome: string;
  cor: string;
}
interface ListaExtrator {
  id: string;
  nome: string;
  dados: any[];
  total_contatos: number;
}
interface DisparosInstancia {
  id: string;
  nome: string;
  base_url: string;
  is_active: boolean;
}
interface MensagemVariacao {
  id: string;
  tipo: "text" | "image" | "audio" | "video" | "document";
  mensagem: string;
  mediaFile: File | null;
  mediaPreview: string | null;
}
interface BlocoMensagem {
  id: string;
  variacoes: MensagemVariacao[];
}
export function NovaCampanhaDialog({
  open,
  onOpenChange,
  onCampanhaCriada
}: NovaCampanhaDialogProps) {
  const {
    user
  } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [nome, setNome] = useState("");
  const [blocos, setBlocos] = useState<BlocoMensagem[]>([]);
  const [blocosAbertos, setBlocosAbertos] = useState<Record<string, boolean>>({});
  const [variacoesAbertas, setVariacoesAbertas] = useState<Record<string, boolean>>({});
  const [delayMin, setDelayMin] = useState(1);
  const [delayMax, setDelayMax] = useState(5);
  const [delayUnit, setDelayUnit] = useState<"seconds" | "minutes">("minutes");

  // Delay entre blocos
  const [delayBlocoMin, setDelayBlocoMin] = useState(3);
  const [delayBlocoMax, setDelayBlocoMax] = useState(8);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [novoNumero, setNovoNumero] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Data sources
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);
  const [disparosKanbanColumns, setDisparosKanbanColumns] = useState<KanbanColumn[]>([]);
  const [loadingDataSource, setLoadingDataSource] = useState(false);

  // Import dialog
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Date filter for imports
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<"leads" | "clientes" | "kanban_whatsapp" | "kanban_disparos" | "kanban_whatsapp_leads" | "kanban_disparos_leads" | null>(null);
  const [selectedKanbanColumnId, setSelectedKanbanColumnId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Instâncias
  const [instancias, setInstancias] = useState<DisparosInstancia[]>([]);
  const [selectedInstancias, setSelectedInstancias] = useState<string[]>([]);
  const [whatsappInstanciaId, setWhatsappInstanciaId] = useState<string | null>(null);

  // Templates
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [templateImported, setTemplateImported] = useState(false);

  // Listas do extrator
  const [listasExtrator, setListasExtrator] = useState<ListaExtrator[]>([]);

  // Preview state - stores randomly generated messages for each block
  const [previewMessages, setPreviewMessages] = useState<Record<number, { variacaoIdx: number; text: string; mediaPreview?: string | null; tipo: string }>>({});
  const [previewKey, setPreviewKey] = useState(0);

  // Generate random preview for all blocks
  const generateRandomPreview = useCallback(() => {
    const newPreview: Record<number, { variacaoIdx: number; text: string; mediaPreview?: string | null; tipo: string }> = {};
    
    blocos.forEach((bloco, blocoIndex) => {
      // Filter variations with content
      const validVariacoes = bloco.variacoes.filter(v => 
        (v.tipo === "text" && v.mensagem) || (v.tipo !== "text" && v.mediaPreview)
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
          mediaPreview: selectedVariacao.mediaPreview,
          tipo: selectedVariacao.tipo
        };
      }
    });
    
    setPreviewMessages(newPreview);
    setPreviewKey(prev => prev + 1);
  }, [blocos]);

  // Initialize first block and variation as open (only for manually added blocks, not template imports)
  useEffect(() => {
    if (blocos.length > 0 && Object.keys(blocosAbertos).length === 0 && !templateImported) {
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
  }, [blocos, templateImported]);

  // Load data on mount
  useEffect(() => {
    if (open && user) {
      loadKanbanColumns();
      loadDisparosKanbanColumns();
      loadInstancias();
      loadTemplates();
      loadListasExtrator();
    }
  }, [open, user]);
  const loadTemplates = async () => {
    if (!user) return;
    try {
      const {
        data: templatesData
      } = await supabase.from("disparos_templates").select("*").eq("user_id", user.id).order("created_at", {
        ascending: false
      });
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
    } catch (error) {
      console.error("Error loading templates:", error);
    }
  };
  const loadKanbanColumns = async () => {
    if (!user) return;
    const {
      data
    } = await supabase.from("whatsapp_kanban_columns").select("id, nome, cor").eq("user_id", user.id).eq("ativo", true).order("ordem");
    if (data) setKanbanColumns(data);
  };
  const loadDisparosKanbanColumns = async () => {
    if (!user) return;
    const {
      data
    } = await supabase.from("disparos_kanban_columns").select("id, nome, cor").eq("user_id", user.id).eq("ativo", true).order("ordem");
    if (data) setDisparosKanbanColumns(data);
  };
  const loadInstancias = async () => {
    if (!user) return;
    
    // First, get the WhatsApp main instance ID to exclude from default selection
    const { data: uazapiConfig } = await supabase
      .from("uazapi_config")
      .select("whatsapp_instancia_id")
      .eq("user_id", user.id)
      .maybeSingle();
    
    const whatsappMainId = uazapiConfig?.whatsapp_instancia_id || null;
    setWhatsappInstanciaId(whatsappMainId);
    
    const { data } = await supabase
      .from("disparos_instancias")
      .select("id, nome, base_url, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at");
    
    if (data) {
      setInstancias(data);
      if (data.length > 0 && selectedInstancias.length === 0) {
        // Exclude WhatsApp main instance from default selection
        const defaultSelected = data
          .filter(i => i.id !== whatsappMainId)
          .map(i => i.id);
        setSelectedInstancias(defaultSelected);
      }
    }
  };
  const loadListasExtrator = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("listas_extrator")
        .select("id, nome, dados, total_contatos")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) {
        const parsedListas = data.map(l => ({
          ...l,
          dados: typeof l.dados === 'string' ? JSON.parse(l.dados) : l.dados
        }));
        setListasExtrator(parsedListas);
      }
    } catch (error) {
      console.error("Error loading listas extrator:", error);
    }
  };
  const toggleInstancia = (id: string) => {
    setSelectedInstancias(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  const importTemplate = (template: TemplateData) => {
    if (!template.variacoes || template.variacoes.length === 0) {
      toast.error("Template não tem variações configuradas");
      return;
    }

    // Group variations by block
    const blocosMap = new Map<number, MensagemVariacao[]>();
    for (const v of template.variacoes) {
      const blocoNum = v.bloco ?? 0;
      if (!blocosMap.has(blocoNum)) {
        blocosMap.set(blocoNum, []);
      }
      blocosMap.get(blocoNum)!.push({
        id: crypto.randomUUID(),
        tipo: v.tipo_mensagem as MensagemVariacao["tipo"],
        mensagem: v.mensagem || "",
        mediaFile: null,
        mediaPreview: v.media_base64
      });
    }
    const novoBlocos: BlocoMensagem[] = Array.from(blocosMap.entries()).sort(([a], [b]) => a - b).map(([_, vars]) => ({
      id: crypto.randomUUID(),
      variacoes: vars
    }));
    if (novoBlocos.length === 0) {
      toast.error("Template sem conteúdo");
      return;
    }
    setBlocos(novoBlocos);
    setDelayBlocoMin(template.delay_bloco_min || 3);
    setDelayBlocoMax(template.delay_bloco_max || 8);

    // All blocks come minimized by default
    setTemplateImported(true);
    setBlocosAbertos({});
    setVariacoesAbertas({});
    setShowTemplateSelector(false);
    toast.success(`Template "${template.nome}" importado!`);
  };

  // Bloco functions
  const addBloco = () => {
    const newBlocoId = crypto.randomUUID();
    const newVariacaoId = crypto.randomUUID();
    setBlocos(prev => [...prev, {
      id: newBlocoId,
      variacoes: [{
        id: newVariacaoId,
        tipo: "text",
        mensagem: "",
        mediaFile: null,
        mediaPreview: null
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
      toast.error("É necessário ter pelo menos um bloco de mensagem");
      return;
    }
    setBlocos(prev => prev.filter(b => b.id !== blocoId));
    setBlocosAbertos(prev => {
      const newState = {
        ...prev
      };
      delete newState[blocoId];
      return newState;
    });
  };
  const toggleBlocoAberto = (blocoId: string) => {
    setBlocosAbertos(prev => ({
      ...prev,
      [blocoId]: !prev[blocoId]
    }));
  };

  // Variação functions within a block
  const addVariacao = (blocoId: string) => {
    const newId = crypto.randomUUID();
    setBlocos(prev => prev.map(b => {
      if (b.id === blocoId) {
        return {
          ...b,
          variacoes: [...b.variacoes, {
            id: newId,
            tipo: "text",
            mensagem: "",
            mediaFile: null,
            mediaPreview: null
          }]
        };
      }
      return b;
    }));
    setVariacoesAbertas(prev => ({
      ...prev,
      [newId]: true
    }));
  };
  const removeVariacao = (blocoId: string, variacaoId: string) => {
    const bloco = blocos.find(b => b.id === blocoId);
    if (!bloco || bloco.variacoes.length <= 1) {
      toast.error("É necessário ter pelo menos uma variação por bloco");
      return;
    }
    setBlocos(prev => prev.map(b => {
      if (b.id === blocoId) {
        return {
          ...b,
          variacoes: b.variacoes.filter(v => v.id !== variacaoId)
        };
      }
      return b;
    }));
    setVariacoesAbertas(prev => {
      const newState = {
        ...prev
      };
      delete newState[variacaoId];
      return newState;
    });
  };
  const updateVariacao = (blocoId: string, variacaoId: string, updates: Partial<MensagemVariacao>) => {
    setBlocos(prev => prev.map(b => {
      if (b.id === blocoId) {
        return {
          ...b,
          variacoes: b.variacoes.map(v => v.id === variacaoId ? {
            ...v,
            ...updates
          } : v)
        };
      }
      return b;
    }));
  };
  const toggleVariacaoAberta = (variacaoId: string) => {
    setVariacoesAbertas(prev => ({
      ...prev,
      [variacaoId]: !prev[variacaoId]
    }));
  };
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const novosContatos: Contato[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;]/);
        const numero = normalizePhoneNumber(parts[0]?.trim() || "");
        const nome = parts[1]?.trim();
        if (numero && numero.length >= 8) {
          novosContatos.push({
            numero,
            nome
          });
        }
      }
      if (novosContatos.length === 0) {
        toast.error("Nenhum contato válido encontrado no arquivo");
        return;
      }
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} contato(s) importado(s)`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  const handleMediaUpload = (blocoId: string, variacaoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const bloco = blocos.find(b => b.id === blocoId);
    const variacao = bloco?.variacoes.find(v => v.id === variacaoId);
    if (!variacao) return;
    const validTypes: Record<string, string[]> = {
      image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
      audio: ["audio/mpeg", "audio/ogg", "audio/wav", "audio/mp4"],
      video: ["video/mp4", "video/3gpp", "video/quicktime"],
      document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    };
    if (!validTypes[variacao.tipo]?.includes(file.type)) {
      toast.error(`Tipo de arquivo inválido para ${variacao.tipo}`);
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 16MB");
      return;
    }
    let preview: string | null = null;
    if (variacao.tipo === "image" || variacao.tipo === "video") {
      preview = URL.createObjectURL(file);
    } else {
      preview = file.name;
    }
    updateVariacao(blocoId, variacaoId, {
      mediaFile: file,
      mediaPreview: preview
    });
  };
  const addContato = () => {
    if (!novoNumero.trim()) {
      toast.error("Digite um número");
      return;
    }
    const numero = normalizePhoneNumber(novoNumero);
    if (numero.length < 8) {
      toast.error("Número inválido");
      return;
    }
    if (contatos.some(c => c.numero === numero)) {
      toast.error("Número já adicionado");
      return;
    }
    setContatos(prev => [...prev, {
      numero,
      nome: novoNome.trim() || undefined
    }]);
    setNovoNumero("");
    setNovoNome("");
  };
  const removeContato = (numero: string) => {
    setContatos(prev => prev.filter(c => c.numero !== numero));
  };
  const clearAll = () => {
    setContatos([]);
  };
  const exportContatos = () => {
    if (contatos.length === 0) {
      toast.error("Nenhum contato para exportar");
      return;
    }
    const csvContent = "numero,nome\n" + contatos.map(c => `${c.numero},${c.nome || ""}`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contatos_campanha_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Lista exportada com sucesso!");
  };
  const openDateFilterForLeads = () => {
    setDateFilterType("leads");
    setSelectedKanbanColumnId(null);
    setShowDateFilter(true);
  };
  const openDateFilterForClientes = () => {
    setDateFilterType("clientes");
    setSelectedKanbanColumnId(null);
    setShowDateFilter(true);
  };
  const openDateFilterForKanbanWhatsApp = (columnId: string) => {
    setDateFilterType("kanban_whatsapp");
    setSelectedKanbanColumnId(columnId);
    setShowDateFilter(true);
  };
  const openDateFilterForKanbanDisparos = (columnId: string) => {
    setDateFilterType("kanban_disparos");
    setSelectedKanbanColumnId(columnId);
    setShowDateFilter(true);
  };
  const openDateFilterForKanbanWhatsAppLeads = () => {
    setDateFilterType("kanban_whatsapp_leads");
    setSelectedKanbanColumnId(null);
    setShowDateFilter(true);
  };
  const openDateFilterForKanbanDisparosLeads = () => {
    setDateFilterType("kanban_disparos_leads");
    setSelectedKanbanColumnId(null);
    setShowDateFilter(true);
  };
  const importFromLeads = async (filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      let query = supabase.from("leads").select("nome, telefone, created_at").eq("user_id", user.id).eq("status", "lead").is("deleted_at", null);
      if (filterByDate && dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00`);
      }
      if (filterByDate && dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59`);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      const novosContatos: Contato[] = (data || []).filter(l => l.telefone).map(l => ({
        numero: normalizePhoneNumber(l.telefone),
        nome: l.nome
      })).filter(c => c.numero.length >= 8);
      if (novosContatos.length === 0) {
        toast.info("Nenhum lead com telefone válido encontrado");
        return;
      }
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} lead(s) importado(s)`);
      setShowDateFilter(false);
      setDateFrom("");
      setDateTo("");
    } catch (error: any) {
      toast.error("Erro ao importar leads");
    } finally {
      setLoadingDataSource(false);
    }
  };
  const importFromClientes = async (filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      let query = supabase.from("leads").select("nome, telefone, created_at").eq("user_id", user.id).eq("status", "cliente").is("deleted_at", null);
      if (filterByDate && dateFrom) {
        query = query.gte("created_at", `${dateFrom}T00:00:00`);
      }
      if (filterByDate && dateTo) {
        query = query.lte("created_at", `${dateTo}T23:59:59`);
      }
      const {
        data,
        error
      } = await query;
      if (error) throw error;
      const novosContatos: Contato[] = (data || []).filter(l => l.telefone).map(l => ({
        numero: normalizePhoneNumber(l.telefone),
        nome: l.nome
      })).filter(c => c.numero.length >= 8);
      if (novosContatos.length === 0) {
        toast.info("Nenhum cliente com telefone válido encontrado");
        return;
      }
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} cliente(s) importado(s)`);
      setShowDateFilter(false);
      setDateFrom("");
      setDateTo("");
    } catch (error: any) {
      toast.error("Erro ao importar clientes");
    } finally {
      setLoadingDataSource(false);
    }
  };
  const importFromKanbanColumn = async (columnId: string, filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      const {
        data: kanbanData,
        error: kanbanError
      } = await supabase.from("whatsapp_chat_kanban").select("chat_id").eq("user_id", user.id).eq("column_id", columnId);
      if (kanbanError) throw kanbanError;
      if (!kanbanData || kanbanData.length === 0) {
        toast.info("Nenhum chat nesta coluna");
        return;
      }
      const chatIds = kanbanData.map(k => k.chat_id);
      
      let query = supabase
        .from("whatsapp_chats")
        .select("contact_name, contact_number, last_message_time")
        .in("id", chatIds)
        .is("deleted_at", null);
      
      if (filterByDate && dateFrom) {
        query = query.gte("last_message_time", `${dateFrom}T00:00:00`);
      }
      if (filterByDate && dateTo) {
        query = query.lte("last_message_time", `${dateTo}T23:59:59`);
      }
      
      const { data: chatsData, error: chatsError } = await query;
      if (chatsError) throw chatsError;
      
      const novosContatos: Contato[] = (chatsData || []).filter(c => c.contact_number).map(c => ({
        numero: normalizePhoneNumber(c.contact_number),
        nome: c.contact_name
      })).filter(c => c.numero.length >= 8);
      if (novosContatos.length === 0) {
        toast.info("Nenhum contato válido nesta coluna" + (filterByDate ? " no período selecionado" : ""));
        return;
      }
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} contato(s) importado(s) do Kanban WhatsApp`);
      setShowDateFilter(false);
      setDateFrom("");
      setDateTo("");
    } catch (error: any) {
      toast.error("Erro ao importar do Kanban");
    } finally {
      setLoadingDataSource(false);
    }
  };
  const importFromDisparosKanbanColumn = async (columnId: string, filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      const {
        data: kanbanData,
        error: kanbanError
      } = await supabase.from("disparos_chat_kanban").select("chat_id").eq("user_id", user.id).eq("column_id", columnId);
      if (kanbanError) throw kanbanError;
      if (!kanbanData || kanbanData.length === 0) {
        toast.info("Nenhum chat nesta coluna");
        return;
      }
      const chatIds = kanbanData.map(k => k.chat_id);
      
      let query = supabase
        .from("disparos_chats")
        .select("contact_name, contact_number, last_message_time")
        .in("id", chatIds)
        .is("deleted_at", null);
      
      if (filterByDate && dateFrom) {
        query = query.gte("last_message_time", `${dateFrom}T00:00:00`);
      }
      if (filterByDate && dateTo) {
        query = query.lte("last_message_time", `${dateTo}T23:59:59`);
      }
      
      const { data: chatsData, error: chatsError } = await query;
      if (chatsError) throw chatsError;
      
      const novosContatos: Contato[] = (chatsData || []).filter(c => c.contact_number).map(c => ({
        numero: normalizePhoneNumber(c.contact_number),
        nome: c.contact_name
      })).filter(c => c.numero.length >= 8);
      if (novosContatos.length === 0) {
        toast.info("Nenhum contato válido nesta coluna" + (filterByDate ? " no período selecionado" : ""));
        return;
      }
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} contato(s) importado(s) do Kanban Disparos`);
      setShowDateFilter(false);
      setDateFrom("");
      setDateTo("");
    } catch (error: any) {
      toast.error("Erro ao importar do Kanban Disparos");
    } finally {
      setLoadingDataSource(false);
    }
  };

  // Import from WhatsApp Kanban "Leads" (unassigned chats)
  const importFromKanbanWhatsAppLeads = async (filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      // Get all chat IDs that ARE assigned to any column
      const { data: assignedData } = await supabase
        .from("whatsapp_chat_kanban")
        .select("chat_id")
        .eq("user_id", user.id);
      
      const assignedChatIds = new Set((assignedData || []).map(k => k.chat_id));
      
      // Get all chats and filter out the assigned ones
      let query = supabase
        .from("whatsapp_chats")
        .select("id, contact_name, contact_number, last_message_time")
        .eq("user_id", user.id)
        .is("deleted_at", null);
      
      if (filterByDate && dateFrom) {
        query = query.gte("last_message_time", `${dateFrom}T00:00:00`);
      }
      if (filterByDate && dateTo) {
        query = query.lte("last_message_time", `${dateTo}T23:59:59`);
      }
      
      const { data: chatsData, error: chatsError } = await query;
      if (chatsError) throw chatsError;
      
      const unassignedChats = (chatsData || []).filter(c => !assignedChatIds.has(c.id));
      
      const novosContatos: Contato[] = unassignedChats
        .filter(c => c.contact_number)
        .map(c => ({
          numero: normalizePhoneNumber(c.contact_number),
          nome: c.contact_name
        }))
        .filter(c => c.numero.length >= 8);
      
      if (novosContatos.length === 0) {
        toast.info("Nenhum contato válido na aba Leads" + (filterByDate ? " no período selecionado" : ""));
        return;
      }
      
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} contato(s) importado(s) da aba Leads (WhatsApp)`);
      setShowDateFilter(false);
      setDateFrom("");
      setDateTo("");
    } catch (error: any) {
      toast.error("Erro ao importar da aba Leads WhatsApp");
    } finally {
      setLoadingDataSource(false);
    }
  };

  // Import from Disparos Kanban "Leads" (unassigned chats)
  const importFromKanbanDisparosLeads = async (filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      // Get all chat IDs that ARE assigned to any column
      const { data: assignedData } = await supabase
        .from("disparos_chat_kanban")
        .select("chat_id")
        .eq("user_id", user.id);
      
      const assignedChatIds = new Set((assignedData || []).map(k => k.chat_id));
      
      // Get all chats and filter out the assigned ones
      let query = supabase
        .from("disparos_chats")
        .select("id, contact_name, contact_number, last_message_time")
        .eq("user_id", user.id)
        .is("deleted_at", null);
      
      if (filterByDate && dateFrom) {
        query = query.gte("last_message_time", `${dateFrom}T00:00:00`);
      }
      if (filterByDate && dateTo) {
        query = query.lte("last_message_time", `${dateTo}T23:59:59`);
      }
      
      const { data: chatsData, error: chatsError } = await query;
      if (chatsError) throw chatsError;
      
      const unassignedChats = (chatsData || []).filter(c => !assignedChatIds.has(c.id));
      
      const novosContatos: Contato[] = unassignedChats
        .filter(c => c.contact_number)
        .map(c => ({
          numero: normalizePhoneNumber(c.contact_number),
          nome: c.contact_name
        }))
        .filter(c => c.numero.length >= 8);
      
      if (novosContatos.length === 0) {
        toast.info("Nenhum contato válido na aba Leads" + (filterByDate ? " no período selecionado" : ""));
        return;
      }
      
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      toast.success(`${novosContatos.length} contato(s) importado(s) da aba Leads (Disparos)`);
      setShowDateFilter(false);
      setDateFrom("");
      setDateTo("");
    } catch (error: any) {
      toast.error("Erro ao importar da aba Leads Disparos");
    } finally {
      setLoadingDataSource(false);
    }
  };

  const importFromListaExtrator = (lista: ListaExtrator) => {
    const novosContatos: Contato[] = (lista.dados || [])
      .filter((item: any) => item.phone)
      .map((item: any) => ({
        numero: normalizePhoneNumber(item.phone),
        nome: item.name
      }))
      .filter(c => c.numero.length >= 8);

    if (novosContatos.length === 0) {
      toast.info("Nenhum contato válido nesta lista");
      return;
    }

    setContatos(prev => {
      const existingNumbers = new Set(prev.map(c => c.numero));
      const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
      return [...prev, ...unique];
    });

    toast.success(`${novosContatos.length} contato(s) importado(s) da lista "${lista.nome}"`);
    setShowImportDialog(false);
  };

  const handleSubmit = async () => {
    if (!nome.trim()) {
      toast.error("Digite o nome da campanha");
      return;
    }
    if (selectedInstancias.length === 0) {
      toast.error("Selecione pelo menos uma instância");
      return;
    }
    if (contatos.length === 0) {
      toast.error("Adicione pelo menos um contato");
      return;
    }

    // Validate all blocks and variations
    for (let bi = 0; bi < blocos.length; bi++) {
      const bloco = blocos[bi];
      for (let vi = 0; vi < bloco.variacoes.length; vi++) {
        const v = bloco.variacoes[vi];
        if (v.tipo === "text" && !v.mensagem.trim()) {
          toast.error(`Bloco ${bi + 1}, Variação ${vi + 1}: Digite a mensagem de texto`);
          return;
        }
        if (v.tipo !== "text" && !v.mediaFile) {
          toast.error(`Bloco ${bi + 1}, Variação ${vi + 1}: Selecione um arquivo de mídia`);
          return;
        }
      }
    }
    setIsLoading(true);
    try {
      // Convert delay to seconds if in minutes
      const delayMinSeconds = delayUnit === "minutes" ? delayMin * 60 : delayMin;
      const delayMaxSeconds = delayUnit === "minutes" ? delayMax * 60 : delayMax;

      // For backwards compatibility, use the first variation of first block as main
      const primeiraVariacao = blocos[0].variacoes[0];
      let primeiraMediaBase64: string | null = null;
      if (primeiraVariacao.mediaFile) {
        const buffer = await primeiraVariacao.mediaFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        primeiraMediaBase64 = `data:${primeiraVariacao.mediaFile.type};base64,${btoa(binary)}`;
      }

      // Create campaign
      const {
        data: campanha,
        error: campanhaError
      } = await supabase.from("disparos_campanhas").insert({
        user_id: user?.id,
        nome: nome.trim(),
        tipo_mensagem: primeiraVariacao.tipo,
        mensagem: primeiraVariacao.tipo === "text" ? primeiraVariacao.mensagem.trim() : primeiraVariacao.mensagem || null,
        media_base64: primeiraMediaBase64,
        delay_min: delayMinSeconds,
        delay_max: delayMaxSeconds,
        delay_bloco_min: delayBlocoMin,
        delay_bloco_max: delayBlocoMax,
        total_contatos: contatos.length,
        status: "pending",
        instancias_ids: selectedInstancias
      }).select().single();
      if (campanhaError) throw campanhaError;

      // Insert all variations with block information
      const variacoesToInsert: any[] = [];
      for (let blocoIndex = 0; blocoIndex < blocos.length; blocoIndex++) {
        const bloco = blocos[blocoIndex];
        for (let variacaoIndex = 0; variacaoIndex < bloco.variacoes.length; variacaoIndex++) {
          const v = bloco.variacoes[variacaoIndex];
          let mediaBase64: string | null = null;
          if (v.mediaFile) {
            const buffer = await v.mediaFile.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            mediaBase64 = `data:${v.mediaFile.type};base64,${btoa(binary)}`;
          }
          variacoesToInsert.push({
            campanha_id: campanha.id,
            bloco: blocoIndex,
            tipo_mensagem: v.tipo,
            mensagem: v.tipo === "text" ? v.mensagem.trim() : v.mensagem || null,
            media_base64: mediaBase64,
            ordem: variacaoIndex
          });
        }
      }
      const {
        error: variacoesError
      } = await supabase.from("disparos_campanha_variacoes").insert(variacoesToInsert);
      if (variacoesError) throw variacoesError;

      // Insert contacts
      const contatosToInsert = contatos.map(c => ({
        campanha_id: campanha.id,
        numero: c.numero.startsWith("55") ? c.numero : `55${c.numero}`,
        nome: c.nome || null,
        status: "pending"
      }));
      const {
        error: contatosError
      } = await supabase.from("disparos_campanha_contatos").insert(contatosToInsert);
      if (contatosError) throw contatosError;
      toast.success("Campanha criada com sucesso!");
      onCampanhaCriada();
      resetForm();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      toast.error(error.message || "Erro ao criar campanha");
    } finally {
      setIsLoading(false);
    }
  };
  const resetForm = () => {
    setNome("");
    setBlocos([]);
    setBlocosAbertos({});
    setVariacoesAbertas({});
    setDelayMin(1);
    setDelayMax(5);
    setDelayUnit("minutes");
    setDelayBlocoMin(3);
    setDelayBlocoMax(8);
    setContatos([]);
    setNovoNumero("");
    setNovoNome("");
    setDateFrom("");
    setDateTo("");
    setShowDateFilter(false);
    setDateFilterType(null);
    setTemplateImported(false);
    if (instancias.length > 0) {
      // Exclude WhatsApp main instance from default selection on reset
      const defaultSelected = instancias
        .filter(i => i.id !== whatsappInstanciaId)
        .map(i => i.id);
      setSelectedInstancias(defaultSelected);
    }
  };
  const getMediaIcon = (tipo: string) => {
    switch (tipo) {
      case "image":
        return <Image className="h-4 w-4" />;
      case "audio":
        return <Music className="h-4 w-4" />;
      case "video":
        return <Video className="h-4 w-4" />;
      case "document":
        return <FileText className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };
  const getAcceptTypes = (tipo: string) => {
    switch (tipo) {
      case "image":
        return "image/jpeg,image/png,image/gif,image/webp";
      case "audio":
        return "audio/mpeg,audio/ogg,audio/wav,audio/mp4";
      case "video":
        return "video/mp4,video/3gpp,video/quicktime";
      case "document":
        return "application/pdf,.doc,.docx";
      default:
        return "*/*";
    }
  };
  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "text":
        return "Texto";
      case "image":
        return "Imagem";
      case "audio":
        return "Áudio";
      case "video":
        return "Vídeo";
      case "document":
        return "Documento";
      default:
        return tipo;
    }
  };
  const getSliderConfig = () => {
    if (delayUnit === "minutes") {
      return {
        min: 1,
        max: 60,
        step: 1
      };
    }
    return {
      min: 3,
      max: 120,
      step: 1
    };
  };
  const sliderConfig = getSliderConfig();
  const unitLabel = delayUnit === "minutes" ? "min" : "s";
  const totalVariacoes = blocos.reduce((acc, b) => acc + b.variacoes.length, 0);
  return <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden p-0">
        <div className="flex flex-col lg:flex-row h-full max-h-[90vh]">
          {/* Form Section */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle>Nova Campanha de Disparo</DialogTitle>
              <DialogDescription>
                Configure uma campanha para enviar mensagens em massa
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <div className="space-y-6 pt-4">
          {/* Instâncias para disparo */}
          {instancias.length > 0 && <div className="space-y-2">
              <Label>Instâncias para Disparo *</Label>
              
              <div className="flex flex-wrap gap-2">
                {instancias.map(inst => {
                      const isSelected = selectedInstancias.includes(inst.id);
                      return <Badge key={inst.id} variant={isSelected ? "default" : "outline"} onClick={() => toggleInstancia(inst.id)} className="cursor-pointer hover:opacity-80 transition-opacity py-1.5 px-3 rounded">
                      <Phone className="h-3 w-3 mr-1" />
                      {inst.nome}
                      {isSelected && <X className="h-3 w-3 ml-1" />}
                    </Badge>;
                    })}
              </div>
              {selectedInstancias.length === 0 && <p className="text-xs text-destructive">Selecione pelo menos uma instância</p>}
            </div>}

          {instancias.length === 0 && <div className="p-4 border rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma instância de disparo configurada. 
                <br />
                Configure em Configurações → Conexões.
              </p>
            </div>}

          {/* Nome da campanha */}
          <div className="space-y-2">
            <Label>Nome da Campanha *</Label>
            <Input placeholder="Ex: Promoção Janeiro" value={nome} onChange={e => setNome(e.target.value)} />
          </div>

          {/* Blocos de Mensagem */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Label>Blocos de Mensagem ({blocos.length})</Label>
              </div>
              <div className="flex items-center gap-2">
                {templates.length > 0 && <Popover open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileDown className="h-4 w-4 mr-1" />
                        Importar Template
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 border-b">
                        <p className="font-medium text-sm">Selecionar Template</p>
                        <p className="text-xs text-muted-foreground">Escolha um template para importar</p>
                      </div>
                      <ScrollArea className="max-h-64">
                        <div className="p-2 space-y-1">
                          {templates.map(template => <Button key={template.id} variant="ghost" className="w-full justify-start text-left h-auto py-2" onClick={() => importTemplate(template)}>
                              <div className="flex flex-col items-start">
                                <span className="font-medium text-sm">{template.nome}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Set(template.variacoes?.map(v => v.bloco) || []).size} bloco(s), {template.variacoes?.length || 0} variação(ões)
                                </span>
                              </div>
                            </Button>)}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>}
                <Button variant="outline" size="sm" onClick={addBloco}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Bloco
                </Button>
              </div>
            </div>
            

            <div className="space-y-4">
              {blocos.map((bloco, blocoIndex) => <Card key={bloco.id} className="p-3 border-2">
                  <Collapsible open={blocosAbertos[bloco.id]} onOpenChange={() => toggleBlocoAberto(bloco.id)}>
                    <div className="flex items-center justify-between">
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-2 p-0 h-auto hover:bg-transparent">
                          {blocosAbertos[bloco.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          <Badge variant="default" className="gap-1 rounded">
                            <Layers className="h-3 w-3" />
                            Bloco {blocoIndex + 1}
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({bloco.variacoes.length} variação{bloco.variacoes.length !== 1 ? "ões" : ""})
                          </span>
                        </Button>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-1">
                        {blocos.length > 1 && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeBloco(bloco.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>}
                      </div>
                    </div>

                    <CollapsibleContent className="pt-3 space-y-3">
                      {/* Variações dentro do bloco */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Shuffle className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">Variações (envio aleatório)</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => addVariacao(bloco.id)} className="h-7 text-xs">
                            <Plus className="h-3 w-3 mr-1" />
                            Variação
                          </Button>
                        </div>

                        {bloco.variacoes.map((variacao, variacaoIndex) => <Card key={variacao.id} className="p-2 bg-muted/30">
                            <Collapsible open={variacoesAbertas[variacao.id]} onOpenChange={() => toggleVariacaoAberta(variacao.id)}>
                              <div className="flex items-center justify-between">
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="sm" className="gap-2 p-0 h-auto hover:bg-transparent">
                                    {variacoesAbertas[variacao.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    <Badge variant="secondary" className="gap-1 text-xs rounded">
                                      {getMediaIcon(variacao.tipo)}
                                      {variacaoIndex + 1}. {getTipoLabel(variacao.tipo)}
                                    </Badge>
                                  </Button>
                                </CollapsibleTrigger>
                                {bloco.variacoes.length > 1 && <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeVariacao(bloco.id, variacao.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>}
                              </div>

                              <CollapsibleContent className="pt-2 space-y-2">
                                {/* Tipo de mensagem */}
                                <div className="space-y-1">
                                  <Label className="text-xs">Tipo</Label>
                                  <Tabs value={variacao.tipo} onValueChange={v => {
                                      updateVariacao(bloco.id, variacao.id, {
                                        tipo: v as MensagemVariacao["tipo"],
                                        mediaFile: null,
                                        mediaPreview: null
                                      });
                                    }}>
                                    <TabsList className="grid w-full grid-cols-5 h-7">
                                      <TabsTrigger value="text" className="text-xs">Texto</TabsTrigger>
                                      <TabsTrigger value="image" className="text-xs">Imagem</TabsTrigger>
                                      <TabsTrigger value="audio" className="text-xs">Áudio</TabsTrigger>
                                      <TabsTrigger value="video" className="text-xs">Vídeo</TabsTrigger>
                                      <TabsTrigger value="document" className="text-xs">Doc</TabsTrigger>
                                    </TabsList>
                                  </Tabs>
                                </div>

                                {/* Content based on type */}
                                {variacao.tipo === "text" ? <div className="space-y-1">
                                    <Label className="text-xs">Mensagem *</Label>
                                    <Textarea placeholder="Digite sua mensagem..." value={variacao.mensagem} onChange={e => updateVariacao(bloco.id, variacao.id, {
                                      mensagem: e.target.value
                                    })} rows={2} className="text-sm" />
                                    <p className="text-xs text-muted-foreground">
                                      Variáveis: {"{nome}"} - Nome do contato
                                    </p>
                                  </div> : <div className="space-y-2">
                                    <div className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary transition-colors" onClick={() => {
                                      const input = mediaInputRefs.current[variacao.id];
                                      if (input) input.click();
                                    }}>
                                      {variacao.mediaPreview ? <div className="space-y-1">
                                          {variacao.tipo === "image" && <img src={variacao.mediaPreview} alt="Preview" className="max-h-16 mx-auto rounded" />}
                                          {variacao.tipo === "video" && <video src={variacao.mediaPreview} className="max-h-16 mx-auto rounded" controls />}
                                          {(variacao.tipo === "audio" || variacao.tipo === "document") && <div className="flex items-center justify-center gap-2">
                                              {getMediaIcon(variacao.tipo)}
                                              <span className="text-xs">{variacao.mediaPreview}</span>
                                            </div>}
                                          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={e => {
                                          e.stopPropagation();
                                          updateVariacao(bloco.id, variacao.id, {
                                            mediaFile: null,
                                            mediaPreview: null
                                          });
                                        }}>
                                            <X className="h-3 w-3 mr-1" />
                                            Remover
                                          </Button>
                                        </div> : <div className="space-y-1">
                                          <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                                          <p className="text-xs text-muted-foreground">
                                            Clique para selecionar
                                          </p>
                                        </div>}
                                    </div>
                                    <input ref={el => {
                                      mediaInputRefs.current[variacao.id] = el;
                                    }} type="file" accept={getAcceptTypes(variacao.tipo)} onChange={e => handleMediaUpload(bloco.id, variacao.id, e)} className="hidden" />
                                    <div className="space-y-1">
                                      <Label className="text-xs">Legenda (opcional)</Label>
                                      <Textarea placeholder="Digite uma legenda..." value={variacao.mensagem} onChange={e => updateVariacao(bloco.id, variacao.id, {
                                        mensagem: e.target.value
                                      })} rows={1} className="text-sm" />
                                    </div>
                                  </div>}
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>)}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>)}
            </div>
          </div>

          {/* Delay entre blocos (only show if more than 1 block) */}
          {blocos.length > 1 && <div className="space-y-3">
              
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
              
            </div>}

          {/* Timer/Delay entre contatos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <Label>Intervalo entre contatos ({delayMin} a {delayMax} {delayUnit === "minutes" ? "min" : "seg"})</Label>
              </div>
              <Select value={delayUnit} onValueChange={v => {
                      setDelayUnit(v as "seconds" | "minutes");
                      if (v === "minutes") {
                        setDelayMin(1);
                        setDelayMax(5);
                      } else {
                        setDelayMin(5);
                        setDelayMax(15);
                      }
                    }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Segundos</SelectItem>
                  <SelectItem value="minutes">Minutos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Mínimo: {delayMin}{unitLabel}</span>
                  <span>Máximo: {delayMax}{unitLabel}</span>
                </div>
                <Slider value={[delayMin, delayMax]} min={sliderConfig.min} max={sliderConfig.max} step={sliderConfig.step} onValueChange={([min, max]) => {
                        setDelayMin(min);
                        setDelayMax(max);
                      }} />
              </div>
            </div>
            
          </div>

          {/* Contatos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-muted-foreground" />
                <Label>Lista de Contatos ({contatos.length})</Label>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)} disabled={loadingDataSource}>
                  <Users className="h-4 w-4 mr-1" />
                  Importar
                </Button>

                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (!text.trim()) {
                      toast.info("Área de transferência vazia");
                      return;
                    }
                    const lines = text.split(/[\n\r]+/).filter(l => l.trim());
                    const novosContatos: Contato[] = [];
                    for (const line of lines) {
                      const parts = line.split(/[,;\t]+/).map(p => p.trim());
                      let numero = "";
                      let nome = "";
                      for (const part of parts) {
                        const digits = part.replace(/\D/g, "");
                        if (digits.length >= 8 && !numero) {
                          numero = normalizePhoneNumber(digits);
                        } else if (part && !nome && !/^\d+$/.test(part)) {
                          nome = part;
                        }
                      }
                      if (numero && numero.length >= 8) {
                        novosContatos.push({ numero, nome: nome || undefined });
                      }
                    }
                    if (novosContatos.length === 0) {
                      toast.error("Nenhum número válido encontrado");
                      return;
                    }
                    setContatos(prev => {
                      const existingNumbers = new Set(prev.map(c => c.numero));
                      const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
                      return [...prev, ...unique];
                    });
                    toast.success(`${novosContatos.length} contato(s) colado(s)`);
                  } catch (error) {
                    toast.error("Não foi possível acessar a área de transferência");
                  }
                }}>
                  <ClipboardPaste className="h-4 w-4 mr-1" />
                  Colar
                </Button>

                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" />
                  CSV/TXT
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
              </div>
            </div>

            {/* Add contact manually */}
            <div className="flex gap-2">
              <Input placeholder="Nome (opcional)" value={novoNome} onChange={e => setNovoNome(e.target.value)} className="flex-1" />
              <Input placeholder="Número (ex: 5521999999999)" value={novoNumero} onChange={e => setNovoNumero(e.target.value)} onKeyDown={e => e.key === "Enter" && addContato()} className="flex-1" />
              <Button onClick={addContato} variant="outline" size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Contact list */}
            {contatos.length > 0 && <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    {contatos.length} contato{contatos.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex gap-1">
                    {contatos.length > 10 && <Button variant="ghost" size="sm" onClick={() => setShowAllContacts(true)}>
                        Ver todos
                      </Button>}
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (contatos.length === 0) {
                        toast.error("Nenhum contato para copiar");
                        return;
                      }
                      const text = contatos.map(c => c.nome ? `${c.nome},${c.numero}` : c.numero).join("\n");
                      navigator.clipboard.writeText(text);
                      toast.success("Lista copiada para a área de transferência!");
                    }}>
                      <Copy className="h-4 w-4 mr-1" />
                      Copiar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={exportContatos}>
                      <FileDown className="h-4 w-4 mr-1" />
                      Exportar
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearAll} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4 mr-1" />
                      Limpar tudo
                    </Button>
                  </div>
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {contatos.slice(0, 50).map(c => <div key={c.numero} className="flex items-center justify-between p-1.5 hover:bg-muted rounded text-sm">
                      <span>
                        {c.nome ? `${c.nome} - ` : ""}{c.numero}
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeContato(c.numero)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>)}
                  {contatos.length > 50 && <Button variant="link" size="sm" onClick={() => setShowAllContacts(true)} className="w-full text-xs text-muted-foreground">
                      ... e mais {contatos.length - 50} contatos (clique para ver todos)
                    </Button>}
                </div>
              </div>}
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-4 border-t px-6 pb-6">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || instancias.length === 0}>
              {isLoading ? "Criando..." : "Criar Campanha"}
            </Button>
          </div>
              </div>
            </div>
          </div>

          {/* Live Preview Section - Desktop only */}
            <div className="hidden lg:flex w-80 border-l flex-col bg-muted/30">
              <div className="p-3 border-b bg-background flex items-center gap-2">
                <p className="font-medium text-sm">Prévia do Disparo</p>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={generateRandomPreview}
                  className="h-6 w-6"
                  disabled={blocos.length === 0 || blocos.every(b => b.variacoes.every(v => !(v.tipo === "text" && v.mensagem) && !(v.tipo !== "text" && v.mediaPreview)))}
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
                  
                  <div className="space-y-3 pt-4" key={previewKey}>
                    {/* Show generated preview if available */}
                    {Object.keys(previewMessages).length > 0 ? (
                      blocos.map((bloco, blocoIndex) => {
                        const preview = previewMessages[blocoIndex];
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
                          {blocos.length === 0 || blocos.every(b => b.variacoes.every(v => !(v.tipo === "text" && v.mensagem) && !(v.tipo !== "text" && v.mediaPreview))) 
                            ? "Adicione conteúdo para ver a prévia"
                            : "Clique no ícone para ver uma possível mensagem"}
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

    {/* Date Filter Dialog */}
    <Dialog open={showDateFilter} onOpenChange={open => {
      setShowDateFilter(open);
      if (!open) {
        setDateFrom("");
        setDateTo("");
        setDateFilterType(null);
        setSelectedKanbanColumnId(null);
      }
    }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Filtrar por Período</DialogTitle>
          <DialogDescription>
            {dateFilterType === "leads" && "Importe apenas leads criados em um período específico"}
            {dateFilterType === "clientes" && "Importe apenas clientes criados em um período específico"}
            {(dateFilterType === "kanban_whatsapp" || dateFilterType === "kanban_disparos" || 
              dateFilterType === "kanban_whatsapp_leads" || dateFilterType === "kanban_disparos_leads") && 
              "Importe contatos com última interação no período selecionado"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label>Data inicial (opcional)</Label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data final (opcional)</Label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => {
              if (dateFilterType === "leads") {
                importFromLeads(false);
              } else if (dateFilterType === "clientes") {
                importFromClientes(false);
              } else if (dateFilterType === "kanban_whatsapp" && selectedKanbanColumnId) {
                importFromKanbanColumn(selectedKanbanColumnId, false);
              } else if (dateFilterType === "kanban_disparos" && selectedKanbanColumnId) {
                importFromDisparosKanbanColumn(selectedKanbanColumnId, false);
              } else if (dateFilterType === "kanban_whatsapp_leads") {
                importFromKanbanWhatsAppLeads(false);
              } else if (dateFilterType === "kanban_disparos_leads") {
                importFromKanbanDisparosLeads(false);
              }
            }} disabled={loadingDataSource}>
              Importar Todos
            </Button>
            <Button onClick={() => {
              if (dateFilterType === "leads") {
                importFromLeads(true);
              } else if (dateFilterType === "clientes") {
                importFromClientes(true);
              } else if (dateFilterType === "kanban_whatsapp" && selectedKanbanColumnId) {
                importFromKanbanColumn(selectedKanbanColumnId, true);
              } else if (dateFilterType === "kanban_disparos" && selectedKanbanColumnId) {
                importFromDisparosKanbanColumn(selectedKanbanColumnId, true);
              } else if (dateFilterType === "kanban_whatsapp_leads") {
                importFromKanbanWhatsAppLeads(true);
              } else if (dateFilterType === "kanban_disparos_leads") {
                importFromKanbanDisparosLeads(true);
              }
            }} disabled={loadingDataSource || !dateFrom && !dateTo}>
              {loadingDataSource ? "Importando..." : "Importar Filtrado"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Import Dialog */}
    <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Importar Contatos</DialogTitle>
          <DialogDescription>
            Escolha a origem dos contatos para importar
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-1 pr-4">
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => {
              setShowImportDialog(false);
              openDateFilterForLeads();
            }} disabled={loadingDataSource}>
              <Users className="h-4 w-4 mr-2" />
              Todos os Contatos (Leads)
            </Button>
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => {
              setShowImportDialog(false);
              openDateFilterForClientes();
            }} disabled={loadingDataSource}>
              <Users className="h-4 w-4 mr-2" />
              Apenas Clientes
            </Button>
            
            <div className="border-t my-2" />
            <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Kanban WhatsApp</p>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start" 
              onClick={() => {
                setShowImportDialog(false);
                openDateFilterForKanbanWhatsAppLeads();
              }} 
              disabled={loadingDataSource}
            >
              <div className="w-3 h-3 rounded-full mr-2 bg-gray-400" />
              Leads (não atribuídos)
            </Button>
            {kanbanColumns.map(col => (
              <Button 
                key={col.id} 
                variant="ghost" 
                size="sm" 
                className="w-full justify-start" 
                onClick={() => {
                  setShowImportDialog(false);
                  openDateFilterForKanbanWhatsApp(col.id);
                }} 
                disabled={loadingDataSource}
              >
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: col.cor }} />
                {col.nome}
              </Button>
            ))}
            
            <div className="border-t my-2" />
            <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Kanban Disparos</p>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start" 
              onClick={() => {
                setShowImportDialog(false);
                openDateFilterForKanbanDisparosLeads();
              }} 
              disabled={loadingDataSource}
            >
              <div className="w-3 h-3 rounded-full mr-2 bg-gray-400" />
              Leads (não atribuídos)
            </Button>
            {disparosKanbanColumns.map(col => (
              <Button 
                key={col.id} 
                variant="ghost" 
                size="sm" 
                className="w-full justify-start" 
                onClick={() => {
                  setShowImportDialog(false);
                  openDateFilterForKanbanDisparos(col.id);
                }} 
                disabled={loadingDataSource}
              >
                <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: col.cor }} />
                {col.nome}
              </Button>
            ))}

            {listasExtrator.length > 0 && <>
              <div className="border-t my-2" />
              <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Listas do Extrator</p>
              {listasExtrator.map(lista => (
                <Button 
                  key={lista.id} 
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-start" 
                  onClick={() => importFromListaExtrator(lista)}
                  disabled={loadingDataSource}
                >
                  <Database className="h-3 w-3 mr-2 text-purple-600" />
                  {lista.nome}
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {lista.total_contatos}
                  </Badge>
                </Button>
              ))}
            </>}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* All Contacts Dialog */}
    <Dialog open={showAllContacts} onOpenChange={setShowAllContacts}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Lista de Contatos ({contatos.length})</DialogTitle>
          <DialogDescription>
            Visualização completa de todos os contatos da campanha
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-1">
              {contatos.map((c, idx) => <div key={c.numero} className="flex items-center justify-between p-2 hover:bg-muted rounded text-sm border-b last:border-b-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-8">{idx + 1}.</span>
                    <span>
                      {c.nome ? `${c.nome} - ` : ""}{c.numero}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeContato(c.numero)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>)}
            </div>
          </ScrollArea>
        </div>
        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="destructive" size="sm" onClick={() => {
            clearAll();
            setShowAllContacts(false);
          }}>
            <Trash2 className="h-4 w-4 mr-1" />
            Limpar todos
          </Button>
          <Button onClick={() => setShowAllContacts(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}