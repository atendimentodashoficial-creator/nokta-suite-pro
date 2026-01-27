import { useState, useEffect } from "react";
import { 
  BarChart3, 
  Users, 
  CheckCircle, 
  XCircle, 
  Clock, 
  MessageCircle, 
  TrendingUp,
  Calendar,
  Percent,
  Send,
  History,
  ChevronDown
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInMinutes, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CampanhaData {
  id: string;
  nome: string;
  status: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  delay_min: number;
  delay_max: number;
  delay_bloco_min: number;
  delay_bloco_max: number;
  iniciado_em: string | null;
  finalizado_em: string | null;
  created_at: string;
}

interface ContatoStats {
  total: number;
  enviados: number;
  falhas: number;
  pendentes: number;
}

interface RespostaStats {
  totalRespostas: number;
  taxaResposta: number;
  chatsComResposta: number;
}

interface SnapshotData {
  id: string;
  versao: number;
  nome_versao: string;
  snapshot_data: {
    nome: string;
    status: string;
    total_contatos: number;
    enviados: number;
    falhas: number;
    delay_min: number;
    delay_max: number;
    delay_bloco_min: number;
    delay_bloco_max: number;
    iniciado_em: string | null;
    finalizado_em: string | null;
    created_at: string;
    contato_stats: ContatoStats;
    blocos_count: number;
  };
  created_at: string;
}

interface RelatorioCampanhaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanhaId: string | null;
}

