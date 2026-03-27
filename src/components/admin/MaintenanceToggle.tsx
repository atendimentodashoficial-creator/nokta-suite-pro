import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Power, PowerOff, Loader2, AlertTriangle } from "lucide-react";
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
    const action = newState ? "ATIVAR" : "DESATIVAR";
    
    if (newState && !confirm(`Tem certeza que deseja ${action} o modo manutenção?\n\nTodos os usuários serão desconectados e não poderão acessar o sistema.`)) {
      return;
    }

    setIsSaving(true);
    try {
      const adminToken = localStorage.getItem("admin_token");
      const { data, error } = await supabase.functions.invoke("admin-maintenance-toggle", {
        body: { action: "toggle", maintenance_mode: newState, maintenance_message: message },
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (error) throw error;
      setMaintenanceMode(newState);
      toast.success(newState ? "Modo manutenção ATIVADO - App desligado" : "Modo manutenção DESATIVADO - App ligado");
    } catch (e) {
      console.error("Erro:", e);
      toast.error("Erro ao alterar modo manutenção");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <Card className={maintenanceMode ? "border-destructive" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {maintenanceMode ? <PowerOff className="h-5 w-5 text-destructive" /> : <Power className="h-5 w-5 text-green-500" />}
          Kill Switch - Modo Manutenção
        </CardTitle>
        <CardDescription>
          Desliga o acesso ao sistema para todos os usuários, impedindo qualquer requisição
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {maintenanceMode && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              O sistema está DESLIGADO. Nenhum usuário consegue acessar o app.
            </AlertDescription>
          </Alert>
        )}

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
          {isSaving ? "Processando..." : maintenanceMode ? "LIGAR o Sistema" : "DESLIGAR o Sistema"}
        </Button>
      </CardContent>
    </Card>
  );
}
