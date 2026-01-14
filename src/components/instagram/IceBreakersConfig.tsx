import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Snowflake, GripVertical, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface IceBreaker {
  question: string;
  payload: string;
}

interface IceBreakersConfigProps {
  configId: string | null;
  iceBreakers: IceBreaker[];
  pageAccessToken: string;
  instagramAccountId: string | null;
}

export function IceBreakersConfig({ 
  configId, 
  iceBreakers: initialIceBreakers, 
  pageAccessToken,
  instagramAccountId 
}: IceBreakersConfigProps) {
  const [iceBreakers, setIceBreakers] = useState<IceBreaker[]>(initialIceBreakers || []);
  const queryClient = useQueryClient();

  const addIceBreaker = () => {
    if (iceBreakers.length >= 4) {
      toast.error("Máximo de 4 Ice Breakers permitido");
      return;
    }
    setIceBreakers([...iceBreakers, { question: "", payload: "" }]);
  };

  const updateIceBreaker = (index: number, field: keyof IceBreaker, value: string) => {
    const updated = [...iceBreakers];
    updated[index] = { ...updated[index], [field]: value };
    setIceBreakers(updated);
  };

  const removeIceBreaker = (index: number) => {
    setIceBreakers(iceBreakers.filter((_, i) => i !== index));
  };

  const saveIceBreakers = useMutation({
    mutationFn: async () => {
      if (!configId) throw new Error("Configuração não encontrada");

      // Save to database
      const { error } = await supabase
        .from("instagram_config")
        .update({ ice_breakers: iceBreakers as unknown as any })
        .eq("id", configId);

      if (error) throw error;

      // Apply to Instagram API
      if (pageAccessToken && instagramAccountId) {
        await applyIceBreakersToInstagram();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-config"] });
      toast.success("Ice Breakers salvos com sucesso!");
    },
    onError: (error) => {
      console.error("Erro ao salvar Ice Breakers:", error);
      toast.error("Erro ao salvar Ice Breakers");
    },
  });

  const applyIceBreakersToInstagram = async () => {
    if (!instagramAccountId || !pageAccessToken) return;

    const trimmed = pageAccessToken.trim();
    const isIGToken = trimmed.startsWith("IG");

    // Format ice breakers for Instagram API
    const formattedIceBreakers = iceBreakers
      .filter(ib => ib.question.trim())
      .map(ib => ({
        question: ib.question,
        payload: ib.payload || ib.question.toLowerCase().replace(/\s+/g, "_"),
      }));

    const url = isIGToken
      ? `https://graph.instagram.com/v24.0/${instagramAccountId}/ice_breakers`
      : `https://graph.facebook.com/v18.0/${instagramAccountId}/ice_breakers`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (isIGToken) {
      headers['Authorization'] = `Bearer ${trimmed}`;
    }

    const body = isIGToken
      ? { ice_breakers: formattedIceBreakers }
      : { ice_breakers: formattedIceBreakers, access_token: trimmed };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = await response.json();
        console.warn("Ice Breakers API response:", result);
        // Don't throw - just log, as this might fail if permissions aren't set
      }
    } catch (error) {
      console.warn("Could not apply Ice Breakers to Instagram:", error);
    }
  };

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Snowflake className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-base">Ice Breakers</CardTitle>
            <CardDescription className="text-xs">
              Botões para novos contatos (máx. 4)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            Perguntas pré-definidas que aparecem para novos contatos. Ao clicar, ativam o gatilho correspondente.
          </p>
        </div>

        <div className="space-y-2">
          {iceBreakers.map((ib, index) => (
            <div key={index} className="flex items-center gap-2 p-3 border rounded-lg bg-background hover:shadow-sm transition-shadow">
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  placeholder="Pergunta (ex: Qual o preço?)"
                  value={ib.question}
                  onChange={(e) => updateIceBreaker(index, "question", e.target.value)}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder="Payload (ex: preco)"
                  value={ib.payload}
                  onChange={(e) => updateIceBreaker(index, "payload", e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => removeIceBreaker(index)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={addIceBreaker}
            disabled={iceBreakers.length >= 4}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar
          </Button>

          <Button
            onClick={() => saveIceBreakers.mutate()}
            disabled={saveIceBreakers.isPending}
            className="w-full sm:w-auto"
          >
            {saveIceBreakers.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
