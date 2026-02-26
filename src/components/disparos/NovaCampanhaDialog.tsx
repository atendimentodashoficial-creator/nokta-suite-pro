import React, { useState, useRef, useEffect, useCallback, type ReactNode, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Upload, FileText, Image, Video, Music, X, Plus, Trash2, Users, Kanban, Phone, Shuffle, ChevronDown, ChevronUp, Layers, Copy, FileDown, List, ClipboardPaste, Database, RefreshCw, Check, CheckSquare, Square, ChevronLeft, ChevronRight, ExternalLink, AtSign, Info } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { normalizePhoneNumber } from "@/utils/whatsapp";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { expandSpintax, processSpintaxRandom } from "@/utils/spintax";
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
interface NovaCampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCampanhaCriada: () => void;
}
interface ColunaMapeamento {
  colunaCsv: string;
  campoSistema: string;
}

interface Contato {
  numero: string;
  nome?: string;
  origem?: string; // Nome da lista/fonte de onde foi importado
  dados_extras?: Record<string, string> | null;
  camposMapeados?: Record<string, string> | null; // chave -> nome amigável
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
interface ListaImportada {
  id: string;
  nome: string;
  total_contatos: number;
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
  const [etapaCriacao, setEtapaCriacao] = useState<1 | 2 | 3>(1);
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
  const [instanciaStatusMap, setInstanciaStatusMap] = useState<Record<string, "connected" | "disconnected" | "loading">>({});

  // Templates
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);
  const [templateImported, setTemplateImported] = useState(false);

  // Listas do extrator
  const [listasExtrator, setListasExtrator] = useState<ListaExtrator[]>([]);

  // Listas importadas
  const [listasImportadas, setListasImportadas] = useState<ListaImportada[]>([]);

  // Números que já foram disparados em alguma campanha (para badge "nutrindo") — Map<last8, enviado_em>
  const [numerosDisparados, setNumerosDisparados] = useState<Map<string, string>>(new Map());

  // Números sem WhatsApp em campanhas anteriores (para badge "sem whatsapp") — Map<last8, enviado_em>
  const [numerosSemWhatsApp, setNumerosSemWhatsApp] = useState<Map<string, string>>(new Map());

  // Popup de detalhes do contato na etapa 3
  const [contatoDetalhesAberto, setContatoDetalhesAberto] = useState<Contato | null>(null);

  // Seleção de contatos (para permitir desselecionar antes de criar campanha)
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Paginação do popup "Ver todos"
  const [allContactsPage, setAllContactsPage] = useState(1);
  const [allContactsPerPage, setAllContactsPerPage] = useState(50);
  const [allContactsFilterOrigens, setAllContactsFilterOrigens] = useState<Set<string>>(new Set());
  const [allContactsFilterEtiquetas, setAllContactsFilterEtiquetas] = useState<Set<string>>(new Set());

  // Deduplicação automática de números
  const [deduplicarNumeros, setDeduplicarNumeros] = useState(true);

  // Lista de origens únicas para o dropdown
  const origensUnicas = useMemo(() => {
    const origens = new Set<string>();
    contatos.forEach(c => {
      if (c.origem) origens.add(c.origem);
    });
    return Array.from(origens).sort();
  }, [contatos]);

  // Contatos filtrados por origem (multi-select)
  const contatosFiltradosPorOrigem = useMemo(() => {
    if (allContactsFilterOrigens.size === 0) return contatos;
    return contatos.filter(c => c.origem && allContactsFilterOrigens.has(c.origem));
  }, [contatos, allContactsFilterOrigens]);

