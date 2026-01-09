import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Unplug
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

export interface WhatsAppInstance {
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

interface WhatsAppInstanceManagerProps {
  instances: WhatsAppInstance[];
  onInstancesChange: () => void;
  /** 
   * Type of instance: 
   * - "whatsapp" = main WhatsApp for leads/CRM (uses uazapi_config link)
   * - "disparos" = instances for mass messaging only
   */
  instanceType: "whatsapp" | "disparos";
  /** For whatsapp type: the ID of the main whatsapp instance linked to uazapi_config */
  mainInstanceId?: string | null;
  /** Callback when main instance changes (for whatsapp type) */
  onMainInstanceChange?: (instanceId: string | null) => void;
}

export function WhatsAppInstanceManager({ 
  instances, 
  onInstancesChange, 
  instanceType,
  mainInstanceId,
  onMainInstanceChange
}: WhatsAppInstanceManagerProps) {
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
  const [selectedInstance, setSelectedInstance] = useState<WhatsAppInstance | null>(null);
  const [qrPollingInterval, setQrPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Filter instances based on type
  const filteredInstances = instanceType === "whatsapp" 
    ? instances.filter(inst => inst.id === mainInstanceId || !mainInstanceId)
    : instances.filter(inst => inst.id !== mainInstanceId);

  // Check connection status on mount
  useEffect(() => {
    instances.forEach(inst => {
      if (inst.is_active) {
        checkConnectionStatus(inst);
      }
    });
  }, [instances]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (qrPollingInterval) {
        clearInterval(qrPollingInterval);
      }
    };
  }, [qrPollingInterval]);

