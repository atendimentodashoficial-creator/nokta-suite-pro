import { useState, useMemo, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Check, Video, Calendar as CalendarIconSolid, ChevronDown } from "lucide-react";
import { formatPhone, normalizePhone, getLast8Digits, formatPhoneByCountry, getPhonePlaceholder, extractCountryCode, stripCountryCode } from "@/utils/phoneFormat";
import { syncContactNameEverywhere, CONTACT_NAME_QUERY_KEYS } from "@/utils/syncContactName";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useCreateAgendamento, useAgendamentos } from "@/hooks/useAgendamentos";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias } from "@/hooks/useEscalas";
import { useLeads } from "@/hooks/useLeads";
import { useTiposAgendamento } from "@/hooks/useTiposAgendamento";
import { useQuery } from "@tanstack/react-query";
import { useUserFeatureAccess } from "@/hooks/useUserFeatureAccess";
import { useGoogleCalendarStatus } from "@/hooks/useGoogleCalendarStatus";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatInTimeZone } from "date-fns-tz";

// Auto-move disparo kanban card when a meeting is scheduled for this contact
async function autoMoveKanbanOnReuniao(userId: string, telefone: string) {
  try {
    const { data: config } = await supabase
      .from("disparos_kanban_config")
      .select("auto_move_reuniao_column_id")
      .eq("user_id", userId)
      .maybeSingle();

    const targetColumnId = (config as any)?.auto_move_reuniao_column_id;
    if (!targetColumnId) return;

    const last8 = getLast8Digits(telefone);
    if (!last8) return;

    const { data: chats } = await supabase
      .from("disparos_chats")
      .select("id")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .like("normalized_number", `%${last8}`);

    if (!chats || chats.length === 0) return;

    for (const chat of chats) {
      const { data: entry } = await supabase
        .from("disparos_chat_kanban")
        .select("id")
        .eq("chat_id", chat.id)
        .maybeSingle();

      if (entry) {
        await supabase
          .from("disparos_chat_kanban")
          .update({ column_id: targetColumnId, updated_at: new Date().toISOString() })
          .eq("id", entry.id);
      } else {
        await supabase.from("disparos_chat_kanban").insert({
          user_id: userId,
          chat_id: chat.id,
          column_id: targetColumnId,
        });
      }
    }
  } catch (err) {
    console.error("[AutoMove] Error in autoMoveKanbanOnReuniao:", err);
  }
}
import { CountryCodeSelect, countries } from "@/components/whatsapp/CountryCodeSelect";
import { buildCandidateStartTimes, rangesOverlap, timeToMinutes, type MinuteRange, type TimeRange } from "@/utils/timeSlots";
// Calcular próxima data disponível para um profissional
const calcularProximaDataDisponivel = (
  profissionalId: string,
  dataInicial: Date,
  escalas: any[] | undefined,
  ausencias: any[] | undefined,
  agendamentos: any[] | undefined,
  tempoAtendimento: number = 60
): Date | null => {
  if (!escalas) return null;
  
  const escalasProfissional = escalas.filter(e => e.profissional_id === profissionalId && e.ativo);
  if (escalasProfissional.length === 0) return null;
  
  const ausenciasProfissional = ausencias?.filter(a => a.profissional_id === profissionalId) || [];
  const agendamentosProfissional = agendamentos?.filter(
    a => a.profissional_id === profissionalId && a.status !== "cancelado"
  ) || [];
  
  // Buscar nos próximos 60 dias
  for (let i = 1; i <= 60; i++) {
    const dataTest = new Date(dataInicial);
    dataTest.setDate(dataTest.getDate() + i);
    const diaSemana = dataTest.getDay();
    const dataStr = format(dataTest, 'yyyy-MM-dd');
    
    // Verificar se há substituições de escala para esta data (pode haver múltiplas faixas)
    const substituicoes = ausenciasProfissional.filter(aus => {
      return dataStr >= aus.data_inicio && dataStr <= aus.data_fim;
    });
    
    // Gerar horários do dia
    const horariosDay: string[] = [];
    
    if (substituicoes.length > 0) {
      // Verificar se alguma substituição não tem horários (dia indisponível)
      const diaInteiro = substituicoes.some(s => !s.hora_inicio || !s.hora_fim);
      
      if (diaInteiro) continue; // Dia indisponível
      
      // Gerar horários para cada faixa de substituição
      substituicoes.forEach(sub => {
        if (sub.hora_inicio && sub.hora_fim) {
          const horariosIntervalo = gerarHorariosIntervalo(
            sub.hora_inicio,
            sub.hora_fim,
            tempoAtendimento
          );
          horariosDay.push(...horariosIntervalo);
        }
      });
    } else {
      // Sem substituição - verificar se tem escala neste dia
      const temEscala = escalasProfissional.some(e => e.dia_semana === diaSemana);
      if (!temEscala) continue;
      
      // Usar escala normal
      escalasProfissional.forEach(escala => {
        if (escala.dia_semana === diaSemana) {
          const horariosIntervalo = gerarHorariosIntervalo(
            escala.hora_inicio,
            escala.hora_fim,
            tempoAtendimento
          );
          horariosDay.push(...horariosIntervalo);
        }
      });
    }
    
    // Verificar horários ocupados
    const horariosOcupados = agendamentosProfissional
      .filter(ag => {
        const agData = formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
        return agData === dataStr;
      })
      .map(ag => formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm'));
    
    const horariosLivres = [...new Set(horariosDay)].filter(h => !horariosOcupados.includes(h));
    
    if (horariosLivres.length > 0) {
      return dataTest;
    }
  }
  
  return null;
};

// Gerar horários baseado na escala do profissional ou substituição
const gerarHorariosDisponiveis = (
  diaSemana: number,
  escalas: any[] | undefined,
  ausencias: any[] | undefined,
  dataSelecionada: Date,
  intervaloMinutos: number = 60
) => {
  const dataStr = format(dataSelecionada, 'yyyy-MM-dd');
  
  // Verificar se há substituições de escala para esta data (pode haver múltiplas faixas)
  const substituicoes = ausencias?.filter(aus => {
    const inicio = aus.data_inicio;
    const fim = aus.data_fim;
    return dataStr >= inicio && dataStr <= fim;
  }) || [];

  // Se há substituições
  if (substituicoes.length > 0) {
    // Verificar se alguma substituição não tem horários (dia indisponível)
    const diaInteiro = substituicoes.some(s => !s.hora_inicio || !s.hora_fim);
    
    if (diaInteiro) {
      return []; // Profissional indisponível o dia todo
    }
    
    // Gerar horários para cada faixa de substituição
    const horarios: string[] = [];
    substituicoes.forEach(sub => {
      if (sub.hora_inicio && sub.hora_fim) {
        const horariosIntervalo = gerarHorariosIntervalo(
          sub.hora_inicio,
          sub.hora_fim,
          intervaloMinutos
        );
        horarios.push(...horariosIntervalo);
      }
    });
    
    return [...new Set(horarios)].sort();
  }

  // Sem substituição - usar escala normal
  if (!escalas || escalas.length === 0) {
    // Se não houver escala, retornar horário comercial padrão
    return gerarHorariosIntervalo("08:00", "18:00", intervaloMinutos);
  }

  // Buscar escalas para o dia da semana
  const escalasDay = escalas.filter(esc => esc.dia_semana === diaSemana && esc.ativo);
  
  if (escalasDay.length === 0) {
    return []; // Profissional não trabalha neste dia
  }

  // Gerar horários para cada intervalo de escala
  const horarios: string[] = [];
  escalasDay.forEach(escala => {
    const horariosIntervalo = gerarHorariosIntervalo(
      escala.hora_inicio,
      escala.hora_fim,
      intervaloMinutos
    );
    horarios.push(...horariosIntervalo);
  });

  return [...new Set(horarios)].sort();
};

const gerarHorariosIntervalo = (
  horaInicio: string,
  horaFim: string,
  intervaloMinutos: number = 15
) => {
  const horarios: string[] = [];
  const [hInicio, mInicio] = horaInicio.split(':').map(Number);
  const [hFim, mFim] = horaFim.split(':').map(Number);
  
  let minutoAtual = hInicio * 60 + mInicio;
  const minutoFim = hFim * 60 + mFim;

  while (minutoAtual < minutoFim) {
    const h = Math.floor(minutoAtual / 60);
    const m = minutoAtual % 60;
    horarios.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    minutoAtual += intervaloMinutos;
  }

  return horarios;
};

const agendamentoSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório").max(100),
  telefone: z.string().trim().min(1, "Telefone é obrigatório").max(20),
  email: z.string().trim().email("Email inválido").optional().or(z.literal("")),
  tipo: z.string().optional(),
  data_agendamento: z.date({
    required_error: "Data é obrigatória",
  }),
  hora: z.string().min(1, "Selecione um horário"),
  procedimento_id: z.string().min(1, "Selecione um procedimento"),
  profissional_id: z.string().min(1, "Selecione um profissional e horário"),
  observacoes: z.string().max(500).optional(),
});

