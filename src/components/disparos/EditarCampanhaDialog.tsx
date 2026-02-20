import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Upload, FileText, Image, Video, Music, X, Plus, Trash2, Users, Phone, Shuffle, ChevronDown, ChevronUp, Layers, Copy, FileDown, List, ClipboardPaste, Database, RefreshCw, Check, CheckSquare, Square, ChevronLeft, ChevronRight, ExternalLink, AtSign, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhoneNumber } from "@/utils/whatsapp";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { processSpintaxRandom } from "@/utils/spintax";
import { ContatoDetalhesPopup } from "./ContatoDetalhesPopup";

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

interface EditarCampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string | null;
  onCampanhaAtualizada: () => void;
}

interface Contato {
  numero: string;
  nome?: string;
  origem?: string;
  dados_extras?: Record<string, string> | null;
  camposMapeados?: Record<string, string> | null;
}

interface KanbanColumn {
  id: string;
  nome: string;
  cor: string;
}

interface DisparosInstancia {
  id: string;
  nome: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
}

interface MensagemVariacao {
  id: string;
  tipo: "text" | "image" | "audio" | "video" | "document";
  mensagem: string;
  mediaFile: File | null;
  mediaPreview: string | null;
  mediaBase64Existing?: string | null;
}

interface BlocoMensagem {
  id: string;
  variacoes: MensagemVariacao[];
}

