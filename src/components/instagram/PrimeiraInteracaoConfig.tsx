import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Sparkles, Save, UserPlus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PrimeiraInteracaoConfig() {
  const queryClient = useQueryClient();

  const { data: gatilho, isLoading } = useQuery({
    queryKey: ["instagram-gatilho-primeira-interacao"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("instagram_gatilhos")
        .select("*")
        .eq("user_id", user.id)
        .eq("tipo", "primeira_interacao")
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const [ativo, setAtivo] = useState(gatilho?.ativo ?? false);
  const [mensagem, setMensagem] = useState(gatilho?.resposta_texto ?? "");

  // Update local state when data loads
  useState(() => {
    if (gatilho) {
      setAtivo(gatilho.ativo);
      setMensagem(gatilho.resposta_texto || "");
    }
  });

  const saveGatilho = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const gatilhoData = {
        user_id: user.id,
        nome: "Boas-vindas (Primeira Interação)",
        tipo: "primeira_interacao",
        palavras_chave: [],
        resposta_texto: mensagem,
        ativo,
      };

      if (gatilho?.id) {
        const { error } = await supabase
          .from("instagram_gatilhos")
          .update(gatilhoData)
          .eq("id", gatilho.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("instagram_gatilhos")
          .insert(gatilhoData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-gatilho-primeira-interacao"] });
      toast.success("Configuração de boas-vindas salva!");
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

  return (
    <Card className="border-l-4 border-l-green-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <UserPlus className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <CardTitle className="text-base">Boas-vindas</CardTitle>
              <CardDescription className="text-xs">
                Mensagem para primeira interação
              </CardDescription>
            </div>
          </div>
          <Switch
            checked={ativo}
            onCheckedChange={setAtivo}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {ativo && (
          <>
            <div className="p-3 bg-muted/50 rounded-lg flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Enviada automaticamente quando alguém inicia uma conversa pela primeira vez.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Mensagem</Label>
              <Textarea
                placeholder="Olá! 👋 Seja bem-vindo(a)! Como posso te ajudar hoje?"
                rows={3}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Use {"{nome}"} para incluir o nome do usuário
              </p>
            </div>

            <Button
              onClick={() => saveGatilho.mutate()}
              disabled={saveGatilho.isPending}
              className="w-full"
              size="sm"
            >
              {saveGatilho.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
