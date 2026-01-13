import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, Save, Loader2, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ConfigFormData {
  app_id: string;
  app_secret: string;
  page_access_token: string;
  instagram_account_id: string;
  form_base_url: string;
}
export function InstagramConfigTab() {
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const queryClient = useQueryClient();
  const {
    data: config,
    isLoading
  } = useQuery({
    queryKey: ["instagram-config"],
    queryFn: async () => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const {
        data,
        error
      } = await supabase.from("instagram_config").select("*").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    }
  });
  const [formData, setFormData] = useState<ConfigFormData>({
    app_id: "",
    app_secret: "",
    page_access_token: "",
    instagram_account_id: "",
    form_base_url: ""
  });
  useEffect(() => {
    if (config) {
      setFormData({
        app_id: config.app_id || "",
        app_secret: config.app_secret || "",
        page_access_token: config.page_access_token || "",
        instagram_account_id: config.instagram_account_id || "",
        form_base_url: (config as any).form_base_url || ""
      });
    }
  }, [config]);
  const saveConfig = useMutation({
    mutationFn: async (data: ConfigFormData) => {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      const configData = {
        user_id: user.id,
        app_id: data.app_id,
        app_secret: data.app_secret,
        page_access_token: data.page_access_token,
        instagram_account_id: data.instagram_account_id || null,
        form_base_url: data.form_base_url || null,
        is_active: true
      };
      if (config?.id) {
        const {
          error
        } = await supabase.from("instagram_config").update(configData).eq("id", config.id);
        if (error) throw error;
      } else {
        const {
          error
        } = await supabase.from("instagram_config").insert(configData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["instagram-config"]
      });
      toast.success("Configuração salva com sucesso!");
    },
    onError: error => {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    }
  });
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`;
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveConfig.mutate(formData);
  };
  if (isLoading) {
    return <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>;
  }
  return <div className="space-y-6">
      {/* Webhook Info */}
      <div className="space-y-4">
        <Label className="text-base font-medium">Configuração do Webhook</Label>
        
        <div className="space-y-2">
          <Label>Callback URL</Label>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copyToClipboard(webhookUrl, "URL")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {config?.webhook_verify_token && <div className="space-y-2">
            <Label>Verify Token</Label>
            <div className="flex gap-2">
              <Input value={config.webhook_verify_token} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(config.webhook_verify_token, "Token")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>}

        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs font-medium mb-2">Campos obrigatórios:</p>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs font-mono rounded">messages</Badge>
            <Badge variant="secondary" className="text-xs font-mono rounded">comments</Badge>
            <Badge variant="secondary" className="text-xs font-mono rounded">messaging_postbacks</Badge>
          </div>
        </div>
      </div>

      {/* Credentials Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>App ID</Label>
          <Input value={formData.app_id} onChange={e => setFormData({
          ...formData,
          app_id: e.target.value
        })} />
        </div>

        <div className="space-y-2">
          <Label>App Secret</Label>
          <div className="flex gap-2">
            <Input type={showSecret ? "text" : "password"} value={formData.app_secret} onChange={e => setFormData({
            ...formData,
            app_secret: e.target.value
          })} />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowSecret(!showSecret)}>
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Page Access Token</Label>
          <div className="flex gap-2">
            <Input type={showToken ? "text" : "password"} value={formData.page_access_token} onChange={e => setFormData({
            ...formData,
            page_access_token: e.target.value
          })} />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowToken(!showToken)}>
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Instagram Account ID (opcional)</Label>
          <Input value={formData.instagram_account_id} onChange={e => setFormData({
          ...formData,
          instagram_account_id: e.target.value
        })} />
        </div>

        <div className="space-y-2">
          <Label>URL Base dos Formulários (opcional)</Label>
          <div className="flex gap-2">
            <Input value={formData.form_base_url} onChange={e => setFormData({
            ...formData,
            form_base_url: e.target.value
          })} />
            <Button type="button" variant="outline" onClick={() => setFormData({
            ...formData,
            form_base_url: window.location.origin
          })}>
              Usar URL atual
            </Button>
          </div>
        </div>

        <Button type="submit" disabled={saveConfig.isPending} className="w-full">
          {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configuração
        </Button>
      </form>

    </div>;
}