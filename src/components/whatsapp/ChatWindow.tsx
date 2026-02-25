import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { RefreshCw, Send, Calendar, Trash2, MessageSquare, Image, Mic, Forward, X, ArrowLeft, Pencil, Check, ChevronDown } from "lucide-react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageBubble } from "./MessageBubble";
import { DateSeparator, isDifferentDay } from "./DateSeparator";
import { HeaderAttributionBadge } from "./HeaderAttributionBadge";

import { getInitials, normalizePhoneNumber, formatPhoneNumber, getLast8Digits } from "@/utils/whatsapp";
import { syncContactNameEverywhere, CONTACT_NAME_QUERY_KEYS } from "@/utils/syncContactName";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { useMensagensPredefinidas } from "@/hooks/useMensagensPredefinidas";
import { useBlocosMensagens } from "@/hooks/useBlocosMensagens";
import { useAudiosPredefinidos } from "@/hooks/useAudiosPredefinidos";
import { useBlocosAudios } from "@/hooks/useBlocosAudios";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Normalize provider message id to stable form (strip optional "owner:" prefix)
const normalizeProviderMessageId = (raw: unknown): string => {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const parts = s.split(':').filter(Boolean);
  return (parts.length > 1 ? parts[parts.length - 1] : s).trim();
};

const scoreMessageForDedupe = (m: any) => {
  let score = 0;
  const id = String(m?.message_id ?? '');
  if (id && !id.includes(':')) score += 2; // prefer stable id without prefix
  const mediaUrl = String(m?.media_url ?? '').trim();
  if (mediaUrl) score += 1;
  return score;
};

const dedupeMessagesByProviderId = (msgs: any[]) => {
  const out: any[] = [];
  const indexByKey = new Map<string, number>();

  for (const msg of msgs) {
    const key = normalizeProviderMessageId(msg?.message_id) || String(msg?.message_id ?? msg?.id ?? '');
    if (!key) {
      out.push(msg);
      continue;
    }
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, out.length);
      out.push(msg);
      continue;
    }

    const existing = out[existingIndex];
    if (scoreMessageForDedupe(msg) > scoreMessageForDedupe(existing)) {
      out[existingIndex] = msg;
    }
  }

  return out;
};


interface Chat {
  id: string;
  chat_id: string;
  contact_name: string;
  contact_number: string;
  last_message?: string | null;
  last_message_time?: string | null;
}

interface ChatWindowProps {
  chat: Chat;
  onMessagesRead?: () => void;
  onChatDeleted?: () => void;
  onChatUpdated?: (updatedChat: Chat) => void;
  availableChats?: any[];
  onBack?: () => void;
  initialMessage?: string | null;
  instanciaId?: string | null;
}

interface ClienteData {
  id?: string;
  nome: string;
  telefone?: string;
  email?: string;
}

