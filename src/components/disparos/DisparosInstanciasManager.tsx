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
  Edit,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Copy,
  Link,
  Webhook,
  QrCode,
  Smartphone
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstancia, setEditingInstancia] = useState<DisparosInstancia | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [nome, setNome] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'loading'>>({});

  // QR Code state
  const [qrCodeDialogOpen, setQrCodeDialogOpen] = useState(false);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [selectedInstanciaForQr, setSelectedInstanciaForQr] = useState<DisparosInstancia | null>(null);
  const [qrPollingInterval, setQrPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Test all connections on mount
  useEffect(() => {
    if (instancias.length > 0) {
      instancias.forEach(inst => {
        if (inst.is_active) {
          checkConnectionStatus(inst);
        }
      });
    }
  }, [instancias]);

  // Cleanup QR polling on unmount
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
      
      const response = await supabase.functions.invoke("uazapi-test-connection", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: {
          base_url: instancia.base_url,
          api_key: instancia.api_key,
        },
      });

      if (response.error || !response.data?.success) {
        setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'disconnected' }));
      } else {
        setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'connected' }));
      }
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'disconnected' }));
    }
  };

  useEffect(() => {
    if (editingInstancia) {
      setNome(editingInstancia.nome);
      setBaseUrl(editingInstancia.base_url);
      setApiKey(editingInstancia.api_key);
    } else {
      resetForm();
    }
  }, [editingInstancia]);

  const resetForm = () => {
    setNome("");
    setBaseUrl("");
    setApiKey("");
    setShowApiKey(false);
  };

  const handleSave = async () => {
    if (!nome.trim() || !baseUrl.trim() || !apiKey.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setSaving(true);
    try {
      let savedInstanciaId: string | null = null;
      
      if (editingInstancia) {
        const { error } = await supabase
          .from("disparos_instancias")
          .update({
            nome: nome.trim(),
            base_url: baseUrl.trim(),
            api_key: apiKey.trim(),
          })
          .eq("id", editingInstancia.id);

        if (error) throw error;
        savedInstanciaId = editingInstancia.id;
        toast.success("Instância atualizada!");
      } else {
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
        savedInstanciaId = data?.id;
        toast.success("Instância adicionada!");
      }

      // Automatically configure webhook
      if (savedInstanciaId && user?.id) {
        try {
          const webhookUrl = `https://xlzkmnrgtrcmptszyyar.supabase.co/functions/v1/whatsapp-webhook?user_id=${user.id}&instancia_id=${savedInstanciaId}`;
          
          const { data: session } = await supabase.auth.getSession();
          const response = await supabase.functions.invoke("uazapi-set-webhook", {
            headers: {
              Authorization: `Bearer ${session.session?.access_token}`,
            },
            body: {
              base_url: baseUrl.trim(),
              api_key: apiKey.trim(),
              webhook_url: webhookUrl,
              instancia_id: savedInstanciaId,
            },
          });

          if (response.data?.success) {
            toast.success("Webhook configurado automaticamente!");
          } else {
            console.warn("Webhook auto-config failed:", response.data?.error);
            toast.info("Instância salva. Configure o webhook manualmente se necessário.");
          }
        } catch (webhookError) {
          console.error("Error setting webhook:", webhookError);
          // Don't fail the save operation, just warn
        }
      }

      setDialogOpen(false);
      setEditingInstancia(null);
      resetForm();
      onInstanciasChange();
    } catch (error: any) {
      console.error("Error saving instancia:", error);
      toast.error(error.message || "Erro ao salvar instância");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("disparos_instancias")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Instância removida!");
      onInstanciasChange();
    } catch (error: any) {
      console.error("Error deleting instancia:", error);
      toast.error(error.message || "Erro ao remover instância");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const testConnection = async (instancia: DisparosInstancia) => {
    setTesting(instancia.id);
    setTestResults(prev => ({ ...prev, [instancia.id]: { success: false, message: "Testando..." } }));

    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("uazapi-test-connection", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: {
          base_url: instancia.base_url,
          api_key: instancia.api_key,
        },
      });

      if (response.error) {
        setTestResults(prev => ({ ...prev, [instancia.id]: { success: false, message: response.error.message || "Erro" } }));
        setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'disconnected' }));
        return;
      }

      const result = response.data;
      setTestResults(prev => ({
        ...prev,
        [instancia.id]: {
          success: result.success,
          message: result.success ? "Conectado!" : (result.error || "Erro"),
        }
      }));
      setConnectionStatus(prev => ({ ...prev, [instancia.id]: result.success ? 'connected' : 'disconnected' }));

      if (result.success) {
        toast.success(`${instancia.nome}: Conexão OK!`);
      }
    } catch (error: any) {
      setTestResults(prev => ({
        ...prev,
        [instancia.id]: { success: false, message: error.message || "Erro ao testar" }
      }));
    } finally {
      setTesting(null);
    }
  };

  const toggleActive = async (instancia: DisparosInstancia) => {
    try {
      const { error } = await supabase
        .from("disparos_instancias")
        .update({ is_active: !instancia.is_active })
        .eq("id", instancia.id);

      if (error) throw error;
      toast.success(instancia.is_active ? "Instância desativada" : "Instância ativada");
      onInstanciasChange();
    } catch (error: any) {
      toast.error("Erro ao alterar status");
    }
  };

  const fetchQrCode = async (instancia: DisparosInstancia) => {
    setSelectedInstanciaForQr(instancia);
    setQrCodeDialogOpen(true);
    setQrCodeLoading(true);
    setQrCodeData(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: {
          base_url: instancia.base_url,
          api_key: instancia.api_key,
        },
      });

      if (response.data?.connected) {
        toast.success("WhatsApp já está conectado!");
        setQrCodeDialogOpen(false);
        checkConnectionStatus(instancia);
        return;
      }

      if (response.data?.qrcode) {
        setQrCodeData(response.data.qrcode);
        startQrPolling(instancia);
      } else {
        toast.error(response.data?.error || "Não foi possível obter o QR Code");
      }
    } catch (error: any) {
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrCodeLoading(false);
    }
  };

  const startQrPolling = (instancia: DisparosInstancia) => {
    // Clear any existing interval
    if (qrPollingInterval) {
      clearInterval(qrPollingInterval);
    }

    // Poll every 5 seconds to check if connected
    const interval = setInterval(async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        
        const response = await supabase.functions.invoke("uazapi-test-connection", {
          headers: {
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: {
            base_url: instancia.base_url,
            api_key: instancia.api_key,
          },
        });

        if (response.data?.success) {
          clearInterval(interval);
          setQrPollingInterval(null);
          setQrCodeDialogOpen(false);
          setConnectionStatus(prev => ({ ...prev, [instancia.id]: 'connected' }));
          toast.success("WhatsApp conectado com sucesso!");
          onInstanciasChange();
        }
      } catch (error) {
        // Silent error - keep polling
      }
    }, 5000);

    setQrPollingInterval(interval);

    // Stop polling after 2 minutes
    setTimeout(() => {
      clearInterval(interval);
      setQrPollingInterval(null);
    }, 120000);
  };

  const refreshQrCode = async () => {
    if (selectedInstanciaForQr) {
      fetchQrCode(selectedInstanciaForQr);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {instancias.length} instância{instancias.length !== 1 ? "s" : ""} configurada{instancias.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingInstancia(null);
            resetForm();
          }
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Instância
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingInstancia ? "Editar Instância" : "Nova Instância"}</DialogTitle>
              <DialogDescription>
                {editingInstancia 
                  ? "Atualize os dados da instância UAZapi"
                  : "Crie uma nova instância para disparos em massa"
                }
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 pt-4">
              <div>
                <Label>Nome da Instância *</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Número Principal"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>URL Base *</Label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.uazapi.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>API Key *</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Sua chave de API"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => {
                  setDialogOpen(false);
                  setEditingInstancia(null);
                  resetForm();
                }}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Instances List */}
      {instancias.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          Nenhuma instância configurada. Adicione uma instância para começar.
        </p>
      ) : (
        <div className="space-y-3">
          {instancias.map((instancia) => {
              const testResult = testResults[instancia.id];
              const connStatus = connectionStatus[instancia.id];
              return (
                <Card key={instancia.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium truncate">{instancia.nome}</h4>
                        <Badge variant={instancia.is_active ? "default" : "secondary"} className="text-xs">
                          {instancia.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                        {instancia.is_active && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs gap-1 ${
                              connStatus === 'connected' 
                                ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/20' 
                                : connStatus === 'loading'
                                ? 'border-muted text-muted-foreground'
                                : 'border-red-500 text-red-600 bg-red-50 dark:bg-red-950/20'
                            }`}
                          >
                            {connStatus === 'loading' ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : connStatus === 'connected' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {connStatus === 'loading' ? 'Verificando' : connStatus === 'connected' ? 'Conectado' : 'Desconectado'}
                          </Badge>
                        )}
                      </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {instancia.base_url}
                    </p>
                    {/* Webhook URL for real-time sync - unique per instance */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Link className="h-3 w-3" />
                        <span>Webhook:</span>
                      </div>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-[280px]">
                        {`...whatsapp-webhook?user_id=${user?.id?.slice(0, 8)}...&instancia_id=${instancia.id.slice(0, 8)}...`}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          const webhookUrl = `https://xlzkmnrgtrcmptszyyar.supabase.co/functions/v1/whatsapp-webhook?user_id=${user?.id}&instancia_id=${instancia.id}`;
                          navigator.clipboard.writeText(webhookUrl);
                          toast.success("URL do webhook copiada!");
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    {/* Webhook status indicator */}
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Webhook className="h-3 w-3" />
                        <span>Status:</span>
                      </div>
                      {instancia.last_webhook_at ? (
                        <Badge 
                          variant="outline" 
                          className="text-xs gap-1 border-green-500 text-green-600 bg-green-50 dark:bg-green-950/20"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Ativo - {formatDistanceToNow(new Date(instancia.last_webhook_at), { addSuffix: true, locale: ptBR })}
                        </Badge>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className="text-xs gap-1 border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/20"
                        >
                          <XCircle className="h-3 w-3" />
                          Sem dados recebidos
                        </Badge>
                      )}
                    </div>
                    {testResult && (
                      <div className={`flex items-center gap-1 mt-2 text-xs ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {testResult.success ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {testResult.message}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* QR Code button for disconnected instances */}
                    {connStatus === 'disconnected' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchQrCode(instancia)}
                        title="Escanear QR Code"
                      >
                        <QrCode className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => testConnection(instancia)}
                      disabled={testing === instancia.id}
                    >
                      {testing === instancia.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(instancia)}
                    >
                      {instancia.is_active ? (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingInstancia(instancia);
                        setDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(instancia.id)}
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
              Esta ação não pode ser desfeita. Os chats e mensagens associados a esta instância não serão deletados.
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
              {selectedInstanciaForQr?.nome}
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
                  <img 
                    src={qrCodeData} 
                    alt="QR Code" 
                    className="w-56 h-56"
                  />
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
                <span className="text-sm text-muted-foreground">Erro ao carregar QR Code</span>
              </div>
            )}
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshQrCode}
              disabled={qrCodeLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${qrCodeLoading ? 'animate-spin' : ''}`} />
              Atualizar QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
