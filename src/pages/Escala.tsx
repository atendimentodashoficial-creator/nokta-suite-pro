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
import { Calendar as CalendarIcon, Trash2, Plus, Clock, Copy, Pencil, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, getDay } from "date-fns";
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
    tempId?: string;
    hora_inicio: string;
    hora_fim: string;
    profissional_id?: string;
    dia_semana?: number;
    isNew?: boolean;
  } | null>(null);

  const [horariosRascunho, setHorariosRascunho] = useState<Record<string, Array<{ tempId: string; inicio: string; fim: string }>>>({});

  // Estados para controlar expansão
  const [profissionaisExpandidos, setProfissionaisExpandidos] = useState<Set<string>>(new Set());
  const [diasExpandidos, setDiasExpandidos] = useState<Set<string>>(new Set());
  
  // Estado para copiar escala do dia
  const [dialogCopiarDia, setDialogCopiarDia] = useState(false);
  const [diaOrigem, setDiaOrigem] = useState<{ profissionalId: string; diaSemana: number; horarios: Array<{ hora_inicio: string; hora_fim: string }> } | null>(null);
  const [diasDestinoSelecionados, setDiasDestinoSelecionados] = useState<number[]>([]);

  // Form states - Ausência
  const [datasAusenciaSelecionadas, setDatasAusenciaSelecionadas] = useState<Date[]>([]);
  const [horariosAusencia, setHorariosAusencia] = useState<Array<{ inicio: string; fim: string }>>([{ inicio: "", fim: "" }]);
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [motivo, setMotivo] = useState("");
  
  // Estado para editar ausência
  const [dialogEditarAusencia, setDialogEditarAusencia] = useState(false);
  const [ausenciaEditando, setAusenciaEditando] = useState<{
    id: string;
    profissional_id: string;
  } | null>(null);
  const [datasAusenciaEditando, setDatasAusenciaEditando] = useState<Date[]>([]);
  const [horariosAusenciaEditando, setHorariosAusenciaEditando] = useState<Array<{ inicio: string; fim: string }>>([{ inicio: "", fim: "" }]);
  const [diaInteiroEditando, setDiaInteiroEditando] = useState(false);
  const [motivoEditando, setMotivoEditando] = useState("");
  
  // Estado para visualizar ausência
  const [dialogVisualizarAusencia, setDialogVisualizarAusencia] = useState(false);
  const [ausenciaVisualizando, setAusenciaVisualizando] = useState<{
    data: string;
    profissional_id: string;
    horarios: Array<{ id: string; inicio: string | null; fim: string | null }>;
    motivo: string | null;
  } | null>(null);
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

  // Agrupa ausências por data (1 card por data)
  const ausenciasAgrupadas = useMemo(() => {
    if (!ausencias || ausencias.length === 0) return [];
    
    const grouped: { [key: string]: { data: string; profissional_id: string; ausencias: typeof ausencias; motivo: string | null } } = {};
    
    ausencias.forEach(ausencia => {
      const key = `${ausencia.profissional_id}-${ausencia.data_inicio}`;
      if (!grouped[key]) {
        grouped[key] = {
          data: ausencia.data_inicio,
          profissional_id: ausencia.profissional_id,
          ausencias: [],
          motivo: ausencia.motivo
        };
      }
      grouped[key].ausencias.push(ausencia);
    });
    
    return Object.values(grouped).sort((a, b) => a.data.localeCompare(b.data));
  }, [ausencias]);

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
  const handleAdicionarHorario = (profissionalId: string, diaSemana: number, horariosExistentes: Array<{ hora_inicio: string; hora_fim: string }> = []) => {
    const key = `${profissionalId}-${diaSemana}`;

    const calcFim30 = (inicio: string) => {
      const norm = (inicio || "").slice(0, 5);
      if (!/^\d{2}:\d{2}$/.test(norm)) return "";
      const [h, m] = norm.split(":").map(Number);
      let h2 = h;
      let m2 = m + 30;
      if (m2 >= 60) {
        m2 -= 60;
        h2 += 1;
      }
      return `${String(Math.min(h2, 23)).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
    };

    setHorariosRascunho(prev => {
      const drafts = prev[key] || [];
      const lastDraft = drafts[drafts.length - 1];
      const ultimoHorario = horariosExistentes[horariosExistentes.length - 1];

      let novoInicio = "";

      // Se o último é rascunho, só dá pra usar o fim se ele já foi definido
      if (lastDraft) {
        novoInicio = lastDraft.fim || "";
      } else if (!ultimoHorario) {
        // Primeiro horário do dia: começar com um default razoável
        novoInicio = "08:00";
      } else {
        const start = (ultimoHorario.hora_inicio || "").slice(0, 5);
        const end = (ultimoHorario.hora_fim || "").slice(0, 5);
        const autoFim = calcFim30(start);

        // Se o fim é "automático" (+30), consideramos desconhecido -> começa em branco
        novoInicio = end && autoFim && end !== autoFim ? end : "";
      }

      const tempId = `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return {
        ...prev,
        [key]: [...drafts, { tempId, inicio: novoInicio, fim: "" }]
      };
    });
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
    id?: string | null;
    tempId?: string;
    profissional_id?: string;
    dia_semana?: number;
    hora_inicio: string;
    hora_fim: string;
  }) => {
    const isDraft = !horario.id && !!horario.tempId;

    const normInicio = (horario.hora_inicio || "").slice(0, 5);
    const normFim = (horario.hora_fim || "").slice(0, 5);

    if (isDraft) {
      setEditandoHorario({
        id: null,
        tempId: horario.tempId,
        profissional_id: horario.profissional_id,
        dia_semana: horario.dia_semana,
        hora_inicio: normInicio,
        hora_fim: normFim,
        isNew: true,
      });
      setDialogEditarHorario(true);
      return;
    }

    const [h, m] = normInicio.split(":").map(Number);
    let h2 = h;
    let m2 = m + 30;
    if (m2 >= 60) {
      m2 -= 60;
      h2 += 1;
    }
    const autoFim = `${String(Math.min(h2, 23)).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;

    setEditandoHorario({
      id: horario.id || null,
      hora_inicio: normInicio,
      // Se for o fim "automático" (+30min), abre vazio para o usuário escolher
      hora_fim: normFim === autoFim ? "" : normFim,
      isNew: false,
    });
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
        // Criando novo horário (rascunho -> banco)
        await createEscala.mutateAsync({
          profissional_id: editandoHorario.profissional_id,
          dia_semana: editandoHorario.dia_semana,
          hora_inicio: editandoHorario.hora_inicio,
          hora_fim: editandoHorario.hora_fim,
          ativo: true
        });

        // Remove rascunho (se existir)
        if (editandoHorario.tempId) {
          const key = `${editandoHorario.profissional_id}-${editandoHorario.dia_semana}`;
          setHorariosRascunho(prev => ({
            ...prev,
            [key]: (prev[key] || []).filter(h => h.tempId !== editandoHorario.tempId)
          }));
        }

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

  const [copiandoEscala, setCopiandoEscala] = useState(false);

  const handleCopiarParaDias = async () => {
    if (!diaOrigem || diasDestinoSelecionados.length === 0 || copiandoEscala) return;
    
    setCopiandoEscala(true);
    
    try {
      // Processa cada dia de destino sequencialmente para evitar duplicatas
      for (const diaDestino of diasDestinoSelecionados) {
        // Remove horários existentes do dia destino primeiro
        const horariosExistentes = todasEscalas?.filter(
          e => e.profissional_id === diaOrigem.profissionalId && e.dia_semana === diaDestino
        ) || [];
        
        // Deleta todos os horários existentes de forma sequencial
        for (const horario of horariosExistentes) {
          await deleteEscala.mutateAsync(horario.id);
        }
        
        // Aguarda um pouco para garantir que as deleções foram processadas
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Copia os horários do dia origem para o dia destino de forma sequencial
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
    } finally {
      setCopiandoEscala(false);
    }
  };
  // Função para carregar horários de escala do profissional para as datas selecionadas
  const carregarHorariosEscalaParaAusencia = (datas: Date[]) => {
    if (profissionalSelecionado === "todos" || datas.length === 0) {
      setHorariosAusencia([{ inicio: "", fim: "" }]);
      return;
    }

    // Pega o dia da semana da primeira data selecionada (0=domingo, 6=sábado)
    const diaSemana = getDay(datas[0]);
    
    // Busca os horários de escala do profissional para esse dia
    const escalaDoDia = todasEscalas?.filter(
      e => e.profissional_id === profissionalSelecionado && e.dia_semana === diaSemana
    ) || [];

    if (escalaDoDia.length > 0) {
      // Carrega os horários de escala do profissional
      const horariosCarregados = escalaDoDia.map(e => ({
        inicio: e.hora_inicio.slice(0, 5),
        fim: e.hora_fim.slice(0, 5)
      }));
      setHorariosAusencia(horariosCarregados);
    } else {
      // Se não tem escala para esse dia, deixa vazio
      setHorariosAusencia([{ inicio: "", fim: "" }]);
    }
  };

  // Handler para quando as datas de ausência são selecionadas
  const handleSelecionarDatasAusencia = (dates: Date[] | undefined) => {
    const novasDatas = dates || [];
    setDatasAusenciaSelecionadas(novasDatas);
    
    // Se selecionou novas datas, carrega os horários de escala
    if (novasDatas.length > 0 && (datasAusenciaSelecionadas.length === 0 || novasDatas.length === 1)) {
      carregarHorariosEscalaParaAusencia(novasDatas);
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
      setHorariosAusencia([{ inicio: "", fim: "" }]);
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
    // Buscar todas as ausências do mesmo grupo (mesma data e profissional)
    const todasDoGrupo = todasAusencias?.filter(
      a => a.profissional_id === ausencia.profissional_id && a.data_inicio === ausencia.data_inicio
    ) || [];
    
    setAusenciaEditando({ id: ausencia.id, profissional_id: ausencia.profissional_id });
    const dataAusencia = parseISO(ausencia.data_inicio);
    setDatasAusenciaEditando([dataAusencia]);
    
    // Verifica se é dia inteiro (nenhuma ausência do grupo tem horários)
    const isDiaInteiro = todasDoGrupo.every(a => !a.hora_inicio && !a.hora_fim);
    setDiaInteiroEditando(isDiaInteiro);
    
    if (!isDiaInteiro && todasDoGrupo.some(a => a.hora_inicio && a.hora_fim)) {
      // Carrega TODOS os horários salvos do grupo
      const horariosCarregados = todasDoGrupo
        .filter(a => a.hora_inicio && a.hora_fim)
        .map(a => ({
          inicio: a.hora_inicio!.slice(0, 5),
          fim: a.hora_fim!.slice(0, 5)
        }));
      setHorariosAusenciaEditando(horariosCarregados.length > 0 ? horariosCarregados : [{ inicio: "", fim: "" }]);
    } else {
      // Se é dia inteiro, busca os horários de escala do profissional para esse dia
      const diaSemana = getDay(dataAusencia);
      const escalaDoDia = todasEscalas?.filter(
        e => e.profissional_id === ausencia.profissional_id && e.dia_semana === diaSemana
      ) || [];

      if (escalaDoDia.length > 0) {
        const horariosCarregados = escalaDoDia.map(e => ({
          inicio: e.hora_inicio.slice(0, 5),
          fim: e.hora_fim.slice(0, 5)
        }));
        setHorariosAusenciaEditando(horariosCarregados);
      } else {
        setHorariosAusenciaEditando([{ inicio: "", fim: "" }]);
      }
    }
    
    setMotivoEditando(ausencia.motivo || "");
    setDialogEditarAusencia(true);
  };

  // Função para carregar horários de escala do profissional para as datas selecionadas na edição
  const carregarHorariosEscalaParaAusenciaEditando = (datas: Date[], profissionalId: string) => {
    if (!profissionalId || datas.length === 0) {
      return;
    }

    // Pega o dia da semana da primeira data selecionada (0=domingo, 6=sábado)
    const diaSemana = getDay(datas[0]);
    
    // Busca os horários de escala do profissional para esse dia
    const escalaDoDia = todasEscalas?.filter(
      e => e.profissional_id === profissionalId && e.dia_semana === diaSemana
    ) || [];

    if (escalaDoDia.length > 0) {
      // Carrega os horários de escala do profissional
      const horariosCarregados = escalaDoDia.map(e => ({
        inicio: e.hora_inicio.slice(0, 5),
        fim: e.hora_fim.slice(0, 5)
      }));
      setHorariosAusenciaEditando(horariosCarregados);
    } else {
      // Se não tem escala para esse dia, deixa vazio
      setHorariosAusenciaEditando([{ inicio: "", fim: "" }]);
    }
  };

  // Handler para quando as datas de ausência são selecionadas na edição
  const handleSelecionarDatasAusenciaEditando = (dates: Date[] | undefined) => {
    const novasDatas = dates || [];
    setDatasAusenciaEditando(novasDatas);
    
    // Se selecionou novas datas e é uma única data, carrega os horários de escala
    if (novasDatas.length > 0 && ausenciaEditando && (datasAusenciaEditando.length === 0 || novasDatas.length === 1)) {
      carregarHorariosEscalaParaAusenciaEditando(novasDatas, ausenciaEditando.profissional_id);
    }
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
      // Buscar TODAS as ausências do grupo (mesma data e profissional) para deletar
      const dataOriginal = datasAusenciaEditando[0];
      const dataStr = format(dataOriginal, "yyyy-MM-dd");
      const todasDoGrupo = todasAusencias?.filter(
        a => a.profissional_id === ausenciaEditando.profissional_id && a.data_inicio === dataStr
      ) || [];
      
      // Deletar todas as ausências do grupo
      for (const ausencia of todasDoGrupo) {
        await deleteAusencia.mutateAsync(ausencia.id);
      }
      
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
            if (horario.inicio && horario.fim) {
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
      }
      
      toast({
        title: "Substituição atualizada",
        description: `${datasAusenciaEditando.length} data(s) registrada(s)`
      });
      setDialogEditarAusencia(false);
      setAusenciaEditando(null);
      setDatasAusenciaEditando([]);
      setHorariosAusenciaEditando([{ inicio: "", fim: "" }]);
      setDiaInteiroEditando(false);
      setMotivoEditando("");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a substituição",
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
                                {dia.horarios.map(horario => {
                                  const normInicio = (horario.hora_inicio || "").slice(0, 5);
                                  const normFim = (horario.hora_fim || "").slice(0, 5);

                                  const [h, m] = normInicio.split(":").map(Number);
                                  let h2 = h;
                                  let m2 = m + 30;
                                  if (m2 >= 60) {
                                    m2 -= 60;
                                    h2 += 1;
                                  }
                                  const autoFim = `${String(Math.min(h2, 23)).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
                                  const mostrarFim = normFim === autoFim ? "" : normFim;

                                  return (
                                    <div key={horario.id} className="flex items-center gap-2">
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        <Input type="time" value={normInicio} className="w-20 sm:w-24 h-8 text-xs pointer-events-none" readOnly tabIndex={-1} />
                                        <span className="text-muted-foreground">-</span>
                                        <Input type="time" value={mostrarFim} className="w-20 sm:w-24 h-8 text-xs pointer-events-none" readOnly tabIndex={-1} />
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
                                    </div>
                                  );
                                })}
                                {(horariosRascunho[diaKey] || []).map((rascunho) => (
                                  <div key={rascunho.tempId} className="flex items-center gap-2">
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      <Input type="time" value={rascunho.inicio} className="w-20 sm:w-24 h-8 text-xs pointer-events-none" readOnly tabIndex={-1} />
                                      <span className="text-muted-foreground">-</span>
                                      <Input type="time" value={rascunho.fim} className="w-20 sm:w-24 h-8 text-xs pointer-events-none" readOnly tabIndex={-1} />
                                    </div>
                                    <div className="flex gap-1 flex-shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() => handleEditarHorario({
                                          tempId: rascunho.tempId,
                                          profissional_id: profissional.id,
                                          dia_semana: dia.value,
                                          hora_inicio: rascunho.inicio,
                                          hora_fim: rascunho.fim,
                                        })}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        onClick={() =>
                                          setHorariosRascunho((prev) => ({
                                            ...prev,
                                            [diaKey]: (prev[diaKey] || []).filter((h) => h.tempId !== rascunho.tempId),
                                          }))
                                        }
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
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
                onFocus={e => {
                  // Se vazio, preenche com hora_inicio para o seletor iniciar do lugar certo
                  if (!e.target.value && editandoHorario?.hora_inicio) {
                    setEditandoHorario(prev => prev ? {
                      ...prev,
                      hora_fim: prev.hora_inicio
                    } : null);
                  }
                }}
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

      {/* Substituições de Escala */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 flex-shrink-0" />
            <span>Substituição de Escala</span>
          </CardTitle>
          <Button size="sm" className="flex-shrink-0" onClick={() => setDialogAusenciaAberto(true)} disabled={profissionalSelecionado === "todos"}>
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Nova</span> Substituição
          </Button>
        </CardHeader>
        <CardContent>
          {profissionalSelecionado === "todos" && <p className="text-sm text-muted-foreground mb-4">
              Selecione um profissional específico para gerenciar substituições
            </p>}
          {ausenciasAgrupadas && ausenciasAgrupadas.length > 0 ? <div className="space-y-2">
              {ausenciasAgrupadas.map(grupo => <div key={`${grupo.profissional_id}-${grupo.data}`} className="flex items-center justify-between gap-2 p-3 border rounded-lg bg-card">
                  <div className="min-w-0 flex-1">
                    {profissionalSelecionado === "todos" && <p className="text-xs text-muted-foreground mb-1">
                        {getNomeProfissional(grupo.profissional_id)}
                      </p>}
                    <p className="font-medium text-sm flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {format(parseISO(grupo.data), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      setAusenciaVisualizando({
                        data: grupo.data,
                        profissional_id: grupo.profissional_id,
                        horarios: grupo.ausencias.map(a => ({ id: a.id, inicio: a.hora_inicio, fim: a.hora_fim })),
                        motivo: grupo.motivo
                      });
                      setDialogVisualizarAusencia(true);
                    }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                      const primeiraAusencia = grupo.ausencias[0];
                      handleEditarAusencia({
                        id: primeiraAusencia.id,
                        profissional_id: primeiraAusencia.profissional_id,
                        data_inicio: primeiraAusencia.data_inicio,
                        data_fim: primeiraAusencia.data_fim,
                        hora_inicio: primeiraAusencia.hora_inicio,
                        hora_fim: primeiraAusencia.hora_fim,
                        motivo: primeiraAusencia.motivo
                      });
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={async () => {
                      // Deleta todas as ausências do grupo
                      for (const ausencia of grupo.ausencias) {
                        await handleDeletarAusencia(ausencia.id);
                      }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>)}
            </div> : <p className="text-center text-muted-foreground py-8">Nenhuma substituição registrada</p>}
        </CardContent>
      </Card>

      {/* Dialog Editar Substituição */}
      <Dialog open={dialogEditarAusencia} onOpenChange={setDialogEditarAusencia}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Substituição - {datasAusenciaEditando.length > 0 ? format(datasAusenciaEditando[0], "dd/MM/yyyy", { locale: ptBR }) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Horários substitutos:</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Estes horários substituirão a escala regular neste dia
              </p>
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
                      min={horario.inicio || undefined}
                      onFocus={e => {
                        if (!e.target.value && horario.inicio) {
                          handleAtualizarHorarioAusenciaEditando(index, 'fim', horario.inicio);
                        }
                      }}
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
              <Label className="text-sm">Sem disponibilidade (o dia todo)</Label>
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


      {/* Dialog Visualizar Substituição */}
      <Dialog open={dialogVisualizarAusencia} onOpenChange={setDialogVisualizarAusencia}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Substituição - {ausenciaVisualizando ? format(parseISO(ausenciaVisualizando.data), "dd/MM/yyyy", { locale: ptBR }) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {ausenciaVisualizando && (
              <>
                <div>
                  <Label className="text-sm font-medium">Horários substitutos registrados:</Label>
                </div>
                <div className="space-y-2">
                  {ausenciaVisualizando.horarios.length > 0 && ausenciaVisualizando.horarios.some(h => h.inicio || h.fim) ? (
                    ausenciaVisualizando.horarios.map((horario, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">
                          {horario.inicio?.slice(0, 5) || "00:00"} - {horario.fim?.slice(0, 5) || "23:59"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Dia inteiro indisponível</p>
                  )}
                </div>
                {ausenciaVisualizando.motivo && (
                  <div>
                    <Label className="text-sm font-medium">Motivo:</Label>
                    <p className="text-sm text-muted-foreground mt-1">{ausenciaVisualizando.motivo}</p>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDialogVisualizarAusencia(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>


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
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-sm font-medium">{dia.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button 
              onClick={handleCopiarParaDias} 
              className="w-full"
              disabled={diasDestinoSelecionados.length === 0 || copiandoEscala}
            >
              {copiandoEscala ? "Copiando..." : `Copiar para ${diasDestinoSelecionados.length} dia(s)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Nova Substituição */}
      <Dialog open={dialogAusenciaAberto} onOpenChange={setDialogAusenciaAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Substituição de Escala</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Calendário */}
            <div className="w-full sm:w-auto sm:flex-shrink-0">
              <Calendar 
                mode="multiple" 
                selected={datasAusenciaSelecionadas} 
                onSelect={handleSelecionarDatasAusencia} 
                locale={ptBR} 
                className="pointer-events-auto rounded-md border w-full"
                classNames={{
                  months: "flex flex-col w-full",
                  month: "space-y-4 w-full",
                  table: "w-full border-collapse space-y-1",
                  head_row: "flex w-full justify-between",
                  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] text-center",
                  row: "flex w-full mt-2 justify-between",
                  cell: "flex-1 h-9 text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
                  day: "h-9 w-full p-0 font-normal aria-selected:opacity-100 hover:bg-muted rounded-md",
                  day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground rounded-md",
                  day_today: "bg-muted text-muted-foreground",
                }}
              />
            </div>
            
            {/* Horários */}
            <div className="flex-1 space-y-4">
              <div>
                <Label className="text-sm font-medium">Horários substitutos:</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Estes horários substituirão a escala regular nas datas selecionadas.
                </p>
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
                        min={horario.inicio || undefined}
                        onFocus={e => {
                          if (!e.target.value && horario.inicio) {
                            handleAtualizarHorarioAusencia(index, 'fim', horario.inicio);
                          }
                        }}
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
                <Label className="text-sm">Sem disponibilidade (o dia todo)</Label>
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
              Salvar Substituição
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>;
}