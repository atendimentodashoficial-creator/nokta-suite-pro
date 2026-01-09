import { useState, useEffect } from "react";
import { Play, Pause, Trash2, RefreshCw, Clock, CheckCircle, XCircle, AlertCircle, Users, Pencil, Copy, BarChart3 } from "lucide-react";
import { EditarCampanhaDialog } from "./EditarCampanhaDialog";
import { ContatosCampanhaDialog } from "./ContatosCampanhaDialog";
import { RelatorioCampanhaDialog } from "./RelatorioCampanhaDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
interface Campanha {
  id: string;
  nome: string;
  status: string;
  tipo_mensagem: string;
  total_contatos: number;
  enviados: number;
  falhas: number;
  delay_min: number;
  delay_max: number;
  iniciado_em: string | null;
  finalizado_em: string | null;
  created_at: string;
}

interface CampanhasTabProps {
  onRefresh: () => void;
}

export function CampanhasTab({ onRefresh }: CampanhasTabProps) {
  const { user } = useAuth();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [campanhaToDelete, setCampanhaToDelete] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [campanhaToEdit, setCampanhaToEdit] = useState<string | null>(null);
  const [contatosDialogOpen, setContatosDialogOpen] = useState(false);
  const [campanhaContatos, setCampanhaContatos] = useState<{ id: string; nome: string } | null>(null);
  const [relatorioDialogOpen, setRelatorioDialogOpen] = useState(false);
  const [campanhaRelatorio, setCampanhaRelatorio] = useState<string | null>(null);

  const loadCampanhas = async () => {
    try {
      const { data, error } = await supabase
        .from("disparos_campanhas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCampanhas(data || []);
    } catch (error: any) {
      console.error("Error loading campaigns:", error);
      toast.error("Erro ao carregar campanhas");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCampanhas();
  }, []);

  // Realtime updates
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("campanhas-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "disparos_campanhas",
          filter: `user_id=eq.${user.id}`
        },
        () => {
          loadCampanhas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleStartCampanha = async (campanhaId: string) => {
    setActionLoading(campanhaId);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        toast.error("Sessão expirada");
        return;
      }

      const response = await supabase.functions.invoke("disparos-campanha-control", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { campanha_id: campanhaId, action: "start" }
      });

      if (response.error) throw response.error;
      toast.success("Campanha iniciada");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error starting campaign:", error);
      toast.error(error.message || "Erro ao iniciar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePauseCampanha = async (campanhaId: string) => {
    setActionLoading(campanhaId);
    try {
      const { error } = await supabase
        .from("disparos_campanhas")
        .update({ status: "paused" })
        .eq("id", campanhaId);

      if (error) throw error;
      toast.success("Campanha pausada");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error pausing campaign:", error);
      toast.error(error.message || "Erro ao pausar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCampanha = async () => {
    if (!campanhaToDelete) return;

    setActionLoading(campanhaToDelete);
    try {
      const { error } = await supabase
        .from("disparos_campanhas")
        .delete()
        .eq("id", campanhaToDelete);

      if (error) throw error;
      toast.success("Campanha excluída");
      loadCampanhas();
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      toast.error(error.message || "Erro ao excluir campanha");
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
      setCampanhaToDelete(null);
    }
  };

  const handleDuplicateCampanha = async (campanhaId: string) => {
    if (!user) return;
    
    setActionLoading(campanhaId);
    try {
      // Load campaign data
      const { data: campanha, error: campanhaError } = await supabase
        .from("disparos_campanhas")
        .select("*")
        .eq("id", campanhaId)
        .single();

      if (campanhaError || !campanha) throw new Error("Campanha não encontrada");

      // Load variations
      const { data: variacoes } = await supabase
        .from("disparos_campanha_variacoes")
        .select("*")
        .eq("campanha_id", campanhaId);

      // Load contacts
      const { data: contatos } = await supabase
        .from("disparos_campanha_contatos")
        .select("numero, nome")
        .eq("campanha_id", campanhaId);

      // Create new campaign
      const { data: novaCampanha, error: novaCampanhaError } = await supabase
        .from("disparos_campanhas")
        .insert({
          user_id: user.id,
          nome: `${campanha.nome} (cópia)`,
          tipo_mensagem: campanha.tipo_mensagem,
          mensagem: campanha.mensagem,
          media_base64: campanha.media_base64,
          delay_min: campanha.delay_min,
          delay_max: campanha.delay_max,
          delay_bloco_min: campanha.delay_bloco_min,
          delay_bloco_max: campanha.delay_bloco_max,
          total_contatos: contatos?.length || 0,
          status: "pending",
          instancias_ids: campanha.instancias_ids
        })
        .select()
        .single();

      if (novaCampanhaError) throw novaCampanhaError;

      // Copy variations
      if (variacoes && variacoes.length > 0) {
        const novasVariacoes = variacoes.map(v => ({
          campanha_id: novaCampanha.id,
          bloco: v.bloco,
          tipo_mensagem: v.tipo_mensagem,
          mensagem: v.mensagem,
          media_base64: v.media_base64,
          ordem: v.ordem
        }));

        await supabase
          .from("disparos_campanha_variacoes")
          .insert(novasVariacoes);
      }

      // Copy contacts
      if (contatos && contatos.length > 0) {
        const novosContatos = contatos.map(c => ({
          campanha_id: novaCampanha.id,
          numero: c.numero,
          nome: c.nome,
          status: "pending"
        }));

        await supabase
          .from("disparos_campanha_contatos")
          .insert(novosContatos);
      }

      toast.success("Campanha duplicada com sucesso!");
      loadCampanhas();
      onRefresh();
    } catch (error: any) {
      console.error("Error duplicating campaign:", error);
      toast.error(error.message || "Erro ao duplicar campanha");
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" /> Pendente</Badge>;
      case "running":
        return <Badge className="gap-1 bg-blue-500"><Play className="h-3 w-3" /> Executando</Badge>;
      case "paused":
        return <Badge variant="secondary" className="gap-1"><Pause className="h-3 w-3" /> Pausada</Badge>;
      case "completed":
        return <Badge className="gap-1 bg-green-500"><CheckCircle className="h-3 w-3" /> Concluída</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Falhou</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTipoMensagemLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      text: "Texto",
      image: "Imagem",
      audio: "Áudio",
      video: "Vídeo",
      document: "Documento"
    };
    return labels[tipo] || tipo;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (campanhas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium mb-2">Nenhuma campanha</h2>
        <p className="text-muted-foreground">
          Crie sua primeira campanha de disparo
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {campanhas.map((campanha) => {
        const progress = campanha.total_contatos > 0
          ? ((campanha.enviados + campanha.falhas) / campanha.total_contatos) * 100
          : 0;

        return (
          <Card key={campanha.id} className="p-4">
            <div className="flex flex-col gap-4">
              {/* Header: Nome + Status + Tipo */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{campanha.nome}</h3>
                  {getStatusBadge(campanha.status)}
                  <Badge variant="outline">{getTipoMensagemLabel(campanha.tipo_mensagem)}</Badge>
                </div>
                
                {/* Action buttons - visible on desktop, hidden on mobile */}
                <div className="hidden sm:flex items-center gap-2">
                  {campanha.status === "pending" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStartCampanha(campanha.id)}
                        disabled={actionLoading === campanha.id}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Iniciar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setCampanhaToEdit(campanha.id);
                          setEditDialogOpen(true);
                        }}
                        disabled={actionLoading === campanha.id}
                        title="Editar campanha"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {campanha.status === "running" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePauseCampanha(campanha.id)}
                      disabled={actionLoading === campanha.id}
                    >
                      <Pause className="h-4 w-4 mr-1" />
                      Pausar
                    </Button>
                  )}
                  {campanha.status === "paused" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStartCampanha(campanha.id)}
                        disabled={actionLoading === campanha.id}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Continuar
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => {
                          setCampanhaToEdit(campanha.id);
                          setEditDialogOpen(true);
                        }}
                        disabled={actionLoading === campanha.id}
                        title="Editar campanha"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setCampanhaRelatorio(campanha.id);
                      setRelatorioDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                    title="Ver relatório"
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDuplicateCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                    title="Duplicar campanha"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setCampanhaToDelete(campanha.id);
                      setDeleteDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                    title="Excluir campanha"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Stats: Total, Enviados, Falhas, Delay */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <button
                  className="hover:underline cursor-pointer"
                  onClick={() => {
                    setCampanhaContatos({ id: campanha.id, nome: campanha.nome });
                    setContatosDialogOpen(true);
                  }}
                >
                  Total: {campanha.total_contatos}
                </button>
                <button
                  className="text-green-600 hover:underline cursor-pointer"
                  onClick={() => {
                    setCampanhaContatos({ id: campanha.id, nome: campanha.nome });
                    setContatosDialogOpen(true);
                  }}
                >
                  Enviados: {campanha.enviados}
                </button>
                {campanha.falhas > 0 && (
                  <button
                    className="text-destructive hover:underline cursor-pointer"
                    onClick={() => {
                      setCampanhaContatos({ id: campanha.id, nome: campanha.nome });
                      setContatosDialogOpen(true);
                    }}
                  >
                    Falhas: {campanha.falhas}
                  </button>
                )}
                <span>Delay: {campanha.delay_min >= 60 && campanha.delay_max >= 60 ? `${Math.round(campanha.delay_min / 60)}-${Math.round(campanha.delay_max / 60)}min` : `${campanha.delay_min}-${campanha.delay_max}s`}</span>
              </div>

              {/* Progress bar */}
              {(campanha.status === "running" || campanha.status === "completed") && (
                <div className="space-y-1">
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {Math.round(progress)}% concluído
                  </p>
                </div>
              )}

              {/* Timestamps */}
              <div className="text-xs text-muted-foreground space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                  <span>Criada em {format(new Date(campanha.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
                {campanha.iniciado_em && (
                  <div className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                    <span>Iniciada em {format(new Date(campanha.iniciado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
                {campanha.finalizado_em && (
                  <div className="flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                    <span>Finalizada em {format(new Date(campanha.finalizado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>

              {/* Mobile action buttons */}
              <div className="flex sm:hidden flex-wrap items-center gap-2 pt-2 border-t">
                {campanha.status === "pending" && (
                  <Button
                    size="icon"
                    onClick={() => handleStartCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {campanha.status === "running" && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => handlePauseCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                )}
                {campanha.status === "paused" && (
                  <Button
                    size="icon"
                    onClick={() => handleStartCampanha(campanha.id)}
                    disabled={actionLoading === campanha.id}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                {(campanha.status === "pending" || campanha.status === "paused") && (
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => {
                      setCampanhaToEdit(campanha.id);
                      setEditDialogOpen(true);
                    }}
                    disabled={actionLoading === campanha.id}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setCampanhaRelatorio(campanha.id);
                    setRelatorioDialogOpen(true);
                  }}
                  disabled={actionLoading === campanha.id}
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => handleDuplicateCampanha(campanha.id)}
                  disabled={actionLoading === campanha.id}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    setCampanhaToDelete(campanha.id);
                    setDeleteDialogOpen(true);
                  }}
                  disabled={actionLoading === campanha.id}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        );
      })}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todos os dados da campanha serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCampanha}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditarCampanhaDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        campanhaId={campanhaToEdit}
        onCampanhaAtualizada={() => {
          loadCampanhas();
          onRefresh();
        }}
      />

      <ContatosCampanhaDialog
        open={contatosDialogOpen}
        onOpenChange={setContatosDialogOpen}
        campanhaId={campanhaContatos?.id || null}
        campanhaNome={campanhaContatos?.nome || ""}
      />

      <RelatorioCampanhaDialog
        open={relatorioDialogOpen}
        onOpenChange={setRelatorioDialogOpen}
        campanhaId={campanhaRelatorio}
      />
    </div>
  );
}
