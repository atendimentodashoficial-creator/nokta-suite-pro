import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";

interface CalendarWithMonthSelectProps {
  date: Date;
  onDateChange: (date: Date) => void;
  /** When selecting full month, also update the other date */
  onFullMonthSelect?: (monthStart: Date, monthEnd: Date) => void;
  buttonClassName?: string;
  align?: "start" | "center" | "end";
}

export function CalendarWithMonthSelect({
  date,
  onDateChange,
  onFullMonthSelect,
  buttonClassName = "min-w-[90px]",
  align = "start",
}: CalendarWithMonthSelectProps) {
  const [open, setOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(date);

  // Reset calendar month when popover opens
  useEffect(() => {
    if (open) {
      setCalendarMonth(date);
    }
  }, [open, date]);

  const handleSelectFullMonth = () => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    
    if (onFullMonthSelect) {
      onFullMonthSelect(monthStart, monthEnd);
    } else {
      onDateChange(monthStart);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={buttonClassName}>
          {format(date, "dd/MM/yy", { locale: ptBR })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <div className="p-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-primary hover:text-primary"
            onClick={handleSelectFullMonth}
          >
            Selecionar mês inteiro
          </Button>
        </div>
        <CalendarComponent
          mode="single"
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          selected={date}
          onSelect={(selectedDate) => {
            if (selectedDate) {
              onDateChange(selectedDate);
              setOpen(false);
            }
          }}
          locale={ptBR}
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

interface DateRangeCalendarsProps {
  dateStart: Date;
  dateEnd: Date;
  onDateStartChange: (date: Date) => void;
  onDateEndChange: (date: Date) => void;
  buttonClassName?: string;
}

export function DateRangeCalendars({
  dateStart,
  dateEnd,
  onDateStartChange,
  onDateEndChange,
  buttonClassName = "min-w-[90px]",
}: DateRangeCalendarsProps) {
  const handleFullMonthSelect = (monthStart: Date, monthEnd: Date) => {
    onDateStartChange(monthStart);
    onDateEndChange(monthEnd);
  };

  return (
    <div className="flex items-center gap-2">
      <CalendarWithMonthSelect
        date={dateStart}
        onDateChange={onDateStartChange}
        onFullMonthSelect={handleFullMonthSelect}
        buttonClassName={buttonClassName}
      />
      <span className="text-muted-foreground text-sm">até</span>
      <CalendarWithMonthSelect
        date={dateEnd}
        onDateChange={onDateEndChange}
        onFullMonthSelect={handleFullMonthSelect}
        buttonClassName={buttonClassName}
      />
    </div>
  );
}
