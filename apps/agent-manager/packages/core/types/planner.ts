import type { IssuePriority, IssueAssigneeType } from "./issue";

export type PlannerEntryStatus =
  | "planned"
  | "queued"
  | "working"
  | "done"
  | "blocked"
  | "skipped";

export interface PlannerMonth {
  id: string;
  workspace_id: string;
  year: number;
  month: number;
  title: string;
  tab_color: string | null;
  objectives: string[];
  notes: string[];
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlannerEntry {
  id: string;
  workspace_id: string;
  planner_month_id: string;
  entry_date: string;
  title: string;
  body: string | null;
  color: string | null;
  status: PlannerEntryStatus;
  priority: IssuePriority;
  position: number;
  project_id: string | null;
  goal_id: string | null;
  issue_id: string | null;
  assignee_type: IssueAssigneeType | null;
  assignee_id: string | null;
  created_by_type: "member" | "agent" | "system";
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannerDayMark {
  id: string;
  workspace_id: string;
  planner_month_id: string;
  mark_date: string;
  color: string;
  label: string | null;
  created_by_type: "member" | "agent" | "system";
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlannerMonthDetailResponse {
  month: PlannerMonth;
  entries: PlannerEntry[];
  day_marks: PlannerDayMark[];
}

export interface ListPlannerMonthsResponse {
  months: PlannerMonth[];
  total: number;
}

export interface UpdatePlannerMonthRequest {
  title?: string;
  tab_color?: string | null;
  objectives?: string[];
  notes?: string[];
  settings?: Record<string, unknown>;
}

export interface CreatePlannerEntryRequest {
  entry_date: string;
  title: string;
  body?: string | null;
  color?: string | null;
  status?: PlannerEntryStatus;
  priority?: IssuePriority;
  position?: number;
  project_id?: string | null;
  goal_id?: string | null;
  issue_id?: string | null;
  assignee_type?: IssueAssigneeType | null;
  assignee_id?: string | null;
}

export interface UpdatePlannerEntryRequest {
  entry_date?: string;
  title?: string;
  body?: string | null;
  color?: string | null;
  status?: PlannerEntryStatus;
  priority?: IssuePriority;
  position?: number;
  project_id?: string | null;
  goal_id?: string | null;
  issue_id?: string | null;
  assignee_type?: IssueAssigneeType | null;
  assignee_id?: string | null;
}

export interface UpdatePlannerDayMarkRequest {
  color: string;
  label?: string | null;
}

export interface PlannerContextResponse {
  date: string;
  month: PlannerMonth;
  entries: PlannerEntry[];
  day_mark: PlannerDayMark | null;
  objectives: string[];
  notes: string[];
}
