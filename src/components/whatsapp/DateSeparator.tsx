import { format, isToday, isYesterday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DateSeparatorProps {
  date: string | Date;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const dateObj = typeof date === "string" ? parseISO(date) : date;
  
  let label: string;
  
  if (isToday(dateObj)) {
    label = "Hoje";
  } else if (isYesterday(dateObj)) {
    label = "Ontem";
  } else {
    label = format(dateObj, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  }

  return (
    <div className="flex items-center justify-center my-3">
      <span className="bg-muted/80 text-muted-foreground text-xs px-3 py-1 rounded-full shadow-sm">
        {label}
      </span>
    </div>
  );
}

// Helper function to check if two dates are on different days
export function isDifferentDay(date1: string | Date, date2: string | Date): boolean {
  const d1 = typeof date1 === "string" ? parseISO(date1) : date1;
  const d2 = typeof date2 === "string" ? parseISO(date2) : date2;
  
  return (
    d1.getFullYear() !== d2.getFullYear() ||
    d1.getMonth() !== d2.getMonth() ||
    d1.getDate() !== d2.getDate()
  );
}

// Helper to get the date key for grouping
export function getDateKey(date: string | Date): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "yyyy-MM-dd");
}
