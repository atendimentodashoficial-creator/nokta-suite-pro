import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";

// Timezone padrão do sistema - Brasília
export const TIMEZONE_BRASILIA = "America/Sao_Paulo";

/**
 * Retorna a data/hora atual no horário de Brasília
 */
export const nowInBrasilia = (): Date => {
  return toZonedTime(new Date(), TIMEZONE_BRASILIA);
};

/**
 * Converte uma data UTC para o horário de Brasília
 */
export const toZonedBrasilia = (date: Date | string): Date => {
  const d = typeof date === "string" ? new Date(date) : date;
  return toZonedTime(d, TIMEZONE_BRASILIA);
};

/**
 * Converte uma data no horário de Brasília para UTC
 */
export const fromZonedBrasilia = (date: Date | string): Date => {
  const d = typeof date === "string" ? new Date(date) : date;
  return fromZonedTime(d, TIMEZONE_BRASILIA);
};

/**
 * Formata uma data no horário de Brasília
 */
export const formatBrasilia = (date: Date | string, formatStr: string, options?: { locale?: any }): string => {
  return formatInTimeZone(date, TIMEZONE_BRASILIA, formatStr, options);
};

/**
 * Retorna o início do dia no horário de Brasília
 */
export const startOfDayBrasilia = (date?: Date): Date => {
  const baseDate = date ? toZonedBrasilia(date) : nowInBrasilia();
  return startOfDay(baseDate);
};

/**
 * Retorna o fim do dia no horário de Brasília
 */
export const endOfDayBrasilia = (date?: Date): Date => {
  const baseDate = date ? toZonedBrasilia(date) : nowInBrasilia();
  return endOfDay(baseDate);
};

/**
 * Retorna o início da semana no horário de Brasília
 */
export const startOfWeekBrasilia = (date?: Date, options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 }): Date => {
  const baseDate = date ? toZonedBrasilia(date) : nowInBrasilia();
  return startOfWeek(baseDate, options);
};

/**
 * Retorna o fim da semana no horário de Brasília
 */
export const endOfWeekBrasilia = (date?: Date, options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 }): Date => {
  const baseDate = date ? toZonedBrasilia(date) : nowInBrasilia();
  return endOfWeek(baseDate, options);
};

/**
 * Retorna o início do mês no horário de Brasília
 */
export const startOfMonthBrasilia = (date?: Date): Date => {
  const baseDate = date ? toZonedBrasilia(date) : nowInBrasilia();
  return startOfMonth(baseDate);
};

/**
 * Retorna o fim do mês no horário de Brasília
 */
export const endOfMonthBrasilia = (date?: Date): Date => {
  const baseDate = date ? toZonedBrasilia(date) : nowInBrasilia();
  return endOfMonth(baseDate);
};

/**
 * Compara se uma data (UTC) está dentro de um período no horário de Brasília
 */
export const isDateInPeriodBrasilia = (
  date: Date | string,
  start: Date,
  end: Date
): boolean => {
  const zonedDate = toZonedBrasilia(date);
  return zonedDate >= start && zonedDate <= end;
};

/**
 * Parseia uma string de data YYYY-MM-DD como data local (Brasília)
 * Retorna a data ao meio-dia para evitar problemas de timezone
 */
export const parseDateStringBrasilia = (dateStr: string): Date => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  return toZonedBrasilia(dateStr);
};

/**
 * Converte uma data para ISO string no timezone de Brasília
 * Útil para salvar no banco de dados
 */
export const toISOBrasilia = (date: Date, time: string = "12:00"): string => {
  const dateStr = formatBrasilia(date, "yyyy-MM-dd");
  return fromZonedBrasilia(new Date(`${dateStr}T${time}:00`)).toISOString();
};
