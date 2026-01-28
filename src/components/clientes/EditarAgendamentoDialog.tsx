import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Agendamento, useAgendamentos } from "@/hooks/useAgendamentos";
import { useProcedimentos } from "@/hooks/useProcedimentos";
import { useProfissionais } from "@/hooks/useProfissionais";
import { useEscalas, useAusencias } from "@/hooks/useEscalas";
import { useTiposAgendamento } from "@/hooks/useTiposAgendamento";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { formatInTimeZone } from "date-fns-tz";
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

const editarAgendamentoSchema = z.object({
  data_agendamento: z.date({
    required_error: "Data é obrigatória",
  }),
  hora: z.string().min(1, "Selecione um horário"),
  tipo: z.string().optional(),
  procedimento_id: z.string().min(1, "Selecione um procedimento"),
  profissional_id: z.string().min(1, "Selecione um profissional e horário"),
  observacoes: z.string().max(500).optional(),
});

type EditarAgendamentoFormData = z.infer<typeof editarAgendamentoSchema>;

interface EditarAgendamentoDialogProps {
  agendamento: Agendamento & {
    leads?: { nome?: string; telefone?: string };
    procedimentos?: { nome?: string };
    profissionais?: { nome?: string };
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarAgendamentoDialog({
  agendamento,
  open,
  onOpenChange,
}: EditarAgendamentoDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataOriginal] = useState(new Date(agendamento.data_agendamento));
  const queryClient = useQueryClient();
  const { data: procedimentos } = useProcedimentos();
  const { data: profissionais } = useProfissionais();
  const { data: todosAgendamentos } = useAgendamentos();
  const { data: escalas } = useEscalas();
  const { data: ausencias } = useAusencias();
  const { tiposAtivos } = useTiposAgendamento();

  // Buscar reuniões para verificar conflitos com agendamentos
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

  const form = useForm<EditarAgendamentoFormData>({
    resolver: zodResolver(editarAgendamentoSchema),
    defaultValues: {
      hora: format(new Date(agendamento.data_agendamento), "HH:mm"),
      tipo: agendamento.tipo || "",
      procedimento_id: agendamento.procedimento_id || "",
      profissional_id: agendamento.profissional_id || "",
      observacoes: agendamento.observacoes || "",
      data_agendamento: new Date(agendamento.data_agendamento),
    },
  });

  // Reset form quando agendamento mudar
  useEffect(() => {
    if (agendamento && open) {
      form.reset({
        data_agendamento: new Date(agendamento.data_agendamento),
        hora: format(new Date(agendamento.data_agendamento), "HH:mm"),
        tipo: agendamento.tipo || "",
        procedimento_id: agendamento.procedimento_id || "",
        profissional_id: agendamento.profissional_id || "",
        observacoes: agendamento.observacoes || "",
      });
    }
  }, [agendamento, open, form]);

  const dataWatch = form.watch("data_agendamento");
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
      
      if (estaAusente || escalasProfissional.length === 0) {
        return {
          profissional: prof,
          horarios: [],
          proximaDataDisponivel: calcularProximaDataDisponivel(
            prof.id,
            dataWatch,
            escalas,
            ausencias,
            todosAgendamentos,
            tempoAtendimento
          ),
        };
      }

      const windows: TimeRange[] = escalasProfissional.map((e) => ({
        start: e.hora_inicio,
        end: e.hora_fim,
      }));

      const candidatos = buildCandidateStartTimes(windows, tempoAtendimento, tempoAtendimento);

      const busy: MinuteRange[] = [];

      // Agendamentos existentes
      todosAgendamentos
        ?.filter((ag) => {
          if (ag.profissional_id !== prof.id) return false;
          if (ag.status === "cancelado") return false;
          if (ag.id === agendamento.id) return false;
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

      // Reuniões existentes
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
  }, [dataWatch, procedimentoWatch, profissionais, escalas, ausencias, todosAgendamentos, reunioes, tempoAtendimento, agendamento]);

  const onSubmit = async (data: EditarAgendamentoFormData) => {
    setIsSubmitting(true);
    try {
      const [hora, minuto] = data.hora.split(":").map(Number);
      const dataHora = new Date(data.data_agendamento);
      dataHora.setHours(hora, minuto, 0, 0);

      // Verificar se a data foi alterada
      const dataFoiAlterada = dataHora.getTime() !== dataOriginal.getTime();

      const updateData: any = {
        tipo: data.tipo || null,
        data_agendamento: dataHora.toISOString(),
        procedimento_id: data.procedimento_id || null,
        profissional_id: data.profissional_id || null,
        observacoes: data.observacoes || null,
      };

      // Incrementar contador de reagendamentos se a data foi alterada
      if (dataFoiAlterada) {
        updateData.numero_reagendamentos = (agendamento.numero_reagendamentos || 0) + 1;
      }

      const { error } = await supabase
        .from("agendamentos")
        .update(updateData)
        .eq("id", agendamento.id);

      if (error) throw error;

      toast.success("Agendamento atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar agendamento:", error);
      toast.error("Erro ao atualizar agendamento");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar Agendamento
            {agendamento.numero_reagendamentos > 0 && (
              <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/20">
                Reagendado {agendamento.numero_reagendamentos}x
              </Badge>
            )}
          </DialogTitle>
          {agendamento && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Cliente: <span className="font-medium text-foreground">{agendamento.leads?.nome}</span>
              </p>
              {agendamento.profissional_id && profissionais && (
                <p className="text-sm text-muted-foreground">
                  Profissional atual: <span className="font-medium text-foreground">
                    {profissionais.find(p => p.id === agendamento.profissional_id)?.nome || "—"}
                  </span>
                  <span className="text-xs ml-2 text-primary">(você pode trocar abaixo)</span>
                </p>
              )}
            </div>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

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
                          <div className="flex flex-wrap gap-1.5 pl-4">
                            {horarios.map(hora => {
                              const isSelected = profissionalWatch === profissional.id && form.watch("hora") === hora;
                              return (
                                <Button
                                  key={hora}
                                  type="button"
                                  variant={isSelected ? "default" : "outline"}
                                  size="sm"
                                  className={cn(
                                    "h-7 text-xs px-2",
                                    isSelected && "ring-2 ring-primary ring-offset-1"
                                  )}
                                  onClick={() => {
                                    form.setValue("profissional_id", profissional.id);
                                    form.setValue("hora", hora);
                                  }}
                                >
                                  {hora}
                                </Button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Hidden fields para validação */}
                <FormField
                  control={form.control}
                  name="profissional_id"
                  render={() => (
                    <FormItem className="hidden">
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hora"
                  render={() => (
                    <FormItem className="hidden">
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                {isSubmitting ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
