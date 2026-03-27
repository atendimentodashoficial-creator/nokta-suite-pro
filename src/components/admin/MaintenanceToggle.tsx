import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Power, PowerOff, Loader2, AlertTriangle, Clock, Globe, Database } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function MaintenanceToggle() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [message, setMessage] = useState("Sistema em manutenção. Tente novamente mais tarde.");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const adminToken = localStorage.getItem("admin_token");
      const { data, error } = await supabase.functions.invoke("admin-maintenance-toggle", {
        body: { action: "get" },
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (error) throw error;
      if (data) {
        setMaintenanceMode(data.maintenance_mode);
        setMessage(data.maintenance_message || "");
      }
    } catch (e) {
      console.error("Erro ao carregar configurações:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async () => {
    const newState = !maintenanceMode;
    const action = newState ? "DESLIGAR" : "LIGAR";
    
    const confirmMsg = newState 
      ? `Tem certeza que deseja ${action} o sistema?\n\n⚠️ Isso irá:\n• Bloquear todos os usuários\n• Pausar todos os cron jobs\n• Parar praticamente todo consumo do Cloud\n\nApenas o painel admin continuará acessível.`
      : `Deseja ${action} o sistema novamente?\n\n✅ Isso irá:\n• Liberar acesso dos usuários\n• Reativar todos os cron jobs`;
    
    if (!confirm(confirmMsg)) return;

    setIsSaving(true);
    try {
      const adminToken = localStorage.getItem("admin_token");
      const { data, error } = await supabase.functions.invoke("admin-maintenance-toggle", {
        body: { action: "toggle", maintenance_mode: newState, maintenance_message: message },
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (error) throw error;
      setMaintenanceMode(newState);
      toast.success(
        newState 
          ? "Sistema DESLIGADO — Usuários bloqueados e crons pausados" 
          : "Sistema LIGADO — Tudo reativado com sucesso"
      );
    } catch (e) {
      console.error("Erro:", e);
      toast.error("Erro ao alterar modo manutenção");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card className={maintenanceMode ? "border-destructive bg-destructive/5" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {maintenanceMode ? <PowerOff className="h-5 w-5 text-destructive" /> : <Power className="h-5 w-5 text-emerald-500" />}
          Kill Switch — Desligar Sistema
        </CardTitle>
        <CardDescription>
          Desliga completamente o sistema, bloqueando usuários e pausando todos os processos automáticos
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {maintenanceMode && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="font-medium">
              O sistema está DESLIGADO. Nenhum usuário consegue acessar e todos os crons estão pausados.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${maintenanceMode ? "bg-destructive/10 border-destructive/30" : "bg-muted/50"}`}>
            <Globe className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Acesso Usuários</div>
              <div className={maintenanceMode ? "text-destructive" : "text-emerald-600"}>
                {maintenanceMode ? "Bloqueado" : "Ativo"}
              </div>
            </div>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${maintenanceMode ? "bg-destructive/10 border-destructive/30" : "bg-muted/50"}`}>
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Cron Jobs</div>
              <div className={maintenanceMode ? "text-destructive" : "text-emerald-600"}>
                {maintenanceMode ? "Pausados" : "Ativos"}
              </div>
            </div>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${maintenanceMode ? "bg-destructive/10 border-destructive/30" : "bg-muted/50"}`}>
            <Database className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Consumo Cloud</div>
              <div className={maintenanceMode ? "text-destructive" : "text-emerald-600"}>
                {maintenanceMode ? "~Zero" : "Normal"}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Mensagem exibida aos usuários</Label>
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Mensagem de manutenção..."
          />
        </div>

        <Button
          onClick={handleToggle}
          disabled={isSaving}
          variant={maintenanceMode ? "default" : "destructive"}
          className="w-full"
          size="lg"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : maintenanceMode ? (
            <Power className="h-4 w-4 mr-2" />
          ) : (
            <PowerOff className="h-4 w-4 mr-2" />
          )}
          {isSaving ? "Processando..." : maintenanceMode ? "🟢 LIGAR o Sistema" : "🔴 DESLIGAR o Sistema"}
        </Button>
      </CardContent>
    </Card>
  );
}
