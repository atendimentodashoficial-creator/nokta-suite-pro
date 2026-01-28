import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { FileText, Search, Link2, Calendar, Clock, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VincularTranscricaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reuniaoId: string;
  reuniaoTitulo: string;
}

interface ReuniaoFireflies {
  id: string;
  fireflies_id: string;
  titulo: string;
  data_reuniao: string;
  duracao_minutos: number | null;
  transcricao: string | null;
  resumo_ia: string | null;
}

export function VincularTranscricaoDialog({
  open,
  onOpenChange,
  reuniaoId,
  reuniaoTitulo,
}: VincularTranscricaoDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  // Buscar reuniões do Fireflies que têm transcrição
  const { data: reunioesFireflies, isLoading } = useQuery({
    queryKey: ["reunioes-fireflies", user?.id, search],
    queryFn: async () => {
      let query = supabase
        .from("reunioes" as any)
        .select("id, fireflies_id, titulo, data_reuniao, duracao_minutos, transcricao, resumo_ia")
        .not("fireflies_id", "is", null)
        .not("transcricao", "is", null)
        .order("data_reuniao", { ascending: false });

      if (search.trim()) {
        query = query.ilike("titulo", `%${search}%`);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return (data || []) as unknown as ReuniaoFireflies[];
    },
    enabled: !!user?.id && open,
  });

  const vincularMutation = useMutation({
    mutationFn: async (reuniaoFireflies: ReuniaoFireflies) => {
      // Copiar a transcrição e resumo da reunião do Fireflies para a reunião agendada
      const { error } = await supabase
        .from("reunioes")
        .update({
          fireflies_id: reuniaoFireflies.fireflies_id,
          transcricao: reuniaoFireflies.transcricao,
          resumo_ia: reuniaoFireflies.resumo_ia,
          status: reuniaoFireflies.resumo_ia ? "resumido" : "transcrito",
        })
        .eq("id", reuniaoId);

      if (error) throw error;

      // Opcionalmente, remover a reunião duplicada do Fireflies
      // Não vamos deletar para preservar histórico
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      toast.success("Transcrição vinculada com sucesso!");
      onOpenChange(false);
    },
    onError: () => {
      toast.error("Erro ao vincular transcrição");
    },
  });

  const handleVincular = (reuniaoFireflies: ReuniaoFireflies) => {
    vincularMutation.mutate(reuniaoFireflies);
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}min`;
    return `${mins}min`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Vincular Transcrição do Fireflies
          </DialogTitle>
          <DialogDescription>
            Selecione uma reunião transcrita pelo Fireflies para vincular a "{reuniaoTitulo}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título da reunião..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Lista de reuniões do Fireflies */}
          <ScrollArea className="h-[350px] border rounded-lg">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground">
                Carregando transcrições...
              </div>
            ) : reunioesFireflies && reunioesFireflies.length > 0 ? (
              <div className="divide-y">
                {reunioesFireflies.map((reuniao) => (
                  <div
                    key={reuniao.id}
                    className="p-4 hover:bg-muted/50 transition-colors space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{reuniao.titulo}</h4>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(reuniao.data_reuniao), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                          </span>
                          {reuniao.duracao_minutos && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDuration(reuniao.duracao_minutos)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {reuniao.resumo_ia ? (
                          <Badge className="bg-green-500/20 text-green-700">Resumido</Badge>
                        ) : (
                          <Badge variant="secondary">Transcrito</Badge>
                        )}
                      </div>
                    </div>

                    {/* Preview da transcrição */}
                    {reuniao.resumo_ia && (
                      <p className="text-sm text-muted-foreground line-clamp-2 italic border-l-2 border-primary/30 pl-2">
                        {reuniao.resumo_ia}
                      </p>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 mt-2"
                      onClick={() => handleVincular(reuniao)}
                      disabled={vincularMutation.isPending}
                    >
                      <FileText className="w-4 h-4" />
                      Vincular esta transcrição
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-muted-foreground">
                <FileText className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">Nenhuma transcrição encontrada</p>
                <p className="text-sm mt-1">
                  Sincronize suas reuniões do Fireflies primeiro
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
