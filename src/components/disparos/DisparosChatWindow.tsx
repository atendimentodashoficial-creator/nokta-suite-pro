import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { RefreshCw, Send, Calendar, Trash2, MessageSquare, Image, Mic, Forward, X, ArrowLeft, Pencil, Check, ChevronDown, Repeat, Wifi, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageBubble } from "@/components/whatsapp/MessageBubble";
import { DateSeparator, isDifferentDay } from "@/components/whatsapp/DateSeparator";
import { getInitials, normalizePhoneNumber, formatPhoneNumber, getLast8Digits } from "@/utils/whatsapp";
import { syncContactNameEverywhere, CONTACT_NAME_QUERY_KEYS } from "@/utils/syncContactName";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { useMensagensPredefinidas } from "@/hooks/useMensagensPredefinidas";
import { useBlocosMensagens } from "@/hooks/useBlocosMensagens";
import { useAudiosPredefinidos } from "@/hooks/useAudiosPredefinidos";
import { useBlocosAudios } from "@/hooks/useBlocosAudios";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContatoDetalhesPopup } from "./ContatoDetalhesPopup";

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const normalizeMessageContentForDedup = (content: string | null | undefined) =>
  (content || "")
    .replace(/\s+/g, " ")
    .trim();

// Extract base message ID (remove prefix like "553498024865:")
const extractBaseMessageId = (messageId: string | null | undefined): string => {
  if (!messageId) return "";
  // UAZapi sometimes prefixes message IDs with the phone number
  const parts = messageId.split(":");
  return parts.length > 1 ? parts[parts.length - 1] : messageId;
};

// Check if content is a media placeholder
const isMediaPlaceholder = (content: string | null | undefined): boolean => {
  if (!content) return false;
  const trimmed = content.trim().toLowerCase();
  return (
    /^\[(audio|image|video|document|imagem|áudio|vídeo|documento)\]$/i.test(trimmed) ||
    /^(🎵\s*áudio|📷\s*imagem|🎥\s*vídeo|📄\s*documento|🏷️\s*figurinha|📍\s*localização|👤\s*contato)$/i.test(trimmed)
  );
};

const dedupeChatMessages = (list: any[]) => {
  const sorted = [...(list || [])].sort((a, b) => {
    const ta = new Date(a.timestamp || a.created_at || 0).getTime();
    const tb = new Date(b.timestamp || b.created_at || 0).getTime();
    return ta - tb;
  });

  const isCampId = (id?: string) => typeof id === "string" && id.startsWith("camp_");

  const withinSeconds = (a: any, b: any, seconds: number) => {
    const ta = new Date(a.timestamp || a.created_at || 0).getTime();
    const tb = new Date(b.timestamp || b.created_at || 0).getTime();
    return Math.abs(tb - ta) <= seconds * 1000;
  };

  // Track seen base message IDs to detect duplicates with different prefixes
  const seenBaseIds = new Map<string, number>(); // baseId -> index in out array

  const out: any[] = [];
  for (const msg of sorted) {
    const baseId = extractBaseMessageId(msg.message_id);
    const prev = out[out.length - 1];

    // Check for exact duplicate by base message ID
    if (baseId && seenBaseIds.has(baseId)) {
      const existingIdx = seenBaseIds.get(baseId)!;
      const existing = out[existingIdx];
      
      // Prefer the one with richer content (not a placeholder)
      const existingIsPlaceholder = isMediaPlaceholder(existing.content);
      const currentIsPlaceholder = isMediaPlaceholder(msg.content);
      
      if (existingIsPlaceholder && !currentIsPlaceholder) {
        out[existingIdx] = msg;
      }
      continue;
    }

    // Check for content-based duplicates (existing logic)
    if (
      prev &&
      prev.sender_type === msg.sender_type &&
      (prev.media_type || "text") === (msg.media_type || "text") &&
      normalizeMessageContentForDedup(prev.content) === normalizeMessageContentForDedup(msg.content) &&
      withinSeconds(prev, msg, 120)
    ) {
      // Prefer the provider message over the local campaign placeholder when both exist.
      const prevIsCamp = isCampId(prev.message_id);
      const currIsCamp = isCampId(msg.message_id);

      if (prevIsCamp && !currIsCamp) {
        out[out.length - 1] = msg;
        if (baseId) seenBaseIds.set(baseId, out.length - 1);
      }
      continue;
    }

    // Also check for media messages with different placeholder texts but same base ID pattern
    if (
      prev &&
      prev.sender_type === msg.sender_type &&
      prev.media_type && msg.media_type &&
      prev.media_type === msg.media_type &&
      isMediaPlaceholder(prev.content) &&
      isMediaPlaceholder(msg.content) &&
      withinSeconds(prev, msg, 10)
    ) {
      // Both are media placeholders of the same type within 10 seconds - likely duplicates
      continue;
    }

    out.push(msg);
    if (baseId) seenBaseIds.set(baseId, out.length - 1);
  }

  return out;
};
interface Chat {
  id: string;
  chat_id: string;
  contact_name: string;
  contact_number: string;
  normalized_number?: string;
  user_id?: string;
  instancia_id?: string | null;
  instancia_nome?: string | null;
  instancia_original_id?: string | null;
  instancia_original_nome?: string | null;
  // Optional fields used to keep the chat list preview in sync
  last_message?: string | null;
  last_message_time?: string | null;
  updated_at?: string | null;
  unread_count?: number | null;
  // Timestamp to filter out messages from before chat was "cleared" (e.g., after deletion + recreation)
  history_cleared_at?: string | null;
}

interface DisparosChatWindowProps {
  chat: Chat;
  onBack?: () => void;
  onChatDeleted?: () => void;
  onChatUpdated?: (updatedChat: any) => void;
  availableChats?: any[];
  initialMessage?: string | null;
}

interface ClienteData {
  id?: string;
  nome: string;
  telefone?: string;
  email?: string;
}

