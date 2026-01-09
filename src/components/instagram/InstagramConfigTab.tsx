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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const configSchema = z.object({
  app_id: z.string().min(1, "App ID é obrigatório"),
  app_secret: z.string().min(1, "App Secret é obrigatório"),
  page_access_token: z.string().min(1, "Page Access Token é obrigatório"),
  instagram_account_id: z.string().optional(),
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
    },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        app_id: config.app_id || "",
        app_secret: config.app_secret || "",
        page_access_token: config.page_access_token || "",
        instagram_account_id: config.instagram_account_id || "",
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
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {config?.is_active ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground" />
            )}
            Status da Conexão
          </CardTitle>
        </CardHeader>
        <CardContent>
          {config?.is_active ? (
            <p className="text-sm text-green-600">Instagram API configurada e ativa</p>
          ) : (
            <p className="text-sm text-muted-foreground">Configure suas credenciais abaixo para ativar</p>
          )}
        </CardContent>
      </Card>

      {/* Webhook Info */}
      <Card>
        <CardHeader>
          <CardTitle>Configuração do Webhook</CardTitle>
          <CardDescription>
            Configure estes valores no seu App do Meta for Developers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Callback URL</label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyToClipboard(webhookUrl, "URL")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {config?.webhook_verify_token && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Verify Token</label>
              <div className="flex gap-2">
                <Input
                  value={config.webhook_verify_token}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(config.webhook_verify_token, "Token")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <Alert>
            <AlertTitle>Campos obrigatórios no Webhook</AlertTitle>
            <AlertDescription className="mt-2">
              <ul className="list-disc list-inside text-sm space-y-1">
                <li><code className="bg-muted px-1 rounded">messages</code> - Para receber DMs</li>
                <li><code className="bg-muted px-1 rounded">comments</code> - Para receber comentários</li>
                <li><code className="bg-muted px-1 rounded">messaging_postbacks</code> - Para botões</li>
              </ul>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Credentials Form */}
      <Card>
        <CardHeader>
          <CardTitle>Credenciais da API</CardTitle>
          <CardDescription>
            Obtenha essas informações no{" "}
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
    </div>
  );
}
