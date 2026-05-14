import type { GoalStatus } from "../types";

export const GOAL_STATUS_ORDER: GoalStatus[] = [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
];

export const GOAL_STATUS_CONFIG: Record<
  GoalStatus,
  {
    dotColor: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  planned: {
    dotColor: "bg-sky-500",
    badgeBg: "bg-sky-500/10",
    badgeText: "text-sky-700 dark:text-sky-300",
  },
  in_progress: {
    dotColor: "bg-amber-500",
    badgeBg: "bg-amber-500/10",
    badgeText: "text-amber-700 dark:text-amber-300",
  },
  paused: {
    dotColor: "bg-zinc-500",
    badgeBg: "bg-zinc-500/10",
    badgeText: "text-zinc-700 dark:text-zinc-300",
  },
  completed: {
    dotColor: "bg-emerald-500",
    badgeBg: "bg-emerald-500/10",
    badgeText: "text-emerald-700 dark:text-emerald-300",
  },
  cancelled: {
    dotColor: "bg-rose-500",
    badgeBg: "bg-rose-500/10",
    badgeText: "text-rose-700 dark:text-rose-300",
  },
};
