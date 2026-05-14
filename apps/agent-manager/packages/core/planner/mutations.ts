import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type {
  CreatePlannerEntryRequest,
  UpdatePlannerDayMarkRequest,
  UpdatePlannerEntryRequest,
  UpdatePlannerMonthRequest,
} from "../types";
import { plannerKeys } from "./queries";

function invalidatePlanner(qc: ReturnType<typeof useQueryClient>, wsId: string) {
  qc.invalidateQueries({ queryKey: plannerKeys.all(wsId) });
}

export function useUpdatePlannerMonth() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdatePlannerMonthRequest) =>
      api.updatePlannerMonth(id, data),
    onSettled: () => invalidatePlanner(qc, wsId),
  });
}

export function useCreatePlannerEntry() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreatePlannerEntryRequest) => api.createPlannerEntry(data),
    onSettled: () => invalidatePlanner(qc, wsId),
  });
}

export function useUpdatePlannerEntry() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdatePlannerEntryRequest) =>
      api.updatePlannerEntry(id, data),
    onSettled: () => invalidatePlanner(qc, wsId),
  });
}

export function useDeletePlannerEntry() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deletePlannerEntry(id),
    onSettled: () => invalidatePlanner(qc, wsId),
  });
}

export function useUpdatePlannerDayMark() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ date, ...data }: { date: string } & UpdatePlannerDayMarkRequest) =>
      api.updatePlannerDayMark(date, data),
    onSettled: () => invalidatePlanner(qc, wsId),
  });
}

export function useDeletePlannerDayMark() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (date: string) => api.deletePlannerDayMark(date),
    onSettled: () => invalidatePlanner(qc, wsId),
  });
}
