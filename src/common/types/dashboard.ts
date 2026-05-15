import type { AgentManagerStatus } from './agentManager';

export type DashboardSourceId =
  | 'honcho'
  | 'scheduled_tasks'
  | 'agent_manager'
  | 'mcp'
  | 'channels'
  | 'manual_context'
  | 'email'
  | 'calendar'
  | 'todos'
  | 'custom_widget';

export type DashboardSourceState = 'connected' | 'disconnected' | 'degraded' | 'checking';

export type DashboardPriority = 'high' | 'medium' | 'low';

export type DashboardActionKind = 'navigate' | 'refresh' | 'setup_source';

export interface DashboardSourceStatus {
  id: DashboardSourceId;
  label: string;
  state: DashboardSourceState;
  detail: string;
  connectedAt?: number;
  updatedAt: number;
  setupRoute?: string;
}

export interface DashboardAction {
  id: string;
  title: string;
  description: string;
  priority: DashboardPriority;
  sourceIds: DashboardSourceId[];
  ctaLabel: string;
  action: {
    kind: DashboardActionKind;
    route?: string;
    sourceId?: DashboardSourceId;
  };
  createdAt: number;
}

export interface DashboardWorkItem {
  id: string;
  title: string;
  description: string;
  status: string;
  sourceId: DashboardSourceId;
  sourceLabel: string;
  route?: string;
  updatedAt?: number;
}

export interface DashboardInsight {
  id: string;
  title: string;
  body: string;
  sourceIds: DashboardSourceId[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DashboardFocusItem {
  id: string;
  title: string;
  description: string;
  nextStep: string;
  horizon: string;
  priority: DashboardPriority;
  sourceIds: DashboardSourceId[];
}

export interface DashboardAutomationIdea {
  id: string;
  title: string;
  description: string;
  estimatedMinutesSaved: number;
  sourceIds: DashboardSourceId[];
  ctaLabel: string;
  route?: string;
}

export type DashboardWidgetKind =
  | 'metrics'
  | 'focus'
  | 'hermes_control'
  | 'activity'
  | 'brief_sources'
  | 'actions'
  | 'active_work'
  | 'relevant_links'
  | 'insights'
  | 'automations'
  | 'custom_lab'
  | 'manual_context'
  | 'custom';

export interface DashboardWidgetLayout {
  id: string;
  kind: DashboardWidgetKind;
  title: string;
  size: 'full' | 'wide' | 'half' | 'third';
  hidden?: boolean;
}

export interface DashboardActivityDay {
  date: string;
  value: number;
  intensity: 0 | 1 | 2 | 3 | 4;
  label: string;
}

export interface DashboardActivityStat {
  label: string;
  value: string;
}

export interface DashboardActivityOverview {
  title: string;
  rangeLabel: string;
  stats: DashboardActivityStat[];
  days: DashboardActivityDay[];
  footnote: string;
}

export interface DashboardRelevantLink {
  id: string;
  title: string;
  description: string;
  priority: DashboardPriority;
  sourceIds: DashboardSourceId[];
  reason: string;
  ctaLabel: string;
  route?: string;
  url?: string;
  status: 'ready' | 'setup_required';
  createdAt: number;
}

export interface DashboardCustomWidgetMetric {
  label: string;
  value: string;
  detail: string;
}

export interface DashboardCustomWidgetSpec {
  id: string;
  title: string;
  prompt: string;
  summary: string;
  metrics: DashboardCustomWidgetMetric[];
  sourceIds: DashboardSourceId[];
  status: 'preview' | 'setup_required' | 'live';
  createdAt: number;
  updatedAt: number;
}

export type DashboardHermesItemStatus = 'connected' | 'ready' | 'setup_required' | 'blocked';

export interface DashboardHermesMcpApp {
  id: string;
  title: string;
  description: string;
  authLabel: string;
  toolCount: number;
  triggerCount: number;
  tags: string[];
  status: DashboardHermesItemStatus;
  installed: boolean;
  ctaLabel: string;
  route: string;
  sourceIds: DashboardSourceId[];
}

export interface DashboardHermesChannel {
  id: 'slack' | 'discord' | 'imessage';
  title: string;
  description: string;
  detail: string;
  status: DashboardHermesItemStatus;
  hermesOnly: boolean;
  ctaLabel: string;
  route: string;
  sourceIds: DashboardSourceId[];
}

export interface DashboardScheduledTaskSummary {
  id: string;
  name: string;
  description?: string;
  nextRunAtMs?: number;
  route: string;
}

export interface DashboardMetrics {
  completedTasksTotal: number;
  activeTasksTotal: number;
  queuedTasksTotal: number;
  scheduledTasksTotal: number;
  scheduledRunsTotal: number;
  estimatedMinutesSaved: number;
  nextScheduledTask?: DashboardScheduledTaskSummary;
}

export interface DashboardScheduleStatus {
  enabled: boolean;
  hour: number;
  minute: number;
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  label: string;
}

export interface DashboardHermesScheduledWork {
  totalScheduledTasks: number;
  hermesScheduledTasks: number;
  detail: string;
  nextHermesTask?: DashboardScheduledTaskSummary;
  items: DashboardScheduledTaskSummary[];
}

export interface DashboardHermesControlCenter {
  title: string;
  subtitle: string;
  primaryCtaLabel: string;
  primaryCtaRoute: string;
  mcpApps: DashboardHermesMcpApp[];
  channels: DashboardHermesChannel[];
  scheduledWork: DashboardHermesScheduledWork;
  updatedAt: number;
}

export interface DashboardConfig {
  morningRefreshEnabled: boolean;
  morningRefreshHour: number;
  morningRefreshMinute: number;
  lastMorningRefreshAt?: number;
  widgetLayout: DashboardWidgetLayout[];
  customWidgets: DashboardCustomWidgetSpec[];
}

export interface DashboardAgentManagerSummary {
  status: AgentManagerStatus;
  goalsTotal: number;
  activeGoals: number;
  completedGoals: number;
  issuesTotal: number;
  activeIssues: number;
  completedIssues: number;
  activeGoalPreview: DashboardWorkItem[];
  activeIssuePreview: DashboardWorkItem[];
}

export interface DashboardSnapshot {
  id: string;
  generatedAt: number;
  summary: {
    title: string;
    brief: string;
    nextBestMove: string;
    confidence: 'high' | 'medium' | 'low';
  };
  metrics: DashboardMetrics;
  morningRefresh: DashboardScheduleStatus;
  hermesControl: DashboardHermesControlCenter;
  widgetLayout: DashboardWidgetLayout[];
  focusItems: DashboardFocusItem[];
  activity: DashboardActivityOverview;
  relevantLinks: DashboardRelevantLink[];
  customWidgets: DashboardCustomWidgetSpec[];
  actions: DashboardAction[];
  activeWork: DashboardWorkItem[];
  insights: DashboardInsight[];
  automationIdeas: DashboardAutomationIdea[];
  sources: DashboardSourceStatus[];
}

export interface DashboardSnapshotRequest {
  reason?: 'initial' | 'manual' | 'heartbeat' | 'hard_refresh' | 'context';
  context?: string;
}

export interface DashboardActionRequest {
  actionId: string;
}

export interface DashboardContextRequest {
  context: string;
}

export interface DashboardHardRefreshRequest {
  context?: string;
}

export interface DashboardLayoutUpdateRequest {
  layout: DashboardWidgetLayout[];
}

export interface DashboardCustomWidgetRequest {
  prompt: string;
}

export interface DashboardActionResult {
  success: boolean;
  message?: string;
  route?: string;
  snapshot?: DashboardSnapshot;
}
