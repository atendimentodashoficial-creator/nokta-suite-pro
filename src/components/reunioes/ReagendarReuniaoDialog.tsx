import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

export function ReagendarReuniaoDialog({ reuniao, open, onOpenChange }: ReagendarReuniaoDialogProps) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date | undefined>(
    reuniao ? new Date(reuniao.data_reuniao) : undefined
  );
  const [hora, setHora] = useState<string>(
    reuniao ? format(new Date(reuniao.data_reuniao), "HH:mm") : "09:00"
  );

  const reagendarMutation = useMutation({
    mutationFn: async () => {
      if (!reuniao || !date) throw new Error("Dados incompletos");

      const [hours, minutes] = hora.split(":").map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);

      const { error } = await supabase
        .from("reunioes" as any)
        .update({
          data_reuniao: newDate.toISOString(),
          status: "agendado",
        })
        .eq("id", reuniao.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reunioes"] });
      toast.success("Reunião reagendada com sucesso!");
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Erro ao reagendar:", error);
      toast.error("Erro ao reagendar reunião");
    },
  });

  // Gerar horários disponíveis (06:00 às 22:00)
  const horarios = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hora = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      horarios.push(hora);
    }
  }

  if (!reuniao) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Reagendar Reunião</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {reuniao.titulo}
          </p>

          {/* Seletor de Data */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Nova Data</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  locale={ptBR}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Seletor de Horário */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Novo Horário</label>
            <Select value={hora} onValueChange={setHora}>
              <SelectTrigger>
                <Clock className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Selecione um horário" />
              </SelectTrigger>
              <SelectContent>
                {horarios.map((h) => (
                  <SelectItem key={h} value={h}>
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => reagendarMutation.mutate()}
            disabled={!date || reagendarMutation.isPending}
          >
            {reagendarMutation.isPending ? "Reagendando..." : "Reagendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
