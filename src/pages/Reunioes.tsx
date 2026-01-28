import { useState } from "react";
import { Video, Calendar, Clock, FileText, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { TemplateCamposDialog } from "@/components/reunioes/TemplateCamposDialog";
import { ReuniaoDetalhesDialog } from "@/components/reunioes/ReuniaoDetalhesDialog";

interface Reuniao {
  id: string;
  fireflies_id: string | null;
  google_event_id: string | null;
  titulo: string;
  data_reuniao: string;
  duracao_minutos: number | null;
  participantes: string[] | null;
  transcricao: string | null;
  resumo_ia: string | null;
  meet_link: string | null;
  status: string;
  created_at: string;
}

export default function Reunioes() {
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [selectedReuniao, setSelectedReuniao] = useState<Reuniao | null>(null);

  const { data: reunioes, isLoading, refetch } = useQuery({
    queryKey: ["reunioes", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reunioes" as any)
        .select("*")
        .order("data_reuniao", { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as Reuniao[];
    },
    enabled: !!user?.id,
  });

  const { data: firefliesConfig } = useQuery({
    queryKey: ["fireflies-config", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fireflies_config")
        .select("*")
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const handleSync = async () => {
    if (!firefliesConfig?.api_key) {
      toast.error("Configure a API do Fireflies em Configurações > Conexões");
      return;
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-fireflies", {
        body: { userId: user?.id },
      });

      if (error) throw error;
      
      toast.success(`${data.synced || 0} reuniões sincronizadas`);
      refetch();
    } catch (error: any) {
      console.error("Sync error:", error);
      toast.error("Erro ao sincronizar reuniões");
    } finally {
      setSyncing(false);
    }
  };

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    }
    return `${mins}min`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "transcrito":
        return <Badge variant="secondary">Transcrito</Badge>;
      case "resumido":
        return <Badge className="bg-green-500/20 text-green-700">Resumido</Badge>;
      case "pendente":
        return <Badge variant="outline">Pendente</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Video className="w-6 h-6" />
          <h1 className="text-2xl font-bold">Reuniões</h1>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <TemplateCamposDialog />
          <Button 
            onClick={handleSync} 
            disabled={syncing || !firefliesConfig?.api_key}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar Fireflies
          </Button>
        </div>
      </div>

      {/* Warning if no Fireflies config */}
      {!firefliesConfig?.api_key && (
        <Card className="border-yellow-500/50 bg-yellow-500/10">
          <CardContent className="pt-6">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Configure sua API Key do Fireflies em{" "}
              <a href="/configuracoes?tab=conexoes" className="underline font-medium">
                Configurações → Conexões
              </a>{" "}
              para sincronizar suas reuniões.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Meetings List */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reunioes && reunioes.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reunioes.map((reuniao) => (
            <Card key={reuniao.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg line-clamp-2">
                    {reuniao.titulo}
                  </CardTitle>
                  {getStatusBadge(reuniao.status)}
                </div>
                <CardDescription className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {format(new Date(reuniao.data_reuniao), "dd MMM yyyy", { locale: ptBR })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(reuniao.duracao_minutos)}
                  </span>
                </CardDescription>
              </CardHeader>
              
              <CardContent className="flex-1 space-y-3">
                {reuniao.participantes && reuniao.participantes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {reuniao.participantes.slice(0, 3).map((p, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                    {reuniao.participantes.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{reuniao.participantes.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
                
                {reuniao.resumo_ia ? (
                  <p className="text-sm text-muted-foreground line-clamp-4">
                    {reuniao.resumo_ia}
                  </p>
                ) : reuniao.transcricao ? (
                  <p className="text-sm text-muted-foreground line-clamp-4 italic">
                    Transcrição disponível - resumo pendente
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    Aguardando transcrição...
                  </p>
                )}
              </CardContent>

              <div className="p-4 pt-0 mt-auto">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full gap-2"
                  onClick={() => setSelectedReuniao(reuniao)}
                >
                  <FileText className="w-4 h-4" />
                  Ver Detalhes
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Video className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma reunião encontrada</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                Clique em "Sincronizar Fireflies" para importar suas reuniões ou configure a API em Conexões.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog de detalhes */}
      <ReuniaoDetalhesDialog 
        reuniao={selectedReuniao}
        open={!!selectedReuniao}
        onOpenChange={(open) => !open && setSelectedReuniao(null)}
      />
    </div>
  );
}
