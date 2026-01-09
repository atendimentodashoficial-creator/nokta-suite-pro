import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Agendamento, useAgendamentos } from "@/hooks/useAgendamentos";
import { formatInTimeZone } from "date-fns-tz";

// Gerar horários de 15 em 15 minutos
const gerarHorarios = () => {
  const horarios = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hora = h.toString().padStart(2, '0');
      const minuto = m.toString().padStart(2, '0');
      horarios.push(`${hora}:${minuto}`);
    }
  }
  return horarios;
};

const agendamentoSchema = z.object({
  status: z.enum(["agendado", "confirmado", "cancelado", "realizado"]),
  data_agendamento: z.date({
    required_error: "Data e hora são obrigatórias",
  }),
  hora: z.string().min(1, "Hora é obrigatória"),
  observacoes: z.string().max(500).optional(),
});

type AgendamentoFormData = z.infer<typeof agendamentoSchema>;

interface EditarAgendamentoDialogProps {
  agendamento: Agendamento;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditarAgendamentoDialog({
  agendamento,
  open,
  onOpenChange,
}: EditarAgendamentoDialogProps) {
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dataOriginal] = useState(new Date(agendamento.data_agendamento));
  const { data: todosAgendamentos } = useAgendamentos();

  const form = useForm<AgendamentoFormData>({
    resolver: zodResolver(agendamentoSchema),
    defaultValues: {
      status: agendamento.status,
      data_agendamento: new Date(agendamento.data_agendamento),
      hora: format(new Date(agendamento.data_agendamento), "HH:mm"),
      observacoes: agendamento.observacoes || "",
    },
  });

  const dataWatch = form.watch("data_agendamento");
  
  // Calcular horários ocupados para o profissional e data selecionados
  const horariosOcupados = todosAgendamentos
    ?.filter(ag => {
      if (!dataWatch || !agendamento.profissional_id) return false;
      if (ag.id === agendamento.id) return false; // Não considerar o próprio agendamento
      if (ag.profissional_id !== agendamento.profissional_id) return false;
      if (ag.status === "cancelado") return false;
      const agData = formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'yyyy-MM-dd');
      const selData = format(dataWatch, 'yyyy-MM-dd');
      return agData === selData;
    })
    .map(ag => formatInTimeZone(ag.data_agendamento as any, 'America/Sao_Paulo', 'HH:mm')) || [];

  const horariosDisponiveis = gerarHorarios();

  // Resetar form quando o agendamento mudar
  useEffect(() => {
    if (agendamento) {
      form.reset({
        status: agendamento.status,
        data_agendamento: new Date(agendamento.data_agendamento),
        hora: format(new Date(agendamento.data_agendamento), "HH:mm"),
        observacoes: agendamento.observacoes || "",
      });
    }
  }, [agendamento, form]);

  const updateAgendamento = useMutation({
    mutationFn: async (data: AgendamentoFormData) => {
      // Combinar data e hora (o navegador já está em GMT-3, não precisa ajustar)
      const [hora, minuto] = data.hora.split(":").map(Number);
      const dataHora = new Date(data.data_agendamento);
      dataHora.setHours(hora, minuto, 0, 0);

      // Verificar se a data foi alterada
      const dataFoiAlterada = dataHora.getTime() !== dataOriginal.getTime();

      const updateData: any = {
        status: data.status,
        data_agendamento: dataHora.toISOString(),
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agendamentos"] });
      toast.success("Agendamento atualizado com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao atualizar agendamento:", error);
      toast.error("Erro ao atualizar agendamento");
    },
  });

  const onSubmit = async (data: AgendamentoFormData) => {
    setIsSubmitting(true);
    try {
      await updateAgendamento.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar Agendamento
            {agendamento.numero_reagendamentos > 0 && (
              <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/20">
                Reagendado {agendamento.numero_reagendamentos}x
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="agendado">Agendado</SelectItem>
                      <SelectItem value="confirmado">Confirmado</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                      <SelectItem value="realizado">Realizado</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="data_agendamento"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data *</FormLabel>
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
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hora"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hora *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o horário" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent className="max-h-[300px]">
                        {horariosDisponiveis.map((horario) => {
                          const ocupado = horariosOcupados.includes(horario);
                          return (
                            <SelectItem 
                              key={horario} 
                              value={horario}
                              disabled={ocupado}
                            >
                              {horario} {ocupado && "(Ocupado)"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
