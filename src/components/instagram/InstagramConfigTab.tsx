import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Eye, EyeOff, Save, CheckCircle2, XCircle, Loader2, Copy, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { IceBreakersConfig } from "./IceBreakersConfig";

const configSchema = z.object({
  app_id: z.string().min(1, "App ID é obrigatório"),
  app_secret: z.string().min(1, "App Secret é obrigatório"),
  page_access_token: z.string().min(1, "Page Access Token é obrigatório"),
  instagram_account_id: z.string().optional(),
  form_base_url: z.string().optional(),
});

type ConfigFormData = z.infer<typeof configSchema>;

export function InstagramConfigTab() {
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["instagram-config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("instagram_config")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const form = useForm<ConfigFormData>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      app_id: "",
      app_secret: "",
      page_access_token: "",
      instagram_account_id: "",
      form_base_url: "",
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        app_id: config.app_id || "",
        app_secret: config.app_secret || "",
        page_access_token: config.page_access_token || "",
        instagram_account_id: config.instagram_account_id || "",
        form_base_url: (config as any).form_base_url || "",
      });
    }
  }, [config, form]);

  const saveConfig = useMutation({
    mutationFn: async (data: ConfigFormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const configData = {
        user_id: user.id,
        app_id: data.app_id,
        app_secret: data.app_secret,
        page_access_token: data.page_access_token,
        instagram_account_id: data.instagram_account_id || null,
        form_base_url: data.form_base_url || null,
        is_active: true,
      };

      if (config?.id) {
        const { error } = await supabase
          .from("instagram_config")
          .update(configData)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("instagram_config")
          .insert(configData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-config"] });
      toast.success("Configuração salva com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    },
  });

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Card - Compacto */}
      <Card className="border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${config?.is_active ? 'bg-green-500/10' : 'bg-muted'}`}>
              {config?.is_active ? (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">Status da Conexão</p>
              <p className={`text-xs ${config?.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                {config?.is_active ? "Instagram API configurada e ativa" : "Configure suas credenciais abaixo"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Webhook Info - Mais limpo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuração do Webhook</CardTitle>
          <CardDescription className="text-xs">
            Configure no seu App do Meta for Developers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Callback URL</label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs h-9" />
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3"
                onClick={() => copyToClipboard(webhookUrl, "URL")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {config?.webhook_verify_token && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Verify Token</label>
              <div className="flex gap-2">
                <Input
                  value={config.webhook_verify_token}
                  readOnly
                  className="font-mono text-xs h-9"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3"
                  onClick={() => copyToClipboard(config.webhook_verify_token, "Token")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium mb-2">Campos obrigatórios:</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary" className="text-xs font-mono">messages</Badge>
              <Badge variant="secondary" className="text-xs font-mono">comments</Badge>
              <Badge variant="secondary" className="text-xs font-mono">messaging_postbacks</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credentials Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Credenciais da API</CardTitle>
          <CardDescription className="text-xs">
            Obtenha em{" "}
            <a
              href="https://developers.facebook.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1"
            >
              Meta for Developers
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveConfig.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="app_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App ID</FormLabel>
                    <FormControl>
                      <Input placeholder="123456789012345" {...field} />
                    </FormControl>
                    <FormDescription>
                      ID do seu aplicativo no Meta for Developers
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="app_secret"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App Secret</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showSecret ? "text" : "password"}
                          placeholder="abc123..."
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowSecret(!showSecret)}
                        >
                          {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Chave secreta do aplicativo (em Configurações → Básico)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="page_access_token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Page Access Token</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showToken ? "text" : "password"}
                          placeholder="EAABs..."
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowToken(!showToken)}
                        >
                          {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Token de acesso da página do Facebook conectada ao Instagram
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="instagram_account_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Instagram Account ID (opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder="17841400000000000" {...field} />
                    </FormControl>
                    <FormDescription>
                      ID da conta do Instagram Business (será detectado automaticamente se não informado)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="form_base_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL Base dos Formulários (opcional)</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input placeholder="https://seudominio.com.br" {...field} />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => form.setValue("form_base_url", window.location.origin, { shouldDirty: true })}
                        >
                          Usar URL atual
                        </Button>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Se você ainda não tem domínio, clique em “Usar URL atual”. Se informar manualmente, inclua o https.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={saveConfig.isPending} className="w-full">
                {saveConfig.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar Configuração
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Ice Breakers Configuration */}
      {config?.id && (
        <IceBreakersConfig
          configId={config.id}
          iceBreakers={(config as any).ice_breakers || []}
          pageAccessToken={config.page_access_token}
          instagramAccountId={config.instagram_account_id}
        />
      )}
    </div>
  );
}
