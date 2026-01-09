import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageCircle, AtSign, Send, Reply, Inbox } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Mensagem {
  id: string;
  instagram_user_id: string;
  instagram_username: string | null;
  tipo: string;
  conteudo: string | null;
  post_id: string | null;
  gatilho_id: string | null;
  fluxo_id: string | null;
  created_at: string;
}

const tipoConfig: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "outline" }> = {
  dm_recebida: { label: "DM Recebida", icon: MessageCircle, variant: "default" },
  dm_enviada: { label: "DM Enviada", icon: Send, variant: "secondary" },
  comentario_recebido: { label: "Comentário", icon: AtSign, variant: "outline" },
  comentario_resposta: { label: "Resposta", icon: Reply, variant: "secondary" },
};

export function InstagramHistoricoTab() {
  const { data: mensagens, isLoading } = useQuery({
    queryKey: ["instagram-mensagens"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data, error } = await supabase
        .from("instagram_mensagens")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as Mensagem[];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Histórico de Interações</h2>
        <p className="text-sm text-muted-foreground">
          Últimas 100 mensagens e comentários processados
        </p>
      </div>

      {mensagens?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">Nenhuma interação ainda</h3>
            <p className="text-sm text-muted-foreground">
              As mensagens e comentários aparecerão aqui quando chegarem
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <div className="divide-y">
                {mensagens?.map((msg) => {
                  const config = tipoConfig[msg.tipo] || tipoConfig.dm_recebida;
                  const Icon = config.icon;

                  return (
                    <div key={msg.id} className="p-4 hover:bg-muted/50">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              @{msg.instagram_username || msg.instagram_user_id}
                            </span>
                            <Badge variant={config.variant} className="text-xs">
                              {config.label}
                            </Badge>
                            {msg.gatilho_id && (
                              <Badge variant="outline" className="text-xs">
                                Via Gatilho
                              </Badge>
                            )}
                          </div>
                          {msg.conteudo && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {msg.conteudo}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(msg.created_at), "dd MMM yyyy 'às' HH:mm", {
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