export function EditarCampanhaDialog({
  open,
  onOpenChange,
  campanhaId,
  onCampanhaAtualizada
}: EditarCampanhaDialogProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Etapa wizard
  const [etapa, setEtapa] = useState<1 | 2 | 3>(1);

  const [nome, setNome] = useState("");
  const [blocos, setBlocos] = useState<BlocoMensagem[]>([]);
  const [blocosAbertos, setBlocosAbertos] = useState<Record<string, boolean>>({});
  const [variacoesAbertas, setVariacoesAbertas] = useState<Record<string, boolean>>({});
  const [delayMin, setDelayMin] = useState(1);
  const [delayMax, setDelayMax] = useState(5);
  const [delayUnit, setDelayUnit] = useState<"seconds" | "minutes">("minutes");
  const [delayBlocoMin, setDelayBlocoMin] = useState(3);
  const [delayBlocoMax, setDelayBlocoMax] = useState(8);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [novoNumero, setNovoNumero] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);
  const [disparosKanbanColumns, setDisparosKanbanColumns] = useState<KanbanColumn[]>([]);
  const [loadingDataSource, setLoadingDataSource] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [dateFilterType, setDateFilterType] = useState<"leads" | "clientes" | "kanban_whatsapp" | "kanban_disparos" | null>(null);
  const [selectedKanbanColumnId, setSelectedKanbanColumnId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [instancias, setInstancias] = useState<DisparosInstancia[]>([]);
  const [selectedInstancias, setSelectedInstancias] = useState<string[]>([]);
  const [instanciaStatusMap, setInstanciaStatusMap] = useState<Record<string, "connected" | "disconnected" | "loading">>({});
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [previewMessages, setPreviewMessages] = useState<Record<number, { variacaoIdx: number; text: string; mediaPreview?: string | null; tipo: string }>>({});
  const [previewKey, setPreviewKey] = useState(0);

  // Contact management
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [allContactsPage, setAllContactsPage] = useState(1);
  const [allContactsPerPage, setAllContactsPerPage] = useState(50);
  const [allContactsFilterOrigens, setAllContactsFilterOrigens] = useState<Set<string>>(new Set());
  const [allContactsFilterEtiquetas, setAllContactsFilterEtiquetas] = useState<Set<string>>(new Set());
  const [contatoDetalhesAberto, setContatoDetalhesAberto] = useState<Contato | null>(null);
  const [numerosDisparados, setNumerosDisparados] = useState<Set<string>>(new Set());
  const [numerosSemWhatsApp, setNumerosSemWhatsApp] = useState<Set<string>>(new Set());

  const origensUnicas = useMemo(() => {
    const origens = new Set<string>();
    contatos.forEach((c) => { if (c.origem) origens.add(c.origem); });
    return Array.from(origens).sort();
  }, [contatos]);

  const contatosFiltradosPorOrigem = useMemo(() => {
    if (allContactsFilterOrigens.size === 0) return contatos;
    return contatos.filter(c => c.origem && allContactsFilterOrigens.has(c.origem));
  }, [contatos, allContactsFilterOrigens]);

  const toggleOrigemFilter = (origem: string) => {
    setAllContactsFilterOrigens(prev => {
      const next = new Set(prev);
      if (next.has(origem)) next.delete(origem); else next.add(origem);
      return next;
    });
    setAllContactsPage(1);
  };

  const toggleContactSelection = (numero: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(numero)) next.delete(numero); else next.add(numero);
      return next;
    });
  };

  useEffect(() => {
    setSelectedContacts(new Set(contatos.map(c => c.numero)));
  }, [contatos.length]);

  const generateRandomPreview = useCallback(() => {
    const newPreview: Record<number, { variacaoIdx: number; text: string; mediaPreview?: string | null; tipo: string }> = {};
    blocos.forEach((bloco, blocoIndex) => {
      const validVariacoes = bloco.variacoes.filter(v =>
        (v.tipo === "text" && v.mensagem) || (v.tipo !== "text" && (v.mediaPreview || v.mediaBase64Existing))
      );
      if (validVariacoes.length > 0) {
        const randomIdx = Math.floor(Math.random() * validVariacoes.length);
        const selectedVariacao = validVariacoes[randomIdx];
        const processedText = selectedVariacao.tipo === "text"
          ? processSpintaxRandom(selectedVariacao.mensagem)
          : selectedVariacao.mensagem;
        newPreview[blocoIndex] = {
          variacaoIdx: randomIdx,
          text: processedText,
          mediaPreview: selectedVariacao.mediaPreview || selectedVariacao.mediaBase64Existing,
          tipo: selectedVariacao.tipo
        };
      }
    });
    setPreviewMessages(newPreview);
    setPreviewKey(prev => prev + 1);
  }, [blocos]);

  useEffect(() => {
    if (blocos.length > 0 && blocos.some(b => b.variacoes.some(v => (v.tipo === "text" && v.mensagem) || (v.tipo !== "text" && (v.mediaPreview || v.mediaBase64Existing))))) {
      generateRandomPreview();
    }
  }, [blocos.length]);

  useEffect(() => {
    if (open && campanhaId && user) {
      setEtapa(1);
      loadCampanhaData();
      loadKanbanColumns();
      loadDisparosKanbanColumns();
      loadInstancias();
      loadTemplates();
      loadNumerosDisparados();
    }
  }, [open, campanhaId, user]);

  const loadNumerosDisparados = async () => {
    if (!user) return;
    try {
      const { data: campanhas } = await supabase
        .from("disparos_campanhas")
        .select("id")
        .eq("user_id", user.id)
        .neq("id", campanhaId || "");
      if (!campanhas || campanhas.length === 0) return;
      const campanhaIds = campanhas.map(c => c.id);
      const batchSize = 20;
      const allNums = new Set<string>();
      const semWpp = new Set<string>();
      for (let i = 0; i < campanhaIds.length; i += batchSize) {
        const batch = campanhaIds.slice(i, i + batchSize);
        let from = 0;
        // Nutrindo
        while (true) {
          const { data } = await supabase
            .from("disparos_campanha_contatos")
            .select("numero")
            .in("campanha_id", batch)
            .in("status", ["sent", "delivered"])
            .range(from, from + 999);
          if (!data || data.length === 0) break;
          data.forEach(c => { const d = c.numero.replace(/\D/g, ""); allNums.add(d.slice(-8)); });
          if (data.length < 1000) break;
          from += 1000;
        }
        // Sem WhatsApp
        from = 0;
        while (true) {
          const { data } = await supabase
            .from("disparos_campanha_contatos")
            .select("numero, erro")
            .in("campanha_id", batch)
            .eq("status", "failed")
            .not("erro", "is", null)
            .range(from, from + 999);
          if (!data || data.length === 0) break;
          data.forEach(c => {
            const lower = (c.erro || "").toLowerCase();
            if (
              lower.includes("sem_whatsapp:") ||
              lower.includes("not on whatsapp") ||
              lower.includes("number not exists") ||
              lower.includes("not registered") ||
              lower.includes("phone not registered") ||
              lower.includes("invalid phone")
            ) {
              const d = c.numero.replace(/\D/g, "");
              semWpp.add(d.slice(-8));
            }
          });
          if (data.length < 1000) break;
          from += 1000;
        }
      }
      setNumerosDisparados(allNums);
      setNumerosSemWhatsApp(semWpp);
    } catch {}
  };

  const loadCampanhaData = async () => {
    if (!campanhaId) return;
    setIsLoadingData(true);
    try {
      const { data: campanha, error: campanhaError } = await supabase
        .from("disparos_campanhas")
        .select("*")
        .eq("id", campanhaId)
        .single();
      if (campanhaError) throw campanhaError;

      setNome(campanha.nome);
      // Detect if values were saved in minutes (both divisible by 60 and >= 60)
      const bothDivisibleBy60 = campanha.delay_min >= 60 && campanha.delay_max >= 60 &&
        campanha.delay_min % 60 === 0 && campanha.delay_max % 60 === 0;
      if (bothDivisibleBy60) {
        setDelayUnit("minutes");
        setDelayMin(Math.round(campanha.delay_min / 60));
        setDelayMax(Math.round(campanha.delay_max / 60));
      } else {
        setDelayUnit("seconds");
        setDelayMin(campanha.delay_min);
        setDelayMax(campanha.delay_max);
      }
      setDelayBlocoMin(campanha.delay_bloco_min || 3);
      setDelayBlocoMax(campanha.delay_bloco_max || 8);
      setSelectedInstancias(campanha.instancias_ids || []);

      const { data: variacoes, error: variacoesError } = await supabase
        .from("disparos_campanha_variacoes")
        .select("*")
        .eq("campanha_id", campanhaId)
        .order("bloco")
        .order("ordem");
      if (variacoesError) throw variacoesError;

      const blocosMap: Record<number, MensagemVariacao[]> = {};
      (variacoes || []).forEach(v => {
        const blocoNum = v.bloco || 0;
        if (!blocosMap[blocoNum]) blocosMap[blocoNum] = [];
        blocosMap[blocoNum].push({
          id: v.id,
          tipo: v.tipo_mensagem as any,
          mensagem: v.mensagem || "",
          mediaFile: null,
          mediaPreview: v.media_base64 ? "Mídia existente" : null,
          mediaBase64Existing: v.media_base64
        });
      });

      const blocosArray: BlocoMensagem[] = Object.entries(blocosMap)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([_, vars]) => ({ id: crypto.randomUUID(), variacoes: vars }));

      if (blocosArray.length === 0) {
        blocosArray.push({
          id: crypto.randomUUID(),
          variacoes: [{
            id: crypto.randomUUID(),
            tipo: campanha.tipo_mensagem as any,
            mensagem: campanha.mensagem || "",
            mediaFile: null,
            mediaPreview: campanha.media_base64 ? "Mídia existente" : null,
            mediaBase64Existing: campanha.media_base64
          }]
        });
      }

      setBlocos(blocosArray);
      if (blocosArray.length > 0) {
        setBlocosAbertos({ [blocosArray[0].id]: true });
        if (blocosArray[0].variacoes.length > 0) {
          setVariacoesAbertas({ [blocosArray[0].variacoes[0].id]: true });
        }
      }

      const { data: contatosData, error: contatosError } = await supabase
        .from("disparos_campanha_contatos")
        .select("numero, nome, status")
        .eq("campanha_id", campanhaId)
        .eq("archived", false);
      if (contatosError) throw contatosError;

      setContatos((contatosData || [])
        .filter(c => c.status === 'pending')
        .map(c => ({ numero: c.numero, nome: c.nome || undefined })));
    } catch (error: any) {
      console.error("Error loading campaign:", error);
      toast.error("Erro ao carregar campanha");
      onOpenChange(false);
    } finally {
      setIsLoadingData(false);
    }
  };

  const loadTemplates = async () => {
    if (!user) return;
    try {
      const { data: templatesData } = await supabase
        .from("disparos_templates")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      const templatesWithVariacoes = await Promise.all(
        (templatesData || []).map(async template => {
          const { data: variacoes } = await supabase
            .from("disparos_template_variacoes")
            .select("*")
            .eq("template_id", template.id)
            .order("bloco", { ascending: true })
            .order("ordem", { ascending: true });
          return { ...template, variacoes: variacoes || [] };
        })
      );
      setTemplates(templatesWithVariacoes);
    } catch (error) {
      console.error("Error loading templates:", error);
    }
  };

  const loadKanbanColumns = async () => {
    if (!user) return;
    const { data } = await supabase.from("whatsapp_kanban_columns").select("id, nome, cor").eq("user_id", user.id).eq("ativo", true).order("ordem");
    if (data) setKanbanColumns(data);
  };

  const loadDisparosKanbanColumns = async () => {
    if (!user) return;
    const { data } = await supabase.from("disparos_kanban_columns").select("id, nome, cor").eq("user_id", user.id).eq("ativo", true).order("ordem");
    if (data) setDisparosKanbanColumns(data);
  };

  const checkInstanciasStatus = async (instanciasList: DisparosInstancia[]) => {
    const loadingMap: Record<string, "connected" | "disconnected" | "loading"> = {};
    instanciasList.forEach(i => { loadingMap[i.id] = "loading"; });
    setInstanciaStatusMap(loadingMap);
    const results = await Promise.all(
      instanciasList.map(async (inst) => {
        try {
          const { data, error } = await supabase.functions.invoke("uazapi-check-status", {
            body: { base_url: inst.base_url, api_key: inst.api_key },
          });
          const connected = !error && data?.success === true;
          return { id: inst.id, status: connected ? "connected" : "disconnected" } as const;
        } catch {
          return { id: inst.id, status: "disconnected" } as const;
        }
      })
    );
    const statusMap: Record<string, "connected" | "disconnected" | "loading"> = {};
    results.forEach(r => { statusMap[r.id] = r.status; });
    setInstanciaStatusMap(statusMap);
  };

  const loadInstancias = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("disparos_instancias")
      .select("id, nome, base_url, api_key, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at");
    if (data) {
      setInstancias(data);
      checkInstanciasStatus(data);
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
    const blocosMap = new Map<number, MensagemVariacao[]>();
    for (const v of template.variacoes) {
      const blocoNum = v.bloco ?? 0;
      if (!blocosMap.has(blocoNum)) blocosMap.set(blocoNum, []);
      blocosMap.get(blocoNum)!.push({
        id: crypto.randomUUID(),
        tipo: v.tipo_mensagem as MensagemVariacao["tipo"],
        mensagem: v.mensagem || "",
        mediaFile: null,
        mediaPreview: v.media_base64 ? "Mídia do template" : null,
        mediaBase64Existing: v.media_base64
      });
    }
    const novoBlocos: BlocoMensagem[] = Array.from(blocosMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([_, vars]) => ({ id: crypto.randomUUID(), variacoes: vars }));
    if (novoBlocos.length === 0) { toast.error("Template sem conteúdo"); return; }
    setBlocos(novoBlocos);
    setDelayBlocoMin(template.delay_bloco_min || 3);
    setDelayBlocoMax(template.delay_bloco_max || 8);
    setBlocosAbertos({});
    setVariacoesAbertas({});
    setShowTemplateSelector(false);
    toast.success(`Template "${template.nome}" importado!`);
  };

  const addBloco = () => {
    const newBlocoId = crypto.randomUUID();
    const newVariacaoId = crypto.randomUUID();
    setBlocos(prev => [...prev, { id: newBlocoId, variacoes: [{ id: newVariacaoId, tipo: "text", mensagem: "", mediaFile: null, mediaPreview: null }] }]);
    setBlocosAbertos(prev => ({ ...prev, [newBlocoId]: true }));
    setVariacoesAbertas(prev => ({ ...prev, [newVariacaoId]: true }));
  };

  const removeBloco = (blocoId: string) => {
    if (blocos.length <= 1) { toast.error("É necessário ter pelo menos um bloco de mensagem"); return; }
    setBlocos(prev => prev.filter(b => b.id !== blocoId));
    setBlocosAbertos(prev => { const s = { ...prev }; delete s[blocoId]; return s; });
  };

  const toggleBlocoAberto = (blocoId: string) => {
    setBlocosAbertos(prev => ({ ...prev, [blocoId]: !prev[blocoId] }));
  };

  const addVariacao = (blocoId: string) => {
    const newId = crypto.randomUUID();
    setBlocos(prev => prev.map(b => b.id === blocoId ? { ...b, variacoes: [...b.variacoes, { id: newId, tipo: "text", mensagem: "", mediaFile: null, mediaPreview: null }] } : b));
    setVariacoesAbertas(prev => ({ ...prev, [newId]: true }));
  };

  const removeVariacao = (blocoId: string, variacaoId: string) => {
    const bloco = blocos.find(b => b.id === blocoId);
    if (!bloco || bloco.variacoes.length <= 1) { toast.error("É necessário ter pelo menos uma variação por bloco"); return; }
    setBlocos(prev => prev.map(b => b.id === blocoId ? { ...b, variacoes: b.variacoes.filter(v => v.id !== variacaoId) } : b));
  };

  const toggleVariacaoAberta = (variacaoId: string) => {
    setVariacoesAbertas(prev => ({ ...prev, [variacaoId]: !prev[variacaoId] }));
  };

  const updateVariacao = (blocoId: string, variacaoId: string, updates: Partial<MensagemVariacao>) => {
    setBlocos(prev => prev.map(b => b.id === blocoId ? {
      ...b,
      variacoes: b.variacoes.map(v => v.id === variacaoId ? { ...v, ...updates } : v)
    } : b));
  };

  const handleMediaUpload = (blocoId: string, variacaoId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      updateVariacao(blocoId, variacaoId, {
        mediaFile: file,
        mediaPreview: event.target?.result as string,
        mediaBase64Existing: null
      });
    };
    reader.readAsDataURL(file);
  };

  const addContato = () => {
    if (!novoNumero.trim()) return;
    const numero = normalizePhoneNumber(novoNumero);
    if (numero.length < 8) { toast.error("Número inválido"); return; }
    if (contatos.find(c => c.numero === numero)) { toast.error("Número já adicionado"); return; }
    setContatos(prev => [...prev, { numero, nome: novoNome.trim() || undefined }]);
    setSelectedContacts(prev => new Set([...prev, numero]));
    setNovoNumero("");
    setNovoNome("");
  };

  const removeContato = (numero: string) => {
    setContatos(prev => prev.filter(c => c.numero !== numero));
    setSelectedContacts(prev => { const next = new Set(prev); next.delete(numero); return next; });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/[\n\r]+/).filter(l => l.trim());
      const novosContatos: Contato[] = [];
      for (const line of lines) {
        const parts = line.split(/[,;\t]+/).map(p => p.trim());
        let numero = "";
        let nome = "";
        for (const part of parts) {
          const digits = part.replace(/\D/g, "");
          if (digits.length >= 8 && !numero) { numero = normalizePhoneNumber(digits); }
          else if (part && !nome && !/^\d+$/.test(part)) { nome = part; }
        }
        if (numero && numero.length >= 8) novosContatos.push({ numero, nome: nome || undefined });
      }
      if (novosContatos.length === 0) { toast.error("Nenhum número válido encontrado"); return; }
      setContatos(prev => {
        const existingNumbers = new Set(prev.map(c => c.numero));
        const unique = novosContatos.filter(c => !existingNumbers.has(c.numero));
        return [...prev, ...unique];
      });
      setSelectedContacts(prev => { const next = new Set(prev); novosContatos.forEach(c => next.add(c.numero)); return next; });
      toast.success(`${novosContatos.length} contato(s) importado(s)`);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const exportContatos = () => {
    if (contatos.length === 0) { toast.error("Nenhum contato para exportar"); return; }
    const csvContent = "numero,nome\n" + contatos.map(c => `${c.numero},${c.nome || ""}`).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `contatos_campanha_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Lista exportada!");
  };

  const openDateFilterForLeads = () => { setDateFilterType("leads"); setSelectedKanbanColumnId(null); setShowDateFilter(true); };
  const openDateFilterForClientes = () => { setDateFilterType("clientes"); setSelectedKanbanColumnId(null); setShowDateFilter(true); };
  const openDateFilterForKanbanWhatsApp = (columnId: string) => { setDateFilterType("kanban_whatsapp"); setSelectedKanbanColumnId(columnId); setShowDateFilter(true); };
  const openDateFilterForKanbanDisparos = (columnId: string) => { setDateFilterType("kanban_disparos"); setSelectedKanbanColumnId(columnId); setShowDateFilter(true); };

  const addContatosWithSelection = (novos: Contato[], origem?: string) => {
    const novosComOrigem = novos.map(c => ({ ...c, origem: origem || c.origem }));
    setContatos(prev => {
      const existingNumbers = new Set(prev.map(c => c.numero));
      const unique = novosComOrigem.filter(c => !existingNumbers.has(c.numero));
      return [...prev, ...unique];
    });
    setSelectedContacts(prev => { const next = new Set(prev); novosComOrigem.forEach(c => next.add(c.numero)); return next; });
  };

  const importFromLeads = async (filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      let query = supabase.from("leads").select("nome, telefone").eq("user_id", user.id).eq("status", "lead").is("deleted_at", null);
      if (filterByDate && dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (filterByDate && dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
      const { data, error } = await query;
      if (error) throw error;
      const novos = (data || []).filter(l => l.telefone).map(l => ({ numero: normalizePhoneNumber(l.telefone), nome: l.nome })).filter(c => c.numero.length >= 8);
      if (novos.length === 0) { toast.info("Nenhum lead com telefone válido"); return; }
      addContatosWithSelection(novos, "Leads");
      toast.success(`${novos.length} lead(s) importado(s)`);
      setShowDateFilter(false); setDateFrom(""); setDateTo("");
    } catch { toast.error("Erro ao importar leads"); } finally { setLoadingDataSource(false); }
  };

  const importFromClientes = async (filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      let query = supabase.from("leads").select("nome, telefone").eq("user_id", user.id).eq("status", "cliente").is("deleted_at", null);
      if (filterByDate && dateFrom) query = query.gte("created_at", `${dateFrom}T00:00:00`);
      if (filterByDate && dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
      const { data, error } = await query;
      if (error) throw error;
      const novos = (data || []).filter(l => l.telefone).map(l => ({ numero: normalizePhoneNumber(l.telefone), nome: l.nome })).filter(c => c.numero.length >= 8);
      if (novos.length === 0) { toast.info("Nenhum cliente com telefone válido"); return; }
      addContatosWithSelection(novos, "Clientes");
      toast.success(`${novos.length} cliente(s) importado(s)`);
      setShowDateFilter(false); setDateFrom(""); setDateTo("");
    } catch { toast.error("Erro ao importar clientes"); } finally { setLoadingDataSource(false); }
  };

  const importFromKanbanColumn = async (columnId: string, filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      const column = kanbanColumns.find(c => c.id === columnId);
      const columnName = column?.nome || "Kanban WhatsApp";
      const { data: kanbanData, error: kanbanError } = await supabase.from("whatsapp_chat_kanban").select("chat_id").eq("user_id", user.id).eq("column_id", columnId);
      if (kanbanError) throw kanbanError;
      if (!kanbanData || kanbanData.length === 0) { toast.info("Nenhum chat nesta coluna"); return; }
      const chatIds = kanbanData.map(k => k.chat_id);
      let query = supabase.from("whatsapp_chats").select("contact_name, contact_number").in("id", chatIds).is("deleted_at", null);
      if (filterByDate && dateFrom) query = query.gte("last_message_time", `${dateFrom}T00:00:00`);
      if (filterByDate && dateTo) query = query.lte("last_message_time", `${dateTo}T23:59:59`);
      const { data: chatsData, error: chatsError } = await query;
      if (chatsError) throw chatsError;
      const novos = (chatsData || []).filter(c => c.contact_number).map(c => ({ numero: normalizePhoneNumber(c.contact_number), nome: c.contact_name })).filter(c => c.numero.length >= 8);
      if (novos.length === 0) { toast.info("Nenhum contato válido nesta coluna"); return; }
      addContatosWithSelection(novos, `WA: ${columnName}`);
      toast.success(`${novos.length} contato(s) importado(s)`);
      setShowDateFilter(false); setDateFrom(""); setDateTo("");
    } catch { toast.error("Erro ao importar do Kanban"); } finally { setLoadingDataSource(false); }
  };

  const importFromDisparosKanbanColumn = async (columnId: string, filterByDate = false) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      const column = disparosKanbanColumns.find(c => c.id === columnId);
      const columnName = column?.nome || "Kanban Disparos";
      const { data: kanbanData, error: kanbanError } = await supabase.from("disparos_chat_kanban").select("chat_id").eq("user_id", user.id).eq("column_id", columnId);
      if (kanbanError) throw kanbanError;
      if (!kanbanData || kanbanData.length === 0) { toast.info("Nenhum chat nesta coluna"); return; }
      const chatIds = kanbanData.map(k => k.chat_id);
      let query = supabase.from("disparos_chats").select("contact_name, contact_number").in("id", chatIds).is("deleted_at", null);
      if (filterByDate && dateFrom) query = query.gte("last_message_time", `${dateFrom}T00:00:00`);
      if (filterByDate && dateTo) query = query.lte("last_message_time", `${dateTo}T23:59:59`);
      const { data: chatsData, error: chatsError } = await query;
      if (chatsError) throw chatsError;
      const novos = (chatsData || []).filter(c => c.contact_number).map(c => ({ numero: normalizePhoneNumber(c.contact_number), nome: c.contact_name })).filter(c => c.numero.length >= 8);
      if (novos.length === 0) { toast.info("Nenhum contato válido nesta coluna"); return; }
      addContatosWithSelection(novos, `Disp: ${columnName}`);
      toast.success(`${novos.length} contato(s) importado(s)`);
      setShowDateFilter(false); setDateFrom(""); setDateTo("");
    } catch { toast.error("Erro ao importar do Kanban Disparos"); } finally { setLoadingDataSource(false); }
  };

  const selectedContatosForSubmit = useMemo(() => contatos.filter(c => selectedContacts.has(c.numero)), [contatos, selectedContacts]);

  const handleSubmit = async () => {
    if (!campanhaId || !user) return;
    if (!nome.trim()) { toast.error("Digite um nome para a campanha"); return; }
    if (blocos.length === 0) { toast.error("Adicione pelo menos um bloco de mensagem"); return; }
    const primeiraVariacao = blocos[0].variacoes[0];
    if (!primeiraVariacao) { toast.error("Configure pelo menos uma variação de mensagem"); return; }
    if (primeiraVariacao.tipo === "text" && !primeiraVariacao.mensagem.trim()) { toast.error("A primeira variação precisa ter conteúdo"); return; }
    if (primeiraVariacao.tipo !== "text" && !primeiraVariacao.mediaFile && !primeiraVariacao.mediaBase64Existing) { toast.error("A primeira variação precisa ter uma mídia"); return; }
    if (selectedContatosForSubmit.length === 0) { toast.error("Selecione pelo menos um contato"); return; }
    if (selectedInstancias.length === 0) { toast.error("Selecione pelo menos uma instância"); return; }
    setIsLoading(true);
    try {
      const delayMinSeconds = delayUnit === "minutes" ? delayMin * 60 : delayMin;
      const delayMaxSeconds = delayUnit === "minutes" ? delayMax * 60 : delayMax;

      const { data: existingCampanha } = await supabase.from("disparos_campanhas").select("*, status, iniciado_em, enviados, falhas").eq("id", campanhaId).single();

      if (existingCampanha && existingCampanha.iniciado_em && existingCampanha.enviados > 0) {
        const { data: contatosSnapshot } = await supabase.from("disparos_campanha_contatos").select("status").eq("campanha_id", campanhaId).eq("archived", false);
        const { data: variacoesSnapshot } = await supabase.from("disparos_campanha_variacoes").select("bloco").eq("campanha_id", campanhaId);
        const blocosCount = variacoesSnapshot ? new Set(variacoesSnapshot.map(v => v.bloco)).size : 0;
        const { data: existingSnapshots } = await supabase.from("disparos_campanha_snapshots").select("versao").eq("campanha_id", campanhaId).order("versao", { ascending: false }).limit(1);
        const nextVersion = existingSnapshots && existingSnapshots.length > 0 ? existingSnapshots[0].versao + 1 : 1;
        await supabase.from("disparos_campanha_snapshots").insert({
          campanha_id: campanhaId,
          user_id: user.id,
          versao: nextVersion,
          nome_versao: `Versão ${nextVersion} - ${new Date().toLocaleDateString('pt-BR')}`,
          snapshot_data: {
            nome: existingCampanha.nome, status: existingCampanha.status,
            total_contatos: existingCampanha.total_contatos, enviados: existingCampanha.enviados,
            falhas: existingCampanha.falhas, delay_min: existingCampanha.delay_min,
            delay_max: existingCampanha.delay_max, delay_bloco_min: existingCampanha.delay_bloco_min,
            delay_bloco_max: existingCampanha.delay_bloco_max, iniciado_em: existingCampanha.iniciado_em,
            finalizado_em: existingCampanha.finalizado_em, created_at: existingCampanha.created_at,
            contato_stats: {
              total: contatosSnapshot?.length || 0,
              enviados: contatosSnapshot?.filter(c => c.status === "sent").length || 0,
              falhas: contatosSnapshot?.filter(c => c.status === "failed").length || 0,
              pendentes: contatosSnapshot?.filter(c => c.status === "pending").length || 0
            },
            blocos_count: blocosCount
          }
        });
      }

      let primeiraMediaBase64: string | null = primeiraVariacao.mediaBase64Existing || null;
      if (primeiraVariacao.mediaFile) {
        const buffer = await primeiraVariacao.mediaFile.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        primeiraMediaBase64 = `data:${primeiraVariacao.mediaFile.type};base64,${btoa(binary)}`;
      }

      const { data: existingContacts } = await supabase.from("disparos_campanha_contatos").select("numero, status, enviado_em").eq("campanha_id", campanhaId).eq("archived", false);
      const existingContactsMap = new Map<string, { status: string; enviado_em: string | null }>();
      (existingContacts || []).forEach(c => {
        const num = c.numero.startsWith("55") ? c.numero : `55${c.numero}`;
        existingContactsMap.set(num, { status: c.status, enviado_em: c.enviado_em });
      });

      const normalizedNewContacts = selectedContatosForSubmit.map(c => ({
        ...c, normalizedNumero: c.numero.startsWith("55") ? c.numero : `55${c.numero}`
      }));

      const newContactNumbers = new Set(normalizedNewContacts.map(c => c.normalizedNumero));
      const existingContactNumbers = new Set(existingContactsMap.keys());
      const trulyNewContacts = normalizedNewContacts.filter(c => !existingContactsMap.has(c.normalizedNumero));
      const removedContactNumbers = [...existingContactNumbers].filter(num => !newContactNumbers.has(num));

      const shouldPreserveStats = existingCampanha && existingCampanha.enviados > 0;

      const updateData: any = {
        nome: nome.trim(),
        tipo_mensagem: primeiraVariacao.tipo,
        mensagem: primeiraVariacao.tipo === "text" ? primeiraVariacao.mensagem.trim() : primeiraVariacao.mensagem || null,
        media_base64: primeiraMediaBase64,
        delay_min: delayMinSeconds,
        delay_max: delayMaxSeconds,
        delay_bloco_min: delayBlocoMin,
        delay_bloco_max: delayBlocoMax,
        instancias_ids: selectedInstancias,
        instance_rotation_state: {},
        disabled_instancias_ids: [],
        last_instance_id: null,
        updated_at: new Date().toISOString()
      };

      if (!shouldPreserveStats) {
        updateData.total_contatos = selectedContatosForSubmit.length;
        updateData.status = "pending";
        updateData.enviados = 0;
        updateData.falhas = 0;
        updateData.iniciado_em = null;
        updateData.finalizado_em = null;
      }

      const { error: campanhaError } = await supabase.from("disparos_campanhas").update(updateData).eq("id", campanhaId);
      if (campanhaError) throw campanhaError;

      await supabase.from("disparos_campanha_variacoes").delete().eq("campanha_id", campanhaId);

      const variacoesToInsert: any[] = [];
      for (let blocoIndex = 0; blocoIndex < blocos.length; blocoIndex++) {
        const bloco = blocos[blocoIndex];
        for (let variacaoIndex = 0; variacaoIndex < bloco.variacoes.length; variacaoIndex++) {
          const v = bloco.variacoes[variacaoIndex];
          let mediaBase64: string | null = v.mediaBase64Existing || null;
          if (v.mediaFile) {
            const buffer = await v.mediaFile.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            mediaBase64 = `data:${v.mediaFile.type};base64,${btoa(binary)}`;
          }
          variacoesToInsert.push({
            campanha_id: campanhaId, bloco: blocoIndex, tipo_mensagem: v.tipo,
            mensagem: v.tipo === "text" ? v.mensagem.trim() : v.mensagem || null,
            media_base64: mediaBase64, ordem: variacaoIndex
          });
        }
      }

      const { error: variacoesError } = await supabase.from("disparos_campanha_variacoes").insert(variacoesToInsert);
      if (variacoesError) throw variacoesError;

      if (shouldPreserveStats) {
        await supabase.from("disparos_campanha_contatos").update({ archived: true }).eq("campanha_id", campanhaId).in("status", ["sent", "failed"]);
        if (removedContactNumbers.length > 0) {
          await supabase.from("disparos_campanha_contatos").delete().eq("campanha_id", campanhaId).in("numero", removedContactNumbers);
        }
        if (trulyNewContacts.length > 0) {
          const { error: contatosError } = await supabase.from("disparos_campanha_contatos").insert(
            trulyNewContacts.map(c => ({ campanha_id: campanhaId, numero: c.normalizedNumero, nome: c.nome || null, status: "pending" }))
          );
          if (contatosError) throw contatosError;
        }
        await supabase.from("disparos_campanhas").update({ total_contatos: selectedContatosForSubmit.length, enviados: 0, falhas: 0, status: "pending", iniciado_em: null, finalizado_em: null }).eq("id", campanhaId);
      } else {
        await supabase.from("disparos_campanha_contatos").delete().eq("campanha_id", campanhaId);
        const { error: contatosError } = await supabase.from("disparos_campanha_contatos").insert(
          selectedContatosForSubmit.map(c => ({ campanha_id: campanhaId, numero: c.numero.startsWith("55") ? c.numero : `55${c.numero}`, nome: c.nome || null, status: "pending" }))
        );
        if (contatosError) throw contatosError;
      }

      toast.success("Campanha atualizada com sucesso!");
      onCampanhaAtualizada();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating campaign:", error);
      toast.error(error.message || "Erro ao atualizar campanha");
    } finally {
      setIsLoading(false);
    }
  };

  const getMediaIcon = (tipo: string) => {
    switch (tipo) {
      case "image": return <Image className="h-4 w-4" />;
      case "audio": return <Music className="h-4 w-4" />;
      case "video": return <Video className="h-4 w-4" />;
      case "document": return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getAcceptTypes = (tipo: string) => {
    switch (tipo) {
      case "image": return "image/jpeg,image/png,image/gif,image/webp";
      case "audio": return "audio/mpeg,audio/ogg,audio/wav,audio/mp4";
      case "video": return "video/mp4,video/3gpp,video/quicktime";
      case "document": return "application/pdf,.doc,.docx";
      default: return "*/*";
    }
  };

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "text": return "Texto"; case "image": return "Imagem";
      case "audio": return "Áudio"; case "video": return "Vídeo";
      case "document": return "Documento"; default: return tipo;
    }
  };

  const getSliderConfig = () => delayUnit === "minutes" ? { min: 1, max: 60, step: 1 } : { min: 3, max: 120, step: 1 };
  const sliderConfig = getSliderConfig();
  const unitLabel = delayUnit === "minutes" ? "min" : "s";

  const SOCIAL_TIPOS = ["instagram","facebook","tiktok","youtube","linkedin","twitter","whatsapp","kwai","link"];
  const SOCIAL_PREFIXES: Record<string, string> = {
    instagram: "https://instagram.com/", facebook: "https://facebook.com/",
    tiktok: "https://tiktok.com/@", youtube: "https://youtube.com/@",
    linkedin: "https://linkedin.com/in/", twitter: "https://x.com/",
    whatsapp: "https://wa.me/", kwai: "https://kwai.com/@", link: "",
  };
  const buildSocialUrl = (tipo: string, valor: string): string => {
    const prefix = SOCIAL_PREFIXES[tipo] ?? "";
    if (!prefix) return valor.startsWith("http") ? valor : `https://${valor}`;
    if (valor.startsWith("http")) return valor;
    return prefix + valor.replace(/^@/, "");
  };

  // ── Etapa 1: Instâncias ────────────────────────────────────────────────────
  const renderEtapa1 = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
        <div className="flex flex-col items-center gap-2 py-6">
          <div className="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <Phone className="h-7 w-7 text-white" />
          </div>
          <h3 className="text-lg font-semibold">Escolher Instâncias WhatsApp</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Selecione uma ou mais instâncias que serão usadas para enviar as mensagens
          </p>
        </div>

        {instancias.length > 0 ? (
          <>
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Instâncias Disponíveis ({instancias.filter(i => selectedInstancias.includes(i.id)).length} selecionada{instancias.filter(i => selectedInstancias.includes(i.id)).length !== 1 ? "s" : ""})
            </p>
            <div className="space-y-2">
              {instancias.map(inst => {
                const isSelected = selectedInstancias.includes(inst.id);
                const connStatus = instanciaStatusMap[inst.id] ?? "loading";
                const isConnected = connStatus === "connected";
                const isLoadingStatus = connStatus === "loading";
                return (
                  <div
                    key={inst.id}
                    onClick={() => toggleInstancia(inst.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected ? "border-green-500 bg-green-500/5" : "border-border hover:border-border/80 hover:bg-muted/30"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? "bg-green-500 text-white shadow-md" : "bg-muted text-muted-foreground"
                    }`}>
                      <Phone className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{inst.nome}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isLoadingStatus ? (
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" />
                        ) : (
                          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-destructive"}`} />
                        )}
                        <span className={`text-xs font-medium ${isLoadingStatus ? "text-muted-foreground" : isConnected ? "text-green-600" : "text-destructive"}`}>
                          {isLoadingStatus ? "Verificando…" : isConnected ? "Conectada" : "Desconectada"}
                        </span>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? "border-green-500 bg-green-500" : "border-border"
                    }`}>
                      {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-3 border-2 border-dashed rounded-xl">
            <Phone className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground text-center">Nenhuma instância configurada.</p>
          </div>
        )}
        {selectedInstancias.length === 0 && instancias.length > 0 && (
          <p className="text-xs text-destructive mt-3 text-center">Selecione pelo menos uma instância para continuar</p>
        )}
      </div>
      <div className="flex justify-between gap-2 pt-4 border-t px-6 pb-6 flex-shrink-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={() => setEtapa(2)} disabled={selectedInstancias.length === 0}>
          Próximo: Mensagens
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ── Etapa 2: Mensagens ─────────────────────────────────────────────────────
  const renderEtapa2 = () => (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Form col */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          <div className="space-y-6 pt-4">
            {/* Blocos */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {templates.length > 0 && (
                  <Popover open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileDown className="h-4 w-4 mr-1" />Importar Template
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="end">
                      <div className="p-3 border-b">
                        <p className="font-medium text-sm">Selecionar Template</p>
                      </div>
                      <ScrollArea className="max-h-64">
                        <div className="p-2 space-y-1">
                          {templates.map(template => (
                            <Button key={template.id} variant="ghost" className="w-full justify-start text-left h-auto py-2" onClick={() => importTemplate(template)}>
                              <div className="flex flex-col items-start">
                                <span className="font-medium text-sm">{template.nome}</span>
                                <span className="text-xs text-muted-foreground">
                                  {new Set(template.variacoes?.map(v => v.bloco) || []).size} bloco(s), {template.variacoes?.length || 0} variação(ões)
                                </span>
                              </div>
                            </Button>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                )}
                <Button variant="outline" size="sm" onClick={addBloco}>
                  <Plus className="h-4 w-4 mr-1" />Adicionar Bloco
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <Label className="text-sm font-medium">Blocos de Mensagem ({blocos.length})</Label>
              </div>

              <div className="space-y-4">
                {blocos.map((bloco, blocoIndex) => (
                  <Card key={bloco.id} className="p-3 border-2">
                    <Collapsible open={blocosAbertos[bloco.id]} onOpenChange={() => toggleBlocoAberto(bloco.id)}>
                      <div className="flex items-center justify-between">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2 p-0 h-auto hover:bg-transparent">
                            {blocosAbertos[bloco.id] ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <Badge variant="default" className="gap-1 rounded">
                              <Layers className="h-3 w-3" />Bloco {blocoIndex + 1}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({bloco.variacoes.length} variação{bloco.variacoes.length !== 1 ? "ões" : ""})
                            </span>
                          </Button>
                        </CollapsibleTrigger>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeBloco(bloco.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <CollapsibleContent className="pt-3 space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Shuffle className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs font-medium">Variações (envio aleatório)</span>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => addVariacao(bloco.id)} className="h-7 text-xs">
                              <Plus className="h-3 w-3 mr-1" />Variação
                            </Button>
                          </div>

                          {bloco.variacoes.map((variacao, variacaoIndex) => (
                            <Card key={variacao.id} className="p-2 bg-muted/30">
                              <Collapsible open={variacoesAbertas[variacao.id]} onOpenChange={() => toggleVariacaoAberta(variacao.id)}>
                                <div className="flex items-center justify-between">
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-2 p-0 h-auto hover:bg-transparent">
                                      {variacoesAbertas[variacao.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                      <Badge variant="secondary" className="gap-1 text-xs rounded">
                                        {getMediaIcon(variacao.tipo)}{variacaoIndex + 1}. {getTipoLabel(variacao.tipo)}
                                      </Badge>
                                    </Button>
                                  </CollapsibleTrigger>
                                  {bloco.variacoes.length > 1 && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeVariacao(bloco.id, variacao.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>

                                <CollapsibleContent className="pt-2 space-y-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Tipo</Label>
                                    <div className="grid grid-cols-5 gap-1">
                                      {(["text","image","audio","video","document"] as const).map(t => (
                                        <Button key={t} size="sm" variant={variacao.tipo === t ? "default" : "outline"} className="text-xs h-7 px-1" onClick={() => updateVariacao(bloco.id, variacao.id, { tipo: t, mediaFile: null, mediaPreview: null })}>
                                          {getTipoLabel(t)}
                                        </Button>
                                      ))}
                                    </div>
                                  </div>

                                  {variacao.tipo === "text" ? (
                                    <div className="space-y-1">
                                      <Label className="text-xs">Mensagem</Label>
                                      <Textarea
                                        placeholder="Digite sua mensagem..."
                                        value={variacao.mensagem}
                                        onChange={e => updateVariacao(bloco.id, variacao.id, { mensagem: e.target.value })}
                                        rows={2}
                                        className="text-sm"
                                      />
                                      <p className="text-xs text-muted-foreground">Variáveis: {"{nome}"} - Nome completo | {"{primeironome}"} - Primeiro nome</p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div
                                        className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary transition-colors"
                                        onClick={() => { const input = mediaInputRefs.current[variacao.id]; if (input) input.click(); }}
                                      >
                                        {variacao.mediaPreview ? (
                                          <div className="space-y-1">
                                            {variacao.tipo === "image" && variacao.mediaPreview !== "Mídia existente" && <img src={variacao.mediaPreview} alt="Preview" className="max-h-16 mx-auto rounded" />}
                                            {(variacao.tipo === "audio" || variacao.tipo === "document" || variacao.mediaPreview === "Mídia existente") && (
                                              <div className="flex items-center justify-center gap-2">
                                                {getMediaIcon(variacao.tipo)}
                                                <span className="text-xs">{variacao.mediaPreview}</span>
                                              </div>
                                            )}
                                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={e => { e.stopPropagation(); updateVariacao(bloco.id, variacao.id, { mediaFile: null, mediaPreview: null, mediaBase64Existing: null }); }}>
                                              <X className="h-3 w-3 mr-1" />Remover
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="space-y-1">
                                            <Upload className="h-5 w-5 mx-auto text-muted-foreground" />
                                            <p className="text-xs text-muted-foreground">Clique para selecionar</p>
                                          </div>
                                        )}
                                      </div>
                                      <input
                                        ref={el => { mediaInputRefs.current[variacao.id] = el; }}
                                        type="file"
                                        accept={getAcceptTypes(variacao.tipo)}
                                        onChange={e => handleMediaUpload(bloco.id, variacao.id, e)}
                                        className="hidden"
                                      />
                                      <div className="space-y-1">
                                        <Label className="text-xs">Legenda (opcional)</Label>
                                        <Textarea
                                          placeholder="Digite uma legenda..."
                                          value={variacao.mensagem}
                                          onChange={e => updateVariacao(bloco.id, variacao.id, { mensagem: e.target.value })}
                                          rows={1}
                                          className="text-sm"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </CollapsibleContent>
                              </Collapsible>
                            </Card>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}
              </div>
            </div>

            {/* Delay entre blocos */}
            {blocos.length > 1 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Label className="text-sm">Intervalo entre blocos ({delayBlocoMin} a {delayBlocoMax} seg)</Label>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Mínimo: {delayBlocoMin}s</span><span>Máximo: {delayBlocoMax}s</span>
                  </div>
                  <Slider value={[delayBlocoMin, delayBlocoMax]} min={1} max={30} step={1} onValueChange={([min, max]) => { setDelayBlocoMin(min); setDelayBlocoMax(max); }} />
                </div>
              </div>
            )}

            {/* Delay entre contatos */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <Label className="text-sm">Intervalo entre contatos ({delayMin} a {delayMax} {unitLabel})</Label>
                </div>
                <Select value={delayUnit} onValueChange={v => {
                  setDelayUnit(v as "seconds" | "minutes");
                  if (v === "minutes") { setDelayMin(1); setDelayMax(5); } else { setDelayMin(5); setDelayMax(15); }
                }}>
                  <SelectTrigger className="w-full sm:w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Segundos</SelectItem>
                    <SelectItem value="minutes">Minutos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Mínimo: {delayMin}{unitLabel}</span><span>Máximo: {delayMax}{unitLabel}</span>
                </div>
                <Slider value={[delayMin, delayMax]} min={sliderConfig.min} max={sliderConfig.max} step={sliderConfig.step} onValueChange={([min, max]) => { setDelayMin(min); setDelayMax(max); }} />
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview - desktop only */}
        <div className="hidden lg:flex w-80 border-l flex-col bg-muted/30">
          <div className="p-3 border-b bg-background flex items-center gap-2">
            <p className="font-medium text-sm">Prévia do Disparo</p>
            <Button variant="ghost" size="icon" onClick={generateRandomPreview} className="h-6 w-6"
              disabled={blocos.length === 0 || blocos.every(b => b.variacoes.every(v => !(v.tipo === "text" && v.mensagem) && !(v.tipo !== "text" && (v.mediaPreview || v.mediaBase64Existing))))}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col min-h-[300px] lg:min-h-0">
            <div className="bg-[#075E54] text-white p-3 flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-semibold">C</div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">Cliente</p>
                <p className="text-[10px] text-white/70">online</p>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 relative" style={{ backgroundColor: "#ECE5DD", backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cdc4' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }}>
              {blocos.length > 1 && (
                <div className="absolute top-1 left-1">
                  <span className="bg-[#FFF3CD] text-[#856404] text-[9px] px-1.5 py-0.5 rounded-full shadow-sm">
                    ⏱️ {delayBlocoMin}s - {delayBlocoMax}s entre blocos
                  </span>
                </div>
              )}
              <div className="space-y-3 pt-4" key={previewKey}>
                {Object.keys(previewMessages).length > 0 ? (
                  blocos.map((bloco, blocoIndex) => {
                    const preview = previewMessages[blocoIndex];
                    if (!preview) return null;
                    return (
                      <div key={`${bloco.id}-preview`} className="space-y-2">
                        {blocos.length > 1 && (
                          <div className="flex justify-center">
                            <span className="bg-[#E1F3FB] text-[#54656F] text-[10px] px-2 py-0.5 rounded-full shadow-sm">Bloco {blocoIndex + 1}</span>
                          </div>
                        )}
                        <div className="flex justify-end">
                          <div className="max-w-[90%] bg-[#D9FDD3] rounded-lg shadow-sm">
                            <div className="p-2">
                              {preview.tipo === "image" && preview.mediaPreview && preview.mediaPreview !== "Mídia existente" && (
                                <img src={preview.mediaPreview} alt="Preview" className="rounded max-h-32 object-contain mb-1" />
                              )}
                              {(preview.tipo === "audio") && preview.mediaPreview && (
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
                              {!!preview.text && <p className="text-xs text-[#111B21] whitespace-pre-wrap break-words">{preview.text}</p>}
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
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <Shuffle className="h-6 w-6 text-[#667781]/50" />
                    <span className="text-[#667781] text-xs text-center px-4">Adicione conteúdo para ver a prévia</span>
                  </div>
                )}
              </div>
            </div>
            <div className="bg-[#F0F2F5] p-2 flex items-center gap-2">
              <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-[#667781]">Digite uma mensagem</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-4 border-t px-6 pb-4 flex-shrink-0">
        <Button variant="outline" onClick={() => setEtapa(1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />Voltar
        </Button>
        <Button onClick={() => setEtapa(3)} disabled={blocos.length === 0}>
          Próximo: Contatos<ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ── Etapa 3: Contatos ──────────────────────────────────────────────────────
  const renderEtapa3 = () => {
    const contatosFiltrados = contatos.filter(c => {
      if (allContactsFilterOrigens.size > 0 && !(c.origem && allContactsFilterOrigens.has(c.origem))) return false;
      if (allContactsFilterEtiquetas.size > 0) {
        const isNutrindo = numerosDisparados.has(c.numero.slice(-8));
        const isSemWpp = numerosSemWhatsApp.has(c.numero.slice(-8));
        const temEtiqueta = isNutrindo || isSemWpp;
        if (allContactsFilterEtiquetas.has("nutrindo") && !isNutrindo) return false;
        if (allContactsFilterEtiquetas.has("sem_whatsapp") && !isSemWpp) return false;
        if (allContactsFilterEtiquetas.has("sem_etiqueta") && temEtiqueta) return false;
      }
      return true;
    });
    const totalPages = Math.ceil(contatosFiltrados.length / allContactsPerPage);
    const pageContatos = contatosFiltrados.slice((allContactsPage - 1) * allContactsPerPage, allContactsPage * allContactsPerPage);

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar */}
        <div className="px-6 pt-4 pb-2 flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <List className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Label className="text-sm">
                Lista de Contatos ({contatos.length})
                {selectedContacts.size > 0 && (
                  <span className="text-muted-foreground ml-1">· {selectedContacts.size} selecionado{selectedContacts.size !== 1 ? "s" : ""}</span>
                )}
              </Label>
            </div>
            
          </div>

          {/* Selection + origin filter */}
          {contatos.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Button variant="default" size="sm" className="text-xs px-2 h-7" onClick={() => setSelectedContacts(prev => { const next = new Set(prev); pageContatos.forEach(c => next.add(c.numero)); return next; })}>
                <CheckSquare className="h-3 w-3 mr-1" />Marcar Todos
              </Button>
              <Button variant="outline" size="sm" className="text-xs px-2 h-7" onClick={() => setSelectedContacts(prev => { const next = new Set(prev); pageContatos.forEach(c => next.delete(c.numero)); return next; })}>
                <Square className="h-3 w-3 mr-1" />Desmarcar Todos
              </Button>
              {origensUnicas.length > 1 && (
                <>
                  <div className="w-px h-5 bg-border mx-0.5" />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <Database className="h-3 w-3" />
                        Origem{allContactsFilterOrigens.size > 0 ? ` (${allContactsFilterOrigens.size})` : ""}
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0" align="start">
                      <div className="p-2 border-b flex gap-1">
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setAllContactsFilterOrigens(new Set(origensUnicas))}>Todas</Button>
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setAllContactsFilterOrigens(new Set())}>Limpar</Button>
                      </div>
                      <ScrollArea className="max-h-44">
                        <div className="p-2 space-y-1">
                          {origensUnicas.map(origem => (
                            <div key={origem} className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer" onClick={() => toggleOrigemFilter(origem)}>
                              <Checkbox checked={allContactsFilterOrigens.has(origem)} onCheckedChange={() => toggleOrigemFilter(origem)} />
                              <span className="text-sm truncate flex-1">{origem}</span>
                              <Badge variant="secondary" className="text-xs">{contatos.filter(c => c.origem === origem).length}</Badge>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </>
              )}
              <div className="w-px h-5 bg-border mx-0.5" />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                    <ChevronDown className="h-3 w-3" />
                    Etiqueta{allContactsFilterEtiquetas.size > 0 ? ` (${allContactsFilterEtiquetas.size})` : ""}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-0" align="start">
                  <div className="p-2 border-b flex gap-1">
                    <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setAllContactsFilterEtiquetas(new Set())}>Limpar</Button>
                  </div>
                  <div className="p-2 space-y-1">
                    {[
                      { key: "nutrindo", label: "Nutrindo", count: contatos.filter(c => numerosDisparados.has(c.numero.slice(-8))).length },
                      { key: "sem_whatsapp", label: "Sem WhatsApp", count: contatos.filter(c => numerosSemWhatsApp.has(c.numero.slice(-8))).length },
                      { key: "sem_etiqueta", label: "Sem Etiqueta", count: contatos.filter(c => !numerosDisparados.has(c.numero.slice(-8)) && !numerosSemWhatsApp.has(c.numero.slice(-8))).length },
                    ].map(({ key, label, count }) => (
                      <div key={key} className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer" onClick={() => setAllContactsFilterEtiquetas(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })}>
                        <Checkbox checked={allContactsFilterEtiquetas.has(key)} onCheckedChange={() => setAllContactsFilterEtiquetas(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; })} />
                        <span className="text-sm flex-1">{label}</span>
                        <Badge variant="secondary" className="text-xs">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={exportContatos} className="h-7 text-xs">
                  <FileDown className="h-3 w-3 mr-1" />Exportar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setContatos([])} className="h-7 text-xs text-destructive hover:text-destructive">
                  <Trash2 className="h-3 w-3 mr-1" />Limpar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Contact list */}
        <div className="flex-1 min-h-0 overflow-hidden px-6">
          <ScrollArea className="h-full pr-1">
            <div className="space-y-0.5 pb-2">
              {contatos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">Nenhum contato carregado.</div>
              ) : (
                pageContatos.map((c, idx) => {
                  const globalIdx = (allContactsPage - 1) * allContactsPerPage + idx;
                  const isSelected = selectedContacts.has(c.numero);
                  const isNutrindo = numerosDisparados.has(c.numero.slice(-8));
                  const isSemWhatsApp = numerosSemWhatsApp.has(c.numero.slice(-8));
                  const extras = c.dados_extras ?? {};
                  const sociaisDoContato = SOCIAL_TIPOS.filter(chave => extras[chave]?.trim());
                  return (
                    <div
                      key={`${globalIdx}-${c.numero}`}
                      className={`flex items-center justify-between p-2 hover:bg-muted rounded text-sm border-b last:border-b-0 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                      onClick={() => toggleContactSelection(c.numero)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Checkbox checked={isSelected} onCheckedChange={() => toggleContactSelection(c.numero)} onClick={e => e.stopPropagation()} />
                        <span className="text-xs text-muted-foreground w-7 shrink-0">{globalIdx + 1}.</span>
                         <div className="flex flex-col min-w-0">
                           <div className="flex items-center gap-1.5 flex-wrap">
                             <div className="flex flex-col min-w-0">
                               {c.nome && <span className="truncate text-sm font-medium leading-tight">{c.nome}</span>}
                               <span className="truncate text-xs text-muted-foreground leading-tight">{formatPhoneDisplay(c.numero)}</span>
                             </div>
                             {isNutrindo && (
                               <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500/20 text-amber-700 border-amber-500/30 shrink-0">nutrindo</Badge>
                             )}
                             {isSemWhatsApp && (
                               <Badge className="text-[9px] px-1 py-0 h-4 bg-orange-500/15 text-orange-600 border-orange-400/40 shrink-0">sem whatsapp</Badge>
                             )}
                           </div>
                           {c.origem && <span className="text-[10px] text-muted-foreground truncate">{c.origem}</span>}
                         </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                        {sociaisDoContato.map(chave => {
                          const valor = extras[chave];
                          const url = buildSocialUrl(chave, valor);
                          const Icon = chave === "whatsapp" ? Phone : chave === "link" ? ExternalLink : AtSign;
                          return (
                            <Button key={chave} size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-primary" title={`${chave}: ${valor}`} asChild>
                              <a href={url} target="_blank" rel="noreferrer"><Icon className="w-3 h-3" /></a>
                            </Button>
                          );
                        })}
                        {(Object.keys(extras).length > 0 || c.camposMapeados) && (
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setContatoDetalhesAberto(c)}>
                            <Info className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeContato(c.numero)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t px-6 pb-4 pt-3 space-y-2">
          {contatosFiltrados.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span>Por página:</span>
                <Select value={String(allContactsPerPage)} onValueChange={v => { setAllContactsPerPage(Number(v)); setAllContactsPage(1); }}>
                  <SelectTrigger className="h-6 w-16 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-6 w-6" disabled={allContactsPage === 1} onClick={() => setAllContactsPage(p => p - 1)}>
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <span className="px-2">{allContactsPage} / {totalPages || 1}</span>
                <Button variant="outline" size="icon" className="h-6 w-6" disabled={allContactsPage >= (totalPages || 1)} onClick={() => setAllContactsPage(p => p + 1)}>
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <Button variant="outline" onClick={() => setEtapa(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" />Voltar
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || selectedContatosForSubmit.length === 0}>
              {isLoading ? "Salvando..." : `Salvar Alterações (${selectedContatosForSubmit.length} contatos)`}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoadingData) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <div className="flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-muted-foreground">Carregando campanha...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-4xl p-0 gap-0 !grid-rows-none !flex flex-col overflow-hidden" style={{ height: "min(90vh, 800px)" }}>
          {/* Fixed Header */}
          <div className="p-4 sm:p-6 pb-3 flex-shrink-0 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <DialogTitle className="text-base sm:text-lg">Editar Campanha de Disparo</DialogTitle>
            </div>
            <DialogDescription className="sr-only">Edite as configurações da campanha</DialogDescription>
            {/* Nome */}
            <div className="mb-4">
              <Input
                placeholder="Nome da campanha…"
                value={nome}
                onChange={e => setNome(e.target.value)}
                className="text-sm"
              />
            </div>
            {/* Stepper */}
            <div className="flex items-center">
              {([
                { n: 1, label: "Instâncias" },
                { n: 2, label: "Mensagens" },
                { n: 3, label: "Contatos" },
              ] as const).map(({ n, label }, idx) => (
                <React.Fragment key={n}>
                  <button
                    className="flex items-center gap-2 group shrink-0"
                    onClick={() => {
                      if (n < etapa || (n === 2 && selectedInstancias.length > 0) || (n === 3 && blocos.length > 0)) {
                        setEtapa(n);
                      }
                    }}
                  >
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all shrink-0 ${
                      etapa === n ? "bg-primary text-primary-foreground shadow" :
                      etapa > n ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {etapa > n ? "✓" : n}
                    </div>
                    <span className={`text-xs font-medium transition-colors hidden sm:block ${etapa === n ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </button>
                  {idx < 2 && (
                    <div className={`h-px flex-1 mx-3 transition-colors ${etapa > n ? "bg-primary/40" : "bg-border"}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step Content */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {etapa === 1 && renderEtapa1()}
            {etapa === 2 && renderEtapa2()}
            {etapa === 3 && renderEtapa3()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Date Filter Dialog */}
      <Dialog open={showDateFilter} onOpenChange={open => {
        setShowDateFilter(open);
        if (!open) { setDateFrom(""); setDateTo(""); setDateFilterType(null); setSelectedKanbanColumnId(null); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Filtrar por Período</DialogTitle>
            <DialogDescription>Importe contatos de um período específico</DialogDescription>
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
                if (dateFilterType === "leads") importFromLeads(false);
                else if (dateFilterType === "clientes") importFromClientes(false);
                else if (dateFilterType === "kanban_whatsapp" && selectedKanbanColumnId) importFromKanbanColumn(selectedKanbanColumnId, false);
                else if (dateFilterType === "kanban_disparos" && selectedKanbanColumnId) importFromDisparosKanbanColumn(selectedKanbanColumnId, false);
              }} disabled={loadingDataSource}>Importar Todos</Button>
              <Button onClick={() => {
                if (dateFilterType === "leads") importFromLeads(true);
                else if (dateFilterType === "clientes") importFromClientes(true);
                else if (dateFilterType === "kanban_whatsapp" && selectedKanbanColumnId) importFromKanbanColumn(selectedKanbanColumnId, true);
                else if (dateFilterType === "kanban_disparos" && selectedKanbanColumnId) importFromDisparosKanbanColumn(selectedKanbanColumnId, true);
              }} disabled={loadingDataSource || (!dateFrom && !dateTo)}>
                {loadingDataSource ? "Importando..." : "Importar Filtrado"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contato Detalhes Popup */}
      {contatoDetalhesAberto && (
        <ContatoDetalhesPopup
          contato={{
            id: contatoDetalhesAberto.numero,
            telefone: contatoDetalhesAberto.numero,
            nome: contatoDetalhesAberto.nome,
            dados_extras: contatoDetalhesAberto.dados_extras,
          }}
          camposMapeados={contatoDetalhesAberto.camposMapeados ?? {}}
          open={!!contatoDetalhesAberto}
          onOpenChange={(open) => { if (!open) setContatoDetalhesAberto(null); }}
        />
      )}
    </>
  );
}
