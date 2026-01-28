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

export function AdminInstanceManager() {
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
  const [connectionMode, setConnectionMode] = useState<'qrcode' | 'paircode'>('qrcode');
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingPhoneNumber, setPairingPhoneNumber] = useState("");
  
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
      const { data, error } = await supabase
        .from("admin_notification_instances")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInstances(data || []);
      
      // Check connection status for each instance
      for (const instance of data || []) {
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
    // Validação depende do modo
    if (!newInstanceName.trim()) {
      toast.error("Preencha o nome da instância");
      return;
    }
    
    if (addMode === 'manual') {
      if (!newInstanceUrl.trim() || !newInstanceApiKey.trim()) {
        toast.error("Preencha URL Base e API Key");
        return;
      }
    }

    setAdding(true);
    try {
      // Para modo QR Code, usamos placeholders que serão configurados depois
      const baseUrl = addMode === 'manual' ? newInstanceUrl.trim().replace(/\/+$/, "") : "";
      const apiKey = addMode === 'manual' ? newInstanceApiKey.trim() : "";
      
      const { data, error } = await supabase
        .from("admin_notification_instances")
        .insert({
          nome: newInstanceName.trim(),
          base_url: baseUrl,
          api_key: apiKey,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      setInstances(prev => [data, ...prev]);
      setNewInstanceName("");
      setNewInstanceUrl("");
      setNewInstanceApiKey("");
      setAddDialogOpen(false);
      toast.success("Instância adicionada com sucesso!");

      // Se modo manual, verificar se já está conectado e abrir QR se necessário
      if (addMode === 'manual' && baseUrl && apiKey) {
        const adminToken = localStorage.getItem("admin_token");
        const statusResponse = await supabase.functions.invoke("uazapi-check-status", {
          body: { base_url: baseUrl, api_key: apiKey },
          headers: { Authorization: `Bearer ${adminToken}` }
        });

        if (statusResponse.data?.status === "connected" || statusResponse.data?.success) {
          toast.success("WhatsApp já está conectado!");
          setConnectionStatus(prev => ({
            ...prev,
            [data.id]: { connected: true, loading: false }
          }));
        } else {
          // Not connected - show QR code dialog
          setTimeout(() => handleGetQrCode(data), 50);
        }
      }
    } catch (error) {
      console.error("Erro ao adicionar instância:", error);
      toast.error("Erro ao adicionar instância");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteInstance = async (instanceId: string) => {
    try {
      // Primeiro, limpar referências em admin_client_notifications
      const { error: updateError } = await supabase
        .from("admin_client_notifications")
        .update({ admin_instancia_id: null })
        .eq("admin_instancia_id", instanceId);

      if (updateError) {
        console.error("Erro ao limpar referências:", updateError);
        // Continue mesmo com erro - pode não haver referências
      }

      // Agora excluir a instância
      const { error } = await supabase
        .from("admin_notification_instances")
        .delete()
        .eq("id", instanceId);

      if (error) throw error;

      setInstances(prev => prev.filter(i => i.id !== instanceId));
      toast.success("Instância removida com sucesso!");
    } catch (error) {
      console.error("Erro ao remover instância:", error);
      toast.error("Erro ao remover instância");
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
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Instância WhatsApp do Admin</CardTitle>
              <CardDescription>
                Configure a instância WhatsApp que será usada para enviar avisos aos clientes
              </CardDescription>
            </div>
          </div>
          
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Instância
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nova Instância</DialogTitle>
                <DialogDescription>
                  Escolha como deseja adicionar sua instância
                </DialogDescription>
              </DialogHeader>
              
              {/* Mode Toggle - igual às outras abas */}
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
      
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : instances.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <Smartphone className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground mb-2">Nenhuma instância configurada</p>
            <p className="text-xs text-muted-foreground">
              Adicione uma instância WhatsApp para enviar avisos aos clientes
            </p>
          </div>
        ) : (
          instances.map((instance) => {
            const status = connectionStatus[instance.id];
            
            return (
              <div 
                key={instance.id} 
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  instance.is_active ? "bg-card" : "bg-muted/50 opacity-60"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Connection Status Indicator */}
                  <div className="relative">
                    {status?.loading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : status?.connected ? (
                      <Wifi className="h-5 w-5 text-green-500" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  
                  <div>
                    <p className="font-medium">{instance.nome}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="truncate max-w-48">{instance.base_url}</span>
                      {status?.phone && (
                        <span className="text-green-600">• {status.phone}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {/* Status Badge */}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    status?.connected 
                      ? "bg-green-500/20 text-green-600" 
                      : "bg-red-500/20 text-red-600"
                  }`}>
                    {status?.loading ? "Verificando..." : status?.connected ? "Conectado" : "Desconectado"}
                  </span>
                  
                  {/* Refresh Status */}
                  <Button 
                    variant="ghost" 
                    size="icon"
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
                      onClick={() => handleGetQrCode(instance)}
                    >
                      <QrCode className="h-4 w-4 mr-2" />
                      Conectar
                    </Button>
                  )}
                  
                  {/* Toggle Active */}
                  <Button 
                    variant="ghost" 
                    size="icon"
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
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
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
            );
          })
        )}
      </CardContent>
      
      {/* QR Code / Pairing Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={handleCloseQrDialog}>
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
          
          {/* Connection Mode Tabs - same as Disparos */}
          <div className="flex gap-2 border-b pb-2">
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
              Código Manual
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
            ) : (
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
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
