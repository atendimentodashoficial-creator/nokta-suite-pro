import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useSearchParams } from "react-router-dom";
import { MessageSquare, RefreshCw, Plus, Trash2, CheckSquare, X, Send, Megaphone, List, Kanban, Phone, FileText, ListFilter, QrCode, Loader2, Smartphone, Unplug, Settings, Pencil, Keyboard, XCircle, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DisparosChatWindow } from "@/components/disparos/DisparosChatWindow";
import { DisparosKanban } from "@/components/disparos/DisparosKanban";
import { NovaCampanhaDialog } from "@/components/disparos/NovaCampanhaDialog";
import { CompararListasDialog } from "@/components/disparos/CompararListasDialog";
import { CampanhasTab } from "@/components/disparos/CampanhasTab";
import { TemplatesTab } from "@/components/disparos/TemplatesTab";
import { ListasImportadasManager } from "@/components/disparos/ListasImportadasManager";
import { ChatAvatar } from "@/components/whatsapp/ChatAvatar";
import { formatPhoneNumber, formatRelativeTime, truncateText, getInitials, normalizePhoneNumber, getLast8Digits, formatLastMessagePreview } from "@/utils/whatsapp";
import { CONTACT_NAME_UPDATED_EVENT } from "@/utils/syncContactName";
import { formatPhoneByCountry, getPhonePlaceholder, stripCountryCode } from "@/utils/phoneFormat";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { useTabPersistence } from "@/hooks/useTabPersistence";

interface DisparosInstancia {
  id: string;
  nome: string;
  base_url?: string;
  api_key?: string;
  is_active?: boolean;
}

