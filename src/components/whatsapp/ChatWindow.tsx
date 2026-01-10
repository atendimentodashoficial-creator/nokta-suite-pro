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
import { CampaignAttributionBadge } from "./CampaignAttributionBadge";
import { getInitials, normalizePhoneNumber, formatPhoneNumber, getLast8Digits } from "@/utils/whatsapp";
import { NovoAgendamentoDialog } from "@/components/clientes/NovoAgendamentoDialog";
import { useMensagensPredefinidas } from "@/hooks/useMensagensPredefinidas";
import { useBlocosMensagens } from "@/hooks/useBlocosMensagens";
import { useAudiosPredefinidos } from "@/hooks/useAudiosPredefinidos";
import { useBlocosAudios } from "@/hooks/useBlocosAudios";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);


interface Chat {
  id: string;
  chat_id: string;
  contact_name: string;
  contact_number: string;
}

interface ChatWindowProps {
  chat: Chat;
  onMessagesRead?: () => void;
  onChatDeleted?: () => void;
  onChatUpdated?: (updatedChat: Chat) => void;
  availableChats?: any[];
  onBack?: () => void;
}

interface ClienteData {
  id?: string;
  nome: string;
  telefone?: string;
  email?: string;
}

export const ChatWindow = ({ chat, onMessagesRead, onChatDeleted, onChatUpdated, availableChats = [], onBack }: ChatWindowProps) => {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [agendamentoDialogOpen, setAgendamentoDialogOpen] = useState(false);
  const [clienteData, setClienteData] = useState<ClienteData | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [mensagensPredefindasOpen, setMensagensPredefindasOpen] = useState(false);
  const [labelsDialogOpen, setLabelsDialogOpen] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<any[]>([]);
  const [chatLabels, setChatLabels] = useState<string[]>([]);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
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
  const [expandedTextSemBloco, setExpandedTextSemBloco] = useState(true);
  const [expandedAudioSemBloco, setExpandedAudioSemBloco] = useState(true);

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

  // Load messages from local database only (webhook handles new messages)
  const loadMessages = async (forceScrollOnLoad = false) => {
    const previousLength = messages.length;
    if (previousLength === 0) {
      setIsLoadingMessages(true);
    }

    try {
      console.log('[ChatWindow] Loading messages for chat.id:', chat.id, 'chat.chat_id:', chat.chat_id);
      
      const { data: dbMessages, error } = await supabase
        .from('whatsapp_messages')
        .select('*')
        .eq('chat_id', chat.id)
        .order('timestamp', { ascending: true });

      if (error) {
        console.error('[ChatWindow] Error loading messages:', error);
        throw error;
      }

      console.log('[ChatWindow] Found', dbMessages?.length || 0, 'messages in database');

      const formattedMessages = (dbMessages || []).map(msg => ({
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
        // Real Facebook API names
        fb_ad_id: msg.fb_ad_id,
        fb_campaign_name: msg.fb_campaign_name,
        fb_adset_name: msg.fb_adset_name,
        fb_ad_name: msg.fb_ad_name,
      }));

      setMessages(formattedMessages);

      const shouldScroll = forceScrollOnLoad || previousLength === 0 || formattedMessages.length > previousLength;
      if (shouldScroll) {
        setShouldScrollToBottom(true);
      }

      // Only trigger background API sync if we have ZERO messages and this is a fresh load
      // This avoids slow calls that block the UI
      if (formattedMessages.length === 0 && previousLength === 0 && chat.chat_id) {
        console.log('[ChatWindow] No local messages, triggering background API sync...');
        // Don't await - let it run in background
        syncMessagesFromApiSilent();
      }
    } catch (error: any) {
      console.error('Error loading messages:', error);
      // Don't show toast for network errors on initial load - the sync will retry
      const isNetworkError = error.message?.includes('Failed to fetch') || 
                             error.message?.includes('NetworkError');
      if (!isNetworkError) {
        toast.error(error.message || 'Erro ao carregar mensagens');
      }
    } finally {
      setIsLoadingMessages(false);
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

  // Background sync with UAZapi (silent, catches missed webhook messages)
  const syncMessagesFromApiSilent = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await invokeWithRetry('uazapi-get-messages', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { chatid: chat.chat_id }
      }, 2); // 2 retries for silent sync

      const incoming = response.data.messages || [];
      if (incoming.length > messages.length) {
        setMessages(mergeMessagesPreservingAttribution(incoming));
        setShouldScrollToBottom(true);
      }
    } catch (error: any) {
      // Silent fail for background sync - don't bother user
      console.error('Background sync error (silent):', error.message);
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

      const response = await invokeWithRetry('uazapi-get-messages', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { chatid: chat.chat_id }
      }, 3); // 3 retries for manual sync

      const incoming = response.data.messages || [];
      setMessages(mergeMessagesPreservingAttribution(incoming));
      setShouldScrollToBottom(true);
      toast.success('Mensagens sincronizadas');
    } catch (error: any) {
      console.error('Error syncing messages:', error);
      const isNetworkError = error.message?.includes('Failed to fetch') || 
                             error.message?.includes('NetworkError');
      if (isNetworkError) {
        toast.error('Conexão instável. Tente novamente em alguns segundos.');
      } else {
        toast.error('Erro ao sincronizar mensagens.');
      }
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
      if (response.error) throw response.error;
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
      
      // Buscar todos os leads para comparar pelos últimos 8 dígitos
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, status, telefone')
        .is('deleted_at', null);
      
      // Encontrar lead pelos últimos 8 dígitos
      const lead = allLeads?.find(l => getLast8Digits(l.telefone) === last8Digits);
      
      if (lead) {
        setLeadId(lead.id);
        
        // Verificar se o lead tem algum agendamento
        const { data: agendamentos } = await supabase
          .from('agendamentos')
          .select('id')
          .eq('cliente_id', lead.id)
          .limit(1);
        
        // Se tem agendamento, considerar como cliente
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

  // Reset edited name when chat changes
  useEffect(() => {
    setEditedName(chat.contact_name);
    setIsEditingName(false);
  }, [chat.id, chat.contact_name]);

  // Salvar nome do contato (atualiza whatsapp_chats e leads)
  const handleSaveName = async () => {
    if (!editedName.trim() || editedName === chat.contact_name) {
      setIsEditingName(false);
      setEditedName(chat.contact_name);
      return;
    }

    setIsSavingName(true);
    try {
      const last8Digits = getLast8Digits(chat.contact_number);

      // 1) Update whatsapp_chats
      if (isUuid(chat.id)) {
        await supabase
          .from('whatsapp_chats')
          .update({ contact_name: editedName.trim() })
          .eq('id', chat.id);
      }

      // 2) Update leads table (find by last 8 digits)
      const { data: leads } = await supabase
        .from('leads')
        .select('id, telefone')
        .is('deleted_at', null);

      if (leads) {
        const matchingLeads = leads.filter(
          (lead) => getLast8Digits(lead.telefone) === last8Digits
        );

        for (const lead of matchingLeads) {
          await supabase
            .from('leads')
            .update({ nome: editedName.trim() })
            .eq('id', lead.id);
        }
      }

      // 3) Invalidate queries so UI updates everywhere
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-chats"] });
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["faturas"] });

      // 4) Notify parent to update local state
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
    
    // Background sync to catch any messages missed by webhook
    syncMessagesFromApiSilent();
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
          setMessages(prev => [...prev, newMsg]);
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
      let nomeParaUsar = chat.contact_name;
      
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

            if (clienteExistente) {
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
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground truncate">
                {formatPhoneForDisplay(chat.contact_number)}
              </p>
              <CampaignAttributionBadge contactNumber={chat.contact_number} />
            </div>
          </div>
        </div>
        {/* Ícones fixos à direita */}
        <div className="flex gap-1 flex-shrink-0 items-center">
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
                    <MessageBubble message={msg} />
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
                              open={expandedTextBlocos[bloco.id] !== false}
                              onOpenChange={() => setExpandedTextBlocos(prev => ({ ...prev, [bloco.id]: !prev[bloco.id] }))}
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {bloco.titulo} ({mensagensDoBloco.length})
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedTextBlocos[bloco.id] !== false ? 'rotate-180' : ''}`} />
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
                              open={expandedAudioBlocos[bloco.id] !== false}
                              onOpenChange={() => setExpandedAudioBlocos(prev => ({ ...prev, [bloco.id]: !prev[bloco.id] }))}
                            >
                              <CollapsibleTrigger className="flex items-center justify-between w-full px-2 py-1.5 rounded hover:bg-muted/50 transition-colors">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  {bloco.titulo} ({audiosDoBloco.length})
                                </span>
                                <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expandedAudioBlocos[bloco.id] !== false ? 'rotate-180' : ''}`} />
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