type AgendamentoFormData = z.infer<typeof agendamentoSchema>;

interface NovoAgendamentoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId?: string; // ID do cliente para vincular diretamente
  initialData?: {
    nome?: string;
    telefone?: string;
    email?: string;
  };
  origem?: "WhatsApp" | "Disparos"; // Origem para segregação de leads
  origemInstanciaId?: string; // ID da instância de Disparos (para roteamento de avisos)
  origemInstanciaNome?: string; // Nome da instância de Disparos (para roteamento de avisos)
}

export function NovoAgendamentoDialog({
  open,
  onOpenChange,
  clienteId,
  initialData,
  origem,
  origemInstanciaId,
  origemInstanciaNome,
}: NovoAgendamentoDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clienteSuggestions, setClienteSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [countryCode, setCountryCode] = useState("55");
  // "google" = só Google, "app" = só app, "both" = ambos
  // Padrão é "both" quando reuniões está habilitada
  const [tipoCalendario, setTipoCalendario] = useState<"google" | "app" | "both">("both");
  const [calendarioExpanded, setCalendarioExpanded] = useState(false);
  // Opção para mostrar horários de 15 em 15 min
  const [mostrarHorarios15min, setMostrarHorarios15min] = useState(false);
  
  // Track if name was manually edited by user - prevents auto-fill from overwriting
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  // Track last phone used for auto-fill to only trigger on phone change
  const [lastAutoFilledPhone, setLastAutoFilledPhone] = useState<string | null>(null);
  // Ensure initial auto-fill runs at most once per (dialog open + phone)
  const initialAutofillKeyRef = useRef<string | null>(null);
  
  // Google Calendar and feature access
  const { isFeatureEnabled } = useUserFeatureAccess();
  const { data: gcalStatus } = useGoogleCalendarStatus();
  const reunioesEnabled = isFeatureEnabled("reunioes");
  const googleCalendarConnected = gcalStatus?.isConnected || false;
  const showGoogleMeetOption = reunioesEnabled && googleCalendarConnected;

  const queryClient = useQueryClient();
  const createAgendamento = useCreateAgendamento();
  const { data: procedimentos } = useProcedimentos();
  const { data: profissionais } = useProfissionais();
  const { data: todosAgendamentos } = useAgendamentos();
  const { data: escalas } = useEscalas();
  const { data: ausencias } = useAusencias();
  const { data: todosClientes } = useLeads("cliente");
  const { tiposAtivos, isLoading: isLoadingTipos } = useTiposAgendamento();
  
  // Buscar reuniões para verificar horários ocupados
  const { data: reunioes } = useQuery({
    queryKey: ["reunioes-disponibilidade"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reunioes")
        .select("id, data_reuniao, duracao_minutos, profissional_id, status")
        .not("profissional_id", "is", null)
        .neq("status", "cancelado");
      
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Extrair código do país e número limpo do initialData
  const initialPhoneData = useMemo(() => {
    if (initialData?.telefone) {
      return extractCountryCode(initialData.telefone);
    }
    return { countryCode: "55", phoneWithoutCountry: "" };
  }, [initialData?.telefone]);

  const form = useForm<AgendamentoFormData>({
    resolver: zodResolver(agendamentoSchema),
    defaultValues: {
      nome: initialData?.nome || "",
      telefone: initialPhoneData.phoneWithoutCountry,
      email: initialData?.email || "",
      tipo: "",
      hora: "",
      procedimento_id: "",
      profissional_id: "",
      observacoes: "",
    },
  });

  // Atualizar valores quando initialData mudar
  // Prioriza dados do cliente existente se houver um com o mesmo telefone
  // Reset manual edit flag when dialog opens with new data
  useEffect(() => {
    if (open) {
      setNameManuallyEdited(false);
      setLastAutoFilledPhone(null);
      initialAutofillKeyRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    const preencherDadosIniciais = async () => {
      if (!initialData) return;

      // If user already started editing the name, never overwrite it.
      if (nameManuallyEdited) return;

      const autofillKey = `${open ? 'open' : 'closed'}|${clienteId || ''}|${initialData.telefone || ''}`;
      if (initialAutofillKeyRef.current === autofillKey) return;

      // Primeiro, definir o telefone e código do país
      if (initialData.telefone) {
        const { countryCode: extractedCode, phoneWithoutCountry } = extractCountryCode(initialData.telefone);
        form.setValue("telefone", phoneWithoutCountry);
        setCountryCode(extractedCode);

        const last8Digits = getLast8Digits(initialData.telefone);

        // Mark this phone as auto-filled so handleTelefoneBlur doesn't trigger again
        setLastAutoFilledPhone(last8Digits || null);

        // Buscar cliente existente pelo telefone para usar nome correto
        if (last8Digits && last8Digits.length >= 8) {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Buscar cliente existente pelos últimos 8 dígitos (server-side)
              const { data: matchingClientes } = await supabase
                .from("leads")
                .select("nome, email, telefone, status")
                .eq("user_id", user.id)
                .eq("status", "cliente")
                .is("deleted_at", null)
                .like("telefone", `%${last8Digits}`)
                .limit(1);

              const clienteExistente = matchingClientes?.[0] || null;

              if (clienteExistente) {
                // Usar dados do cliente existente
                form.setValue("nome", clienteExistente.nome);
                if (clienteExistente.email) {
                  form.setValue("email", clienteExistente.email);
                }

                initialAutofillKeyRef.current = autofillKey;
                return; // Dados preenchidos com cliente existente
              }
            }
          } catch (error) {
            // Se falhar, usar dados do initialData
          }
        }
      }

      // Fallback: usar dados do initialData se não encontrar cliente existente
      if (initialData.nome) form.setValue("nome", initialData.nome);
      if (initialData.email) form.setValue("email", initialData.email);

      initialAutofillKeyRef.current = autofillKey;
    };

    // Only attempt autofill while dialog is open
    if (open) preencherDadosIniciais();
  }, [open, clienteId, initialData, form, nameManuallyEdited]);

  // Buscar clientes para autocomplete
  const handleNomeChange = (value: string) => {
    form.setValue("nome", value);
    
    // Mark as manually edited when user types in the name field
    setNameManuallyEdited(true);
    
    if (clienteId) return; // Não buscar se já tem cliente fixo
    
    if (value.length < 2) {
      setClienteSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const filtered = todosClientes?.filter(c => 
      c.nome.toLowerCase().includes(value.toLowerCase())
    ).slice(0, 5) || [];
    
    setClienteSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
  };

  const handleSelectCliente = (cliente: any) => {
    form.setValue("nome", cliente.nome);
    // Extrair código do país do telefone do cliente
    const { countryCode: extractedCode, phoneWithoutCountry } = extractCountryCode(cliente.telefone);
    form.setValue("telefone", phoneWithoutCountry);
    setCountryCode(extractedCode);
    form.setValue("email", cliente.email || "");
    setShowSuggestions(false);
    // When selecting from suggestions, reset manual edit flag (user chose this name)
    setNameManuallyEdited(false);
    setLastAutoFilledPhone(getLast8Digits(cliente.telefone) || null);
    toast.info("Dados do cliente preenchidos!");
  };

  const dataWatch = form.watch("data_agendamento");
  const profissionalWatch = form.watch("profissional_id");
  const procedimentoWatch = form.watch("procedimento_id");
  const telefoneWatch = form.watch("telefone");
  
  // Buscar cliente existente pelo telefone e preencher dados automaticamente
  // Only auto-fill if: name wasn't manually edited AND phone changed from last auto-fill
  const handleTelefoneBlur = async () => {
    // If user manually edited the name AND it's not empty, don't overwrite it
    const currentName = form.getValues("nome")?.trim();
    if (nameManuallyEdited && currentName) return;
    
    const telefoneValue = form.getValues("telefone");
    const last8Digits = getLast8Digits(telefoneValue);
    if (!last8Digits || last8Digits.length < 8) return;
    
    // If this phone was already used for auto-fill, don't do it again
    if (lastAutoFilledPhone === last8Digits) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar cliente existente pelos últimos 8 dígitos (server-side)
      const { data: matchingLeads } = await supabase
        .from("leads")
        .select("nome, email, telefone")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .like("telefone", `%${last8Digits}`)
        .limit(1);

      const clienteExistente = matchingLeads?.[0] || null;

      if (clienteExistente) {
        form.setValue("nome", clienteExistente.nome);
        if (clienteExistente.email) {
          form.setValue("email", clienteExistente.email);
        }
        setLastAutoFilledPhone(last8Digits);
        toast.info("Cliente encontrado! Dados preenchidos automaticamente.");
      }
    } catch (error) {
      // Silenciosamente ignora se não encontrar cliente
    }
  };
  
  // Obter tempo de atendimento do procedimento selecionado
  const tempoAtendimento = useMemo(() => {
    if (!procedimentoWatch) return 60;
    const proc = procedimentos?.find(p => p.id === procedimentoWatch);
    return proc?.tempo_atendimento_minutos || proc?.duracao_minutos || 60;
  }, [procedimentoWatch, procedimentos]);

  // Intervalo efetivo para geração de horários
  const intervaloEfetivo = mostrarHorarios15min ? 15 : tempoAtendimento;

  // Calcular profissionais disponíveis com seus horários para data e procedimento selecionados
  const profissionaisDisponiveis = useMemo(() => {
    if (!dataWatch || !procedimentoWatch) return [];
    
    const diaSemana = dataWatch.getDay();
    const dataStr = format(dataWatch, 'yyyy-MM-dd');
    
    return profissionais?.filter(p => p.ativo).map(prof => {
      // Buscar escalas do profissional para o dia da semana
      const escalasProfissional = escalas?.filter(
        e => e.profissional_id === prof.id && e.dia_semana === diaSemana && e.ativo
      ) || [];
      
      // Verificar se há substituições de escala para esta data (pode haver múltiplas faixas)
      const ausenciasProfissional = ausencias?.filter(a => a.profissional_id === prof.id) || [];
      const substituicoes = ausenciasProfissional.filter(aus => {
        return dataStr >= aus.data_inicio && dataStr <= aus.data_fim;
      });
      
      // Janelas de atendimento (substituição ou escala)
      let windows: TimeRange[] = [];

      if (substituicoes.length > 0) {
        const diaInteiro = substituicoes.some((s) => !s.hora_inicio || !s.hora_fim);
        if (!diaInteiro) {
          windows = substituicoes
            .filter((s) => s.hora_inicio && s.hora_fim)
            .map((s) => ({ start: s.hora_inicio, end: s.hora_fim }));
        }
      } else if (escalasProfissional.length > 0) {
        windows = escalasProfissional.map((e) => ({ start: e.hora_inicio, end: e.hora_fim }));
      }

      // Candidatos respeitam fim da janela e a duração do NOVO procedimento
      const candidatos = buildCandidateStartTimes(windows, intervaloEfetivo, tempoAtendimento);

      const busy: MinuteRange[] = [];

      // Agendamentos existentes (intervalos reais)
      todosAgendamentos
        ?.filter((ag) => {
          if (ag.profissional_id !== prof.id) return false;
          if (ag.status === "cancelado") return false;
          const agData = formatInTimeZone(ag.data_agendamento as any, "America/Sao_Paulo", "yyyy-MM-dd");
          return agData === dataStr;
        })
        .forEach((ag) => {
          const startStr = formatInTimeZone(ag.data_agendamento as any, "America/Sao_Paulo", "HH:mm");
          const startMin = timeToMinutes(startStr);
          const dur =
            procedimentos?.find((p) => p.id === ag.procedimento_id)?.tempo_atendimento_minutos ||
            procedimentos?.find((p) => p.id === ag.procedimento_id)?.duracao_minutos ||
            60;
          busy.push({ startMin, endMin: startMin + dur });
        });

      // Reuniões existentes (intervalos reais)
      reunioes
        ?.filter((r) => {
          if (r.profissional_id !== prof.id) return false;
          const rData = formatInTimeZone(r.data_reuniao as any, "America/Sao_Paulo", "yyyy-MM-dd");
          return rData === dataStr;
        })
        .forEach((r) => {
          const startStr = formatInTimeZone(r.data_reuniao as any, "America/Sao_Paulo", "HH:mm");
          const startMin = timeToMinutes(startStr);
          const dur = r.duracao_minutos || 30;
          busy.push({ startMin, endMin: startMin + dur });
        });

      const horariosLivres = candidatos
        .filter((hhmm) => {
          const startMin = timeToMinutes(hhmm);
          const candidateRange: MinuteRange = { startMin, endMin: startMin + tempoAtendimento };
          return !busy.some((b) => rangesOverlap(candidateRange, b));
        })
        .sort();
      
      // Calcular próxima data disponível se não houver horários
      let proximaData: Date | null = null;
      if (horariosLivres.length === 0) {
        proximaData = calcularProximaDataDisponivel(
          prof.id,
          dataWatch,
          escalas,
          ausencias,
          todosAgendamentos,
          tempoAtendimento
        );
      }
      
      return {
        profissional: prof,
        horarios: horariosLivres,
        proximaDataDisponivel: proximaData,
      };
    }) || [];
  }, [dataWatch, procedimentoWatch, profissionais, escalas, ausencias, todosAgendamentos, reunioes, intervaloEfetivo, tempoAtendimento]);

  // Função para atualizar nome em todos os registros relacionados
  const atualizarNomeEmTodosRegistros = async (userId: string, telefone: string, novoNome: string) => {
    try {
      // Usar função centralizada para sincronizar nome em todas as tabelas
      await syncContactNameEverywhere(telefone, novoNome);

      // Invalidar todas as queries relacionadas
      CONTACT_NAME_QUERY_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    } catch (error) {
      console.error("Erro ao atualizar nome em registros relacionados:", error);
    }
  };

  const onSubmit = async (data: AgendamentoFormData) => {
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      let finalClienteId: string | undefined = undefined;
      
      // Build full phone number with country code
      let normalizedPhone = `${countryCode}${normalizePhone(data.telefone)}`;
      
      // Se tiver apenas 10 dígitos após o código do país (DDD + 8), adicionar 9 após o DDD (só para Brasil)
      const phoneWithoutCountry = normalizePhone(data.telefone);
      if (countryCode === "55" && phoneWithoutCountry.length === 10) {
        normalizedPhone = `55${phoneWithoutCountry.slice(0, 2)}9${phoneWithoutCountry.slice(2)}`;
      }

      const last8Digits = getLast8Digits(normalizedPhone);

      // Se tiver clienteId fornecido, verificar se existe
      if (clienteId) {
        const { data: leadExistente } = await supabase
          .from("leads")
          .select("id, status, nome, email, telefone, origem")
          .eq("id", clienteId)
          .maybeSingle();

        if (leadExistente) {
          finalClienteId = leadExistente.id;
          
          // Verificar se o nome foi alterado
          const nomeAlterado = data.nome && data.nome !== leadExistente.nome;
          
          // Se o nome foi alterado, atualizar em TODOS os registros relacionados
          if (nomeAlterado && last8Digits) {
            await atualizarNomeEmTodosRegistros(user.id, last8Digits, data.nome);
            toast.info("Nome atualizado em todos os registros!");
          }
          
          // Atualizar outros dados do cliente se foram alterados
          const updates: any = {};
          
          if (data.email !== undefined && data.email !== leadExistente.email) {
            updates.email = data.email || null;
          }
          if (normalizedPhone && normalizedPhone !== leadExistente.telefone) {
            updates.telefone = normalizedPhone;
          }
          
          // Só atualizar status para "cliente" se:
          // - origem não foi especificada (agendamento manual/genérico do calendário/aba clientes)
          // - Leads de WhatsApp e Disparos permanecem como "lead" mesmo com agendamento
          const leadOrigem = (leadExistente.origem || "").toLowerCase();
          const origemParam = (origem || "").toLowerCase();
          
          // NÃO converter para cliente se veio de WhatsApp ou Disparos
          // Isso mantém o card na subaba de Leads
          const deveConverterParaCliente = !origem && leadExistente.status !== "cliente";
          
          if (deveConverterParaCliente) {
            updates.status = "cliente";
            updates.origem_tipo = "Manual";
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("leads")
              .update(updates)
              .eq("id", leadExistente.id);

            if (updateError) throw updateError;

            queryClient.invalidateQueries({ queryKey: ["leads"] });

            if (updates.status === "cliente") {
              toast.success("Lead convertido para cliente!");
            }
          }
        }
        // Se clienteId foi fornecido mas não existe, seguir para criar novo
      }

      // Se ainda não temos um cliente válido, garantir lead/cliente via backend (restaura se estiver excluído)
      if (!finalClienteId) {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Sessão expirada. Faça login novamente.");

        // Para agendamentos vindos de WhatsApp/Disparos, o lead deve continuar como "lead",
        // MAS precisamos garantir/criar também o registro de "cliente" para aparecer na aba Clientes.
        const statusParaEnsure = origem ? "lead" : "cliente";

        const res = await supabase.functions.invoke("ensure-lead", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            telefone: normalizedPhone,
            nome: data.nome,
            email: data.email || null,
            status: statusParaEnsure,
            ensure_cliente: !!origem,
            origem_tipo: origem || "Manual",
            origem_lead: !!origem,
            ...(origem ? { origem } : {}),
          },
        });

     if (res.error) {
          console.error("[NovoAgendamento] ensure-lead error:", res.error);
          throw res.error;
        }

        console.log("[NovoAgendamento] ensure-lead response:", JSON.stringify(res.data));

        const ensuredLeadId = (res.data as any)?.id as string | undefined;
        const ensuredClienteId = (res.data as any)?.cliente_id as string | undefined;

        // Quando veio de Leads (WhatsApp/Disparos), usamos o cliente_id para criar o agendamento.
        // Quando é manual, usamos o id retornado.
        // FALLBACK: se cliente_id não veio mas temos o lead id, usar o lead id mesmo
        const targetClienteId = origem ? (ensuredClienteId || ensuredLeadId) : ensuredLeadId;
        if (!targetClienteId) throw new Error(`Não foi possível identificar o cliente. Response: ${JSON.stringify(res.data)}`);

        finalClienteId = targetClienteId;
        
        // Se criou novo registro, também atualizar nome em todos os relacionados (caso existam)
        if (last8Digits) {
          await atualizarNomeEmTodosRegistros(user.id, last8Digits, data.nome);
        }
        
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      }

      // Combinar data e hora
      const [hora, minuto] = data.hora.split(":").map(Number);
      const dataHora = new Date(data.data_agendamento);
      dataHora.setHours(hora, minuto, 0, 0);

      // Criar o agendamento com origem
      const origemAgendamento = origem || "Manual";
      
      // Get procedimento name for Google Meet description
      const procedimentoSelecionado = procedimentos?.find(p => p.id === data.procedimento_id);

      // Lógica das opções de calendário:
      // - "both"   => Google Calendar + Reuniões + Calendário (agendamentos)
      // - "google" => Apenas aba Reuniões (cria no Google Calendar, NÃO cria no calendário de agendamentos)
      // - "app"    => Apenas Calendário (agendamentos), sem reunião
      const meetingsEnabled = reunioesEnabled;
      const criarNoGoogleCalendar = meetingsEnabled && (tipoCalendario === "both" || tipoCalendario === "google") && showGoogleMeetOption;
      const criarReuniaoInterna = false; // Reuniões via Google Calendar são criadas pelo backend
      const criarNoCalendarioApp = !meetingsEnabled || tipoCalendario === "both" || tipoCalendario === "app";

      // Criar item no Calendário (tabela agendamentos) SOMENTE quando:
      // - feature reuniões desabilitada (fluxo antigo)
      // - OU usuário escolheu "both"
      if (criarNoCalendarioApp) {
        await createAgendamento.mutateAsync({
          cliente_id: finalClienteId,
          tipo: data.tipo as any,
          status: "agendado",
          data_agendamento: dataHora.toISOString(),
          procedimento_id: data.procedimento_id || null,
          profissional_id: data.profissional_id || null,
          observacoes: data.observacoes || null,
          data_follow_up: null,
          numero_reagendamentos: 0,
          aviso_dia_anterior: false,
          aviso_dia: false,
          aviso_3dias: false,
          origem_agendamento: origemAgendamento,
          origem_instancia_nome: origemInstanciaNome || null,
        });
      }

      // Se opção de Google Calendar está ativa, criar evento no Google Calendar (e salvar na aba Reuniões via backend)
      if (criarNoGoogleCalendar) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            // Normalizar telefone para envio de notificação imediata
            const telefoneNormalizado = data.telefone ? `${countryCode}${data.telefone.replace(/\D/g, '')}` : undefined;
            
            const gcalRes = await supabase.functions.invoke("google-calendar-create-event", {
              headers: { Authorization: `Bearer ${session.access_token}` },
              body: {
                titulo: procedimentoSelecionado?.nome || "Reunião",
                descricao: data.observacoes || undefined,
                dataHora: dataHora.toISOString(),
                duracaoMinutos: tempoAtendimento,
                participanteEmail: data.email || undefined,
                participanteNome: data.nome,
                participanteTelefone: telefoneNormalizado, // Para envio de aviso imediato
                procedimentoNome: procedimentoSelecionado?.nome,
                profissionalId: data.profissional_id || null,
                // Sempre salvar a reunião na aba Reuniões quando criar no Google Calendar.
                // (O "both" controla apenas se cria também no Calendário / agendamentos.)
                skipLocalSave: false,
                // Passar instância do chat para manter consistência de número
                instanciaId: origemInstanciaId || null,
                instanciaNome: origemInstanciaNome || null,
              },
            });

            // Garantia extra: se por algum motivo o backend não salvou o profissional_id,
            // corrigimos aqui para o nome aparecer no card.
            const reuniaoId = (gcalRes.data as any)?.reuniaoId as string | undefined;
            if (!gcalRes.error && reuniaoId && data.profissional_id) {
              await supabase
                .from("reunioes")
                .update({ profissional_id: data.profissional_id })
                .eq("id", reuniaoId)
                .is("profissional_id", null);
            }
            
            if (gcalRes.error) {
              console.error("Erro ao criar evento Google Calendar:", gcalRes.error);
              toast.warning("Agendamento criado, mas houve erro ao criar reunião no Google Calendar");
            } else if (gcalRes.data?.meetLink) {
              toast.success(`Reunião Google Meet criada! Link: ${gcalRes.data.meetLink}`);
            } else {
              toast.success("Evento criado no Google Calendar!");
            }
          }
        } catch (gcalError) {
          console.error("Erro ao criar evento Google Calendar:", gcalError);
          toast.warning("Agendamento criado, mas houve erro ao criar reunião no Google Calendar");
        }
      }

      // Se opção "apenas reunião" está ativa, criar SOMENTE na tabela reunioes (sem Google e sem Calendário)
      if (criarReuniaoInterna) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const participantes = data.email ? [data.nome, data.email] : [data.nome];
            const telefoneNormalizado = data.telefone ? `${countryCode}${data.telefone.replace(/\D/g, '')}` : null;
            
            const { data: reuniaoData, error: reuniaoError } = await supabase
              .from("reunioes")
              .insert({
                user_id: session.user.id,
                titulo: procedimentoSelecionado?.nome || "Reunião",
                data_reuniao: dataHora.toISOString(),
                duracao_minutos: tempoAtendimento,
                participantes: participantes,
                status: "agendado",
                cliente_telefone: telefoneNormalizado,
                profissional_id: data.profissional_id || null,
              })
              .select()
              .single();

            if (reuniaoError) {
              console.error("Erro ao criar reunião na agenda do app:", reuniaoError);
              toast.warning("Erro ao criar reunião na agenda do app");
            } else {
              toast.success("Reunião criada!");
              
              // Auto-move kanban card when a meeting is scheduled (fire-and-forget)
              if (telefoneNormalizado) {
                autoMoveKanbanOnReuniao(session.user.id, telefoneNormalizado).catch(console.error);
              }

              // Disparar aviso imediato se houver telefone
              if (telefoneNormalizado && reuniaoData?.id) {
                try {
                  const res = await supabase.functions.invoke("enviar-aviso-reuniao-imediato", {
                    body: {
                      reuniaoId: reuniaoData.id,
                      // Mantido por compatibilidade com chamadas internas; o backend vai validar/ignorar quando for chamada do app.
                      userId: session.user.id,
                      clienteTelefone: telefoneNormalizado,
                      clienteNome: data.nome,
                      origem: origem || null,
                      instanciaId: origemInstanciaId || null,
                      instanciaNome: origemInstanciaNome || null,
                    },
                  });

                  if (res.error) {
                    throw res.error;
                  }

                  // Se não enviou nada, avisar (ex.: instância desconectada)
                  if (res.data && typeof res.data === 'object' && 'sent' in res.data) {
                    const sent = Number((res.data as any).sent ?? 0);
                    if (sent <= 0) {
                      const errMsg = String((res.data as any).error || (res.data as any).message || 'Aviso imediato não enviado');
                      toast.warning(errMsg);
                    }
                  }
                } catch (avisoError) {
                  console.error("Erro ao enviar aviso imediato:", avisoError);
                  toast.warning("Não foi possível enviar o aviso imediato (verifique a conexão da instância em Conexões → Disparos).");
                  // Não falha a operação principal
                }
              }
            }
          }
        } catch (appError) {
          console.error("Erro ao criar reunião na agenda do app:", appError);
        }
      }

      // Mensagem padrão quando foi um agendamento normal (Calendário) sem Google
      if (!criarNoGoogleCalendar && criarNoCalendarioApp) {
        toast.success("Agendamento criado com sucesso!");
      }

      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      onOpenChange(false);
      form.reset();
      setTipoCalendario("both");
    } catch (error: any) {
      console.error("Erro ao criar agendamento:", error);
      const errorMsg = error?.message || error?.msg || "Erro desconhecido";
      toast.error(`Erro ao criar agendamento: ${errorMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Agendamento</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem className="relative">
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Nome completo" 
                      onChange={(e) => handleNomeChange(e.target.value)}
                      onFocus={() => {
                        if (!clienteId && field.value.length >= 2) {
                          setShowSuggestions(true);
                        }
                      }}
                    />
                  </FormControl>
                  {showSuggestions && clienteSuggestions.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                      {clienteSuggestions.map((cliente) => (
                        <button
                          key={cliente.id}
                          type="button"
                          className="w-full px-4 py-2 text-left hover:bg-accent hover:text-accent-foreground flex items-center justify-between"
                          onClick={() => handleSelectCliente(cliente)}
                        >
                          <div>
                            <div className="font-medium">{cliente.nome}</div>
                            <div className="text-sm text-muted-foreground">{formatPhone(cliente.telefone)}</div>
                          </div>
                          <Check className="h-4 w-4" />
                        </button>
                      ))}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
                control={form.control}
                name="telefone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <CountryCodeSelect 
                        value={countryCode} 
                        onChange={setCountryCode}
                        phoneValue={formatPhoneByCountry(field.value, countryCode)}
                        onPhoneChange={(val) => field.onChange(stripCountryCode(val, countryCode))}
                        onPhoneBlur={() => {
                          field.onBlur();
                          handleTelefoneBlur();
                        }}
                        placeholder={getPhonePlaceholder(countryCode)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        type="email" 
                        placeholder="email@exemplo.com" 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {tiposAtivos.length > 0 && (
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select 
                      onValueChange={(val) => field.onChange(val === "_none" ? "" : val)} 
                      value={field.value || "_none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o tipo (opcional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="_none">Nenhum</SelectItem>
                        {tiposAtivos.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.nome}>
                            {tipo.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="procedimento_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Procedimento</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o procedimento" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {procedimentos?.filter(p => p.ativo).map((proc) => (
                        <SelectItem key={proc.id} value={proc.id}>
                          {proc.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="data_agendamento"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "dd/MM/yyyy")
                          ) : (
                            <span>Selecione a data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Mostrar profissionais disponíveis com horários */}
            {dataWatch && procedimentoWatch && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FormLabel className="mb-0">Selecione Profissional e Horário</FormLabel>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      <input
                        type="checkbox"
                        checked={mostrarHorarios15min}
                        onChange={(e) => setMostrarHorarios15min(e.target.checked)}
                        className="w-3 h-3 rounded border-muted-foreground/50"
                      />
                      15 min
                    </label>
                  </div>
                  {profissionalWatch && form.watch("hora") && (
                    <span className="text-xs text-primary">
                      ✓ {profissionais?.find(p => p.id === profissionalWatch)?.nome} - {form.watch("hora")}
                    </span>
                  )}
                </div>
                
                {profissionaisDisponiveis.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Carregando disponibilidade...
                  </p>
                ) : profissionaisDisponiveis.every(p => p.horarios.length === 0) ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum profissional disponível nesta data
                  </p>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                    {profissionaisDisponiveis.map(({ profissional, horarios, proximaDataDisponivel }) => (
                      <div key={profissional.id} className="space-y-2">
                        <div className="font-medium text-sm flex items-center gap-2">
                          {profissional.nome}
                          {profissional.especialidade && (
                            <span className="text-xs text-muted-foreground">
                              ({profissional.especialidade})
                            </span>
                          )}
                        </div>
                        
                        {horarios.length === 0 ? (
                          <p className="text-xs text-muted-foreground pl-4">
                            Sem disponibilidade neste dia
                            {proximaDataDisponivel && (
                              <span className="text-primary">
                                {" "}(Próxima data disponível: {format(proximaDataDisponivel, "dd/MM/yyyy")})
                              </span>
                            )}
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2 pl-4">
                            {horarios.map((horario) => {
                              const isSelected = 
                                profissionalWatch === profissional.id && 
                                form.watch("hora") === horario;
                              
                              return (
                                <Button
                                  key={horario}
                                  type="button"
                                  size="sm"
                                  variant={isSelected ? "default" : "outline"}
                                  className="h-8 px-3"
                                  onClick={() => {
                                    form.setValue("profissional_id", profissional.id);
                                    form.setValue("hora", horario);
                                  }}
                                >
                                  {horario}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Campos ocultos para profissional e hora (controlados pelos botões acima) */}
            <FormField
              control={form.control}
              name="profissional_id"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="hora"
              render={({ field }) => (
                <FormItem className="hidden">
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Opção de Calendário - só aparece se feature reuniões habilitada */}
            {reunioesEnabled && (
              <div className="rounded-lg border bg-muted/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCalendarioExpanded(!calendarioExpanded)}
                  className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Video className="h-5 w-5 text-primary" />
                    <div className="text-left space-y-0.5">
                      <Label className="font-medium cursor-pointer">
                        Agendar Reunião
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {tipoCalendario === "both" && "Ambos os Calendários"}
                        {tipoCalendario === "app" && "Apenas aba Calendário"}
                        {tipoCalendario === "google" && "Apenas aba Reuniões"}
                      </p>
                    </div>
                  </div>
                  <ChevronDown className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                    calendarioExpanded && "rotate-180"
                  )} />
                </button>
                
                {calendarioExpanded && (
                  <div className="px-4 pb-4">
                    <RadioGroup
                      value={tipoCalendario}
                      onValueChange={(value) => setTipoCalendario(value as "google" | "app" | "both")}
                      className="space-y-2"
                    >
                      {googleCalendarConnected && (
                        <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                          <RadioGroupItem value="both" id="calendar-both" />
                          <Label htmlFor="calendar-both" className="flex-1 cursor-pointer">
                            <span className="font-medium flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              <CalendarIconSolid className="h-4 w-4" />
                              Ambos os Calendários
                            </span>
                            <p className="text-sm text-muted-foreground">Google Calendar + aba Reuniões + aba Calendário</p>
                          </Label>
                        </div>
                      )}
                      
                      {googleCalendarConnected && (
                        <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                          <RadioGroupItem value="google" id="calendar-google" />
                          <Label htmlFor="calendar-google" className="flex-1 cursor-pointer">
                            <span className="font-medium flex items-center gap-2">
                              <Video className="h-4 w-4" />
                              Apenas aba Reuniões
                            </span>
                            <p className="text-sm text-muted-foreground">Google Calendar + aba Reuniões</p>
                          </Label>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-3 rounded-md border p-3 hover:bg-accent/50 transition-colors">
                        <RadioGroupItem value="app" id="calendar-app" />
                        <Label htmlFor="calendar-app" className="flex-1 cursor-pointer">
                          <span className="font-medium flex items-center gap-2">
                            <CalendarIconSolid className="h-4 w-4" />
                            Apenas aba Calendário
                          </span>
                          <p className="text-sm text-muted-foreground">Apenas aba Calendário</p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}
              </div>
            )}

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Observações sobre o agendamento..."
                      className="resize-none"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Criando..." : "Criar Agendamento"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
