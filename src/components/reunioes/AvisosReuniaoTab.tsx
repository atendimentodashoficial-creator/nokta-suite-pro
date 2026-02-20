import { useState, useEffect, useMemo, useCallback } from "react";
import { Bell, Plus, Trash2, Edit, Loader2, Send, Clock, Zap, FileText, RefreshCw, Save, Eye, ChevronDown, TrendingUp, Video, User, Phone, MessageCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { startOfDayBrasilia, toZonedBrasilia } from "@/utils/timezone";
import { differenceInCalendarDays } from "date-fns";

interface Reuniao {
  id: string;
  titulo: string;
  data_reuniao: string;
  participantes: string[] | null;
  cliente_telefone: string | null;
  status: string;
}

// Helper para calcular dias restantes
const getDaysRemainingBadge = (dataReuniao: string) => {
  const hoje = startOfDayBrasilia();
  const dataReu = startOfDayBrasilia(toZonedBrasilia(dataReuniao));
  const diasRestantes = differenceInCalendarDays(dataReu, hoje);
  
  let bgColor = "";
  let textColor = "";
  let label = "";
  
  if (diasRestantes === 0) {
    bgColor = "bg-red-100 dark:bg-red-900/30";
    textColor = "text-red-700 dark:text-red-400";
    label = "Hoje";
  } else if (diasRestantes === 1) {
    bgColor = "bg-orange-100 dark:bg-orange-900/30";
    textColor = "text-orange-700 dark:text-orange-400";
    label = "Amanhã";
  } else if (diasRestantes === 2) {
    bgColor = "bg-yellow-100 dark:bg-yellow-900/30";
    textColor = "text-yellow-700 dark:text-yellow-400";
    label = "2 dias";
  } else if (diasRestantes === 3) {
    bgColor = "bg-blue-100 dark:bg-blue-900/30";
    textColor = "text-blue-700 dark:text-blue-400";
    label = "3 dias";
  } else {
    bgColor = "bg-muted";
    textColor = "text-muted-foreground";
    label = `${diasRestantes} dias`;
  }
  
  return { bgColor, textColor, label, diasRestantes };
};

interface AvisoReuniao {
  id: string;
  user_id: string;
  nome: string;
  mensagem: string;
  dias_antes: number;
  horario_envio: string;
  ativo: boolean;
  envio_imediato: boolean;
  intervalo_min: number;
  intervalo_max: number;
  procedimento_id: string | null;
  instancia_id: string | null;
  tipo_gatilho: string;
  created_at: string;
  updated_at: string;
}

interface Instancia {
  id: string;
  nome: string;
}

export function AvisosReuniaoTab() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [avisos, setAvisos] = useState<AvisoReuniao[]>([]);
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAviso, setEditingAviso] = useState<AvisoReuniao | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form states
  const [formNome, setFormNome] = useState("");
  const [formMensagem, setFormMensagem] = useState(
    "Olá {nome}! 👋\n\nLembramos que você tem uma reunião agendada para {data} às {horario}.\n\n📹 Link da call: {link_call}\n\nAguardamos você! 🙂"
  );
  const [formDiasAntes, setFormDiasAntes] = useState(1);
  const [formHorarioEnvio, setFormHorarioEnvio] = useState("09:00");
  const [formIntervaloMin, setFormIntervaloMin] = useState(15);
  const [formIntervaloMax, setFormIntervaloMax] = useState(33);
  const [formIntervaloUnit, setFormIntervaloUnit] = useState<"seconds" | "minutes">("seconds");
  const [formAtivo, setFormAtivo] = useState(true);
  const [formProcedimentoId, setFormProcedimentoId] = useState<string | null>(null);
  const [formInstanciaId, setFormInstanciaId] = useState<string | null>(null);
  const [formTipoGatilho, setFormTipoGatilho] = useState<"dias_antes" | "imediato" | "reagendamento">("dias_antes");

  const { data: procedimentos } = useProcedimentos();

  // Próximas reuniões (próximos 7 dias)
  const proximasReunioes = useMemo(() => {
    const hoje = startOfDayBrasilia();
    const em7Dias = new Date(hoje);
    em7Dias.setDate(em7Dias.getDate() + 7);
    em7Dias.setHours(23, 59, 59, 999);
    
    return reunioes
      .filter(r => {
        if (r.status === 'cancelado') return false;
        const dataReuniao = startOfDayBrasilia(toZonedBrasilia(r.data_reuniao));
        return dataReuniao >= hoje && dataReuniao <= em7Dias;
      })
      .sort((a, b) => new Date(a.data_reuniao).getTime() - new Date(b.data_reuniao).getTime())
      .slice(0, 10);
  }, [reunioes]);

  // Load instâncias
  const loadInstancias = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('disparos_instancias')
        .select('id, nome')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('nome');
      setInstancias((data || []) as Instancia[]);
    } catch (error) {
      console.error('Error loading instancias:', error);
    }
  };

  // Load reuniões
  const loadReunioes = async () => {
    try {
      const { data, error } = await supabase
        .from('reunioes')
        .select('id, titulo, data_reuniao, participantes, cliente_telefone, status')
        .or('google_event_id.not.is.null,status.eq.agendado')
        .order('data_reuniao', { ascending: true });
      
      if (error) throw error;
      setReunioes((data || []) as Reuniao[]);
    } catch (error) {
      console.error('Error loading reunioes:', error);
    }
  };

  // Load avisos
  const loadAvisos = async () => {
    try {
      const { data, error } = await supabase
        .from('avisos_reuniao')
        .select('*')
        .order('envio_imediato', { ascending: false })
        .order('dias_antes', { ascending: true });
      
      if (error) throw error;
      setAvisos((data || []) as AvisoReuniao[]);
    } catch (error) {
      console.error('Error loading avisos:', error);
      toast.error('Erro ao carregar avisos');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAvisos();
    loadReunioes();
    loadInstancias();
  }, [user]);

  // Reset form
  const resetForm = () => {
    setFormNome("");
    setFormMensagem(
      "Olá {nome}! 👋\n\nLembramos que você tem uma reunião agendada para {data} às {horario}.\n\n📹 Link da call: {link_call}\n\nAguardamos você! 🙂"
    );
    setFormDiasAntes(1);
    setFormHorarioEnvio("09:00");
    setFormIntervaloMin(15);
    setFormIntervaloMax(33);
    setFormIntervaloUnit("seconds");
    setFormAtivo(true);
    setFormProcedimentoId(null);
    setFormInstanciaId(null);
    setFormTipoGatilho("dias_antes");
    setEditingAviso(null);
  };

  // Open dialog for new aviso
  const handleNewAviso = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Open dialog for new immediate aviso
  const handleNewAvisoImediato = () => {
    resetForm();
    setFormTipoGatilho("imediato");
    setFormNome("Confirmação de Reunião");
    setFormMensagem(
      "Olá {nome}! 👋\n\nSua reunião foi agendada com sucesso! ✅\n\n📅 Data: {data}\n⏰ Horário: {horario}\n📹 Link da call: {link_call}\n\nAté lá! 🙂"
    );
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditAviso = (aviso: AvisoReuniao) => {
    setEditingAviso(aviso);
    setFormNome(aviso.nome);
    setFormMensagem(aviso.mensagem);
    setFormDiasAntes(aviso.dias_antes);
    setFormHorarioEnvio(aviso.horario_envio.substring(0, 5));
    if (aviso.intervalo_min >= 60 && aviso.intervalo_min % 60 === 0) {
      setFormIntervaloMin(aviso.intervalo_min / 60);
      setFormIntervaloMax(aviso.intervalo_max / 60);
      setFormIntervaloUnit("minutes");
    } else {
      setFormIntervaloMin(aviso.intervalo_min);
      setFormIntervaloMax(aviso.intervalo_max);
      setFormIntervaloUnit("seconds");
    }
    setFormAtivo(aviso.ativo);
    setFormProcedimentoId(aviso.procedimento_id || null);
    setFormInstanciaId(aviso.instancia_id || null);
    // Map envio_imediato to tipo_gatilho for backwards compatibility
    if (aviso.envio_imediato) {
      setFormTipoGatilho("imediato");
    } else {
      setFormTipoGatilho((aviso.tipo_gatilho as "dias_antes" | "imediato" | "reagendamento") || "dias_antes");
    }
    setIsDialogOpen(true);
  };

  // Save aviso
  const handleSave = async () => {
    if (!formNome.trim()) {
      toast.error('Digite um nome para o aviso');
      return;
    }
    if (!formMensagem.trim()) {
      toast.error('Digite a mensagem do aviso');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const intervaloMinSec = formIntervaloUnit === "minutes" ? formIntervaloMin * 60 : formIntervaloMin;
      const intervaloMaxSec = formIntervaloUnit === "minutes" ? formIntervaloMax * 60 : formIntervaloMax;

      const calculateNextCheckAt = (horarioEnvio: string, isActive: boolean): string | null => {
        // Immediate or rescheduling notifications don't need scheduled checks
        if (!isActive || formTipoGatilho === 'imediato' || formTipoGatilho === 'reagendamento') return null;
        
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60000;
        const saoPauloOffset = -3 * 60 * 60 * 1000;
        const saoPauloNow = new Date(utc + saoPauloOffset);
        
        const [hora, minuto] = horarioEnvio.split(":").map(Number);
        const todayScheduled = new Date(saoPauloNow);
        todayScheduled.setHours(hora, minuto, 0, 0);
        
        if (saoPauloNow >= todayScheduled) {
          todayScheduled.setDate(todayScheduled.getDate() + 1);
        }
        
        return todayScheduled.toISOString();
      };

      const nextCheckAt = calculateNextCheckAt(formHorarioEnvio, formAtivo);
      const isImediato = formTipoGatilho === 'imediato';
      const tipoGatilhoToSave = isImediato ? 'dias_antes' : formTipoGatilho;

      if (editingAviso) {
        const { error } = await supabase
          .from('avisos_reuniao')
          .update({
            nome: formNome.trim(),
            mensagem: formMensagem.trim(),
            dias_antes: formDiasAntes,
            horario_envio: formHorarioEnvio,
            intervalo_min: intervaloMinSec,
            intervalo_max: intervaloMaxSec,
            ativo: formAtivo,
            envio_imediato: isImediato,
            next_check_at: nextCheckAt,
            procedimento_id: formProcedimentoId,
            instancia_id: formInstanciaId,
            tipo_gatilho: tipoGatilhoToSave,
          })
          .eq('id', editingAviso.id);

        if (error) throw error;
        toast.success('Aviso atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('avisos_reuniao')
          .insert({
            user_id: user.id,
            nome: formNome.trim(),
            mensagem: formMensagem.trim(),
            dias_antes: formDiasAntes,
            horario_envio: formHorarioEnvio,
            intervalo_min: intervaloMinSec,
            intervalo_max: intervaloMaxSec,
            ativo: formAtivo,
            envio_imediato: isImediato,
            next_check_at: nextCheckAt,
            procedimento_id: formProcedimentoId,
            instancia_id: formInstanciaId,
            tipo_gatilho: tipoGatilhoToSave,
          });

        if (error) throw error;
        toast.success('Aviso criado com sucesso!');
      }

      setIsDialogOpen(false);
      resetForm();
      loadAvisos();
    } catch (error: any) {
      console.error('Error saving aviso:', error);
      toast.error(error.message || 'Erro ao salvar aviso');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle aviso active state
  const handleToggleAtivo = async (aviso: AvisoReuniao) => {
    try {
      const newAtivo = !aviso.ativo;
      
      let nextCheckAt: string | null = null;
      // Only dias_antes type needs scheduled checks, not imediato or reagendamento
      if (newAtivo && !aviso.envio_imediato && aviso.tipo_gatilho !== 'reagendamento' && aviso.horario_envio) {
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60000;
        const saoPauloOffset = -3 * 60 * 60 * 1000;
        const saoPauloNow = new Date(utc + saoPauloOffset);
        
        const [hora, minuto] = aviso.horario_envio.split(":").map(Number);
        const todayScheduled = new Date(saoPauloNow);
        todayScheduled.setHours(hora, minuto, 0, 0);
        
        if (saoPauloNow >= todayScheduled) {
          todayScheduled.setDate(todayScheduled.getDate() + 1);
        }
        
        nextCheckAt = todayScheduled.toISOString();
      }
      
      const { error } = await supabase
        .from('avisos_reuniao')
        .update({ ativo: newAtivo, next_check_at: nextCheckAt })
        .eq('id', aviso.id);

      if (error) throw error;
      
      setAvisos(prev => prev.map(a => 
        a.id === aviso.id ? { ...a, ativo: newAtivo } : a
      ));
      
      toast.success(aviso.ativo ? 'Aviso desativado' : 'Aviso ativado');
    } catch (error: any) {
      console.error('Error toggling aviso:', error);
      toast.error('Erro ao alterar status do aviso');
    }
  };

  // Delete aviso
  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('avisos_reuniao')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setAvisos(prev => prev.filter(a => a.id !== id));
      setDeleteConfirmId(null);
      toast.success('Aviso excluído com sucesso!');
    } catch (error: any) {
      console.error('Error deleting aviso:', error);
      toast.error('Erro ao excluir aviso');
    }
  };

  const formatPeriodo = (dias: number) => {
    if (dias === 0) return 'No dia';
    if (dias === 1) return '1 dia antes';
    return `${dias} dias antes`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const avisosImediatos = avisos.filter(a => a.envio_imediato);
  const avisosReagendamento = avisos.filter(a => !a.envio_imediato && a.tipo_gatilho === 'reagendamento');
  const avisosAgendados = avisos.filter(a => !a.envio_imediato && a.tipo_gatilho !== 'reagendamento');

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Avisos de Reunião
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure lembretes automáticos para reuniões agendadas
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={handleNewAvisoImediato}>
            <Zap className="h-4 w-4 mr-2" />
            Aviso Imediato
          </Button>
          <Button onClick={handleNewAviso}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Lembrete
          </Button>
        </div>
      </div>

      {/* Avisos Imediatos */}
      {avisosImediatos.length > 0 && (
        <div className="space-y-4">
          {/* Header da seção - mesmo estilo das reuniões */}
          <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">Avisos Imediatos</span>
            </div>
            <span className="text-sm opacity-80">Enviados ao agendar a reunião</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {avisosImediatos.map((aviso) => (
              <Card key={aviso.id} className="shadow-card hover:shadow-elegant transition-all duration-300">
                <CardContent className="p-4 flex flex-col">
                  <div className="space-y-3 flex-1">
                    {/* Header: Nome e Switch */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg text-foreground">{aviso.nome}</h3>
                      <Switch
                        checked={aviso.ativo}
                        onCheckedChange={() => handleToggleAtivo(aviso)}
                      />
                    </div>

                    {/* Procedimento se especificado */}
                    {aviso.procedimento_id && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {procedimentos?.find(p => p.id === aviso.procedimento_id)?.nome || "Específico"}
                        </span>
                      </div>
                    )}

                    {/* Instância configurada */}
                    {aviso.instancia_id && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                        <span className="truncate">
                          {instancias.find(i => i.id === aviso.instancia_id)?.nome || "Instância específica"}
                        </span>
                      </div>
                    )}

                    {/* Preview da mensagem */}
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {aviso.mensagem}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEditAviso(aviso)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      {deleteConfirmId === aviso.id ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(aviso.id)}
                        >
                          Confirmar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(aviso.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Avisos de Reagendamento */}
      {avisosReagendamento.length > 0 && (
        <div className="space-y-4">
          {/* Header da seção - mesmo estilo das reuniões */}
          <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-500" />
              <span className="font-semibold">Avisos de Reagendamento</span>
            </div>
            <span className="text-sm opacity-80">Enviados quando a reunião é reagendada</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {avisosReagendamento.map((aviso) => (
              <Card key={aviso.id} className="shadow-card hover:shadow-elegant transition-all duration-300">
                <CardContent className="p-4 flex flex-col">
                  <div className="space-y-3 flex-1">
                    {/* Header: Nome e Switch */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg text-foreground">{aviso.nome}</h3>
                      <Switch
                        checked={aviso.ativo}
                        onCheckedChange={() => handleToggleAtivo(aviso)}
                      />
                    </div>

                    {/* Procedimento se especificado */}
                    {aviso.procedimento_id && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {procedimentos?.find(p => p.id === aviso.procedimento_id)?.nome || "Específico"}
                        </span>
                      </div>
                    )}

                    {/* Instância configurada */}
                    {aviso.instancia_id && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                        <span className="truncate">
                          {instancias.find(i => i.id === aviso.instancia_id)?.nome || "Instância específica"}
                        </span>
                      </div>
                    )}

                    {/* Preview da mensagem */}
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {aviso.mensagem}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEditAviso(aviso)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      {deleteConfirmId === aviso.id ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(aviso.id)}
                        >
                          Confirmar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(aviso.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Avisos Agendados */}
      <div className="space-y-4">
        {/* Header da seção - mesmo estilo das reuniões */}
        <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span className="font-semibold">Lembretes Agendados</span>
          </div>
          <span className="text-sm opacity-80">Enviados X dias antes da reunião</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {avisosAgendados.length === 0 ? (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center">
                  Nenhum lembrete configurado ainda.
                  <br />
                  Clique em "Novo Lembrete" para criar seu primeiro aviso.
                </p>
              </CardContent>
            </Card>
          ) : (
            avisosAgendados.map((aviso) => (
              <Card key={aviso.id} className="shadow-card hover:shadow-elegant transition-all duration-300">
                <CardContent className="p-4 flex flex-col">
                  <div className="space-y-3 flex-1">
                    {/* Header: Nome e Switch */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg text-foreground">{aviso.nome}</h3>
                      <Switch
                        checked={aviso.ativo}
                        onCheckedChange={() => handleToggleAtivo(aviso)}
                      />
                    </div>

                    {/* Timing info */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {formatPeriodo(aviso.dias_antes)}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>às {aviso.horario_envio.substring(0, 5)}</span>
                      </div>
                    </div>

                    {/* Procedimento se especificado */}
                    {aviso.procedimento_id && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">
                          {procedimentos?.find(p => p.id === aviso.procedimento_id)?.nome || "Específico"}
                        </span>
                      </div>
                    )}

                    {/* Instância configurada */}
                    {aviso.instancia_id && (
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MessageCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-600" />
                        <span className="truncate">
                          {instancias.find(i => i.id === aviso.instancia_id)?.nome || "Instância específica"}
                        </span>
                      </div>
                    )}

                    {/* Preview da mensagem */}
                    <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                      {aviso.mensagem}
                    </p>
                  </div>

                  {/* Ações */}
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleEditAviso(aviso)}
                      >
                        <Edit className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      {deleteConfirmId === aviso.id ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(aviso.id)}
                        >
                          Confirmar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDeleteConfirmId(aviso.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Resumo de Avisos Hoje */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Resumo de Avisos Hoje
          </CardTitle>
          <CardDescription>
            Status dos envios programados para hoje
          </CardDescription>
        </CardHeader>
        <CardContent>
          {avisos.filter(a => a.ativo).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum aviso ativo configurado
            </p>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {avisos.filter(a => a.ativo).length} aviso(s) ativo(s) configurado(s)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Próximas Reuniões */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Video className="h-5 w-5" />
            Próximas Reuniões
          </CardTitle>
          <CardDescription>
            Reuniões dos próximos 7 dias que receberão lembretes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proximasReunioes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma reunião nos próximos 7 dias
            </p>
          ) : (
            <div className="space-y-3">
              {proximasReunioes.map((reuniao) => {
                const daysBadge = getDaysRemainingBadge(reuniao.data_reuniao);
                
                return (
                  <div 
                    key={reuniao.id} 
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      {/* Left side: Avatar + Name/Phone */}
                      <div className="flex items-start sm:items-center gap-3 flex-1">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium truncate">
                              {reuniao.participantes && reuniao.participantes.length > 0
                                ? reuniao.participantes.join(", ")
                                : "Cliente não informado"}
                            </p>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${daysBadge.bgColor} ${daysBadge.textColor}`}>
                              {daysBadge.label}
                            </span>
                          </div>
                          {reuniao.cliente_telefone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                              <Phone className="h-3 w-3" />
                              <span>{formatPhoneDisplay(reuniao.cliente_telefone)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Right side: Date/Time */}
                      <div className="flex flex-col sm:items-end gap-1.5 pl-13 sm:pl-0">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {format(new Date(reuniao.data_reuniao), "dd/MM 'às' HH:mm", { locale: ptBR })}
                        </div>
                        {reuniao.titulo && (
                          <Badge variant="secondary" className="text-xs">
                            {reuniao.titulo.replace(/^Reunião com\s+[^-–]+\s*[-–]\s*/i, "").trim().substring(0, 30) || reuniao.titulo.substring(0, 30)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para criar/editar aviso */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAviso ? 'Editar Aviso' : 'Novo Aviso'}
            </DialogTitle>
            <DialogDescription>
              Configure quando e qual mensagem será enviada para os pacientes
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome do aviso */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do aviso</Label>
              <Input
                id="nome"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                placeholder="Ex: Lembrete 1 dia antes"
              />
            </div>

            {/* Tipo de gatilho */}
            <div className="space-y-2">
              <Label>Tipo de gatilho</Label>
              <Select
                value={formTipoGatilho}
                onValueChange={(v) => setFormTipoGatilho(v as "dias_antes" | "imediato" | "reagendamento")}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="imediato">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <span>Envio imediato (ao agendar)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="reagendamento">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-blue-500" />
                      <span>Ao reagendar reunião</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dias_antes">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>Dias antes da reunião</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formTipoGatilho === 'imediato' 
                  ? 'Aviso será enviado automaticamente assim que a reunião for agendada'
                  : formTipoGatilho === 'reagendamento'
                    ? 'Aviso será enviado automaticamente quando uma reunião for reagendada'
                    : 'Aviso será enviado X dias antes da reunião'}
              </p>
            </div>

            {/* Procedimento específico */}
            <div className="space-y-2">
              <Label>Procedimento (opcional)</Label>
              <Select 
                value={formProcedimentoId || "all"} 
                onValueChange={(v) => setFormProcedimentoId(v === "all" ? null : v)}
              >
                <SelectTrigger className="bg-background">
                  <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Todos os procedimentos" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="all">Todos os procedimentos</SelectItem>
                  {procedimentos?.filter(p => p.ativo).map(proc => (
                    <SelectItem key={proc.id} value={proc.id}>{proc.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Deixe em "Todos" para enviar para qualquer reunião, ou escolha um específico
              </p>
            </div>

            {/* Instância de envio */}
            <div className="space-y-2">
              <Label>Instância de envio (opcional)</Label>
              <Select
                value={formInstanciaId || "default"}
                onValueChange={(v) => setFormInstanciaId(v === "default" ? null : v)}
              >
                <SelectTrigger className="bg-background">
                  <MessageCircle className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Instância padrão do cliente" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      <span>Instância padrão do cliente</span>
                    </div>
                  </SelectItem>
                  {instancias.map(inst => (
                    <SelectItem key={inst.id} value={inst.id}>
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-green-600" />
                        <span>{inst.nome}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Por padrão usa a instância original do chat com o cliente. Escolha outra para forçar uma instância específica.
              </p>
            </div>

            {/* Período e horário - only show for dias_antes type */}
            <div className="grid grid-cols-2 gap-4">
              {formTipoGatilho === 'dias_antes' && (
                <div className="space-y-2">
                  <Label htmlFor="diasAntes">Dias antes da reunião</Label>
                  <Input
                    id="diasAntes"
                    type="number"
                    min={0}
                    max={30}
                    value={formDiasAntes}
                    onChange={(e) => setFormDiasAntes(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = no dia da reunião
                  </p>
                </div>
              )}
              {formTipoGatilho === 'dias_antes' && (
                <div className="space-y-2">
                  <Label htmlFor="horarioEnvio">Horário de envio</Label>
                  <Input
                    id="horarioEnvio"
                    type="time"
                    value={formHorarioEnvio}
                    onChange={(e) => setFormHorarioEnvio(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Intervalo entre mensagens */}
            {formTipoGatilho === 'dias_antes' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Intervalo entre mensagens</Label>
                  <Select value={formIntervaloUnit} onValueChange={(v) => {
                    setFormIntervaloUnit(v as "seconds" | "minutes");
                    // Reset to reasonable defaults when switching
                    if (v === "minutes") {
                      setFormIntervaloMin(1);
                      setFormIntervaloMax(5);
                    } else {
                      setFormIntervaloMin(15);
                      setFormIntervaloMax(33);
                    }
                  }}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="seconds">Segundos</SelectItem>
                      <SelectItem value="minutes">Minutos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Mínimo: {formIntervaloMin}{formIntervaloUnit === "minutes" ? "min" : "s"}</span>
                      <span>Máximo: {formIntervaloMax}{formIntervaloUnit === "minutes" ? "min" : "s"}</span>
                    </div>
                    <Slider
                      value={[formIntervaloMin, formIntervaloMax]}
                      min={formIntervaloUnit === "minutes" ? 1 : 3}
                      max={formIntervaloUnit === "minutes" ? 60 : 120}
                      step={1}
                      onValueChange={([min, max]) => {
                        setFormIntervaloMin(min);
                        setFormIntervaloMax(max);
                      }}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  O intervalo entre cada mensagem será aleatório entre {formIntervaloMin} e {formIntervaloMax} {formIntervaloUnit === "minutes" ? "minutos" : "segundos"}
                </p>
              </div>
            )}

            {/* Mensagem */}
            <div className="space-y-2">
              <Label htmlFor="mensagem">Mensagem</Label>
              <Textarea
                id="mensagem"
                value={formMensagem}
                onChange={(e) => setFormMensagem(e.target.value)}
                rows={8}
                placeholder="Digite a mensagem..."
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Variáveis: {'{nome}'}, {'{data}'}, {'{horario}'}, {'{link_call}'}, {'{titulo}'}
              </p>
            </div>

            {/* Preview colapsável */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between p-2 h-auto">
                  <div className="flex items-center gap-2 text-sm">
                    <Eye className="h-4 w-4" />
                    <span>Preview da mensagem</span>
                  </div>
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="bg-muted/50 rounded-lg p-4 text-sm whitespace-pre-wrap">
                  {formMensagem
                    .replace('{nome}', 'Maria Silva')
                    .replace('{data}', '15/01/2026')
                    .replace('{horario}', '14:30')
                    .replace('{link_call}', 'https://meet.google.com/abc-xyz')
                    .replace('{titulo}', 'Reunião de Consultoria')}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Ativo */}
            <div className="flex items-center justify-between pt-2">
              <div className="space-y-0.5">
                <Label>Aviso ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Desative para pausar temporariamente este aviso
                </p>
              </div>
              <Switch
                checked={formAtivo}
                onCheckedChange={setFormAtivo}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {editingAviso ? 'Salvar alterações' : 'Criar aviso'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
