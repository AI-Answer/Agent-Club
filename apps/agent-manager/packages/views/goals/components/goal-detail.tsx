"use client";

import { useCallback, useMemo, useRef } from "react";
import { AlertCircle, Bot, Check, CheckCircle2, ChevronRight, FolderKanban, ListTodo, Plus, Sparkles, Target, UserMinus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GoalStatus, Issue, IssueStatus, UpdateGoalRequest } from "@multica/core/types";
import { goalDetailOptions, goalReadinessOptions } from "@multica/core/goals/queries";
import { useExpandGoal, useUpdateGoal } from "@multica/core/goals/mutations";
import { GOAL_STATUS_CONFIG, GOAL_STATUS_ORDER } from "@multica/core/goals";
import { projectDetailOptions } from "@multica/core/projects/queries";
import { childIssueProgressOptions, myIssueListOptions, type MyIssuesFilter } from "@multica/core/issues/queries";
import { useUpdateIssue } from "@multica/core/issues/mutations";
import { BOARD_STATUSES } from "@multica/core/issues/config";
import { createIssueViewStore } from "@multica/core/issues/stores/view-store";
import { ViewStoreProvider, useViewStore } from "@multica/core/issues/stores/view-store-context";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
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
import { AppLink } from "../../navigation";
import { ActorAvatar } from "../../common/actor-avatar";
import { ContentEditor, type ContentEditorRef, TitleEditor } from "../../editor";
import { IssuesHeader } from "../../issues/components/issues-header";
import { BoardView } from "../../issues/components/board-view";
import { ListView } from "../../issues/components/list-view";
import { BatchActionToolbar } from "../../issues/components/batch-action-toolbar";
import { filterIssues } from "../../issues/utils/filter";
import { PageHeader } from "../../layout/page-header";
import { ProjectIcon } from "../../projects/components/project-icon";
import { useT } from "../../i18n";
import { useGoalStatusLabels } from "./labels";

const goalViewStore = createIssueViewStore("goal_issues_view");

function GoalIssuesContent({
  goalId,
  projectId,
  goalIssues,
  scope,
  filter,
}: {
  goalId: string;
  projectId: string;
  goalIssues: Issue[];
  scope: string;
  filter: MyIssuesFilter;
}) {
  const { t } = useT("goals");
  const wsId = useWorkspaceId();
  const viewMode = useViewStore((s) => s.viewMode);
  const statusFilters = useViewStore((s) => s.statusFilters);
  const priorityFilters = useViewStore((s) => s.priorityFilters);
  const assigneeFilters = useViewStore((s) => s.assigneeFilters);
  const includeNoAssignee = useViewStore((s) => s.includeNoAssignee);
  const creatorFilters = useViewStore((s) => s.creatorFilters);
  const labelFilters = useViewStore((s) => s.labelFilters);

  const issues = useMemo(
    () =>
      filterIssues(goalIssues, {
        statusFilters,
        priorityFilters,
        assigneeFilters,
        includeNoAssignee,
        creatorFilters,
        projectFilters: [],
        includeNoProject: false,
        labelFilters,
      }),
    [goalIssues, statusFilters, priorityFilters, assigneeFilters, includeNoAssignee, creatorFilters, labelFilters],
  );

  const { data: childProgressMap = new Map() } = useQuery(childIssueProgressOptions(wsId));
  const updateIssueMutation = useUpdateIssue();

  const visibleStatuses = useMemo(() => {
    if (statusFilters.length > 0)
      return BOARD_STATUSES.filter((s) => statusFilters.includes(s));
    return BOARD_STATUSES;
  }, [statusFilters]);

  const hiddenStatuses = useMemo(
    () => BOARD_STATUSES.filter((s) => !visibleStatuses.includes(s)),
    [visibleStatuses],
  );

  const handleMoveIssue = useCallback(
    (issueId: string, newStatus: IssueStatus, newPosition?: number) => {
      const updates: Partial<{ status: IssueStatus; position: number }> = { status: newStatus };
      if (newPosition !== undefined) updates.position = newPosition;
      updateIssueMutation.mutate(
        { id: issueId, ...updates },
        { onError: () => toast.error(t(($) => $.detail.toast_move_issue_failed)) },
      );
    },
    [updateIssueMutation, t],
  );

  if (goalIssues.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 text-muted-foreground">
        <ListTodo className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm">{t(($) => $.detail.empty_issues_title)}</p>
        <p className="text-xs">{t(($) => $.detail.empty_issues_hint)}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() =>
            useModalStore.getState().open("create-issue", {
              project_id: projectId,
              goal_id: goalId,
            })
          }
        >
          <Plus className="size-3.5 mr-1.5" />
          {t(($) => $.detail.empty_issues_new_button)}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {viewMode === "board" ? (
        <BoardView
          issues={issues}
          visibleStatuses={visibleStatuses}
          hiddenStatuses={hiddenStatuses}
          onMoveIssue={handleMoveIssue}
          childProgressMap={childProgressMap}
          myIssuesScope={scope}
          myIssuesFilter={filter}
          projectId={projectId}
          goalId={goalId}
        />
      ) : (
        <ListView
          issues={issues}
          visibleStatuses={visibleStatuses}
          childProgressMap={childProgressMap}
          myIssuesScope={scope}
          myIssuesFilter={filter}
          projectId={projectId}
          goalId={goalId}
        />
      )}
    </div>
  );
}

