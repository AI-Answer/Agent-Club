"use client";

import { useCallback, useMemo } from "react";
import { Check, FolderKanban, Plus, Target, UserMinus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Goal, GoalStatus, Project, UpdateGoalRequest } from "@multica/core/types";
import { goalListOptions } from "@multica/core/goals/queries";
import { useUpdateGoal } from "@multica/core/goals/mutations";
import { GOAL_STATUS_CONFIG, GOAL_STATUS_ORDER } from "@multica/core/goals";
import { projectListOptions } from "@multica/core/projects/queries";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { useActorName } from "@multica/core/workspace/hooks";
import { useModalStore } from "@multica/core/modals";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@multica/ui/components/ui/tooltip";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { PageHeader } from "../../layout/page-header";
import { useFormatRelativeDate } from "../../projects/components/labels";
import { ProjectIcon } from "../../projects/components/project-icon";
import { useT } from "../../i18n";
import { useGoalStatusLabels } from "./labels";

function GoalRow({
  goal,
  project,
}: {
  goal: Goal;
  project: Project | undefined;
}) {
  const { t } = useT("goals");
  const wsPaths = useWorkspacePaths();
  const statusLabels = useGoalStatusLabels();
  const formatRelativeDate = useFormatRelativeDate();
  const { getActorName } = useActorName();
  const updateGoal = useUpdateGoal();
  const statusCfg = GOAL_STATUS_CONFIG[goal.status];

  const handleUpdate = useCallback(
    (data: UpdateGoalRequest) => {
      updateGoal.mutate({ id: goal.id, ...data });
    },
    [goal.id, updateGoal],
  );

  const plannerLabel =
    goal.planner_type && goal.planner_id
      ? getActorName(goal.planner_type, goal.planner_id)
      : t(($) => $.planner.no_planner);

  return (
    <div className="group/row flex h-11 items-center gap-2 px-5 text-sm transition-colors hover:bg-accent/40">
      <AppLink
        href={wsPaths.goalDetail(goal.id)}
        className="flex min-w-0 flex-1 items-center gap-2"
      >
        <Target className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{goal.title}</span>
      </AppLink>

      <AppLink
        href={project ? wsPaths.projectDetail(project.id) : wsPaths.projects()}
        className="flex w-44 shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        {project ? (
          <>
            <ProjectIcon project={project} size="sm" />
            <span className="truncate">{project.title}</span>
          </>
        ) : (
          <>
            <FolderKanban className="size-3.5" />
            <span>{t(($) => $.table.unknown_project)}</span>
          </>
        )}
      </AppLink>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={cn(
                "inline-flex w-28 shrink-0 items-center justify-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80",
                statusCfg.badgeBg,
                statusCfg.badgeText,
              )}
            >
              {statusLabels[goal.status]}
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-44">
          {GOAL_STATUS_ORDER.map((status) => (
            <DropdownMenuItem key={status} onClick={() => handleUpdate({ status: status as GoalStatus })}>
              <span className={cn("size-2 rounded-full", GOAL_STATUS_CONFIG[status].dotColor)} />
              <span>{statusLabels[status]}</span>
              {status === goal.status && <Check className="ml-auto size-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex w-40 shrink-0 items-center justify-center">
        {goal.planner_type && goal.planner_id ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <ActorAvatar actorType={goal.planner_type} actorId={goal.planner_id} size={18} enableHoverCard showStatusDot={goal.planner_type === "agent"} />
                  <span className="truncate">{plannerLabel}</span>
                </span>
              }
            />
            <TooltipContent side="bottom">{plannerLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserMinus className="size-3.5" />
            {plannerLabel}
          </span>
        )}
      </div>

      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {formatRelativeDate(goal.updated_at)}
      </span>
    </div>
  );
}

export function GoalsPage() {
  const { t } = useT("goals");
  const wsId = useWorkspaceId();
  const { data: goals = [], isLoading } = useQuery(goalListOptions(wsId));
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const openCreateGoal = () => useModalStore.getState().open("create-goal");

  return (
    <div className="flex h-full flex-col">
      <PageHeader className="justify-between px-5">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <h1 className="text-sm font-medium">{t(($) => $.page.title)}</h1>
          {!isLoading && goals.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{goals.length}</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={openCreateGoal}>
          <Plus className="size-3.5 mr-1" />
          {t(($) => $.page.new_goal)}
        </Button>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <>
            <div className="sticky top-0 z-[1] flex h-8 items-center gap-2 border-b bg-muted/30 px-5">
              <Skeleton className="h-3 w-12 flex-1 max-w-[48px]" />
              <Skeleton className="h-3 w-24 shrink-0" />
              <Skeleton className="h-3 w-20 shrink-0" />
              <Skeleton className="h-3 w-20 shrink-0" />
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
            <div className="p-5 pt-1 space-y-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          </>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Target className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{t(($) => $.page.empty)}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={openCreateGoal}>
              {t(($) => $.page.create_first)}
            </Button>
          </div>
        ) : (
          <>
            <div className="sticky top-0 z-[1] flex h-8 items-center gap-2 border-b bg-muted/30 px-5 text-xs font-medium text-muted-foreground">
              <span className="min-w-0 flex-1">{t(($) => $.table.name)}</span>
              <span className="w-44 shrink-0">{t(($) => $.table.project)}</span>
              <span className="w-28 shrink-0 text-center">{t(($) => $.table.status)}</span>
              <span className="w-40 shrink-0 text-center">{t(($) => $.table.planner)}</span>
              <span className="w-20 shrink-0 text-right">{t(($) => $.table.updated)}</span>
            </div>
            {goals.map((goal) => (
              <GoalRow key={goal.id} goal={goal} project={projectMap.get(goal.project_id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
