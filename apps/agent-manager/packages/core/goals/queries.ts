import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { GoalStatus } from "../types";

export interface GoalListParams {
  project_id?: string;
  status?: GoalStatus;
}

export const goalKeys = {
  all: (wsId: string) => ["goals", wsId] as const,
  list: (wsId: string, params?: GoalListParams) =>
    [...goalKeys.all(wsId), "list", params ?? {}] as const,
  detail: (wsId: string, id: string) =>
    [...goalKeys.all(wsId), "detail", id] as const,
  readiness: (wsId: string, id: string) =>
    [...goalKeys.all(wsId), "readiness", id] as const,
};

export function goalListOptions(wsId: string, params?: GoalListParams) {
  return queryOptions({
    queryKey: goalKeys.list(wsId, params),
    queryFn: () => api.listGoals(params),
    select: (data) => data.goals,
  });
}

export function goalDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: goalKeys.detail(wsId, id),
    queryFn: () => api.getGoal(id),
  });
}

export function goalReadinessOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: goalKeys.readiness(wsId, id),
    queryFn: () => api.getGoalReadiness(id),
  });
}
