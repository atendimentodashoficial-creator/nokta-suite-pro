import { useState, useEffect } from "react";
import { Calendar } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

export type PeriodValue = 
  | "today" 
  | "yesterday" 
  | "last_7_days" 
  | "last_30_days" 
  | "this_week" 
  | "last_week" 
  | "this_month" 
  | "last_month" 
  | "max" 
  | "custom";

interface PeriodFilterProps {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  dateStart: Date;
  dateEnd: Date;
  onDateStartChange: (date: Date) => void;
  onDateEndChange: (date: Date) => void;
  /** Most pages show "Período:" before the filter (like Agenda). Enable to match that layout. */
  showLabel?: boolean;
  className?: string;
}

export function PeriodFilter({
  value,
  onChange,
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  showLabel = false,
  className,
}: PeriodFilterProps) {
  const [startPopoverOpen, setStartPopoverOpen] = useState(false);
  const [endPopoverOpen, setEndPopoverOpen] = useState(false);
  const [startCalendarMonth, setStartCalendarMonth] = useState<Date>(dateStart);
  const [endCalendarMonth, setEndCalendarMonth] = useState<Date>(dateEnd);

  // Reset calendar month when popover opens
  useEffect(() => {
    if (startPopoverOpen) {
      setStartCalendarMonth(dateStart);
    }
  }, [startPopoverOpen, dateStart]);

  useEffect(() => {
    if (endPopoverOpen) {
      setEndCalendarMonth(dateEnd);
    }
  }, [endPopoverOpen, dateEnd]);

  const handleSelectFullMonth = (calendarMonth: Date) => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
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

      <Select value={value} onValueChange={(v) => onChange(v as PeriodValue)}>
        <SelectTrigger className="w-[180px]">
          <Calendar className="h-4 w-4 mr-2" />
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="today">Hoje</SelectItem>
          <SelectItem value="yesterday">Ontem</SelectItem>
          <SelectItem value="last_7_days">Últimos 7 dias</SelectItem>
          <SelectItem value="last_30_days">Últimos 30 dias</SelectItem>
          <SelectItem value="this_week">Esta semana</SelectItem>
          <SelectItem value="last_week">Semana passada</SelectItem>
          <SelectItem value="this_month">Mês Atual</SelectItem>
          <SelectItem value="last_month">Mês passado</SelectItem>
          <SelectItem value="max">Máximo</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>

      {/* Datas (apenas quando personalizado) */}
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
                  onClick={() => handleSelectFullMonth(startCalendarMonth)}
                >
                  Selecionar mês inteiro
                </Button>
              </div>
              <CalendarComponent
                mode="single"
                month={startCalendarMonth}
                onMonthChange={setStartCalendarMonth}
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
                  onClick={() => handleSelectFullMonth(endCalendarMonth)}
                >
                  Selecionar mês inteiro
                </Button>
              </div>
              <CalendarComponent
                mode="single"
                month={endCalendarMonth}
                onMonthChange={setEndCalendarMonth}
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

// Helper hook for managing period state
export function usePeriodFilter(defaultPeriod: PeriodValue = "this_month") {
  const [periodFilter, setPeriodFilter] = useState<PeriodValue>(defaultPeriod);
  const [dateStart, setDateStart] = useState<Date>(startOfMonth(new Date()));
  const [dateEnd, setDateEnd] = useState<Date>(endOfMonth(new Date()));

  useEffect(() => {
    handlePeriodChange(periodFilter);
  }, [periodFilter]);

  const handlePeriodChange = (value: PeriodValue) => {
    const today = new Date();
    let start: Date;
    let end: Date = today;

    switch (value) {
      case "today":
        start = today;
        break;
      case "yesterday":
        start = subDays(today, 1);
        end = subDays(today, 1);
        break;
      case "last_7_days":
        start = subDays(today, 6);
        break;
      case "last_30_days":
        start = subDays(today, 29);
        break;
      case "this_week":
        start = startOfWeek(today, { weekStartsOn: 0 });
        end = endOfWeek(today, { weekStartsOn: 0 });
        break;
      case "last_week":
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 0 });
        start = lastWeekStart;
        end = endOfWeek(lastWeekStart, { weekStartsOn: 0 });
        break;
      case "this_month":
        start = startOfMonth(today);
        end = endOfMonth(today);
        break;
      case "last_month":
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
      case "max":
        start = new Date(2020, 0, 1);
        end = today;
        break;
      case "custom":
        // Don't change dates for custom - user controls them
        return;
      default:
        start = startOfMonth(today);
        end = endOfMonth(today);
    }

    setDateStart(start);
    setDateEnd(end);
  };

  const filterByPeriod = <T extends { created_at: string }>(items: T[] | undefined): T[] => {
    if (!items) return [];
    
    // Use LOCAL timezone to match how dates are displayed in the UI
    const startOfPeriod = new Date(
      dateStart.getFullYear(),
      dateStart.getMonth(),
      dateStart.getDate(),
      0, 0, 0, 0
    );
    
    const endOfPeriod = new Date(
      dateEnd.getFullYear(),
      dateEnd.getMonth(),
      dateEnd.getDate(),
      23, 59, 59, 999
    );

    return items.filter(item => {
      const itemDate = new Date(item.created_at);
      return itemDate >= startOfPeriod && itemDate <= endOfPeriod;
    });
  };

  return {
    periodFilter,
    setPeriodFilter,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    filterByPeriod,
  };
}
