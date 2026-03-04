import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { MessageSquare, RefreshCw, Plus, LayoutList, Kanban, CheckCircle2, Trash2, CheckSquare, Square, X, QrCode, Unplug, Loader2, Smartphone, XCircle, Pencil, Settings, Hash, Keyboard, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ChatWindow } from "@/components/whatsapp/ChatWindow";
import { ChatAvatar } from "@/components/whatsapp/ChatAvatar";
import { WhatsAppKanban } from "@/components/whatsapp/WhatsAppKanban";
import { CountryCodeSelect } from "@/components/whatsapp/CountryCodeSelect";
import { formatPhoneNumber, formatRelativeTime, truncateText, getInitials, normalizePhoneNumber, getLast8Digits, formatLastMessagePreview } from "@/utils/whatsapp";
import { CONTACT_NAME_UPDATED_EVENT } from "@/utils/syncContactName";
import { formatPhoneByCountry, getPhonePlaceholder, stripCountryCode } from "@/utils/phoneFormat";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useTabPersistence } from "@/hooks/useTabPersistence";

export default function AdminWhatsApp() {
  const {
    user
  } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [instanceConnectedAt, setInstanceConnectedAt] = useState<string | null>(null);
  const [uazapiAuthError, setUazapiAuthError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useTabPersistence("view", "list");
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);

  // Selection state for bulk delete
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [prefillMessage, setPrefillMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // WhatsApp connection state (QR code flow) - based on disparos_instancias
  const [mainInstance, setMainInstance] = useState<{ id: string; nome: string; base_url: string; api_key: string } | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [qrPollingInterval, setQrPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [isCreatingInstance, setIsCreatingInstance] = useState(false);

  // Create instance dialog (name first, then QR)
  const [createInstanceDialogOpen, setCreateInstanceDialogOpen] = useState(false);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [manualBaseUrl, setManualBaseUrl] = useState("");
  const [manualApiKey, setManualApiKey] = useState("");
  const [connectionMethod, setConnectionMethod] = useState<"qrcode" | "pairing" | "manual">("qrcode");

  // Pairing code state
  const [pairingCodePhone, setPairingCodePhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingCodeLoading, setPairingCodeLoading] = useState(false);

  // Edit instance name dialog
  const [editNameDialogOpen, setEditNameDialogOpen] = useState(false);
  const [editingName, setEditingName] = useState("");

  // Manage instance dialog
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [deletingInstance, setDeletingInstance] = useState(false);
  const [deleteInstanceConfirmOpen, setDeleteInstanceConfirmOpen] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const getChatLast8 = (chat: any) => {
    // Prefer explicit numbers, fallback to chat_id
    const candidates = [chat?.contact_number, chat?.normalized_number, chat?.chat_id].filter(Boolean);
    for (const c of candidates) {
      const last8 = getLast8Digits(String(c));
      if (last8) return last8;
    }
    return '';
  };
  const dedupeChatsByLast8 = (rows: any[]) => {
    // Keep the most recently updated / most recent message per phone (last 8 digits)
    const sorted = [...rows].sort((a, b) => {
      const ta = new Date(a.updated_at || a.last_message_time || 0).getTime();
      const tb = new Date(b.updated_at || b.last_message_time || 0).getTime();
      return tb - ta;
    });
    const seen = new Set<string>();
    const out: any[] = [];
    for (const chat of sorted) {
      const key = getChatLast8(chat);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(chat);
    }

    // Restore list ordering by last message time (what the UI expects)
    return out.sort((a, b) => {
      const ta = new Date(a.last_message_time || 0).getTime();
      const tb = new Date(b.last_message_time || 0).getTime();
      return tb - ta;
    });
  };

  // Load chats from database (excluding deleted ones)
  // Optionally pass connectedAt timestamp to filter old chats (useful when called right after checkConfig)
  const loadChats = async (connectedAtOverride?: string | null): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_chats')
        .select('*')
        .is('deleted_at', null)
        .order('last_message_time', {
          ascending: false,
          nullsFirst: false,
        });

      if (error) throw error;

      const deduped = dedupeChatsByLast8(data || []);

      // Não mostrar conversas antigas: só mostrar chats com mensagem (ou criação) após a conexão/configuração.
      // Use override if provided, otherwise use state value.
      // Add a 5-second tolerance to avoid filtering out newly created chats due to timestamp precision issues.
      const connectedAtValue = connectedAtOverride !== undefined ? connectedAtOverride : instanceConnectedAt;
      const connectedAtMs = connectedAtValue ? new Date(connectedAtValue).getTime() - 5000 : null;
      const visible = connectedAtMs && Number.isFinite(connectedAtMs)
        ? deduped.filter((c) => {
            const t1 = c.last_message_time ? new Date(c.last_message_time).getTime() : 0;
            const t2 = c.created_at ? new Date(c.created_at).getTime() : 0;
            return Math.max(t1, t2) >= connectedAtMs;
          })
        : deduped;

      setChats(visible);
      setFilteredChats(visible);
      setChatsLoaded(true);
      return visible;
    } catch (error: any) {
      console.error('Error loading chats:', error);
      toast.error('Erro ao carregar chats');
      setChatsLoaded(true);
      return [];
    }
  };

  // Check if user has a main WhatsApp instance (ONLY via uazapi_config)
  // IMPORTANT: WhatsApp tab must NOT reuse Disparos instances.
  // Returns the instanceConnectedAt timestamp for immediate use
  const checkConfig = async (): Promise<string | null> => {
    try {
      if (!user?.id) {
        setMainInstance(null);
        setHasConfig(false);
        setUazapiAuthError(null);
        setConnectionStatus('disconnected');
        return null;
      }

      // Only check uazapi_config for linked instance
      const { data: uazapiConfig, error: cfgError } = await supabase
        .from('uazapi_config')
        .select('whatsapp_instancia_id, base_url, api_key, updated_at, created_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cfgError) throw cfgError;

      if (uazapiConfig?.whatsapp_instancia_id) {
        // Load the linked instance from disparos_instancias (shared storage, but logically WhatsApp-owned)
        const { data: instance } = await supabase
          .from('disparos_instancias')
          .select('id, nome, base_url, api_key, created_at, updated_at')
          .eq('id', uazapiConfig.whatsapp_instancia_id)
          .single();

        if (instance) {
          setMainInstance(instance);
          setHasConfig(true);
          setUazapiAuthError(null);
          
          // Set instanceConnectedAt to filter old chats.
          // IMPORTANT: this must be STABLE. Using updated_at makes the cutoff move forward on every sync,
          // causing chats to "disappear" after the auto-sync runs.
          // So we base it on the configuration creation time (when the WhatsApp config was first linked).
          const configCreatedAtMs = uazapiConfig.created_at ? new Date(uazapiConfig.created_at).getTime() : 0;
          const instanceCreatedAtMs = instance.created_at ? new Date(instance.created_at).getTime() : 0;

          const stableTimestamp = Math.max(configCreatedAtMs, instanceCreatedAtMs);

          let connectedAt: string | null = null;
          if (stableTimestamp > 0) {
            connectedAt = new Date(stableTimestamp).toISOString();
            setInstanceConnectedAt(connectedAt);
          }
          checkConnectionStatus(instance.base_url, instance.api_key);
          return connectedAt;
        }
      }

      // No WhatsApp instance configured
      setMainInstance(null);
      setHasConfig(false);
      setInstanceConnectedAt(null);
      setUazapiAuthError(null);
      setConnectionStatus('disconnected');
      return null;
    } catch {
      setMainInstance(null);
      setHasConfig(false);
      setInstanceConnectedAt(null);
      setUazapiAuthError(null);
      setConnectionStatus('disconnected');
      return null;
    }
  };

  // Check WhatsApp connection status
  const checkConnectionStatus = async (baseUrl: string, apiKey: string) => {
    setConnectionStatus('loading');
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("uazapi-test-connection", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: baseUrl, api_key: apiKey },
      });
      setConnectionStatus(response.data?.success ? 'connected' : 'disconnected');
    } catch {
      setConnectionStatus('disconnected');
    }
  };

  // Create new instance with user-provided name and open QR Code dialog
  const handleCreateInstance = async (instanceName: string, useManualConfig = false) => {
    const name = instanceName.trim();
    if (!name) {
      toast.error("Informe um nome para a instância");
      return;
    }

    // If using manual config, validate fields
    if (useManualConfig) {
      if (!manualBaseUrl.trim() || !manualApiKey.trim()) {
        toast.error("Informe a URL Base e a API Key da instância");
        return;
      }
    }

    setCreateInstanceDialogOpen(false);
    setNewInstanceName("");
    setIsCreatingInstance(true);

    // Only open QR flow upfront when we're using the QR connection method.
    // For manual connection we only open QR if we detect the instance is not connected.
    if (!useManualConfig) {
      setQrCodeDialogOpen(true);
      setQrCodeLoading(true);
      setQrCodeData(null);
    } else {
      setQrCodeDialogOpen(false);
      setQrCodeLoading(false);
      setQrCodeData(null);
    }

    try {
      const { data: session } = await supabase.auth.getSession();

      let newInstance: { id: string; nome: string; base_url: string; api_key: string } | null = null;

      if (useManualConfig) {
        // Use manual config - create instance locally without Admin API
        const baseUrl = manualBaseUrl.trim().replace(/\/+$/, '');
        const apiKey = manualApiKey.trim();

        // First test if the connection works
        console.log("Testing connection for manual instance:", { baseUrl, apiKey: apiKey.substring(0, 10) + "..." });
        const testResponse = await supabase.functions.invoke("uazapi-test-connection", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: { base_url: baseUrl, api_key: apiKey },
        });

        console.log("Test connection response:", testResponse.data);

        // Accept connection if success is true OR if we got details (even if success is false)
        const connectionOk = testResponse.data?.success || testResponse.data?.details;
        if (!connectionOk) {
          toast.error("Não foi possível conectar com a instância. Verifique a URL e API Key.");
          setQrCodeDialogOpen(false);
          setIsCreatingInstance(false);
          return;
        }

        // Create instance in database
        const { data: createdInstance, error: insertError } = await supabase
          .from("disparos_instancias")
          .insert({
            user_id: user?.id,
            nome: name,
            base_url: baseUrl,
            api_key: apiKey,
            is_active: true,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        newInstance = {
          id: createdInstance.id,
          nome: name,
          base_url: baseUrl,
          api_key: apiKey,
        };

        // Configure webhook for manual instance
        const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/${user?.id}/${createdInstance.id}`;
        console.log("Configuring webhook for manual instance:", { webhookUrl, baseUrl, instancia_id: createdInstance.id });
        
        try {
          const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
            headers: { Authorization: `Bearer ${session.session?.access_token}` },
            body: {
              base_url: baseUrl,
              api_key: apiKey,
              webhook_url: webhookUrl,
              instancia_id: createdInstance.id,
            },
          });

          console.log("Webhook response for manual instance:", webhookResponse);
          
          if (webhookResponse.error) {
            console.error("Webhook invoke error:", webhookResponse.error);
            toast.error("Erro ao configurar webhook: " + webhookResponse.error.message);
          } else if (webhookResponse.data?.success) {
            console.log("Webhook configured successfully for manual instance");
            toast.success("Webhook configurado com sucesso!");
          } else {
            console.error("Webhook config failed for manual instance:", webhookResponse.data);
            toast.warning("Webhook pode não ter sido configurado corretamente");
          }
        } catch (webhookErr) {
          console.error("Exception configuring webhook:", webhookErr);
          toast.error("Erro ao configurar webhook");
        }

        // Reset config state
        setManualBaseUrl("");
        setManualApiKey("");
        setConnectionMethod("qrcode");
        
        // For manual connection, we're done - don't continue to QR code flow
        setMainInstance(newInstance);
        setHasConfig(true);
        
        // Link to uazapi_config
        await supabase.from('uazapi_config').upsert({
          user_id: user?.id,
          base_url: newInstance.base_url,
          api_key: newInstance.api_key,
          whatsapp_instancia_id: newInstance.id,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        
        // Check if already connected
        const statusResponse = await supabase.functions.invoke("uazapi-check-status", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: { base_url: newInstance.base_url, api_key: newInstance.api_key },
        });

        const isConnected =
          statusResponse.data?.success === true ||
          statusResponse.data?.status === "connected";

        if (isConnected) {
          toast.success("WhatsApp conectado com sucesso!");
          setConnectionStatus('connected');
          setQrCodeDialogOpen(false);
        } else {
          toast.success("Instância salva! Escaneie o QR code para conectar.");

          // Open QR dialog only when needed
          setQrCodeDialogOpen(true);
          setQrCodeLoading(true);
          setQrCodeData(null);

          const qrResponse = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
            headers: { Authorization: `Bearer ${session.session?.access_token}` },
            body: { base_url: newInstance.base_url, api_key: newInstance.api_key },
          });

          if (qrResponse.data?.qrcode) {
            setQrCodeData(qrResponse.data.qrcode);
            setQrCodeLoading(false);
            startQrPolling(newInstance.base_url, newInstance.api_key, newInstance);
          } else {
            setQrCodeDialogOpen(false);
            setQrCodeLoading(false);
            toast.error(qrResponse.data?.error || "Não foi possível obter o QR Code");
          }
        }
        
        setIsCreatingInstance(false);
        checkConfig();
        return; // Exit here - don't continue to admin API flow
      } else {
        // Try Admin API first
        const createResponse = await supabase.functions.invoke("uazapi-admin-create-instance", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: { instance_name: name },
        });

        if (!createResponse.data?.success) {
          // Admin API failed - show manual config option
          toast.error("Admin API não disponível. Configure manualmente a instância.");
          setQrCodeDialogOpen(false);
          setCreateInstanceDialogOpen(true);
          setNewInstanceName(name);
          setConnectionMethod("manual");
          return;
        }

        newInstance = createResponse.data.instance;
      }

      if (!newInstance) {
        toast.error("Erro ao criar instância");
        setQrCodeDialogOpen(false);
        return;
      }

      setMainInstance(newInstance);
      setHasConfig(true);

      // Link to uazapi_config
      await supabase.from('uazapi_config').upsert({
        user_id: user?.id,
        base_url: newInstance.base_url,
        api_key: newInstance.api_key,
        whatsapp_instancia_id: newInstance.id,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      // Get QR code
      const qrResponse = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: newInstance.base_url, api_key: newInstance.api_key },
      });

      if (qrResponse.data?.connected) {
        toast.success("WhatsApp já está conectado!");
        setQrCodeDialogOpen(false);
        setConnectionStatus('connected');
        
        // Configure webhook even if already connected
        const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/${user?.id}/${newInstance.id}`;
        const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: {
            base_url: newInstance.base_url,
            api_key: newInstance.api_key,
            webhook_url: webhookUrl,
            instancia_id: newInstance.id,
          },
        });

        if (webhookResponse.data?.success) {
          toast.success("Webhook configurado!");
        } else {
          console.error("Webhook config failed:", webhookResponse.data);
        }
        return;
      }

      if (qrResponse.data?.qrcode) {
        setQrCodeData(qrResponse.data.qrcode);
        startQrPolling(newInstance.base_url, newInstance.api_key, newInstance);
      } else {
        toast.error(qrResponse.data?.error || "Não foi possível obter o QR Code");
        setQrCodeDialogOpen(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar instância");
      setQrCodeDialogOpen(false);
    } finally {
      setQrCodeLoading(false);
      setIsCreatingInstance(false);
    }
  };

  // Open create instance dialog or QR code dialog
  const handleOpenQrCode = async () => {
    if (!mainInstance) {
      // No instance - open create dialog FIRST to get name
      setNewInstanceName("");
      setCreateInstanceDialogOpen(true);
      return;
    }

    setQrCodeDialogOpen(true);
    setQrCodeLoading(true);
    setQrCodeData(null);

    try {
      const { data: session } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: mainInstance.base_url, api_key: mainInstance.api_key },
      });

      if (response.data?.connected) {
        toast.success("WhatsApp já está conectado!");
        setQrCodeDialogOpen(false);
        setConnectionStatus('connected');
        return;
      }

      if (response.data?.qrcode) {
        setQrCodeData(response.data.qrcode);
        startQrPolling(mainInstance.base_url, mainInstance.api_key, mainInstance);
      } else {
        toast.error(response.data?.error || "Não foi possível obter o QR Code");
      }
    } catch {
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrCodeLoading(false);
    }
  };

  // Save edited instance name
  const handleSaveInstanceName = async () => {
    const nome = editingName.trim();
    if (!mainInstance?.id || !nome) {
      toast.error("Informe um nome");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("disparos_instancias")
        .update({ nome })
        .eq("id", mainInstance.id);
      if (error) throw error;
      setMainInstance(prev => prev ? { ...prev, nome } : null);
      toast.success("Nome atualizado!");
      setEditNameDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar");
    } finally {
      setSavingName(false);
    }
  };

  // Disconnect WhatsApp
  const handleDisconnect = async () => {
    if (!mainInstance) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("uazapi-disconnect-instance", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: mainInstance.base_url, api_key: mainInstance.api_key },
      });

      if (response.data?.success) {
        toast.success("WhatsApp desconectado!");
        setConnectionStatus('disconnected');
      } else {
        toast.error(response.data?.error || "Erro ao desconectar");
      }
    } catch {
      toast.error("Erro ao desconectar");
    }
  };

  // Delete instance completely
  const handleDeleteInstance = async () => {
    if (!mainInstance) return;
    setDeletingInstance(true);
    try {
      const { data: session } = await supabase.auth.getSession();

      // Try to delete from UAZapi server
      try {
        await supabase.functions.invoke("uazapi-admin-delete-instance", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: {
            instance_name: mainInstance.nome || mainInstance.id,
            base_url: mainInstance.base_url,
            api_key: mainInstance.api_key,
          },
        });
      } catch (e) {
        console.error("Error deleting from UAZapi:", e);
      }

      // Clear uazapi_config link
      await supabase
        .from("uazapi_config")
        .update({ whatsapp_instancia_id: null, is_active: false })
        .eq("user_id", user?.id);

      // Delete from disparos_instancias
      const { error } = await supabase
        .from("disparos_instancias")
        .delete()
        .eq("id", mainInstance.id);

      if (error) throw error;

      toast.success("Instância removida!");
      setMainInstance(null);
      setHasConfig(false);
      setConnectionStatus('disconnected');
      setManageDialogOpen(false);
      setDeleteInstanceConfirmOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover instância");
    } finally {
      setDeletingInstance(false);
    }
  };

  // Start polling for QR code connection
  const startQrPolling = (baseUrl: string, apiKey: string, instanceData?: { id: string; nome: string; base_url: string; api_key: string }) => {
    if (qrPollingInterval) clearInterval(qrPollingInterval);

    // Use passed instanceData or fallback to mainInstance
    const instanciaRef = instanceData || mainInstance;

    // Skip initial polls to give user time to scan QR (avoid false positives)
    let pollCount = 0;
    const minPollsBeforeConnect = 2; // ~10s
    let confirmedCount = 0;
    const requiredConfirmations = 3; // require stability for ~15s

    const interval = setInterval(async () => {
      pollCount++;
      try {
        const { data: session } = await supabase.auth.getSession();
        const response = await supabase.functions.invoke("uazapi-test-connection", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: { base_url: baseUrl, api_key: apiKey },
        });

        const details = response.data?.details;
        const apiSaysLoggedIn = details?.loggedIn === true;
        const apiJid = details?.jid;
        const apiConnected = details?.connected === true; // strict

        // Only accept a STRONG, stable signal; avoid "connected" UI flapping while phone still says not connected.
        const strongSignal = apiSaysLoggedIn && Boolean(apiJid) && apiConnected;

        console.log("Polling status check:", {
          pollCount,
          confirmedCount,
          success: response.data?.success,
          apiSaysLoggedIn,
          apiJid,
          apiConnected,
          details,
        });

        const isConfirmedNow = strongSignal;

        if (pollCount < minPollsBeforeConnect) return;

        if (isConfirmedNow) {
          confirmedCount++;
        } else {
          confirmedCount = 0;
        }

        if (confirmedCount >= requiredConfirmations) {
          console.log("Connection confirmed (stable)! Closing dialog and configuring webhook...");
          clearInterval(interval);
          setQrPollingInterval(null);
          setQrCodeDialogOpen(false);
          setConnectionStatus('connected');
          toast.success("WhatsApp conectado!");

          // Configure webhook after successful connection
            const instanciaId = instanciaRef?.id;
            if (instanciaId && user?.id) {
              const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/${user.id}/${instanciaId}`;
              console.log("Configuring webhook:", webhookUrl);

            const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
              headers: { Authorization: `Bearer ${session.session?.access_token}` },
              body: {
                base_url: baseUrl,
                api_key: apiKey,
                webhook_url: webhookUrl,
                instancia_id: instanciaId,
              },
            });


            console.log("Webhook response:", webhookResponse.data);

            if (webhookResponse.data?.success) {
              toast.success("Webhook configurado!");
              // Sync chats after first successful connection to load existing conversations
              syncChats();
            } else {
              console.error("Webhook config failed:", webhookResponse.data);
              toast.error("Erro ao configurar webhook: " + (webhookResponse.data?.error || "Erro desconhecido"));
            }
          }
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 5000);

    setQrPollingInterval(interval);
    setTimeout(() => {
      clearInterval(interval);
      setQrPollingInterval(null);
    }, 120000);
  };

  // Refresh QR Code
  const refreshQrCode = () => {
    if (mainInstance) {
      handleOpenQrCode();
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollingInterval) clearInterval(qrPollingInterval);
    };
  }, [qrPollingInterval]);

  // Sync chats from UAZapi
  const syncChats = async () => {
    if (!hasConfig) {
      toast.error('Configure o WhatsApp em Configurações → Conexões');
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
          toast.error('Sua sessão expirou. Faça login novamente.');
          setTimeout(() => window.location.href = '/auth', 2000);
          return;
        }
        session = sessionData.session;
      }
      const response = await supabase.functions.invoke('uazapi-get-chats', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });
      if (response.error) {
        // Supabase FunctionsHttpError often hides the body behind context.response
        const anyErr: any = response.error;
        let detailedMessage = response.error.message;
        let status: number | undefined;
        try {
          const resp: Response | undefined = anyErr?.context?.response;
          if (resp) {
            status = resp.status;
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
        } catch {
          // ignore parsing issues
        }

        // If provider auth failed, surface a persistent CTA and pause auto-sync.
        if (status === 401 || /invalid token/i.test(detailedMessage) || /api key inv[áa]lida/i.test(detailedMessage)) {
          setUazapiAuthError(detailedMessage);
        }

        throw new Error(detailedMessage);
      }

      // Sync completed silently - no toast
      setUazapiAuthError(null);
      await loadChats();
    } catch (error: any) {
      console.error('Error syncing chats:', error);
      toast.error(error.message || 'Erro ao sincronizar chats');

      // Even when sync fails, keep UI usable with cached DB data.
      try {
        await loadChats();
      } catch {
        // ignore
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter chats by search term and unread filter
  useEffect(() => {
    let filtered = chats;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const normalizedTerm = normalizePhoneNumber(term);
      filtered = filtered.filter(chat => {
        const matchName = chat.contact_name.toLowerCase().includes(term);
        const matchNumber = chat.contact_number.includes(term);
        const matchNormalized = normalizedTerm.length > 0 && normalizePhoneNumber(chat.contact_number).includes(normalizedTerm);
        return matchName || matchNumber || matchNormalized;
      });
    }
    if (filterUnreadOnly) {
      filtered = filtered.filter(chat => (chat.unread_count || 0) > 0);
    }
    setFilteredChats(filtered);
  }, [searchTerm, chats, filterUnreadOnly]);

  // Handle URL parameter for opening chat (waits for chats to load first)
  const attemptedAutoOpenRef = useRef<Record<string, boolean>>({});
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const normalizeBrPhoneDigits = (digitsOnly: string) => {
    let clean = digitsOnly;

    // If user passed full chat_id (e.g. 5521...@s.whatsapp.net)
    clean = clean.replace(/@.*$/, '');

    // Remove duplicated DDD edge case (mirrors backend normalize_br_phone logic)
    if (clean.length === 13 && clean.startsWith('55')) {
      const ddd1 = clean.slice(2, 4);
      const ddd2 = clean.slice(4, 6);
      if (ddd1 === ddd2) {
        clean = '55' + clean.slice(4);
      }
    }

    // Add Brazil country code if missing
    if (clean.length === 10 || clean.length === 11) return '55' + clean;
    return clean;
  };
  useEffect(() => {
    const chatParam = searchParams.get('chat');
    const clientName = searchParams.get('name');
    const prefillParam = searchParams.get('prefill');
    if (!chatParam) return;

    // Wait for chats to be loaded first (not just length > 0, but actually loaded)
    if (!chatsLoaded) return;

    // Set prefill message if provided
    if (prefillParam) {
      setPrefillMessage(prefillParam);
    }

    // If the param is a DB UUID, open by id
    if (isUuid(chatParam)) {
      const foundById = chats.find(c => c.id === chatParam);
      if (foundById) {
        setSelectedChat(foundById);
        setShowChatWindow(true);
        setSearchParams({});
      } else {
        toast.error('Chat não encontrado por ID. Sincronize e tente novamente.');
        setSearchParams({});
      }
      return;
    }

    // Otherwise treat as phone/chat_id
    const normalizedDigits = normalizePhoneNumber(chatParam);
    if (!normalizedDigits) return;
    const normalizedBr = normalizeBrPhoneDigits(normalizedDigits);
    const expectedChatId = `${normalizedBr}@s.whatsapp.net`;

    // Get last 8 digits for matching
    const last8Digits = getLast8Digits(chatParam);

    // 1) Find chat in loaded list by chat_id, normalized number, OR last 8 digits
    const foundChat = chats.find(c => c.chat_id === expectedChatId || c.normalized_number === normalizedBr || normalizePhoneNumber(c.contact_number) === normalizedBr || normalizePhoneNumber(c.contact_number) === normalizedDigits || getLast8Digits(c.contact_number) === last8Digits || getLast8Digits(c.normalized_number) === last8Digits || getLast8Digits(c.chat_id) === last8Digits);
    if (foundChat) {
      setSelectedChat(foundChat);
      setShowChatWindow(true);
      setSearchParams({});
      return;
    }
    const createOrOpenChatFromParam = async () => {
      console.log('[whatsapp:auto-open] create/open chat', {
        chatParam,
        normalizedDigits,
        normalizedBr,
        expectedChatId,
        last8Digits
      });

      // 1) Resolve contact name (URL param wins, fallback to DB lead name)
      let contactName = clientName || formatPhoneNumber(chatParam);
      if (!clientName) {
        try {
          const {
            data: leads
          } = await supabase.from('leads').select('nome, telefone').is('deleted_at', null);
          if (leads) {
            const matchingLead = leads.find(lead => getLast8Digits(lead.telefone) === last8Digits);
            if (matchingLead?.nome) contactName = matchingLead.nome;
          }
        } catch (error) {
          console.error('[whatsapp:auto-open] error fetching lead name', error);
        }
      }

      // 2) Try to get existing chat directly from DB using last 8 digits for better matching
      // This prevents duplicates caused by 9th digit variations
      try {
        const {
          data: allChats
        } = await supabase.from('whatsapp_chats').select('*').is('deleted_at', null);
        if (allChats) {
          const existingChat = allChats.find(c => getLast8Digits(c.contact_number) === last8Digits || getLast8Digits(c.normalized_number) === last8Digits || getLast8Digits(c.chat_id) === last8Digits);
          if (existingChat) {
            setSelectedChat(existingChat);
            setShowChatWindow(true);
            setSearchParams({});
            return;
          }
        }
      } catch (error) {
        console.error('[whatsapp:auto-open] error checking existing chat', error);
      }

      // 2.1) If chat exists but was soft-deleted, restore it using last 8 digits matching
      try {
        const {
          data: deletedChatsData
        } = await supabase.from('whatsapp_chats').select('*').not('deleted_at', 'is', null);
        const deletedExisting = deletedChatsData?.find(c => getLast8Digits(c.contact_number) === last8Digits || getLast8Digits(c.normalized_number) === last8Digits || getLast8Digits(c.chat_id) === last8Digits);
        if (deletedExisting) {
          const {
            data: restored,
            error: restoreError
          } = await supabase.from('whatsapp_chats').update({
            deleted_at: null,
            contact_name: contactName,
            contact_number: chatParam,
            chat_id: expectedChatId,
            normalized_number: normalizedBr,
            unread_count: 0
          }).eq('id', deletedExisting.id).select('*').single();
          if (restoreError) throw restoreError;
          setChats(prev => dedupeChatsByLast8([restored, ...prev.filter(c => c.id !== restored.id)]));
          setFilteredChats(prev => dedupeChatsByLast8([restored, ...prev.filter(c => c.id !== restored.id)]));
          setSelectedChat(restored);
          setShowChatWindow(true);
          setSearchParams({});
          toast.success(`Chat restaurado para ${contactName}`);
          return;
        }
      } catch (error) {
        console.error('[whatsapp:auto-open] error restoring deleted chat', error);
      }

      // 3) Create a new chat row in DB
      try {
        if (!user?.id) {
          toast.error('Você precisa estar logado para criar um chat.');
          return;
        }
        const {
          data: created,
          error: insertError
        } = await supabase.from('whatsapp_chats').insert({
          user_id: user.id,
          chat_id: expectedChatId,
          contact_name: contactName,
          contact_number: chatParam,
          normalized_number: normalizedBr,
          unread_count: 0
        }).select('*').single();
        if (insertError) throw insertError;

        // Update local lists so it appears instantly
        setChats(prev => dedupeChatsByLast8([created, ...prev]));
        setFilteredChats(prev => dedupeChatsByLast8([created, ...prev]));
        setSelectedChat(created);
        setShowChatWindow(true);
        setSearchParams({});
        toast.success(`Chat criado para ${contactName}`);
      } catch (error: any) {
        // If insert failed due to unique constraint, try finding and restoring the existing row
        if (error?.code === '23505') {
          try {
            const {
              data: allChatsForRestore
            } = await supabase.from('whatsapp_chats').select('*');
            const existingAny = allChatsForRestore?.find(c => getLast8Digits(c.contact_number) === last8Digits || getLast8Digits(c.normalized_number) === last8Digits || getLast8Digits(c.chat_id) === last8Digits);
            if (existingAny) {
              const {
                data: restored,
                error: restoreError
              } = await supabase.from('whatsapp_chats').update({
                deleted_at: null,
                contact_name: contactName,
                contact_number: chatParam,
                unread_count: 0
              }).eq('id', existingAny.id).select('*').single();
              if (restoreError) throw restoreError;
              setChats(prev => dedupeChatsByLast8([restored, ...prev.filter(c => c.id !== restored.id)]));
              setFilteredChats(prev => dedupeChatsByLast8([restored, ...prev.filter(c => c.id !== restored.id)]));
              setSelectedChat(restored);
              setShowChatWindow(true);
              setSearchParams({});
              toast.success(`Chat restaurado para ${contactName}`);
              return;
            }
          } catch (restoreError) {
            console.error('[whatsapp:auto-open] restore after 23505 failed', restoreError);
          }
        }
        console.error('[whatsapp:auto-open] error creating chat', error);
        toast.error(error?.message || 'Não foi possível criar o chat automaticamente.');
      }
    };

    // If WhatsApp isn't configured, still create/open a local DB chat so the UI can proceed
    if (!hasConfig) {
      void createOrOpenChatFromParam();
      return;
    }

    // 2) If not found, try one sync (so the chat can appear in the list)
    if (!attemptedAutoOpenRef.current[expectedChatId]) {
      console.log('[whatsapp:auto-open] chat not found, syncing once', {
        expectedChatId
      });
      attemptedAutoOpenRef.current[expectedChatId] = true;
      void syncChats();
      return;
    }

    // 3) Still not found after sync attempt - create/open chat
    void createOrOpenChatFromParam();
  }, [searchParams, chats, chatsLoaded, hasConfig, setSearchParams, syncChats]);

  // Load chats and config on mount
  // Strategy: load cached chats from DB first (instant), then sync with external API in background
  useEffect(() => {
    (async () => {
      const connectedAt = await checkConfig();
      // Load cached chats immediately (DB query, very fast)
      await loadChats(connectedAt);
      // Sync with external API in background (doesn't block UI)
      syncChats();
    })();
  }, []);

  // Listen for contact name updates from other components (e.g., EditarClienteDialog)
  useEffect(() => {
    const handleContactNameUpdated = async () => {
      // Reload chats to get updated names
      const updatedChats = await loadChats();
      
      // Also update the selected chat if it exists
      if (selectedChat && updatedChats) {
        const updatedSelectedChat = updatedChats.find((c: any) => c.id === selectedChat.id);
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

  // Sync is now manual only (via refresh button) or triggered after first instance connection
  // This saves cloud credits - webhooks/Realtime handle ongoing message updates

  // Realtime: keep unread badge and last message preview in sync with batching/debounce
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

        // Keep a single chat per phone (last 8 digits) and order by latest message
        const merged = dedupeChatsByLast8(Array.from(prevById.values()));

        // IMPORTANT: also apply the same "no old history" filter used in loadChats.
        // Otherwise, background sync (and realtime updates) can reintroduce old chats in-memory.
        // Add a 5-second tolerance to avoid filtering out newly created chats due to timestamp precision issues.
        const connectedAtMs = instanceConnectedAt ? new Date(instanceConnectedAt).getTime() - 5000 : null;
        if (connectedAtMs && Number.isFinite(connectedAtMs)) {
          return merged.filter((c) => {
            const t1 = c.last_message_time ? new Date(c.last_message_time).getTime() : 0;
            const t2 = c.created_at ? new Date(c.created_at).getTime() : 0;
            return Math.max(t1, t2) >= connectedAtMs;
          });
        }

        return merged;
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
      .channel("whatsapp-chats-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_chats",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const inserted = (payload as any).new as any;
          console.log('[WhatsApp Realtime] Received insert:', inserted?.contact_name);
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
          table: "whatsapp_chats",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as any;
          console.log('[WhatsApp Realtime] Received update:', updated?.contact_name, updated?.last_message);
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
  }, [user?.id, instanceConnectedAt]);

  // Clear unread count when opening/reading chat (viewing is enough)
  const clearUnreadCount = async (chatId: string) => {
    if (!chatId || chatId === "temp") return;
    try {
      const now = new Date().toISOString();

      // Use backend function to guarantee persistence even if client-side permissions block updates
      const {
        data,
        error
      } = await supabase.functions.invoke("whatsapp-mark-read", {
        body: {
          chatId
        }
      });
      
      // Silently ignore 404 errors (chat was deleted or doesn't exist)
      if (error) {
        // Check if it's a "Chat not found" error - don't throw, just return
        const errorMsg = (data as any)?.error || error?.message || '';
        if (errorMsg.includes("Chat not found") || errorMsg.includes("404")) {
          console.log("Chat not found, skipping mark-read:", chatId);
          return;
        }
        throw error;
      }
      const providerBaseline = (data as any)?.baseline ?? 0;

      // Update local state (both lists + selected)
      setChats(prev => prev.map(c => c.id === chatId ? {
        ...c,
        unread_count: 0,
        last_read_at: now,
        provider_unread_baseline: providerBaseline
      } : c));
      setFilteredChats(prev => prev.map(c => c.id === chatId ? {
        ...c,
        unread_count: 0,
        last_read_at: now,
        provider_unread_baseline: providerBaseline
      } : c));
      setSelectedChat(prev => prev?.id === chatId ? {
        ...prev,
        unread_count: 0,
        last_read_at: now,
        provider_unread_baseline: providerBaseline
      } : prev);
    } catch (error) {
      console.error("Error clearing unread count:", error);
    }
  };

  // Handle chat selection
  const handleChatSelect = (chat: any) => {
    setSelectedChat(chat);
    setShowChatWindow(true);

    // Sempre zera ao entrar no chat (mesmo sem responder)
    if (chat?.id && chat.id !== "temp") {
      void clearUnreadCount(chat.id);
    }
  };

  // Handle chat name updated from ChatWindow
  const handleChatUpdated = (updatedChat: any) => {
    setChats(prev => prev.map(c => c.id === updatedChat.id ? {
      ...c,
      ...updatedChat
    } : c));
    setFilteredChats(prev => prev.map(c => c.id === updatedChat.id ? {
      ...c,
      ...updatedChat
    } : c));
    setSelectedChat(prev => prev?.id === updatedChat.id ? {
      ...prev,
      ...updatedChat
    } : prev);
  };

  // Create temporary chat for new number or open existing chat
  const createTempChat = () => {
    if (!newChatNumber) {
      toast.error('Digite um número de telefone');
      return;
    }

    // Normalize (digits only)
    const normalizedDigits = normalizePhoneNumber(newChatNumber);
    if (!normalizedDigits) {
      toast.error('Número inválido');
      return;
    }

    // Build full number with selected country code
    const fullNumber = `${newChatCountryCode}${normalizedDigits}`;
    const displayNumber = `+${newChatCountryCode} ${normalizedDigits}`;

    // Check if there's an existing active chat with this number (by last 8 digits)
    const newLast8 = getLast8Digits(fullNumber);
    const existingChat = chats.find((c) => {
      const chatLast8 = getLast8Digits(c.contact_number || c.chat_id || '');
      return chatLast8 === newLast8 && !c.deleted_at;
    });

    if (existingChat) {
      // Open existing chat instead of creating a new one
      setSelectedChat(existingChat);
      setShowChatWindow(true);
      setNewChatNumber("");
      toast.info('Abrindo conversa existente');
      if (existingChat.id && existingChat.id !== "temp") {
        void clearUnreadCount(existingChat.id);
      }
      return;
    }

    // Create temp chat for new conversation
    // Important: chat_id is the WhatsApp JID format; contact_number is digits with country code.
    const tempChat = {
      id: 'temp',
      chat_id: `${fullNumber}@s.whatsapp.net`,
      contact_name: displayNumber,
      contact_number: fullNumber,
    };

    setSelectedChat(tempChat);
    setShowChatWindow(true);
    setNewChatNumber("");
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedChatIds(new Set());
  };

  // Toggle chat selection
  const toggleChatSelection = (chatId: string, e?: any) => {
    if (e) {
      e.stopPropagation();
    }
    setSelectedChatIds(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      return next;
    });
  };

  // Select all chats
  const selectAllChats = () => {
    const allIds = new Set(filteredChats.map(c => c.id));
    setSelectedChatIds(allIds);
  };

  // Deselect all chats
  const deselectAllChats = () => {
    setSelectedChatIds(new Set());
  };

  // Bulk delete selected chats
  const handleBulkDelete = async () => {
    if (selectedChatIds.size === 0) return;
    setIsDeleting(true);

    const idsToDelete = Array.from(selectedChatIds);

    try {
      // Use backend function (same flow as individual delete) and batch to avoid URL/request limits
      const BATCH_SIZE = 50;
      let totalDeleted = 0;

      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);

        const { error } = await supabase.functions.invoke("whatsapp-delete-chat", {
          body: { chat_ids: batch },
        });

        if (error) {
          throw new Error(`Lote ${batchNumber}: ${error.message || "Erro ao excluir"}`);
        }

        totalDeleted += batch.length;
      }

      toast.success(`${totalDeleted} chat(s) excluído(s) com sucesso!`);

      // Update local state
      setChats((prev) => prev.filter((c) => !selectedChatIds.has(c.id)));
      setFilteredChats((prev) => prev.filter((c) => !selectedChatIds.has(c.id)));

      // Clear selection
      setSelectedChatIds(new Set());
      setIsSelectionMode(false);
      setDeleteDialogOpen(false);

      // Clear selected chat if it was deleted
      if (selectedChat && selectedChatIds.has(selectedChat.id)) {
        setSelectedChat(null);
        setShowChatWindow(false);
      }
    } catch (error: any) {
      console.error("Error deleting chats:", error);
      toast.error(`Erro ao excluir chats: ${error?.message || "Erro desconhecido"}`);
    } finally {
      setIsDeleting(false);
    }
  };
  const allSelected = filteredChats.length > 0 && filteredChats.every(c => selectedChatIds.has(c.id));
  const someSelected = selectedChatIds.size > 0;

  // Determina se deve mostrar o header principal (esconde no mobile quando chat está aberto)
  const showMainHeader = !isMobile || !showChatWindow || !selectedChat;

  // No mobile com chat aberto, usa layout de tela cheia
  const isMobileChatOpen = isMobile && showChatWindow && selectedChat;
  return <div className={`flex flex-col overflow-hidden -m-4 md:-m-6 p-4 md:p-6 ${isMobileChatOpen ? 'fixed inset-0 z-40 bg-background pt-16' : 'h-[calc(100vh-4rem)] md:h-screen'}`}>
      {/* Top Header - esconde no mobile quando chat está aberto */}
      {/* Top Header - Título e status */}
      {showMainHeader && <div className="flex-shrink-0 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-6 h-6" />
              <h1 className="text-2xl font-bold">WhatsApp</h1>
              {mainInstance && (
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-sm text-muted-foreground">({mainInstance.nome})</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setEditingName(mainInstance.nome || "");
                      setEditNameDialogOpen(true);
                    }}
                    title="Editar nome"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              )}
              
              {/* Status Badge - Mobile (only show when connected or loading) */}
              {isMobile && (
                connectionStatus === 'connected' ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1 text-green-600 border-green-600 h-6 px-2 text-xs ml-auto"
                    onClick={() => setManageDialogOpen(true)}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Conectado
                  </Button>
                ) : connectionStatus === 'loading' ? (
                  <Badge variant="outline" className="gap-1 h-6 px-2 text-xs ml-auto">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </Badge>
                ) : null
              )}
            </div>
            
            {/* Desktop: Status/Action Button */}
            <div className="flex items-center gap-3">
              {!isMobile && (
                connectionStatus === 'connected' ? (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-1 text-green-600 border-green-600 h-8 px-3"
                    onClick={() => setManageDialogOpen(true)}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Conectado
                  </Button>
                ) : connectionStatus === 'loading' ? (
                  <Badge variant="outline" className="gap-1 h-8 px-3">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Verificando...
                  </Badge>
                ) : null
              )}
            </div>
          </div>
        </div>}

      {/* Search and actions bar - Same as Disparos layout */}
      {showMainHeader && <div className="flex-shrink-0 border-b bg-card px-4 py-2">
          {uazapiAuthError && (
            <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm">
                  <p className="font-medium text-destructive">Não foi possível sincronizar: credencial inválida</p>
                  <p className="text-muted-foreground">{uazapiAuthError}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/configuracoes?tab=conexoes">Ir para Conexões</Link>
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Input
                placeholder="Buscar por nome ou número..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9"
              />
            </div>
            
            {/* View mode toggle */}
            {!isMobile && (
              <div className="flex items-center border rounded-lg overflow-hidden">
                <Button
                  size="sm"
                  variant={viewMode === "list" ? "default" : "ghost"}
                  className="rounded-none h-8"
                  onClick={() => setViewMode("list")}
                >
                  <LayoutList className="h-4 w-4" />
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
            <Button
              size="sm"
              variant={filterUnreadOnly ? "default" : "outline"}
              className="h-8 w-8 p-0 flex-shrink-0"
              onClick={() => setFilterUnreadOnly(prev => !prev)}
              title={filterUnreadOnly ? "Mostrar todos os chats" : "Mostrar apenas não lidos"}
            >
              <BellRing className="h-4 w-4" />
            </Button>

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
                    Selecione o país e digite o número para iniciar uma nova conversa
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Número de telefone</Label>
                    <CountryCodeSelect 
                      value={newChatCountryCode} 
                      onChange={setNewChatCountryCode}
                      phoneValue={formatPhoneByCountry(newChatNumber, newChatCountryCode)}
                      onPhoneChange={(val) => setNewChatNumber(stripCountryCode(val, newChatCountryCode))}
                      placeholder={getPhonePlaceholder(newChatCountryCode)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Digite apenas o número local, sem o código do país
                    </p>
                  </div>
                  <Button onClick={createTempChat} className="w-full">
                    Iniciar Conversa
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Button
              size="sm"
              variant="outline"
              onClick={syncChats}
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

            {/* Instance Manager / Connect button */}
            {connectionStatus !== 'connected' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!mainInstance) {
                    setNewInstanceName("");
                    setCreateInstanceDialogOpen(true);
                  } else {
                    setManageDialogOpen(true);
                  }
                }}
                disabled={isCreatingInstance}
              >
                {isCreatingInstance ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {/* Selection actions */}
          {isSelectionMode && viewMode === "list" && (
            <div className="flex items-center justify-between mt-2 p-2 bg-muted rounded-lg">
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
        </div>}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir chats selecionados?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a excluir {selectedChatIds.size} chat(s). 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Layout Mobile */}
      {isMobile ? <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
              {/* Se há um chat selecionado, mostra o ChatWindow em tela cheia (abaixo do header mobile) */}
              {showChatWindow && selectedChat ? <div className="fixed top-16 left-0 right-0 bottom-0 z-50 bg-background flex flex-col">
                  <ChatWindow chat={selectedChat} initialMessage={prefillMessage} instanciaId={mainInstance?.id} onMessagesRead={() => {
              if (selectedChat?.id && selectedChat.id !== "temp") {
                void clearUnreadCount(selectedChat.id);
              }
            }} onChatDeleted={() => {
              setSelectedChat(null);
              setShowChatWindow(false);
              setPrefillMessage(null);
              loadChats();
            }} onChatUpdated={handleChatUpdated} availableChats={chats} onBack={() => {
              setSelectedChat(null);
              setShowChatWindow(false);
              setPrefillMessage(null);
            }} />
                </div> : (/* Lista de conversas no estilo WhatsApp */
          <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Lista de conversas com scroll */}
                  <div className="flex-1 overflow-y-auto">
                    {filteredChats.length === 0 ? <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <MessageSquare className="w-16 h-16 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Nenhum chat encontrado</h3>
                        <p className="text-muted-foreground mb-4">
                          {hasConfig ? 'Clique em "Sincronizar" para buscar seus chats' : 'Configure suas credenciais UAZapi primeiro'}
                        </p>
                      </div> : filteredChats.map(chat => <div key={chat.id} className={`flex items-center gap-3 px-4 py-3 border-b cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors ${selectedChatIds.has(chat.id) ? 'bg-accent/70' : ''}`} onClick={() => isSelectionMode ? toggleChatSelection(chat.id) : handleChatSelect(chat)}>
                          {/* Checkbox no modo seleção */}
                          {isSelectionMode && <Checkbox checked={selectedChatIds.has(chat.id)} onCheckedChange={() => toggleChatSelection(chat.id)} onClick={e => e.stopPropagation()} className="flex-shrink-0" />}
                          
                          {/* Avatar */}
                          <div className="relative flex-shrink-0">
                            <ChatAvatar chat={chat} size="lg" />
                          </div>

                          {/* Conteúdo do card */}
                          <div className="flex-1 min-w-0">
                            {/* Linha 1: Nome e horário */}
                            <div className="flex items-center justify-between mb-0.5">
                              <h3 className="font-semibold text-foreground truncate pr-2">
                                {chat.contact_name}
                              </h3>
                              <span className={`text-xs flex-shrink-0 ${chat.unread_count > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
                                {chat.last_message_time ? formatRelativeTime(chat.last_message_time) : ''}
                              </span>
                            </div>

                            {/* Linha 2: Telefone */}
                            <p className="text-xs text-muted-foreground mb-0.5">
                              {formatPhoneNumber(chat.contact_number)}
                            </p>

                            {/* Linha 3: Prévia da mensagem e badge */}
                            <div className="flex items-center justify-between">
                              <p className="text-sm text-muted-foreground truncate pr-2">
                                {formatLastMessagePreview(chat.last_message)}
                              </p>
                              {chat.unread_count > 0 && <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs flex-shrink-0 rounded-full">
                                  {chat.unread_count}
                                </Badge>}
                            </div>
                          </div>
                        </div>)}
                  </div>
                </div>)}
            </div> : (/* Layout Desktop */
        viewMode === "kanban" ? (/* Visualização Kanban */
        <ResizablePanelGroup 
          key={selectedChat ? "kanban-with-chat" : "kanban-no-chat"}
          direction="horizontal" 
          className="flex-1 min-h-0"
        >
          <ResizablePanel defaultSize={selectedChat ? 65 : 100} minSize={30} className="min-h-0">
            <div className="h-full flex flex-col overflow-hidden min-h-0">
              <WhatsAppKanban 
                chats={filteredChats} 
                onChatSelect={handleChatSelect} 
                selectedChatId={selectedChat?.id}
                onChatsDeleted={({ ids, normalizedNumbers }) => {
                  setChats((prev) => prev.filter((c) => !ids.includes(c.id) && !normalizedNumbers.includes((c.normalized_number || '').toString())));
                  setFilteredChats((prev) => prev.filter((c) => !ids.includes(c.id) && !normalizedNumbers.includes((c.normalized_number || '').toString())));
                  if (selectedChat?.id && (ids.includes(selectedChat.id) || normalizedNumbers.includes((selectedChat.normalized_number || '').toString()))) {
                    setSelectedChat(null);
                    setShowChatWindow(false);
                  }
                  loadChats();
                }}
              />
            </div>
          </ResizablePanel>
          {selectedChat && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={35} minSize={25} maxSize={60} className="min-h-0">
                <div className="h-full flex flex-col overflow-hidden min-h-0">
                  <ChatWindow chat={selectedChat} initialMessage={prefillMessage} instanciaId={mainInstance?.id} onMessagesRead={() => {
                    if (selectedChat?.id && selectedChat.id !== "temp") {
                      void clearUnreadCount(selectedChat.id);
                    }
                  }} onChatUpdated={handleChatUpdated} availableChats={chats} onBack={() => { setSelectedChat(null); setPrefillMessage(null); }} />
                </div>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
        ) : (/* Layout Desktop Lista - Resizable */
        <ResizablePanelGroup direction="horizontal" className="flex-1">
                <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                  <div className="h-full flex flex-col overflow-hidden border-r">
                  {/* Lista de chats com scroll */}
                  <div className="flex-1 overflow-y-auto">
                    {filteredChats.length === 0 ? <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <MessageSquare className="w-16 h-16 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">Nenhum chat encontrado</h3>
                        <p className="text-muted-foreground mb-4">
                          {hasConfig ? 'Clique em "Sincronizar" para buscar seus chats' : 'Configure suas credenciais UAZapi primeiro'}
                        </p>
                      </div> : filteredChats.map(chat => <Card key={chat.id} className={`p-4 rounded-none border-0 border-b cursor-pointer hover:bg-accent transition-colors ${selectedChat?.id === chat.id ? 'bg-accent' : ''} ${selectedChatIds.has(chat.id) ? 'bg-accent/70' : ''}`} onClick={() => isSelectionMode ? toggleChatSelection(chat.id) : handleChatSelect(chat)}>
                          <div className="flex items-start gap-3">
                            {/* Checkbox no modo seleção */}
                            {isSelectionMode && <Checkbox checked={selectedChatIds.has(chat.id)} onCheckedChange={() => toggleChatSelection(chat.id)} onClick={e => e.stopPropagation()} className="mt-1 flex-shrink-0" />}
                            <ChatAvatar chat={chat} size="lg" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h3 className="font-semibold truncate">{chat.contact_name}</h3>
                                {chat.last_message_time && <span className="text-xs text-muted-foreground flex-shrink-0">
                                    {formatRelativeTime(chat.last_message_time)}
                                  </span>}
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground truncate flex-1 min-w-0">
                                  {formatLastMessagePreview(chat.last_message)}
                                </p>
                                {chat.unread_count > 0 && <Badge variant="default" className="h-5 min-w-5 px-1.5 text-xs rounded-full flex-shrink-0 ml-2">
                                    {chat.unread_count}
                                  </Badge>}
                              </div>
                            </div>
                          </div>
                        </Card>)}
                  </div>
                </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Coluna 2: Chat Window */}
                <ResizablePanel defaultSize={70} minSize={40}>
                  <div className="h-full flex flex-col overflow-hidden">
                    {selectedChat ? <ChatWindow chat={selectedChat} initialMessage={prefillMessage} instanciaId={mainInstance?.id} onMessagesRead={() => {
                if (selectedChat?.id && selectedChat.id !== "temp") {
                  void clearUnreadCount(selectedChat.id);
                }
              }} onChatUpdated={handleChatUpdated} availableChats={chats} /> : <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                          <MessageSquare className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">
                            Selecione um chat para começar
                          </p>
                        </div>
                      </div>}
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>))}

      {/* QR Code / Pairing Code Dialog */}
      <Dialog open={qrCodeDialogOpen} onOpenChange={(open) => {
        if (!open && qrPollingInterval) {
          clearInterval(qrPollingInterval);
          setQrPollingInterval(null);
        }
        if (!open) {
          setPairingCode(null);
          setPairingCodePhone("");
          setConnectionMethod("qrcode");
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
            
            <Button variant="outline" size="sm" onClick={refreshQrCode} disabled={qrCodeLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${qrCodeLoading ? 'animate-spin' : ''}`} />
              Atualizar QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Instance Dialog */}
      <Dialog open={createInstanceDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setConnectionMethod("qrcode");
          setNewInstanceName("");
          setManualBaseUrl("");
          setManualApiKey("");
          setPairingCodePhone("");
          setPairingCode(null);
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
              variant={connectionMethod === "qrcode" ? "default" : "outline"}
              size="sm"
              onClick={() => setConnectionMethod("qrcode")}
              className="flex-1"
            >
              <QrCode className="h-4 w-4 mr-1" />
              QR Code
            </Button>
            <Button
              variant={connectionMethod === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setConnectionMethod("manual")}
              className="flex-1"
            >
              <Keyboard className="h-4 w-4 mr-1" />
              Manual
            </Button>
          </div>

          {/* QR Code Flow */}
          {connectionMethod === "qrcode" && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome da instância</Label>
                <Input
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Ex: WhatsApp Principal"
                  className="mt-1"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setCreateInstanceDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={() => handleCreateInstance(newInstanceName, false)}
                  disabled={isCreatingInstance}
                >
                  {isCreatingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar e Conectar"}
                </Button>
              </div>
            </div>
          )}

          {/* Manual Connection */}
          {connectionMethod === "manual" && (
            <div className="space-y-4 pt-2">
              <div>
                <Label>Nome</Label>
                <Input
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
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
                    if (!newInstanceName.trim() || !manualBaseUrl.trim() || !manualApiKey.trim()) {
                      toast.error("Preencha todos os campos");
                      return;
                    }
                    
                    setIsCreatingInstance(true);
                    try {
                      if (!user?.id) {
                        toast.error("Faça login novamente");
                        return;
                      }

                      const { data: session } = await supabase.auth.getSession();

                      // 1) Create/update a real instance record (shared table)
                      const { data: createdInstance, error: instanceError } = await supabase
                        .from("disparos_instancias")
                        .insert({
                          user_id: user.id,
                          nome: newInstanceName.trim(),
                          instance_name: newInstanceName.trim(),
                          base_url: manualBaseUrl.trim(),
                          api_key: manualApiKey.trim(),
                          is_active: true,
                          updated_at: new Date().toISOString(),
                        })
                        .select("id, nome, base_url, api_key")
                        .single();

                      if (instanceError) throw instanceError;

                      // 2) Link this instance as the main WhatsApp instance
                      const { data: uazapiCfg, error: cfgError } = await supabase
                        .from("uazapi_config")
                        .upsert(
                          {
                            user_id: user.id,
                            whatsapp_instancia_id: createdInstance.id,
                            base_url: manualBaseUrl.trim(),
                            api_key: manualApiKey.trim(),
                            instance_name: newInstanceName.trim(),
                            is_active: true,
                            updated_at: new Date().toISOString(),
                          },
                          { onConflict: "user_id" }
                        )
                        .select("id")
                        .single();

                      if (cfgError) throw cfgError;

                      // 3) Configure webhook pointing to this instance id
                      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook/${user.id}/${createdInstance.id}`;

                      const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
                        headers: { Authorization: `Bearer ${session.session?.access_token}` },
                        body: {
                          base_url: manualBaseUrl.trim(),
                          api_key: manualApiKey.trim(),
                          webhook_url: webhookUrl,
                          instancia_id: createdInstance.id,
                        },
                      });

                      if (webhookResponse.data?.success) {
                        toast.success("Webhook configurado!");
                      } else {
                        toast.warning("Webhook não foi configurado automaticamente.");
                      }

                      // 4) Close dialog + reset fields
                      setCreateInstanceDialogOpen(false);
                      setNewInstanceName("");
                      setManualBaseUrl("");
                      setManualApiKey("");

                      // 5) Check connection, if not connected show QR
                      const statusResponse = await supabase.functions.invoke("uazapi-check-status", {
                        headers: { Authorization: `Bearer ${session.session?.access_token}` },
                        body: { base_url: createdInstance.base_url, api_key: createdInstance.api_key },
                      });

                      const isConnected =
                        statusResponse.data?.success === true ||
                        statusResponse.data?.status === "connected";

                      if (isConnected) {
                        toast.success("WhatsApp já está conectado!");
                        setConnectionStatus("connected");
                        await checkConfig();
                        return;
                      }

                      toast.info("Escaneie o QR code para conectar o WhatsApp");
                      setQrCodeDialogOpen(true);
                      setQrCodeLoading(true);
                      setQrCodeData(null);

                      const qrResponse = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
                        headers: { Authorization: `Bearer ${session.session?.access_token}` },
                        body: { base_url: createdInstance.base_url, api_key: createdInstance.api_key },
                      });

                      if (qrResponse.data?.connected) {
                        toast.success("WhatsApp conectado!");
                        setQrCodeDialogOpen(false);
                        setConnectionStatus("connected");
                        await checkConfig();
                        return;
                      }

                      if (qrResponse.data?.qrcode) {
                        setQrCodeData(qrResponse.data.qrcode);
                        setQrCodeLoading(false);
                        startQrPolling(createdInstance.base_url, createdInstance.api_key, {
                          id: createdInstance.id,
                          base_url: createdInstance.base_url,
                          api_key: createdInstance.api_key,
                          nome: createdInstance.nome,
                        });
                      } else {
                        setQrCodeDialogOpen(false);
                        setQrCodeLoading(false);
                        toast.error(qrResponse.data?.error || "Não foi possível obter o QR Code");
                      }

                      void uazapiCfg; // keep to avoid unused in case of future debugging
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
        open={editNameDialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditingName("");
          setEditNameDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar nome da instância</DialogTitle>
            <DialogDescription>
              Altere o nome exibido para esta conexão.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            <div>
              <Label>Novo nome</Label>
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="Ex: WhatsApp Clínica"
                className="mt-1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditNameDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveInstanceName} disabled={savingName}>
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Instance Dialog */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerenciar Instância</DialogTitle>
            <DialogDescription>
              Gerencie sua conexão WhatsApp
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            {!mainInstance ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <QrCode className="h-12 w-12 text-muted-foreground mb-4" />
                <h2 className="text-lg font-medium mb-2">Nenhuma instância configurada</h2>
                <p className="text-muted-foreground mb-4">
                  Crie uma instância e escaneie o QR Code para começar
                </p>
                <Button onClick={() => { setManageDialogOpen(false); setCreateInstanceDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Instância
                </Button>
              </div>
            ) : (
              <Card className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      connectionStatus === 'connected' ? 'bg-green-500' : 
                      connectionStatus === 'loading' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                    }`} />
                    <div className="min-w-0">
                      <h4 className="font-medium truncate">{mainInstance.nome}</h4>
                      <p className="text-xs text-muted-foreground">
                        {connectionStatus === 'connected' ? 'Conectado' : 
                         connectionStatus === 'loading' ? 'Verificando...' : 'Desconectado'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end sm:justify-start">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingName(mainInstance.nome || "");
                        setManageDialogOpen(false);
                        setEditNameDialogOpen(true);
                      }}
                      title="Editar nome"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {connectionStatus === 'connected' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive h-8 px-2 sm:px-3"
                        onClick={() => {
                          handleDisconnect();
                        }}
                      >
                        <Unplug className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Desconectar</span>
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8 px-2 sm:px-3"
                        onClick={() => {
                          setManageDialogOpen(false);
                          handleOpenQrCode();
                        }}
                        disabled={connectionStatus === 'loading'}
                      >
                        {connectionStatus === 'loading' ? (
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
                      onClick={() => checkConnectionStatus(mainInstance.base_url, mainInstance.api_key)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteInstanceConfirmOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Instance Confirmation */}
      <AlertDialog open={deleteInstanceConfirmOpen} onOpenChange={setDeleteInstanceConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação irá remover a instância "{mainInstance?.nome}" completamente. 
              Você precisará configurar uma nova conexão para usar o WhatsApp.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingInstance}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteInstance}
              disabled={deletingInstance}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingInstance ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>;
}