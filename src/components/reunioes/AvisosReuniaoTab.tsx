import { useState, useEffect } from "react";
import { Bell, Plus, Trash2, Edit, Loader2, Send, Clock, Zap, FileText, RefreshCw } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useProcedimentos } from "@/hooks/useProcedimentos";

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
  tipo_gatilho: string;
  created_at: string;
  updated_at: string;
}

export function AvisosReuniaoTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [avisos, setAvisos] = useState<AvisoReuniao[]>([]);
  
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
  const [formTipoGatilho, setFormTipoGatilho] = useState<"dias_antes" | "imediato" | "reagendamento">("dias_antes");

  const { data: procedimentos } = useProcedimentos();

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
  }, []);

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

      {/* Variáveis disponíveis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Variáveis Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{"{nome}"}</Badge>
            <Badge variant="secondary">{"{data}"}</Badge>
            <Badge variant="secondary">{"{horario}"}</Badge>
            <Badge variant="secondary">{"{link_call}"}</Badge>
            <Badge variant="secondary">{"{titulo}"}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Use <code className="bg-muted px-1 rounded">{"{link_call}"}</code> para incluir o link do Google Meet automaticamente.
          </p>
        </CardContent>
      </Card>

      {/* Avisos Imediatos */}
      {avisosImediatos.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-yellow-500" />
            Avisos Imediatos (ao agendar)
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {avisosImediatos.map((aviso) => (
              <Card key={aviso.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {aviso.nome}
                        <Badge className="bg-yellow-500/20 text-yellow-700 text-xs">
                          Imediato
                        </Badge>
                      </CardTitle>
                    </div>
                    <Switch
                      checked={aviso.ativo}
                      onCheckedChange={() => handleToggleAtivo(aviso)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {aviso.mensagem}
                  </p>
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
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Avisos de Reagendamento */}
      {avisosReagendamento.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-blue-500" />
            Avisos de Reagendamento
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {avisosReagendamento.map((aviso) => (
              <Card key={aviso.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {aviso.nome}
                        <Badge className="bg-blue-500/20 text-blue-700 text-xs">
                          Reagendamento
                        </Badge>
                      </CardTitle>
                      {aviso.procedimento_id && (
                        <CardDescription className="flex items-center gap-1 mt-1 text-xs">
                          <FileText className="h-3 w-3" />
                          {procedimentos?.find(p => p.id === aviso.procedimento_id)?.nome || "Específico"}
                        </CardDescription>
                      )}
                    </div>
                    <Switch
                      checked={aviso.ativo}
                      onCheckedChange={() => handleToggleAtivo(aviso)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {aviso.mensagem}
                  </p>
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
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Avisos Agendados */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Lembretes Agendados
        </h3>
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
              <Card key={aviso.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base">{aviso.nome}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {formatPeriodo(aviso.dias_antes)}
                        </Badge>
                        <span className="text-xs">às {aviso.horario_envio.substring(0, 5)}</span>
                        {aviso.procedimento_id && (
                          <span className="flex items-center gap-1 text-xs">
                            <FileText className="h-3 w-3" />
                            {procedimentos?.find(p => p.id === aviso.procedimento_id)?.nome || "Específico"}
                          </span>
                        )}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={aviso.ativo}
                      onCheckedChange={() => handleToggleAtivo(aviso)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {aviso.mensagem}
                  </p>
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
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Dialog para criar/editar aviso */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { if (!open) { setIsDialogOpen(false); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAviso ? 'Editar Aviso' : formTipoGatilho === 'imediato' ? 'Novo Aviso Imediato' : 'Novo Lembrete'}
            </DialogTitle>
            <DialogDescription>
              {formTipoGatilho === 'imediato' 
                ? 'Este aviso será enviado automaticamente assim que uma reunião for agendada.'
                : formTipoGatilho === 'reagendamento'
                  ? 'Este aviso será enviado automaticamente quando uma reunião for reagendada.'
                  : 'Configure um lembrete para ser enviado antes da reunião.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Nome do aviso */}
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do aviso</Label>
              <Input
                id="nome"
                placeholder="Ex: Lembrete 1 dia antes"
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
              />
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
                Deixe em "Todos" para enviar para qualquer reunião, ou escolha um procedimento específico
              </p>
            </div>

            {/* Tipo de gatilho */}
            <div className="space-y-2">
              <Label>Tipo de gatilho</Label>
              <Select
                value={formTipoGatilho}
                onValueChange={(v) => setFormTipoGatilho(v as "dias_antes" | "imediato" | "reagendamento")}
              >
                <SelectTrigger className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  <SelectItem value="imediato">
                    <span className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      Envio imediato (ao agendar)
                    </span>
                  </SelectItem>
                  <SelectItem value="dias_antes">
                    <span className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Dias antes da reunião
                    </span>
                  </SelectItem>
                  <SelectItem value="reagendamento">
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 text-blue-500" />
                      Ao reagendar reunião
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formTipoGatilho === 'imediato' 
                  ? 'Envia automaticamente assim que a reunião é agendada'
                  : formTipoGatilho === 'reagendamento' 
                    ? 'Envia automaticamente quando a reunião é reagendada'
                    : 'Envia X dias antes da reunião no horário especificado'}
              </p>
            </div>

            {/* Configurações de agendamento (somente para tipo dias_antes) */}
            {formTipoGatilho === 'dias_antes' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Dias antes</Label>
                    <Select
                      value={formDiasAntes.toString()}
                      onValueChange={(v) => setFormDiasAntes(Number(v))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">No dia</SelectItem>
                        <SelectItem value="1">1 dia antes</SelectItem>
                        <SelectItem value="2">2 dias antes</SelectItem>
                        <SelectItem value="3">3 dias antes</SelectItem>
                        <SelectItem value="7">7 dias antes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Horário de envio</Label>
                    <Input
                      type="time"
                      value={formHorarioEnvio}
                      onChange={(e) => setFormHorarioEnvio(e.target.value)}
                    />
                  </div>
                </div>

                {/* Intervalo entre mensagens */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Intervalo entre mensagens</Label>
                    <Select
                      value={formIntervaloUnit}
                      onValueChange={(v) => setFormIntervaloUnit(v as "seconds" | "minutes")}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Segundos</SelectItem>
                        <SelectItem value="minutes">Minutos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Mín: {formIntervaloMin}{formIntervaloUnit === "seconds" ? "s" : "min"}</span>
                      <span>Máx: {formIntervaloMax}{formIntervaloUnit === "seconds" ? "s" : "min"}</span>
                    </div>
                    <Slider
                      value={[formIntervaloMin, formIntervaloMax]}
                      onValueChange={([min, max]) => {
                        setFormIntervaloMin(min);
                        setFormIntervaloMax(max);
                      }}
                      min={formIntervaloUnit === "seconds" ? 5 : 1}
                      max={formIntervaloUnit === "seconds" ? 120 : 10}
                      step={formIntervaloUnit === "seconds" ? 5 : 1}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Mensagem */}
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                placeholder="Digite sua mensagem..."
                value={formMensagem}
                onChange={(e) => setFormMensagem(e.target.value)}
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Use as variáveis: {"{nome}"}, {"{data}"}, {"{horario}"}, {"{link_call}"}, {"{titulo}"}
              </p>
            </div>

            {/* Ativo */}
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
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
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