// Cache de mensagens por chat (persiste entre seleções de chat)
const disparosMessagesCache = new Map<string, { messages: any[]; timestamp: number }>();
const DISPAROS_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export function DisparosChatWindow({ chat, onBack, onChatDeleted, onChatUpdated, availableChats = [], initialMessage }: DisparosChatWindowProps) {
  const queryClient = useQueryClient();
  
  // Inicializar com mensagens do cache se disponível (evita flash de loading)
  const getCachedMessages = () => {
    const cached = disparosMessagesCache.get(chat.id);
    if (cached && Date.now() - cached.timestamp < DISPAROS_CACHE_TTL) {
      return cached.messages;
    }
    return [];
  };
  
  const [messages, setMessages] = useState<any[]>(getCachedMessages);
  const [newMessage, setNewMessage] = useState(initialMessage || "");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const MESSAGES_PAGE_SIZE = 50;
  const [agendamentoDialogOpen, setAgendamentoDialogOpen] = useState(false);
  const [clienteData, setClienteData] = useState<ClienteData | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mensagensPredefindasOpen, setMensagensPredefindasOpen] = useState(false);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "ptt">("image");
  const [mediaCaption, setMediaCaption] = useState("");
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [uploadMode, setUploadMode] = useState<"url" | "file" | "record">("url");
  const [forwardDialogOpen, setForwardDialogOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<any | null>(null);
  const [forwardTarget, setForwardTarget] = useState<string>("");
  const [forwardMode, setForwardMode] = useState<"existing" | "new">("existing");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(chat.contact_name);
  const [isSavingName, setIsSavingName] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false);
  const { mensagens: mensagensPredefinidas } = useMensagensPredefinidas();
  const { blocos } = useBlocosMensagens();
  const { audios: audiosPredefinidos } = useAudiosPredefinidos();
  const { blocosAudios } = useBlocosAudios();
  const [sendingAudioId, setSendingAudioId] = useState<string | null>(null);
  const [expandedTextBlocos, setExpandedTextBlocos] = useState<Record<string, boolean>>({});
  const [expandedAudioBlocos, setExpandedAudioBlocos] = useState<Record<string, boolean>>({});
  const [expandedTextSemBloco, setExpandedTextSemBloco] = useState(false);
  const [expandedAudioSemBloco, setExpandedAudioSemBloco] = useState(false);
  const [instanciasDisponiveis, setInstanciasDisponiveis] = useState<{ id: string; nome: string; base_url: string; api_key: string }[]>([]);
  const [instanciasStatus, setInstanciasStatus] = useState<Record<string, 'loading' | 'connected' | 'disconnected'>>({});
  const [changeInstanceOpen, setChangeInstanceOpen] = useState(false);
  const [changingInstance, setChangingInstance] = useState(false);
  const [contatoDetalhesOpen, setContatoDetalhesOpen] = useState(false);
  const [contatoMapeado, setContatoMapeado] = useState<{ contato: any; camposMapeados: Record<string, string> } | null>(null);

  // Atualizar cache sempre que mensagens mudarem
  useEffect(() => {
    if (messages.length > 0) {
      disparosMessagesCache.set(chat.id, { messages, timestamp: Date.now() });
    }
  }, [messages, chat.id]);
  
  // Quando o chat muda, carregar do cache ou iniciar vazio
  useEffect(() => {
    const cached = disparosMessagesCache.get(chat.id);
    if (cached && Date.now() - cached.timestamp < DISPAROS_CACHE_TTL) {
      setMessages(cached.messages);
      setShouldScrollToBottom(true);
    } else {
      setMessages([]);
    }
  }, [chat.id]);

  // Load available instances for switching
  useEffect(() => {
    const loadInstancias = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from("disparos_instancias")
        .select("id, nome, base_url, api_key")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("nome");
      setInstanciasDisponiveis(data || []);
    };
    loadInstancias();
  }, []);

  // Check connection status when dropdown opens
  useEffect(() => {
    if (!changeInstanceOpen || instanciasDisponiveis.length === 0) return;
    
    const checkAllStatuses = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Set all to loading initially
      const loadingStatus: Record<string, 'loading'> = {};
      instanciasDisponiveis.forEach(i => { loadingStatus[i.id] = 'loading'; });
      setInstanciasStatus(loadingStatus);

      // Check each instance in parallel
      await Promise.all(instanciasDisponiveis.map(async (inst) => {
        try {
          const response = await supabase.functions.invoke("uazapi-check-status", {
            headers: { Authorization: `Bearer ${session.access_token}` },
            body: { base_url: inst.base_url, api_key: inst.api_key }
          });
          const isConnected = response.data?.status === 'connected';
          setInstanciasStatus(prev => ({ ...prev, [inst.id]: isConnected ? 'connected' : 'disconnected' }));
        } catch {
          setInstanciasStatus(prev => ({ ...prev, [inst.id]: 'disconnected' }));
        }
      }));
    };

    checkAllStatuses();
  }, [changeInstanceOpen, instanciasDisponiveis]);

  // Handle changing the instance for this chat
  const handleChangeInstance = async (newInstanceId: string) => {
    if (newInstanceId === chat.instancia_id) {
      setChangeInstanceOpen(false);
      return;
    }
    
    setChangingInstance(true);
    try {
      const newInstance = instanciasDisponiveis.find(i => i.id === newInstanceId);
      if (!newInstance) throw new Error("Instância não encontrada");

      // Get the normalized number from chat or derive from contact_number
      const normalizedNum = chat.normalized_number || chat.contact_number.replace(/\D/g, '');

      // Check if there's already a chat with the same number on the target instance
      const { data: existingChat } = await supabase
        .from("disparos_chats")
        .select("id")
        .eq("normalized_number", normalizedNum)
        .eq("instancia_id", newInstanceId)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingChat) {
        // Soft-delete the existing chat on target instance to allow migration
        await supabase
          .from("disparos_chats")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", existingChat.id);
      }

      // Store original instance info if not already set (first migration)
      const originalId = chat.instancia_original_id || chat.instancia_id;
      const originalNome = chat.instancia_original_nome || chat.instancia_nome;

      const { error } = await supabase
        .from("disparos_chats")
        .update({ 
          instancia_id: newInstanceId,
          instancia_nome: newInstance.nome,
          instancia_original_id: originalId,
          instancia_original_nome: originalNome
        })
        .eq("id", chat.id);

      if (error) throw error;

      // Update local chat state
      onChatUpdated?.({
        ...chat,
        instancia_id: newInstanceId,
        instancia_nome: newInstance.nome,
        instancia_original_id: originalId,
        instancia_original_nome: originalNome,
      });

      toast.success(`Instância alterada para ${newInstance.nome}`);
      setChangeInstanceOpen(false);
    } catch (error: any) {
      console.error("Error changing instance:", error);
      toast.error("Erro ao trocar instância");
    } finally {
      setChangingInstance(false);
    }
  };

  const updateChatPreview = (preview: string) => {
    const nowIso = new Date().toISOString();
    onChatUpdated?.({
      ...chat,
      last_message: preview,
      last_message_time: nowIso,
      updated_at: nowIso,
    });
  };

  const forceScrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  useLayoutEffect(() => {
    if (shouldScrollToBottom && messages.length > 0) {
      forceScrollToBottom();
      setShouldScrollToBottom(false);
    }
  }, [shouldScrollToBottom, messages]);

  // Set initial message when prop changes (for prefill from deep-links)
  useEffect(() => {
    if (initialMessage) {
      setNewMessage(initialMessage);
    }
  }, [initialMessage]);

  // Load messages from local database with pagination (newest first, then reverse for display)
  const loadMessages = async (forceScrollOnLoad = false, loadMore = false) => {
    const previousLength = messages.length;
    const hasCachedMessages = previousLength > 0;
    
    if (!loadMore) {
      // Só mostra loading se não temos mensagens no cache
      if (!hasCachedMessages) {
        setIsLoadingMessages(true);
      }
      setMessagesOffset(0);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const currentOffset = loadMore ? messagesOffset : 0;
      
      // Build data query - filter by history_cleared_at if set
      let query = supabase
        .from('disparos_messages')
        .select('*', { count: 'exact' })
        .eq('chat_id', chat.id);

      if (chat.history_cleared_at) {
        query = query.gte('timestamp', chat.history_cleared_at);
      }

      // Fetch page of messages (newest first for pagination) - single query with count
      const { data: dbMessages, error, count: totalCount } = await query
        .order('timestamp', { ascending: false })
        .range(currentOffset, currentOffset + MESSAGES_PAGE_SIZE - 1);

      if (error) throw error;

      // Reverse to show oldest first in chat
      const reversedMessages = [...(dbMessages || [])].reverse();

      const formattedMessages = reversedMessages.map(msg => ({
        id: msg.id,
        message_id: msg.message_id,
        content: msg.content,
        sender_type: msg.sender_type,
        media_type: msg.media_type,
        media_url: msg.media_url,
        status: msg.status,
        deleted: msg.deleted,
        timestamp: msg.timestamp,
        // Campaign attribution fields
        utm_source: msg.utm_source,
        utm_campaign: msg.utm_campaign,
        utm_medium: msg.utm_medium,
        utm_content: msg.utm_content,
        utm_term: msg.utm_term,
        fbclid: msg.fbclid,
        ad_thumbnail_url: msg.ad_thumbnail_url,
      }));

      // Calculate if there are more messages
      const newOffset = currentOffset + (dbMessages?.length || 0);
      const hasMore = (totalCount || 0) > newOffset;
      setHasMoreMessages(hasMore);
      setMessagesOffset(newOffset);

      if (loadMore) {
        // Prepend older messages
        const combined = [...formattedMessages, ...messages];
        const dedupedFormatted = dedupeChatMessages(combined);
        setMessages(dedupedFormatted);
        setIsLoadingMore(false);
      } else {
        // Initial load or refresh
        const dedupedFormatted = dedupeChatMessages(formattedMessages);
        setMessages(dedupedFormatted);

        const shouldScroll = forceScrollOnLoad || previousLength === 0 || dedupedFormatted.length > previousLength;
        if (shouldScroll) {
          setShouldScrollToBottom(true);
        }
      }
    } catch (error: any) {
      // Silent handling for network errors - don't show toast for "Failed to fetch"
      const isNetworkError = error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError');
      if (isNetworkError) {
        console.warn('Network error loading messages (silent):', error.message);
      } else {
        console.error('Error loading messages:', error);
        toast.error(error.message || 'Erro ao carregar mensagens');
      }
    } finally {
      setIsLoadingMessages(false);
      setIsLoadingMore(false);
    }
  };

  // Load more messages (older ones)
  const loadMoreMessages = () => {
    if (!isLoadingMore && hasMoreMessages) {
      loadMessages(false, true);
    }
  };

  // Background sync with UAZapi (silent, catches missed webhook messages)
  const syncMessagesFromApiSilent = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase.functions.invoke('disparos-get-messages', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { chat_id: chat.chat_id, db_chat_id: chat.id }
      });

      // Only reload from DB if sync actually found new messages
      if (data?.count > 0) {
        await loadMessages(false);
      }
    } catch (syncError) {
      // Silent fail - don't show error to user for background sync
      console.error('Background sync error:', syncError);
    }
  };

  // Manual sync with UAZapi (user-triggered with feedback)
  const syncMessagesFromApi = async () => {
    setIsLoadingMessages(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      await supabase.functions.invoke('disparos-get-messages', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { chat_id: chat.chat_id, db_chat_id: chat.id }
      });

      // Reload from DB after sync
      await loadMessages(false);
      toast.success('Mensagens sincronizadas');
    } catch (syncError) {
      console.error('Error syncing messages:', syncError);
      toast.error('Erro ao sincronizar mensagens');
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Buscar status do lead baseado no telefone
  const loadLeadStatus = async () => {
    try {
      const last8Digits = getLast8Digits(chat.contact_number);
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, status, telefone')
        .is('deleted_at', null);

      const lead = allLeads?.find(l => getLast8Digits(l.telefone) === last8Digits);

      if (lead) {
        setLeadId(lead.id);
        const { data: agendamentos } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('cliente_id', lead.id)
          .limit(1);

        if (agendamentos && agendamentos.length > 0) {
          setLeadStatus('cliente');
        } else {
          setLeadStatus(lead.status);
        }
      } else {
        setLeadId(null);
        setLeadStatus(null);
      }
    } catch (error: any) {
      console.error('Error loading lead status:', error);
    }
  };

  // Buscar dados mapeados do contato nas listas importadas
  const loadContatoMapeado = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const phoneDigits = chat.contact_number.replace(/\D/g, "");
      const last8 = phoneDigits.slice(-8);

      // Buscar contato nas listas importadas pelos últimos 8 dígitos
      const { data: contatos } = await supabase
        .from("lista_importada_contatos")
        .select("id, nome, telefone, email, cidade, dados_extras, lista_id")
        .eq("user_id", user.id)
        .ilike("telefone", `%${last8}`)
        .limit(1);

      if (!contatos || contatos.length === 0) return;

      const contato = contatos[0];

      // Buscar mapeamento da lista
      const { data: lista } = await supabase
        .from("listas_importadas")
        .select("colunas_mapeamento")
        .eq("id", contato.lista_id)
        .single();

      const mapeamento: Array<{ colunaCsv: string; campoSistema: string }> =
        (lista?.colunas_mapeamento as any) ?? [];

      const camposMapeados: Record<string, string> = {};
      mapeamento.forEach((m: any) => {
        if (m.campoSistema && m.campoSistema !== "ignorar") {
          camposMapeados[m.campoSistema] = m.colunaCsv;
        }
      });

      setContatoMapeado({ contato, camposMapeados });
    } catch (error) {
      console.error("Erro ao buscar contato mapeado:", error);
    }
  };

  useEffect(() => {
    setEditedName(chat.contact_name);
    setIsEditingName(false);
  }, [chat.id, chat.contact_name]);

  // Salvar nome do contato (sincroniza em todas as tabelas)
  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === chat.contact_name) {
      setIsEditingName(false);
      setEditedName(chat.contact_name);
      return;
    }

    setIsSavingName(true);
    try {
      // Usar função centralizada para sincronizar nome em todas as tabelas
      await syncContactNameEverywhere(chat.contact_number, editedName.trim());

      // Invalidar todas as queries relacionadas
      CONTACT_NAME_QUERY_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      if (onChatUpdated) {
        onChatUpdated({ ...chat, contact_name: editedName.trim() });
      }

      toast.success("Nome atualizado com sucesso!");
      setIsEditingName(false);
    } catch (error: any) {
      console.error("Error saving name:", error);
      toast.error("Erro ao salvar nome");
      setEditedName(chat.contact_name);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info("Gravando áudio...");
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Erro ao acessar microfone');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      toast.success("Gravação finalizada!");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setMediaUrl(base64);
      toast.success("Arquivo carregado!");
    };
    reader.readAsDataURL(file);
  };

  const uploadAudioToServer = async (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleSendPredefinedAudio = async (audioUrl: string, audioId: string) => {
    setSendingAudioId(audioId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('disparos-send-message', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          chat_id: chat.chat_id,
          db_chat_id: chat.id,
          message: audioUrl,
          type: 'ptt'
        }
      });

      if (response.error) throw response.error;

      toast.success("Áudio enviado!");
      updateChatPreview("[audio]");
      setMensagensPredefindasOpen(false);
      await loadMessages();
    } catch (error: any) {
      console.error('Error sending predefined audio:', error);
      toast.error(error.message || 'Erro ao enviar áudio');
    } finally {
      setSendingAudioId(null);
    }
  };

  const handleSendMedia = async () => {
    if (isSendingMedia) return;

    let fileUrl = mediaUrl;

    if (uploadMode === "record" && audioBlob) {
      try {
        fileUrl = await uploadAudioToServer(audioBlob);
      } catch (error) {
        toast.error("Erro ao processar áudio");
        return;
      }
    }

    if (!fileUrl.trim()) {
      toast.error("Selecione um arquivo ou URL");
      return;
    }

    setIsSendingMedia(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('disparos-send-message', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          chat_id: chat.chat_id,
          db_chat_id: chat.id,
          message: fileUrl,
          type: mediaType,
          caption: mediaCaption || undefined
        }
      });

      if (response.error) throw response.error;

      toast.success("Mídia enviada!");
      const preview = (mediaCaption || "").trim() || `[${mediaType === 'ptt' ? 'audio' : mediaType}]`;
      updateChatPreview(preview);
      setMediaUrl("");
      setMediaCaption("");
      setAudioBlob(null);
      setAudioUrl("");
      setMediaDialogOpen(false);
      await loadMessages();
    } catch (error: any) {
      console.error('Error sending media:', error);
      toast.error(error.message || 'Erro ao enviar mídia');
    } finally {
      setIsSendingMedia(false);
    }
  };

  const handleForwardMessage = (message: any) => {
    setForwardMessage(message);
    setForwardDialogOpen(true);
  };

  const handleSendForward = async () => {
    if (!forwardMessage || !forwardTarget.trim()) {
      toast.error("Selecione um destinatário");
      return;
    }

    try {
      setIsSending(true);

      let targetNumber = '';
      if (forwardMode === "existing") {
        const selectedChat = availableChats?.find(c => c.id === forwardTarget);
        if (selectedChat) {
          targetNumber = selectedChat.contact_number;
        }
      } else {
        targetNumber = normalizePhoneNumber(forwardTarget);
      }

      if (!targetNumber) {
        toast.error('Número inválido');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('disparos-send-message', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          chat_id: `${targetNumber}@s.whatsapp.net`,
          message: forwardMessage.content,
          type: forwardMessage.media_type || 'text'
        }
      });

      if (response.error) throw response.error;

      toast.success("Mensagem encaminhada!");
      setForwardDialogOpen(false);
      setForwardTarget("");
      setForwardMessage(null);
    } catch (error: any) {
      console.error('Error forwarding message:', error);
      toast.error(error.message || 'Erro ao encaminhar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    loadMessages(true);
    loadLeadStatus();
    loadContatoMapeado();
    
    // Background sync to catch any messages missed by webhook
    syncMessagesFromApiSilent();
  }, [chat.id]);

  // Realtime subscription for new and updated messages
  useEffect(() => {
    if (!isUuid(chat.id)) return;

    const channel = supabase
      .channel(`disparos-messages-${chat.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'disparos_messages',
          filter: `chat_id=eq.${chat.id}`
        },
        (payload) => {
          const newMsg = {
            id: payload.new.id,
            message_id: payload.new.message_id,
            content: payload.new.content,
            sender_type: payload.new.sender_type,
            media_type: payload.new.media_type,
            media_url: payload.new.media_url,
            status: payload.new.status,
            deleted: payload.new.deleted,
            timestamp: payload.new.timestamp,
            // Campaign attribution fields
            utm_source: payload.new.utm_source,
            utm_campaign: payload.new.utm_campaign,
            utm_medium: payload.new.utm_medium,
            utm_content: payload.new.utm_content,
            utm_term: payload.new.utm_term,
            fbclid: payload.new.fbclid,
            ad_thumbnail_url: payload.new.ad_thumbnail_url,
          };
          setMessages(prev => dedupeChatMessages([...prev, newMsg]));
          setShouldScrollToBottom(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'disparos_messages',
          filter: `chat_id=eq.${chat.id}`
        },
        (payload) => {
          setMessages(prevMessages =>
            prevMessages.map(msg =>
              msg.message_id === payload.new.message_id
                ? { 
                    ...msg, 
                    deleted: payload.new.deleted, 
                    content: payload.new.content, 
                    status: payload.new.status,
                    // Update attribution fields too
                    utm_source: payload.new.utm_source,
                    utm_campaign: payload.new.utm_campaign,
                    utm_medium: payload.new.utm_medium,
                    utm_content: payload.new.utm_content,
                    utm_term: payload.new.utm_term,
                    fbclid: payload.new.fbclid,
                    ad_thumbnail_url: payload.new.ad_thumbnail_url,
                  }
                : msg
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat.id]);

  const handleSendMessage = async () => {
    const messageToSend = newMessage.trim();
    if (!messageToSend || isSending) return;

    setIsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        setIsSending(false);
        return;
      }

      const response = await supabase.functions.invoke('disparos-send-message', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          chat_id: chat.chat_id,
          db_chat_id: chat.id,
          message: messageToSend,
        },
      });

      if (response.error) throw response.error;

      setNewMessage("");
      updateChatPreview(messageToSend);
      toast.success("Mensagem enviada!");
      await loadMessages();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'Erro ao enviar mensagem');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleDeleteChat = async () => {
    try {
      // Call edge function to delete from UAZapi, delete messages, and soft-delete chat
      const { error } = await supabase.functions.invoke("disparos-delete-chat", {
        body: { chat_ids: [chat.id] },
      });

      if (error) throw error;

      toast.success('Conversa excluída com sucesso!');
      if (onChatDeleted) {
        onChatDeleted();
      }
    } catch (error: any) {
      console.error('Erro ao excluir conversa:', error);
      toast.error('Erro ao excluir conversa');
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('disparos-delete-message', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { id: messageId, db_chat_id: chat.id }
      });

      if (response.error) throw response.error;

      // Atualizar localmente a mensagem como deletada
      setMessages(messages.map(msg => 
        msg.message_id === messageId 
          ? { ...msg, deleted: true, content: 'Mensagem apagada' }
          : msg
      ));
      
      toast.success("Mensagem deletada!");
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast.error(error.message || 'Erro ao deletar mensagem');
    }
  };

  const formatPhoneForDisplay = (phoneNumber: string): string => {
    const all = phoneNumber.replace(/\D/g, '');
    
    // Se tem 13 dígitos: 55 + DDD(2) + número(9)
    if (all.length === 13 && all.startsWith('55')) {
      const ddd = all.slice(2, 4);
      const numero = all.slice(4);
      return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
    }
    
    // Se tem 12 dígitos: 55 + DDD(2) + número(8) - adiciona o 9 para celular
    if (all.length === 12 && all.startsWith('55')) {
      const ddd = all.slice(2, 4);
      const numero = all.slice(4);
      return `+55 (${ddd}) 9${numero.slice(0, 4)}-${numero.slice(4)}`;
    }
    
    // Se tem 11 dígitos: DDD(2) + número(9) - celular
    if (all.length === 11) {
      const ddd = all.slice(0, 2);
      const numero = all.slice(2);
      return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
    }
    
    // Se tem 10 dígitos: DDD(2) + número(8) - adiciona o 9 para celular
    if (all.length === 10) {
      const ddd = all.slice(0, 2);
      const numero = all.slice(2);
      return `+55 (${ddd}) 9${numero.slice(0, 4)}-${numero.slice(4)}`;
    }

    // Fallback: tenta formatar o que tiver
    if (all.length >= 8) {
      const last8 = all.slice(-8);
      const ddd = all.length >= 10 ? all.slice(-10, -8) : '00';
      return `+55 (${ddd}) 9${last8.slice(0, 4)}-${last8.slice(4)}`;
    }
    
    return phoneNumber;
  };

  const handleCreateAgendamento = async () => {
    try {
      // Mesma regra do WhatsApp: não cria lead ao clicar em "agendar".
      // O lead (se necessário) será criado/restaurado ao salvar no NovoAgendamentoDialog.

      const all = chat.contact_number.replace(/\D/g, "");
      if (all.length < 10) throw new Error("Número inválido");

      const formattedPhone = formatPhoneNumber(all);
      const last8Digits = getLast8Digits(all);
      
      // Buscar nome do cliente existente se houver
      // Função para verificar se uma string parece ser um número de telefone
      const pareceNumeroTelefone = (str: string) => {
        const apenasDigitos = str.replace(/\D/g, "");
        // Se tem mais de 8 dígitos e o texto limpo é só números, é telefone
        return apenasDigitos.length >= 8 && /^[\d\s\-\+\(\)]+$/.test(str);
      };
      
      // Se o contact_name parece ser um número de telefone, usar string vazia
      let nomeParaUsar = pareceNumeroTelefone(chat.contact_name) ? "" : chat.contact_name;
      
      if (last8Digits && last8Digits.length >= 8) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const { data: allClientes } = await supabase
              .from("leads")
              .select("nome, telefone")
              .eq("user_id", user.id)
              .eq("status", "cliente")
              .is("deleted_at", null);

            const clienteExistente = allClientes?.find(cliente => 
              getLast8Digits(cliente.telefone) === last8Digits
            );

            if (clienteExistente && !pareceNumeroTelefone(clienteExistente.nome)) {
              nomeParaUsar = clienteExistente.nome;
            }
          }
        } catch (error) {
          // Fallback para nome do chat
        }
      }

      setClienteData({
        nome: nomeParaUsar,
        telefone: formattedPhone,
      });
      setAgendamentoDialogOpen(true);
    } catch (error: any) {
      console.error("Erro ao preparar agendamento:", error);
      toast.error(error.message || "Erro ao abrir agendamento");
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header - Fixo no topo */}
      <div className="h-[60px] border-b bg-card px-3 flex-shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Botão voltar no mobile */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 md:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <Avatar className="flex-shrink-0">
            <AvatarFallback className={
              leadStatus === "follow_up" ? "bg-yellow-300" :
              leadStatus === "sem_interesse" ? "bg-red-400" :
              leadStatus === "cliente" ? "bg-green-400" :
              "bg-muted"
            }>
              {getInitials(chat.contact_name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            {isEditingName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-7 text-sm font-semibold"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") {
                      setIsEditingName(false);
                      setEditedName(chat.contact_name);
                    }
                  }}
                  disabled={isSavingName}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={handleSaveName}
                  disabled={isSavingName}
                >
                  <Check className="w-4 h-4 text-green-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={() => {
                    setIsEditingName(false);
                    setEditedName(chat.contact_name);
                  }}
                  disabled={isSavingName}
                >
                  <X className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-1 group">
                <h3 className="font-semibold truncate">{chat.contact_name}</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setIsEditingName(true)}
                  title="Editar nome"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
              {formatPhoneForDisplay(chat.contact_number)}
              {chat.instancia_nome && (
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  chat.instancia_original_id && chat.instancia_original_id !== chat.instancia_id
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  <Wifi className="h-2.5 w-2.5" />
                  {chat.instancia_nome}
                  {chat.instancia_original_id && chat.instancia_original_id !== chat.instancia_id && (
                    <span className="opacity-70" title={`Migrado de: ${chat.instancia_original_nome}`}>
                      ← {chat.instancia_original_nome}
                    </span>
                  )}
                </span>
              )}
            </p>
          </div>
        </div>
        {/* Ícones fixos à direita */}
        <div className="flex gap-1 flex-shrink-0 items-center">
          {/* Dropdown para trocar instância */}
          <DropdownMenu open={changeInstanceOpen} onOpenChange={setChangeInstanceOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Trocar instância de atendimento"
                disabled={changingInstance}
              >
                <Repeat className={`w-4 h-4 ${changingInstance ? 'animate-spin' : ''}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Wifi className="h-3 w-3" />
                Trocar instância
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {instanciasDisponiveis.length === 0 ? (
                <DropdownMenuItem disabled>
                  Nenhuma instância disponível
                </DropdownMenuItem>
              ) : (
                instanciasDisponiveis.map(inst => {
                  const status = instanciasStatus[inst.id];
                  return (
                    <DropdownMenuItem
                      key={inst.id}
                      onClick={() => handleChangeInstance(inst.id)}
                      className={inst.id === chat.instancia_id ? "bg-accent" : ""}
                    >
                      <div className="flex items-center justify-between w-full gap-2">
                        <div className="flex items-center gap-2">
                          {/* Status indicator */}
                          <span 
                            className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                              status === 'loading' 
                                ? 'bg-muted-foreground animate-pulse' 
                                : status === 'connected' 
                                  ? 'bg-green-500' 
                                  : 'bg-red-500'
                            }`}
                            title={status === 'loading' ? 'Verificando...' : status === 'connected' ? 'Conectada' : 'Desconectada'}
                          />
                          <span>{inst.nome}</span>
                        </div>
                        {inst.id === chat.instancia_id && (
                          <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </DropdownMenuItem>
                  );
                })
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {contatoMapeado && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setContatoDetalhesOpen(true)}
              title="Ver dados mapeados do contato"
            >
              <Info className="w-4 h-4" />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCreateAgendamento}
            title="Criar Agendamento"
          >
            <Calendar className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setDeleteDialogOpen(true)}
            title="Excluir Conversa"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => syncMessagesFromApi()}
            disabled={isLoadingMessages}
            title="Sincronizar com WhatsApp"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingMessages ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Histórico de mensagens com scroll */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Botão para carregar mensagens mais antigas */}
        {hasMoreMessages && (
          <div className="flex justify-center mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="text-xs"
            >
              {isLoadingMore ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Carregando...
                </>
              ) : (
                "Carregar mensagens anteriores"
              )}
            </Button>
          </div>
        )}
        
        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Carregando mensagens...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Nenhuma mensagem ainda</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const msgDate = msg.timestamp || msg.created_at;
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const prevMsgDate = prevMsg ? (prevMsg.timestamp || prevMsg.created_at) : null;
            const showDateSeparator = index === 0 || (prevMsgDate && msgDate && isDifferentDay(prevMsgDate, msgDate));

            return (
              <div key={msg.id || index}>
                {showDateSeparator && msgDate && (
                  <DateSeparator date={msgDate} />
                )}
                <div
                  className={`flex ${msg.sender_type === 'customer' ? 'justify-start' : 'justify-end'} mb-3`}
                >
                  <div className="relative group max-w-[70%]">
                    {msg.sender_type === 'agent' && (
                      <div className="absolute left-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ transform: 'translateX(calc(-100% - 8px))' }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-[#f3f5f7]"
                          style={{ backgroundColor: '#f3f5f7' }}
                          onClick={() => handleDeleteMessage(msg.message_id)}
                          title="Deletar"
                        >
                          <X className="w-3 h-3 text-black" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-muted"
                          style={{ backgroundColor: 'hsl(var(--muted))' }}
                          onClick={() => handleForwardMessage(msg)}
                          title="Encaminhar"
                        >
                          <Forward className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {msg.sender_type === 'customer' && (
                      <div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ transform: 'translateX(calc(100% + 8px))' }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-muted"
                          style={{ backgroundColor: 'hsl(var(--muted))' }}
                          onClick={() => handleForwardMessage(msg)}
                          title="Encaminhar"
                        >
                          <Forward className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    <MessageBubble message={msg} instanciaId={chat.instancia_id} />
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Bloco para digitar mensagem - Fixo na parte inferior */}
      <div className="border-t bg-card p-4 flex-shrink-0">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-[60px] w-[60px] flex-shrink-0"
            onClick={() => setMediaDialogOpen(true)}
            title="Enviar Mídia"
          >
            <Image className="w-5 h-5" />
          </Button>
          <Popover open={mensagensPredefindasOpen} onOpenChange={setMensagensPredefindasOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-[60px] w-[60px] flex-shrink-0"
                title="Mensagens Pré-definidas"
              >
                <MessageSquare className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 max-h-[450px] overflow-hidden" align="start">
              <Tabs defaultValue="texto" className="w-full">
                <TabsList className="w-full mb-3 h-8">
                  <TabsTrigger value="texto" className="flex-1 text-xs h-7">
                    <MessageSquare className="w-3.5 h-3.5 mr-1.5" />
                    Texto
                  </TabsTrigger>
                  <TabsTrigger value="audio" className="flex-1 text-xs h-7">
                    <Mic className="w-3.5 h-3.5 mr-1.5" />
                    Áudio
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="texto" className="max-h-[350px] overflow-y-auto">
                  <div className="space-y-2">
                    {mensagensPredefinidas.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma mensagem criada ainda
                      </p>
                    ) : (
                      <>
                        {/* Mensagens sem bloco - primeiro */}
                        {(() => {
                          const mensagensSemBloco = mensagensPredefinidas
                            .filter(m => !m.bloco_id)
                            .sort((a, b) => a.ordem - b.ordem);
                          if (mensagensSemBloco.length === 0) return null;
                          return (
                            <Collapsible 
                              open={expandedTextSemBloco} 
                              onOpenChange={setExpandedTextSemBloco}
                              className="space-y-1"
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Sem bloco
                                </span>
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedTextSemBloco ? '' : '-rotate-90'}`} />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1">
                                {mensagensSemBloco.map((msg) => (
                                  <button
                                    key={msg.id}
                                    onClick={() => {
                                      setNewMessage(msg.conteudo);
                                      setMensagensPredefindasOpen(false);
                                    }}
                                    className="w-full text-left p-3 rounded-md hover:bg-accent transition-colors"
                                  >
                                    <p className="font-medium text-sm mb-1">{msg.titulo}</p>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {msg.conteudo}
                                    </p>
                                  </button>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })()}
                        {/* Mensagens agrupadas por bloco - ordenados por ordem do bloco */}
                        {[...blocos].sort((a, b) => a.ordem - b.ordem).map((bloco) => {
                          const mensagensDoBloco = mensagensPredefinidas
                            .filter(m => m.bloco_id === bloco.id)
                            .sort((a, b) => a.ordem - b.ordem);
                          if (mensagensDoBloco.length === 0) return null;
                          return (
                            <Collapsible 
                              key={bloco.id}
                              open={expandedTextBlocos[bloco.id] === true}
                              onOpenChange={() => setExpandedTextBlocos(prev => ({ ...prev, [bloco.id]: !prev[bloco.id] }))}
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {bloco.titulo} ({mensagensDoBloco.length})
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedTextBlocos[bloco.id] === true ? 'rotate-180' : ''}`} />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1 mt-1">
                                {mensagensDoBloco.map((msg) => (
                                  <button
                                    key={msg.id}
                                    onClick={() => {
                                      setNewMessage(msg.conteudo);
                                      setMensagensPredefindasOpen(false);
                                    }}
                                    className="w-full text-left p-3 rounded-md hover:bg-accent transition-colors"
                                  >
                                    <p className="font-medium text-sm mb-1">{msg.titulo}</p>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {msg.conteudo}
                                    </p>
                                  </button>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="audio" className="max-h-[350px] overflow-y-auto">
                  <div className="space-y-2">
                    {audiosPredefinidos.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum áudio criado ainda
                      </p>
                    ) : (
                      <>
                        {/* Áudios sem bloco - primeiro */}
                        {(() => {
                          const audiosSemBloco = audiosPredefinidos
                            .filter(a => !a.bloco_id)
                            .sort((a, b) => a.ordem - b.ordem);
                          if (audiosSemBloco.length === 0) return null;
                          return (
                            <Collapsible 
                              open={expandedAudioSemBloco} 
                              onOpenChange={setExpandedAudioSemBloco}
                              className="space-y-1"
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-accent rounded-md transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Sem bloco
                                </span>
                                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedAudioSemBloco ? '' : '-rotate-90'}`} />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1">
                                {audiosSemBloco.map((audio) => (
                                  <div
                                    key={audio.id}
                                    className="flex items-center gap-2 p-3 rounded-md hover:bg-accent transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm truncate">{audio.titulo}</p>
                                      {audio.duracao_segundos && (
                                        <p className="text-xs text-muted-foreground">
                                          {Math.floor(audio.duracao_segundos / 60)}:{String(Math.floor(audio.duracao_segundos % 60)).padStart(2, '0')}
                                        </p>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const audioElement = document.getElementById(`preview-audio-disparos-${audio.id}`) as HTMLAudioElement;
                                        if (audioElement) {
                                          if (audioElement.paused) {
                                            audioElement.play();
                                          } else {
                                            audioElement.pause();
                                            audioElement.currentTime = 0;
                                          }
                                        }
                                      }}
                                      title="Ouvir"
                                    >
                                      <Mic className="w-4 h-4" />
                                    </Button>
                                    <audio id={`preview-audio-disparos-${audio.id}`} src={audio.audio_url} className="hidden" />
                                    <Button
                                      size="sm"
                                      className="h-8 px-3 flex-shrink-0"
                                      disabled={sendingAudioId === audio.id}
                                      onClick={() => handleSendPredefinedAudio(audio.audio_url, audio.id)}
                                    >
                                      {sendingAudioId === audio.id ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Send className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })()}
                        {/* Áudios agrupados por bloco - ordenados por ordem do bloco */}
                        {[...blocosAudios].sort((a, b) => a.ordem - b.ordem).map((bloco) => {
                          const audiosDoBloco = audiosPredefinidos
                            .filter(a => a.bloco_id === bloco.id)
                            .sort((a, b) => a.ordem - b.ordem);
                          if (audiosDoBloco.length === 0) return null;
                          return (
                            <Collapsible 
                              key={bloco.id}
                              open={expandedAudioBlocos[bloco.id] === true}
                              onOpenChange={() => setExpandedAudioBlocos(prev => ({ ...prev, [bloco.id]: !prev[bloco.id] }))}
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {bloco.titulo} ({audiosDoBloco.length})
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedAudioBlocos[bloco.id] === true ? 'rotate-180' : ''}`} />
                              </CollapsibleTrigger>
                              <CollapsibleContent className="space-y-1 mt-1">
                                {audiosDoBloco.map((audio) => (
                                  <div
                                    key={audio.id}
                                    className="flex items-center gap-2 p-3 rounded-md hover:bg-accent transition-colors"
                                  >
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm truncate">{audio.titulo}</p>
                                      {audio.duracao_segundos && (
                                        <p className="text-xs text-muted-foreground">
                                          {Math.floor(audio.duracao_segundos / 60)}:{String(Math.floor(audio.duracao_segundos % 60)).padStart(2, '0')}
                                        </p>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 flex-shrink-0"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const audioElement = document.getElementById(`preview-audio-disparos-${audio.id}`) as HTMLAudioElement;
                                        if (audioElement) {
                                          if (audioElement.paused) {
                                            audioElement.play();
                                          } else {
                                            audioElement.pause();
                                            audioElement.currentTime = 0;
                                          }
                                        }
                                      }}
                                      title="Ouvir"
                                    >
                                      <Mic className="w-4 h-4" />
                                    </Button>
                                    <audio id={`preview-audio-disparos-${audio.id}`} src={audio.audio_url} className="hidden" />
                                    <Button
                                      size="sm"
                                      className="h-8 px-3 flex-shrink-0"
                                      disabled={sendingAudioId === audio.id}
                                      onClick={() => handleSendPredefinedAudio(audio.audio_url, audio.id)}
                                    >
                                      {sendingAudioId === audio.id ? (
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Send className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </div>
                                ))}
                              </CollapsibleContent>
                            </Collapsible>
                          );
                        })}
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder=""
            className="min-h-[60px] max-h-[120px] resize-none text-base"
            disabled={isSending}
          />
          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            size="icon"
            className="h-[60px] w-[60px] flex-shrink-0"
          >
            {isSending ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Enter para enviar, Shift+Enter para quebrar linha • *negrito* _itálico_ ~tachado~ `code`
        </p>
      </div>

      {/* Dialog de Agendamento */}
      {clienteData && (
        <NovoAgendamentoDialog
          open={agendamentoDialogOpen}
          onOpenChange={setAgendamentoDialogOpen}
          clienteId={clienteData.id}
          initialData={{
            nome: clienteData.nome,
            telefone: clienteData.telefone,
            email: clienteData.email,
          }}
          origem="Disparos"
          origemInstanciaId={chat.instancia_id || undefined}
          origemInstanciaNome={chat.instancia_nome || undefined}
        />
      )}

      {/* Dialog de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Conversa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta conversa? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChat}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Mídia */}
      <AlertDialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar Mídia</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o tipo de mídia e faça upload
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo de mídia</label>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value as "image" | "ptt")}
                className="w-full mt-1 p-2 border rounded"
              >
                <option value="image">Imagem</option>
                <option value="ptt">Áudio (PTT)</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Modo de envio</label>
              <select
                value={uploadMode}
                onChange={(e) => setUploadMode(e.target.value as "url" | "file" | "record")}
                className="w-full mt-1 p-2 border rounded"
              >
                <option value="url">URL</option>
                <option value="file">Upload de arquivo</option>
                {mediaType === "ptt" && <option value="record">Gravar áudio</option>}
              </select>
            </div>

            {uploadMode === "url" && (
              <div>
                <label className="text-sm font-medium">URL do arquivo</label>
                <Input
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  placeholder="https://exemplo.com/arquivo.jpg"
                  className="mt-1"
                />
              </div>
            )}

            {uploadMode === "file" && (
              <div>
                <label className="text-sm font-medium">Selecionar arquivo</label>
                <Input
                  type="file"
                  accept={mediaType === "image" ? "image/*" : "audio/*"}
                  onChange={handleFileUpload}
                  className="mt-1"
                />
              </div>
            )}

            {uploadMode === "record" && mediaType === "ptt" && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  {!isRecording ? (
                    <Button
                      onClick={handleStartRecording}
                      className="flex-1"
                      variant="outline"
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Iniciar Gravação
                    </Button>
                  ) : (
                    <Button
                      onClick={handleStopRecording}
                      className="flex-1"
                      variant="destructive"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Parar Gravação
                    </Button>
                  )}
                </div>

                {audioUrl && (
                  <div>
                    <label className="text-sm font-medium">Pré-visualização</label>
                    <audio controls src={audioUrl} className="w-full mt-2" />
                  </div>
                )}
              </div>
            )}

            {mediaType === "image" && (
              <div>
                <label className="text-sm font-medium">Legenda (opcional)</label>
                <Input
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  placeholder="Digite uma legenda"
                  className="mt-1"
                />
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendMedia} disabled={isSendingMedia || (uploadMode === "record" && !audioBlob)}>
              {isSendingMedia ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Enviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Encaminhamento */}
      <AlertDialog open={forwardDialogOpen} onOpenChange={setForwardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encaminhar Mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione um contato ou digite um número
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Encaminhar para</label>
              <select
                value={forwardMode}
                onChange={(e) => setForwardMode(e.target.value as "existing" | "new")}
                className="w-full mt-1 p-2 border rounded"
              >
                <option value="existing">Contato existente</option>
                <option value="new">Novo número</option>
              </select>
            </div>

            {forwardMode === "existing" ? (
              <div>
                <label className="text-sm font-medium">Selecione o contato</label>
                <select
                  value={forwardTarget}
                  onChange={(e) => setForwardTarget(e.target.value)}
                  className="w-full mt-1 p-2 border rounded"
                >
                  <option value="">Selecione...</option>
                  {availableChats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.contact_name} - {formatPhoneNumber(c.contact_number)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium">Digite o número</label>
                <Input
                  value={forwardTarget}
                  onChange={(e) => setForwardTarget(e.target.value)}
                  placeholder="5511999999999"
                  className="mt-1"
                />
              </div>
            )}

            {forwardMessage && (
              <div className="p-3 bg-muted rounded">
                <p className="text-sm font-medium mb-1">Mensagem:</p>
                <p className="text-sm text-muted-foreground">{forwardMessage.content}</p>
              </div>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendForward}>Encaminhar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Popup de dados mapeados do contato */}
      {contatoMapeado && (
        <ContatoDetalhesPopup
          contato={contatoMapeado.contato}
          camposMapeados={contatoMapeado.camposMapeados}
          open={contatoDetalhesOpen}
          onOpenChange={(o) => !o && setContatoDetalhesOpen(false)}
        />
      )}
    </div>
  );
}
