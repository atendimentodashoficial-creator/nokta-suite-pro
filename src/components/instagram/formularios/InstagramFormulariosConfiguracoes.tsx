import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function InstagramFormulariosConfiguracoes() {
  const [formBaseUrl, setFormBaseUrl] = useState("");
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["instagram-config"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      const { data, error } = await supabase
        .from("instagram_config")
        .select("form_base_url")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (config) {
      setFormBaseUrl(config.form_base_url || "");
    }
  }, [config]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      const { error } = await supabase
        .from("instagram_config")
        .update({ form_base_url: formBaseUrl || null })
        .eq("user_id", user.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-config"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: () => {
      toast.error("Erro ao salvar configurações. Verifique se você já configurou a integração do Instagram.");
    },
  });

  if (isLoading) {
    return <Skeleton className="h-[300px] w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Configurações</h2>
        <Button onClick={() => saveConfig.mutate()} disabled={saveConfig.isPending}>
          <Save className="h-4 w-4 mr-2" />
          {saveConfig.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>URL Base dos Formulários</CardTitle>
          <CardDescription>
            Configure a URL base para os formulários do Instagram. Deixe em branco para usar a URL padrão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>URL Base</Label>
            <Input
              value={formBaseUrl}
              onChange={(e) => setFormBaseUrl(e.target.value)}
              placeholder="https://seusite.com"
            />
            <p className="text-xs text-muted-foreground">
              Exemplo: https://seusite.com (os formulários serão acessados via https://seusite.com/formulario/ID)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
