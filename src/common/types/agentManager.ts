export type AgentManagerStatusState = 'idle' | 'starting' | 'ready' | 'error' | 'stopping' | 'disabled';

export type AgentManagerStatus = {
  state: AgentManagerStatusState;
  url: string;
  backendUrl: string;
  message?: string;
  detail?: string;
  updatedAt: number;
};
