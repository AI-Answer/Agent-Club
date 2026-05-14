export type AgentManagerStatusState = 'idle' | 'starting' | 'ready' | 'error' | 'stopping' | 'disabled';

export type AgentManagerStatus = {
  state: AgentManagerStatusState;
  url: string;
  backendUrl: string;
  message?: string;
  detail?: string;
  updatedAt: number;
};

export type AgentManagerChatGoalAction = 'prep' | 'run';

export type AgentManagerGoalStatus = 'planned' | 'in_progress' | 'paused' | 'completed' | 'cancelled';

export interface AgentManagerChatGoalCommandRequest {
  action: AgentManagerChatGoalAction;
  title: string;
  body: string;
  projectHint?: string;
  tags?: string[];
  sourceConversationId: string;
  sourceConversationType?: string;
  sourceWorkspacePath?: string;
  rawInput: string;
}

export interface AgentManagerGoalSummary {
  id: string;
  title: string;
  description?: string | null;
  status: AgentManagerGoalStatus;
  project_id: string;
}

export interface AgentManagerGoalCommandResult {
  goal: AgentManagerGoalSummary;
  projectTitle?: string;
  action: AgentManagerChatGoalAction;
  goalUrl: string;
  managerUrl: string;
  expanded: boolean;
  taskId?: string;
  readinessReady?: boolean;
  warning?: string;
}