export function GoalDetail({ goalId }: { goalId: string }) {
  const { t } = useT("goals");
  const statusLabels = useGoalStatusLabels();
  const wsId = useWorkspaceId();
  const wsPaths = useWorkspacePaths();
  const workspaceName = useCurrentWorkspace()?.name;
  const { getActorName } = useActorName();
  const { data: goal, isLoading } = useQuery(goalDetailOptions(wsId, goalId));
  const { data: readiness, isLoading: readinessLoading } = useQuery({
    ...goalReadinessOptions(wsId, goalId),
    enabled: !!goal,
  });
  const { data: project } = useQuery({
    ...projectDetailOptions(wsId, goal?.project_id ?? ""),
    enabled: !!goal?.project_id,
  });
  const updateGoal = useUpdateGoal();
  const expandGoal = useExpandGoal();
  const descEditorRef = useRef<ContentEditorRef>(null);
  const goalScope = `goal:${goalId}`;
  const goalFilter = useMemo<MyIssuesFilter>(
    () => ({
      goal_id: goalId,
      ...(goal?.project_id ? { project_id: goal.project_id } : {}),
    }),
    [goalId, goal?.project_id],
  );
  const { data: goalIssues = [] } = useQuery(
    myIssueListOptions(wsId, goalScope, goalFilter),
  );

  const handleUpdate = useCallback(
    (data: UpdateGoalRequest) => {
      if (!goal) return;
      updateGoal.mutate({ id: goal.id, ...data });
    },
    [goal, updateGoal],
  );

  const handleExpandGoal = useCallback(() => {
    if (!goal || !readiness?.ready || expandGoal.isPending) return;
    expandGoal.mutate(
      { id: goal.id },
      {
        onSuccess: () => toast.success(t(($) => $.detail.expand.toast_queued)),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : t(($) => $.detail.expand.toast_failed)),
      },
    );
  }, [expandGoal, goal, readiness?.ready, t]);

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl px-8 py-10 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-40 w-full mt-8" />
      </div>
    );
  }

  if (!goal) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">{t(($) => $.detail.not_found)}</div>;
  }

  const statusCfg = GOAL_STATUS_CONFIG[goal.status];
  const plannerLabel =
    goal.planner_type && goal.planner_id
      ? getActorName(goal.planner_type, goal.planner_id)
      : t(($) => $.planner.no_planner);

  return (
    <div className="flex h-full flex-col">
      <PageHeader className="gap-2 bg-background text-sm">
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          <AppLink href={wsPaths.goals()} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
            {workspaceName ?? t(($) => $.detail.breadcrumb_fallback)}
          </AppLink>
          <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />
          <span className="truncate">{goal.title}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            useModalStore.getState().open("create-issue", {
              project_id: goal.project_id,
              goal_id: goal.id,
            })
          }
        >
          <Plus className="size-3.5 mr-1" />
          {t(($) => $.detail.new_issue)}
        </Button>
      </PageHeader>

      <div className="border-b px-5 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="size-3.5" />
              <span>{t(($) => $.detail.goal_label)}</span>
            </div>
            <TitleEditor
              key={`goal-title-${goal.id}`}
              defaultValue={goal.title}
              placeholder={t(($) => $.detail.title_placeholder)}
              className="w-full text-xl font-semibold leading-tight tracking-tight"
              onBlur={(value) => {
                const trimmed = value.trim();
                if (trimmed && trimmed !== goal.title) handleUpdate({ title: trimmed });
              }}
            />
            <div className="mt-3 max-w-3xl">
              <ContentEditor
                ref={descEditorRef}
                key={`goal-desc-${goal.id}`}
                defaultValue={goal.description || ""}
                placeholder={t(($) => $.detail.description_placeholder)}
                onUpdate={(md) => handleUpdate({ description: md || null })}
                debounceMs={1500}
              />
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80",
                      statusCfg.badgeBg,
                      statusCfg.badgeText,
                    )}
                  >
                    <span className={cn("size-2 rounded-full", statusCfg.dotColor)} />
                    {statusLabels[goal.status]}
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-44">
                {GOAL_STATUS_ORDER.map((status) => (
                  <DropdownMenuItem key={status} onClick={() => handleUpdate({ status: status as GoalStatus })}>
                    <span className={cn("size-2 rounded-full", GOAL_STATUS_CONFIG[status].dotColor)} />
                    <span>{statusLabels[status]}</span>
                    {status === goal.status && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <AppLink
              href={wsPaths.projectDetail(goal.project_id)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              {project ? (
                <>
                  <ProjectIcon project={project} size="sm" />
                  <span className="max-w-44 truncate">{project.title}</span>
                </>
              ) : (
                <>
                  <FolderKanban className="size-3.5" />
                  <span>{t(($) => $.table.unknown_project)}</span>
                </>
              )}
            </AppLink>

            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground">
                    {goal.planner_type && goal.planner_id ? (
                      <ActorAvatar actorType={goal.planner_type} actorId={goal.planner_id} size={16} enableHoverCard showStatusDot={goal.planner_type === "agent"} />
                    ) : (
                      <UserMinus className="size-3.5" />
                    )}
                    <span className="max-w-40 truncate">{plannerLabel}</span>
                  </span>
                }
              />
              <TooltipContent side="bottom">{plannerLabel}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="border-b bg-muted/20 px-5 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Bot className="size-4 text-muted-foreground" />
              <span>{t(($) => $.detail.readiness.title)}</span>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                readiness?.ready
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
              )}
            >
              {readiness?.ready ? <CheckCircle2 className="size-3" /> : <AlertCircle className="size-3" />}
              {readiness?.ready
                ? t(($) => $.detail.readiness.ready)
                : t(($) => $.detail.readiness.missing)}
            </span>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {(readiness?.roles ?? []).map((role) => {
                const actorName =
                  role.actor?.name ||
                  (role.status === "ready" && role.candidates.length > 0
                    ? t(($) => $.detail.readiness.available_count, { count: role.candidates.length })
                    : role.missing_reason || t(($) => $.detail.readiness.no_actor));
                return (
                  <Tooltip key={role.role}>
                    <TooltipTrigger
                      render={
                        <span
                          className={cn(
                            "inline-flex max-w-72 items-center gap-1.5 rounded border px-2 py-1 text-xs",
                            role.status === "ready"
                              ? "border-border bg-background text-foreground"
                              : "border-dashed border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", role.status === "ready" ? "bg-emerald-500" : "bg-amber-500")} />
                          <span className="font-medium">{t(($) => $.detail.readiness.roles[role.role])}</span>
                          <span className="truncate text-muted-foreground">{actorName}</span>
                        </span>
                      }
                    />
                    <TooltipContent side="bottom">{actorName}</TooltipContent>
                  </Tooltip>
                );
              })}
              {readinessLoading && <span className="text-xs text-muted-foreground">{t(($) => $.detail.readiness.checking)}</span>}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!readiness?.ready || expandGoal.isPending}
            onClick={handleExpandGoal}
          >
            <Sparkles className="size-3.5 mr-1.5" />
            {expandGoal.isPending
              ? t(($) => $.detail.expand.queuing)
              : t(($) => $.detail.expand.button)}
          </Button>
        </div>
      </div>

      <ViewStoreProvider store={goalViewStore}>
        <IssuesHeader scopedIssues={goalIssues} />
        <GoalIssuesContent
          goalId={goal.id}
          projectId={goal.project_id}
          goalIssues={goalIssues}
          scope={goalScope}
          filter={goalFilter}
        />
        <BatchActionToolbar />
      </ViewStoreProvider>
    </div>
  );
}