export default function Disparos() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useTabPersistence("tab", "conversas");
  const [viewMode, setViewMode] = useTabPersistence("view", "list");
  const [chats, setChats] = useState<any[]>([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [filteredChats, setFilteredChats] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [showChatWindow, setShowChatWindow] = useState(false);
  const [newChatNumber, setNewChatNumber] = useState("");
  const [newChatCountryCode, setNewChatCountryCode] = useState("55");
  const [hasConfig, setHasConfig] = useState(false);
  const [novaCampanhaOpen, setNovaCampanhaOpen] = useState(false);
  const [compararListasOpen, setCompararListasOpen] = useState(false);

  // Selection state for bulk delete
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [instanciasMap, setInstanciasMap] = useState<Record<string, DisparosInstancia>>({});
  const [instanciasList, setInstanciasList] = useState<DisparosInstancia[]>([]);
  const [selectedInstanciaId, setSelectedInstanciaId] = useState<string>("");
  const [filterInstanciaId, setFilterInstanciaId] = useState<string>("all");
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const deepLinkHandledRef = useRef(false);

  // Instance management state
  const [fullInstancias, setFullInstancias] = useState<DisparosInstancia[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'loading'>>({});
  const [isCreatingInstance, setIsCreatingInstance] = useState(false);

  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [selectedQrInstancia, setSelectedQrInstancia] = useState<DisparosInstancia | null>(null);
  const [qrPollingInterval, setQrPollingInterval] = useState<NodeJS.Timeout | null>(null);

  const [showInstanceManager, setShowInstanceManager] = useState(false);

  // Create instance (name only)
  const [createInstanceDialogOpen, setCreateInstanceDialogOpen] = useState(false);
  const [newInstanciaNome, setNewInstanciaNome] = useState("");

  // Edit instance name
  const [editInstanceNameOpen, setEditInstanceNameOpen] = useState(false);
  const [editingInstancia, setEditingInstancia] = useState<DisparosInstancia | null>(null);
  const [editingNome, setEditingNome] = useState("");
  const [savingEditName, setSavingEditName] = useState(false);

  // Connection method options for dialogs
  const [createConnectionType, setCreateConnectionType] = useState<"qrcode" | "manual">("qrcode");
  
  // Manual connection fields
  const [manualBaseUrl, setManualBaseUrl] = useState("");
  const [manualApiKey, setManualApiKey] = useState("");
  const getChatLast8 = (chat: any) => {
    const candidates = [chat?.contact_number, chat?.normalized_number, chat?.chat_id].filter(Boolean);
    for (const c of candidates) {
      const last8 = getLast8Digits(String(c));
      if (last8) return last8;
    }
    return '';
  };

  // Build unique key: instancia_id + last8 digits (keep chats from different instances separate)
  const getChatDedupeKey = (chat: any) => {
    const last8 = getChatLast8(chat);
    const instanciaId = chat?.instancia_id || 'legacy';
    return `${instanciaId}:${last8}`;
  };

  const dedupeChatsByInstanceAndPhone = (rows: any[]) => {
    const sorted = [...rows].sort((a, b) => {
      const ta = new Date(a.updated_at || a.last_message_time || 0).getTime();
      const tb = new Date(b.updated_at || b.last_message_time || 0).getTime();
      return tb - ta;
    });
    const seen = new Set<string>();
    const out: any[] = [];
    for (const chat of sorted) {
      const key = getChatDedupeKey(chat);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(chat);
    }
    return out.sort((a, b) => {
      const ta = new Date(a.last_message_time || 0).getTime();
      const tb = new Date(b.last_message_time || 0).getTime();
      return tb - ta;
    });
  };

  // Load chats from database (excluding deleted ones)
  // Only show chats with messages AFTER any instance was created (avoid old conversations)
  const loadChats = async (): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('disparos_chats')
        .select('*')
        .is('deleted_at', null)
        .order('last_message_time', { ascending: false, nullsFirst: false })
        .limit(1000); // Ensure we don't hit query limits
        
      if (error) throw error;
      const deduped = dedupeChatsByInstanceAndPhone(data || []);

      // Filter: only show chats where the message time (or creation) is after the instance was created
      // This prevents showing old conversations that existed before Disparos was configured
      const visible = deduped.filter((chat) => {
        // Get the instance creation date for this chat's instance
        const instancia = instanciasMap[chat.instancia_id];
        if (!instancia) return true; // If no instance info, show chat
        
        const instanciaCreatedAt = (instancia as any).created_at;
        if (!instanciaCreatedAt) return true; // If no creation date, show chat
        
        const instanciaCreatedMs = new Date(instanciaCreatedAt).getTime();
        if (!Number.isFinite(instanciaCreatedMs)) return true;
        
        const chatTime = Math.max(
          chat.last_message_time ? new Date(chat.last_message_time).getTime() : 0,
          chat.created_at ? new Date(chat.created_at).getTime() : 0
        );
        
        return chatTime >= instanciaCreatedMs;
      });

      setChats(visible);
      setFilteredChats(visible);
      setChatsLoaded(true);
      return visible;
    } catch (error: any) {
      console.error('Error loading disparos chats:', error);
      toast.error('Erro ao carregar chats de disparos');
      setChatsLoaded(true);
      return [];
    }
  };

  // Check if user has Disparos config (check instancias first, fallback to config)
  const checkConfig = async () => {
    try {
      // First, get the main WhatsApp instance ID to exclude it
      const { data: uazapiConfig } = await supabase
        .from("uazapi_config")
        .select("whatsapp_instancia_id")
        .maybeSingle();
      
      const mainWhatsappId = uazapiConfig?.whatsapp_instancia_id || null;
      
      // Check for instances in disparos_instancias (excluding main WhatsApp)
      // Don't filter by is_active - all instances should be visible in manager
      let query = supabase
        .from('disparos_instancias')
        .select('id');
      
      // Exclude the main WhatsApp instance
      if (mainWhatsappId) {
        query = query.neq('id', mainWhatsappId);
      }
      
      const { data: instancias, error: instError } = await query.limit(1);
      
      setHasConfig(!instError && instancias && instancias.length > 0);
    } catch {
      setHasConfig(false);
    }
  };

  // Sync chats from UAZapi (Disparos instance)
  const syncChats = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false;

    // Prevent overlapping syncs (interval + manual click)
    if (isSyncing) return;

    if (!hasConfig) {
      if (!silent) toast.error('Nenhuma instância conectada. Crie uma instância e escaneie o QR Code.');
      return;
    }

    setIsSyncing(true);
    try {
      // Force refresh session before calling edge function to ensure valid token
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      
      // If refresh fails, try getSession as fallback
      let session = refreshData?.session;
      if (refreshError || !session) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !sessionData?.session) {
          if (!silent) {
            toast.error('Sua sessão expirou. Faça login novamente.');
            setTimeout(() => (window.location.href = '/auth'), 2000);
          }
          return;
        }
        session = sessionData.session;
      }

      // Use a timeout to prevent the UI from hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second total timeout

      try {
        const response = await supabase.functions.invoke('disparos-get-chats', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        clearTimeout(timeoutId);

        if (response.error) {
          const anyErr: any = response.error;
          let detailedMessage = response.error.message;
          try {
            const resp: Response | undefined = anyErr?.context?.response;
            if (resp) {
              const text = await resp.text();
              if (text) {
                try {
                  const parsed = JSON.parse(text);
                  detailedMessage = parsed?.error || parsed?.message || detailedMessage;
                } catch {
                  detailedMessage = text;
                }
              }
            }
          } catch {}
          
          // Log error but still load cached chats from database
          console.log('Sync error (loading cached data):', detailedMessage);
          if (!silent) {
            toast.warning('Sincronização parcial - carregando dados do cache');
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        // Handle all fetch errors gracefully - the cache fallback will still work
        if (fetchError.name === 'AbortError') {
          console.log('Sync timeout - loading cached data');
          if (!silent) {
            toast.warning('Sincronização demorou muito - carregando dados do cache');
          }
        } else {
          // Network errors (Failed to fetch) are expected when external API is slow/unavailable
          // Just log quietly and let the cache fallback handle it
          console.log('Sync fetch error (using cached data):', fetchError.message || 'Network error');
        }
      }

      // Always load chats from database (even if sync failed, show cached data)
      await loadChats();
      // With webhook configured, real-time updates handle message arrival.
      // This sync is just a fallback to catch any missed data.
    } catch (error: any) {
      console.log('Sync error (using cache):', error.message || error);
      // Don't show error toast for expected network failures, just use cache silently
      // Still try to load cached chats on error
      await loadChats();
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter chats by search term and instance
  useEffect(() => {
    let filtered = chats;
    
    // Filter by instance
    if (filterInstanciaId && filterInstanciaId !== "all") {
      filtered = filtered.filter(chat => chat.instancia_id === filterInstanciaId);
    }
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const normalizedTerm = normalizePhoneNumber(term);
      filtered = filtered.filter(chat => {
        const matchName = chat.contact_name.toLowerCase().includes(term);
        const matchNumber = chat.contact_number.includes(term);
        const matchNormalized = normalizedTerm.length > 0 && 
          normalizePhoneNumber(chat.contact_number).includes(normalizedTerm);
        return matchName || matchNumber || matchNormalized;
      });
    }

    // Filter by unread
    if (filterUnreadOnly) {
      filtered = filtered.filter(chat => (chat.unread_count || 0) > 0);
    }
    
    setFilteredChats(filtered);
  }, [searchTerm, chats, filterInstanciaId, filterUnreadOnly]);

  // Load instancias (just load data, don't auto-check connection status)
  // IMPORTANT: Exclude the main WhatsApp instance (linked via uazapi_config.whatsapp_instancia_id)
  const loadInstancias = async () => {
    try {
      // First, get the main WhatsApp instance ID to exclude it
      const { data: uazapiConfig } = await supabase
        .from("uazapi_config")
        .select("whatsapp_instancia_id")
        .maybeSingle();
      
      const mainWhatsappId = uazapiConfig?.whatsapp_instancia_id || null;
      
      // Load ALL instances (regardless of is_active) to ensure visibility in manager
      // Only the main WhatsApp instance is filtered out
      const { data } = await supabase
        .from("disparos_instancias")
        .select("*");
      
      if (data) {
        // Filter out the main WhatsApp instance - it should only appear in the WhatsApp tab
        const filteredInstancias = mainWhatsappId 
          ? data.filter(inst => inst.id !== mainWhatsappId)
          : data;
        
        const map: Record<string, DisparosInstancia> = {};
        filteredInstancias.forEach(inst => {
          map[inst.id] = inst;
        });
        setInstanciasMap(map);
        setInstanciasList(filteredInstancias);
        setFullInstancias(filteredInstancias);
        // Set default selection to first instance
        if (filteredInstancias.length > 0 && !selectedInstanciaId) {
          setSelectedInstanciaId(filteredInstancias[0].id);
        }
        // DON'T auto-check connection status - only check when user opens manager
      }
    } catch (error) {
      console.error("Error loading instancias:", error);
    }
  };

  // Check connection status of an instance (lightweight - avoids /chat/find during pairing)
  const checkConnectionStatus = async (instancia: DisparosInstancia) => {
    if (!instancia.base_url || !instancia.api_key) return;
    setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'loading' }));

    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("uazapi-check-status", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: instancia.base_url, api_key: instancia.api_key },
      });

      const isConnected = response.data?.status === "connected";
      setConnectionStatus(prev => ({
        ...prev,
        [instancia.id]: isConnected ? 'connected' : 'disconnected'
      }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'disconnected' }));
    }
  };

  // Create new instance and get QR code (only after user requests)
  const handleCreateAndConnect = async (instanceName: string) => {
    const name = instanceName.trim();
    if (!name) {
      toast.error("Informe um nome para a instância");
      return;
    }

    setIsCreatingInstance(true);
    try {
      const { data: session } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("uazapi-admin-create-instance", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { instance_name: name },
      });

      if (!response.data?.success) {
        throw new Error(response.data?.error || "Erro ao criar instância");
      }

      toast.success("Instância criada!");
      setCreateInstanceDialogOpen(false);
      setNewInstanciaNome("");

      await loadInstancias();
      checkConfig();

      // Always show QR flow (connection only happens after QR scan)
      if (response.data?.qrcode) {
        setQrCodeData(response.data.qrcode);
        setSelectedQrInstancia(response.data.instance);
        setQrCodeDialogOpen(true);
        startQrPolling(response.data.instance);
      } else if (response.data?.instance) {
        // No QR yet, fetch it
        handleConnectInstance(response.data.instance);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar instância");
    } finally {
      setIsCreatingInstance(false);
    }
  };

  // Connect existing instance (get QR code)
  const handleConnectInstance = async (instancia: DisparosInstancia) => {
    if (!instancia.base_url || !instancia.api_key) {
      toast.error("Instância sem configuração");
      return;
    }
    setSelectedQrInstancia(instancia);
    setQrCodeDialogOpen(true);
    setQrCodeLoading(true);
    setQrCodeData(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: instancia.base_url, api_key: instancia.api_key },
      });

      if (response.data?.connected) {
        toast.success("WhatsApp já está conectado!");
        setQrCodeDialogOpen(false);
        setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'connected' }));
        return;
      }

      if (response.data?.qrcode) {
        setQrCodeData(response.data.qrcode);
        startQrPolling(instancia);
      } else {
        toast.error(response.data?.error || "Não foi possível obter o QR Code");
      }
    } catch {
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrCodeLoading(false);
    }
  };

  // Start polling to check if connected (lightweight - avoids pairing interference)
  const startQrPolling = (instancia: DisparosInstancia) => {
    if (qrPollingInterval) clearInterval(qrPollingInterval);
    if (!instancia.base_url || !instancia.api_key) return;

    // Avoid /chat/find during pairing - it can cause WhatsApp to reject/log out
    let pollCount = 0;
    const minPollsBeforeConnect = 3;
    let confirmedCount = 0;
    const requiredConfirmations = 2;
    const pollInterval = 8000;

    const initialDelay = 12000;

    let interval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      interval = setInterval(async () => {
        pollCount++;
        try {
          const { data: session } = await supabase.auth.getSession();
          const response = await supabase.functions.invoke("uazapi-check-status", {
            headers: { Authorization: `Bearer ${session.session?.access_token}` },
            body: { base_url: instancia.base_url, api_key: instancia.api_key },
          });

          const apiStatus = response.data?.status;
          const strongSignal = apiStatus === "connected";

          console.log("[Disparos QR Poll]", {
            pollCount,
            confirmedCount,
            apiStatus,
            data: response.data,
          });

          if (pollCount < minPollsBeforeConnect) return;

          if (strongSignal) confirmedCount++;
          else confirmedCount = 0;

          if (confirmedCount >= requiredConfirmations) {
            if (interval) clearInterval(interval);
            setQrPollingInterval(null);
            setQrCodeDialogOpen(false);
            setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'connected' }));
            toast.success("WhatsApp conectado!");

            // Configure webhook after successful connection
            const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/${user?.id}/${instancia.id}`;
            const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
              headers: { Authorization: `Bearer ${session.session?.access_token}` },
              body: {
                base_url: instancia.base_url,
                api_key: instancia.api_key,
                webhook_url: webhookUrl,
                instancia_id: instancia.id,
              },
            });

            if (webhookResponse.data?.success) {
              toast.success("Webhook configurado automaticamente!");
            } else {
              console.error("Webhook config failed:", webhookResponse.data);
              toast.warning("Webhook não foi configurado. Configure manualmente em 'Gerenciar Instâncias'.");
            }

            loadInstancias();
            checkConfig();
          }
        } catch (error) {
          console.error("[Disparos QR Poll] Error:", error);
        }
      }, pollInterval);

      setQrPollingInterval(interval);
    };

    setTimeout(startPolling, initialDelay);

    // Timeout after 3 minutes
    setTimeout(() => {
      if (interval) clearInterval(interval);
      setQrPollingInterval(null);
    }, 180000);
  };

  // Disconnect instance
  const handleDisconnectInstance = async (instancia: DisparosInstancia) => {
    if (!instancia.base_url || !instancia.api_key) return;
    setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'loading' }));
    
    try {
      const { data: session } = await supabase.auth.getSession();
      
      // Use edge function to disconnect
      const response = await supabase.functions.invoke("uazapi-disconnect-instance", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: instancia.base_url, api_key: instancia.api_key },
      });

      if (response.data?.success) {
        toast.success("WhatsApp desconectado!");
        setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'disconnected' }));
      } else {
        toast.error(response.data?.error || "Erro ao desconectar");
        // Recheck actual status
        checkConnectionStatus(instancia);
      }
    } catch (error) {
      console.error("Disconnect error:", error);
      toast.error("Erro ao desconectar");
      checkConnectionStatus(instancia);
    }
  };


  // Delete instance (also delete from UAZapi via admin API)
  const handleDeleteInstance = async (id: string) => {
    try {
      // Get instance data before deleting
      const instancia = fullInstancias.find(i => i.id === id);
      
      // Call UAZapi admin to delete the instance completely
      if (instancia) {
        try {
          const { data: session } = await supabase.auth.getSession();
          await supabase.functions.invoke("uazapi-admin-delete-instance", {
            headers: { Authorization: `Bearer ${session.session?.access_token}` },
            body: {
              instance_name: instancia.nome || instancia.id,
              base_url: instancia.base_url,
              api_key: instancia.api_key,
            },
          });
        } catch (e) {
          console.log("UAZapi admin delete call failed:", e);
        }
      }

      // Delete from database
      const { error } = await supabase.from("disparos_instancias").delete().eq("id", id);
      if (error) throw error;
      
      toast.success("Instância removida!");
      loadInstancias();
      checkConfig();
    } catch {
      toast.error("Erro ao remover");
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollingInterval) clearInterval(qrPollingInterval);
    };
  }, [qrPollingInterval]);

  // Load chats and config on mount
  // Strategy: load cached chats from DB first (instant), then sync with external API in background
  useEffect(() => {
    (async () => {
      // Run config + instancias in parallel for faster startup
      await Promise.all([checkConfig(), loadInstancias()]);
      // Load cached chats immediately (DB query, very fast)
      await loadChats();
      // Sync with external API in background (doesn't block UI)
      syncChats({ silent: true });
    })();
  }, []);

  // Listen for contact name updates from other components (e.g., EditarClienteDialog)
  useEffect(() => {
    const handleContactNameUpdated = async () => {
      // Reload chats to get updated names
      const updatedChats = await loadChats();
      
      // Also update the selected chat if it exists
      if (selectedChat && updatedChats) {
        const updatedSelectedChat = updatedChats.find(c => c.id === selectedChat.id);
        if (updatedSelectedChat) {
          setSelectedChat(updatedSelectedChat);
        }
      }
    };

    window.addEventListener(CONTACT_NAME_UPDATED_EVENT, handleContactNameUpdated);
    return () => {
      window.removeEventListener(CONTACT_NAME_UPDATED_EVENT, handleContactNameUpdated);
    };
  }, [selectedChat]);

  // Deep-link support: /disparos?chat=PHONE[&instancia_nome=NAME][&prefill=MESSAGE]
  useEffect(() => {
    const chatParam = searchParams.get("chat");
    const prefillParam = searchParams.get("prefill");
    if (!chatParam) return;
    if (!chatsLoaded) return;
    if (deepLinkHandledRef.current) return;

    // Set prefill message if provided
    if (prefillParam) {
      setPrefillMessage(prefillParam);
    }

    const targetLast8 = getLast8Digits(chatParam);
    const instanciaNomeParam = searchParams.get("instancia_nome");

    const match = chats.find((c) => {
      const cLast8 = getChatLast8(c);
      if (!targetLast8 || !cLast8 || cLast8 !== targetLast8) return false;
      if (!instanciaNomeParam) return true;
      return String(c?.instancia_nome || "") === String(instanciaNomeParam);
    });

    if (match) {
      deepLinkHandledRef.current = true;
      setActiveTab("conversas");
      setViewMode("list");
      if (match.instancia_id) setFilterInstanciaId(match.instancia_id);
      handleChatSelect(match);
    }
  }, [searchParams, chatsLoaded, chats]);

  // Manual sync only - no automatic interval or focus sync
  // User can trigger sync via refresh button when needed

  // Realtime updates (batched to avoid flickering while instances sync)
  useEffect(() => {
    if (!user?.id) return;

    const pendingRef = { current: new Map<string, any>() };
    let flushTimer: number | null = null;

    const flush = () => {
      flushTimer = null;
      const updates = Array.from(pendingRef.current.values());
      pendingRef.current.clear();
      if (updates.length === 0) return;

      setChats((prev) => {
        const prevById = new Map(prev.map((c) => [c.id, c]));
        for (const u of updates) {
          // If chat was soft-deleted, remove it from local state immediately
          if (u?.deleted_at) {
            prevById.delete(u.id);
            continue;
          }
          // Only update if the incoming data is newer (based on updated_at or last_message_time)
          const existing = prevById.get(u.id);
          if (existing) {
            const existingTime = new Date(existing.last_message_time || existing.updated_at || 0).getTime();
            const incomingTime = new Date(u.last_message_time || u.updated_at || 0).getTime();
            // Skip if incoming data is older or same
            if (incomingTime < existingTime) continue;
          }
          prevById.set(u.id, { ...(existing || {}), ...u });
        }
        return dedupeChatsByInstanceAndPhone(Array.from(prevById.values()));
      });

      setSelectedChat((prev) => {
        if (!prev?.id) return prev;
        const updated = updates.find((u) => u.id === prev.id);
        // If the currently open chat was deleted, close it
        if (updated?.deleted_at) {
          setShowChatWindow(false);
          return null;
        }
        return updated ? { ...prev, ...updated } : prev;
      });
    };

    const scheduleFlush = () => {
      // Reset timer on each new update to batch rapid updates together
      if (flushTimer != null) {
        window.clearTimeout(flushTimer);
      }
      // Debounce to 200ms for faster mobile updates
      flushTimer = window.setTimeout(flush, 200);
    };

    // Flush immediately when tab becomes visible (mobile browsers pause timers in background)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && pendingRef.current.size > 0) {
        if (flushTimer != null) window.clearTimeout(flushTimer);
        flush();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const channel = supabase
      .channel("disparos-chats-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "disparos_chats",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const inserted = (payload as any).new as any;
          if (!inserted?.id) return;
          pendingRef.current.set(inserted.id, inserted);
          scheduleFlush();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "disparos_chats",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          if (!updated?.id) return;
          pendingRef.current.set(updated.id, updated);
          scheduleFlush();
        }
      )
      .subscribe();

    return () => {
      if (flushTimer != null) window.clearTimeout(flushTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // Clear unread count and lock provider baseline to prevent badge from reappearing
  const clearUnreadCount = async (chatId: string) => {
    if (!chatId || chatId === "temp") return;
    try {
      // First, get the current provider_unread_count to set as baseline
      const chatToUpdate = chats.find(c => c.id === chatId);
      const currentProviderUnread = chatToUpdate?.provider_unread_count ?? 0;
      
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('disparos_chats')
        .update({ 
          unread_count: 0, 
          last_read_at: now,
          // Lock baseline to current provider count so next sync won't show badge
          provider_unread_baseline: currentProviderUnread
        })
        .eq('id', chatId);
      if (error) throw error;
      
      const updates = { 
        unread_count: 0, 
        last_read_at: now, 
        provider_unread_baseline: currentProviderUnread 
      };
      setChats(prev => prev.map(c => c.id === chatId ? { ...c, ...updates } : c));
      setSelectedChat(prev => prev?.id === chatId ? { ...prev, ...updates } : prev);
    } catch (error) {
      console.error('Error clearing unread count:', error);
    }
  };

  const handleChatSelect = async (chat: any) => {
    setSelectedChat(chat);
    setShowChatWindow(true);
    await clearUnreadCount(chat.id);
    if (isSelectionMode) {
      setIsSelectionMode(false);
      setSelectedChatIds(new Set());
    }
  };

  const handleChatUpdated = (updatedChat: any) => {
    setSelectedChat(updatedChat);
    setChats(prev => dedupeChatsByInstanceAndPhone(prev.map(c => c.id === updatedChat.id ? updatedChat : c)));
  };

  const handleBack = () => {
    setShowChatWindow(false);
    setSelectedChat(null);
  };

  // Bulk selection handlers
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedChatIds(new Set());
  };

  const toggleChatSelection = (chatId: string) => {
    setSelectedChatIds(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) next.delete(chatId);
      else next.add(chatId);
      return next;
    });
  };

  const selectAllChats = () => {
    setSelectedChatIds(new Set(filteredChats.map(c => c.id)));
  };

  const deselectAllChats = () => {
    setSelectedChatIds(new Set());
  };

  const handleBulkDelete = async () => {
    if (selectedChatIds.size === 0) return;

    setIsDeleting(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        toast.error('Sua sessão expirou. Faça login novamente.');
        setTimeout(() => (window.location.href = '/auth'), 1500);
        return;
      }

      const ids = Array.from(selectedChatIds);

      // Avoid huge URLs (PostgREST .in(...) can exceed limits). Use backend function + chunking.
      const chunkArray = <T,>(arr: T[], size: number) => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const BATCH_SIZE = 50;
      const batches = chunkArray(ids, BATCH_SIZE);

      let deletedTotal = 0;
      for (const batch of batches) {
        const resp = await supabase.functions.invoke('disparos-delete-chat', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: { chat_ids: batch },
        });

        if (resp.error) throw resp.error;
        deletedTotal += (resp.data as any)?.deleted ?? batch.length;
      }

      setChats((prev) => prev.filter((c) => !selectedChatIds.has(c.id)));
      setFilteredChats((prev) => prev.filter((c) => !selectedChatIds.has(c.id)));
      toast.success(`${deletedTotal} chat(s) excluído(s)`);

      setSelectedChatIds(new Set());
      setIsSelectionMode(false);
      loadChats();
    } catch (error: any) {
      console.error('Error deleting chats:', error);
      toast.error(error.message || 'Erro ao excluir chats');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  // Create new chat
  const createNewChat = async () => {
    if (!newChatNumber.trim()) {
      toast.error('Digite um número de telefone');
      return;
    }
    if (!selectedInstanciaId) {
      toast.error('Selecione uma instância');
      return;
    }
    const normalizedDigits = normalizePhoneNumber(newChatNumber);
    if (!normalizedDigits || normalizedDigits.length < 8) {
      toast.error('Número inválido');
      return;
    }
    // Use selected country code
    const normalizedBr = `${newChatCountryCode}${normalizedDigits}`;
    const expectedChatId = `${normalizedBr}@s.whatsapp.net`;
    const last8Digits = getLast8Digits(newChatNumber);

    // Check if chat exists for same instance + phone
    const existingChat = chats.find(c => 
      c.instancia_id === selectedInstanciaId &&
      (getLast8Digits(c.contact_number) === last8Digits ||
       getLast8Digits(c.normalized_number) === last8Digits)
    );
    if (existingChat) {
      handleChatSelect(existingChat);
      setNewChatNumber('');
      return;
    }

    const selectedInstancia = instanciasMap[selectedInstanciaId];

    // Create new chat
    try {
      // Check if there's a tombstone for this chat (was previously deleted)
      const phoneLast8 = last8Digits;
      const { data: tombstone } = await supabase
        .from('disparos_chat_deletions')
        .select('deleted_at')
        .eq('user_id', user?.id)
        .eq('instancia_id', selectedInstanciaId)
        .eq('phone_last8', phoneLast8)
        .maybeSingle();

      // If there was a tombstone, set history_cleared_at to that time
      const historyClearedAt = tombstone?.deleted_at || null;

      // Remove the tombstone if it exists
      if (tombstone) {
        await supabase
          .from('disparos_chat_deletions')
          .delete()
          .eq('user_id', user?.id)
          .eq('instancia_id', selectedInstanciaId)
          .eq('phone_last8', phoneLast8);
      }

      const { data: created, error } = await supabase
        .from('disparos_chats')
        .insert({
          user_id: user?.id,
          chat_id: expectedChatId,
          contact_name: formatPhoneNumber(newChatNumber),
          contact_number: newChatNumber,
          normalized_number: normalizedBr,
          unread_count: 0,
          instancia_id: selectedInstanciaId,
          instancia_nome: selectedInstancia?.nome || null,
          history_cleared_at: historyClearedAt
        })
        .select('*')
        .single();
      if (error) throw error;
      setChats(prev => dedupeChatsByInstanceAndPhone([created, ...prev]));
      handleChatSelect(created);
      setNewChatNumber('');
      setNewChatCountryCode('55');
      toast.success('Chat criado');
    } catch (error: any) {
      console.error('Error creating chat:', error);
      toast.error(error.message || 'Erro ao criar chat');
    }
  };

  // Determina se deve mostrar o header principal (esconde no mobile quando chat está aberto)
  const showMainHeader = !isMobile || !showChatWindow || !selectedChat;

  // No mobile com chat aberto, usa layout de tela cheia (igual ao WhatsApp)
  const isMobileChatOpen = isMobile && showChatWindow && selectedChat;

  return (
    <div
      className={`flex flex-col overflow-hidden -m-4 md:-m-6 p-4 md:p-6 ${
        isMobileChatOpen
          ? "fixed inset-0 z-40 bg-background pt-16"
          : "h-[calc(100vh-4rem)] md:h-screen"
      }`}
    >
      {/* Header - esconde no mobile quando chat está aberto */}
      {showMainHeader && (
        <div className="flex-shrink-0 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Send className="w-6 h-6" />
              <h1 className="text-2xl font-bold">Disparos</h1>
            </div>

            {/* Tabs inline */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="h-8">
                <TabsTrigger value="conversas" className="gap-1.5 text-xs px-3 h-7">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Conversas
                </TabsTrigger>
                <TabsTrigger value="campanhas" className="gap-1.5 text-xs px-3 h-7">
                  <Megaphone className="h-3.5 w-3.5" />
                  Campanhas
                </TabsTrigger>
                <TabsTrigger value="templates" className="gap-1.5 text-xs px-3 h-7">
                  <FileText className="h-3.5 w-3.5" />
                  Templates
                </TabsTrigger>
                <TabsTrigger value="listas" className="gap-1.5 text-xs px-3 h-7">
                  <List className="h-3.5 w-3.5" />
                  Listas
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {/* Content based on active tab */}
      {activeTab === "conversas" ? (
        <>
          {/* Search and actions for Conversas - esconde no mobile quando chat está aberto */}
          {showMainHeader && <div className="flex-shrink-0 border-b bg-card px-4 py-2">
            <div className="flex flex-col gap-2">
              {/* Actions row */}
              <div className="flex items-center gap-2 sm:h-auto h-9">
                {/* Search bar - inline on desktop */}
                <div className="hidden sm:block flex-1">
                  <Input
                    placeholder="Buscar por nome ou número..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-9"
                  />
                </div>
                
                {/* Instance filter */}
                {instanciasList.length > 0 && (
                  <Select 
                    value={filterInstanciaId} 
                    onValueChange={setFilterInstanciaId}
                    onOpenChange={(open) => {
                      if (open) {
                        // Check connection status for all instances when dropdown opens
                        instanciasList.forEach(inst => {
                          if (!connectionStatus[inst.id]) {
                            checkConnectionStatus(inst);
                          }
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-[140px] h-9">
                      <SelectValue placeholder="Instância" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {instanciasList.map((inst) => {
                        const status = connectionStatus[inst.id];
                        return (
                          <SelectItem key={inst.id} value={inst.id}>
                            <div className="flex items-center gap-2">
                              <span 
                                className={cn(
                                  "w-2 h-2 rounded-full flex-shrink-0",
                                  status === 'connected' ? "bg-green-500" :
                                  status === 'loading' ? "bg-yellow-500 animate-pulse" :
                                  status === 'disconnected' ? "bg-red-500" :
                                  "bg-muted-foreground/30"
                                )}
                              />
                              <span className="truncate">{inst.nome}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                
              
                {/* View mode toggle */}
                {!isMobile && (
                  <div className="flex items-center border rounded-lg overflow-hidden">
                    <Button
                      size="sm"
                      variant={viewMode === "list" ? "default" : "ghost"}
                      className="rounded-none h-8"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant={viewMode === "kanban" ? "default" : "ghost"}
                      className="rounded-none h-8"
                      onClick={() => setViewMode("kanban")}
                    >
                      <Kanban className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              
                {/* Unread filter button */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant={filterUnreadOnly ? "default" : "outline"}
                        className="h-9 w-9 p-0 flex-shrink-0"
                        onClick={() => setFilterUnreadOnly(prev => !prev)}
                      >
                        <BellRing className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {filterUnreadOnly ? "Mostrar todos os chats" : "Mostrar apenas não lidos"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                {/* New chat dialog */}
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Plus className="h-4 w-4" />
                      {!isMobile && "Nova"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Nova Conversa</DialogTitle>
                      <DialogDescription>
                        Selecione a instância e digite o número de telefone
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <Label>Instância</Label>
                        <Select value={selectedInstanciaId} onValueChange={setSelectedInstanciaId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a instância" />
                          </SelectTrigger>
                          <SelectContent>
                            {instanciasList.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Número de telefone</Label>
                        <CountryCodeSelect 
                          value={newChatCountryCode} 
                          onChange={setNewChatCountryCode}
                          phoneValue={formatPhoneByCountry(newChatNumber, newChatCountryCode)}
                          onPhoneChange={(val) => setNewChatNumber(stripCountryCode(val, newChatCountryCode))}
                          placeholder={getPhonePlaceholder(newChatCountryCode)}
                        />
                      </div>
                      <Button onClick={createNewChat} className="w-full" disabled={!selectedInstanciaId}>
                        Iniciar Conversa
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncChats()}
                  disabled={isSyncing || !hasConfig}
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>

                {viewMode === "list" && (
                  isSelectionMode ? (
                    <Button size="sm" variant="ghost" onClick={toggleSelectionMode}>
                      <X className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={toggleSelectionMode}>
                      <CheckSquare className="h-4 w-4" />
                    </Button>
                  )
                )}

                {/* Instance Manager button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowInstanceManager(true);
                    // Only check connection status when user opens the manager
                    fullInstancias.forEach(inst => checkConnectionStatus(inst));
                  }}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>

              {/* Search bar - full width on mobile, second row */}
              <div className="sm:hidden">
                <Input
                  placeholder="Buscar por nome ou número..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-9 w-full"
                />
              </div>

              {/* Selection actions */}
              {isSelectionMode && (
                <div className="flex items-center justify-between p-2 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={selectAllChats}>
                      {isMobile ? "Todos" : "Selecionar Todos"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={deselectAllChats}>
                      {isMobile ? "Desmarcar" : "Desmarcar Todos"}
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedChatIds.size}{!isMobile && " selecionado(s)"}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                      disabled={selectedChatIds.size === 0}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>}

          {/* Content based on view mode */}
          {isMobile ? (
            /* Layout Mobile */
            <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
              {/* Se há um chat selecionado, mostra o DisparosChatWindow em tela cheia (abaixo do header mobile) */}
              {showChatWindow && selectedChat ? (
                <div className="fixed top-16 left-0 right-0 bottom-0 z-50 bg-background flex flex-col">
                  <DisparosChatWindow
                    chat={selectedChat}
                    initialMessage={prefillMessage}
                    onBack={() => {
                      setSelectedChat(null);
                      setShowChatWindow(false);
                      setPrefillMessage(null);
                    }}
                    onChatUpdated={handleChatUpdated}
                    onChatDeleted={() => {
                      setSelectedChat(null);
                      setShowChatWindow(false);
                      setPrefillMessage(null);
                      loadChats();
                    }}
                    availableChats={chats}
                  />
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {!hasConfig ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <Send className="h-12 w-12 text-muted-foreground mb-4" />
                      <h2 className="text-lg font-medium mb-2">Conecte seu WhatsApp</h2>
                      <p className="text-muted-foreground mb-4">
                        Crie uma instância e escaneie o QR Code para começar
                      </p>
                      <div className="flex flex-col gap-2 w-full max-w-xs">
                        <Button onClick={() => setCreateInstanceDialogOpen(true)}>
                          <QrCode className="h-4 w-4 mr-2" />Criar Instância
                        </Button>
                      </div>
                    </div>
                  ) : filteredChats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                      <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                      <h2 className="text-lg font-medium mb-2">
                        {searchTerm ? 'Nenhum chat encontrado' : 'Nenhum chat ainda'}
                      </h2>
                      <p className="text-muted-foreground">
                        {searchTerm ? 'Tente buscar por outro termo' : 'Sincronize ou inicie uma nova conversa'}
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {filteredChats.map((chat) => (
                        <div
                          key={chat.id}
                          className={`flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                            selectedChat?.id === chat.id ? 'bg-muted' : ''
                          }`}
                          onClick={() => isSelectionMode ? toggleChatSelection(chat.id) : handleChatSelect(chat)}
                        >
                          {isSelectionMode && (
                            <div className="flex-shrink-0">
                              {selectedChatIds.has(chat.id) ? (
                                <CheckSquare className="h-5 w-5 text-primary" />
                              ) : (
                                <div className="h-5 w-5 border rounded" />
                              )}
                            </div>
                          )}
                          <ChatAvatar chat={chat} size="md" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="font-medium truncate">
                                  {chat.contact_name || formatPhoneNumber(chat.contact_number)}
                                </span>
                                {chat.instancia_id && instanciasMap[chat.instancia_id] && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Phone className="h-3 w-3" />
                                    {instanciasMap[chat.instancia_id].nome}
                                  </span>
                                )}
                              </div>
                              {chat.last_message_time && (
                                <span className="text-xs text-muted-foreground flex-shrink-0">
                                  {formatRelativeTime(chat.last_message_time)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className="text-sm text-muted-foreground truncate">
                                  {truncateText(formatLastMessagePreview(chat.last_message), 35)}
                                </span>
                              </div>
                              {(chat.unread_count || 0) > 0 && (
                                <Badge className="ml-2 h-5 min-w-[20px] px-1.5">
                                  {chat.unread_count}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : viewMode === "kanban" ? (
            /* Layout Desktop Kanban */
            <ResizablePanelGroup 
              key={showChatWindow && selectedChat ? "kanban-with-chat" : "kanban-no-chat"}
              direction="horizontal" 
              className="flex-1 min-h-0"
            >
              <ResizablePanel defaultSize={showChatWindow && selectedChat ? 65 : 100} minSize={30} className="min-h-0">
                {!hasConfig ? (
                  <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                    <Send className="h-12 w-12 text-muted-foreground mb-4" />
                    <h2 className="text-lg font-medium mb-2">Conecte seu WhatsApp</h2>
                    <p className="text-muted-foreground mb-4">
                      Crie uma instância e escaneie o QR Code para começar
                    </p>
                    <div className="flex flex-col gap-2 w-full max-w-xs">
                      <Button onClick={() => setCreateInstanceDialogOpen(true)}>
                        <QrCode className="h-4 w-4 mr-2" />Criar Instância
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col overflow-hidden min-h-0">
                    <DisparosKanban
                      chats={filteredChats}
                      onChatSelect={handleChatSelect}
                      selectedChatId={selectedChat?.id}
                      onChatsDeleted={({ ids, normalizedNumbers }) => {
                        setChats((prev) =>
                          prev.filter(
                            (c) => !ids.includes(c.id) && !normalizedNumbers.includes((c.normalized_number || '').toString())
                          )
                        );
                        setFilteredChats((prev) =>
                          prev.filter(
                            (c) => !ids.includes(c.id) && !normalizedNumbers.includes((c.normalized_number || '').toString())
                          )
                        );
                        if (
                          selectedChat?.id &&
                          (ids.includes(selectedChat.id) || normalizedNumbers.includes((selectedChat.normalized_number || '').toString()))
                        ) {
                          setSelectedChat(null);
                          setShowChatWindow(false);
                        }
                        loadChats();
                      }}
                    />
                  </div>
                )}
              </ResizablePanel>
              {showChatWindow && selectedChat && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={35} minSize={25} maxSize={60} className="min-h-0">
                    <div className="h-full flex flex-col overflow-hidden min-h-0">
                      <DisparosChatWindow
                        chat={selectedChat}
                        initialMessage={prefillMessage}
                        onBack={() => { handleBack(); setPrefillMessage(null); }}
                        onChatUpdated={handleChatUpdated}
                        onChatDeleted={() => {
                          setSelectedChat(null);
                          setShowChatWindow(false);
                          setPrefillMessage(null);
                          loadChats();
                        }}
                        availableChats={chats}
                      />
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          ) : (
            /* List View Desktop - Resizable (same layout as WhatsApp) */
            <ResizablePanelGroup direction="horizontal" className="flex-1">
              {/* Chat list */}
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <div className="h-full flex flex-col overflow-hidden border-r">
                  <div className="flex-1 overflow-y-auto">
                    {!hasConfig ? (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <Send className="h-12 w-12 text-muted-foreground mb-4" />
                        <h2 className="text-lg font-medium mb-2">Conecte seu WhatsApp</h2>
                        <p className="text-muted-foreground mb-4">
                          Crie uma instância e escaneie o QR Code para começar
                        </p>
                        <div className="flex flex-col gap-2 w-full max-w-xs">
                          <Button onClick={() => setCreateInstanceDialogOpen(true)}>
                            <QrCode className="h-4 w-4 mr-2" />Criar Instância
                          </Button>
                        </div>
                      </div>
                    ) : filteredChats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                        <h2 className="text-lg font-medium mb-2">
                          {searchTerm ? 'Nenhum chat encontrado' : 'Nenhum chat ainda'}
                        </h2>
                        <p className="text-muted-foreground">
                          {searchTerm ? 'Tente buscar por outro termo' : 'Sincronize ou inicie uma nova conversa'}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {filteredChats.map((chat) => (
                          <div
                            key={chat.id}
                            className={`flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                              selectedChat?.id === chat.id ? 'bg-muted' : ''
                            } ${selectedChatIds.has(chat.id) ? 'bg-accent/70' : ''}`}
                            onClick={() => isSelectionMode ? toggleChatSelection(chat.id) : handleChatSelect(chat)}
                          >
                            {isSelectionMode && (
                              <div className="flex-shrink-0">
                                {selectedChatIds.has(chat.id) ? (
                                  <CheckSquare className="h-5 w-5 text-primary" />
                                ) : (
                                  <div className="h-5 w-5 border rounded" />
                                )}
                              </div>
                            )}
                            <ChatAvatar chat={chat} size="md" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="font-medium truncate">
                                    {chat.contact_name || formatPhoneNumber(chat.contact_number)}
                                  </span>
                                  {(chat.instancia_nome || (chat.instancia_id && instanciasMap[chat.instancia_id]?.nome)) && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Phone className="h-3 w-3" />
                                      {chat.instancia_nome || instanciasMap[chat.instancia_id]?.nome}
                                    </span>
                                  )}
                                </div>
                                {chat.last_message_time && (
                                  <span className="text-xs text-muted-foreground flex-shrink-0">
                                    {formatRelativeTime(chat.last_message_time)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="text-sm text-muted-foreground truncate">
                                    {truncateText(formatLastMessagePreview(chat.last_message), 35)}
                                  </span>
                                </div>
                                {(chat.unread_count || 0) > 0 && (
                                  <Badge className="ml-2 h-5 min-w-[20px] px-1.5 rounded-full">
                                    {chat.unread_count}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Chat Window - Always visible */}
              <ResizablePanel defaultSize={70} minSize={40}>
                <div className="h-full flex flex-col overflow-hidden">
                  {selectedChat ? (
                    <DisparosChatWindow
                      chat={selectedChat}
                      initialMessage={prefillMessage}
                      onBack={() => { handleBack(); setPrefillMessage(null); }}
                      onChatUpdated={handleChatUpdated}
                      onChatDeleted={() => {
                        setSelectedChat(null);
                        setShowChatWindow(false);
                        setPrefillMessage(null);
                        loadChats();
                      }}
                      availableChats={chats}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">
                          Selecione um chat para começar
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </>
      ) : activeTab === "campanhas" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-3">
            <div className="flex items-center justify-start gap-2">
              <Button size="sm" onClick={() => setNovaCampanhaOpen(true)} className="gap-1">
                <Plus className="h-4 w-4" />
                Nova Campanha
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4">
            <CampanhasTab onRefresh={() => {}} />
          </div>
        </div>
      ) : activeTab === "templates" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <TemplatesTab />
          </div>
        </div>
      ) : activeTab === "listas" ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <ListasImportadasManager />
          </div>
        </div>
      ) : null}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chats selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedChatIds.size} chat(s) serão excluídos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting}>
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Nova Campanha Dialog */}
      <NovaCampanhaDialog
        open={novaCampanhaOpen}
        onOpenChange={setNovaCampanhaOpen}
        onCampanhaCriada={() => {}}
      />

      {/* Comparar Listas Dialog */}
      <CompararListasDialog
        open={compararListasOpen}
        onOpenChange={setCompararListasOpen}
      />

      {/* QR Code Dialog (for reconnecting) */}
      <Dialog open={qrCodeDialogOpen} onOpenChange={(open) => {
        if (!open && qrPollingInterval) {
          clearInterval(qrPollingInterval);
          setQrPollingInterval(null);
        }
        setQrCodeDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com seu WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex flex-col items-center gap-4 py-4">
            {qrCodeLoading ? (
              <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : qrCodeData ? (
              <>
                <div className="p-4 bg-white rounded-lg shadow-sm">
                  <img src={qrCodeData} alt="QR Code" className="w-56 h-56" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Smartphone className="h-4 w-4" />
                  <span>Escaneie com seu WhatsApp</span>
                </div>
                {qrPollingInterval && (
                  <div className="flex items-center gap-2 text-xs text-green-600">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Aguardando conexão...</span>
                  </div>
                )}
              </>
            ) : (
              <div className="w-64 h-64 flex flex-col items-center justify-center bg-muted rounded-lg gap-2">
                <XCircle className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Erro ao carregar</span>
              </div>
            )}
            
            <Button variant="outline" size="sm" onClick={() => selectedQrInstancia && handleConnectInstance(selectedQrInstancia)} disabled={qrCodeLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${qrCodeLoading ? 'animate-spin' : ''}`} />
              Atualizar QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Instance Dialog */}
      <Dialog open={createInstanceDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCreateConnectionType("qrcode");
          setNewInstanciaNome("");
          setManualBaseUrl("");
          setManualApiKey("");
        }
        setCreateInstanceDialogOpen(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Instância</DialogTitle>
            <DialogDescription>
              Escolha como deseja adicionar sua instância
            </DialogDescription>
          </DialogHeader>

          {/* Connection Type Tabs */}
          <div className="flex gap-2 border-b pb-3">
            <Button
              variant={createConnectionType === "qrcode" ? "default" : "outline"}
              size="sm"
              onClick={() => setCreateConnectionType("qrcode")}
              className="flex-1"
            >
              <QrCode className="h-4 w-4 mr-1" />
              QR Code
            </Button>
            <Button
              variant={createConnectionType === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setCreateConnectionType("manual")}
              className="flex-1"
            >
              <Keyboard className="h-4 w-4 mr-1" />
              Manual
            </Button>
          </div>

          {/* QR Code Flow */}
          {createConnectionType === "qrcode" && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome da instância</Label>
                <Input
                  value={newInstanciaNome}
                  onChange={(e) => setNewInstanciaNome(e.target.value)}
                  placeholder="Ex: WhatsApp Disparos 1"
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateInstanceDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleCreateAndConnect(newInstanciaNome)}
                  disabled={isCreatingInstance}
                >
                  {isCreatingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar e Conectar"}
                </Button>
              </div>
            </div>
          )}

          {/* Manual Connection */}
          {createConnectionType === "manual" && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome</Label>
                <Input
                  value={newInstanciaNome}
                  onChange={(e) => setNewInstanciaNome(e.target.value)}
                  placeholder="Ex: WhatsApp Principal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>URL Base</Label>
                <Input
                  value={manualBaseUrl}
                  onChange={(e) => setManualBaseUrl(e.target.value)}
                  placeholder="https://sua-instancia.uazapi.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Token da Instância</Label>
                <Input
                  type="password"
                  value={manualApiKey}
                  onChange={(e) => setManualApiKey(e.target.value)}
                  placeholder="Token de autenticação"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateInstanceDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    if (!newInstanciaNome.trim() || !manualBaseUrl.trim() || !manualApiKey.trim()) {
                      toast.error("Preencha todos os campos");
                      return;
                    }
                    
                    setIsCreatingInstance(true);
                    try {
                      const { data, error } = await supabase
                        .from("disparos_instancias")
                        .insert({
                          user_id: user?.id,
                          nome: newInstanciaNome.trim(),
                          base_url: manualBaseUrl.trim(),
                          api_key: manualApiKey.trim(),
                          is_active: true,
                        })
                        .select()
                        .single();

                      if (error) throw error;

                      // Configure webhook
                      const { data: session } = await supabase.auth.getSession();
                      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/${user?.id}/${data.id}`;
                      
                      const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
                        headers: { Authorization: `Bearer ${session.session?.access_token}` },
                        body: {
                          base_url: manualBaseUrl.trim(),
                          api_key: manualApiKey.trim(),
                          webhook_url: webhookUrl,
                          instancia_id: data.id,
                        },
                      });

                      if (webhookResponse.data?.success) {
                        toast.success("Instância adicionada e webhook configurado!");
                      } else {
                        toast.warning("Instância adicionada, mas o webhook não foi configurado automaticamente.");
                      }
                      
                      setCreateInstanceDialogOpen(false);
                      setNewInstanciaNome("");
                      setManualBaseUrl("");
                      setManualApiKey("");
                      await loadInstancias();
                      checkConfig();
                    } catch (error: any) {
                      toast.error(error.message || "Erro ao adicionar instância");
                    } finally {
                      setIsCreatingInstance(false);
                    }
                  }}
                  disabled={isCreatingInstance}
                >
                  {isCreatingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Instance Name Dialog */}
      <Dialog
        open={editInstanceNameOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingInstancia(null);
            setEditingNome("");
          }
          setEditInstanceNameOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar nome da instância</DialogTitle>
            <DialogDescription>
              Altere apenas o nome exibido no sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label>Novo nome</Label>
              <Input
                value={editingNome}
                onChange={(e) => setEditingNome(e.target.value)}
                placeholder="Ex: WhatsApp Clínica"
                className="mt-1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditInstanceNameOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  const inst = editingInstancia;
                  const nome = editingNome.trim();
                  if (!inst?.id) return;
                  if (!nome) {
                    toast.error("Informe um nome");
                    return;
                  }
                  setSavingEditName(true);
                  try {
                    const { error } = await supabase
                      .from("disparos_instancias")
                      .update({ nome })
                      .eq("id", inst.id);
                    if (error) throw error;
                    toast.success("Nome atualizado!");
                    setEditInstanceNameOpen(false);
                    loadInstancias();
                  } catch (e: any) {
                    toast.error(e?.message || "Erro ao atualizar");
                  } finally {
                    setSavingEditName(false);
                  }
                }}
                disabled={savingEditName}
              >
                {savingEditName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Instance Manager Dialog */}
      <Dialog open={showInstanceManager} onOpenChange={setShowInstanceManager}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Instâncias</DialogTitle>
            <DialogDescription>
              Gerencie suas conexões WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => { setShowInstanceManager(false); setCreateInstanceDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Instância
              </Button>
            </div>

            {fullInstancias.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma instância configurada.
              </p>
            ) : (
              <div className="space-y-3">
                {fullInstancias.map((instancia) => {
                  const status = connectionStatus[instancia.id];
                  const isConnected = status === 'connected';
                  const isLoading = status === 'loading';
                  
                  return (
                    <Card key={instancia.id} className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                            isConnected ? 'bg-green-500' : isLoading ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                          }`} />
                          <div className="min-w-0">
                            <h4 className="font-medium truncate">{instancia.nome}</h4>
                            <p className="text-xs text-muted-foreground">
                              {isConnected ? 'Conectado' : isLoading ? 'Verificando...' : 'Desconectado'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end sm:justify-start">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingInstancia(instancia);
                              setEditingNome(instancia.nome || "");
                              setEditInstanceNameOpen(true);
                            }}
                            title="Editar nome"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>

                          {isConnected ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDisconnectInstance(instancia)}
                              className="text-destructive hover:text-destructive h-8 px-2 sm:px-3"
                            >
                              <Unplug className="h-4 w-4 sm:mr-2" />
                              <span className="hidden sm:inline">Desconectar</span>
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 px-2 sm:px-3"
                              onClick={() => handleConnectInstance(instancia)}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <QrCode className="h-4 w-4 sm:mr-2" />
                                  <span className="hidden sm:inline">Conectar</span>
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => checkConnectionStatus(instancia)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleDeleteInstance(instancia.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
