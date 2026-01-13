import { useState, useMemo } from "react";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias, useCreateEscala, useDeleteEscala, useUpdateEscala, useCreateAusencia, useDeleteAusencia } from "@/hooks/useEscalas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar as CalendarIcon, Trash2, Plus, Clock, Copy, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
const DIAS_SEMANA = [{
  value: 0,
  label: "Domingo"
}, {
  value: 1,
  label: "Segunda-Feira"
}, {
  value: 2,
  label: "Terça-Feira"
}, {
  value: 3,
  label: "Quarta-Feira"
}, {
  value: 4,
  label: "Quinta-Feira"
}, {
  value: 5,
  label: "Sexta-Feira"
}, {
  value: 6,
  label: "Sábado"
}];
export default function Escala() {
  const {
    toast
  } = useToast();
  const [profissionalSelecionado, setProfissionalSelecionado] = useState<string>("todos");
  const [dialogAusenciaAberto, setDialogAusenciaAberto] = useState(false);
  const [dialogEditarHorario, setDialogEditarHorario] = useState(false);
  const [editandoHorario, setEditandoHorario] = useState<{
    id: string;
    hora_inicio: string;
    hora_fim: string;
  } | null>(null);

  // Estados para controlar expansão
  const [profissionaisExpandidos, setProfissionaisExpandidos] = useState<Set<string>>(new Set());
  const [diasExpandidos, setDiasExpandidos] = useState<Set<string>>(new Set());

  // Form states - Ausência
  const [dataInicioAusencia, setDataInicioAusencia] = useState<Date | undefined>();
  const [dataFimAusencia, setDataFimAusencia] = useState<Date | undefined>();
  const [motivo, setMotivo] = useState("");
  const {
    data: profissionais
  } = useProfissionais(true);
  const {
    data: todasEscalas
  } = useEscalas();
  const {
    data: todasAusencias
  } = useAusencias();
  const createEscala = useCreateEscala();
  const deleteEscala = useDeleteEscala();
  const updateEscala = useUpdateEscala();
  const createAusencia = useCreateAusencia();
  const deleteAusencia = useDeleteAusencia();

  // Filtra ausências por profissional
  const ausencias = useMemo(() => {
    if (!todasAusencias) return [];
    if (profissionalSelecionado === "todos") return todasAusencias;
    return todasAusencias.filter(a => a.profissional_id === profissionalSelecionado);
  }, [todasAusencias, profissionalSelecionado]);

  // Agrupa escalas por profissional e dia
  const escalasPorProfissional = useMemo(() => {
    const profissionaisParaMostrar = profissionalSelecionado === "todos" ? profissionais || [] : profissionais?.filter(p => p.id === profissionalSelecionado) || [];
    return profissionaisParaMostrar.map(prof => {
      const escalasProf = todasEscalas?.filter(e => e.profissional_id === prof.id) || [];
      const diasAtivos = new Set(escalasProf.map(e => e.dia_semana));
      const diasComHorarios = DIAS_SEMANA.map(dia => {
        const horarios = escalasProf.filter(e => e.dia_semana === dia.value).sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
        return {
          ...dia,
          ativo: diasAtivos.has(dia.value),
          horarios
        };
      });
      return {
        profissional: prof,
        dias: diasComHorarios,
        totalHorarios: escalasProf.length,
        diasAtivos: diasAtivos.size
      };
    });
  }, [profissionais, todasEscalas, profissionalSelecionado]);
  const toggleProfissionalExpandido = (profissionalId: string) => {
    setProfissionaisExpandidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(profissionalId)) {
        newSet.delete(profissionalId);
      } else {
        newSet.add(profissionalId);
      }
      return newSet;
    });
  };
  const toggleDiaExpandido = (key: string) => {
    setDiasExpandidos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };
  const handleToggleDia = async (profissionalId: string, diaSemana: number, ativo: boolean) => {
    if (ativo) {
      try {
        await createEscala.mutateAsync({
          profissional_id: profissionalId,
          dia_semana: diaSemana,
          hora_inicio: "08:00",
          hora_fim: "12:00",
          ativo: true
        });
        toast({
          title: "Dia ativado",
          description: "Horário padrão adicionado"
        });
      } catch (error) {
        toast({
          title: "Erro",
          description: "Não foi possível ativar o dia",
          variant: "destructive"
        });
      }
    } else {
      const horariosParaRemover = todasEscalas?.filter(e => e.profissional_id === profissionalId && e.dia_semana === diaSemana) || [];
      try {
        for (const horario of horariosParaRemover) {
          await deleteEscala.mutateAsync(horario.id);
        }
        toast({
          title: "Dia desativado",
          description: "Horários removidos"
        });
      } catch (error) {
        toast({
          title: "Erro",
          description: "Não foi possível desativar o dia",
          variant: "destructive"
        });
      }
    }
  };
  const handleAdicionarHorario = async (profissionalId: string, diaSemana: number) => {
    try {
      await createEscala.mutateAsync({
        profissional_id: profissionalId,
        dia_semana: diaSemana,
        hora_inicio: "13:00",
        hora_fim: "17:00",
        ativo: true
      });
      toast({
        title: "Horário adicionado"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o horário",
        variant: "destructive"
      });
    }
  };
  const handleDeletarHorario = async (id: string) => {
    try {
      await deleteEscala.mutateAsync(id);
      toast({
        title: "Horário removido"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível remover o horário",
        variant: "destructive"
      });
    }
  };
  const handleEditarHorario = (horario: {
    id: string;
    hora_inicio: string;
    hora_fim: string;
  }) => {
    setEditandoHorario(horario);
    setDialogEditarHorario(true);
  };
  const handleSalvarEdicaoHorario = async () => {
    if (!editandoHorario) return;
    try {
      await updateEscala.mutateAsync({
        id: editandoHorario.id,
        hora_inicio: editandoHorario.hora_inicio,
        hora_fim: editandoHorario.hora_fim
      });
      toast({
        title: "Horário atualizado"
      });
      setDialogEditarHorario(false);
      setEditandoHorario(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o horário",
        variant: "destructive"
      });
    }
  };
  const handleDuplicarHorario = async (horario: {
    profissional_id: string;
    dia_semana: number;
    hora_inicio: string;
    hora_fim: string;
  }) => {
    try {
      await createEscala.mutateAsync({
        profissional_id: horario.profissional_id,
        dia_semana: horario.dia_semana,
        hora_inicio: horario.hora_inicio,
        hora_fim: horario.hora_fim,
        ativo: true
      });
      toast({
        title: "Horário duplicado"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível duplicar o horário",
        variant: "destructive"
      });
    }
  };
  const handleCriarAusencia = async () => {
    if (profissionalSelecionado === "todos" || !dataInicioAusencia || !dataFimAusencia) {
      toast({
        title: "Erro",
        description: "Selecione um profissional e preencha as datas",
        variant: "destructive"
      });
      return;
    }
    try {
      await createAusencia.mutateAsync({
        profissional_id: profissionalSelecionado,
        data_inicio: format(dataInicioAusencia, "yyyy-MM-dd"),
        data_fim: format(dataFimAusencia, "yyyy-MM-dd"),
        motivo: motivo || null
      });
      toast({
        title: "Ausência registrada"
      });
      setDialogAusenciaAberto(false);
      setDataInicioAusencia(undefined);
      setDataFimAusencia(undefined);
      setMotivo("");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível registrar a ausência",
        variant: "destructive"
      });
    }
  };
  const handleDeletarAusencia = async (id: string) => {
    try {
      await deleteAusencia.mutateAsync(id);
      toast({
        title: "Ausência removida"
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível remover a ausência",
        variant: "destructive"
      });
    }
  };
  const getNomeProfissional = (profissionalId: string) => {
    return profissionais?.find(p => p.id === profissionalId)?.nome || "Profissional";
  };
  return <div className="space-y-4">
      {/* Seletor de Profissional */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold">Filtrar por Profissional</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={profissionalSelecionado} onValueChange={setProfissionalSelecionado}>
            <SelectTrigger>
              <SelectValue placeholder="Todos os profissionais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os profissionais</SelectItem>
              {profissionais?.map(prof => <SelectItem key={prof.id} value={prof.id}>
                  {prof.nome} {prof.especialidade && `- ${prof.especialidade}`}
                </SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Escala Semanal por Profissional - Colapsável */}
      {escalasPorProfissional.map(({
      profissional,
      dias,
      totalHorarios,
      diasAtivos
    }) => <Collapsible key={profissional.id} open={profissionaisExpandidos.has(profissional.id)} onOpenChange={() => toggleProfissionalExpandido(profissional.id)}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  {profissionaisExpandidos.has(profissional.id) ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                  <Clock className="h-5 w-5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base font-semibold truncate">
                      {profissional.nome}
                    </CardTitle>
                    
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                {dias.map(dia => {
              const diaKey = `${profissional.id}-${dia.value}`;
              const isDiaExpandido = diasExpandidos.has(diaKey);
              return <Collapsible key={dia.value} open={isDiaExpandido} onOpenChange={() => dia.ativo && toggleDiaExpandido(diaKey)}>
                      <div className="border rounded-lg">
                        <div className="flex items-center gap-2 p-3">
                          <Switch checked={dia.ativo} onCheckedChange={checked => handleToggleDia(profissional.id, dia.value, checked)} />
                          <CollapsibleTrigger asChild disabled={!dia.ativo}>
                            <div className={cn("flex-1 flex items-center gap-2 min-w-0", dia.ativo && "cursor-pointer")}>
                              {dia.ativo && (isDiaExpandido ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />)}
                              <span className={cn("font-medium text-sm", !dia.ativo && "text-muted-foreground")}>
                                {dia.label}
                              </span>
                              {dia.ativo && !isDiaExpandido}
                            </div>
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent>
                          {dia.ativo && <div className="px-3 pb-3 pt-0 ml-8 space-y-2 border-t">
                              <div className="pt-2 space-y-2">
                                {dia.horarios.map(horario => <div key={horario.id} className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center gap-1">
                                      <Input type="time" value={horario.hora_inicio} className="w-24 h-8 text-xs" readOnly />
                                      <span className="text-muted-foreground">-</span>
                                      <Input type="time" value={horario.hora_fim} className="w-24 h-8 text-xs" readOnly />
                                    </div>
                                    <div className="flex gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditarHorario({
                              id: horario.id,
                              hora_inicio: horario.hora_inicio,
                              hora_fim: horario.hora_fim
                            })}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDuplicarHorario({
                              profissional_id: profissional.id,
                              dia_semana: dia.value,
                              hora_inicio: horario.hora_inicio,
                              hora_fim: horario.hora_fim
                            })}>
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeletarHorario(horario.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>)}
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAdicionarHorario(profissional.id, dia.value)}>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Horário
                                </Button>
                              </div>
                            </div>}
                        </CollapsibleContent>
                      </div>
                    </Collapsible>;
            })}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>)}

      {/* Dialog Editar Horário */}
      <Dialog open={dialogEditarHorario} onOpenChange={setDialogEditarHorario}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Horário</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Hora Início</Label>
              <Input type="time" value={editandoHorario?.hora_inicio || ""} onChange={e => setEditandoHorario(prev => prev ? {
              ...prev,
              hora_inicio: e.target.value
            } : null)} />
            </div>
            <div>
              <Label>Hora Fim</Label>
              <Input type="time" value={editandoHorario?.hora_fim || ""} onChange={e => setEditandoHorario(prev => prev ? {
              ...prev,
              hora_fim: e.target.value
            } : null)} />
            </div>
            <Button onClick={handleSalvarEdicaoHorario} className="w-full">
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ausências */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 flex-shrink-0" />
            <span>Ausências / Férias</span>
          </CardTitle>
          <Button size="sm" className="flex-shrink-0" onClick={() => setDialogAusenciaAberto(true)} disabled={profissionalSelecionado === "todos"}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Registrar</span> Ausência
          </Button>
        </CardHeader>
        <CardContent>
          {profissionalSelecionado === "todos" && <p className="text-sm text-muted-foreground mb-4">
              Selecione um profissional específico para gerenciar ausências
            </p>}
          {ausencias && ausencias.length > 0 ? <div className="space-y-2">
              {ausencias.map(ausencia => <div key={ausencia.id} className="flex items-center justify-between gap-2 p-3 border rounded-lg bg-card">
                  <div className="min-w-0 flex-1">
                    {profissionalSelecionado === "todos" && <p className="text-xs text-muted-foreground mb-1">
                        {getNomeProfissional(ausencia.profissional_id)}
                      </p>}
                    <p className="font-medium text-sm">
                      {format(parseISO(ausencia.data_inicio), "dd/MM/yyyy", {
                  locale: ptBR
                })} -{" "}
                      {format(parseISO(ausencia.data_fim), "dd/MM/yyyy", {
                  locale: ptBR
                })}
                    </p>
                    {ausencia.motivo && <p className="text-xs text-muted-foreground truncate">{ausencia.motivo}</p>}
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={() => handleDeletarAusencia(ausencia.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>)}
            </div> : <p className="text-center text-muted-foreground py-8">Nenhuma ausência registrada</p>}
        </CardContent>
      </Card>

      {/* Dialog Registrar Ausência */}
      <Dialog open={dialogAusenciaAberto} onOpenChange={setDialogAusenciaAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Ausência</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Data Início</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataInicioAusencia && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataInicioAusencia ? format(dataInicioAusencia, "dd/MM/yyyy", {
                    locale: ptBR
                  }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataInicioAusencia} onSelect={setDataInicioAusencia} locale={ptBR} className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Data Fim</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !dataFimAusencia && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dataFimAusencia ? format(dataFimAusencia, "dd/MM/yyyy", {
                    locale: ptBR
                  }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dataFimAusencia} onSelect={setDataFimAusencia} locale={ptBR} disabled={date => dataInicioAusencia ? date < dataInicioAusencia : false} className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Textarea value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex: Férias, Licença médica..." />
            </div>
            <Button onClick={handleCriarAusencia} className="w-full">
              Registrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}