  // Toggle origem filter
  const toggleOrigemFilter = (origem: string) => {
    setAllContactsFilterOrigens(prev => {
      const next = new Set(prev);
      if (next.has(origem)) {
        next.delete(origem);
      } else {
        next.add(origem);
      }
      return next;
    });
    setAllContactsPage(1);
  };

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
      loadListasImportadasAndAutoImport();
      loadNumerosDisparados();
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
  const checkInstanciasStatus = async (instanciasList: DisparosInstancia[]) => {
    // Inicia todas como "loading"
    const loadingMap: Record<string, "connected" | "disconnected" | "loading"> = {};
    instanciasList.forEach(i => { loadingMap[i.id] = "loading"; });
    setInstanciaStatusMap(loadingMap);

    // Verifica todas em paralelo passando base_url e api_key
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
      .select("id, nome, base_url, api_key, is_active")
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
      // Verifica status real de conexão
      checkInstanciasStatus(data);
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
  const loadListasImportadas = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("listas_importadas")
        .select("id, nome, total_contatos")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (data) setListasImportadas(data);
    } catch (error) {
      console.error("Error loading listas importadas:", error);
    }
  };

  // Carrega listas importadas e já pré-popula contatos da etapa 3 automaticamente
  const loadListasImportadasAndAutoImport = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("listas_importadas")
        .select("id, nome, total_contatos, colunas_mapeamento")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return;
      setListasImportadas(data);

      // Busca contatos de cada lista (da mais nova para a mais antiga)
      // e monta mapa por chave (últimos 8 dígitos) para deduplicar
      // O contato da lista mais recente tem prioridade e fica no início
      const contatosPorChave = new Map<string, Contato & { listaIndex: number }>();

      for (let listaIndex = 0; listaIndex < data.length; listaIndex++) {
        const lista = data[listaIndex];
        // Monta mapa campo -> label amigável
        const mapeamento = (lista.colunas_mapeamento as unknown as ColunaMapeamento[] | null) ?? [];
        const camposMapeados: Record<string, string> = {};
        mapeamento.forEach((m) => {
          if (m.campoSistema && m.campoSistema !== "ignorar") {
            camposMapeados[m.campoSistema] = m.colunaCsv;
          }
        });

        const { data: contatosData } = await supabase
          .from("lista_importada_contatos")
          .select("telefone, nome, dados_extras")
          .eq("lista_id", lista.id)
          .eq("user_id", user.id)
          .limit(50000);

        (contatosData || []).forEach((c: any) => {
          if (c.telefone) {
            const numero = normalizePhoneNumber(c.telefone);
            if (numero.length >= 8) {
              const chave = getLast8Digits(numero);
              // Se o contato ainda não está no mapa, ou se esta lista é mais nova
              // (listaIndex menor = mais recente, pois ordenamos desc), sobrescreve
              const existing = contatosPorChave.get(chave);
              if (!existing || listaIndex < existing.listaIndex) {
                contatosPorChave.set(chave, {
                  numero,
                  nome: c.nome || undefined,
                  origem: lista.nome,
                  dados_extras: c.dados_extras || null,
                  camposMapeados: Object.keys(camposMapeados).length > 0 ? camposMapeados : null,
                  listaIndex,
                });
              }
            }
          }
        });
      }

      if (contatosPorChave.size > 0) {
        // Ordena: contatos da lista mais nova (listaIndex menor) vêm primeiro
        const allContatos: Contato[] = Array.from(contatosPorChave.values())
          .sort((a, b) => a.listaIndex - b.listaIndex)
          .map(({ listaIndex: _, ...c }) => c);

        setContatos(allContatos);
      }
    } catch (error) {
      console.error("Error loading listas importadas:", error);
    }
  };
  const loadNumerosDisparados = async () => {
    if (!user) return;
    try {
      // Busca campanhas do usuário primeiro
      const { data: campanhas } = await supabase
        .from("disparos_campanhas")
        .select("id")
        .eq("user_id", user.id);

      if (!campanhas || campanhas.length === 0) return;

      const campanhaIds = campanhas.map((c: any) => c.id);
      const nums = new Map<string, string>();
      const semWpp = new Map<string, string>();

      // Busca em lotes para contornar limite de 1000 linhas
      const BATCH = 500;
      for (let i = 0; i < campanhaIds.length; i += BATCH) {
        const batchIds = campanhaIds.slice(i, i + BATCH);
        let from = 0;
        const PAGE = 1000;
        // Nutrindo: enviados com sucesso
        while (true) {
          const { data } = await supabase
            .from("disparos_campanha_contatos")
            .select("numero, enviado_em")
            .in("campanha_id", batchIds)
            .in("status", ["sent", "delivered"])
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          data.forEach((d: any) => {
            const cleaned = d.numero?.replace(/\D/g, "");
            if (cleaned) {
              const key = cleaned.slice(-8);
              const existing = nums.get(key);
              // Mantém a data mais recente
              if (!existing || (d.enviado_em && d.enviado_em > existing)) {
                nums.set(key, d.enviado_em || "");
              }
            }
          });
          if (data.length < PAGE) break;
          from += PAGE;
        }
        // Sem WhatsApp: falharam com erro de número inexistente
        from = 0;
        while (true) {
          const { data } = await supabase
            .from("disparos_campanha_contatos")
            .select("numero, erro, enviado_em")
            .in("campanha_id", batchIds)
            .eq("status", "failed")
            .not("erro", "is", null)
            .range(from, from + PAGE - 1);
          if (!data || data.length === 0) break;
          data.forEach((d: any) => {
            const lower = (d.erro || "").toLowerCase();
            if (
              lower.includes("sem_whatsapp:") ||
              lower.includes("not on whatsapp") ||
              lower.includes("number not exists") ||
              lower.includes("not registered") ||
              lower.includes("phone not registered") ||
              lower.includes("invalid phone")
            ) {
              const cleaned = d.numero?.replace(/\D/g, "");
              if (cleaned) {
                const key = cleaned.slice(-8);
                const existing = semWpp.get(key);
                if (!existing || (d.enviado_em && d.enviado_em > existing)) {
                  semWpp.set(key, d.enviado_em || "");
                }
              }
            }
          });
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }

      setNumerosDisparados(nums);
      setNumerosSemWhatsApp(semWpp);
    } catch (error) {
      console.error("Error loading numeros disparados:", error);
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
    const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
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
      addContatosWithSelection(novosContatos, `Arquivo: ${fileName}`);
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
    // Auto-select new contact
    setSelectedContacts(prev => {
      const next = new Set(prev);
      next.add(numero);
      return next;
    });
    setNovoNumero("");
    setNovoNome("");
  };
  const removeContato = (numero: string) => {
    setContatos(prev => prev.filter(c => c.numero !== numero));
    setSelectedContacts(prev => {
      const next = new Set(prev);
      next.delete(numero);
      return next;
    });
  };
  const clearAll = () => {
    setContatos([]);
    setSelectedContacts(new Set());
  };

  // Helper para pegar últimos 8 dígitos do número (para deduplicação)
  const getLast8Digits = (numero: string) => {
    const digits = numero.replace(/\D/g, "");
    return digits.length > 8 ? digits.slice(-8) : digits;
  };

  // Helper to add contacts and auto-select them
  const addContatosWithSelection = (novosContatos: Contato[], origem?: string) => {
    setContatos(prev => {
      // Se deduplicação está ativada, usar últimos 8 dígitos para comparação
      const existingKeys = deduplicarNumeros 
        ? new Set(prev.map(c => getLast8Digits(c.numero)))
        : new Set(prev.map(c => c.numero));
      
      // Primeiro, deduplica os próprios novosContatos entre si
      const seenInNew = new Set<string>();
      const deduplicatedNew = novosContatos.filter(c => {
        const key = deduplicarNumeros ? getLast8Digits(c.numero) : c.numero;
        if (seenInNew.has(key)) {
          return false;
        }
        seenInNew.add(key);
        return true;
      });
      
      // Depois, filtra os que já existem na lista
      const unique = deduplicatedNew
        .filter(c => {
          const key = deduplicarNumeros ? getLast8Digits(c.numero) : c.numero;
          return !existingKeys.has(key);
        })
        .map(c => ({ ...c, origem: origem || c.origem }));
      
      return [...prev, ...unique];
    });
  };

  // Efeito para remover duplicatas quando o switch é ativado
  useEffect(() => {
    if (deduplicarNumeros && contatos.length > 0) {
      const seen = new Set<string>();
      const deduplicatedContatos = contatos.filter(c => {
        const key = getLast8Digits(c.numero);
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
      
      // Só atualiza se realmente removeu duplicatas
      if (deduplicatedContatos.length < contatos.length) {
        setContatos(deduplicatedContatos);
        // Atualiza também os selecionados
        setSelectedContacts(prev => {
          const validNumbers = new Set(deduplicatedContatos.map(c => c.numero));
          const next = new Set<string>();
          prev.forEach(num => {
            if (validNumbers.has(num)) {
              next.add(num);
            }
          });
          return next;
        });
      }
    }
  }, [deduplicarNumeros]);

  const toggleContactSelection = (numero: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(numero)) {
        next.delete(numero);
      } else {
        next.add(numero);
      }
      return next;
    });
  };

  const selectAllContactsOnPage = () => {
    const pageContacts = contatos.slice(
      (allContactsPage - 1) * allContactsPerPage, 
      allContactsPage * allContactsPerPage
    );
    setSelectedContacts(prev => {
      const next = new Set(prev);
      pageContacts.forEach(c => next.add(c.numero));
      return next;
    });
  };

  const deselectAllContactsOnPage = () => {
    const pageContacts = contatos.slice(
      (allContactsPage - 1) * allContactsPerPage, 
      allContactsPage * allContactsPerPage
    );
    setSelectedContacts(prev => {
      const next = new Set(prev);
      pageContacts.forEach(c => next.delete(c.numero));
      return next;
    });
  };

  // Contatos selecionados para envio
  const selectedContatosForSubmit = useMemo(() => {
    return contatos.filter(c => selectedContacts.has(c.numero));
  }, [contatos, selectedContacts]);
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
      addContatosWithSelection(novosContatos, "Leads");
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
      addContatosWithSelection(novosContatos, "Clientes");
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
      // Get column name for origin tracking
      const column = kanbanColumns.find(c => c.id === columnId);
      const columnName = column?.nome || "Kanban WhatsApp";
      
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
      addContatosWithSelection(novosContatos, `WA: ${columnName}`);
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
      // Get column name for origin tracking
      const column = disparosKanbanColumns.find(c => c.id === columnId);
      const columnName = column?.nome || "Kanban Disparos";
      
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
      addContatosWithSelection(novosContatos, `Disp: ${columnName}`);
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
      
      addContatosWithSelection(novosContatos, "WA: Leads");
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
      
      addContatosWithSelection(novosContatos, "Disp: Leads");
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

    addContatosWithSelection(novosContatos, lista.nome);

    toast.success(`${novosContatos.length} contato(s) importado(s) da lista "${lista.nome}"`);
    setShowImportDialog(false);
  };

  const importFromListaImportada = async (lista: ListaImportada) => {
    if (!user) return;
    setLoadingDataSource(true);
    try {
      const { data, error } = await supabase
        .from("lista_importada_contatos")
        .select("telefone, nome")
        .eq("lista_id", lista.id)
        .eq("user_id", user.id);

      if (error) throw error;

      const novosContatos: Contato[] = (data || [])
        .filter((c: any) => c.telefone)
        .map((c: any) => ({
          numero: normalizePhoneNumber(c.telefone),
          nome: c.nome || undefined,
        }))
        .filter((c: Contato) => c.numero.length >= 8);

      if (novosContatos.length === 0) {
        toast.info("Nenhum contato válido nesta lista");
        return;
      }

      addContatosWithSelection(novosContatos, lista.nome);
      toast.success(`${novosContatos.length} contato(s) importado(s) de "${lista.nome}"`);
      setShowImportDialog(false);
    } catch (err: any) {
      toast.error("Erro ao carregar lista importada");
    } finally {
      setLoadingDataSource(false);
    }
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
    if (selectedContatosForSubmit.length === 0) {
      toast.error("Selecione pelo menos um contato");
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
        // For media types, accept either a new file OR existing mediaPreview (from template)
        if (v.tipo !== "text" && !v.mediaFile && !v.mediaPreview) {
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
      } else if (primeiraVariacao.mediaPreview) {
        // Use existing mediaPreview (from template import)
        primeiraMediaBase64 = primeiraVariacao.mediaPreview;
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
        total_contatos: selectedContatosForSubmit.length,
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
          } else if (v.mediaPreview) {
            // Use existing mediaPreview (from template import)
            mediaBase64 = v.mediaPreview;
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

      // Insert contacts (only selected ones)
      const contatosToInsert = selectedContatosForSubmit.map(c => ({
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
    setEtapaCriacao(1);
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
    setSelectedContacts(new Set());
    setAllContactsPage(1);
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

  // ── Etapa 1: Instâncias ──────────────────────────────────────────────────────
  const renderEtapa1 = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
        {/* Header */}
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
                const isWhatsAppMain = inst.id === whatsappInstanciaId;
                const connStatus = instanciaStatusMap[inst.id] ?? "loading";
                const isConnected = connStatus === "connected";
                const isLoadingStatus = connStatus === "loading";
                return (
                  <div
                    key={inst.id}
                    onClick={() => toggleInstancia(inst.id)}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-green-500 bg-green-500/5"
                        : "border-border hover:border-border/80 hover:bg-muted/30"
                    }`}
                  >
                    {/* Avatar */}
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      isSelected ? "bg-green-500 text-white shadow-md" : "bg-muted text-muted-foreground"
                    }`}>
                      <Phone className="h-5 w-5" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{inst.nome}</span>
                        {isWhatsAppMain && (
                          <Badge variant="secondary" className="text-xs">WhatsApp Principal</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {isLoadingStatus ? (
                          <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-pulse" />
                        ) : (
                          <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-destructive"}`} />
                        )}
                        <span className={`text-xs font-medium ${
                          isLoadingStatus
                            ? "text-muted-foreground"
                            : isConnected
                            ? "text-green-600"
                            : "text-destructive"
                        }`}>
                          {isLoadingStatus ? "Verificando…" : isConnected ? "Conectada" : "Desconectada"}
                        </span>
                      </div>
                    </div>

                    {/* Checkbox */}
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
            <p className="text-sm text-muted-foreground text-center">
              Nenhuma instância configurada.
              <br />
              Configure em Configurações → Conexões.
            </p>
          </div>
        )}

        {selectedInstancias.length === 0 && instancias.length > 0 && (
          <p className="text-xs text-destructive mt-3 text-center">Selecione pelo menos uma instância para continuar</p>
        )}
      </div>

      {/* Footer */}
      <div className="flex justify-between gap-2 pt-4 border-t px-6 pb-6 flex-shrink-0">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button
          onClick={() => setEtapaCriacao(2)}
          disabled={selectedInstancias.length === 0}
        >
          Próximo: Mensagens
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ── Etapa 2: Mensagens ───────────────────────────────────────────────────────
  const renderEtapa2 = () => (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Content row: form + preview */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Form col */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          <div className="space-y-6 pt-4">

            {/* Blocos de Mensagem */}
            <div className="space-y-3">
              {/* Buttons row — above the label */}
              <div className="flex items-center gap-2">
                {templates.length > 0 && (
                  <Popover open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
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
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Bloco
                </Button>
              </div>

              {/* Label */}
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
                              <Layers className="h-3 w-3" />
                              Bloco {blocoIndex + 1}
                            </Badge>
                            <span className="text-xs text-muted-foreground ml-2">
                              ({bloco.variacoes.length} variação{bloco.variacoes.length !== 1 ? "ões" : ""})
                            </span>
                          </Button>
                        </CollapsibleTrigger>
                        <div className="flex items-center gap-1">
                          {(
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeBloco(bloco.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <CollapsibleContent className="pt-3 space-y-3">
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

                          {bloco.variacoes.map((variacao, variacaoIndex) => (
                            <Card key={variacao.id} className="p-2 bg-muted/30">
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
                                  {bloco.variacoes.length > 1 && (
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => removeVariacao(bloco.id, variacao.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>

                                <CollapsibleContent className="pt-2 space-y-2">
                                  <div className="space-y-1">
                                    <Label className="text-xs">Tipo</Label>
                                    <Tabs value={variacao.tipo} onValueChange={v => {
                                      updateVariacao(bloco.id, variacao.id, { tipo: v as MensagemVariacao["tipo"], mediaFile: null, mediaPreview: null });
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
                                      <p className="text-xs text-muted-foreground">
                                        Variáveis: {"{nome}"} - Nome completo | {"{primeironome}"} - Primeiro nome
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div
                                        className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary transition-colors"
                                        onClick={() => { const input = mediaInputRefs.current[variacao.id]; if (input) input.click(); }}
                                      >
                                        {variacao.mediaPreview ? (
                                          <div className="space-y-1">
                                            {variacao.tipo === "image" && <img src={variacao.mediaPreview} alt="Preview" className="max-h-16 mx-auto rounded" />}
                                            {variacao.tipo === "video" && <video src={variacao.mediaPreview} className="max-h-16 mx-auto rounded" controls />}
                                            {(variacao.tipo === "audio" || variacao.tipo === "document") && (
                                              <div className="flex items-center justify-center gap-2">
                                                {getMediaIcon(variacao.tipo)}
                                                <span className="text-xs">{variacao.mediaPreview}</span>
                                              </div>
                                            )}
                                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={e => {
                                              e.stopPropagation();
                                              updateVariacao(bloco.id, variacao.id, { mediaFile: null, mediaPreview: null });
                                            }}>
                                              <X className="h-3 w-3 mr-1" />
                                              Remover
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
                    <span>Mínimo: {delayBlocoMin}s</span>
                    <span>Máximo: {delayBlocoMax}s</span>
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
                  <Label className="text-sm">Intervalo entre contatos ({delayMin} a {delayMax} {delayUnit === "minutes" ? "min" : "seg"})</Label>
                </div>
                <Select value={delayUnit} onValueChange={v => {
                  setDelayUnit(v as "seconds" | "minutes");
                  if (v === "minutes") { setDelayMin(1); setDelayMax(5); } else { setDelayMin(5); setDelayMax(15); }
                }}>
                  <SelectTrigger className="w-full sm:w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seconds">Segundos</SelectItem>
                    <SelectItem value="minutes">Minutos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Mínimo: {delayMin}{unitLabel}</span>
                  <span>Máximo: {delayMax}{unitLabel}</span>
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
                            {preview.tipo === "image" && preview.mediaPreview && <img src={preview.mediaPreview} alt="Preview" className="rounded max-h-32 object-contain mb-1" />}
                            {preview.tipo === "video" && preview.mediaPreview && <div className="w-full h-20 bg-black/20 rounded flex items-center justify-center mb-1"><Video className="h-8 w-8 text-white/70" /></div>}
                            {preview.tipo === "audio" && preview.mediaPreview && (
                              <div className="flex items-center gap-2 py-2 px-1 min-w-[150px]">
                                <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center flex-shrink-0"><Music className="h-4 w-4 text-white" /></div>
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
                  <span className="text-[#667781] text-xs text-center px-4">
                    {blocos.length === 0 || blocos.every(b => b.variacoes.every(v => !(v.tipo === "text" && v.mensagem) && !(v.tipo !== "text" && v.mediaPreview)))
                      ? "Adicione conteúdo para ver a prévia"
                      : "Clique no ícone para ver uma possível mensagem"}
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="bg-[#F0F2F5] p-2 flex items-center gap-2">
            <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-[#667781]">Digite uma mensagem</div>
            <div className="w-8 h-8 rounded-full bg-[#075E54] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 15c1.66 0 3-1.34 3-3V6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 12c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-2.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end content row */}

      {/* Footer — full width below both columns */}
      <div className="flex justify-between gap-2 pt-4 border-t px-6 pb-4 flex-shrink-0">
        <Button variant="outline" onClick={() => setEtapaCriacao(1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Button
          onClick={() => setEtapaCriacao(3)}
          disabled={blocos.length === 0}
        >
          Próximo: Contatos
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  // ── Helpers de redes sociais para etapa 3 ────────────────────────────────────
  const SOCIAL_TIPOS_CAMP = ["instagram","facebook","tiktok","youtube","linkedin","twitter","whatsapp","kwai","link"];
  const SOCIAL_PREFIXES_CAMP: Record<string, string> = {
    instagram: "https://instagram.com/",
    facebook:  "https://facebook.com/",
    tiktok:    "https://tiktok.com/@",
    youtube:   "https://youtube.com/@",
    linkedin:  "https://linkedin.com/in/",
    twitter:   "https://x.com/",
    whatsapp:  "https://wa.me/",
    kwai:      "https://kwai.com/@",
    link:      "",
  };
  const buildSocialUrl = (tipo: string, valor: string): string => {
    const prefix = SOCIAL_PREFIXES_CAMP[tipo] ?? "";
    if (!prefix) return valor.startsWith("http") ? valor : `https://${valor}`;
    if (valor.startsWith("http")) return valor;
    return prefix + valor.replace(/^@/, "");
  };

  // ── Etapa 3: Contatos ────────────────────────────────────────────────────────

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
    const pageContatos = contatosFiltrados.slice(
      (allContactsPage - 1) * allContactsPerPage,
      allContactsPage * allContactsPerPage
    );

    return (
      <div className="flex flex-col h-full min-h-0">
        {/* Toolbar topo */}
        <div className="px-6 pt-4 pb-2 flex-shrink-0 space-y-2">
          {/* Linha 1: label + ações rápidas */}
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

          {/* Linha 2: seleção em massa + filtro origem */}
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
            </div>
          )}
        </div>

        {/* Lista de contatos — scroll flex-1 */}
        <div className="flex-1 min-h-0 overflow-hidden px-6">
          <ScrollArea className="h-full pr-1">
            <div className="space-y-0.5 pb-2">
              {contatos.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum contato carregado.
                </div>
              ) : (
                pageContatos.map((c, idx) => {
                  const globalIdx = (allContactsPage - 1) * allContactsPerPage + idx;
                  const isSelected = selectedContacts.has(c.numero);
                  const isNutrindo = numerosDisparados.has(c.numero.slice(-8));
                  const isSemWhatsApp = numerosSemWhatsApp.has(c.numero.slice(-8));
                  const extras = c.dados_extras ?? {};
                  const sociaisDoContato = SOCIAL_TIPOS_CAMP.filter(chave => extras[chave]?.trim());
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
                               <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500/20 text-amber-700 border-amber-500/30 shrink-0">
                                 nutrindo{numerosDisparados.get(c.numero.slice(-8)) ? ` · ${format(new Date(numerosDisparados.get(c.numero.slice(-8))!), "dd/MM/yy")}` : ""}
                               </Badge>
                             )}
                             {isSemWhatsApp && (
                               <Badge className="text-[9px] px-1 py-0 h-4 bg-orange-500/15 text-orange-600 border-orange-400/40 shrink-0">
                                 sem whatsapp{numerosSemWhatsApp.get(c.numero.slice(-8)) ? ` · ${format(new Date(numerosSemWhatsApp.get(c.numero.slice(-8))!), "dd/MM/yy")}` : ""}
                               </Badge>
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

        {/* Footer: paginação + ações */}
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
            <Button variant="outline" onClick={() => setEtapaCriacao(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" />Voltar
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading || selectedContatosForSubmit.length === 0}>
              {isLoading ? "Criando..." : `Criar Campanha (${selectedContatosForSubmit.length} contatos)`}
            </Button>
          </div>
        </div>
      </div>
    );
  };


  return (
    <>
      {/* Main Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-4xl p-0 gap-0 !grid-rows-none !flex flex-col overflow-hidden" style={{ height: "min(90vh, 800px)" }}>
          {/* Fixed Header */}
          <div className="p-4 sm:p-6 pb-3 flex-shrink-0 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <DialogTitle className="text-base sm:text-lg">Nova Campanha de Disparo</DialogTitle>
            </div>
            <DialogDescription className="sr-only">Configure uma campanha para enviar mensagens em massa</DialogDescription>
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
                      if (n < etapaCriacao || (n === 2 && selectedInstancias.length > 0) || (n === 3 && blocos.length > 0)) {
                        setEtapaCriacao(n);
                      }
                    }}
                  >
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all shrink-0 ${
                      etapaCriacao === n ? "bg-primary text-primary-foreground shadow" :
                      etapaCriacao > n ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    }`}>
                      {etapaCriacao > n ? "✓" : n}
                    </div>
                    <span className={`text-xs font-medium transition-colors hidden sm:block ${
                      etapaCriacao === n ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {label}
                    </span>
                  </button>
                  {idx < 2 && (
                    <div className={`h-px flex-1 mx-3 transition-colors ${etapaCriacao > n ? "bg-primary/40" : "bg-border"}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Step Content — fills remaining height */}
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            {etapaCriacao === 1 && renderEtapa1()}
            {etapaCriacao === 2 && renderEtapa2()}
            {etapaCriacao === 3 && renderEtapa3()}
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
                if (dateFilterType === "leads") importFromLeads(false);
                else if (dateFilterType === "clientes") importFromClientes(false);
                else if (dateFilterType === "kanban_whatsapp" && selectedKanbanColumnId) importFromKanbanColumn(selectedKanbanColumnId, false);
                else if (dateFilterType === "kanban_disparos" && selectedKanbanColumnId) importFromDisparosKanbanColumn(selectedKanbanColumnId, false);
                else if (dateFilterType === "kanban_whatsapp_leads") importFromKanbanWhatsAppLeads(false);
                else if (dateFilterType === "kanban_disparos_leads") importFromKanbanDisparosLeads(false);
              }} disabled={loadingDataSource}>
                Importar Todos
              </Button>
              <Button onClick={() => {
                if (dateFilterType === "leads") importFromLeads(true);
                else if (dateFilterType === "clientes") importFromClientes(true);
                else if (dateFilterType === "kanban_whatsapp" && selectedKanbanColumnId) importFromKanbanColumn(selectedKanbanColumnId, true);
                else if (dateFilterType === "kanban_disparos" && selectedKanbanColumnId) importFromDisparosKanbanColumn(selectedKanbanColumnId, true);
                else if (dateFilterType === "kanban_whatsapp_leads") importFromKanbanWhatsAppLeads(true);
                else if (dateFilterType === "kanban_disparos_leads") importFromKanbanDisparosLeads(true);
              }} disabled={loadingDataSource || (!dateFrom && !dateTo)}>
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
            <DialogDescription>Escolha a origem dos contatos para importar</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1 pr-4">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowImportDialog(false); openDateFilterForLeads(); }} disabled={loadingDataSource}>
                <Users className="h-4 w-4 mr-2" />Todos os Contatos (Leads)
              </Button>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowImportDialog(false); openDateFilterForClientes(); }} disabled={loadingDataSource}>
                <Users className="h-4 w-4 mr-2" />Apenas Clientes
              </Button>
              <div className="border-t my-2" />
              <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Kanban WhatsApp</p>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowImportDialog(false); openDateFilterForKanbanWhatsAppLeads(); }} disabled={loadingDataSource}>
                <div className="w-3 h-3 rounded-full mr-2 bg-muted-foreground/40" />Leads (não atribuídos)
              </Button>
              {kanbanColumns.map(col => (
                <Button key={col.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowImportDialog(false); openDateFilterForKanbanWhatsApp(col.id); }} disabled={loadingDataSource}>
                  <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: col.cor }} />{col.nome}
                </Button>
              ))}
              <div className="border-t my-2" />
              <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Kanban Disparos</p>
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowImportDialog(false); openDateFilterForKanbanDisparosLeads(); }} disabled={loadingDataSource}>
                <div className="w-3 h-3 rounded-full mr-2 bg-muted-foreground/40" />Leads (não atribuídos)
              </Button>
              {disparosKanbanColumns.map(col => (
                <Button key={col.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setShowImportDialog(false); openDateFilterForKanbanDisparos(col.id); }} disabled={loadingDataSource}>
                  <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: col.cor }} />{col.nome}
                </Button>
              ))}
              {listasExtrator.length > 0 && (
                <>
                  <div className="border-t my-2" />
                  <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Listas do Extrator</p>
                  {listasExtrator.map(lista => (
                    <Button key={lista.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => importFromListaExtrator(lista)} disabled={loadingDataSource}>
                      <Database className="h-3 w-3 mr-2 text-purple-600" />{lista.nome}
                      <Badge variant="secondary" className="ml-auto text-xs">{lista.total_contatos}</Badge>
                    </Button>
                  ))}
                </>
              )}
              {listasImportadas.length > 0 && (
                <>
                  <div className="border-t my-2" />
                  <p className="text-xs text-muted-foreground px-2 py-1 font-medium">Listas Importadas</p>
                  {listasImportadas.map(lista => (
                    <Button key={lista.id} variant="ghost" size="sm" className="w-full justify-start" onClick={() => importFromListaImportada(lista)} disabled={loadingDataSource}>
                      <Database className="h-3 w-3 mr-2 text-blue-600" />{lista.nome}
                      <Badge variant="secondary" className="ml-auto text-xs">{lista.total_contatos}</Badge>
                    </Button>
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* All Contacts Dialog */}
      <Dialog open={showAllContacts} onOpenChange={(open) => {
        setShowAllContacts(open);
        if (!open) { setAllContactsPage(1); setAllContactsFilterOrigens(new Set()); }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Lista de Contatos ({contatos.length})</DialogTitle>
            <DialogDescription>
              {selectedContacts.size} de {contatos.length} selecionados para envio
              {allContactsFilterOrigens.size > 0 && (
                <span className="ml-2 text-primary">
                  (mostrando {contatosFiltradosPorOrigem.length} de {allContactsFilterOrigens.size} lista{allContactsFilterOrigens.size > 1 ? "s" : ""})
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          {origensUnicas.length > 0 && (
            <div className="flex flex-col gap-2 pb-2">
              <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Filtrar por lista:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 min-w-48 justify-between">
                      <span className="truncate">{allContactsFilterOrigens.size === 0 ? "Todas as listas" : `${allContactsFilterOrigens.size} selecionada${allContactsFilterOrigens.size > 1 ? "s" : ""}`}</span>
                      <ChevronDown className="h-3 w-3 ml-2 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div className="p-2 border-b">
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setAllContactsFilterOrigens(new Set(origensUnicas))}>Todas</Button>
                        <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => setAllContactsFilterOrigens(new Set())}>Limpar</Button>
                      </div>
                    </div>
                    <ScrollArea className="max-h-48">
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
                {allContactsFilterOrigens.size > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setAllContactsFilterOrigens(new Set())} className="h-8 px-2"><X className="h-3 w-3" /></Button>
                )}
              </div>
              {allContactsFilterOrigens.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {Array.from(allContactsFilterOrigens).map(origem => (
                    <Badge key={origem} variant="secondary" className="text-xs gap-1">
                      {origem}
                      <X className="h-3 w-3 cursor-pointer hover:text-destructive" onClick={() => toggleOrigemFilter(origem)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2 pb-2 border-b">
            <div className="flex items-center gap-1">
              <Button variant="default" size="sm" className="text-xs px-2 h-7" onClick={() => setSelectedContacts(new Set(contatos.map(c => c.numero)))}>
                <CheckSquare className="h-3 w-3 mr-1" />Marcar Todos
              </Button>
              <Button variant="outline" size="sm" className="text-xs px-2 h-7" onClick={() => setSelectedContacts(new Set())}>
                <Square className="h-3 w-3 mr-1" />Desmarcar Todos
              </Button>
              <div className="w-px h-5 bg-border mx-1" />
              <Button variant="outline" size="sm" className="text-xs px-2 h-7" onClick={() => {
                const pageContacts = contatosFiltradosPorOrigem.slice((allContactsPage - 1) * allContactsPerPage, allContactsPage * allContactsPerPage);
                setSelectedContacts(prev => { const next = new Set(prev); pageContacts.forEach(c => next.add(c.numero)); return next; });
              }}>
                <CheckSquare className="h-3 w-3 mr-1" />Marcar Página
              </Button>
              <Button variant="outline" size="sm" className="text-xs px-2 h-7" onClick={() => {
                const pageContacts = contatosFiltradosPorOrigem.slice((allContactsPage - 1) * allContactsPerPage, allContactsPage * allContactsPerPage);
                setSelectedContacts(prev => { const next = new Set(prev); pageContacts.forEach(c => next.delete(c.numero)); return next; });
              }}>
                <Square className="h-3 w-3 mr-1" />Desmarcar Página
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-1">
                {contatosFiltradosPorOrigem
                  .slice((allContactsPage - 1) * allContactsPerPage, allContactsPage * allContactsPerPage)
                  .map((c, idx) => {
                    const globalIdx = (allContactsPage - 1) * allContactsPerPage + idx;
                    const isSelected = selectedContacts.has(c.numero);
                    const extras = c.dados_extras ?? {};
                    const sociaisDoContato = SOCIAL_TIPOS_CAMP.filter(
                      (chave) => extras[chave] && extras[chave].trim()
                    );
                    return (
                      <div
                        key={`${globalIdx}-${c.numero}`}
                        className={`flex items-center justify-between p-2 hover:bg-muted rounded text-sm border-b last:border-b-0 cursor-pointer ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => toggleContactSelection(c.numero)}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleContactSelection(c.numero)} onClick={e => e.stopPropagation()} />
                          <span className="text-xs text-muted-foreground w-8">{globalIdx + 1}.</span>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5 truncate">
                              <div className="flex flex-col min-w-0">
                                {c.nome && <span className="truncate text-sm font-medium leading-tight">{c.nome}</span>}
                                <span className="truncate text-xs text-muted-foreground leading-tight">{formatPhoneDisplay(c.numero)}</span>
                              </div>
                              {numerosDisparados.has(c.numero.slice(-8)) && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500/20 text-amber-700 border-amber-500/30 shrink-0">
                                  nutrindo{numerosDisparados.get(c.numero.slice(-8)) ? ` · ${format(new Date(numerosDisparados.get(c.numero.slice(-8))!), "dd/MM/yy")}` : ""}
                                </Badge>
                              )}
                              {numerosSemWhatsApp.has(c.numero.slice(-8)) && (
                                <Badge className="text-[9px] px-1 py-0 h-4 bg-orange-500/15 text-orange-600 border-orange-400/40 shrink-0">
                                  sem whatsapp{numerosSemWhatsApp.get(c.numero.slice(-8)) ? ` · ${format(new Date(numerosSemWhatsApp.get(c.numero.slice(-8))!), "dd/MM/yy")}` : ""}
                                </Badge>
                              )}
                            </div>
                            {c.origem && <span className="text-[10px] text-muted-foreground truncate">{c.origem}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                          {sociaisDoContato.map((chave) => {
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
                  })}
              </div>
            </ScrollArea>
          </div>
          {contatosFiltradosPorOrigem.length > allContactsPerPage && (() => {
            const totalPages = Math.ceil(contatosFiltradosPorOrigem.length / allContactsPerPage);
            return (
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Por página:</span>
                  <Select value={String(allContactsPerPage)} onValueChange={v => { setAllContactsPerPage(Number(v)); setAllContactsPage(1); }}>
                    <SelectTrigger className="h-7 w-16 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={allContactsPage === 1} onClick={() => setAllContactsPage(p => p - 1)}>
                    <ChevronLeft className="h-3 w-3" />
                  </Button>
                  <span className="text-xs px-2">{allContactsPage} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" disabled={allContactsPage === totalPages} onClick={() => setAllContactsPage(p => p + 1)}>
                    <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })()}
          <div className="flex justify-between items-center pt-4 border-t">
            <Button variant="destructive" size="sm" onClick={() => { clearAll(); setShowAllContacts(false); }}>
              <Trash2 className="h-4 w-4 mr-1" />Limpar todos
            </Button>
            <Button onClick={() => setShowAllContacts(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Popup de detalhes do contato */}
      {contatoDetalhesAberto && (
        <ContatoDetalhesPopup
          contato={{
            id: contatoDetalhesAberto.numero,
            nome: contatoDetalhesAberto.nome ?? null,
            telefone: contatoDetalhesAberto.numero,
            email: null,
            cidade: null,
            dados_extras: contatoDetalhesAberto.dados_extras ?? null,
          }}
          camposMapeados={contatoDetalhesAberto.camposMapeados ?? {}}
          open={!!contatoDetalhesAberto}
          onOpenChange={(o) => !o && setContatoDetalhesAberto(null)}
        />
      )}
    </>
  );
}
