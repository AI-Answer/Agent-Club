"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarDays, Check, ChevronLeft, ChevronRight, Link2, MoreHorizontal, Paintbrush, Play, Plus, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { PlannerEntry, PlannerEntryStatus, UpdatePlannerEntryRequest } from "@multica/core/types";
import { plannerMonthOptions, plannerMonthsOptions } from "@multica/core/planner/queries";
import {
  useCreatePlannerEntry,
  useDeletePlannerEntry,
  useUpdatePlannerEntry,
  useUpdatePlannerMonth,
} from "@multica/core/planner/mutations";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { agentListOptions } from "@multica/core/workspace/queries";
import { projectListOptions } from "@multica/core/projects/queries";
import { useCreateProject } from "@multica/core/projects/mutations";
import { useCreateGoal } from "@multica/core/goals/mutations";
import { useCreateIssue } from "@multica/core/issues/mutations";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { NativeSelect, NativeSelectOption } from "@multica/ui/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@multica/ui/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { PageHeader } from "../../layout/page-header";
import { useT } from "../../i18n";
import { AppLink } from "../../navigation";
import { toast } from "sonner";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TAB_COLORS: Array<string | null> = [
  null,
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#64748b",
];

const STATUS_ORDER: PlannerEntryStatus[] = ["planned", "queued", "working", "done", "blocked", "skipped"];
const STATUS_STYLES: Record<PlannerEntryStatus, string> = {
  planned: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
  working: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  blocked: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
  skipped: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildMonthCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells: Array<{ key: string; day: number | null; date: string | null }> = [];
  for (let i = 0; i < offset; i += 1) {
    cells.push({ key: `blank-${i}`, day: null, date: null });
  }
  for (let day = 1; day <= days; day += 1) {
    cells.push({
      key: `${year}-${month}-${day}`,
      day,
      date: `${year}-${pad(month)}-${pad(day)}`,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}`, day: null, date: null });
  }
  return cells;
}

function EntryStatusMenu({
  entry,
  onUpdate,
}: {
  entry: PlannerEntry;
  onUpdate: (data: UpdatePlannerEntryRequest) => void;
}) {
  const { t } = useT("planner");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn("inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[11px] font-medium", STATUS_STYLES[entry.status])}
          />
        }
      >
        {t(($) => $.status[entry.status])}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {STATUS_ORDER.map((status) => (
          <DropdownMenuItem key={status} onClick={() => onUpdate({ status })}>
            <span className={cn("size-2 rounded-full", STATUS_STYLES[status])} />
            {t(($) => $.status[status])}
            {status === entry.status && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlannerEntryRow({
  entry,
  onUpdate,
  onDelete,
  onStart,
}: {
  entry: PlannerEntry;
  onUpdate: (data: UpdatePlannerEntryRequest) => void;
  onDelete: () => void;
  onStart: () => void;
}) {
  const { t } = useT("planner");
  const wsPaths = useWorkspacePaths();
  const [title, setTitle] = useState(entry.title);

  useEffect(() => {
    setTitle(entry.title);
  }, [entry.title]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(entry.title);
      return;
    }
    if (next !== entry.title) onUpdate({ title: next });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={cn(
            "group/entry flex min-h-7 items-center gap-1 rounded border border-border/50 bg-background/80 px-1.5 py-1 text-xs shadow-xs",
            entry.status === "done" && "opacity-70",
            entry.color && "border-l-4",
          )}
          style={entry.color ? { borderLeftColor: entry.color } : undefined}
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="h-6 flex-1 border-0 bg-transparent px-1 py-0 text-xs shadow-none focus-visible:ring-0"
          />
          {entry.issue_id && (
            <AppLink href={wsPaths.issueDetail(entry.issue_id)} className="text-muted-foreground hover:text-foreground">
              <Link2 className="size-3.5" />
            </AppLink>
          )}
          <EntryStatusMenu entry={entry} onUpdate={onUpdate} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button type="button" variant="ghost" size="icon-sm" className="size-6 opacity-0 group-hover/entry:opacity-100" />
              }
            >
              <MoreHorizontal className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={onStart}>
                <Bot className="size-3.5" />
                {t(($) => $.actions.start_agent)}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="size-3.5" />
                {t(($) => $.actions.delete)}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem onClick={onStart}>
          <Play className="size-3.5" />
          {t(($) => $.actions.start_agent)}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onUpdate({ status: "done" })}>
          <Check className="size-3.5" />
          {t(($) => $.actions.mark_done)}
        </ContextMenuItem>
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" />
          {t(($) => $.actions.delete)}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function buildIssueDescription({
  entry,
  prompt,
  objectives,
  notes,
  monthTitle,
}: {
  entry: PlannerEntry;
  prompt: string;
  objectives: string[];
  notes: string[];
  monthTitle: string;
}) {
  const sections = [
    "Started from Month Map.",
    "",
    `Date: ${entry.entry_date}`,
    `Month: ${monthTitle}`,
    `Planner entry: ${entry.title}`,
  ];
  if (entry.body) sections.push("", "Existing notes:", entry.body);
  if (prompt.trim()) sections.push("", "Prompt:", prompt.trim());
  if (objectives.length) sections.push("", "Main objectives:", ...objectives.map((item) => `- ${item}`));
  if (notes.length) sections.push("", "Month notes:", ...notes.map((item) => `- ${item}`));
  return sections.join("\n");
}

function NotesPanel({
  title,
  value,
  placeholder,
  onCommit,
}: {
  title: string;
  value: string[];
  placeholder: string;
  onCommit: (value: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);
  return (
    <div className="min-h-32 flex-1 border-t px-4 py-3 md:border-l md:border-t-0">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <Textarea
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(splitLines(text))}
        className="min-h-24 resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

export function PlannerPage() {
  const { t } = useT("planner");
  const wsId = useWorkspaceId();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dispatchEntry, setDispatchEntry] = useState<PlannerEntry | null>(null);
  const [dispatchPrompt, setDispatchPrompt] = useState("");
  const [dispatchAgentId, setDispatchAgentId] = useState("");
  const [dispatchProjectId, setDispatchProjectId] = useState("");
  const [dispatchGoalTitle, setDispatchGoalTitle] = useState("");
  const [dispatchBusy, setDispatchBusy] = useState(false);

  const { data: monthTabs = [] } = useQuery(plannerMonthsOptions(wsId, year));
  const { data, isLoading } = useQuery(plannerMonthOptions(wsId, year, month));
  const { data: agents = [] } = useQuery(agentListOptions(wsId));
  const { data: projects = [] } = useQuery(projectListOptions(wsId));
  const createEntry = useCreatePlannerEntry();
  const updateEntry = useUpdatePlannerEntry();
  const deleteEntry = useDeletePlannerEntry();
  const updateMonth = useUpdatePlannerMonth();
  const createProject = useCreateProject();
  const createGoal = useCreateGoal();
  const createIssue = useCreateIssue();

  const monthMeta = useMemo(() => new Map(monthTabs.map((item) => [item.month, item])), [monthTabs]);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, PlannerEntry[]>();
    for (const entry of data?.entries ?? []) {
      const list = map.get(entry.entry_date) ?? [];
      list.push(entry);
      map.set(entry.entry_date, list);
    }
    return map;
  }, [data?.entries]);
  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);

  const activeMonth = data?.month;
  const runnableAgents = useMemo(() => agents.filter((agent) => !agent.archived_at), [agents]);

  const goPrev = () => {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
    } else {
      setMonth((value) => value - 1);
    }
  };

  const goNext = () => {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
    } else {
      setMonth((value) => value + 1);
    }
  };

  const addEntry = async (entryDate: string) => {
    const title = drafts[entryDate]?.trim();
    if (!title) return;
    try {
      await createEntry.mutateAsync({
        entry_date: entryDate,
        title,
        position: (entriesByDate.get(entryDate)?.length ?? 0) + 1,
      });
      setDrafts((prev) => ({ ...prev, [entryDate]: "" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(($) => $.toast.create_failed));
    }
  };

  const commitMonth = (payload: { tab_color?: string | null; objectives?: string[]; notes?: string[] }) => {
    if (!activeMonth) return;
    updateMonth.mutate({ id: activeMonth.id, ...payload });
  };

  const openDispatch = (entry: PlannerEntry) => {
    setDispatchEntry(entry);
    setDispatchPrompt(entry.body ?? "");
    setDispatchAgentId(entry.assignee_type === "agent" && entry.assignee_id ? entry.assignee_id : runnableAgents[0]?.id ?? "");
    setDispatchProjectId(entry.project_id ?? "");
    setDispatchGoalTitle(entry.title);
  };

  const closeDispatch = () => {
    if (dispatchBusy) return;
    setDispatchEntry(null);
  };

  const startAgent = async () => {
    if (!dispatchEntry || !activeMonth || !dispatchAgentId) return;
    setDispatchBusy(true);
    try {
      let projectId = dispatchProjectId || dispatchEntry.project_id || "";
      if (!projectId) {
        const project = await createProject.mutateAsync({
          title: `${activeMonth.title} ${activeMonth.year} Month Map`,
          description: `Work started from the ${activeMonth.title} ${activeMonth.year} Month Map.`,
          icon: "M",
          status: "in_progress",
          priority: "high",
        });
        projectId = project.id;
      }

      const goal = await createGoal.mutateAsync({
        project_id: projectId,
        title: dispatchGoalTitle.trim() || dispatchEntry.title,
        description: buildIssueDescription({
          entry: dispatchEntry,
          prompt: dispatchPrompt,
          objectives: activeMonth.objectives,
          notes: activeMonth.notes,
          monthTitle: `${activeMonth.title} ${activeMonth.year}`,
        }),
        status: "in_progress",
        planner_type: "agent",
        planner_id: dispatchAgentId,
      });

      const dueDate = new Date(`${dispatchEntry.entry_date}T23:59:00`).toISOString();
      const issue = await createIssue.mutateAsync({
        title: dispatchEntry.title,
        description: buildIssueDescription({
          entry: dispatchEntry,
          prompt: dispatchPrompt,
          objectives: activeMonth.objectives,
          notes: activeMonth.notes,
          monthTitle: `${activeMonth.title} ${activeMonth.year}`,
        }),
        status: "todo",
        priority: dispatchEntry.priority,
        assignee_type: "agent",
        assignee_id: dispatchAgentId,
        project_id: projectId,
        goal_id: goal.id,
        due_date: dueDate,
      });

      await updateEntry.mutateAsync({
        id: dispatchEntry.id,
        status: "queued",
        project_id: projectId,
        goal_id: goal.id,
        issue_id: issue.id,
        assignee_type: "agent",
        assignee_id: dispatchAgentId,
        body: dispatchPrompt,
      });
      toast.success(t(($) => $.toast.agent_started));
      setDispatchEntry(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(($) => $.toast.agent_start_failed));
    } finally {
      setDispatchBusy(false);
    }
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <PageHeader className="justify-between px-4">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
          <h1 className="truncate text-sm font-medium">{t(($) => $.page.title)}</h1>
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">{year}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" onClick={goPrev} aria-label={t(($) => $.actions.previous_month)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }}>
            {t(($) => $.actions.today)}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={goNext} aria-label={t(($) => $.actions.next_month)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </PageHeader>

      <div className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b px-3">
        {MONTH_NAMES.map((name, index) => {
          const tabMonth = index + 1;
          const color = monthMeta.get(tabMonth)?.tab_color;
          const active = tabMonth === month;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setMonth(tabMonth)}
              className={cn(
                "h-7 shrink-0 rounded border px-2 text-xs font-medium transition-colors",
                active ? "border-foreground bg-accent text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
              style={color ? { borderTopColor: color, borderTopWidth: 3 } : undefined}
            >
              {name.slice(0, 3)}
            </button>
          );
        })}
        <Popover>
          <PopoverTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" className="ml-auto shrink-0" aria-label={t(($) => $.tabs.color)}>
                <Paintbrush className="size-3.5" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-48">
            <div className="mb-2 text-xs font-medium text-muted-foreground">{t(($) => $.tabs.color)}</div>
            <div className="grid grid-cols-5 gap-2">
              {TAB_COLORS.map((color, index) => (
                <button
                  key={color ?? "none"}
                  type="button"
                  onClick={() => commitMonth({ tab_color: color })}
                  className="flex size-7 items-center justify-center rounded border hover:bg-accent"
                  aria-label={color ? `${t(($) => $.tabs.color)} ${index}` : t(($) => $.tabs.no_color)}
                >
                  <span className="size-4 rounded-full border" style={{ backgroundColor: color ?? "transparent" }} />
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid h-8 shrink-0 grid-cols-7 border-b bg-muted/30 text-xs font-medium text-muted-foreground">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="flex items-center border-r px-2 last:border-r-0">
            <span className="truncate">{weekday}</span>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="grid grid-cols-7 gap-px bg-border p-px">
            {Array.from({ length: 35 }).map((_, index) => (
              <Skeleton key={index} className="h-36 rounded-none" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border p-px">
            {cells.map((cell) => {
              if (!cell.date || cell.day == null) {
                return <div key={cell.key} className="h-40 min-w-36 bg-muted/20" />;
              }
              const isPast = cell.date < todayKey;
              const isToday = cell.date === todayKey;
              const entries = entriesByDate.get(cell.date) ?? [];
              return (
                <div
                  key={cell.key}
                  data-planner-date={cell.date}
                  className={cn(
                    "flex h-40 min-w-36 flex-col bg-background p-2",
                    isPast && "bg-muted/40 text-muted-foreground",
                    isToday && "ring-2 ring-inset ring-yellow-400/80",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("text-xs font-medium tabular-nums", isToday && "rounded bg-yellow-300 px-1 text-yellow-950")}>{cell.day}</span>
                    {entries.length > 0 && <span className="text-[11px] text-muted-foreground tabular-nums">{entries.length}</span>}
                  </div>
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                    {entries.map((entry) => (
                      <PlannerEntryRow
                        key={entry.id}
                        entry={entry}
                        onUpdate={(payload) => updateEntry.mutate({ id: entry.id, ...payload })}
                        onDelete={() => deleteEntry.mutate(entry.id)}
                        onStart={() => openDispatch(entry)}
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      value={drafts[cell.date] ?? ""}
                      placeholder={t(($) => $.day.add_placeholder)}
                      aria-label={`${t(($) => $.day.add_placeholder)} ${cell.date}`}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [cell.date!]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addEntry(cell.date!);
                      }}
                      className="h-7 border-0 bg-background/80 px-1.5 text-xs shadow-none focus-visible:ring-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="size-7 shrink-0"
                      aria-label={`${t(($) => $.day.add_placeholder)} ${cell.date}`}
                      onClick={() => addEntry(cell.date!)}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeMonth && (
        <div className="shrink-0 border-t bg-background md:flex">
          <NotesPanel
            title={t(($) => $.bottom.objectives)}
            value={activeMonth.objectives}
            placeholder={t(($) => $.bottom.objectives_placeholder)}
            onCommit={(objectives) => commitMonth({ objectives })}
          />
          <NotesPanel
            title={t(($) => $.bottom.notes)}
            value={activeMonth.notes}
            placeholder={t(($) => $.bottom.notes_placeholder)}
            onCommit={(notes) => commitMonth({ notes })}
          />
        </div>
      )}

      <Dialog open={!!dispatchEntry} onOpenChange={(open) => { if (!open) closeDispatch(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(($) => $.dispatch.title)}</DialogTitle>
            <DialogDescription>{dispatchEntry?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t(($) => $.dispatch.agent)}
              <NativeSelect value={dispatchAgentId} onChange={(e) => setDispatchAgentId(e.target.value)} className="w-full">
                {runnableAgents.length === 0 && <NativeSelectOption value="">{t(($) => $.dispatch.no_agents)}</NativeSelectOption>}
                {runnableAgents.map((agent) => (
                  <NativeSelectOption key={agent.id} value={agent.id}>{agent.name}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t(($) => $.dispatch.project)}
              <NativeSelect value={dispatchProjectId} onChange={(e) => setDispatchProjectId(e.target.value)} className="w-full">
                <NativeSelectOption value="">{t(($) => $.dispatch.new_month_project)}</NativeSelectOption>
                {projects.map((project) => (
                  <NativeSelectOption key={project.id} value={project.id}>{project.title}</NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t(($) => $.dispatch.goal_title)}
              <Input value={dispatchGoalTitle} onChange={(e) => setDispatchGoalTitle(e.target.value)} />
            </label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              {t(($) => $.dispatch.prompt)}
              <Textarea
                value={dispatchPrompt}
                onChange={(e) => setDispatchPrompt(e.target.value)}
                className="min-h-28 resize-none"
              />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDispatch} disabled={dispatchBusy}>
              {t(($) => $.actions.cancel)}
            </Button>
            <Button type="button" onClick={startAgent} disabled={!dispatchAgentId || dispatchBusy || runnableAgents.length === 0}>
              <Play className="size-3.5" />
              {dispatchBusy ? t(($) => $.dispatch.starting) : t(($) => $.actions.start_agent)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
