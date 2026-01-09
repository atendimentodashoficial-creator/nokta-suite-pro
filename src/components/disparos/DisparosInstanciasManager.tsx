import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  QrCode,
  Smartphone,
  Unplug,
  Webhook,
  AlertCircle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
} from "@/components/ui/alert-dialog";

export interface DisparosInstancia {
  id: string;
  nome: string;
  base_url: string;
  api_key: string;
  is_active: boolean;
  instance_name: string | null;
  last_sync_at: string | null;
  last_webhook_at: string | null;
  created_at: string;
}

interface DisparosInstanciasManagerProps {
  instancias: DisparosInstancia[];
  onInstanciasChange: () => void;
}

export function DisparosInstanciasManager({ instancias, onInstanciasChange }: DisparosInstanciasManagerProps) {
  const { user } = useAuth();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [nome, setNome] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  // Connection status
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'loading'>>({});

  // QR Code state
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [selectedInstancia, setSelectedInstancia] = useState<DisparosInstancia | null>(null);
  const [qrPollingInterval, setQrPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Webhook status
  const [webhookStatus, setWebhookStatus] = useState<Record<string, 'configured' | 'pending' | 'error'>>({});
  const [configuringWebhook, setConfiguringWebhook] = useState<string | null>(null);

  // Check connection status on mount
  useEffect(() => {
    instancias.forEach(inst => {
      if (inst.is_active) {
        checkConnectionStatus(inst);
        // Check webhook status based on last_webhook_at
        setWebhookStatus(prev => ({
          ...prev,
          [inst.id]: inst.last_webhook_at ? 'configured' : 'pending'
        }));
      }
    });
  }, [instancias]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
      }
    };
  }, [qrPollingInterval]);

  const checkConnectionStatus = async (instancia: DisparosInstancia) => {
    setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'loading' }));

    try {
      const { data: session } = await supabase.auth.getSession();

      // IMPORTANT: use lightweight status check to avoid interfering with QR pairing
      const response = await supabase.functions.invoke("uazapi-check-status", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: instancia.base_url, api_key: instancia.api_key },
      });

      setConnectionStatus(prev => ({
        ...prev,
        [instancia.id]: response.data?.status === 'connected' ? 'connected' : 'disconnected',
      }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'disconnected' }));
    }
  };

  const configureWebhook = async (instancia: DisparosInstancia): Promise<boolean> => {
    try {
      const webhookUrl = `https://xlzkmnrgtrcmptszyyar.supabase.co/functions/v1/whatsapp-webhook/${user?.id}/${instancia.id}`;
      const { data: session } = await supabase.auth.getSession();

      const response = await supabase.functions.invoke("uazapi-set-webhook", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: {
          base_url: instancia.base_url,
          api_key: instancia.api_key,
          webhook_url: webhookUrl,
          instancia_id: instancia.id,
        },
      });

      if (response.data?.success) {
        setWebhookStatus(prev => ({ ...prev, [instancia.id]: 'configured' }));
        return true;
      } else {
        console.error('Webhook config failed:', response.data);
        setWebhookStatus(prev => ({ ...prev, [instancia.id]: 'error' }));
        return false;
      }
    } catch (error) {
      console.error('Error configuring webhook:', error);
      setWebhookStatus(prev => ({ ...prev, [instancia.id]: 'error' }));
      return false;
    }
  };

  const handleReconfigureWebhook = async (instancia: DisparosInstancia) => {
    setConfiguringWebhook(instancia.id);
    const success = await configureWebhook(instancia);
    if (success) {
      toast.success("Webhook configurado com sucesso!");
      onInstanciasChange();
    } else {
      toast.error("Erro ao configurar webhook. Verifique as credenciais.");
    }
    setConfiguringWebhook(null);
  };

  const handleAddInstancia = async () => {
    if (!nome.trim() || !baseUrl.trim() || !apiKey.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("disparos_instancias")
        .insert({
          user_id: user?.id,
          nome: nome.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-configure webhook
      let webhookSuccess = false;
      if (data?.id && user?.id) {
        webhookSuccess = await configureWebhook({
          ...data,
          nome: nome.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
        } as DisparosInstancia);
      }

      if (webhookSuccess) {
        toast.success("Instância adicionada e webhook configurado!");
      } else {
        toast.warning("Instância adicionada, mas o webhook não foi configurado automaticamente. Conecte o WhatsApp e tente reconfigurar.");
      }
      
      setAddDialogOpen(false);
      setNome("");
      setBaseUrl("");
      setApiKey("");
      onInstanciasChange();
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("disparos_instancias").delete().eq("id", id);
      if (error) throw error;
      toast.success("Instância removida!");
      onInstanciasChange();
    } catch (error: any) {
      toast.error("Erro ao remover");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleConnect = async (instancia: DisparosInstancia) => {
    setSelectedInstancia(instancia);
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

        // IMPORTANT: even if already connected, ensure webhook is configured
        setTimeout(async () => {
          const webhookConfigured = await configureWebhook(instancia);
          if (webhookConfigured) {
            toast.success("Webhook configurado automaticamente!");
            onInstanciasChange();
          } else {
            toast.warning("Webhook não foi configurado. Clique em 'Configurar Webhook'.");
          }
        }, 1500);

        return;
      }

      if (response.data?.qrcode) {
        setQrCodeData(response.data.qrcode);
        startPolling(instancia);
      } else {
        toast.error(response.data?.error || "Não foi possível obter o QR Code");
      }
    } catch {
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrCodeLoading(false);
    }
  };

  const handleDisconnect = async (instancia: DisparosInstancia) => {
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

  const startPolling = (instancia: DisparosInstancia) => {
    if (qrPollingInterval) clearInterval(qrPollingInterval);

    // Use slower polling with lightweight status check to avoid interfering with WhatsApp pairing
    // The aggressive polling was causing "401: logged out from another device" errors
    let pollCount = 0;
    const minPollsBeforeCheck = 3; // Wait at least 3 polls (~24s) before considering connection valid
    let confirmations = 0;
    const requiredConfirmations = 2; // Require 2 consecutive confirmations

    const interval = setInterval(async () => {
      pollCount++;
      
      try {
        const { data: session } = await supabase.auth.getSession();
        
        // Use lightweight status check - doesn't call /chat/find
        const response = await supabase.functions.invoke("uazapi-check-status", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: { base_url: instancia.base_url, api_key: instancia.api_key },
        });

        console.log(`[Disparos Poll ${pollCount}] Status:`, response.data?.status, "Confirmations:", confirmations);

        // Only accept connection after minimum polls to let WhatsApp session stabilize
        if (pollCount >= minPollsBeforeCheck && response.data?.success && response.data?.status === "connected") {
          confirmations++;
          
          if (confirmations >= requiredConfirmations) {
            clearInterval(interval);
            setQrPollingInterval(null);
            setQrCodeDialogOpen(false);
            setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'connected' }));
            toast.success("WhatsApp conectado!");
            
            // Wait a bit before configuring webhook to ensure connection is stable
            setTimeout(async () => {
              const webhookConfigured = await configureWebhook(instancia);
              if (webhookConfigured) {
                toast.success("Webhook configurado automaticamente!");
              } else {
                toast.warning("Webhook não foi configurado. Clique em 'Configurar Webhook'.");
              }
            }, 2000);
            
            onInstanciasChange();
          }
        } else {
          // Reset confirmations if not connected
          confirmations = 0;
        }
      } catch (err) {
        console.error("[Disparos Poll] Error:", err);
        confirmations = 0;
      }
    }, 8000); // Poll every 8 seconds (slower to avoid interference)

    setQrPollingInterval(interval);
    
    // Timeout after 3 minutes
    setTimeout(() => {
      clearInterval(interval);
      setQrPollingInterval(null);
    }, 180000);
  };

  const refreshQrCode = () => {
    if (selectedInstancia) handleConnect(selectedInstancia);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {instancias.length} instância{instancias.length !== 1 ? "s" : ""}
        </p>
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nova Instância</DialogTitle>
              <DialogDescription>
                Adicione os dados da sua instância UAZapi
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: WhatsApp Principal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>URL Base</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://sua-instancia.uazapi.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Token da Instância</Label>
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Token de autenticação"
                  className="mt-1"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddInstancia} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Instances */}
      {instancias.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhuma instância configurada.
        </p>
      ) : (
        <div className="space-y-3">
          {instancias.map((instancia) => {
            const status = connectionStatus[instancia.id];
            const isConnected = status === 'connected';
            const isLoading = status === 'loading';
            const wbStatus = webhookStatus[instancia.id];
            const isWebhookConfigured = wbStatus === 'configured';
            const isWebhookError = wbStatus === 'error';
            const isConfiguringWebhook = configuringWebhook === instancia.id;
            
            return (
              <Card key={instancia.id} className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        isConnected ? 'bg-green-500' : isLoading ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                      }`} />
                      <div>
                        <h4 className="font-medium">{instancia.nome}</h4>
                        <p className="text-xs text-muted-foreground">
                          {isConnected ? 'Conectado' : isLoading ? 'Verificando...' : 'Desconectado'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isConnected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDisconnect(instancia)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Unplug className="h-4 w-4 mr-2" />
                          Desconectar
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleConnect(instancia)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <QrCode className="h-4 w-4 mr-2" />
                              Conectar
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => checkConnectionStatus(instancia)}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteConfirmId(instancia.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Webhook status row */}
                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Webhook className={`h-4 w-4 ${isWebhookConfigured ? 'text-green-500' : isWebhookError ? 'text-red-500' : 'text-amber-500'}`} />
                      <span className="text-muted-foreground">
                        {isWebhookConfigured 
                          ? 'Webhook configurado' 
                          : isWebhookError 
                            ? 'Erro ao configurar webhook' 
                            : 'Webhook não configurado'}
                      </span>
                      {instancia.last_webhook_at && (
                        <span className="text-xs text-muted-foreground">
                          (última atividade: {new Date(instancia.last_webhook_at).toLocaleDateString('pt-BR')})
                        </span>
                      )}
                    </div>
                    
                    {(!isWebhookConfigured || isWebhookError) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReconfigureWebhook(instancia)}
                        disabled={isConfiguringWebhook}
                      >
                        {isConfiguringWebhook ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <AlertCircle className="h-4 w-4 mr-2" />
                        )}
                        Configurar Webhook
                      </Button>
                    )}
                    
                    {isWebhookConfigured && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReconfigureWebhook(instancia)}
                        disabled={isConfiguringWebhook}
                      >
                        {isConfiguringWebhook ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Reconfigurar
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* QR Code Dialog */}
      <Dialog open={qrCodeDialogOpen} onOpenChange={(open) => {
        if (!open && qrPollingInterval) {
          clearInterval(qrPollingInterval);
          setQrPollingInterval(null);
        }
        setQrCodeDialogOpen(open);
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Conectar WhatsApp
            </DialogTitle>
            <DialogDescription>
              {selectedInstancia?.nome}
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
    </div>
  );
}
