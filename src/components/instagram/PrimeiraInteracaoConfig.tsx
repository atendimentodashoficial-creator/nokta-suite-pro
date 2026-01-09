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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-green-500" />
          Boas-vindas (Primeira Interação)
        </CardTitle>
        <CardDescription>
          Mensagem automática para quem te manda a primeira mensagem
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertDescription>
            Esta mensagem é enviada automaticamente quando alguém inicia uma conversa 
            com você pela primeira vez. Funciona como boas-vindas para novos contatos!
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between">
          <Label htmlFor="ativo" className="flex items-center gap-2 cursor-pointer">
            Ativar boas-vindas automáticas
          </Label>
          <Switch
            id="ativo"
            checked={ativo}
            onCheckedChange={setAtivo}
          />
        </div>

        <div className="space-y-2">
          <Label>Mensagem de boas-vindas</Label>
          <Textarea
            placeholder="Olá! 👋 Seja bem-vindo(a)! Como posso te ajudar hoje?"
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
          onClick={() => saveGatilho.mutate()}
          disabled={saveGatilho.isPending || !ativo}
          className="w-full"
        >
          {saveGatilho.isPending ? (
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