export function RelatorioCampanhaDialog({
  open,
  onOpenChange,
  campanhaId
}: RelatorioCampanhaDialogProps) {
  const [campanha, setCampanha] = useState<CampanhaData | null>(null);
  const [contatoStats, setContatoStats] = useState<ContatoStats | null>(null);
  const [respostaStats, setRespostaStats] = useState<RespostaStats | null>(null);
  const [blocosCount, setBlocosCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<SnapshotData | null>(null);
  const [viewingSnapshot, setViewingSnapshot] = useState(false);

  useEffect(() => {
    if (open && campanhaId) {
      loadRelatorio();
      loadSnapshots();
    }
  }, [open, campanhaId]);

  const loadSnapshots = async () => {
    if (!campanhaId) return;
    
    const { data } = await supabase
      .from("disparos_campanha_snapshots")
      .select("*")
      .eq("campanha_id", campanhaId)
      .order("versao", { ascending: false });
    
    if (data) {
      // Cast the data properly since snapshot_data is JSONB
      const typedSnapshots = data.map(item => ({
        ...item,
        snapshot_data: item.snapshot_data as unknown as SnapshotData['snapshot_data']
      }));
      setSnapshots(typedSnapshots);
    }
  };

  const viewSnapshot = (snapshot: SnapshotData) => {
    setSelectedSnapshot(snapshot);
    setViewingSnapshot(true);
  };

  const viewCurrentReport = () => {
    setSelectedSnapshot(null);
    setViewingSnapshot(false);
  };

  const loadRelatorio = async () => {
    if (!campanhaId) return;
    
    setIsLoading(true);
    try {
      // Load campaign data
      const { data: campanhaData, error: campanhaError } = await supabase
        .from("disparos_campanhas")
        .select("*")
        .eq("id", campanhaId)
        .single();

      if (campanhaError) throw campanhaError;
      setCampanha(campanhaData);

      // Load contacts stats (only non-archived)
      const { data: contatos, error: contatosError } = await supabase
        .from("disparos_campanha_contatos")
        .select("status")
        .eq("campanha_id", campanhaId)
        .eq("archived", false);

      if (!contatosError && contatos) {
        const stats = {
          total: contatos.length,
          enviados: contatos.filter(c => c.status === "sent").length,
          falhas: contatos.filter(c => c.status === "failed").length,
          pendentes: contatos.filter(c => c.status === "pending").length
        };
        setContatoStats(stats);
      }

      // Load blocks count
      const { data: variacoes } = await supabase
        .from("disparos_campanha_variacoes")
        .select("bloco")
        .eq("campanha_id", campanhaId);

      if (variacoes) {
        const uniqueBlocks = new Set(variacoes.map(v => v.bloco));
        setBlocosCount(uniqueBlocks.size);
      }

      // Load response stats from chats (only non-archived)
      const { data: contSent } = await supabase
        .from("disparos_campanha_contatos")
        .select("numero")
        .eq("campanha_id", campanhaId)
        .eq("status", "sent")
        .eq("archived", false);

      if (contSent && contSent.length > 0) {
        // Check for responses in chats
        const numeros = contSent.map(c => c.numero.replace(/\D/g, '').slice(-8));
        
        const { data: chats } = await supabase
          .from("disparos_chats")
          .select("id, normalized_number");

        if (chats) {
          // Match chats by last 8 digits
          const matchedChats = chats.filter(chat => {
            const chatDigits = chat.normalized_number.replace(/\D/g, '').slice(-8);
            return numeros.some(num => num === chatDigits);
          });

          // Check messages for responses
          let chatsComResposta = 0;
          let totalRespostas = 0;

          for (const chat of matchedChats) {
            const { data: messages } = await supabase
              .from("disparos_messages")
              .select("sender_type")
              .eq("chat_id", chat.id);

            if (messages) {
              const respostasDoContato = messages.filter(m => m.sender_type === "customer").length;
              if (respostasDoContato > 0) {
                chatsComResposta++;
                totalRespostas += respostasDoContato;
              }
            }
          }

          const taxaResposta = contSent.length > 0 
            ? (chatsComResposta / contSent.length) * 100 
            : 0;

          setRespostaStats({
            totalRespostas,
            taxaResposta,
            chatsComResposta
          });
        }
      } else {
        setRespostaStats({
          totalRespostas: 0,
          taxaResposta: 0,
          chatsComResposta: 0
        });
      }

    } catch (error) {
      console.error("Error loading report:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { label: string; color: string }> = {
      pending: { label: "Pendente", color: "bg-yellow-500" },
      running: { label: "Executando", color: "bg-blue-500" },
      paused: { label: "Pausada", color: "bg-gray-500" },
      completed: { label: "Concluída", color: "bg-green-500" },
      failed: { label: "Falhou", color: "bg-red-500" }
    };
    return labels[status] || { label: status, color: "bg-gray-500" };
  };

  const getDuracao = (iniciado: string | null, finalizado: string | null) => {
    if (!iniciado) return null;
    
    const inicio = new Date(iniciado);
    const fim = finalizado ? new Date(finalizado) : new Date();
    
    const minutos = differenceInMinutes(fim, inicio);
    const segundos = differenceInSeconds(fim, inicio) % 60;
    
    if (minutos < 1) return `${segundos}s`;
    if (minutos < 60) return `${minutos}min ${segundos}s`;
    
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    return `${horas}h ${mins}min`;
  };

  // Get data based on whether we're viewing a snapshot or current report
  const displayData = viewingSnapshot && selectedSnapshot 
    ? {
        campanha: {
          ...selectedSnapshot.snapshot_data,
          id: campanhaId,
        } as CampanhaData,
        contatoStats: selectedSnapshot.snapshot_data.contato_stats,
        blocosCount: selectedSnapshot.snapshot_data.blocos_count,
        respostaStats: null as RespostaStats | null // Snapshots don't have response stats
      }
    : {
        campanha,
        contatoStats,
        blocosCount,
        respostaStats
      };

  const currentCampanha = displayData.campanha;
  const currentContatoStats = displayData.contatoStats;
  const currentBlocosCount = displayData.blocosCount;
  const currentRespostaStats = displayData.respostaStats;

  const taxaEntrega = currentContatoStats && currentContatoStats.total > 0
    ? ((currentContatoStats.enviados / currentContatoStats.total) * 100).toFixed(1)
    : "0";

  const taxaFalha = currentContatoStats && currentContatoStats.total > 0
    ? ((currentContatoStats.falhas / currentContatoStats.total) * 100).toFixed(1)
    : "0";

  if (isLoading || !currentCampanha) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            Carregando relatório...
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const statusInfo = getStatusLabel(currentCampanha.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Relatório - {currentCampanha.nome}
            </div>
            
            {/* Version Selector */}
            {snapshots.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <History className="h-4 w-4" />
                    {viewingSnapshot && selectedSnapshot 
                      ? selectedSnapshot.nome_versao 
                      : "Versão Atual"}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem 
                    onClick={viewCurrentReport}
                    className={!viewingSnapshot ? "bg-accent" : ""}
                  >
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">Atual</Badge>
                      Relatório Atual
                    </span>
                  </DropdownMenuItem>
                  <Separator className="my-1" />
                  {snapshots.map((snapshot) => (
                    <DropdownMenuItem 
                      key={snapshot.id}
                      onClick={() => viewSnapshot(snapshot)}
                      className={selectedSnapshot?.id === snapshot.id ? "bg-accent" : ""}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{snapshot.nome_versao}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(snapshot.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Snapshot indicator */}
          {viewingSnapshot && selectedSnapshot && (
            <Card className="p-3 bg-amber-500/10 border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <History className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Visualizando: {selectedSnapshot.nome_versao}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  Salvo em {format(new Date(selectedSnapshot.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </Card>
          )}

          {/* Status e Datas */}
          <div className="flex items-center justify-between">
            <Badge className={`${statusInfo.color} text-white`}>
              {statusInfo.label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Criada em {format(new Date(currentCampanha.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
          </div>

          {/* Cards de Métricas Principais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 text-center">
              <Users className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-2xl font-bold">{currentContatoStats?.total || 0}</p>
              <p className="text-xs text-muted-foreground">Total Contatos</p>
            </Card>

            <Card className="p-4 text-center">
              <CheckCircle className="h-5 w-5 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold text-green-600">{currentContatoStats?.enviados || 0}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </Card>

            <Card className="p-4 text-center">
              <XCircle className="h-5 w-5 mx-auto mb-2 text-red-500" />
              <p className="text-2xl font-bold text-red-600">{currentContatoStats?.falhas || 0}</p>
              <p className="text-xs text-muted-foreground">Falhas</p>
            </Card>

            <Card className="p-4 text-center">
              <Clock className="h-5 w-5 mx-auto mb-2 text-yellow-500" />
              <p className="text-2xl font-bold text-yellow-600">{currentContatoStats?.pendentes || 0}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </Card>
          </div>

          <Separator />

          {/* Taxa de Entrega */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">Taxa de Entrega</span>
              </div>
              <span className="text-lg font-bold text-green-600">{taxaEntrega}%</span>
            </div>
            <Progress value={parseFloat(taxaEntrega)} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Taxa de Falha: {taxaFalha}%</span>
              <span>{currentContatoStats?.enviados || 0} de {currentContatoStats?.total || 0}</span>
            </div>
          </div>

          <Separator />

          {/* Taxa de Resposta - Only for current report */}
          {!viewingSnapshot && currentRespostaStats && (
            <>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">Taxa de Resposta</span>
                  </div>
                  <span className="text-lg font-bold text-primary">
                    {currentRespostaStats.taxaResposta.toFixed(1)}%
                  </span>
                </div>
                <Progress value={currentRespostaStats.taxaResposta} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{currentRespostaStats.chatsComResposta} contatos responderam</span>
                  <span>{currentRespostaStats.totalRespostas} mensagens recebidas</span>
                </div>
              </div>

              <Separator />
            </>
          )}

          {viewingSnapshot && (
            <>
              <Card className="p-4 bg-muted/30">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MessageCircle className="h-4 w-4" />
                  <span className="text-sm">Taxa de resposta não disponível para versões anteriores</span>
                </div>
              </Card>

              <Separator />
            </>
          )}

          {/* Detalhes da Campanha */}
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Configurações</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Blocos:</span>
                  <span className="font-medium">{currentBlocosCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delay contatos:</span>
                  <span className="font-medium">{currentCampanha.delay_min}-{currentCampanha.delay_max}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delay blocos:</span>
                  <span className="font-medium">{currentCampanha.delay_bloco_min}-{currentCampanha.delay_bloco_max}s</span>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Execução</span>
              </div>
              <div className="space-y-2 text-sm">
                {currentCampanha.iniciado_em && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Início:</span>
                    <span className="font-medium">
                      {format(new Date(currentCampanha.iniciado_em), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {currentCampanha.finalizado_em && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fim:</span>
                    <span className="font-medium">
                      {format(new Date(currentCampanha.finalizado_em), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
                {getDuracao(currentCampanha.iniciado_em, currentCampanha.finalizado_em) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duração:</span>
                    <span className="font-medium">{getDuracao(currentCampanha.iniciado_em, currentCampanha.finalizado_em)}</span>
                  </div>
                )}
                {!currentCampanha.iniciado_em && (
                  <p className="text-muted-foreground italic">Ainda não iniciada</p>
                )}
              </div>
            </Card>
          </div>

          {/* Mensagens por contato */}
          {currentBlocosCount > 0 && currentContatoStats && currentContatoStats.enviados > 0 && (
            <>
              <Separator />
              <Card className="p-4 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Total de Mensagens Enviadas</p>
                    <p className="text-sm text-muted-foreground">
                      {currentBlocosCount} {currentBlocosCount === 1 ? "bloco" : "blocos"} × {currentContatoStats.enviados} contatos
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-primary">
                    {currentBlocosCount * currentContatoStats.enviados}
                  </p>
                </div>
              </Card>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
