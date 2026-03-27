import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PowerOff } from "lucide-react";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [checkingMaintenance, setCheckingMaintenance] = useState(true);

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const { data, error } = await supabase
          .from("app_settings" as any)
          .select("maintenance_mode, maintenance_message")
          .eq("id", "global")
          .single();

        if (!error && data) {
          setMaintenanceMode((data as any).maintenance_mode || false);
          setMaintenanceMessage((data as any).maintenance_message || "Sistema em manutenção.");
        }
      } catch (e) {
        console.error("Erro ao verificar manutenção:", e);
      } finally {
        setCheckingMaintenance(false);
      }
    };

    checkMaintenance();

    // Re-check every 30 seconds
    const interval = setInterval(checkMaintenance, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || checkingMaintenance) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admin users bypass maintenance mode
  const isAdmin = !!localStorage.getItem("admin_token");

  if (maintenanceMode && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md p-8 space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <PowerOff className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Sistema Indisponível</h1>
          <p className="text-muted-foreground">{maintenanceMessage}</p>
          <p className="text-xs text-muted-foreground">
            Aguarde enquanto realizamos manutenções no sistema.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
