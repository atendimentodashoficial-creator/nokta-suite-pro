import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Save, UserCheck, Heart } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function VerificarSeguidorConfig() {
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

  const [ativo, setAtivo] = useState(false);
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (config) {
      setAtivo((config as any).verificar_seguidor ?? false);
      setMensagem((config as any).mensagem_pedir_seguir ?? "");
    }
  }, [config]);

  const saveConfig = useMutation({
    mutationFn: async () => {
      if (!config?.id) throw new Error("Configuração não encontrada");

      const { error } = await supabase
        .from("instagram_config")
        .update({
          verificar_seguidor: ativo,
          mensagem_pedir_seguir: mensagem || null,
        } as any)
        .eq("id", config.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-config"] });
      toast.success("Configuração salva!");
    },
    onError: (error) => {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar configuração");
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!config?.id) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Configure as credenciais da API primeiro
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-pink-500" />
          Verificar Seguidor
        </CardTitle>
        <CardDescription>
          Verifique se quem te mandou mensagem te segue e peça para seguir
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Heart className="h-4 w-4" />
          <AlertDescription>
            Quando ativado, o sistema verifica se a pessoa te segue antes de responder.
            Se não seguir, envia a mensagem pedindo para seguir.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <Label htmlFor="verificar-seguidor" className="flex items-center gap-2 cursor-pointer">
            Ativar verificação de seguidor
          </Label>
          <Switch
            id="verificar-seguidor"
            checked={ativo}
            onCheckedChange={setAtivo}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensagem para pedir seguir</Label>
          <Textarea
            placeholder="Olá! 👋 Antes de continuar, me segue lá pra não perder nenhuma novidade! 💜"
            rows={4}
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            disabled={!ativo}
          />
          <p className="text-xs text-muted-foreground">
            Use {"{nome}"} para incluir o nome do usuário (quando disponível)
          </p>
        </div>

        <Button
          onClick={() => saveConfig.mutate()}
          disabled={saveConfig.isPending || !ativo}
          className="w-full"
        >
          {saveConfig.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Salvar Configuração
        </Button>
      </CardContent>
    </Card>
  );
}
