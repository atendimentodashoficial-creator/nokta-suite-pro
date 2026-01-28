import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias } from "@/hooks/useEscalas";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { formatInTimeZone } from "date-fns-tz";
import { buildCandidateStartTimes, rangesOverlap, timeToMinutes, type MinuteRange, type TimeRange } from "@/utils/timeSlots";

interface Reuniao {
  id: string;
  titulo: string;
  data_reuniao: string;
  profissional_id?: string | null;
  duracao_minutos?: number | null;
}

interface ReagendarReuniaoDialogProps {
  reuniao: Reuniao | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const reagendamentoSchema = z.object({
  data_reuniao: z.date({
    required_error: "Data é obrigatória",
  }),
  hora: z.string().min(1, "Selecione um horário"),
  profissional_id: z.string().min(1, "Selecione um profissional"),
});

type ReagendamentoFormData = z.infer<typeof reagendamentoSchema>;

const gerarHorariosIntervalo = (
  horaInicio: string,
  horaFim: string,
  intervaloMinutos: number = 30
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

export function ReagendarReuniaoDialog({ reuniao, open, onOpenChange }: ReagendarReuniaoDialogProps) {
  const queryClient = useQueryClient();
  const { data: profissionais } = useProfissionais();
  const { data: todosAgendamentos } = useAgendamentos();
  const { data: procedimentos } = useProcedimentos();
  const { data: escalas } = useEscalas();
  const { data: ausencias } = useAusencias();
  const [todasReunioes, setTodasReunioes] = useState<any[]>([]);
  // Opção para mostrar horários de 15 em 15 min
  const [mostrarHorarios15min, setMostrarHorarios15min] = useState(false);

  // Buscar reuniões para verificar ocupação
  useEffect(() => {
    const fetchReunioes = async () => {
      const { data } = await supabase
        .from('reunioes')
        .select('id, data_reuniao, profissional_id, status, duracao_minutos')
        .neq('status', 'cancelada');
      setTodasReunioes(data || []);
    };
    if (open) fetchReunioes();
  }, [open]);

  const form = useForm<ReagendamentoFormData>({
    resolver: zodResolver(reagendamentoSchema),
    defaultValues: {
      hora: "",
      profissional_id: "",
    },
  });

  // Reset form quando reunião mudar - pré-selecionar o profissional atual
  useEffect(() => {
    if (reuniao && open) {
      form.reset({
        data_reuniao: undefined,
        hora: "",
        profissional_id: reuniao.profissional_id || "",
      });
    }
  }, [reuniao, open, form]);

  const dataWatch = form.watch("data_reuniao");
  const profissionalWatch = form.watch("profissional_id");

  // Duração da reunião (padrão 30 min se não definida)
  const duracaoReuniao = reuniao?.duracao_minutos || 30;
  
  // Intervalo efetivo para geração de horários
  const intervaloMinutos = mostrarHorarios15min ? 15 : duracaoReuniao;

  // Calcular horários disponíveis para o profissional selecionado
  const horariosDisponiveis = useMemo(() => {
    if (!dataWatch || !profissionalWatch) return [];
    
    const diaSemana = dataWatch.getDay();
    const dataStr = format(dataWatch, 'yyyy-MM-dd');
    
    // Verificar escalas do profissional
    const escalasProfissional = escalas?.filter(
      e => e.profissional_id === profissionalWatch && e.dia_semana === diaSemana && e.ativo
    ) || [];
    
    // Verificar ausências
    const ausenciasProfissional = ausencias?.filter(a => a.profissional_id === profissionalWatch) || [];
    const estaAusente = ausenciasProfissional.some(aus => {
      return dataStr >= aus.data_inicio && dataStr <= aus.data_fim;
    });
    
    if (estaAusente || escalasProfissional.length === 0) return [];
    
    const windows: TimeRange[] = escalasProfissional.map((e) => ({
      start: e.hora_inicio,
      end: e.hora_fim,
    }));

    // slots candidatos respeitam o fim da escala e a duração da reunião
    const candidatos = buildCandidateStartTimes(windows, intervaloMinutos, duracaoReuniao);

    const busy: MinuteRange[] = [];

    // Agendamentos existentes
    todosAgendamentos
      ?.filter((ag) => {
        if (ag.profissional_id !== profissionalWatch) return false;
        if (ag.status === "cancelado") return false;
        const agData = formatInTimeZone(ag.data_agendamento as any, "America/Sao_Paulo", "yyyy-MM-dd");
        return agData === dataStr;
      })
      .forEach((ag) => {
        const startStr = formatInTimeZone(ag.data_agendamento as any, "America/Sao_Paulo", "HH:mm");
        const startMin = timeToMinutes(startStr);
        const procDuracao =
          procedimentos?.find((p) => p.id === ag.procedimento_id)?.tempo_atendimento_minutos ||
          procedimentos?.find((p) => p.id === ag.procedimento_id)?.duracao_minutos ||
          60;
        busy.push({ startMin, endMin: startMin + procDuracao });
      });

    // Reuniões existentes (exceto a própria)
    todasReunioes
      ?.filter((r) => {
        if (r.profissional_id !== profissionalWatch) return false;
        if (reuniao && r.id === reuniao.id) return false;
        const rData = formatInTimeZone(r.data_reuniao as any, "America/Sao_Paulo", "yyyy-MM-dd");
        return rData === dataStr;
      })
      .forEach((r) => {
        const startStr = formatInTimeZone(r.data_reuniao as any, "America/Sao_Paulo", "HH:mm");
        const startMin = timeToMinutes(startStr);
        const dur = r.duracao_minutos || 30;
        busy.push({ startMin, endMin: startMin + dur });
      });

    return candidatos
      .filter((hhmm) => {
        const startMin = timeToMinutes(hhmm);
        const candidateRange: MinuteRange = { startMin, endMin: startMin + duracaoReuniao };
        return !busy.some((b) => rangesOverlap(candidateRange, b));
      })
      .sort();
  }, [dataWatch, profissionalWatch, escalas, ausencias, todosAgendamentos, procedimentos, todasReunioes, reuniao, intervaloMinutos]);

  const reagendarMutation = useMutation({
    mutationFn: async (data: ReagendamentoFormData) => {
      if (!reuniao) throw new Error("Dados incompletos");

      const [hours, minutes] = data.hora.split(":").map(Number);
      const newDate = new Date(data.data_reuniao);
      newDate.setHours(hours, minutes, 0, 0);

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error("Usuário não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke("google-calendar-update-event", {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: { 
          reuniaoId: reuniao.id,
          novaDataHora: newDate.toISOString(),
          profissionalId: data.profissional_id || null,
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      if (data?.warning) {
        toast.warning(data.warning);
      } else {
        toast.success("Reunião reagendada com sucesso!");
      }
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao reagendar:", error);
      toast.error(error instanceof Error ? error.message : "Erro ao reagendar reunião");
    },
  });

  const onSubmit = (data: ReagendamentoFormData) => {
    reagendarMutation.mutate(data);
  };

  if (!reuniao) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reagendar Reunião</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Reunião: <span className="font-medium text-foreground">{reuniao.titulo}</span>
          </p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="profissional_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profissional</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o profissional" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {profissionais?.filter(p => p.ativo).map((prof) => (
                        <SelectItem key={prof.id} value={prof.id}>
                          {prof.nome}
                          {prof.especialidade && ` (${prof.especialidade})`}
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
              name="data_reuniao"
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

            {/* Mostrar horários disponíveis */}
            {dataWatch && profissionalWatch && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FormLabel className="mb-0">Horário</FormLabel>
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
                  {form.watch("hora") && (
                    <span className="text-xs text-primary font-medium">
                      ✓ {form.watch("hora")} selecionado
                    </span>
                  )}
                </div>
                
                {horariosDisponiveis.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg bg-muted/20">
                    Sem disponibilidade nesta data para este profissional
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 border rounded-lg p-3 bg-muted/20 max-h-[200px] overflow-y-auto">
                    {horariosDisponiveis.map((horario) => {
                      const isSelected = form.watch("hora") === horario;
                      
                      return (
                        <Button
                          key={horario}
                          type="button"
                          size="sm"
                          variant={isSelected ? "default" : "outline"}
                          className="h-8 px-3"
                          onClick={() => form.setValue("hora", horario)}
                        >
                          {horario}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Campo oculto para hora */}
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

            <div className="flex gap-2 justify-end pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={reagendarMutation.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={reagendarMutation.isPending}>
                {reagendarMutation.isPending ? "Reagendando..." : "Reagendar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
