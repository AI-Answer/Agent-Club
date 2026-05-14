"use client";

import type { GoalStatus } from "@multica/core/types";
import { useT } from "../../i18n";

export function useGoalStatusLabels(): Record<GoalStatus, string> {
  const { t } = useT("goals");
  return {
    planned: t(($) => $.status.planned),
    in_progress: t(($) => $.status.in_progress),
    paused: t(($) => $.status.paused),
    completed: t(($) => $.status.completed),
    cancelled: t(($) => $.status.cancelled),
  };
}
