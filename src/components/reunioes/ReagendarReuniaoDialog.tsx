import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias } from "@/hooks/useEscalas";
import { useAgendamentos } from "@/hooks/useAgendamentos";
import { formatInTimeZone } from "date-fns-tz";

interface Reuniao {
  id: string;
  titulo: string;
  data_reuniao: string;
  procedimento_id?: string | null;
  profissional_id?: string | null;
  observacoes?: string | null;
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
  procedimento_id: z.string().min(1, "Selecione um procedimento"),
  profissional_id: z.string().min(1, "Selecione um profissional e horário"),
  observacoes: z.string().max(500).optional(),
});

type ReagendamentoFormData = z.infer<typeof reagendamentoSchema>;

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

const calcularProximaDataDisponivel = (
  profissionalId: string,
  dataInicial: Date,
  escalas: any[] | undefined,
  ausencias: any[] | undefined,
  agendamentos: any[] | undefined,
  reunioes: any[] | undefined,
  tempoAtendimento: number = 60
): Date | null => {
  if (!escalas) return null;
  
  const escalasProfissional = escalas.filter(e => e.profissional_id === profissionalId && e.ativo);
  if (escalasProfissional.length === 0) return null;
  
  const ausenciasProfissional = ausencias?.filter(a => a.profissional_id === profissionalId) || [];
  const agendamentosProfissional = agendamentos?.filter(
    a => a.profissional_id === profissionalId && a.status !== "cancelado"
  ) || [];
  const reunioesProfissional = reunioes?.filter(
    r => r.profissional_id === profissionalId && r.status !== "cancelada"
  ) || [];
  
  for (let i = 1; i <= 60; i++) {
    const dataTest = new Date(dataInicial);
    dataTest.setDate(dataTest.getDate() + i);
    const diaSemana = dataTest.getDay();
    const dataStr = format(dataTest, 'yyyy-MM-dd');
    
    const temEscala = escalasProfissional.some(e => e.dia_semana === diaSemana);
    if (!temEscala) continue;
    
    const estaAusente = ausenciasProfissional.some(aus => {
      return dataStr >= aus.data_inicio && dataStr <= aus.data_fim;
    });
    if (estaAusente) continue;
    
    const horariosDay: string[] = [];
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
    
    const horariosOcupadosAg = agendamentosProfissional
      .filter(ag => {
        const agData = formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
        return agData === dataStr;
      })
      .map(ag => formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm'));
    
    const horariosOcupadosReu = reunioesProfissional
      .filter(r => {
        const rData = formatInTimeZone(r.data_reuniao as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
        return rData === dataStr;
      })
      .map(r => formatInTimeZone(r.data_reuniao as any, 'America/Sao_Paulo', 'HH:mm'));
    
    const horariosOcupados = [...horariosOcupadosAg, ...horariosOcupadosReu];
    const horariosLivres = [...new Set(horariosDay)].filter(h => !horariosOcupados.includes(h));
    
    if (horariosLivres.length > 0) {
      return dataTest;
    }
  }
  
  return null;
};

export function ReagendarReuniaoDialog({ reuniao, open, onOpenChange }: ReagendarReuniaoDialogProps) {
  const queryClient = useQueryClient();
  const { data: procedimentos } = useProcedimentos();
  const { data: profissionais } = useProfissionais();
  const { data: todosAgendamentos } = useAgendamentos();
  const { data: escalas } = useEscalas();
  const { data: ausencias } = useAusencias();
  const [todasReunioes, setTodasReunioes] = useState<any[]>([]);

  // Buscar reuniões para verificar ocupação
  useEffect(() => {
    const fetchReunioes = async () => {
      const { data } = await supabase
        .from('reunioes')
        .select('id, data_reuniao, profissional_id, status')
        .neq('status', 'cancelada');
      setTodasReunioes(data || []);
    };
    if (open) fetchReunioes();
  }, [open]);

  const form = useForm<ReagendamentoFormData>({
    resolver: zodResolver(reagendamentoSchema),
    defaultValues: {
      hora: "",
      procedimento_id: "",
      profissional_id: "",
      observacoes: "",
    },
  });

  // Reset form quando reunião mudar
  useEffect(() => {
    if (reuniao && open) {
      form.reset({
        data_reuniao: undefined,
        hora: "",
        procedimento_id: reuniao.procedimento_id || "",
        profissional_id: reuniao.profissional_id || "",
        observacoes: reuniao.observacoes || "",
      });
    }
  }, [reuniao, open, form]);

  const dataWatch = form.watch("data_reuniao");
  const profissionalWatch = form.watch("profissional_id");
  const procedimentoWatch = form.watch("procedimento_id");

  // Obter tempo de atendimento do procedimento selecionado
  const tempoAtendimento = useMemo(() => {
    if (!procedimentoWatch) return 60;
    const proc = procedimentos?.find(p => p.id === procedimentoWatch);
    return proc?.tempo_atendimento_minutos || proc?.duracao_minutos || 60;
  }, [procedimentoWatch, procedimentos]);

  // Calcular profissionais disponíveis com seus horários
  const profissionaisDisponiveis = useMemo(() => {
    if (!dataWatch || !procedimentoWatch) return [];
    
    const diaSemana = dataWatch.getDay();
    const dataStr = format(dataWatch, 'yyyy-MM-dd');
    
    return profissionais?.filter(p => p.ativo).map(prof => {
      const escalasProfissional = escalas?.filter(
        e => e.profissional_id === prof.id && e.dia_semana === diaSemana && e.ativo
      ) || [];
      
      const ausenciasProfissional = ausencias?.filter(a => a.profissional_id === prof.id) || [];
      const estaAusente = ausenciasProfissional.some(aus => {
        return dataStr >= aus.data_inicio && dataStr <= aus.data_fim;
      });
      
      const todosHorarios: string[] = [];
      if (!estaAusente && escalasProfissional.length > 0) {
        escalasProfissional.forEach(escala => {
          const horariosIntervalo = gerarHorariosIntervalo(
            escala.hora_inicio,
            escala.hora_fim,
            tempoAtendimento
          );
          todosHorarios.push(...horariosIntervalo);
        });
      }
      
      // Horários ocupados por agendamentos
      const horariosOcupadosAg = todosAgendamentos
        ?.filter(ag => {
          if (ag.profissional_id !== prof.id) return false;
          if (ag.status === "cancelado") return false;
          const agData = formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
          return agData === dataStr;
        })
        .map(ag => formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm')) || [];
      
      // Horários ocupados por reuniões (excluindo a própria reunião)
      const horariosOcupadosReu = todasReunioes
        ?.filter(r => {
          if (r.profissional_id !== prof.id) return false;
          if (reuniao && r.id === reuniao.id) return false; // Excluir a própria reunião
          const rData = formatInTimeZone(r.data_reuniao as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
          return rData === dataStr;
        })
        .map(r => formatInTimeZone(r.data_reuniao as any, 'America/Sao_Paulo', 'HH:mm')) || [];
      
      const horariosOcupados = [...horariosOcupadosAg, ...horariosOcupadosReu];
      const horariosLivres = [...new Set(todosHorarios)]
        .filter(h => !horariosOcupados.includes(h))
        .sort();
      
      let proximaData: Date | null = null;
      if (horariosLivres.length === 0) {
        proximaData = calcularProximaDataDisponivel(
          prof.id,
          dataWatch,
          escalas,
          ausencias,
          todosAgendamentos,
          todasReunioes,
          tempoAtendimento
        );
      }
      
      return {
        profissional: prof,
        horarios: horariosLivres,
        proximaDataDisponivel: proximaData,
      };
    }) || [];
  }, [dataWatch, procedimentoWatch, profissionais, escalas, ausencias, todosAgendamentos, todasReunioes, tempoAtendimento, reuniao]);

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
          procedimentoId: data.procedimento_id || null,
          profissionalId: data.profissional_id || null,
          observacoes: data.observacoes || null,
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reagendar Reunião</DialogTitle>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Reunião: <span className="font-medium text-foreground">{reuniao.titulo}</span>
            </p>
            {reuniao.profissional_id && profissionais && (
              <p className="text-sm text-muted-foreground">
                Profissional atual: <span className="font-medium text-foreground">
                  {profissionais.find(p => p.id === reuniao.profissional_id)?.nome || "—"}
                </span>
                <span className="text-xs ml-2 text-primary">(você pode trocar abaixo)</span>
              </p>
            )}
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

            {/* Mostrar profissionais disponíveis com horários */}
            {dataWatch && procedimentoWatch && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>Selecione Profissional e Horário</FormLabel>
                  {profissionalWatch && form.watch("hora") && (
                    <span className="text-xs text-primary font-medium">
                      ✓ {profissionais?.find(p => p.id === profissionalWatch)?.nome} às {form.watch("hora")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  Clique em um horário para selecionar o profissional e horário desejado
                </p>
                
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

            {/* Campos ocultos */}
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

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Observações sobre a reunião..."
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
