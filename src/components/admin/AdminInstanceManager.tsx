import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Smartphone, 
  Loader2, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  QrCode,
  Wifi,
  WifiOff,
  Hash,
  Copy
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";


interface AdminInstance {
  id: string;
  nome: string;
  base_url: string;
  api_key: string;
  instance_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface ConnectionStatus {
  connected: boolean;
  phone?: string;
  loading: boolean;
}

interface AdminInstanceManagerProps {
  onInstancesChange?: () => void;
}

export function AdminInstanceManager({ onInstancesChange }: AdminInstanceManagerProps = {}) {
  const [instances, setInstances] = useState<AdminInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({});
  
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMode, setAddMode] = useState<'qrcode' | 'manual'>('qrcode');
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newInstanceUrl, setNewInstanceUrl] = useState("");
  const [newInstanceApiKey, setNewInstanceApiKey] = useState("");
  const [adding, setAdding] = useState(false);
  
  // QR Code dialog (for connecting existing instances)
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [selectedInstanceForQr, setSelectedInstanceForQr] = useState<AdminInstance | null>(null);
  
  // Pairing Code state (for manual connection mode in QR dialog)
  const [connectionMode, setConnectionMode] = useState<'qrcode' | 'paircode' | 'credentials'>('qrcode');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState("");
  
  // Credentials mode state (for connecting via URL + API Key)
  const [credentialsUrl, setCredentialsUrl] = useState("");
  const [credentialsApiKey, setCredentialsApiKey] = useState("");
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  
  // Polling ref
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadInstances();
    
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const loadInstances = async () => {
    setLoading(true);
    try {
      const adminToken = localStorage.getItem("admin_token");
      
      // Use edge function with admin token to fetch instances (works without Supabase Auth)
      const { data: response, error } = await supabase.functions.invoke("admin-manage-users", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { action: "list_notification_instances" },
      });

      if (error) throw error;
      if (!response?.success) throw new Error(response?.error || "Erro ao carregar instâncias");
      
      const instancesData = response.instances || [];
      setInstances(instancesData);
      
      // Check connection status for each instance
      for (const instance of instancesData) {
        checkConnectionStatus(instance);
      }
    } catch (error) {
      console.error("Erro ao carregar instâncias:", error);
      toast.error("Erro ao carregar instâncias");
    } finally {
      setLoading(false);
    }
  };

  const checkConnectionStatus = async (instance: AdminInstance) => {
    setConnectionStatus(prev => ({
      ...prev,
      [instance.id]: { connected: false, loading: true }
    }));

    try {
      const adminToken = localStorage.getItem("admin_token");
      
      // Use uazapi-test-connection like Disparos does for reliable status
      const { data, error } = await supabase.functions.invoke("uazapi-test-connection", {
        body: { 
          base_url: instance.base_url,
          api_key: instance.api_key
        },
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (error) throw error;

      const details = data?.details;
      const isConnected = data?.success === true;
      const phone = details?.jid ? String(details.jid).split("@")[0] : undefined;

      setConnectionStatus(prev => ({
        ...prev,
        [instance.id]: { 
          connected: isConnected,
          phone: phone,
          loading: false 
        }
      }));
    } catch (error) {
      console.error("Erro ao verificar status:", error);
      setConnectionStatus(prev => ({
        ...prev,
        [instance.id]: { connected: false, loading: false }
      }));
    }
  };

  const handleAddInstance = async () => {
    const adminToken = localStorage.getItem("admin_token");
    if (!adminToken) {
      toast.error("Faça login no painel admin novamente.");
      return;
    }

    // Validação
    if (!newInstanceName.trim()) {
      toast.error("Preencha o nome da instância");
      return;
    }

    setAdding(true);
    try {
      // QR Code mode (igual outras abas): provisiona no servidor via token admin; só precisa do nome
      if (addMode === "qrcode") {
        const { data, error } = await supabase.functions.invoke("admin-notification-create-instance", {
          body: { instance_name: newInstanceName.trim() },
          headers: { Authorization: `Bearer ${adminToken}` },
        });

        if (error) throw error;
        if (!data?.success || !data?.instance) {
          throw new Error(data?.error || "Não foi possível criar a instância");
        }

        const created: AdminInstance = data.instance;

        setInstances((prev) => [created, ...prev]);
        setNewInstanceName("");
        setNewInstanceUrl("");
        setNewInstanceApiKey("");
        setAddDialogOpen(false);
        toast.success("Instância criada! Agora conecte o WhatsApp.");
        onInstancesChange?.();

        // Se o backend já retornou um QR, mostramos direto; senão buscamos.
        setSelectedInstanceForQr(created);
        setQrDialogOpen(true);
        setQrCode(null);
        setPairingCode(null);
        setPairingPhoneNumber("");
        setConnectionMode("qrcode");
        if (data?.qrcode) {
          setQrCode(data.qrcode);
          startPolling(created);
        } else {
          // fallback: gerar QR via função existente
          setTimeout(() => handleGetQrCode(created), 50);
        }

        return;
      }

      // Manual mode: administrador informa URL + token
      if (!newInstanceUrl.trim() || !newInstanceApiKey.trim()) {
        toast.error("Preencha URL Base e Token");
        return;
      }

      const baseUrl = newInstanceUrl.trim().replace(/\/+$/, "");
      const apiKey = newInstanceApiKey.trim();

      // Use edge function to bypass RLS
      const { data: response, error } = await supabase.functions.invoke("admin-manage-users", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          action: "create_notification_instance",
          nome: newInstanceName.trim(),
          base_url: baseUrl,
          api_key: apiKey,
        },
      });

      if (error) throw error;
      if (!response?.success) throw new Error(response?.error || "Erro ao criar instância");

      const data = response.instance;

      setInstances((prev) => [data, ...prev]);
      setNewInstanceName("");
      setNewInstanceUrl("");
      setNewInstanceApiKey("");
      setAddDialogOpen(false);
      toast.success("Instância adicionada com sucesso!");
      onInstancesChange?.();

      // Abrir conexão
      setTimeout(() => handleGetQrCode(data), 50);
    } catch (error) {
      console.error("Erro ao adicionar instância:", error);
      toast.error((error as any)?.message || "Erro ao adicionar instância");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteInstance = async (instanceId: string) => {
    try {
      const adminToken = localStorage.getItem("admin_token");
      
      // Find the instance to get its details for UAZAPI deletion
      const instancia = instances.find(i => i.id === instanceId);
      
      // First, try to delete from UAZAPI server
      if (instancia) {
        try {
          await supabase.functions.invoke("uazapi-admin-delete-instance", {
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
              instance_name: instancia.instance_name || instancia.nome || instanceId,
              base_url: instancia.base_url,
              api_key: instancia.api_key,
            },
          });
          console.log("Instance deleted from UAZAPI server");
        } catch (e) {
          console.log("UAZAPI admin delete call failed (continuing with local deletion):", e);
        }
      }

      // Then delete from database
      const { data, error } = await supabase.functions.invoke("admin-manage-users", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          action: "delete_notification_instance",
          instanceId,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Não foi possível remover a instância");

      setInstances(prev => prev.filter(i => i.id !== instanceId));
      toast.success("Instância removida com sucesso!");
      onInstancesChange?.();
    } catch (error: any) {
      console.error("Erro ao remover instância:", error);
      toast.error(error?.message || "Erro ao remover instância");
    }
  };

  const handleGetQrCode = async (instance: AdminInstance) => {
    setSelectedInstanceForQr(instance);
    setQrDialogOpen(true);
    setQrLoading(true);
    setQrCode(null);
    setConnectionMode('qrcode');
    setPairingCode(null);
    setPairingPhoneNumber("");

    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      const adminToken = localStorage.getItem("admin_token");
      const { data, error } = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        body: { 
          base_url: instance.base_url,
          api_key: instance.api_key
        },
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (error) throw error;

      if (data?.connected) {
        toast.success("Instância já está conectada!");
        setQrDialogOpen(false);
        setConnectionStatus(prev => ({
          ...prev,
          [instance.id]: { connected: true, loading: false }
        }));
        return;
      }

      if (data?.qrcode) {
        setQrCode(data.qrcode);
        startPolling(instance);
      } else {
        toast.error(data?.error || "Não foi possível obter o QR Code");
      }
    } catch (error) {
      console.error("Erro ao obter QR Code:", error);
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrLoading(false);
    }
  };

  const handleGetPairingCode = async () => {
    if (!selectedInstanceForQr) return;
    
    if (!pairingPhoneNumber.trim()) {
      toast.error("Digite o número do WhatsApp que será conectado");
      return;
    }

    setQrLoading(true);
    setPairingCode(null);

    try {
      const adminToken = localStorage.getItem("admin_token");
      
      const response = await supabase.functions.invoke("uazapi-get-pairing-code", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { 
          base_url: selectedInstanceForQr.base_url, 
          api_key: selectedInstanceForQr.api_key,
          phone_number: pairingPhoneNumber.replace(/\D/g, '')
        },
      });

      if (response.data?.connected) {
        toast.success("WhatsApp já está conectado!");
        setQrDialogOpen(false);
        setConnectionStatus(prev => ({ 
          ...prev, 
          [selectedInstanceForQr.id]: { connected: true, loading: false } 
        }));
        return;
      }

      if (response.data?.pairingCode) {
        setPairingCode(response.data.pairingCode);
        startPolling(selectedInstanceForQr);
      } else {
        toast.error(response.data?.error || "Não foi possível obter o código de pareamento");
      }
    } catch (error: any) {
      console.error("Pairing code error:", error);
      toast.error("Erro ao obter código de pareamento");
    } finally {
      setQrLoading(false);
    }
  };

  const startPolling = (instance: AdminInstance) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Same logic as Disparos: skip initial polls, require multiple confirmations
    let pollCount = 0;
    const minPollsBeforeConnect = 2; // ~10s
    let confirmedCount = 0;
    const requiredConfirmations = 3; // require stability for ~15s

    const interval = setInterval(async () => {
      pollCount++;
      try {
        const adminToken = localStorage.getItem("admin_token");
        
        const response = await supabase.functions.invoke("uazapi-test-connection", {
          headers: { Authorization: `Bearer ${adminToken}` },
          body: { base_url: instance.base_url, api_key: instance.api_key },
        });

        const details = response.data?.details;
        const apiSaysLoggedIn = details?.loggedIn === true;
        const apiJid = details?.jid;
        const apiConnected = details?.connected === true;

        // Only accept a STRONG, stable signal
        const strongSignal = apiSaysLoggedIn && Boolean(apiJid) && apiConnected;

        console.log("[Admin QR Poll]", {
          pollCount,
          confirmedCount,
          success: response.data?.success,
          apiSaysLoggedIn,
          apiJid,
          apiConnected,
          details,
        });

        // Wait for minimum polls before considering connection
        if (pollCount < minPollsBeforeConnect) return;

        if (strongSignal) {
          confirmedCount++;
        } else {
          confirmedCount = 0;
        }

        if (confirmedCount >= requiredConfirmations) {
          console.log("[Admin] Connection confirmed (stable)! Closing dialog and configuring webhook...");
          clearInterval(interval);
          pollingIntervalRef.current = null;
          setQrDialogOpen(false);
          
          const phone = apiJid ? String(apiJid).split("@")[0] : undefined;
          setConnectionStatus(prev => ({ 
            ...prev, 
            [instance.id]: { connected: true, phone, loading: false } 
          }));
          toast.success("WhatsApp conectado com sucesso!");
          
          // Configure webhook after successful connection (same as Disparos)
          try {
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "rgaqvlsjaapjhlhevsrf";
            const webhookUrl = `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook?instance=${instance.id}`;
            
            const webhookResponse = await supabase.functions.invoke("uazapi-set-webhook", {
              headers: { Authorization: `Bearer ${adminToken}` },
              body: {
                base_url: instance.base_url,
                api_key: instance.api_key,
                webhook_url: webhookUrl,
                instancia_id: instance.id,
              },
            });

            if (webhookResponse.data?.success) {
              console.log("[Admin] Webhook configured successfully");
              toast.success("Webhook configurado automaticamente!");
            } else {
              console.warn("[Admin] Webhook config failed:", webhookResponse.data);
              toast.warning("Webhook não configurado automaticamente");
            }
          } catch (webhookError) {
            console.error("[Admin] Error configuring webhook:", webhookError);
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 5000);

    pollingIntervalRef.current = interval;
    
    // Auto-stop after 2 minutes
    setTimeout(() => {
      if (pollingIntervalRef.current === interval) {
        clearInterval(interval);
        pollingIntervalRef.current = null;
      }
    }, 120000);
  };

  const copyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode.replace("-", ""));
      toast.success("Código copiado!");
    }
  };

  const toggleInstanceActive = async (instance: AdminInstance) => {
    try {
      const { error } = await supabase
        .from("admin_notification_instances")
        .update({ is_active: !instance.is_active })
        .eq("id", instance.id);

      if (error) throw error;

      setInstances(prev => 
        prev.map(i => i.id === instance.id ? { ...i, is_active: !i.is_active } : i)
      );
      toast.success(instance.is_active ? "Instância desativada" : "Instância ativada");
    } catch (error) {
      console.error("Erro ao atualizar instância:", error);
      toast.error("Erro ao atualizar instância");
    }
  };

  const handleCloseQrDialog = () => {
    setQrDialogOpen(false);
    setSelectedInstanceForQr(null);
    setQrCode(null);
    setPairingCode(null);
    setPairingPhoneNumber("");
    setCredentialsUrl("");
    setCredentialsApiKey("");
    setConnectionMode('qrcode');
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const handleConnectWithCredentials = async () => {
    if (!selectedInstanceForQr) return;
    
    if (!credentialsUrl.trim() || !credentialsApiKey.trim()) {
      toast.error("Preencha a URL Base e o Token da instância");
      return;
    }

    setCredentialsLoading(true);

    try {
      const adminToken = localStorage.getItem("admin_token");
      const baseUrl = credentialsUrl.trim().replace(/\/+$/, "");
      const apiKey = credentialsApiKey.trim();

      // First, test if the credentials work and instance is connected
      const { data: testData, error: testError } = await supabase.functions.invoke("uazapi-test-connection", {
        body: { base_url: baseUrl, api_key: apiKey },
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (testError) throw testError;

      const isConnected = testData?.success === true;
      const details = testData?.details;
      const phone = details?.jid ? String(details.jid).split("@")[0] : undefined;

      // Update the instance in database with new credentials via edge function
      const { data: updateResponse, error: updateError } = await supabase.functions.invoke("admin-manage-users", {
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          action: "update_notification_instance",
          instanceId: selectedInstanceForQr.id,
          base_url: baseUrl,
          api_key: apiKey,
        },
      });

      if (updateError) throw updateError;
      if (!updateResponse?.success) throw new Error(updateResponse?.error || "Erro ao atualizar instância");

      // Update local state
      setInstances(prev => 
        prev.map(i => i.id === selectedInstanceForQr.id 
          ? { ...i, base_url: baseUrl, api_key: apiKey } 
          : i
        )
      );

      if (isConnected) {
        setConnectionStatus(prev => ({
          ...prev,
          [selectedInstanceForQr.id]: { connected: true, phone, loading: false }
        }));
        toast.success("Instância conectada com sucesso!");
        setQrDialogOpen(false);
        
        // Configure webhook
        try {
          const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "rgaqvlsjaapjhlhevsrf";
          const webhookUrl = `https://${projectId}.supabase.co/functions/v1/whatsapp-webhook?instance=${selectedInstanceForQr.id}`;
          
          await supabase.functions.invoke("uazapi-set-webhook", {
            headers: { Authorization: `Bearer ${adminToken}` },
            body: {
              base_url: baseUrl,
              api_key: apiKey,
              webhook_url: webhookUrl,
              instancia_id: selectedInstanceForQr.id,
            },
          });
          console.log("[Admin] Webhook configured for credentials connection");
        } catch (webhookError) {
          console.error("[Admin] Error configuring webhook:", webhookError);
        }
      } else {
        toast.info("Credenciais salvas! A instância precisa ser conectada no servidor UAZapi.");
        setConnectionStatus(prev => ({
          ...prev,
          [selectedInstanceForQr.id]: { connected: false, loading: false }
        }));
        // Show QR code option
        setConnectionMode('qrcode');
        handleGetQrCode({ ...selectedInstanceForQr, base_url: baseUrl, api_key: apiKey });
      }
    } catch (error: any) {
      console.error("Erro ao conectar com credenciais:", error);
      toast.error(error?.message || "Erro ao conectar com credenciais");
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleQrDialogOpenChange = (open: boolean) => {
    // IMPORTANT: Radix/shadcn calls onOpenChange for both open/close transitions.
    // We must respect the "open" boolean; otherwise the dialog can close immediately
    // when we try to open it programmatically.
    if (!open) {
      handleCloseQrDialog();
      return;
    }
    setQrDialogOpen(true);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <Smartphone className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <CardTitle className="text-sm sm:text-2xl leading-tight">Instância WhatsApp do Admin</CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5">
                Configure a instância WhatsApp para enviar avisos
              </CardDescription>
            </div>
          </div>
          
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Instância
              </Button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-md sm:mx-auto">
              <DialogHeader>
                <DialogTitle>Nova Instância</DialogTitle>
                <DialogDescription>
                  Escolha como deseja adicionar sua instância
                </DialogDescription>
              </DialogHeader>
              
              {/* Mode Toggle - QR Code abre dialog automaticamente após salvar */}
              <div className="flex gap-2 justify-center">
                <Button
                  variant={addMode === 'qrcode' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddMode('qrcode')}
                  className="flex-1"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  QR Code
                </Button>
                <Button
                  variant={addMode === 'manual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAddMode('manual')}
                  className="flex-1"
                >
                  <Hash className="h-4 w-4 mr-2" />
                  Manual
                </Button>
              </div>
              
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Nome da instância</Label>
                  <Input
                    placeholder="Ex: WhatsApp Principal"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    className="mt-1"
                  />
                </div>

                {addMode === 'manual' && (
                  <>
                    <div>
                      <Label>URL Base</Label>
                      <Input
                        placeholder="https://sua-instancia.uazapi.com"
                        value={newInstanceUrl}
                        onChange={(e) => setNewInstanceUrl(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Token da Instância</Label>
                      <Input
                        type="password"
                        placeholder="Token de autenticação"
                        value={newInstanceApiKey}
                        onChange={(e) => setNewInstanceApiKey(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={adding}>
                  Cancelar
                </Button>
                <Button onClick={handleAddInstance} disabled={adding}>
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Criar e Conectar"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 p-3 sm:p-6 pt-0">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed rounded-lg mx-0">
            <Smartphone className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-1">Nenhuma instância configurada</p>
            <p className="text-xs text-muted-foreground px-2">
              Adicione uma instância WhatsApp para enviar avisos
            </p>
          </div>
        ) : (
          instances.map((instance) => {
            const status = connectionStatus[instance.id];
            
            return (
              <div 
                key={instance.id} 
                className={`p-3 rounded-lg border overflow-hidden ${
                  instance.is_active ? "bg-card" : "bg-muted/50 opacity-60"
                }`}
              >
                {/* Mobile: stacked layout, Desktop: row layout */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  {/* Instance info */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Connection Status Indicator */}
                    <div className="relative flex-shrink-0">
                      {status?.loading ? (
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      ) : status?.connected ? (
                        <Wifi className="h-5 w-5 text-green-500" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-sm truncate max-w-[120px] sm:max-w-none">{instance.nome}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                          status?.connected 
                            ? "bg-green-500/20 text-green-600" 
                            : "bg-red-500/20 text-red-600"
                        }`}>
                          {status?.loading ? "..." : status?.connected ? "On" : "Off"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <span className="truncate max-w-[100px] sm:max-w-[180px]">{instance.base_url}</span>
                        {status?.phone && (
                          <span className="text-green-600 flex-shrink-0">• {status.phone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Actions - row on mobile, stays on right on desktop */}
                  <div className="flex items-center gap-1 sm:gap-2 justify-end flex-shrink-0">
                    {/* Refresh Status */}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => checkConnectionStatus(instance)}
                      disabled={status?.loading}
                    >
                      <RefreshCw className={`h-4 w-4 ${status?.loading ? "animate-spin" : ""}`} />
                    </Button>
                    
                    {/* QR Code Button */}
                    {!status?.connected && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="h-8 px-2 sm:px-3"
                        onClick={() => handleGetQrCode(instance)}
                      >
                        <QrCode className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Conectar</span>
                      </Button>
                    )}
                    
                    {/* Toggle Active */}
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleInstanceActive(instance)}
                    >
                      {instance.is_active ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                    
                    {/* Delete */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="mx-4 sm:mx-auto">
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover Instância</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja remover a instância "{instance.nome}"? 
                            Essa ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteInstance(instance.id)}>
                            Remover
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
      
      {/* QR Code / Pairing Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={handleQrDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {connectionMode === 'qrcode' ? (
                <QrCode className="h-5 w-5" />
              ) : (
                <Hash className="h-5 w-5" />
              )}
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              {selectedInstanceForQr?.nome}
            </DialogDescription>
          </DialogHeader>
          
          {/* Connection Mode Tabs - same as Disparos + Credentials */}
          <div className="flex gap-1 border-b pb-2">
            <Button
              variant={connectionMode === 'qrcode' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setConnectionMode('qrcode');
                setPairingCode(null);
                if (selectedInstanceForQr && !qrCode) {
                  handleGetQrCode(selectedInstanceForQr);
                }
              }}
            >
              <QrCode className="h-4 w-4 mr-2" />
              QR Code
            </Button>
            <Button
              variant={connectionMode === 'paircode' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setConnectionMode('paircode');
                setQrCode(null);
              }}
            >
              <Hash className="h-4 w-4 mr-2" />
              Código
            </Button>
            <Button
              variant={connectionMode === 'credentials' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => {
                setConnectionMode('credentials');
                setQrCode(null);
                setPairingCode(null);
              }}
            >
              <Wifi className="h-4 w-4 mr-2" />
              Credenciais
            </Button>
          </div>
          
          <div className="flex flex-col items-center gap-4 py-4">
            {connectionMode === 'qrcode' ? (
              // QR Code Mode
              <>
                {qrLoading ? (
                  <div className="w-64 h-64 flex items-center justify-center bg-muted rounded-lg">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : qrCode ? (
                  <>
                    <div className="p-4 bg-white rounded-lg shadow-sm">
                      <img 
                        src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} 
                        alt="QR Code"
                        className="w-56 h-56"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Smartphone className="h-4 w-4" />
                      <span>Escaneie com seu WhatsApp</span>
                    </div>
                    {pollingIntervalRef.current && (
                      <div className="flex items-center gap-2 text-xs text-green-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Aguardando conexão...
                      </div>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleGetQrCode(selectedInstanceForQr!)}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Atualizar QR Code
                    </Button>
                  </>
                ) : (
                  <div className="text-center space-y-4">
                    <p className="text-muted-foreground">QR Code não disponível</p>
                    <Button onClick={() => handleGetQrCode(selectedInstanceForQr!)}>
                      <QrCode className="h-4 w-4 mr-2" />
                      Gerar QR Code
                    </Button>
                  </div>
                )}
              </>
            ) : connectionMode === 'paircode' ? (
              // Pairing Code Mode
              <>
                {!pairingCode ? (
                  <div className="w-full space-y-4">
                    <div className="space-y-2">
                      <Label>Número do WhatsApp</Label>
                      <Input
                        placeholder="5511999999999"
                        value={pairingPhoneNumber}
                        onChange={(e) => setPairingPhoneNumber(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Digite o número completo com DDD (sem espaços ou caracteres especiais)
                      </p>
                    </div>
                    <Button 
                      onClick={handleGetPairingCode} 
                      disabled={qrLoading}
                      className="w-full"
                    >
                      {qrLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Gerando código...
                        </>
                      ) : (
                        "Gerar Código de Pareamento"
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Digite este código no seu WhatsApp:
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-3xl font-mono font-bold tracking-widest">
                        {pairingCode}
                      </span>
                      <Button variant="ghost" size="icon" onClick={copyPairingCode}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      No WhatsApp: Configurações → Dispositivos Conectados → Conectar um dispositivo → Conectar com número de telefone
                    </p>
                    {pollingIntervalRef.current && (
                      <div className="flex items-center justify-center gap-2 text-xs text-green-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Aguardando conexão...
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              // Credentials Mode
              <div className="w-full space-y-4">
                <div className="space-y-2">
                  <Label>URL Base da Instância</Label>
                  <Input
                    placeholder="https://sua-instancia.uazapi.com"
                    value={credentialsUrl}
                    onChange={(e) => setCredentialsUrl(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Token da Instância</Label>
                  <Input
                    type="password"
                    placeholder="Token de autenticação"
                    value={credentialsApiKey}
                    onChange={(e) => setCredentialsApiKey(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Use esta opção para conectar uma instância UAZapi existente que já está vinculada a um número.
                </p>
                <Button 
                  onClick={handleConnectWithCredentials} 
                  disabled={credentialsLoading}
                  className="w-full"
                >
                  {credentialsLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Conectando...
                    </>
                  ) : (
                    <>
                      <Wifi className="h-4 w-4 mr-2" />
                      Conectar com Credenciais
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