  const checkConnectionStatus = async (instance: WhatsAppInstance) => {
    setConnectionStatus(prev => ({ ...prev, [instance.id]: 'loading' }));

    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("uazapi-test-connection", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: instance.base_url, api_key: instance.api_key },
      });

      setConnectionStatus(prev => ({ 
        ...prev, 
        [instance.id]: response.data?.success ? 'connected' : 'disconnected' 
      }));
    } catch {
      setConnectionStatus(prev => ({ ...prev, [instance.id]: 'disconnected' }));
    }
  };

  const getWebhookUrl = (instanceId: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    return `${supabaseUrl}/functions/v1/whatsapp-webhook?user_id=${user?.id}&instancia_id=${instanceId}`;
  };

  const handleAddInstance = async () => {
    if (!nome.trim() || !baseUrl.trim() || !apiKey.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      // Create instance in disparos_instancias
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

      // For whatsapp type, also link to uazapi_config
      if (instanceType === "whatsapp" && data?.id) {
        const { error: configError } = await supabase
          .from("uazapi_config")
          .upsert({
            user_id: user?.id,
            api_key: apiKey.trim(),
            base_url: baseUrl.trim(),
            is_active: true,
            whatsapp_instancia_id: data.id,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "user_id",
          });

        if (configError) {
          console.error("Error updating uazapi_config:", configError);
        }
        
        onMainInstanceChange?.(data.id);
      }

      // Auto-configure webhook
      if (data?.id && user?.id) {
        const webhookUrl = getWebhookUrl(data.id);
        const { data: session } = await supabase.auth.getSession();
        
        const response = await supabase.functions.invoke("uazapi-set-webhook", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: {
            base_url: baseUrl.trim(),
            api_key: apiKey.trim(),
            webhook_url: webhookUrl,
            instancia_id: data.id,
          },
        });

        if (response.data?.success) {
          toast.success("Webhook configurado automaticamente!");
        }
      }

      toast.success("Instância adicionada!");
      setAddDialogOpen(false);
      setNome("");
      setBaseUrl("");
      setApiKey("");
      onInstancesChange();
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      // If this is the main whatsapp instance, clear uazapi_config link
      if (instanceType === "whatsapp" && id === mainInstanceId) {
        await supabase
          .from("uazapi_config")
          .update({ whatsapp_instancia_id: null, is_active: false })
          .eq("user_id", user?.id);
        
        onMainInstanceChange?.(null);
      }

      const { error } = await supabase.from("disparos_instancias").delete().eq("id", id);
      if (error) throw error;
      toast.success("Instância removida!");
      onInstancesChange();
    } catch (error: any) {
      toast.error("Erro ao remover");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleConnect = async (instance: WhatsAppInstance) => {
    setSelectedInstance(instance);
    setQrCodeDialogOpen(true);
    setQrCodeLoading(true);
    setQrCodeData(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
        body: { base_url: instance.base_url, api_key: instance.api_key },
      });

      if (response.data?.connected) {
        toast.success("WhatsApp já está conectado!");
        setQrCodeDialogOpen(false);
        setConnectionStatus(prev => ({ ...prev, [instance.id]: 'connected' }));
        return;
      }

      if (response.data?.qrcode) {
        setQrCodeData(response.data.qrcode);
        startPolling(instance);
      } else {
        toast.error(response.data?.error || "Não foi possível obter o QR Code");
      }
    } catch {
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrCodeLoading(false);
    }
  };

  const handleDisconnect = async (instance: WhatsAppInstance) => {
    try {
      // Call disconnect endpoint
      const response = await fetch(`${instance.base_url}/instance/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "token": instance.api_key,
        },
      });

      if (response.ok) {
        toast.success("WhatsApp desconectado!");
        setConnectionStatus(prev => ({ ...prev, [instance.id]: 'disconnected' }));
      } else {
        toast.error("Erro ao desconectar");
      }
    } catch {
      toast.error("Erro ao desconectar");
    }
  };

  const startPolling = (instance: WhatsAppInstance) => {
    if (qrPollingInterval) clearInterval(qrPollingInterval);

    const interval = setInterval(async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        
        const response = await supabase.functions.invoke("uazapi-test-connection", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
          body: { base_url: instance.base_url, api_key: instance.api_key },
        });

        if (response.data?.success) {
          clearInterval(interval);
          setQrPollingInterval(null);
          setQrCodeDialogOpen(false);
          setConnectionStatus(prev => ({ ...prev, [instance.id]: 'connected' }));
          toast.success("WhatsApp conectado!");
          onInstancesChange();
        }
      } catch {}
    }, 5000);

    setQrPollingInterval(interval);
    setTimeout(() => {
      clearInterval(interval);
      setQrPollingInterval(null);
    }, 120000);
  };

  const refreshQrCode = () => {
    if (selectedInstance) handleConnect(selectedInstance);
  };

  // For whatsapp type with existing main instance, show only that instance
  const displayInstances = instanceType === "whatsapp" && mainInstanceId
    ? instances.filter(inst => inst.id === mainInstanceId)
    : instanceType === "disparos"
    ? instances.filter(inst => inst.id !== mainInstanceId)
    : instances;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {displayInstances.length} instância{displayInstances.length !== 1 ? "s" : ""}
        </p>
        
        {/* For whatsapp type, only show add button if no main instance exists */}
        {(instanceType === "disparos" || !mainInstanceId) && (
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                {instanceType === "whatsapp" ? "Conectar WhatsApp" : "Nova Instância"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {instanceType === "whatsapp" ? "Conectar WhatsApp" : "Nova Instância de Disparos"}
                </DialogTitle>
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
                    placeholder={instanceType === "whatsapp" ? "WhatsApp Principal" : "Ex: Instância 1"}
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
                  <Button onClick={handleAddInstance} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Instances */}
      {displayInstances.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {instanceType === "whatsapp" 
            ? "Nenhum WhatsApp conectado. Clique em 'Conectar WhatsApp' para começar."
            : "Nenhuma instância configurada."}
        </p>
      ) : (
        <div className="space-y-3">
          {displayInstances.map((instance) => {
            const status = connectionStatus[instance.id];
            const isConnected = status === 'connected';
            const isLoading = status === 'loading';
            
            return (
              <Card key={instance.id} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      isConnected ? 'bg-green-500' : isLoading ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                    }`} />
                    <div>
                      <h4 className="font-medium">{instance.nome}</h4>
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
                        onClick={() => handleDisconnect(instance)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Unplug className="h-4 w-4 mr-2" />
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleConnect(instance)}
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
                      onClick={() => checkConnectionStatus(instance)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirmId(instance.id)}
                      className="text-destructive hover:text-destructive"
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
              {selectedInstance?.nome}
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
