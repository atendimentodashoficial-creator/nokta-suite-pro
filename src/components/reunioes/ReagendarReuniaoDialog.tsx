import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Clock } from "lucide-react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Reuniao {
  id: string;
  titulo: string;
  data_reuniao: string;
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
});

type ReagendamentoFormData = z.infer<typeof reagendamentoSchema>;

// Gerar horários disponíveis (06:00 às 22:00)
const gerarHorarios = () => {
  const horarios: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hora = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      horarios.push(hora);
    }
  }
  return horarios;
};

const horarios = gerarHorarios();

export function ReagendarReuniaoDialog({ reuniao, open, onOpenChange }: ReagendarReuniaoDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<ReagendamentoFormData>({
    resolver: zodResolver(reagendamentoSchema),
    defaultValues: {
      hora: "",
    },
  });

  // Reset form quando reunião mudar
  useEffect(() => {
    if (reuniao && open) {
      const dataReuniao = new Date(reuniao.data_reuniao);
      form.reset({
        data_reuniao: dataReuniao,
        hora: format(dataReuniao, "HH:mm"),
      });
    }
  }, [reuniao, open, form]);

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
              name="data_reuniao"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Nova Data</FormLabel>
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
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? (
                            format(field.value, "dd/MM/yyyy", { locale: ptBR })
                          ) : (
                            <span>Selecione a data</span>
                          )}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        locale={ptBR}
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
                  <FormLabel>Novo Horário</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <Clock className="mr-2 h-4 w-4" />
                        <SelectValue placeholder="Selecione um horário" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {horarios.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={reagendarMutation.isPending}
              >
                {reagendarMutation.isPending ? "Reagendando..." : "Reagendar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}