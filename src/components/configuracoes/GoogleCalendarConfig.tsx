import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Calendar, CheckCircle2, XCircle, Eye, EyeOff, Loader2, RefreshCw, ChevronDown, ChevronRight, Copy, ExternalLink } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface GoogleCalendarConfigProps {
  defaultOpen?: boolean;
}

export function GoogleCalendarConfig({ defaultOpen = false }: GoogleCalendarConfigProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(true);
  const [hasConfig, setHasConfig] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Credentials state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [calendarId, setCalendarId] = useState("primary");
  const [showCredentials, setShowCredentials] = useState(false);
  
  // Action states
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Generate redirect URI based on current environment
  const redirectUri = typeof window !== 'undefined' 
    ? `${window.location.origin}/auth/google-calendar/callback`
    : '';

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      // Use raw query to get all columns including the newly added ones
      const { data, error } = await supabase
        .from("google_calendar_config")
        .select("*")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!error && data) {
        const configData = data as unknown as {
          client_id?: string;
          client_secret?: string;
          calendar_id?: string;
          access_token?: string;
        };
        setHasConfig(true);
        setClientId(configData.client_id || "");
        setClientSecret(configData.client_secret || "");
        setCalendarId(configData.calendar_id || "primary");
        setIsConnected(!!configData.access_token);
      }
    } catch (error) {
      console.error("Error loading Google Calendar config:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast({
        title: "Erro",
        description: "Client ID e Client Secret são obrigatórios",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      // Use type assertion to handle new columns not yet in generated types
      const configData = {
        user_id: user?.id,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        calendar_id: calendarId.trim() || "primary",
        updated_at: new Date().toISOString()
      };

      // First check if record exists
      const { data: existing } = await supabase
        .from("google_calendar_config")
        .select("id")
        .eq("user_id", user?.id)
        .maybeSingle();

      let saveError: Error | null = null;

      if (existing) {
        // Update existing record - cast to any to bypass type checking for new columns
        const { error } = await supabase
          .from("google_calendar_config")
          .update(configData as Record<string, unknown> as never)
          .eq("user_id", user?.id);
        
        if (error) saveError = error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from("google_calendar_config")
          .insert(configData as Record<string, unknown> as never);

        if (error) saveError = error;
      }

      if (saveError) throw saveError;

      setHasConfig(true);
      toast({
        title: "Configuração salva!",
        description: "Credenciais do Google Calendar salvas com sucesso. Agora conecte sua conta."
      });
    } catch (error) {
      console.error("Error saving config:", error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a configuração",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const initiateOAuth = async () => {
    if (!clientId.trim()) {
      toast({
        title: "Erro",
        description: "Configure o Client ID primeiro",
        variant: "destructive"
      });
      return;
    }

    setConnecting(true);
    try {
      // Build OAuth URL
      const scopes = [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events"
      ].join(" ");

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        access_type: "offline",
        prompt: "consent",
        state: user?.id || ""
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      
      // Redirect in same window (avoids popup blockers and Google's security restrictions)
      window.location.href = authUrl;
    } catch (error) {
      console.error("Error initiating OAuth:", error);
      toast({
        title: "Erro",
        description: "Não foi possível iniciar a autenticação",
        variant: "destructive"
      });
      setConnecting(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke("google-calendar-test", {
        headers: {
          Authorization: `Bearer ${session.session?.access_token}`
        }
      });

      if (response.error) {
        setTestResult({
          success: false,
          message: response.error.message || "Erro ao testar conexão"
        });
      } else if (!response.data?.success) {
        setTestResult({
          success: false,
          message: response.data?.error || "Erro ao testar conexão"
        });
      } else {
        setTestResult({
          success: true,
          message: response.data.message || "Conexão com Google Calendar OK!"
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Erro ao testar conexão";
      setTestResult({
        success: false,
        message: errorMessage
      });
    } finally {
      setTesting(false);
    }
  };

  const disconnectAccount = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from("google_calendar_config")
        .update({
          access_token: null,
          refresh_token: null,
          token_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("user_id", user?.id);

      if (error) throw error;

      setIsConnected(false);
      setTestResult(null);
      toast({
        title: "Desconectado",
        description: "Conta do Google Calendar desconectada com sucesso."
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível desconectar a conta",
        variant: "destructive"
      });
    } finally {
      setDisconnecting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copiado!",
      description: "URI copiada para a área de transferência"
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <CardTitle className="text-lg">Google Calendar</CardTitle>
              <CardDescription>Carregando...</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Google Calendar</CardTitle>
                  <CardDescription>
                    Configure o OAuth do Google para agendar reuniões
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isConnected && (
                  <Badge variant="default" className="bg-green-600">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Conectado
                  </Badge>
                )}
                {hasConfig && !isConnected && (
                  <Badge variant="secondary">
                    Não conectado
                  </Badge>
                )}
                {isOpen ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {/* Instructions */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-2">
              <h4 className="font-medium text-sm">Como configurar:</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>
                  Acesse o{" "}
                  <a 
                    href="https://console.cloud.google.com/apis/credentials" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Google Cloud Console
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Crie um projeto ou selecione um existente</li>
                <li>Vá em "APIs e serviços" → "Credenciais"</li>
                <li>Crie uma credencial "ID do cliente OAuth 2.0" do tipo "Aplicativo Web"</li>
                <li>Adicione a URI de redirecionamento abaixo nas "URIs de redirecionamento autorizados"</li>
                <li>Copie o Client ID e Client Secret para os campos abaixo</li>
                <li>Ative a "Google Calendar API" em "APIs e serviços" → "Biblioteca"</li>
              </ol>
            </div>

            {/* Redirect URI */}
            <div className="space-y-2">
              <Label>URI de Redirecionamento Autorizada</Label>
              <div className="flex gap-2">
                <Input 
                  value={redirectUri}
                  readOnly
                  className="font-mono text-sm bg-muted"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => copyToClipboard(redirectUri)}
                  title="Copiar URI"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Copie esta URI e adicione nas "URIs de redirecionamento autorizados" no Google Cloud Console
              </p>
            </div>

            {/* Credentials */}
            <div className="grid gap-4">
              <div>
                <Label>Client ID</Label>
                <Input 
                  type={showCredentials ? "text" : "password"}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Seu Client ID do OAuth"
                  className="font-mono text-sm mt-1"
                />
              </div>
              <div>
                <Label>Client Secret</Label>
                <div className="flex gap-2 mt-1">
                  <Input 
                    type={showCredentials ? "text" : "password"}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder="Seu Client Secret do OAuth"
                    className="font-mono text-sm"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setShowCredentials(!showCredentials)}
                  >
                    {showCredentials ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Calendar ID (opcional)</Label>
                <Input 
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  placeholder="primary"
                  className="font-mono text-sm mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Deixe "primary" para usar o calendário principal ou insira o ID de um calendário específico
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={saveConfig} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar Credenciais
              </Button>
              
              {hasConfig && !isConnected && (
                <Button 
                  variant="default" 
                  onClick={initiateOAuth}
                  disabled={connecting || !clientId.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {connecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Calendar className="h-4 w-4 mr-2" />
                  )}
                  Conectar com Google
                </Button>
              )}

              {isConnected && (
                <>
                  <Button variant="outline" onClick={testConnection} disabled={testing}>
                    {testing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Testar Conexão
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={disconnectAccount}
                    disabled={disconnecting}
                  >
                    {disconnecting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    Desconectar
                  </Button>
                </>
              )}
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`p-3 rounded-lg border ${
                testResult.success 
                  ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' 
                  : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <span className={`text-sm ${
                    testResult.success 
                      ? 'text-green-800 dark:text-green-200' 
                      : 'text-red-800 dark:text-red-200'
                  }`}>
                    {testResult.message}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
