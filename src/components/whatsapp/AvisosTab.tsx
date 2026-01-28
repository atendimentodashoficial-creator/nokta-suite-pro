import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Calendar, Clock, Save, Loader2, User, MessageSquare, Plus, Trash2, Edit, X, Check, CheckCircle2, Send, AlertCircle, TrendingUp, MessageCircle, FileText, RefreshCw, Eye, ChevronDown, Zap } from "lucide-react";
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
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { formatInTimeZone } from "date-fns-tz";
import { differenceInCalendarDays } from "date-fns";
import { formatPhoneDisplay } from "@/utils/phoneFormat";
import { navigateToChat } from "@/utils/chatRouting";
import { startOfDayBrasilia, toZonedBrasilia, TIMEZONE_BRASILIA } from "@/utils/timezone";

// Helper para calcular dias restantes e retornar cor
const getDaysRemainingBadge = (dataAgendamento: string) => {
  const hoje = startOfDayBrasilia();
  const dataAg = startOfDayBrasilia(toZonedBrasilia(dataAgendamento));
  const diasRestantes = differenceInCalendarDays(dataAg, hoje);
  
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

interface AvisoAgendamento {
  id: string;
  user_id: string;
  nome: string;
  mensagem: string;
  dias_antes: number;
  horario_envio: string;
  ativo: boolean;
  intervalo_min: number;
  intervalo_max: number;
  procedimento_id: string | null;
  tipo_gatilho: string;
  created_at: string;
  updated_at: string;
}

interface AvisoLog {
  agendamento_id: string;
  aviso_nome: string;
  cliente_nome: string;
  status: string;
  erro: string | null;
  dias_antes: number;
}

export function AvisosTab() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [testingAvisoId, setTestingAvisoId] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<AvisoAgendamento[]>([]);
  const [avisosLogs, setAvisosLogs] = useState<AvisoLog[]>([]);
  
  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAviso, setEditingAviso] = useState<AvisoAgendamento | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Form states
  const [formNome, setFormNome] = useState("");
  const [formMensagem, setFormMensagem] = useState(
    "Olá {nome}! 👋\n\nLembramos que você tem um agendamento marcado para {data} às {horario}.\n\nProcedimento: {procedimento}\nProfissional: {profissional}\n\nCaso precise reagendar, entre em contato conosco.\n\nAguardamos você! 🙂"
  );
  const [formDiasAntes, setFormDiasAntes] = useState(1);
  const [formHorarioEnvio, setFormHorarioEnvio] = useState("09:00");
  const [formIntervaloMin, setFormIntervaloMin] = useState(15);
  const [formIntervaloMax, setFormIntervaloMax] = useState(33);
  const [formIntervaloUnit, setFormIntervaloUnit] = useState<"seconds" | "minutes">("seconds");
  const [formAtivo, setFormAtivo] = useState(true);
  const [formProcedimentoId, setFormProcedimentoId] = useState<string | null>(null);
  const [formTipoGatilho, setFormTipoGatilho] = useState<string>('dias_antes');

  const { data: agendamentos } = useAgendamentos();
  const { data: procedimentos } = useProcedimentos();

  // Próximos agendamentos (próximos 7 dias, status agendado ou confirmado)
  const proximosAgendamentos = useMemo(() => {
    const hoje = startOfDayBrasilia();
    
    const em7Dias = new Date(hoje);
    em7Dias.setDate(em7Dias.getDate() + 7);
    em7Dias.setHours(23, 59, 59, 999);
    
    return agendamentos
      ?.filter(ag => {
        if (ag.status !== 'agendado' && ag.status !== 'confirmado') return false;
        const dataAgendamento = startOfDayBrasilia(toZonedBrasilia(ag.data_agendamento));
        // Compare only dates, not times - appointments should remain visible all day
        return dataAgendamento >= hoje && dataAgendamento <= em7Dias;
      })
      .sort((a, b) => new Date(a.data_agendamento).getTime() - new Date(b.data_agendamento).getTime())
      .slice(0, 10) || [];
  }, [agendamentos]);

  // Calculate today's stats for avisos - now using logs to detect failures
  const avisosStats = useMemo(() => {
    if (!agendamentos || avisos.length === 0) {
      return { previstos: 0, enviados: 0, pendentes: 0, falhas: [] as { clienteNome: string; avisoNome: string }[] };
    }

    const hoje = startOfDayBrasilia();

    let previstos = 0;
    let enviados = 0;
    const falhas: { clienteNome: string; avisoNome: string }[] = [];

    // Get failures from today's logs (any status diferente de "enviado" conta como falha)
    const falhasFromLogs = avisosLogs.filter((log) => log.status !== 'enviado');
    for (const log of falhasFromLogs) {
      falhas.push({ clienteNome: log.cliente_nome, avisoNome: log.aviso_nome });
    }

    // For each active aviso, check which agendamentos match for today
    const avisosAtivos = avisos.filter(a => a.ativo);
    
    for (const aviso of avisosAtivos) {
      // Find agendamentos that are X dias_antes from today
      const targetDate = new Date(hoje);
      targetDate.setDate(targetDate.getDate() + aviso.dias_antes);
      
      const matchingAgendamentos = agendamentos.filter(ag => {
        if (ag.status !== 'agendado' && ag.status !== 'confirmado') return false;
        const dataAg = startOfDayBrasilia(toZonedBrasilia(ag.data_agendamento));
        return dataAg.getTime() === targetDate.getTime();
      });

      previstos += matchingAgendamentos.length;

      // Check which have already been sent based on dias_antes
      for (const ag of matchingAgendamentos) {
        let wasSent = false;
        if (aviso.dias_antes === 0 && ag.aviso_dia) wasSent = true;
        if (aviso.dias_antes === 1 && ag.aviso_dia_anterior) wasSent = true;
        if (aviso.dias_antes === 3 && ag.aviso_3dias) wasSent = true;
        if (wasSent) {
          enviados++;
        }
      }
    }

    // Subtract failures from enviados (they were counted but failed)
    const enviadosReais = Math.max(0, enviados - falhas.length);

    return {
      previstos,
      enviados: enviadosReais,
      pendentes: previstos - enviados, // pendentes based on flags
      falhas
    };
  }, [agendamentos, avisos, avisosLogs]);

  // Separar avisos por tipo
  const avisosImediatos = avisos.filter(a => a.tipo_gatilho === 'imediato');
  const avisosReagendamento = avisos.filter(a => a.tipo_gatilho === 'reagendamento');
  const avisosAgendados = avisos.filter(a => a.tipo_gatilho !== 'reagendamento' && a.tipo_gatilho !== 'imediato');

  // Format period text
  const formatPeriodo = (dias: number) => {
    if (dias === 0) return 'No dia';
    if (dias === 1) return '1 dia antes';
    return `${dias} dias antes`;
  };

  // Load avisos
  const loadAvisos = async () => {
    try {
      const { data, error } = await supabase
        .from('avisos_agendamento')
        .select('*')
        .order('dias_antes', { ascending: true });
      
      if (error) throw error;
      setAvisos(data || []);
    } catch (error) {
      console.error('Error loading avisos:', error);
      toast.error('Erro ao carregar avisos');
    } finally {
      setIsLoading(false);
    }
  };

  // Load today's avisos logs to detect failures
  const loadAvisosLogs = async () => {
    try {
      const hoje = startOfDayBrasilia();
      
      const { data, error } = await supabase
        .from('avisos_enviados_log')
        .select('agendamento_id, aviso_nome, cliente_nome, status, erro, dias_antes')
        .gte('enviado_em', hoje.toISOString())
        .order('enviado_em', { ascending: false });
      
      if (error) throw error;
      setAvisosLogs(data || []);
    } catch (error) {
      console.error('Error loading avisos logs:', error);
    }
  };

  useEffect(() => {
    loadAvisos();
    loadAvisosLogs();
  }, []);

  // Reset form
  const resetForm = () => {
    setFormNome("");
    setFormMensagem(
      "Olá {nome}! 👋\n\nLembramos que você tem um agendamento marcado para {data} às {horario}.\n\nProcedimento: {procedimento}\nProfissional: {profissional}\n\nCaso precise reagendar, entre em contato conosco.\n\nAguardamos você! 🙂"
    );
    setFormDiasAntes(1);
    setFormHorarioEnvio("09:00");
    setFormIntervaloMin(15);
    setFormIntervaloMax(33);
    setFormIntervaloUnit("seconds");
    setFormAtivo(true);
    setFormProcedimentoId(null);
    setFormTipoGatilho('dias_antes');
    setEditingAviso(null);
  };

  // Open dialog for new aviso
  const handleNewAviso = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEditAviso = (aviso: AvisoAgendamento) => {
    setEditingAviso(aviso);
    setFormNome(aviso.nome);
    setFormMensagem(aviso.mensagem);
    setFormDiasAntes(aviso.dias_antes);
    setFormHorarioEnvio(aviso.horario_envio.substring(0, 5)); // Remove seconds
    // Determine if we should use minutes based on stored values
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
    setFormTipoGatilho(aviso.tipo_gatilho || 'dias_antes');
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

      // Convert to seconds if using minutes
      const intervaloMinSec = formIntervaloUnit === "minutes" ? formIntervaloMin * 60 : formIntervaloMin;
      const intervaloMaxSec = formIntervaloUnit === "minutes" ? formIntervaloMax * 60 : formIntervaloMax;

      // Calculate next_check_at based on horario_envio
      const calculateNextCheckAt = (horarioEnvio: string, isActive: boolean): string | null => {
        if (!isActive) return null;
        
        const now = new Date();
        const utc = now.getTime() + now.getTimezoneOffset() * 60000;
        const saoPauloOffset = -3 * 60 * 60 * 1000;
        const saoPauloNow = new Date(utc + saoPauloOffset);
        
        const [hora, minuto] = horarioEnvio.split(":").map(Number);
        const todayScheduled = new Date(saoPauloNow);
        todayScheduled.setHours(hora, minuto, 0, 0);
        
        // If past today's time, schedule for tomorrow
        if (saoPauloNow >= todayScheduled) {
          todayScheduled.setDate(todayScheduled.getDate() + 1);
        }
        
        return todayScheduled.toISOString();
      };

      const nextCheckAt = calculateNextCheckAt(formHorarioEnvio, formAtivo);

      if (editingAviso) {
        // Update existing
        const { error } = await supabase
          .from('avisos_agendamento')
          .update({
            nome: formNome.trim(),
            mensagem: formMensagem.trim(),
            dias_antes: formTipoGatilho === 'dias_antes' ? formDiasAntes : 0,
            horario_envio: formHorarioEnvio,
            intervalo_min: intervaloMinSec,
            intervalo_max: intervaloMaxSec,
            ativo: formAtivo,
            next_check_at: nextCheckAt,
            procedimento_id: formProcedimentoId,
            tipo_gatilho: formTipoGatilho,
          })
          .eq('id', editingAviso.id);

        if (error) throw error;
        toast.success('Aviso atualizado com sucesso!');
      } else {
        // Create new
        const { error } = await supabase
          .from('avisos_agendamento')
          .insert({
            user_id: user.id,
            nome: formNome.trim(),
            mensagem: formMensagem.trim(),
            dias_antes: formTipoGatilho === 'dias_antes' ? formDiasAntes : 0,
            horario_envio: formHorarioEnvio,
            intervalo_min: intervaloMinSec,
            intervalo_max: intervaloMaxSec,
            ativo: formAtivo,
            next_check_at: nextCheckAt,
            procedimento_id: formProcedimentoId,
            tipo_gatilho: formTipoGatilho,
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
  const handleToggleAtivo = async (aviso: AvisoAgendamento) => {
    try {
      const newAtivo = !aviso.ativo;
      
      // Calculate next_check_at when activating
      let nextCheckAt: string | null = null;
      if (newAtivo && aviso.horario_envio) {
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
        .from('avisos_agendamento')
        .update({ ativo: newAtivo, next_check_at: nextCheckAt })
        .eq('id', aviso.id);

      if (error) throw error;
      
      setAvisos(prev => prev.map(a => 
        a.id === aviso.id ? { ...a, ativo: !a.ativo } : a
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
        .from('avisos_agendamento')
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


  // Test sending avisos manually
  // Test sending a specific aviso
  const handleTestEnvioAviso = async (aviso: AvisoAgendamento) => {
    setTestingAvisoId(aviso.id);
    try {
      const { data, error } = await supabase.functions.invoke('enviar-avisos-agendamento', {
        body: { aviso_id: aviso.id, dias_antes: aviso.dias_antes }
      });
      
      if (error) throw error;
      
      if (data.sent > 0) {
        toast.success(`${data.sent} aviso(s) "${aviso.nome}" enviado(s) com sucesso!`);
        // Refresh agendamentos to update flags
        window.location.reload();
      } else {
        toast.info(`Nenhum agendamento para enviar "${aviso.nome}" no momento`);
      }
      
      console.log('Envio de aviso resultado:', data);
    } catch (error: any) {
      console.error('Error testing aviso:', error);
      toast.error(error.message || 'Erro ao enviar aviso');
    } finally {
      setTestingAvisoId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configuração de Avisos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure lembretes automáticos para pacientes agendados
          </p>
        </div>
        <Button onClick={handleNewAviso}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Aviso
        </Button>
      </div>

      {/* Avisos Imediatos */}
      {avisosImediatos.length > 0 && (
        <div className="space-y-4">
          <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              <span className="font-semibold">Avisos Imediatos</span>
            </div>
            <span className="text-sm opacity-80">Enviados ao criar o agendamento</span>
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
          <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-blue-500" />
              <span className="font-semibold">Avisos de Reagendamento</span>
            </div>
            <span className="text-sm opacity-80">Enviados quando o agendamento é reagendado</span>
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

      {/* Lembretes Agendados */}
      <div className="space-y-4">
        <div className="bg-secondary text-secondary-foreground rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            <span className="font-semibold">Lembretes Agendados</span>
          </div>
          <span className="text-sm opacity-80">Enviados X dias antes do agendamento</span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {avisosAgendados.length === 0 ? (
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground text-center">
                  Nenhum lembrete configurado ainda.
                  <br />
                  Clique em "Novo Aviso" para criar seu primeiro lembrete.
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

      {/* Dashboard de Resumo do Dia - ACIMA dos próximos agendamentos */}
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Previstos */}
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {avisosStats.previstos}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Previstos</p>
              </div>

              {/* Enviados */}
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {avisosStats.enviados}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Enviados</p>
              </div>

              {/* Pendentes */}
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    avisosStats.pendentes > 0 
                      ? 'bg-orange-100 dark:bg-orange-900/30' 
                      : 'bg-muted'
                  }`}>
                    <AlertCircle className={`h-5 w-5 ${
                      avisosStats.pendentes > 0 
                        ? 'text-orange-600 dark:text-orange-400' 
                        : 'text-muted-foreground'
                    }`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${
                  avisosStats.pendentes > 0 
                    ? 'text-orange-600 dark:text-orange-400' 
                    : 'text-muted-foreground'
                }`}>
                  {avisosStats.pendentes}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Pendentes</p>
              </div>

              {/* Falhas */}
              <div className="rounded-xl border bg-card p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    avisosStats.falhas.length > 0 
                      ? 'bg-red-100 dark:bg-red-900/30' 
                      : 'bg-muted'
                  }`}>
                    <X className={`h-5 w-5 ${
                      avisosStats.falhas.length > 0 
                        ? 'text-red-600 dark:text-red-400' 
                        : 'text-muted-foreground'
                    }`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${
                  avisosStats.falhas.length > 0 
                    ? 'text-red-600 dark:text-red-400' 
                    : 'text-muted-foreground'
                }`}>
                  {avisosStats.falhas.length}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Falhas</p>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {avisosStats.previstos > 0 && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso do dia</span>
                <span>{Math.round((avisosStats.enviados / avisosStats.previstos) * 100)}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                  style={{ width: `${(avisosStats.enviados / avisosStats.previstos) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Lista de falhas */}
          {avisosStats.falhas && avisosStats.falhas.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 mb-3">
                <X className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  Falhas no envio ({avisosStats.falhas.length})
                </span>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {avisosStats.falhas.map((falha, idx) => (
                  <div 
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                  >
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium">{falha.clienteNome}</span>
                    </div>
                    <Badge variant="outline" className="text-xs text-red-600 border-red-300 dark:text-red-400 dark:border-red-700">
                      {falha.avisoNome}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Próximos agendamentos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Próximos Agendamentos
          </CardTitle>
          <CardDescription>
            Agendamentos dos próximos 7 dias que receberão lembretes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {proximosAgendamentos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum agendamento nos próximos 7 dias
            </p>
          ) : (
            <div className="space-y-3">
              {proximosAgendamentos.map((ag: any) => {
                const daysBadge = getDaysRemainingBadge(ag.data_agendamento);
                
                // Check logs to determine if avisos succeeded or failed
                const agLogs = avisosLogs.filter(log => log.agendamento_id === ag.id);
                
                // Build list of sent/failed avisos
                const avisosEnviados: { label: string; failed: boolean }[] = [];
                
                // Check each aviso type
                if (ag.aviso_3dias) {
                  const log3dias = agLogs.find((l) => l.dias_antes === 3);
                  avisosEnviados.push({ label: '3 dias', failed: !!log3dias && log3dias.status !== 'enviado' });
                }
                if (ag.aviso_dia_anterior) {
                  const log1dia = agLogs.find((l) => l.dias_antes === 1);
                  avisosEnviados.push({ label: '1 dia', failed: !!log1dia && log1dia.status !== 'enviado' });
                }
                if (ag.aviso_dia) {
                  const logDia = agLogs.find((l) => l.dias_antes === 0);
                  avisosEnviados.push({ label: 'Dia', failed: !!logDia && logDia.status !== 'enviado' });
                }
                
                const hasFailed = avisosEnviados.some(a => a.failed);
                const allSuccess = avisosEnviados.length > 0 && avisosEnviados.every(a => !a.failed);
                
                return (
                  <div 
                    key={ag.id} 
                    className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  >
                    {/* Mobile: Stack layout, Desktop: Row layout */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      {/* Left side: Avatar + Name/Phone */}
                      <div className="flex items-start sm:items-center gap-3 flex-1">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex-shrink-0 flex items-center justify-center">
                          <User className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium truncate">{ag.leads?.nome}</p>
                            {ag.leads?.telefone && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="hidden sm:inline-flex h-7 w-7 flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigateToChat(navigate, ag.leads.telefone, ag.leads?.origem);
                                }}
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                            )}
                            {/* Desktop: days badge inline */}
                            <span className={`hidden sm:inline-flex text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${daysBadge.bgColor} ${daysBadge.textColor}`}>
                              {daysBadge.label}
                            </span>
                            {/* Desktop: success badges inline (only show if not failed) */}
                            {avisosEnviados.filter(a => !a.failed).map((aviso, idx) => (
                              <Badge 
                                key={idx}
                                variant="outline" 
                                className="hidden sm:inline-flex text-xs text-green-600 border-green-600 dark:text-green-400 dark:border-green-400"
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {aviso.label}
                              </Badge>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ag.leads?.telefone && formatPhoneDisplay(ag.leads.telefone)}
                          </p>
                        </div>
                        {ag.leads?.telefone && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="sm:hidden h-8 w-8 flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigateToChat(navigate, ag.leads.telefone, ag.leads?.origem);
                            }}
                          >
                            <MessageCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      
                      {/* Right side: Date/Time + Badges */}
                      <div className="flex flex-col sm:items-end gap-1.5 pl-13 sm:pl-0">
                        {/* Mobile: days badge + success badges above date */}
                        <div className="flex sm:hidden flex-wrap items-center gap-2">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${daysBadge.bgColor} ${daysBadge.textColor}`}>
                            {daysBadge.label}
                          </span>
                          {avisosEnviados.filter(a => !a.failed).map((aviso, idx) => (
                            <Badge 
                              key={idx}
                              variant="outline" 
                              className="text-xs text-green-600 border-green-600 dark:text-green-400 dark:border-green-400"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {aviso.label}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', "dd/MM 'às' HH:mm")}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {ag.procedimentos?.nome && (
                            <Badge variant="secondary" className="text-xs">
                              {ag.procedimentos.nome}
                            </Badge>
                          )}
                        </div>
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
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
                onValueChange={(v) => setFormTipoGatilho(v)}
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
                      <span>Ao reagendar</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dias_antes">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>Dias antes do agendamento</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formTipoGatilho === 'imediato' 
                  ? "Aviso será enviado automaticamente assim que o agendamento for criado"
                  : formTipoGatilho === 'reagendamento' 
                    ? "Aviso será enviado automaticamente quando um agendamento for reagendado"
                    : "Aviso será enviado X dias antes do agendamento"
                }
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
                Deixe em "Todos" para enviar para qualquer procedimento, ou escolha um específico
              </p>
            </div>

            {/* Período e horário - only show dias_antes for dias_antes type */}
            <div className="grid grid-cols-2 gap-4">
              {formTipoGatilho === 'dias_antes' && (
                <div className="space-y-2">
                  <Label htmlFor="diasAntes">Dias antes do agendamento</Label>
                  <Input
                    id="diasAntes"
                    type="number"
                    min={0}
                    max={30}
                    value={formDiasAntes}
                    onChange={(e) => setFormDiasAntes(parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-muted-foreground">
                    0 = no dia do agendamento
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
                Variáveis: {'{nome}'}, {'{data}'}, {'{horario}'}, {'{procedimento}'}, {'{profissional}'}
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
                    .replace('{procedimento}', 'Avaliação')
                    .replace('{profissional}', 'Dr. João')}
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
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
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
