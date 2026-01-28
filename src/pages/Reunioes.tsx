import { useState } from "react";
import { Video, Calendar, Clock, FileText, RefreshCw, Bell, Link2, Users, XCircle, CalendarClock, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { TemplateCamposDialog } from "@/components/reunioes/TemplateCamposDialog";
import { ReuniaoDetalhesDialog } from "@/components/reunioes/ReuniaoDetalhesDialog";
import { AvisosReuniaoTab } from "@/components/reunioes/AvisosReuniaoTab";
import { VincularTranscricaoDialog } from "@/components/reunioes/VincularTranscricaoDialog";
import { ReagendarReuniaoDialog } from "@/components/reunioes/ReagendarReuniaoDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  cliente_id: string | null;
  cliente_telefone: string | null;
}

export default function Reunioes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [selectedReuniao, setSelectedReuniao] = useState<Reuniao | null>(null);
  const [activeTab, setActiveTab] = useState("reunioes");
  const [vincularDialogOpen, setVincularDialogOpen] = useState(false);
  const [reuniaoParaVincular, setReuniaoParaVincular] = useState<Reuniao | null>(null);
  const [reuniaoParaDesmarcar, setReuniaoParaDesmarcar] = useState<Reuniao | null>(null);
  const [reuniaoParaReagendar, setReuniaoParaReagendar] = useState<Reuniao | null>(null);
  const [reuniaoParaExcluir, setReuniaoParaExcluir] = useState<Reuniao | null>(null);

  const { data: reunioes, isLoading, refetch } = useQuery({
    queryKey: ["reunioes", user?.id],
    queryFn: async () => {
      // Buscar apenas reuniões agendadas (com google_event_id)
      // Reuniões só do Fireflies (sem google_event_id) ficam ocultas para vinculação manual
      const { data, error } = await supabase
        .from("reunioes" as any)
        .select("*")
        .not("google_event_id", "is", null)
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

  const desmarcarMutation = useMutation({
    mutationFn: async (reuniaoId: string) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase.functions.invoke("google-calendar-cancel-event", {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: { reuniaoId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      if (data?.warning) {
        toast.warning(data.warning);
      } else {
        toast.success("Reunião desmarcada com sucesso!");
      }
      setReuniaoParaDesmarcar(null);
    },
    onError: (error) => {
      console.error("Erro ao desmarcar:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao desmarcar reunião");
    },
  });

  const excluirMutation = useMutation({
    mutationFn: async (reuniaoId: string) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Usuário não autenticado");
      }

      const { data, error } = await supabase.functions.invoke("google-calendar-delete-event", {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: { reuniaoId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      toast.success("Reunião excluída com sucesso!");
      setReuniaoParaExcluir(null);
    },
    onError: (error) => {
      console.error("Erro ao excluir:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao excluir reunião");
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "transcrito":
        return <Badge variant="secondary">Transcrito</Badge>;
      case "resumido":
        return <Badge className="bg-green-500/20 text-green-700">Resumido</Badge>;
      case "pendente":
        return <Badge variant="outline">Pendente</Badge>;
      case "cancelado":
        return <Badge variant="destructive">Cancelado</Badge>;
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
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reunioes" className="gap-2">
            <Video className="w-4 h-4" />
            Reuniões
          </TabsTrigger>
          <TabsTrigger value="avisos" className="gap-2">
            <Bell className="w-4 h-4" />
            Avisos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reunioes" className="space-y-6 mt-6">
          {/* Header controls for reunioes tab */}
          <div className="flex items-center justify-end gap-2 flex-wrap">
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
                  <CardContent className="p-5 space-y-4">
                    <Skeleton className="h-5 w-1/3" />
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-10 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : reunioes && reunioes.length > 0 ? (
            <div className="space-y-6">
              {/* Agrupar por data */}
              {Object.entries(
                reunioes.reduce((acc, reuniao) => {
                  const dateKey = format(new Date(reuniao.data_reuniao), "yyyy-MM-dd");
                  if (!acc[dateKey]) acc[dateKey] = [];
                  acc[dateKey].push(reuniao);
                  return acc;
                }, {} as Record<string, Reuniao[]>)
              ).map(([dateKey, reunioesDodia]) => (
                <div key={dateKey} className="space-y-4">
                  {/* Header da data */}
                  <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      <span className="font-semibold">
                        {format(parseISO(dateKey), "dd/MM/yyyy")}
                      </span>
                    </div>
                    <span className="text-sm opacity-80 capitalize">
                      {format(parseISO(dateKey), "EEEE", { locale: ptBR })}
                    </span>
                  </div>

                  {/* Cards do dia */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {reunioesDodia.map((reuniao) => (
                      <Card 
                        key={reuniao.id} 
                        className="shadow-card hover:shadow-elegant transition-all duration-300 animate-fade-in relative"
                      >
                        {/* Botão de excluir no canto superior direito */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setReuniaoParaExcluir(reuniao)}
                          title="Excluir reunião"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        <CardContent className="p-5 pt-8 space-y-4">
                          {/* Horário e Status */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              <span className="font-medium text-foreground">
                                {format(new Date(reuniao.data_reuniao), "HH:mm")}
                              </span>
                              {reuniao.duracao_minutos && (
                                <span className="text-xs">
                                  ({formatDuration(reuniao.duracao_minutos)})
                                </span>
                              )}
                            </div>
                            {getStatusBadge(reuniao.status)}
                          </div>

                          {/* Título */}
                          <h3 className="font-semibold text-lg line-clamp-2">
                            {reuniao.titulo}
                          </h3>

                          {/* Participantes */}
                          {reuniao.participantes && reuniao.participantes.length > 0 && (
                            <div className="flex items-start gap-2 text-sm text-muted-foreground">
                              <Users className="w-4 h-4 mt-0.5 shrink-0" />
                              <span className="line-clamp-1">
                                {reuniao.participantes.join(", ")}
                              </span>
                            </div>
                          )}

                          {/* Link da call */}
                          {reuniao.meet_link && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Link2 className="w-4 h-4 shrink-0" />
                              <a 
                                href={reuniao.meet_link} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate"
                              >
                                Acessar reunião
                              </a>
                            </div>
                          )}


                          {/* Botões de ação */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1 gap-2"
                              onClick={() => setSelectedReuniao(reuniao)}
                            >
                              <FileText className="w-4 h-4" />
                              Ver Detalhes
                            </Button>
                            {/* Botão de vincular transcrição */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              onClick={() => {
                                setReuniaoParaVincular(reuniao);
                                setVincularDialogOpen(true);
                              }}
                              title={reuniao.transcricao ? "Vincular outra transcrição do Fireflies" : "Vincular transcrição do Fireflies"}
                            >
                              <FileText className="w-4 h-4" />
                              {reuniao.transcricao ? "Vincular outra" : "Vincular"}
                            </Button>
                          </div>
                          
                          {/* Botões de reagendar/desmarcar - só para reuniões não canceladas */}
                          {reuniao.status !== "cancelado" && (
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-2"
                                onClick={() => setReuniaoParaReagendar(reuniao)}
                              >
                                <CalendarClock className="w-4 h-4" />
                                Reagendar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-2 text-destructive hover:text-destructive"
                                onClick={() => setReuniaoParaDesmarcar(reuniao)}
                              >
                                <XCircle className="w-4 h-4" />
                                Desmarcar
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
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
        </TabsContent>

        <TabsContent value="avisos">
          <AvisosReuniaoTab />
        </TabsContent>
      </Tabs>

      {/* Dialog de detalhes */}
      <ReuniaoDetalhesDialog 
        reuniao={selectedReuniao}
        open={!!selectedReuniao}
        onOpenChange={(open) => !open && setSelectedReuniao(null)}
      />

      {/* Dialog de vincular transcrição */}
      {reuniaoParaVincular && (
        <VincularTranscricaoDialog
          open={vincularDialogOpen}
          onOpenChange={setVincularDialogOpen}
          reuniaoId={reuniaoParaVincular.id}
          reuniaoTitulo={reuniaoParaVincular.titulo}
          transcricaoAtual={reuniaoParaVincular.transcricao ? {
            fireflies_id: reuniaoParaVincular.fireflies_id,
            transcricao: reuniaoParaVincular.transcricao,
            resumo_ia: reuniaoParaVincular.resumo_ia,
          } : null}
        />
      )}

      {/* Dialog de reagendar */}
      <ReagendarReuniaoDialog
        reuniao={reuniaoParaReagendar}
        open={!!reuniaoParaReagendar}
        onOpenChange={(open) => !open && setReuniaoParaReagendar(null)}
      />

      {/* Dialog de confirmação para desmarcar */}
      <AlertDialog open={!!reuniaoParaDesmarcar} onOpenChange={(open) => !open && setReuniaoParaDesmarcar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desmarcar Reunião</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja desmarcar a reunião "{reuniaoParaDesmarcar?.titulo}"?
              Esta ação marcará a reunião como cancelada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => reuniaoParaDesmarcar && desmarcarMutation.mutate(reuniaoParaDesmarcar.id)}
            >
              Desmarcar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação para excluir */}
      <AlertDialog open={!!reuniaoParaExcluir} onOpenChange={(open) => !open && setReuniaoParaExcluir(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Reunião</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a reunião "{reuniaoParaExcluir?.titulo}"?
              Esta ação irá remover a reunião permanentemente do sistema e do Google Calendar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => reuniaoParaExcluir && excluirMutation.mutate(reuniaoParaExcluir.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
