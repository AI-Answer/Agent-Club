import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const plannerKeys = {
  all: (wsId: string) => ["planner", wsId] as const,
  months: (wsId: string, year: number) =>
    [...plannerKeys.all(wsId), "months", year] as const,
  month: (wsId: string, year: number, month: number) =>
    [...plannerKeys.all(wsId), "month", year, month] as const,
  context: (wsId: string, date: string) =>
    [...plannerKeys.all(wsId), "context", date] as const,
};

export function plannerMonthsOptions(wsId: string, year: number) {
  return queryOptions({
    queryKey: plannerKeys.months(wsId, year),
    queryFn: () => api.listPlannerMonths(year),
    select: (data) => data.months,
  });
}

export function plannerMonthOptions(wsId: string, year: number, month: number) {
  return queryOptions({
    queryKey: plannerKeys.month(wsId, year, month),
    queryFn: () => api.getPlannerMonth(year, month),
  });
}

export function plannerContextOptions(wsId: string, date: string) {
  return queryOptions({
    queryKey: plannerKeys.context(wsId, date),
    queryFn: () => api.getPlannerContext(date),
  });
}
