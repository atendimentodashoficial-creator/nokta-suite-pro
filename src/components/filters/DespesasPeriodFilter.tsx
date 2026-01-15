import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export type DespesasPeriodValue = 
  | "jan" | "feb" | "mar" | "apr" | "may" | "jun"
  | "jul" | "aug" | "sep" | "oct" | "nov" | "dec"
  | "custom";

interface DespesasPeriodFilterProps {
  value: DespesasPeriodValue;
  onChange: (value: DespesasPeriodValue) => void;
  dateStart: Date;
  dateEnd: Date;
  onDateStartChange: (date: Date) => void;
  onDateEndChange: (date: Date) => void;
  showLabel?: boolean;
  className?: string;
}

const monthNames: Record<string, string> = {
  jan: "Janeiro",
  feb: "Fevereiro",
  mar: "Março",
  apr: "Abril",
  may: "Maio",
  jun: "Junho",
  jul: "Julho",
  aug: "Agosto",
  sep: "Setembro",
  oct: "Outubro",
  nov: "Novembro",
  dec: "Dezembro",
};

const monthIndexMap: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function DespesasPeriodFilter({
  value,
  onChange,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  showLabel = false,
  className,
}: DespesasPeriodFilterProps) {
  const [startPopoverOpen, setStartPopoverOpen] = useState(false);
  const [endPopoverOpen, setEndPopoverOpen] = useState(false);

  const getDisplayValue = () => {
    if (value === "custom") return "Personalizado";
    if (monthNames[value]) return monthNames[value];
    return "Selecionar";
  };

  const handleSelectFullMonth = (baseDate: Date) => {
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);
    onDateStartChange(monthStart);
    onDateEndChange(monthEnd);
    setStartPopoverOpen(false);
    setEndPopoverOpen(false);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ""}`.trim()}>
      {showLabel && (
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Período:
        </span>
      )}

      <Select value={value} onValueChange={(v) => onChange(v as DespesasPeriodValue)}>
        <SelectTrigger className="w-[180px]">
          <Calendar className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Período">{getDisplayValue()}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="jan">Janeiro</SelectItem>
          <SelectItem value="feb">Fevereiro</SelectItem>
          <SelectItem value="mar">Março</SelectItem>
          <SelectItem value="apr">Abril</SelectItem>
          <SelectItem value="may">Maio</SelectItem>
          <SelectItem value="jun">Junho</SelectItem>
          <SelectItem value="jul">Julho</SelectItem>
          <SelectItem value="aug">Agosto</SelectItem>
          <SelectItem value="sep">Setembro</SelectItem>
          <SelectItem value="oct">Outubro</SelectItem>
          <SelectItem value="nov">Novembro</SelectItem>
          <SelectItem value="dec">Dezembro</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {value === "custom" && (
        <div className="flex items-center gap-2 basis-full sm:basis-auto">
          <Popover open={startPopoverOpen} onOpenChange={setStartPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[90px]">
                {format(dateStart, "dd/MM/yy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-2 border-b">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-primary hover:text-primary"
                  onClick={() => handleSelectFullMonth(dateStart)}
                >
                  Selecionar mês inteiro
                </Button>
              </div>
              <CalendarComponent
                mode="single"
                selected={dateStart}
                onSelect={(date) => {
                  if (date) {
                    onDateStartChange(date);
                    setStartPopoverOpen(false);
                  }
                }}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground text-sm">até</span>

          <Popover open={endPopoverOpen} onOpenChange={setEndPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[90px]">
                {format(dateEnd, "dd/MM/yy", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-2 border-b">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs text-primary hover:text-primary"
                  onClick={() => handleSelectFullMonth(dateEnd)}
                >
                  Selecionar mês inteiro
                </Button>
              </div>
              <CalendarComponent
                mode="single"
                selected={dateEnd}
                onSelect={(date) => {
                  if (date) {
                    onDateEndChange(date);
                    setEndPopoverOpen(false);
                  }
                }}
                locale={ptBR}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

// Helper hook for managing despesas period state
export function useDespesasPeriodFilter() {
  // Default to current month
  const currentMonth = new Date().getMonth();
  const monthKeys = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const defaultPeriod = monthKeys[currentMonth] as DespesasPeriodValue;

  const [periodFilter, setPeriodFilter] = useState<DespesasPeriodValue>(defaultPeriod);
  const [dateStart, setDateStart] = useState<Date>(startOfMonth(new Date()));
  const [dateEnd, setDateEnd] = useState<Date>(endOfMonth(new Date()));

  useEffect(() => {
    handlePeriodChange(periodFilter);
  }, [periodFilter]);

  const handlePeriodChange = (value: DespesasPeriodValue) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    let start: Date;
    let end: Date;

    if (value === "custom") {
      // Don't change dates for custom
      return;
    } else if (monthIndexMap[value] !== undefined) {
      const monthIndex = monthIndexMap[value];
      start = startOfMonth(new Date(currentYear, monthIndex, 1));
      end = endOfMonth(new Date(currentYear, monthIndex, 1));
    } else {
      start = startOfMonth(today);
      end = endOfMonth(today);
    }

    setDateStart(start);
    setDateEnd(end);
  };

  return {
    periodFilter,
    setPeriodFilter,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
  };
}
