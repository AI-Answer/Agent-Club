"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import {
  useCreatePlannerEntry,
  useDeletePlannerEntry,
  useUpdatePlannerEntry,
  useUpdatePlannerMonth,
} from "@multica/core/planner/mutations";
import { plannerMonthOptions, plannerMonthsOptions } from "@multica/core/planner/queries";
import type { PlannerEntry, PlannerEntryStatus } from "@multica/core/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
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
const STATUS_OPTIONS: PlannerEntryStatus[] = ["planned", "queued", "working", "done", "blocked", "skipped"];
const STATUS_CLASS: Record<PlannerEntryStatus, string> = {
  planned: "bg-slate-100 text-slate-700",
  queued: "bg-blue-100 text-blue-700",
  working: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-700",
  blocked: "bg-rose-100 text-rose-700",
  skipped: "bg-zinc-200 text-zinc-700",
};

function pad(value: number) {
  return value < 10 ? `0${value}` : String(value);
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function todayKey() {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const leading = (first.getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells: Array<{ key: string; day: number | null; date: string | null }> = [];

  for (let index = 0; index < leading; index += 1) {
    cells.push({ key: `blank-start-${index}`, day: null, date: null });
  }

  for (let day = 1; day <= days; day += 1) {
    cells.push({ key: isoDate(year, month, day), day, date: isoDate(year, month, day) });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}`, day: null, date: null });
  }

  return cells;
}

function EntryRow({
  entry,
  onRename,
  onStatus,
  onDelete,
}: {
  entry: PlannerEntry;
  onRename: (title: string) => void;
  onStatus: (status: PlannerEntryStatus) => void;
  onDelete: () => void;
}) {
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
    if (next !== entry.title) onRename(next);
  };

  return (
    <div className="group flex min-h-8 items-center gap-1 rounded-md border border-border/70 bg-background px-1.5 py-1 shadow-xs">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
      />
      <select
        value={entry.status}
        onChange={(event) => onStatus(event.target.value as PlannerEntryStatus)}
        className={`h-6 rounded border-0 px-1 text-[11px] font-semibold outline-none ${STATUS_CLASS[entry.status]}`}
      >
        {STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onDelete}
        className="hidden size-6 shrink-0 rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600 group-hover:grid place-items-center"
        aria-label={`Delete ${entry.title}`}
      >
        x
      </button>
    </div>
  );
}

function MonthTextarea({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string[];
  placeholder: string;
  onCommit: (value: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));

  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);

  return (
    <label className="flex min-h-28 flex-1 flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
      <textarea
        value={text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onCommit(splitLines(text))}
        className="min-h-20 flex-1 resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-muted-foreground/60"
      />
    </label>
  );
}

export default function Page() {
  const wsId = useWorkspaceId();
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const currentToday = useMemo(() => todayKey(), []);
  const { data: monthTabs = [] } = useQuery(plannerMonthsOptions(wsId, year));
  const { data, isLoading } = useQuery(plannerMonthOptions(wsId, year, month));
  const createEntry = useCreatePlannerEntry();
  const updateEntry = useUpdatePlannerEntry();
  const deleteEntry = useDeletePlannerEntry();
  const updateMonth = useUpdatePlannerMonth();

  const activeMonth = data?.month;
  const cells = useMemo(() => buildCells(year, month), [year, month]);
  const monthMeta = useMemo(() => new Map(monthTabs.map((item) => [item.month, item])), [monthTabs]);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, PlannerEntry[]>();
    for (const entry of data?.entries ?? []) {
      const bucket = map.get(entry.entry_date) ?? [];
      bucket.push(entry);
      map.set(entry.entry_date, bucket);
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    }
    return map;
  }, [data?.entries]);

  const stats = useMemo(() => {
    const entries = data?.entries ?? [];
    const done = entries.filter((entry) => entry.status === "done").length;
    const working = entries.filter((entry) => entry.status === "working").length;
    const blocked = entries.filter((entry) => entry.status === "blocked").length;
    return { total: entries.length, done, working, blocked };
  }, [data?.entries]);

  const goPrevious = () => {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
      return;
    }
    setMonth((value) => value - 1);
  };

  const goNext = () => {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
      return;
    }
    setMonth((value) => value + 1);
  };

  const goToday = () => {
    const value = new Date();
    setYear(value.getFullYear());
    setMonth(value.getMonth() + 1);
  };

  const addEntry = (entryDate: string) => {
    const title = drafts[entryDate]?.trim();
    if (!title) return;
    createEntry.mutate({
      entry_date: entryDate,
      title,
      position: (entriesByDate.get(entryDate)?.length ?? 0) + 1,
    });
    setDrafts((previous) => ({ ...previous, [entryDate]: "" }));
  };

  const commitMonth = (payload: { objectives?: string[]; notes?: string[] }) => {
    if (!activeMonth) return;
    updateMonth.mutate({ id: activeMonth.id, ...payload });
  };

  return (
    <main className="flex h-full min-h-0 flex-col bg-muted/20">
      <header className="border-b bg-background px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground">Planner</div>
            <h1 className="text-2xl font-semibold tracking-normal">
              {activeMonth?.title ?? MONTHS[month - 1]} {year}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={goPrevious} className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted">
              Prev
            </button>
            <button type="button" onClick={goToday} className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted">
              Today
            </button>
            <button type="button" onClick={goNext} className="rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted">
              Next
            </button>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {MONTHS.map((label, index) => {
            const value = index + 1;
            const meta = monthMeta.get(value);
            const selected = value === month;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setMonth(value)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                  selected ? "border-foreground bg-foreground text-background" : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ backgroundColor: meta?.tab_color ?? (selected ? "currentColor" : "#d4d4d8") }}
                />
                {label.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-2 border-b bg-background px-4 py-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Entries</div>
          <div className="mt-1 text-2xl font-semibold">{stats.total}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Working</div>
          <div className="mt-1 text-2xl font-semibold">{stats.working}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Done</div>
          <div className="mt-1 text-2xl font-semibold">{stats.done}</div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">Blocked</div>
          <div className="mt-1 text-2xl font-semibold">{stats.blocked}</div>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
            {Array.from({ length: 35 }, (_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="mb-2 hidden grid-cols-7 gap-2 md:grid">
              {WEEKDAYS.map((day) => (
                <div key={day} className="px-2 text-xs font-semibold uppercase text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
              {cells.map((cell) => {
                if (!cell.date || !cell.day) {
                  return <div key={cell.key} className="hidden min-h-32 rounded-lg border border-dashed border-transparent md:block" />;
                }

                const entries = entriesByDate.get(cell.date) ?? [];
                const draft = drafts[cell.date] ?? "";
                const isToday = cell.date === currentToday;

                return (
                  <article key={cell.key} className={`min-h-36 rounded-lg border bg-background p-2 ${isToday ? "border-foreground" : "border-border"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className={`grid size-7 place-items-center rounded-full text-sm font-semibold ${isToday ? "bg-foreground text-background" : "bg-muted"}`}>
                        {cell.day}
                      </div>
                      {entries.length > 0 && <div className="text-xs text-muted-foreground">{entries.length}</div>}
                    </div>

                    <div className="space-y-1.5">
                      {entries.map((entry) => (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          onRename={(title) => updateEntry.mutate({ id: entry.id, title })}
                          onStatus={(status) => updateEntry.mutate({ id: entry.id, status })}
                          onDelete={() => deleteEntry.mutate(entry.id)}
                        />
                      ))}
                    </div>

                    <div className="mt-2 flex items-center gap-1 rounded-md border border-dashed bg-muted/20 px-1.5">
                      <input
                        value={draft}
                        placeholder="Add task"
                        onChange={(event) => setDrafts((previous) => ({ ...previous, [cell.date!]: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") addEntry(cell.date!);
                        }}
                        className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
                      />
                      <button
                        type="button"
                        onClick={() => addEntry(cell.date!)}
                        className="grid size-6 shrink-0 place-items-center rounded bg-background text-sm hover:bg-muted"
                        aria-label={`Add task on ${cell.date}`}
                      >
                        +
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="grid gap-3 border-t bg-background p-4 lg:grid-cols-2">
        <MonthTextarea
          label="Objectives"
          value={activeMonth?.objectives ?? []}
          placeholder="One objective per line"
          onCommit={(objectives) => commitMonth({ objectives })}
        />
        <MonthTextarea
          label="Notes"
          value={activeMonth?.notes ?? []}
          placeholder="One note per line"
          onCommit={(notes) => commitMonth({ notes })}
        />
      </section>
    </main>
  );
}
