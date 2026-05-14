import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type { CreateGoalRequest, ExpandGoalRequest, Goal, UpdateGoalRequest } from "../types";
import { goalKeys } from "./queries";

export function useCreateGoal() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateGoalRequest) => api.createGoal(data),
    onSuccess: (goal) => {
      qc.setQueryData<Goal>(goalKeys.detail(wsId, goal.id), goal);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: goalKeys.all(wsId) });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateGoalRequest) =>
      api.updateGoal(id, data),
    onSuccess: (goal) => {
      qc.setQueryData<Goal>(goalKeys.detail(wsId, goal.id), goal);
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: goalKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: goalKeys.all(wsId) });
    },
  });
}

export function useDeleteGoal() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: goalKeys.detail(wsId, id) });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: goalKeys.all(wsId) });
    },
  });
}

export function useExpandGoal() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & ExpandGoalRequest) =>
      api.expandGoal(id, data),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: goalKeys.readiness(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: goalKeys.all(wsId) });
    },
  });
}
