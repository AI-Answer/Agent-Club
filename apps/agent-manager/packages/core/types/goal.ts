export type GoalStatus = "planned" | "in_progress" | "paused" | "completed" | "cancelled";

export type GoalPlannerType = "member" | "agent" | "squad";

export interface Goal {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  planner_type: GoalPlannerType | null;
  planner_id: string | null;
  created_by_type: "member" | "agent";
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateGoalRequest {
  project_id: string;
  title: string;
  description?: string;
  status?: GoalStatus;
  planner_type?: GoalPlannerType;
  planner_id?: string;
}

export interface UpdateGoalRequest {
  project_id?: string;
  title?: string;
  description?: string | null;
  status?: GoalStatus;
  planner_type?: GoalPlannerType | null;
  planner_id?: string | null;
}

export interface ListGoalsResponse {
  goals: Goal[];
  total: number;
}

export type GoalReadinessRoleName = "planner" | "worker" | "reviewer";

export type GoalReadinessStatus = "ready" | "missing";

export interface GoalReadinessActor {
  type: "agent" | "squad";
  id: string;
  name: string;
  agent_id?: string;
  runtime_id?: string;
  runtime_status?: string;
  enabled: boolean;
  reason?: string;
}

export interface GoalReadinessRole {
  role: GoalReadinessRoleName;
  label: string;
  required: boolean;
  status: GoalReadinessStatus;
  actor?: GoalReadinessActor;
  candidates: GoalReadinessActor[];
  missing_reason?: string;
}

export interface GoalReadinessResponse {
  goal_id: string;
  ready: boolean;
  roles: GoalReadinessRole[];
}

export interface ExpandGoalRequest {
  planner_type?: "agent" | "squad";
  planner_id?: string;
  prompt?: string;
}

export interface ExpandGoalResponse {
  task_id: string;
  readiness: GoalReadinessResponse;
}
