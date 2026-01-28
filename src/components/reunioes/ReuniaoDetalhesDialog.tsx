import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, Clock, FileText, Users, Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Reuniao {
  id: string;
  titulo: string;
  data_reuniao: string;
  duracao_minutos: number | null;
  participantes: string[] | null;
  transcricao: string | null;
  resumo_ia: string | null;
  status: string;
}

interface CampoPreenchido {
  id: string;
  campo_nome: string;
  campo_descricao: string | null;
  valor: string | null;
  ordem: number;
}

interface ReuniaoDetalhesDialogProps {
  reuniao: Reuniao | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReuniaoDetalhesDialog({ reuniao, open, onOpenChange }: ReuniaoDetalhesDialogProps) {
  const queryClient = useQueryClient();

  const { data: camposPreenchidos, isLoading } = useQuery({
    queryKey: ["reuniao-campos-preenchidos", reuniao?.id],
    queryFn: async () => {
      if (!reuniao?.id) return [];
      
      const { data, error } = await supabase
        .from("reuniao_campos_preenchidos" as any)
        .select("*")
        .eq("reuniao_id", reuniao.id)
        .order("ordem", { ascending: true });
      
      if (error) throw error;
      return (data || []) as unknown as CampoPreenchido[];
    },
    enabled: !!reuniao?.id && open,
  });

  const { data: hasTemplateFields } = useQuery({
    queryKey: ["has-template-campos"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("reuniao_template_campos" as any)
        .select("*", { count: "exact", head: true })
        .eq("ativo", true);
      
      if (error) throw error;
      return (count || 0) > 0;
    },
    enabled: open,
  });

  const processMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("process-reuniao-summary", {
        body: { reuniaoId: reuniao?.id },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reuniao-campos-preenchidos", reuniao?.id] });
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      toast.success("Reunião resumida com sucesso!");
    },
    onError: (error) => {
      console.error("Error processing summary:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao processar resumo");
    },
  });

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins}min`;
  };

  if (!reuniao) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">{reuniao.titulo}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Metadata */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {format(new Date(reuniao.data_reuniao), "dd 'de' MMMM 'de' yyyy, HH:mm", { locale: ptBR })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {formatDuration(reuniao.duracao_minutos)}
              </span>
            </div>

            {/* Participants */}
            {reuniao.participantes && reuniao.participantes.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Participantes
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {reuniao.participantes.map((p, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {p}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Custom Fields */}
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ))}
              </div>
            ) : camposPreenchidos && camposPreenchidos.length > 0 ? (
              <div className="space-y-4">
                {camposPreenchidos.map((campo) => (
                  <div key={campo.id}>
                    <h4 className="text-sm font-medium mb-1">{campo.campo_nome}</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {campo.valor || "Não preenchido"}
                    </p>
                  </div>
                ))}
              </div>
            ) : reuniao.transcricao && hasTemplateFields ? (
              <div className="text-center py-6 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {reuniao.resumo_ia 
                    ? "Esta reunião tem um resumo básico. Clique para gerar um resumo detalhado com os campos do template."
                    : "Esta reunião tem transcrição mas ainda não foi resumida."
                  }
                </p>
                <Button
                  onClick={() => processMutation.mutate()}
                  disabled={processMutation.isPending}
                  className="gap-2"
                >
                  {processMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Gerar Resumo com IA
                </Button>
              </div>
            ) : reuniao.resumo_ia ? (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Resumo
                </h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {reuniao.resumo_ia}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                {!reuniao.transcricao 
                  ? "Aguardando transcrição. Vincule uma transcrição do Fireflies primeiro."
                  : "Configure os campos do template para gerar resumos personalizados."
                }
              </p>
            )}

            {/* Transcription (collapsible) */}
            {reuniao.transcricao && (
              <>
                <Separator />
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Ver Transcrição Completa
                  </summary>
                  <div className="mt-3 p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {reuniao.transcricao}
                    </p>
                  </div>
                </details>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