// Cache de mensagens por chat (persiste entre seleções de chat)
const messagesCache = new Map<string, { messages: any[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export const ChatWindow = ({ chat, onMessagesRead, onChatDeleted, onChatUpdated, availableChats = [], onBack, initialMessage, instanciaId }: ChatWindowProps) => {
  const queryClient = useQueryClient();
  
  // Inicializar com mensagens do cache se disponível (evita flash de loading)
  const getCachedMessages = () => {
    const cached = messagesCache.get(chat.id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
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
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<any[]>([]);
  const [chatLabels, setChatLabels] = useState<string[]>([]);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [leadAttribution, setLeadAttribution] = useState<any>(null);
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<"image" | "ptt">("image");
  const [mediaCaption, setMediaCaption] = useState("");
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<any | null>(null);
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
  
  // Atualizar cache sempre que mensagens mudarem
  useEffect(() => {
    if (messages.length > 0) {
      messagesCache.set(chat.id, { messages, timestamp: Date.now() });
    }
  }, [messages, chat.id]);
  
  // Quando o chat muda, carregar do cache ou iniciar vazio
  useEffect(() => {
    const cached = messagesCache.get(chat.id);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setMessages(cached.messages);
      setShouldScrollToBottom(true);
    } else {
      setMessages([]);
    }
    // Reset outros estados
    setMessagesOffset(0);
    setHasMoreMessages(false);
  }, [chat.id]);

  // Set initial message when prop changes (for prefill from deep-links)
  useEffect(() => {
    if (initialMessage) {
      setNewMessage(initialMessage);
    }
  }, [initialMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getInvokeErrorMessage = async (err: any, fallback: string) => {
    // If it's already a string message from our throw
    if (err?.message && typeof err.message === 'string' && err.message !== 'non-2xx') {
      // Check if it looks like our custom message
      if (!err.message.includes('non-2xx') && !err.message.includes('FunctionsHttpError')) {
        return err.message;
      }
    }

    let detailedMessage = fallback;

    // Supabase FunctionsHttpError often stores the real response in err.context.response
    try {
      const resp: Response | undefined = err?.context?.response;
      if (resp) {
        try {
          const cloned = resp.clone();
          const json = await cloned.json().catch(() => null);
          if (json && typeof json === 'object') {
            const anyJson: any = json;
            if (anyJson?.error) detailedMessage = anyJson.error;
            else if (anyJson?.message) detailedMessage = anyJson.message;
            else if (anyJson?.msg) detailedMessage = anyJson.msg;
          } else {
            const text = await resp.clone().text();
            if (text && text.length < 200) detailedMessage = text;
          }
        } catch {
          const text = await resp.clone().text().catch(() => '');
          if (text && text.length < 200) detailedMessage = text;
        }
      }

      // Some error shapes might store the response body directly
      const body = err?.context?.body;
      if (body && typeof body === 'string') {
        try {
          const parsed = JSON.parse(body);
          detailedMessage = parsed?.error || parsed?.message || detailedMessage;
        } catch {
          if (body.length < 200) detailedMessage = body;
        }
      }
    } catch {
      // ignore
    }

    return detailedMessage;
  };

  const forceScrollToBottom = () => {
    // Scroll instantâneo para o final sem animação
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  };

  // Scroll para o final após renderização das mensagens
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
      console.log('[ChatWindow] Loading messages for chat.id:', chat.id, loadMore ? `(offset=${messagesOffset})` : '(initial)');
      
      const currentOffset = loadMore ? messagesOffset : 0;
      
      // Single query with count to avoid extra round-trip
      const { data: dbMessages, error, count: totalCount } = await supabase
        .from('whatsapp_messages')
        .select('*', { count: 'exact' })
        .eq('chat_id', chat.id)
        .order('timestamp', { ascending: false })
        .range(currentOffset, currentOffset + MESSAGES_PAGE_SIZE - 1);

      if (error) {
        console.error('[ChatWindow] Error loading messages:', error);
        throw error;
      }

      console.log('[ChatWindow] Found', dbMessages?.length || 0, 'messages in database (offset=', currentOffset, ')');

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
        utm_source: msg.utm_source,
        utm_campaign: msg.utm_campaign,
        utm_medium: msg.utm_medium,
        utm_content: msg.utm_content,
        utm_term: msg.utm_term,
        fbclid: msg.fbclid,
        ad_thumbnail_url: msg.ad_thumbnail_url,
        fb_ad_id: msg.fb_ad_id,
        fb_campaign_name: msg.fb_campaign_name,
        fb_adset_name: msg.fb_adset_name,
        fb_ad_name: msg.fb_ad_name,
      }));

      const formattedMessagesDeduped = dedupeMessagesByProviderId(formattedMessages);

      // Calculate if there are more messages
      const newOffset = currentOffset + (dbMessages?.length || 0);
      const hasMore = (totalCount || 0) > newOffset;
      setHasMoreMessages(hasMore);
      setMessagesOffset(newOffset);

      if (loadMore) {
        // Prepend older messages
        setMessages(prev => dedupeMessagesByProviderId([...formattedMessagesDeduped, ...prev]));
        setIsLoadingMore(false);
      } else {
        // Initial load or refresh
        let finalMessages = formattedMessagesDeduped;
        
        // If no messages in DB but chat has last_message, create a virtual message
        if (finalMessages.length === 0 && chat.last_message && chat.last_message_time) {
          console.log('[ChatWindow] Creating virtual message from chat preview');
          finalMessages = [{
            id: `virtual-${chat.id}`,
            message_id: `virtual-${chat.id}`,
            content: chat.last_message,
            sender_type: 'customer' as const,
            media_type: null,
            media_url: null,
            status: 'delivered',
            deleted: false,
            timestamp: chat.last_message_time,
            utm_source: null,
            utm_campaign: null,
            utm_medium: null,
            utm_content: null,
            utm_term: null,
            fbclid: null,
            ad_thumbnail_url: null,
            fb_ad_id: null,
            fb_campaign_name: null,
            fb_adset_name: null,
            fb_ad_name: null,
          }];
        }

        setMessages(finalMessages);
        setIsLoadingMessages(false);

        const shouldScroll = forceScrollOnLoad || previousLength === 0 || finalMessages.length > previousLength;
        if (shouldScroll) {
          setShouldScrollToBottom(true);
        }

        // Do NOT fetch provider history automatically.
        // Chats/messages must be created/updated via webhook only, to avoid resurrecting deleted conversations.

      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
      setIsLoadingMessages(false);
      setIsLoadingMore(false);
      
      // Fallback: show virtual message from chat preview on error
      if (messages.length === 0 && chat.last_message && chat.last_message_time) {
        console.log('[ChatWindow] Error loading, using fallback virtual message');
        setMessages([{
          id: `virtual-${chat.id}`,
          message_id: `virtual-${chat.id}`,
          content: chat.last_message,
          sender_type: 'customer' as const,
          media_type: null,
          media_url: null,
          status: 'delivered',
          deleted: false,
          timestamp: chat.last_message_time,
          utm_source: null,
          utm_campaign: null,
          utm_medium: null,
          utm_content: null,
          utm_term: null,
          fbclid: null,
          ad_thumbnail_url: null,
          fb_ad_id: null,
          fb_campaign_name: null,
          fb_adset_name: null,
          fb_ad_name: null,
        }]);
      }
      
      const isNetworkError = error.message?.includes('Failed to fetch') || 
                             error.message?.includes('NetworkError');
      if (!isNetworkError && !loadMore) {
        toast.error(error.message || 'Erro ao carregar mensagens');
      }
    }
  };

  const loadMoreMessages = () => {
    if (!isLoadingMore && hasMoreMessages) {
      loadMessages(false, true);
    }
  };

  const mergeAttributionFields = (base: any, incoming: any) => {
    const merged = { ...incoming };
    const keys = [
      'utm_source',
      'utm_campaign',
      'utm_medium',
      'utm_content',
      'utm_term',
      'fbclid',
      'ad_thumbnail_url',
      'fb_ad_id',
      'fb_campaign_name',
      'fb_adset_name',
      'fb_ad_name',
    ];

    for (const k of keys) {
      if (merged[k] == null && base?.[k] != null) merged[k] = base[k];
    }

    return merged;
  };

  const mergeMessagesPreservingAttribution = (incomingMessages: any[]) => {
    const currentById = new Map<string, any>();
    for (const m of messages) currentById.set(m.message_id, m);
    return incomingMessages.map((m) => mergeAttributionFields(currentById.get(m.message_id), m));
  };

  // Helper function to invoke edge functions with retry and longer timeout tolerance
  const invokeWithRetry = async (
    functionName: string,
    options: { headers: Record<string, string>; body: any },
    retries = 2
  ): Promise<any> => {
    let lastError: any;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
        
        const response = await supabase.functions.invoke(functionName, {
          ...options,
          // Note: supabase-js doesn't support signal directly, but we handle timeout via the controller
        });
        
        clearTimeout(timeoutId);
        
        if (response.error) throw response.error;
        return response;
      } catch (error: any) {
        lastError = error;
        const isNetworkError = error.message?.includes('Failed to fetch') || 
                               error.message?.includes('NetworkError') ||
                               error.name === 'AbortError';
        
        console.warn(`[${functionName}] Attempt ${attempt + 1}/${retries + 1} failed:`, error.message);
        
        if (attempt < retries && isNetworkError) {
          // Wait before retrying (exponential backoff: 1.5s, 3s)
          const delay = 1500 * Math.pow(2, attempt);
          console.log(`[${functionName}] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else if (!isNetworkError) {
          // Non-network errors should not retry
          throw error;
        }
      }
    }
    throw lastError;
  };

  // IMPORTANT: we do NOT fetch message history from the provider automatically.
  // Messages should come from the database (populated by webhooks) to avoid resurrecting deleted history.

  // Manual refresh (will backfill from provider into DB, then reload DB)
  const syncMessagesFromApi = async () => {
    setIsLoadingMessages(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      // Best-effort: fetch from provider and persist messages into DB.
      // This helps recover messages when webhooks failed previously.
      const resp = await invokeWithRetry('uazapi-get-messages', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          chatid: chat.chat_id,
          limit: 200,
          offset: 0,
          persist: true,
        },
      });

      if (resp?.error) {
        throw resp.error;
      }

      // Ensure we don't keep stale cache after backfill
      messagesCache.delete(chat.id);

      await loadMessages(true);
      toast.success('Mensagens atualizadas');
    } catch (error: any) {
      console.error('Error refreshing messages:', error);
      const msg = await getInvokeErrorMessage(error, 'Erro ao atualizar mensagens');
      toast.error(msg);
    } finally {
      setIsLoadingMessages(false);
    }
  };


  const loadLabels = async () => {
    try {
      // Refresh session before calling edge function
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('Session error when loading labels:', sessionError);
        return;
      }

      const response = await supabase.functions.invoke('uazapi-get-labels', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      // 400 means UAZapi not configured - silently skip
      if (response.error) {
        const body = response.data;
        if (body?.error === "UAZapi não configurado") return;
        throw response.error;
      }
      setAvailableLabels(response.data.labels || []);

      // Load chat labels from database only when we have a real DB UUID
      if (!isUuid(chat.id)) {
        setChatLabels([]);
        return;
      }

      const { data: chatLabelsData } = await supabase
        .from('whatsapp_chat_labels')
        .select('label_id')
        .eq('chat_id', chat.id);
      
      setChatLabels((chatLabelsData || []).map((l: any) => l.label_id));
    } catch (error: any) {
      // Don't show error toast for labels - it's non-critical functionality
      // Some UAZAPI servers don't support the labels endpoint
      console.error('Error loading labels:', error);
    }
  };

  // Buscar status do lead baseado no telefone (últimos 8 dígitos)
  const loadLeadStatus = async () => {
    try {
      const last8Digits = getLast8Digits(chat.contact_number);
      if (!last8Digits || last8Digits.length < 8) {
        setLeadId(null);
        setLeadStatus(null);
        setLeadAttribution(null);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const userId = session?.user?.id;
      if (!userId) return;

      // 1) Primeiro tenta buscar atribuição diretamente das mensagens do chat (fonte primária - como Lenir)
      let wpAttribution: any = null;
      
      // Busca o chat_id correto do banco
      const { data: wpChats } = await supabase
        .from('whatsapp_chats')
        .select('id')
        .eq('user_id', userId)
        .or(`contact_number.like.%${last8Digits},normalized_number.like.%${last8Digits}`)
        .limit(5);

      const chatIds = (wpChats || []).map(c => c.id);
      
      if (chatIds.length > 0) {
        // Buscar mensagens com atribuição de campanha
        const { data: wpMessages } = await supabase
          .from('whatsapp_messages')
          .select('fb_ad_id, fb_campaign_name, fb_adset_name, fb_ad_name, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, ad_thumbnail_url, timestamp')
          .in('chat_id', chatIds)
          .or('fb_ad_id.not.is.null,fbclid.not.is.null,utm_source.not.is.null')
          .order('timestamp', { ascending: false })
          .limit(1);

        if (wpMessages && wpMessages.length > 0) {
          const msg = wpMessages[0];
          wpAttribution = {
            fb_ad_id: msg.fb_ad_id,
            fb_campaign_name: msg.fb_campaign_name,
            fb_adset_name: msg.fb_adset_name,
            fb_ad_name: msg.fb_ad_name,
            utm_source: msg.utm_source,
            utm_campaign: msg.utm_campaign,
            utm_medium: msg.utm_medium,
            utm_content: msg.utm_content,
            utm_term: msg.utm_term,
            fbclid: msg.fbclid,
            ad_thumbnail_url: msg.ad_thumbnail_url,
          };
        }
      }

      // 2) Buscar lead para status e fallback de atribuição
      const { data: leads, error } = await supabase
        .from('leads')
        .select('id, status, telefone, origem, utm_source, utm_campaign, utm_medium, utm_content, utm_term, fbclid, fb_ad_id, fb_campaign_name, fb_adset_name, fb_ad_name, ad_thumbnail_url, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .like('telefone', `%${last8Digits}`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const matching = (leads || []).filter((l) => getLast8Digits(l.telefone) === last8Digits);
      const lead = matching.find((l) => (l.origem || '').toLowerCase() === 'whatsapp') || matching[0];

      if (lead) {
        setLeadId(lead.id);

        // Mesclar: wpAttribution tem prioridade (dados da mensagem), fallback para lead
        const baseAttribution: any = {
          utm_source: wpAttribution?.utm_source || lead.utm_source,
          utm_campaign: wpAttribution?.utm_campaign || lead.utm_campaign,
          utm_medium: wpAttribution?.utm_medium || lead.utm_medium,
          utm_content: wpAttribution?.utm_content || lead.utm_content,
          utm_term: wpAttribution?.utm_term || lead.utm_term,
          fbclid: wpAttribution?.fbclid || lead.fbclid,
          ad_thumbnail_url: wpAttribution?.ad_thumbnail_url || lead.ad_thumbnail_url || null,
          fb_ad_id: wpAttribution?.fb_ad_id || lead.fb_ad_id,
          fb_campaign_name: wpAttribution?.fb_campaign_name || lead.fb_campaign_name,
          fb_adset_name: wpAttribution?.fb_adset_name || lead.fb_adset_name,
          fb_ad_name: wpAttribution?.fb_ad_name || lead.fb_ad_name,
        };

        // Se não veio fb_ad_id, tenta extrair do utm_content (na Lenir o utm_content == ad_id)
        const parseMetaAdId = (value?: string | null) => {
          if (!value) return null;
          const v = String(value).trim();
          return /^\d{8,}$/.test(v) ? v : null;
        };

        baseAttribution.fb_ad_id = baseAttribution.fb_ad_id || parseMetaAdId(baseAttribution.utm_content);

        // 3) Se temos ad_id (ou derivado) mas falta algum nome, enriquecer via API
        const needsEnrichment =
          baseAttribution.fb_ad_id &&
          (!baseAttribution.fb_campaign_name ||
            !baseAttribution.fb_adset_name ||
            !baseAttribution.fb_ad_name ||
            !baseAttribution.ad_thumbnail_url);

        if (needsEnrichment && session?.access_token) {
          try {
            const resp = await supabase.functions.invoke("fetch-facebook-ad-info", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: { ad_id: baseAttribution.fb_ad_id },
            });

            if (!resp.error && resp.data) {
              const r: any = resp.data;
              baseAttribution.fb_campaign_name = baseAttribution.fb_campaign_name || r.campaign_name || null;
              baseAttribution.fb_adset_name = baseAttribution.fb_adset_name || r.adset_name || null;
              baseAttribution.fb_ad_name = baseAttribution.fb_ad_name || r.ad_name || null;
              baseAttribution.ad_thumbnail_url = baseAttribution.ad_thumbnail_url || r.thumbnail_url || null;

              // Persistir para ficar consistente (WhatsApp + Leads)
              try {
                await supabase
                  .from("leads")
                  .update({
                    fb_ad_id: baseAttribution.fb_ad_id,
                    fb_campaign_name: baseAttribution.fb_campaign_name,
                    fb_adset_name: baseAttribution.fb_adset_name,
                    fb_ad_name: baseAttribution.fb_ad_name,
                    ad_thumbnail_url: baseAttribution.ad_thumbnail_url,
                    utm_source: baseAttribution.utm_source,
                    utm_campaign: baseAttribution.utm_campaign,
                    utm_medium: baseAttribution.utm_medium,
                    utm_content: baseAttribution.utm_content,
                    utm_term: baseAttribution.utm_term,
                    fbclid: baseAttribution.fbclid,
                  })
                  .eq("id", lead.id);

                if (isUuid(chat.id) && chatIds.length > 0) {
                  await supabase
                    .from("whatsapp_messages")
                    .update({
                      fb_ad_id: baseAttribution.fb_ad_id,
                      fb_campaign_name: baseAttribution.fb_campaign_name,
                      fb_adset_name: baseAttribution.fb_adset_name,
                      fb_ad_name: baseAttribution.fb_ad_name,
                      ad_thumbnail_url: baseAttribution.ad_thumbnail_url,
                    })
                    .in("chat_id", chatIds)
                    .eq("utm_content", baseAttribution.fb_ad_id);
                }
              } catch {
                // não bloquear UI
              }

              queryClient.invalidateQueries({ queryKey: ["leads"] });
            }
          } catch (enrichError) {
            console.warn("Failed to enrich attribution from Facebook API:", enrichError);
          }
        }

        setLeadAttribution(baseAttribution);

        // Use the lead's actual status from the database
        // This ensures consistency with what's visible in the app pages (Clientes, Leads, etc.)
        setLeadStatus(lead.status);
      } else {
        setLeadId(null);
        setLeadStatus(null);
        // Mesmo sem lead, se temos atribuição da mensagem, usar
        setLeadAttribution(wpAttribution);
      }
    } catch (error: any) {
      console.error('Error loading lead status:', error);
    }
  };

  // Reset edited name when chat changes
  useEffect(() => {
    setEditedName(chat.contact_name);
    setIsEditingName(false);
  }, [chat.id, chat.contact_name]);

  // Salvar nome do contato (atualiza whatsapp_chats, leads e disparos_chats)
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

      // Notificar parent para atualizar estado local
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

  // Atualizar status do lead
  const handleStatusChange = async (newStatus: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const normalized = normalizePhoneNumber(chat.contact_number);

      // Sempre verificar se o lead já existe antes de tentar criar
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, status')
        .eq('telefone', normalized)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingLead) {
        // Lead existe, apenas atualizar status
        const { error } = await supabase
          .from('leads')
          .update({ status: newStatus as "lead" | "follow_up" | "sem_interesse" })
          .eq('id', existingLead.id);

        if (error) throw error;
        setLeadId(existingLead.id);
        setLeadStatus(newStatus);
        toast.success('Status atualizado!');
      } else {
        // Lead não existe, criar novo
        const { data: newLead, error } = await supabase
          .from('leads')
          .insert([{
            user_id: user.id,
            nome: chat.contact_name,
            telefone: normalized,
            procedimento_nome: 'A definir',
            status: newStatus as "lead" | "follow_up" | "sem_interesse",
            origem: 'WhatsApp',
            data_contato: new Date().toISOString().split('T')[0],
          }])
          .select('id, status')
          .single();

        if (error) {
          // Se ainda houver erro de duplicação, buscar o lead existente
          if (error.code === '23505') {
            const { data: foundLead } = await supabase
              .from('leads')
              .select('id, status')
              .eq('telefone', normalized)
              .eq('user_id', user.id)
              .is('deleted_at', null)
              .maybeSingle();
            
            if (foundLead) {
              // Atualizar o lead encontrado
              await supabase
                .from('leads')
                .update({ status: newStatus as "lead" | "follow_up" | "sem_interesse" })
                .eq('id', foundLead.id);
              
              setLeadId(foundLead.id);
              setLeadStatus(newStatus);
              toast.success('Status atualizado!');
              return;
            }
          }
          throw error;
        }

        setLeadId(newLead.id);
        setLeadStatus(newLead.status);
        toast.success('Status atualizado!');
      }
    } catch (error: any) {
      console.error('Error updating lead status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  const handleSaveLabels = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('uazapi-manage-chat-labels', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          number: chat.contact_number,
          labelids: chatLabels
        }
      });

      if (response.error) throw response.error;
      toast.success('Etiquetas atualizadas!');
      setLabelsDialogOpen(false);
    } catch (error: any) {
      console.error('Error saving labels:', error);
      toast.error('Erro ao salvar etiquetas');
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

    // Upload to temporary storage or convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setMediaUrl(base64);
      toast.success("Arquivo carregado!");
    };
    reader.readAsDataURL(file);
  };

  const uploadAudioToServer = async (blob: Blob): Promise<string> => {
    // Convert blob to base64 or upload to storage
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

      const response = await supabase.functions.invoke('uazapi-send-media', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          number: chat.contact_number,
          type: 'ptt',
          file: audioUrl,
          chatDbId: isUuid(chat.id) ? chat.id : undefined,
        }
      });

      if (response.error) throw response.error;

      toast.success("Áudio enviado!");
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

    // Se estiver no modo de gravação e tiver áudio gravado
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

      const response = await supabase.functions.invoke('uazapi-send-media', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          number: chat.contact_number,
          type: mediaType,
          file: fileUrl,
          caption: mediaCaption || undefined,
          chatDbId: isUuid(chat.id) ? chat.id : undefined,
        }
      });

      if (response.error) throw response.error;

      toast.success("Mídia enviada!");
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

  const handleDeleteMessage = async (messageId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        return;
      }

      const response = await supabase.functions.invoke('uazapi-delete-message', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { id: messageId }
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
        // Find the selected chat and get its contact_number
        const selectedChat = availableChats?.find(c => c.id === forwardTarget);
        if (selectedChat) {
          targetNumber = selectedChat.contact_number;
        }
      } else {
        // For new numbers, normalize the input
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

      // Check if message has media (image, video, audio)
      if (forwardMessage.media_url && forwardMessage.media_type !== 'text') {
        // Forward as media
        const response = await supabase.functions.invoke('uazapi-send-media', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            number: targetNumber,
            type: forwardMessage.media_type,
            file: forwardMessage.media_url,
            caption: forwardMessage.content || undefined
          }
        });

        if (response.error) {
          const msg = await getInvokeErrorMessage(response.error, 'Erro ao encaminhar mensagem');
          throw new Error(msg);
        }
      } else {
        // Forward as text
        const response = await supabase.functions.invoke('uazapi-send-message', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            number: targetNumber,
            text: forwardMessage.content
          }
        });

        if (response.error) {
          const msg = await getInvokeErrorMessage(response.error, 'Erro ao encaminhar mensagem');
          throw new Error(msg);
        }
      }

      toast.success("Mensagem encaminhada!");
      setForwardDialogOpen(false);
      setForwardTarget("");
      setForwardMessage(null);
    } catch (error: any) {
      console.error('Error forwarding message:', error);
      const msg = await getInvokeErrorMessage(error, 'Erro ao encaminhar mensagem');
      toast.error(msg);
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    loadMessages(true);
    loadLabels();
    loadLeadStatus();
    // Notify parent that messages were read
    if (onMessagesRead) {
      onMessagesRead();
    }
  }, [chat.id]);


  // Realtime subscription for new and updated messages
  useEffect(() => {
    if (!isUuid(chat.id)) return;

    const channel = supabase
      .channel(`whatsapp-messages-${chat.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
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
          // Evitar duplicatas: deduplica por id estável (sem prefixo "owner:")
          setMessages(prev => {
            const key = normalizeProviderMessageId(newMsg.message_id) || newMsg.message_id;
            const idx = prev.findIndex(
              (m) => (normalizeProviderMessageId(m.message_id) || m.message_id) === key
            );

            if (idx === -1) return [...prev, newMsg];

            const existing = prev[idx];
            if (scoreMessageForDedupe(newMsg) > scoreMessageForDedupe(existing)) {
              const next = [...prev];
              next[idx] = newMsg;
              return next;
            }

            return prev;
          });
          setShouldScrollToBottom(true);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_messages',
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

  // Scroll para o final apenas no carregamento inicial (controlado dentro de loadMessages)

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isSending) return;

    setIsSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Sessão expirada. Faça login novamente.');
        setIsSending(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado.');
        setIsSending(false);
        return;
      }

      // If this is a temp chat, create a real chat record first
      let realChatId = chat.id;
      if (chat.id === 'temp') {
        const normalizedNumber = normalizePhoneNumber(chat.contact_number);
        const chatIdJid = chat.chat_id.includes('@') ? chat.chat_id : `${normalizedNumber}@s.whatsapp.net`;

        const { data: createdChat, error: createError } = await supabase
          .from('whatsapp_chats')
          .insert({
            user_id: user.id,
            chat_id: chatIdJid,
            contact_name: chat.contact_name,
            contact_number: chat.contact_number,
            normalized_number: normalizedNumber,
            unread_count: 0,
          })
          .select('*')
          .single();

        if (createError) {
          console.error('Error creating chat:', createError);
          // If duplicate, try to find existing
          if (createError.code === '23505') {
            const last8 = getLast8Digits(chat.contact_number);
            const { data: existingChats } = await supabase
              .from('whatsapp_chats')
              .select('*')
              .eq('user_id', user.id)
              .is('deleted_at', null);

            const existingChat = existingChats?.find((c) => getLast8Digits(c.contact_number) === last8);
            if (existingChat) {
              realChatId = existingChat.id;
              if (onChatUpdated) {
                onChatUpdated({ ...chat, ...existingChat });
              }
            } else {
              toast.error('Erro ao criar chat');
              setIsSending(false);
              return;
            }
          } else {
            toast.error('Erro ao criar chat');
            setIsSending(false);
            return;
          }
        } else if (createdChat) {
          realChatId = createdChat.id;
          // Notify parent to update with real chat
          if (onChatUpdated) {
            onChatUpdated({ ...chat, ...createdChat });
          }
        }
      }

      const response = await supabase.functions.invoke('uazapi-send-message', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          number: chat.contact_number,
          text: newMessage,
          chatDbId: realChatId,
        },
      });

      // Check for error in response.error or response.data.error
      const errorMsg = response.error?.message || response.data?.error;
      if (response.error || response.data?.error) {
        throw new Error(errorMsg || 'Erro ao enviar mensagem');
      }

      setNewMessage("");
      toast.success("Mensagem enviada!");

      // Reload messages to show the new one
      await loadMessages();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast.error(error?.message || 'Erro ao enviar mensagem');
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
      const { error } = await supabase.functions.invoke("whatsapp-delete-chat", {
        body: { chat_id: chat.id },
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

  const formatPhoneForDisplay = (phoneNumber: string): string => {
    const all = phoneNumber.replace(/\D/g, '');
    
    // Se tem 13 dígitos: 55 + DDD(2) + número(9 ou 8)
    if (all.length === 13) {
      const ddd = all.slice(2, 4);
      const numero = all.slice(4);
      if (numero.length === 9) {
        return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
      }
      // Número com 8 dígitos (telefone fixo)
      return `+55 (${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
    }
    
    // Se tem 11 dígitos: DDD(2) + número(9) - celular
    if (all.length === 11) {
      const ddd = all.slice(0, 2);
      const numero = all.slice(2);
      return `+55 (${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`;
    }
    
    // Se tem 10 dígitos: DDD(2) + número(8) - telefone fixo (não adiciona 9)
    if (all.length === 10) {
      const ddd = all.slice(0, 2);
      const numero = all.slice(2);
      return `+55 (${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`;
    }
    
    return phoneNumber;
  };

  const handleCreateAgendamento = async () => {
    try {
      // Aqui a gente NÃO cria lead ao clicar em "agendar".
      // Isso evita conflito com leads já existentes (inclusive excluídos/soft-deleted).
      // O NovoAgendamentoDialog fará a busca/restauração/criação no momento de salvar.

      const all = chat.contact_number.replace(/\D/g, "");
      if (all.length < 10) throw new Error("Número inválido");

      const formattedPhone = formatPhoneForDisplay(all);
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
        // clienteId fica indefinido (opcional) quando não sabemos o id ainda
        nome: nomeParaUsar,
        telefone: formattedPhone,
      });
      setAgendamentoDialogOpen(true);
    } catch (error: any) {
      console.error("Erro ao preparar agendamento:", error);
      toast.error(error.message || "Erro ao abrir agendamento");
    }
  };

  // Find the FIRST customer message that has campaign attribution (earliest in the conversation)
  // or the first customer message if lead has attribution (fallback)
  const firstCustomerMsgWithAttribution = messages.find(
    (m) =>
      m?.sender_type === "customer" &&
      Boolean(
        m?.utm_source ||
          m?.utm_campaign ||
          m?.fbclid ||
          m?.fb_campaign_name ||
          m?.fb_ad_id
      )
  );
  
  const firstCustomerMsg = messages.find((m) => m?.sender_type === "customer");
  
  // Check if lead has attribution data
  const leadHasAttribution = Boolean(
    leadAttribution?.utm_source ||
      leadAttribution?.utm_campaign ||
      leadAttribution?.fbclid ||
      leadAttribution?.fb_campaign_name ||
      leadAttribution?.fb_ad_id
  );
  
  // Priority: message with its own attribution, or first customer msg if lead has attribution
  const attributionAnchorMessageId = 
    firstCustomerMsgWithAttribution?.message_id ?? 
    (leadHasAttribution ? firstCustomerMsg?.message_id : null);

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
            <p className="text-xs text-muted-foreground truncate">
              {formatPhoneForDisplay(chat.contact_number)}
            </p>
          </div>
        </div>
        {/* Ícones fixos à direita */}
        <div className="flex gap-1 flex-shrink-0 items-center">
          <HeaderAttributionBadge contactNumber={chat.contact_number} chatId={chat.id} />
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
        {/* Botão para carregar mensagens anteriores */}
        {hasMoreMessages && !isLoadingMessages && (
          <div className="flex justify-center mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMoreMessages}
              disabled={isLoadingMore}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {isLoadingMore ? (
                <>
                  <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                  Carregando...
                </>
              ) : (
                "↑ Carregar mensagens anteriores"
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
                  {/* Container relativo para mensagem + botões */}
                  <div className="relative group max-w-[70%]">
                    {/* Botões com position absolute */}
                    {msg.sender_type === 'agent' && (
                      <div className="absolute left-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ transform: 'translateX(calc(-100% - 8px))' }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-[#f3f5f7]"
                          style={{ backgroundColor: '#f3f5f7' }}
                          onClick={() => handleForwardMessage(msg)}
                          title="Encaminhar"
                        >
                          <Forward className="w-3 h-3 text-black" />
                        </Button>
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
                      </div>
                    )}
                    
                    {msg.sender_type === 'customer' && (
                      <div className="absolute right-0 top-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ transform: 'translateX(calc(100% + 8px))' }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-[#f3f5f7]"
                          style={{ backgroundColor: '#f3f5f7' }}
                          onClick={() => handleForwardMessage(msg)}
                          title="Encaminhar"
                        >
                          <Forward className="w-3 h-3 text-black" />
                        </Button>
                      </div>
                    )}

                    {/* Mensagem */}
                    <MessageBubble message={msg} fallbackAttribution={msg.message_id === attributionAnchorMessageId ? leadAttribution : undefined} instanciaId={instanciaId} />
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
                                        const audioElement = document.getElementById(`preview-audio-${audio.id}`) as HTMLAudioElement;
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
                                    <audio id={`preview-audio-${audio.id}`} src={audio.audio_url} className="hidden" />
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
                                        const audioElement = document.getElementById(`preview-audio-${audio.id}`) as HTMLAudioElement;
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
                                    <audio id={`preview-audio-${audio.id}`} src={audio.audio_url} className="hidden" />
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
          origem="WhatsApp"
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
            <AlertDialogAction onClick={handleDeleteChat}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Etiquetas */}
      <AlertDialog open={labelsDialogOpen} onOpenChange={setLabelsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerenciar Etiquetas</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione as etiquetas para este contato
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {availableLabels.map((label) => (
              <div key={label.id || label.labelId} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`label-${label.id || label.labelId}`}
                  checked={chatLabels.includes(label.id || label.labelId)}
                  onChange={(e) => {
                    const labelId = label.id || label.labelId;
                    if (e.target.checked) {
                      setChatLabels([...chatLabels, labelId]);
                    } else {
                      setChatLabels(chatLabels.filter(id => id !== labelId));
                    }
                  }}
                  className="rounded"
                />
                <label htmlFor={`label-${label.id || label.labelId}`} className="flex-1">
                  {label.name || label.labelName}
                </label>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveLabels}>Salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de Enviar Mídia */}
      <AlertDialog open={mediaDialogOpen} onOpenChange={setMediaDialogOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar Mídia</AlertDialogTitle>
            <AlertDialogDescription>
              Escolha como deseja enviar a mídia
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tipo</label>
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
    </div>
  );
};