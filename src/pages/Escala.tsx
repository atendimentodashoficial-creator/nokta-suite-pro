import { useState, useMemo } from "react";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias, useCreateEscala, useDeleteEscala, useUpdateEscala, useCreateAusencia, useUpdateAusencia, useDeleteAusencia } from "@/hooks/useEscalas";
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
    id: string | null;
    hora_inicio: string;
    hora_fim: string;
    profissional_id?: string;
    dia_semana?: number;
    isNew?: boolean;
  } | null>(null);

  // Estados para controlar expansão
  const [profissionaisExpandidos, setProfissionaisExpandidos] = useState<Set<string>>(new Set());
  const [diasExpandidos, setDiasExpandidos] = useState<Set<string>>(new Set());
  
  // Estado para copiar escala do dia
  const [dialogCopiarDia, setDialogCopiarDia] = useState(false);
  const [diaOrigem, setDiaOrigem] = useState<{ profissionalId: string; diaSemana: number; horarios: Array<{ hora_inicio: string; hora_fim: string }> } | null>(null);
  const [diasDestinoSelecionados, setDiasDestinoSelecionados] = useState<number[]>([]);

  // Form states - Ausência
  const [datasAusenciaSelecionadas, setDatasAusenciaSelecionadas] = useState<Date[]>([]);
  const [horariosAusencia, setHorariosAusencia] = useState<Array<{ inicio: string; fim: string }>>([{ inicio: "07:00", fim: "08:30" }]);
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [motivo, setMotivo] = useState("");
  
  // Estado para editar ausência
  const [dialogEditarAusencia, setDialogEditarAusencia] = useState(false);
  const [ausenciaEditando, setAusenciaEditando] = useState<{
    id: string;
    profissional_id: string;
  } | null>(null);
  const [datasAusenciaEditando, setDatasAusenciaEditando] = useState<Date[]>([]);
  const [horariosAusenciaEditando, setHorariosAusenciaEditando] = useState<Array<{ inicio: string; fim: string }>>([{ inicio: "07:00", fim: "08:30" }]);
  const [diaInteiroEditando, setDiaInteiroEditando] = useState(false);
  const [motivoEditando, setMotivoEditando] = useState("");
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
  const updateAusencia = useUpdateAusencia();
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
        // Ao expandir profissional, expandir também todos os dias ativos
        const profData = escalasPorProfissional.find(p => p.profissional.id === profissionalId);
        if (profData) {
          setDiasExpandidos(prevDias => {
            const newDiasSet = new Set(prevDias);
            profData.dias.forEach(dia => {
              if (dia.ativo) {
                newDiasSet.add(`${profissionalId}-${dia.value}`);
              }
            });
            return newDiasSet;
          });
        }
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
  const handleAdicionarHorario = async (profissionalId: string, diaSemana: number, horariosExistentes?: Array<{ hora_inicio: string; hora_fim: string }>) => {
    const ultimoHorario = horariosExistentes?.[horariosExistentes.length - 1];
    const novoInicio = ultimoHorario?.hora_fim || "08:00";
    
    try {
      await createEscala.mutateAsync({
        profissional_id: profissionalId,
        dia_semana: diaSemana,
        hora_inicio: novoInicio,
        hora_fim: novoInicio, // Mesmo horário para forçar edição
        ativo: true
      });
      toast({
        title: "Horário adicionado",
        description: "Clique no lápis para ajustar o horário de término"
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
    setEditandoHorario({ ...horario, isNew: false });
    setDialogEditarHorario(true);
  };
  const handleSalvarEdicaoHorario = async () => {
    if (!editandoHorario) return;
    
    // Validar horários
    if (!editandoHorario.hora_inicio || !editandoHorario.hora_fim) {
      toast({
        title: "Erro",
        description: "Preencha os horários de início e fim",
        variant: "destructive"
      });
      return;
    }
    
    try {
      if (editandoHorario.isNew && editandoHorario.profissional_id && editandoHorario.dia_semana !== undefined) {
        // Criando novo horário
        await createEscala.mutateAsync({
          profissional_id: editandoHorario.profissional_id,
          dia_semana: editandoHorario.dia_semana,
          hora_inicio: editandoHorario.hora_inicio,
          hora_fim: editandoHorario.hora_fim,
          ativo: true
        });
        toast({
          title: "Horário adicionado"
        });
      } else if (editandoHorario.id) {
        // Editando horário existente
        await updateEscala.mutateAsync({
          id: editandoHorario.id,
          hora_inicio: editandoHorario.hora_inicio,
          hora_fim: editandoHorario.hora_fim
        });
        toast({
          title: "Horário atualizado"
        });
      }
      setDialogEditarHorario(false);
      setEditandoHorario(null);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível salvar o horário",
        variant: "destructive"
      });
    }
  };
  const handleAbrirCopiarDia = (profissionalId: string, diaSemana: number, horarios: Array<{ hora_inicio: string; hora_fim: string }>) => {
    setDiaOrigem({ profissionalId, diaSemana, horarios });
    setDiasDestinoSelecionados([]);
    setDialogCopiarDia(true);
  };

  const toggleDiaDestino = (dia: number) => {
    setDiasDestinoSelecionados(prev => 
      prev.includes(dia) ? prev.filter(d => d !== dia) : [...prev, dia]
    );
  };

  const handleCopiarParaDias = async () => {
    if (!diaOrigem || diasDestinoSelecionados.length === 0) return;
    
    try {
      for (const diaDestino of diasDestinoSelecionados) {
        // Remove horários existentes do dia destino
        const horariosExistentes = todasEscalas?.filter(
          e => e.profissional_id === diaOrigem.profissionalId && e.dia_semana === diaDestino
        ) || [];
        
        for (const horario of horariosExistentes) {
          await deleteEscala.mutateAsync(horario.id);
        }
        
        // Copia os horários do dia origem para o dia destino
        for (const horario of diaOrigem.horarios) {
          await createEscala.mutateAsync({
            profissional_id: diaOrigem.profissionalId,
            dia_semana: diaDestino,
            hora_inicio: horario.hora_inicio,
            hora_fim: horario.hora_fim,
            ativo: true
          });
        }
      }
      
      toast({
        title: "Escala copiada",
        description: `Horários copiados para ${diasDestinoSelecionados.length} dia(s)`
      });
      setDialogCopiarDia(false);
      setDiaOrigem(null);
      setDiasDestinoSelecionados([]);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível copiar a escala",
        variant: "destructive"
      });
    }
  };
  const handleAdicionarHorarioAusencia = () => {
    setHorariosAusencia(prev => {
      const lastHorario = prev[prev.length - 1];
      const novoInicio = lastHorario?.fim || "";
      return [...prev, { inicio: novoInicio, fim: "" }];
    });
  };

  const handleRemoverHorarioAusencia = (index: number) => {
    setHorariosAusencia(prev => prev.filter((_, i) => i !== index));
  };

  const handleAtualizarHorarioAusencia = (index: number, field: 'inicio' | 'fim', value: string) => {
    setHorariosAusencia(prev => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
  };

  const handleCriarAusencia = async () => {
    if (profissionalSelecionado === "todos" || datasAusenciaSelecionadas.length === 0) {
      toast({
        title: "Erro",
        description: "Selecione um profissional e pelo menos uma data",
        variant: "destructive"
      });
      return;
    }
    
    try {
      // Para cada data selecionada, criar uma ausência
      for (const data of datasAusenciaSelecionadas) {
        if (diaInteiro) {
          // Cria uma única ausência para o dia inteiro
          await createAusencia.mutateAsync({
            profissional_id: profissionalSelecionado,
            data_inicio: format(data, "yyyy-MM-dd"),
            data_fim: format(data, "yyyy-MM-dd"),
            hora_inicio: null,
            hora_fim: null,
            motivo: motivo || null
          });
        } else {
          // Cria uma ausência para cada faixa de horário
          for (const horario of horariosAusencia) {
            await createAusencia.mutateAsync({
              profissional_id: profissionalSelecionado,
              data_inicio: format(data, "yyyy-MM-dd"),
              data_fim: format(data, "yyyy-MM-dd"),
              hora_inicio: horario.inicio,
              hora_fim: horario.fim,
              motivo: motivo || null
            });
          }
        }
      }
      
      toast({
        title: "Ausência registrada",
        description: `${datasAusenciaSelecionadas.length} data(s) registrada(s)`
      });
      setDialogAusenciaAberto(false);
      setDatasAusenciaSelecionadas([]);
      setHorariosAusencia([{ inicio: "07:00", fim: "08:30" }]);
      setDiaInteiro(false);
      setMotivo("");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível registrar a ausência",
        variant: "destructive"
      });
    }
  };
  const handleEditarAusencia = (ausencia: {
    id: string;
    profissional_id: string;
    data_inicio: string;
    data_fim: string;
    hora_inicio: string | null;
    hora_fim: string | null;
    motivo: string | null;
  }) => {
    setAusenciaEditando({ id: ausencia.id, profissional_id: ausencia.profissional_id });
    setDatasAusenciaEditando([parseISO(ausencia.data_inicio)]);
    setDiaInteiroEditando(!ausencia.hora_inicio && !ausencia.hora_fim);
    setHorariosAusenciaEditando(
      ausencia.hora_inicio && ausencia.hora_fim 
        ? [{ inicio: ausencia.hora_inicio, fim: ausencia.hora_fim }] 
        : [{ inicio: "07:00", fim: "08:30" }]
    );
    setMotivoEditando(ausencia.motivo || "");
    setDialogEditarAusencia(true);
  };

  const handleAdicionarHorarioAusenciaEditando = () => {
    setHorariosAusenciaEditando(prev => {
      const lastHorario = prev[prev.length - 1];
      const novoInicio = lastHorario?.fim || "";
      return [...prev, { inicio: novoInicio, fim: "" }];
    });
  };

  const handleRemoverHorarioAusenciaEditando = (index: number) => {
    setHorariosAusenciaEditando(prev => prev.filter((_, i) => i !== index));
  };

  const handleAtualizarHorarioAusenciaEditando = (index: number, field: 'inicio' | 'fim', value: string) => {
    setHorariosAusenciaEditando(prev => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
  };

  const handleSalvarEdicaoAusencia = async () => {
    if (!ausenciaEditando || datasAusenciaEditando.length === 0) return;
    
    try {
      // Primeiro, deleta a ausência original
      await deleteAusencia.mutateAsync(ausenciaEditando.id);
      
      // Depois, cria as novas ausências com base nas datas e horários selecionados
      for (const data of datasAusenciaEditando) {
        if (diaInteiroEditando) {
          await createAusencia.mutateAsync({
            profissional_id: ausenciaEditando.profissional_id,
            data_inicio: format(data, "yyyy-MM-dd"),
            data_fim: format(data, "yyyy-MM-dd"),
            hora_inicio: null,
            hora_fim: null,
            motivo: motivoEditando || null
          });
        } else {
          for (const horario of horariosAusenciaEditando) {
            await createAusencia.mutateAsync({
              profissional_id: ausenciaEditando.profissional_id,
              data_inicio: format(data, "yyyy-MM-dd"),
              data_fim: format(data, "yyyy-MM-dd"),
              hora_inicio: horario.inicio,
              hora_fim: horario.fim,
              motivo: motivoEditando || null
            });
          }
        }
      }
      
      toast({
        title: "Ausência atualizada",
        description: `${datasAusenciaEditando.length} data(s) registrada(s)`
      });
      setDialogEditarAusencia(false);
      setAusenciaEditando(null);
      setDatasAusenciaEditando([]);
      setHorariosAusenciaEditando([{ inicio: "07:00", fim: "08:30" }]);
      setDiaInteiroEditando(false);
      setMotivoEditando("");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a ausência",
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
      setDialogEditarAusencia(false);
      setAusenciaEditando(null);
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
                            </div>
                          </CollapsibleTrigger>
                          {dia.ativo && dia.horarios.length > 0 && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 flex-shrink-0" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAbrirCopiarDia(profissional.id, dia.value, dia.horarios.map(h => ({ hora_inicio: h.hora_inicio, hora_fim: h.hora_fim })));
                              }}
                              title="Copiar para outros dias"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>

                        <CollapsibleContent>
                          {dia.ativo && <div className="px-3 pb-3 pt-0 ml-8 space-y-2 border-t">
                              <div className="pt-2 space-y-2">
                                {dia.horarios.map(horario => <div key={horario.id} className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <Input type="time" value={horario.hora_inicio} className="w-20 sm:w-24 h-8 text-xs pointer-events-none" readOnly tabIndex={-1} />
                                      <span className="text-muted-foreground">-</span>
                                      <Input type="time" value={horario.hora_fim} className="w-20 sm:w-24 h-8 text-xs pointer-events-none" readOnly tabIndex={-1} />
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditarHorario({
                              id: horario.id,
                              hora_inicio: horario.hora_inicio,
                              hora_fim: horario.hora_fim
                            })}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeletarHorario(horario.id)}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>)}
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleAdicionarHorario(profissional.id, dia.value, dia.horarios.map(h => ({ hora_inicio: h.hora_inicio, hora_fim: h.hora_fim })))}>
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

      {/* Dialog Editar/Adicionar Horário */}
      <Dialog open={dialogEditarHorario} onOpenChange={setDialogEditarHorario}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoHorario?.isNew ? 'Adicionar Horário' : 'Editar Horário'}</DialogTitle>
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
              <Input 
                type="time" 
                value={editandoHorario?.hora_fim || ""} 
                min={editandoHorario?.hora_inicio || undefined}
                onChange={e => setEditandoHorario(prev => prev ? {
                  ...prev,
                  hora_fim: e.target.value
                } : null)} 
              />
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
                      {format(parseISO(ausencia.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                      {(ausencia.hora_inicio || ausencia.hora_fim) && (
                        <span className="text-xs text-primary ml-2">
                          ({ausencia.hora_inicio || "00:00"} - {ausencia.hora_fim || "23:59"})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditarAusencia({
                      id: ausencia.id,
                      profissional_id: ausencia.profissional_id,
                      data_inicio: ausencia.data_inicio,
                      data_fim: ausencia.data_fim,
                      hora_inicio: ausencia.hora_inicio,
                      hora_fim: ausencia.hora_fim,
                      motivo: ausencia.motivo
                    })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDeletarAusencia(ausencia.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>)}
            </div> : <p className="text-center text-muted-foreground py-8">Nenhuma ausência registrada</p>}
        </CardContent>
      </Card>

      {/* Dialog Editar Ausência */}
      <Dialog open={dialogEditarAusencia} onOpenChange={setDialogEditarAusencia}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Ausência - {datasAusenciaEditando.length > 0 ? format(datasAusenciaEditando[0], "dd/MM/yyyy", { locale: ptBR }) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Que horas você está livre?</Label>
            </div>
            
            {!diaInteiroEditando && (
              <div className="space-y-2">
                {horariosAusenciaEditando.map((horario, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input 
                      type="time" 
                      value={horario.inicio} 
                      onChange={e => handleAtualizarHorarioAusenciaEditando(index, 'inicio', e.target.value)}
                      className="w-24 h-9 text-sm"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input 
                      type="time" 
                      value={horario.fim} 
                      onChange={e => handleAtualizarHorarioAusenciaEditando(index, 'fim', e.target.value)}
                      className="w-24 h-9 text-sm"
                    />
                    {horariosAusenciaEditando.length > 1 ? (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onClick={() => handleRemoverHorarioAusenciaEditando(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8" 
                        onClick={handleAdicionarHorarioAusenciaEditando}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {horariosAusenciaEditando.length > 1 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs" 
                    onClick={handleAdicionarHorarioAusenciaEditando}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar horário
                  </Button>
                )}
              </div>
            )}
            
            <div className="flex items-center gap-2 pt-2">
              <Switch 
                checked={diaInteiroEditando} 
                onCheckedChange={setDiaInteiroEditando}
              />
              <Label className="text-sm">Marcar indisponível (o dia todo)</Label>
            </div>
            
            <div>
              <Label className="text-xs text-muted-foreground">Motivo (opcional)</Label>
              <Textarea 
                value={motivoEditando} 
                onChange={e => setMotivoEditando(e.target.value)} 
                placeholder="Ex: Férias, Licença médica..."
                className="h-16 text-sm"
              />
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogEditarAusencia(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarEdicaoAusencia}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>



      {/* Dialog Copiar Dia */}
      <Dialog open={dialogCopiarDia} onOpenChange={setDialogCopiarDia}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar Escala para Outros Dias</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Copiando de: <span className="font-medium text-foreground">{diaOrigem ? DIAS_SEMANA.find(d => d.value === diaOrigem.diaSemana)?.label : ''}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Horários: {diaOrigem?.horarios.map(h => `${h.hora_inicio} - ${h.hora_fim}`).join(', ')}
            </p>
            <div>
              <Label className="mb-2 block">Selecione os dias de destino:</Label>
              <div className="space-y-2">
                {DIAS_SEMANA.filter(d => d.value !== diaOrigem?.diaSemana).map(dia => (
                  <div 
                    key={dia.value} 
                    className={cn(
                      "flex items-center gap-2 p-2 border rounded-lg cursor-pointer transition-colors",
                      diasDestinoSelecionados.includes(dia.value) ? "bg-primary/10 border-primary" : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleDiaDestino(dia.value)}
                  >
                    <Switch 
                      checked={diasDestinoSelecionados.includes(dia.value)} 
                      onCheckedChange={() => toggleDiaDestino(dia.value)}
                    />
                    <span className="text-sm font-medium">{dia.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button 
              onClick={handleCopiarParaDias} 
              className="w-full"
              disabled={diasDestinoSelecionados.length === 0}
            >
              Copiar para {diasDestinoSelecionados.length} dia(s)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Registrar Ausência */}
      <Dialog open={dialogAusenciaAberto} onOpenChange={setDialogAusenciaAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Selecione as datas para substituir</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Calendário */}
            <div className="w-full sm:w-auto sm:flex-shrink-0">
              <Calendar 
                mode="multiple" 
                selected={datasAusenciaSelecionadas} 
                onSelect={(dates) => setDatasAusenciaSelecionadas(dates || [])} 
                locale={ptBR} 
                className="pointer-events-auto rounded-md border w-full"
                classNames={{
                  months: "flex flex-col w-full",
                  month: "space-y-4 w-full",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex w-full justify-between",
                  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center",
                  row: "flex w-full mt-2 justify-between",
                  cell: "flex-1 h-9 text-center text-sm p-0 relative [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                  day: "h-9 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-muted rounded-md",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
                  day_today: "bg-accent text-accent-foreground font-semibold",
                }}
              />
            </div>
            
            {/* Horários */}
            <div className="flex-1 space-y-4">
              <div>
                <Label className="text-sm font-medium">Que horas você está livre?</Label>
              </div>
              
              {!diaInteiro && (
                <div className="space-y-2">
                  {horariosAusencia.map((horario, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input 
                        type="time" 
                        value={horario.inicio} 
                        onChange={e => handleAtualizarHorarioAusencia(index, 'inicio', e.target.value)}
                        className="w-24 h-9 text-sm"
                      />
                      <span className="text-muted-foreground">-</span>
                      <Input 
                        type="time" 
                        value={horario.fim} 
                        onChange={e => handleAtualizarHorarioAusencia(index, 'fim', e.target.value)}
                        className="w-24 h-9 text-sm"
                      />
                      {horariosAusencia.length > 1 ? (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          onClick={() => handleRemoverHorarioAusencia(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8" 
                          onClick={handleAdicionarHorarioAusencia}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {horariosAusencia.length > 1 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="h-8 text-xs" 
                      onClick={handleAdicionarHorarioAusencia}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar horário
                    </Button>
                  )}
                </div>
              )}
              
              <div className="flex items-center gap-2 pt-2">
                <Switch 
                  checked={diaInteiro} 
                  onCheckedChange={setDiaInteiro}
                />
                <Label className="text-sm">Marcar indisponível (o dia todo)</Label>
              </div>
              
              <div>
                <Label className="text-xs text-muted-foreground">Motivo (opcional)</Label>
                <Textarea 
                  value={motivo} 
                  onChange={e => setMotivo(e.target.value)} 
                  placeholder="Ex: Férias, Licença médica..."
                  className="h-16 text-sm"
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogAusenciaAberto(false)}>
              Fechar
            </Button>
            <Button 
              onClick={handleCriarAusencia}
              disabled={datasAusenciaSelecionadas.length === 0}
            >
              Atualizar substituição
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}