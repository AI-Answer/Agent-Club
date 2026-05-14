"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Maximize2, Minimize2, Target, UserMinus, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import type { GoalPlannerType, GoalStatus } from "@multica/core/types";
import { GOAL_STATUS_CONFIG, GOAL_STATUS_ORDER } from "@multica/core/goals";
import { useCreateGoal } from "@multica/core/goals/mutations";
import { useWorkspaceId } from "@multica/core/hooks";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import { projectListOptions } from "@multica/core/projects/queries";
import { agentListOptions, memberListOptions, squadListOptions } from "@multica/core/workspace/queries";
import { useActorName } from "@multica/core/workspace/hooks";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@multica/ui/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@multica/ui/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@multica/ui/components/ui/tooltip";
import { ContentEditor, type ContentEditorRef, TitleEditor } from "../editor";
import { ActorAvatar } from "../common/actor-avatar";
import { PillButton } from "../common/pill-button";
import { ProjectPicker } from "../projects/components/project-picker";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";
import { useGoalStatusLabels } from "../goals/components/labels";

type PlannerSelection =
  | { type: GoalPlannerType; id: string }
  | null;

export function CreateGoalModal({
  onClose,
  data,
}: {
  onClose: () => void;
  data?: Record<string, unknown> | null;
}) {
  const { t } = useT("goals");
  const router = useNavigation();
  const workspace = useCurrentWorkspace();
  const workspaceName = workspace?.name;
  const wsPaths = useWorkspacePaths();
  const wsId = useWorkspaceId();
  const statusLabels = useGoalStatusLabels();
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const createGoal = useCreateGoal();

  const [title, setTitle] = useState("");
  const descEditorRef = useRef<ContentEditorRef>(null);
  const [projectId, setProjectId] = useState<string | null>(
    (data?.project_id as string | undefined) ?? null,
  );
  const [status, setStatus] = useState<GoalStatus>("planned");
  const [planner, setPlanner] = useState<PlannerSelection>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!projectId && projects[0]) setProjectId(projects[0].id);
  }, [projectId, projects]);

  const statusCfg = GOAL_STATUS_CONFIG[status];

  const handleSubmit = async () => {
    if (!title.trim() || !projectId || submitting) return;
    setSubmitting(true);
    try {
      const goal = await createGoal.mutateAsync({
        project_id: projectId,
        title: title.trim(),
        description: descEditorRef.current?.getMarkdown()?.trim() || undefined,
        status,
        ...(planner ? { planner_type: planner.type, planner_id: planner.id } : {}),
      });
      onClose();
      toast.success(t(($) => $.create_goal.toast_created));
      router.push(wsPaths.goalDetail(goal.id));
    } catch {
      toast.error(t(($) => $.create_goal.toast_failed));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden",
          "!top-1/2 !left-1/2 !-translate-x-1/2",
          "!transition-all !duration-300 !ease-out",
          isExpanded
            ? "!max-w-4xl !w-full !h-5/6 !-translate-y-1/2"
            : "!max-w-2xl !w-full !h-96 !-translate-y-1/2",
        )}
      >
        <DialogTitle className="sr-only">{t(($) => $.create_goal.title)}</DialogTitle>

        <div className="flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{workspaceName}</span>
            <ChevronRight className="size-3 text-muted-foreground/50" />
            <span className="font-medium">{t(($) => $.create_goal.breadcrumb)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="rounded-sm p-1.5 opacity-70 hover:opacity-100 hover:bg-accent/60 transition-all cursor-pointer"
                  >
                    {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                  </button>
                }
              />
              <TooltipContent side="bottom">
                {isExpanded ? t(($) => $.common.collapse_tooltip) : t(($) => $.common.expand_tooltip)}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-sm p-1.5 opacity-70 hover:opacity-100 hover:bg-accent/60 transition-all cursor-pointer"
                  >
                    <XIcon className="size-4" />
                  </button>
                }
              />
              <TooltipContent side="bottom">{t(($) => $.common.close)}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="px-5 pb-2 shrink-0">
          <TitleEditor
            autoFocus
            defaultValue=""
            placeholder={t(($) => $.create_goal.title_placeholder)}
            className="text-lg font-semibold"
            onChange={setTitle}
            onSubmit={handleSubmit}
          />
        </div>

        <div className="relative flex flex-1 min-h-0 overflow-y-auto px-5">
          <ContentEditor
            ref={descEditorRef}
            defaultValue=""
            placeholder={t(($) => $.create_goal.description_placeholder)}
            debounceMs={500}
          />
        </div>

        <div className="flex items-center gap-1.5 px-4 py-2 shrink-0 flex-wrap">
          <ProjectPicker
            projectId={projectId}
            onUpdate={(u) => setProjectId(u.project_id ?? null)}
            triggerRender={<PillButton />}
            align="start"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <PillButton>
                  <span className={cn("size-2 rounded-full", statusCfg.dotColor)} />
                  <span>{statusLabels[status]}</span>
                </PillButton>
              }
            />
            <DropdownMenuContent align="start" className="w-44">
              {GOAL_STATUS_ORDER.map((next) => (
                <DropdownMenuItem key={next} onClick={() => setStatus(next)}>
                  <span className={cn("size-2 rounded-full", GOAL_STATUS_CONFIG[next].dotColor)} />
                  <span>{statusLabels[next]}</span>
                  {next === status && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <PlannerPicker planner={planner} onChange={setPlanner} />
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3 shrink-0">
          <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <Target className="size-3.5 shrink-0" />
            <span className="truncate">{t(($) => $.create_goal.footer_hint)}</span>
          </div>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim() || !projectId || submitting}>
            {submitting ? t(($) => $.create_goal.submitting) : t(($) => $.create_goal.submit)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlannerPicker({
  planner,
  onChange,
}: {
  planner: PlannerSelection;
  onChange: (planner: PlannerSelection) => void;
}) {
  const { t } = useT("goals");
  const wsId = useWorkspaceId();
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: squads = [] } = useQuery(squadListOptions(wsId));
  const { getActorName } = useActorName();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const filteredMembers = useMemo(
    () => members.filter((m) => m.name.toLowerCase().includes(query)),
    [members, query],
  );
  const filteredAgents = useMemo(
    () => agents.filter((a) => !a.archived_at && a.name.toLowerCase().includes(query)),
    [agents, query],
  );
  const filteredSquads = useMemo(
    () => squads.filter((s) => !s.archived_at && s.name.toLowerCase().includes(query)),
    [squads, query],
  );

  const plannerLabel = planner
    ? getActorName(planner.type, planner.id)
    : t(($) => $.planner.no_planner);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setFilter(""); }}>
      <PopoverTrigger
        render={
          <PillButton>
            {planner ? (
              <ActorAvatar actorType={planner.type} actorId={planner.id} size={16} enableHoverCard />
            ) : (
              <UserMinus className="size-3.5 text-muted-foreground" />
            )}
            <span className="max-w-36 truncate">{plannerLabel}</span>
          </PillButton>
        }
      />
      <PopoverContent align="start" className="w-64 p-0">
        <div className="px-2 py-1.5 border-b">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t(($) => $.planner.search_placeholder)}
            className="w-full bg-transparent text-sm placeholder:text-muted-foreground outline-none"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <UserMinus className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{t(($) => $.planner.no_planner)}</span>
          </button>
          <PlannerSection
            label={t(($) => $.planner.members_group)}
            items={filteredMembers.map((m) => ({ type: "member" as const, id: m.user_id, name: m.name }))}
            planner={planner}
            onPick={(next) => { onChange(next); setOpen(false); }}
          />
          <PlannerSection
            label={t(($) => $.planner.agents_group)}
            items={filteredAgents.map((a) => ({ type: "agent" as const, id: a.id, name: a.name }))}
            planner={planner}
            onPick={(next) => { onChange(next); setOpen(false); }}
          />
          <PlannerSection
            label={t(($) => $.planner.squads_group)}
            items={filteredSquads.map((s) => ({ type: "squad" as const, id: s.id, name: s.name }))}
            planner={planner}
            onPick={(next) => { onChange(next); setOpen(false); }}
          />
          {filteredMembers.length === 0 && filteredAgents.length === 0 && filteredSquads.length === 0 && query && (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">{t(($) => $.planner.no_results)}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PlannerSection({
  label,
  items,
  planner,
  onPick,
}: {
  label: string;
  items: Array<{ type: GoalPlannerType; id: string; name: string }>;
  planner: PlannerSelection;
  onPick: (planner: Exclude<PlannerSelection, null>) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      {items.map((item) => (
        <button
          type="button"
          key={`${item.type}:${item.id}`}
          onClick={() => onPick({ type: item.type, id: item.id })}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
        >
          <ActorAvatar actorType={item.type} actorId={item.id} size={16} showStatusDot={item.type === "agent"} />
          <span className="min-w-0 flex-1 truncate text-left">{item.name}</span>
          {planner?.type === item.type && planner.id === item.id && <Check className="size-3.5 text-primary" />}
        </button>
      ))}
    </>
  );
}
