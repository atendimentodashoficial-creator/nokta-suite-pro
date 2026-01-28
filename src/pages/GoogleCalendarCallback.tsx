import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Processando autenticação...");

  useEffect(() => {
    const processCallback = async () => {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const state = searchParams.get("state"); // user_id

      if (error) {
        setStatus("error");
        setMessage(`Erro na autenticação: ${error}`);
        return;
      }

      if (!code) {
        setStatus("error");
        setMessage("Código de autorização não encontrado");
        return;
      }

      try {
        // Get current session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          setStatus("error");
          setMessage("Sessão não encontrada. Faça login novamente.");
          return;
        }

        // Call edge function to exchange code for tokens
        const { data, error: fnError } = await supabase.functions.invoke("google-calendar-oauth", {
          body: { 
            code, 
            redirectUri: `${window.location.origin}/auth/google-calendar/callback`
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (fnError) {
          console.error("OAuth error:", fnError);
          setStatus("error");
          setMessage(fnError.message || "Erro ao processar autenticação");
          return;
        }

        if (!data?.success) {
          setStatus("error");
          setMessage(data?.error || "Erro ao conectar com Google Calendar");
          return;
        }

        setStatus("success");
        setMessage("Google Calendar conectado com sucesso!");
        
        // Redirect after a short delay
        setTimeout(() => {
          navigate("/configuracoes", { replace: true });
        }, 2000);
        
      } catch (err) {
        console.error("Callback error:", err);
        setStatus("error");
        setMessage("Erro inesperado ao processar autenticação");
      }
    };

    processCallback();
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          {status === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
              <p className="text-muted-foreground">{message}</p>
            </>
          )}
          
          {status === "success" && (
            <>
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600" />
              <p className="text-green-600 font-medium">{message}</p>
              <p className="text-sm text-muted-foreground">Redirecionando...</p>
            </>
          )}
          
          {status === "error" && (
            <>
              <XCircle className="h-12 w-12 mx-auto text-red-600" />
              <p className="text-red-600 font-medium">{message}</p>
              <Button onClick={() => navigate("/configuracoes")} className="mt-4">
                Voltar para Configurações
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
