import { useState, useEffect } from "react";
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
  WifiOff
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
  const [newInstanceName, setNewInstanceName] = useState("");
  const [newInstanceUrl, setNewInstanceUrl] = useState("");
  const [newInstanceApiKey, setNewInstanceApiKey] = useState("");
  const [adding, setAdding] = useState(false);
  
  // QR Code dialog
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [selectedInstanceForQr, setSelectedInstanceForQr] = useState<AdminInstance | null>(null);

  useEffect(() => {
    loadInstances();
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
      const { data, error } = await supabase.functions.invoke("uazapi-check-status", {
        body: { 
          baseUrl: instance.base_url,
          apiKey: instance.api_key
        },
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (error) throw error;

      setConnectionStatus(prev => ({
        ...prev,
        [instance.id]: { 
          connected: data?.connected || false,
          phone: data?.phone,
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
    if (!newInstanceName.trim() || !newInstanceUrl.trim() || !newInstanceApiKey.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }

    setAdding(true);
    try {
      const { data, error } = await supabase
        .from("admin_notification_instances")
        .insert({
          nome: newInstanceName.trim(),
          base_url: newInstanceUrl.trim().replace(/\/+$/, ""),
          api_key: newInstanceApiKey.trim(),
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
      
      // Check connection status
      checkConnectionStatus(data);
    } catch (error) {
      console.error("Erro ao adicionar instância:", error);
      toast.error("Erro ao adicionar instância");
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteInstance = async (instanceId: string) => {
    try {
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

    try {
      const adminToken = localStorage.getItem("admin_token");
      const { data, error } = await supabase.functions.invoke("uazapi-admin-get-qrcode", {
        body: { 
          baseUrl: instance.base_url,
          apiKey: instance.api_key
        },
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (error) throw error;

      if (data?.qrcode) {
        setQrCode(data.qrcode);
      } else if (data?.connected) {
        toast.success("Instância já está conectada!");
        setQrDialogOpen(false);
        checkConnectionStatus(instance);
      } else {
        toast.error("Não foi possível obter o QR Code");
      }
    } catch (error) {
      console.error("Erro ao obter QR Code:", error);
      toast.error("Erro ao obter QR Code");
    } finally {
      setQrLoading(false);
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
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Instância WhatsApp</DialogTitle>
                <DialogDescription>
                  Configure uma nova instância UAZapi para envio de avisos
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="instance-name">Nome da Instância</Label>
                  <Input
                    id="instance-name"
                    placeholder="Ex: Instância Principal"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="instance-url">URL Base</Label>
                  <Input
                    id="instance-url"
                    placeholder="Ex: https://api.uazapi.com"
                    value={newInstanceUrl}
                    onChange={(e) => setNewInstanceUrl(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="instance-key">API Key / Token</Label>
                  <Input
                    id="instance-key"
                    type="password"
                    placeholder="Cole a API Key da instância"
                    value={newInstanceApiKey}
                    onChange={(e) => setNewInstanceApiKey(e.target.value)}
                  />
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddInstance} disabled={adding}>
                  {adding ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Adicionando...
                    </>
                  ) : (
                    "Adicionar"
                  )}
                </Button>
              </DialogFooter>
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
      
      {/* QR Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              Escaneie o QR Code com o WhatsApp para conectar a instância "{selectedInstanceForQr?.nome}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center justify-center py-8">
            {qrLoading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
              </div>
            ) : qrCode ? (
              <div className="p-4 bg-white rounded-lg">
                <img 
                  src={qrCode.startsWith("data:") ? qrCode : `data:image/png;base64,${qrCode}`} 
                  alt="QR Code"
                  className="w-64 h-64"
                />
              </div>
            ) : (
              <p className="text-muted-foreground">Erro ao carregar QR Code</p>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrDialogOpen(false)}>
              Fechar
            </Button>
            <Button 
              onClick={() => selectedInstanceForQr && handleGetQrCode(selectedInstanceForQr)}
              disabled={qrLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${qrLoading ? "animate-spin" : ""}`} />
              Atualizar QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
