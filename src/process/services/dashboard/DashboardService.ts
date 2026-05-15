import type { ICronJob } from '@/common/adapter/ipcBridge';
import type {
  DashboardAction,
  DashboardActionRequest,
  DashboardActionResult,
  DashboardActivityOverview,
  DashboardAgentManagerSummary,
  DashboardAutomationIdea,
  DashboardConfig,
  DashboardContextRequest,
  DashboardCustomWidgetRequest,
  DashboardCustomWidgetSpec,
  DashboardHardRefreshRequest,
  DashboardFocusItem,
  DashboardInsight,
  DashboardLayoutUpdateRequest,
  DashboardMetrics,
  DashboardRelevantLink,
  DashboardScheduleStatus,
  DashboardScheduledTaskSummary,
  DashboardSnapshot,
  DashboardSnapshotRequest,
  DashboardSourceId,
  DashboardSourceStatus,
  DashboardWidgetLayout,
  DashboardWorkItem,
} from '@/common/types/dashboard';
import { AGENT_MANAGER_NAME } from '@/common/config/appBrand';
import { cronService } from '@process/services/cron/cronServiceSingleton';
import { honchoMemoryService } from '@process/services/memory/HonchoMemoryService';
import { agentManagerService } from '@process/services/agentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { ProcessConfig } from '@process/utils/initStorage';

const SNAPSHOT_HISTORY_LIMIT = 30;
const INITIAL_REFRESH_THROTTLE_MS = 45 * 1000;
const FIFTEEN_MINUTES = 15;
const TEN_MINUTES = 10;
const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  morningRefreshEnabled: true,
  morningRefreshHour: 5,
  morningRefreshMinute: 0,
  widgetLayout: [],
  customWidgets: [],
};

const DEFAULT_WIDGET_LAYOUT: DashboardWidgetLayout[] = [
  { id: 'metrics', kind: 'metrics', title: 'Metrics', size: 'full' },
  { id: 'focus', kind: 'focus', title: 'Focus This Week', size: 'wide' },
  { id: 'activity', kind: 'activity', title: 'Activity', size: 'third' },
  { id: 'brief_sources', kind: 'brief_sources', title: "Today's Brief + Sources", size: 'half' },
  { id: 'actions', kind: 'actions', title: 'Action Required', size: 'half' },
  { id: 'active_work', kind: 'active_work', title: 'Active Work', size: 'half' },
  { id: 'relevant_links', kind: 'relevant_links', title: 'Relevant Links', size: 'half' },
  { id: 'insights', kind: 'insights', title: 'Key Insights', size: 'half' },
  { id: 'automations', kind: 'automations', title: 'Things To Automate', size: 'half' },
  { id: 'custom_lab', kind: 'custom_lab', title: 'Build A Widget', size: 'half' },
  { id: 'manual_context', kind: 'manual_context', title: 'Manual Reorientation', size: 'half' },
];

const CURRENT_FOCUS_CONTEXT =
  'Sam said the most important tasks for this and next week are webinar prep until Monday, May 18, 2026, building the AI operating systems course video, and making Agent Club useful as the resource/demo shown to people.';

const CURRENT_FOCUS_ITEMS: DashboardFocusItem[] = [
  {
    id: 'webinar-prep',
    title: 'Prepare the webinar',
    description: 'This is the biggest near-term goal until Monday, May 18, 2026.',
    nextStep: 'Turn the webinar into an outline, demo checklist, and rehearsal plan.',
    horizon: 'Now to May 18',
    priority: 'high',
    sourceIds: ['manual_context', 'honcho'],
  },
  {
    id: 'aios-course-video',
    title: 'Build the AIOS course video',
    description: 'Create the course asset that explains AI operating systems clearly.',
    nextStep: 'Script the proof points, then use Agent Club as the live operating example.',
    horizon: 'This week',
    priority: 'high',
    sourceIds: ['manual_context', 'honcho'],
  },
  {
    id: 'agent-club-demo',
    title: 'Make Agent Club demo-ready',
    description: 'Keep Agent Club scoped to the resource you can show in the webinar/course.',
    nextStep: 'Prioritize fixes that make the dashboard, goals, and agent work visible.',
    horizon: 'Supporting track',
    priority: 'medium',
    sourceIds: ['manual_context', 'agent_manager'],
  },
];

type DashboardMemoryResult = {
  configured: boolean;
  source: DashboardSourceStatus;
  insight?: DashboardInsight;
  chiefOfStaffBrief?: string;
  focusHint?: string;
  delegationHint?: string;
  clarityHint?: string;
};

type DashboardAgentManagerResult = {
  source: DashboardSourceStatus;
  summary: DashboardAgentManagerSummary;
};

function nowId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

function truncate(value: string | null | undefined, max = 220): string {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) {
    return cleaned;
  }
  return `${cleaned.slice(0, max - 1).trim()}...`;
}

function sourceStatus(
  id: DashboardSourceId,
  label: string,
  state: DashboardSourceStatus['state'],
  detail: string,
  options: Pick<DashboardSourceStatus, 'setupRoute' | 'connectedAt'> = {}
): DashboardSourceStatus {
  return {
    id,
    label,
    state,
    detail,
    setupRoute: options.setupRoute,
    connectedAt: options.connectedAt,
    updatedAt: Date.now(),
  };
}

function compareNextRun(a: ICronJob, b: ICronJob): number {
  const aNext = a.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
  const bNext = b.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER;
  return aNext - bNext;
}

function toScheduledTaskSummary(job: ICronJob): DashboardScheduledTaskSummary {
  return {
    id: job.id,
    name: job.name,
    description: job.description || job.schedule.description,
    nextRunAtMs: job.state.nextRunAtMs,
    route: `/scheduled/${job.id}`,
  };
}

function activeCronWorkItems(jobs: ICronJob[]): DashboardWorkItem[] {
  return jobs
    .filter((job) => job.enabled)
    .toSorted(compareNextRun)
    .slice(0, 3)
    .map((job) => ({
      id: `cron-${job.id}`,
      title: job.name,
      description: job.description || job.schedule.description || 'Scheduled automation is queued.',
      status: job.state.nextRunAtMs ? 'queued' : 'active',
      sourceId: 'scheduled_tasks',
      sourceLabel: 'Scheduled Tasks',
      route: `/scheduled/${job.id}`,
      updatedAt: job.metadata.updatedAt,
    }));
}

function countCompletedScheduledRuns(jobs: ICronJob[]): number {
  return jobs.reduce((total, job) => {
    if (job.state.lastStatus !== 'ok') {
      return total;
    }
    return total + Math.max(1, job.state.runCount || 0);
  }, 0);
}

function firstMatchingLine(lines: string[], patterns: RegExp[]): string | undefined {
  return lines.find((line) => patterns.some((pattern) => pattern.test(line)));
}

function extractBriefLine(brief: string | undefined, patterns: RegExp[]): string | undefined {
  if (!brief) {
    return undefined;
  }

  const lines = brief
    .split('\n')
    .map((line) => line.replace(/^[-*#\d.\s]+/, '').trim())
    .filter(Boolean);
  return firstMatchingLine(lines, patterns);
}

function localDateKey(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function displayDay(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

export class DashboardService {
  private morningTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotEmitter: ((snapshot: DashboardSnapshot) => void) | null = null;
  private latestSnapshot: DashboardSnapshot | null = null;
  private initialRefreshPromise: Promise<void> | null = null;
  private lastInitialRefreshStartedAt = 0;

  constructor(private readonly workerTaskManager: IWorkerTaskManager) {}

  async getSnapshot(request: DashboardSnapshotRequest = {}): Promise<DashboardSnapshot> {
    if (request.reason === 'initial') {
      const cachedSnapshot = await this.getCachedSnapshot();
      if (cachedSnapshot) {
        this.refreshInitialSnapshotInBackground(request);
        return cachedSnapshot;
      }
    }

    return this.buildAndPersistSnapshot(request);
  }

  private async buildAndPersistSnapshot(request: DashboardSnapshotRequest = {}): Promise<DashboardSnapshot> {
    const snapshot = await this.buildSnapshot(request);
    this.latestSnapshot = snapshot;
    await this.persistSnapshot(snapshot);
    return snapshot;
  }

  private async getCachedSnapshot(): Promise<DashboardSnapshot | null> {
    if (this.latestSnapshot) {
      return this.latestSnapshot;
    }

    try {
      const stored = ((await ProcessConfig.get('dashboard.snapshots')) as DashboardSnapshot[] | undefined) || [];
      const cachedSnapshot = stored.find((item) => this.isUsableSnapshot(item)) || null;
      if (cachedSnapshot) {
        this.latestSnapshot = cachedSnapshot;
      }
      return cachedSnapshot;
    } catch (error) {
      console.warn('[Dashboard] Failed to read cached snapshot:', error);
      return null;
    }
  }

  private isUsableSnapshot(value: unknown): value is DashboardSnapshot {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const snapshot = value as Partial<DashboardSnapshot>;
    return Boolean(
      typeof snapshot.id === 'string' &&
        typeof snapshot.generatedAt === 'number' &&
        snapshot.summary &&
        snapshot.metrics &&
        Array.isArray(snapshot.widgetLayout) &&
        Array.isArray(snapshot.sources)
    );
  }

  private refreshInitialSnapshotInBackground(request: DashboardSnapshotRequest): void {
    const now = Date.now();
    if (this.initialRefreshPromise || now - this.lastInitialRefreshStartedAt < INITIAL_REFRESH_THROTTLE_MS) {
      return;
    }

    this.lastInitialRefreshStartedAt = now;
    this.initialRefreshPromise = this.buildAndPersistSnapshot({ ...request, reason: 'initial' })
      .then((snapshot) => {
        this.snapshotEmitter?.(snapshot);
      })
      .catch((error) => {
        console.warn('[Dashboard] Background refresh failed:', error);
      })
      .finally(() => {
        this.initialRefreshPromise = null;
      });
  }

  async runHeartbeat(): Promise<DashboardSnapshot> {
    return this.getSnapshot({ reason: 'heartbeat' });
  }

  async hardRefresh(request: DashboardHardRefreshRequest = {}): Promise<DashboardSnapshot> {
    this.latestSnapshot = null;
    await ProcessConfig.set('dashboard.snapshots', []);
    return this.getSnapshot({ reason: 'hard_refresh', context: request.context });
  }

  async rebuildWithContext(request: DashboardContextRequest): Promise<DashboardSnapshot> {
    return this.getSnapshot({ reason: 'context', context: request.context });
  }

  async updateLayout(request: DashboardLayoutUpdateRequest): Promise<DashboardSnapshot> {
    const config = await this.getConfig();
    await ProcessConfig.set('dashboard.config', {
      ...config,
      widgetLayout: this.normalizeWidgetLayout(request.layout, config.customWidgets),
    });
    return this.getSnapshot({ reason: 'manual' });
  }

  async createCustomWidget(request: DashboardCustomWidgetRequest): Promise<DashboardSnapshot> {
    const prompt = truncate(request.prompt, 700);
    if (!prompt) {
      throw new Error('Add a widget prompt first.');
    }

    const config = await this.getConfig();
    const spec = this.buildCustomWidgetSpec(prompt);
    const customWidgets = [spec, ...config.customWidgets].slice(0, 6);
    const widgetLayout = this.normalizeWidgetLayout(
      [
        ...config.widgetLayout,
        {
          id: spec.id,
          kind: 'custom',
          title: spec.title,
          size: 'half',
        },
      ],
      customWidgets
    );

    await ProcessConfig.set('dashboard.config', {
      ...config,
      customWidgets,
      widgetLayout,
    });

    return this.getSnapshot({ reason: 'context', context: prompt });
  }

  startMorningRefresh(emitSnapshot: (snapshot: DashboardSnapshot) => void): void {
    this.snapshotEmitter = emitSnapshot;
    if (this.morningTimer) {
      return;
    }
    void this.scheduleNextMorningRefresh();
  }

  async getMorningRefreshStatus(): Promise<DashboardScheduleStatus> {
    const config = await this.getConfig();
    return this.buildMorningRefreshStatus(config);
  }

  async applyAction(request: DashboardActionRequest): Promise<DashboardActionResult> {
    if (request.actionId === 'refresh-dashboard') {
      const snapshot = await this.runHeartbeat();
      return { success: true, message: 'Dashboard refreshed.', snapshot };
    }

    if (request.actionId === 'hard-refresh-dashboard') {
      const snapshot = await this.hardRefresh();
      return { success: true, message: 'Dashboard hard refreshed.', snapshot };
    }

    const route = this.routeForAction(request.actionId);
    if (route) {
      return { success: true, route };
    }

    return { success: false, message: 'This dashboard action is not wired yet.' };
  }

  private async buildSnapshot(request: DashboardSnapshotRequest = {}): Promise<DashboardSnapshot> {
    const generatedAt = Date.now();
    const userContext = truncate(request.context, 500);
    const config = await this.getConfig();
    const sources: DashboardSourceStatus[] = [];
    const actions: DashboardAction[] = [];
    const insights: DashboardInsight[] = [];
    const automationIdeas: DashboardAutomationIdea[] = [];
    const activeWork: DashboardWorkItem[] = [];

    const [jobs, memoryResult, agentManagerResult] = await Promise.all([
      this.safeListCronJobs(),
      this.withTimeout<DashboardMemoryResult>(this.safeMemorySnapshot(), 15000, () => ({
        configured: true,
        source: sourceStatus(
          'honcho',
          'Honcho Memory',
          'degraded',
          'Honcho is connected, but the memory pass took too long for this dashboard load.',
          { setupRoute: '/settings/memory' }
        ),
        focusHint: 'Honcho memory is the source of truth, but this load timed out before it returned guidance.',
      })),
      this.withTimeout<DashboardAgentManagerResult>(this.safeAgentManagerSummary(), 2500, () => {
        const status = agentManagerService.getStatus();
        return {
          summary: {
            status,
            goalsTotal: 0,
            activeGoals: 0,
            completedGoals: 0,
            issuesTotal: 0,
            activeIssues: 0,
            completedIssues: 0,
            activeGoalPreview: [],
            activeIssuePreview: [],
          } satisfies DashboardAgentManagerSummary,
          source: sourceStatus(
            'agent_manager',
            AGENT_MANAGER_NAME,
            'degraded',
            `${AGENT_MANAGER_NAME} stats are taking longer than expected.`,
            { setupRoute: '/agent-manager' }
          ),
        };
      }),
    ]);

    const runningTasks = this.safeRunningTaskCount();
    const morningRefresh = this.buildMorningRefreshStatus(config);
    const focusItems = CURRENT_FOCUS_ITEMS;
    const enabledJobs = jobs.filter((job) => job.enabled);
    const nextScheduledTask = enabledJobs.toSorted(compareNextRun)[0];
    const completedScheduledRuns = countCompletedScheduledRuns(jobs);

    sources.push(
      memoryResult.source,
      jobs.length > 0
        ? sourceStatus('scheduled_tasks', 'Scheduled Tasks', 'connected', `${jobs.length} scheduled task${jobs.length === 1 ? '' : 's'} found.`)
        : sourceStatus('scheduled_tasks', 'Scheduled Tasks', 'connected', 'No scheduled tasks yet.'),
      agentManagerResult.source,
      ...(userContext || focusItems.length
        ? [
            sourceStatus(
              'manual_context',
              'Manual Context',
              'connected',
              userContext ? 'Applied to this dashboard rebuild.' : 'Pinned focus from Sam for this and next week.'
            ),
          ]
        : []),
      sourceStatus('email', 'Email', 'disconnected', 'Connect Gmail or another inbox source to surface replies and follow-ups.', {
        setupRoute: '/settings/capabilities',
      }),
      sourceStatus('calendar', 'Calendar', 'disconnected', 'Connect calendar access to turn meetings into prep and follow-up actions.', {
        setupRoute: '/settings/capabilities',
      }),
      sourceStatus('todos', 'Todo Lists', 'disconnected', 'Connect a todo source to reconcile personal tasks with agent work.', {
        setupRoute: '/settings/capabilities',
      }),
      sourceStatus(
        'custom_widget',
        'Custom Widgets',
        'connected',
        config.customWidgets.length
          ? `${config.customWidgets.length} dashboard-only widget spec${config.customWidgets.length === 1 ? '' : 's'} saved.`
          : 'No custom widget specs yet. Use Build a Widget to add one.'
      )
    );

    actions.push(
      {
        id: 'focus-webinar-prep',
        title: 'Prepare webinar first',
        description: 'Create the webinar outline, demo checklist, and rehearsal plan before lower-priority work.',
        priority: 'high',
        sourceIds: ['manual_context', 'honcho'],
        ctaLabel: 'Open Agent Manager',
        action: { kind: 'navigate', route: '/agent-manager' },
        createdAt: generatedAt,
      },
      {
        id: 'focus-aios-course-video',
        title: 'Build the AIOS course video',
        description: 'Turn the AI operating systems idea into the course video asset and use Agent Club as the live proof.',
        priority: 'high',
        sourceIds: ['manual_context', 'honcho'],
        ctaLabel: 'Open Agent Manager',
        action: { kind: 'navigate', route: '/agent-manager' },
        createdAt: generatedAt,
      },
      {
        id: 'focus-agent-club-demo',
        title: 'Make Agent Club showable',
        description: 'Only take Agent Club tasks that help the webinar/course demo become clearer and more reliable.',
        priority: 'medium',
        sourceIds: ['manual_context', 'agent_manager'],
        ctaLabel: 'Open Agent Manager',
        action: { kind: 'navigate', route: '/agent-manager' },
        createdAt: generatedAt,
      }
    );

    if (!memoryResult.configured) {
      actions.push({
        id: 'setup-honcho-memory',
        title: 'Connect Honcho memory',
        description: 'Memory is the core source for personal chief-of-staff insights. Connect Honcho before trusting personal recommendations.',
        priority: 'high',
        sourceIds: ['honcho'],
        ctaLabel: 'Open Memory',
        action: { kind: 'setup_source', route: '/settings/memory', sourceId: 'honcho' },
        createdAt: generatedAt,
      });
    } else if (memoryResult.insight) {
      insights.push(memoryResult.insight);
    }

    if (memoryResult.configured && memoryResult.focusHint) {
      insights.push({
        id: 'honcho-focus',
        title: 'What needs focus',
        body: memoryResult.focusHint,
        sourceIds: ['honcho'],
        confidence: memoryResult.chiefOfStaffBrief ? 'high' : 'medium',
      });
      actions.push({
        id: 'act-on-honcho-priority',
        title: 'Move the Honcho priority forward',
        description: memoryResult.focusHint,
        priority: 'high',
        sourceIds: ['honcho'],
        ctaLabel: 'Refresh',
        action: { kind: 'refresh' },
        createdAt: generatedAt,
      });
    }

    if (memoryResult.configured && memoryResult.delegationHint) {
      insights.push({
        id: 'honcho-delegation',
        title: 'What an agent can take',
        body: memoryResult.delegationHint,
        sourceIds: ['honcho', 'agent_manager'],
        confidence: memoryResult.chiefOfStaffBrief ? 'high' : 'medium',
      });
      actions.push({
        id: 'delegate-from-honcho-memory',
        title: 'Take one thing off your plate',
        description: memoryResult.delegationHint,
        priority: 'medium',
        sourceIds: ['honcho', 'agent_manager'],
        ctaLabel: 'Open Agent Manager',
        action: { kind: 'navigate', route: '/agent-manager' },
        createdAt: generatedAt,
      });
    }

    if (memoryResult.configured && memoryResult.clarityHint) {
      insights.push({
        id: 'honcho-clarity',
        title: 'Reorientation cue',
        body: memoryResult.clarityHint,
        sourceIds: ['honcho'],
        confidence: 'medium',
      });
    }

    if (userContext) {
      insights.unshift({
        id: 'manual-context',
        title: 'Context from Sam',
        body: userContext,
        sourceIds: ['manual_context'],
        confidence: 'high',
      });
      insights.push({
        id: 'chief-of-staff-reasoning',
        title: 'Chief-of-staff reasoning',
        body:
          'I treated your typed context as the newest signal, then rebuilt the brief against memory, scheduled tasks, active agent work, and source health.',
        sourceIds: ['manual_context', 'honcho', 'scheduled_tasks', 'agent_manager'],
        confidence: 'medium',
      });
    }

    insights.unshift({
      id: 'current-focus-context',
      title: 'Current focus filter',
      body: CURRENT_FOCUS_CONTEXT,
      sourceIds: ['manual_context', 'honcho'],
      confidence: 'high',
    });

    if (agentManagerResult.summary.status.state !== 'ready') {
      actions.push({
        id: 'open-agent-manager',
        title: `Start ${AGENT_MANAGER_NAME}`,
        description: `${AGENT_MANAGER_NAME} is ${agentManagerResult.summary.status.state}; open it to see goals, tickets, and agent activity.`,
        priority: agentManagerResult.summary.status.state === 'error' ? 'high' : 'medium',
        sourceIds: ['agent_manager'],
        ctaLabel: 'Open Agent Manager',
        action: { kind: 'navigate', route: '/agent-manager' },
        createdAt: generatedAt,
      });
    }

    if (!enabledJobs.length) {
      actions.push({
        id: 'create-chief-of-staff-heartbeat',
        title: 'Create a chief-of-staff heartbeat',
        description: 'Add a recurring scheduled task so Agent Club can refresh priorities and automation ideas during the day.',
        priority: 'medium',
        sourceIds: ['scheduled_tasks'],
        ctaLabel: 'Open Scheduled Tasks',
        action: { kind: 'navigate', route: '/scheduled' },
        createdAt: generatedAt,
      });
    }

    actions.push({
      id: 'hard-refresh-dashboard',
      title: 'Hard refresh dashboard state',
      description:
        'Clear cached dashboard snapshots and rebuild from local sources when the page feels stale or empty.',
      priority: 'low',
      sourceIds: ['scheduled_tasks', 'agent_manager', 'honcho'],
      ctaLabel: 'Hard refresh',
      action: { kind: 'refresh' },
      createdAt: generatedAt,
    });

    actions.push({
      id: 'connect-work-sources',
      title: 'Connect email, calendar, and todo sources',
      description: 'Those connectors unlock real reply-needed, meeting-prep, and personal task actions instead of placeholders.',
      priority: 'medium',
      sourceIds: ['email', 'calendar', 'todos'],
      ctaLabel: 'Open Capabilities',
      action: { kind: 'setup_source', route: '/settings/capabilities' },
      createdAt: generatedAt,
    });

    activeWork.push(...agentManagerResult.summary.activeIssuePreview);
    activeWork.push(...agentManagerResult.summary.activeGoalPreview);
    activeWork.push(...activeCronWorkItems(jobs));
    if (runningTasks > 0) {
      activeWork.unshift({
        id: 'running-local-agent-tasks',
        title: `${runningTasks} local agent task${runningTasks === 1 ? '' : 's'} running`,
        description: 'Agent Club currently has live worker activity in this app session.',
        status: 'running',
        sourceId: 'agent_manager',
        sourceLabel: 'Agent Club',
        route: '/agent-manager',
        updatedAt: generatedAt,
      });
    }

    insights.push(
      {
        id: 'local-workload',
        title: 'Local workload',
        body:
          activeWork.length > 0
            ? `${activeWork.length} active or queued work item${activeWork.length === 1 ? '' : 's'} are visible from local Agent Club sources.`
            : 'No active local work is visible yet. This dashboard will get sharper as goals, scheduled tasks, and memory fill in.',
        sourceIds: ['scheduled_tasks', 'agent_manager'],
        confidence: 'high',
      },
      {
        id: 'source-coverage',
        title: 'Source coverage',
        body: 'The dashboard is grounded in local Agent Club data today. Email, calendar, and todo actions will stay setup-gated until those sources are connected.',
        sourceIds: ['email', 'calendar', 'todos'],
        confidence: 'high',
      }
    );

    automationIdeas.push(
      {
        id: 'daily-chief-of-staff-brief',
        title: 'Daily chief-of-staff brief',
        description: `${morningRefresh.label} is registered in Agent Club and will refresh the dashboard snapshot while the app is running.`,
        estimatedMinutesSaved: 25,
        sourceIds: ['honcho', 'scheduled_tasks'],
        ctaLabel: 'Schedule it',
        route: '/scheduled',
      },
      {
        id: 'meeting-follow-up-sweep',
        title: 'Meeting follow-up sweep',
        description: 'Once calendar is connected, auto-draft follow-ups and next actions after meetings instead of manually reconstructing them.',
        estimatedMinutesSaved: 20,
        sourceIds: ['calendar', 'email'],
        ctaLabel: 'Connect sources',
        route: '/settings/capabilities',
      },
      {
        id: 'goal-to-ticket-pipeline',
        title: 'Goal-to-ticket pipeline',
        description: `Use ${AGENT_MANAGER_NAME} goals as the long-running work queue, then surface stale or blocked tickets on this dashboard.`,
        estimatedMinutesSaved: 30,
        sourceIds: ['agent_manager'],
        ctaLabel: 'Open goals',
        route: '/agent-manager',
      }
    );

    const metrics: DashboardMetrics = {
      completedTasksTotal: agentManagerResult.summary.completedIssues,
      activeTasksTotal: runningTasks + agentManagerResult.summary.activeIssues + agentManagerResult.summary.activeGoals,
      queuedTasksTotal: enabledJobs.length + agentManagerResult.summary.activeIssues,
      scheduledTasksTotal: jobs.length,
      scheduledRunsTotal: completedScheduledRuns,
      estimatedMinutesSaved:
        agentManagerResult.summary.completedIssues * FIFTEEN_MINUTES + completedScheduledRuns * TEN_MINUTES,
      nextScheduledTask: nextScheduledTask ? toScheduledTaskSummary(nextScheduledTask) : undefined,
    };

    const activity = await this.buildActivityOverview(
      generatedAt,
      jobs,
      agentManagerResult.summary,
      metrics,
      config.customWidgets
    );
    const relevantLinks = this.buildRelevantLinks(
      generatedAt,
      focusItems,
      actions,
      activeWork,
      nextScheduledTask ? toScheduledTaskSummary(nextScheduledTask) : undefined
    );
    const summary = this.buildSummary(activeWork, memoryResult, userContext, request.reason);
    const widgetLayout = this.normalizeWidgetLayout(config.widgetLayout, config.customWidgets);

    return {
      id: nowId('dashboard'),
      generatedAt,
      summary,
      metrics,
      morningRefresh,
      widgetLayout,
      focusItems,
      activity,
      relevantLinks,
      customWidgets: config.customWidgets,
      actions: actions.slice(0, 4),
      activeWork: activeWork.slice(0, 4),
      insights: insights.slice(0, 4),
      automationIdeas,
      sources,
    };
  }

  private async buildActivityOverview(
    generatedAt: number,
    jobs: ICronJob[],
    agentManager: DashboardAgentManagerSummary,
    metrics: DashboardMetrics,
    customWidgets: DashboardCustomWidgetSpec[]
  ): Promise<DashboardActivityOverview> {
    const stored = ((await ProcessConfig.get('dashboard.snapshots')) as DashboardSnapshot[] | undefined) || [];
    const counts = new Map<string, number>();
    const now = new Date(generatedAt);
    const days: string[] = [];

    for (let index = 34; index >= 0; index -= 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - index);
      const key = localDateKey(day.getTime());
      days.push(key);
      counts.set(key, 0);
    }

    for (const snapshot of stored) {
      const key = localDateKey(snapshot.generatedAt);
      if (counts.has(key)) {
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const todayKey = localDateKey(generatedAt);
    const visibleWorkSignal = agentManager.activeIssues + agentManager.activeGoals + jobs.filter((job) => job.enabled).length;
    counts.set(todayKey, (counts.get(todayKey) || 0) + Math.max(1, visibleWorkSignal));

    const values = days.map((day) => counts.get(day) || 0);
    const maxValue = Math.max(1, ...values);
    const activeDays = values.filter((value) => value > 0).length;
    const peakHour = this.peakActivityHour(stored, generatedAt);
    const currentStreak = this.currentActivityStreak(days, counts);
    const longestStreak = this.longestActivityStreak(days, counts);
    const topSource =
      agentManager.activeIssues + agentManager.activeGoals > 0
        ? AGENT_MANAGER_NAME
        : jobs.length > 0
          ? 'Scheduled Tasks'
          : customWidgets.length > 0
            ? 'Custom Widgets'
            : 'Honcho';

    return {
      title: 'AIOS activity',
      rangeLabel: '35d',
      stats: [
        { label: 'Refreshes', value: stored.length.toLocaleString() },
        { label: 'Visible tasks', value: metrics.queuedTasksTotal.toLocaleString() },
        { label: 'Time saved', value: `${metrics.estimatedMinutesSaved}m` },
        { label: 'Active days', value: activeDays.toLocaleString() },
        { label: 'Current streak', value: `${currentStreak}d` },
        { label: 'Longest streak', value: `${longestStreak}d` },
        { label: 'Peak hour', value: peakHour },
        { label: 'Top source', value: topSource },
      ],
      days: days.map((day) => {
        const value = counts.get(day) || 0;
        return {
          date: day,
          value,
          intensity: value === 0 ? 0 : (Math.min(4, Math.max(1, Math.ceil((value / maxValue) * 4))) as 1 | 2 | 3 | 4),
          label: `${displayDay(day)}: ${value} local signal${value === 1 ? '' : 's'}`,
        };
      }),
      footnote:
        'Activity counts local dashboard refreshes plus currently visible Agent Club and scheduled-task signals. Disconnected email, calendar, todo, and revenue sources are excluded until connected.',
    };
  }

  private peakActivityHour(stored: DashboardSnapshot[], fallback: number): string {
    const counts = new Map<number, number>();
    for (const snapshot of stored) {
      const hour = new Date(snapshot.generatedAt).getHours();
      counts.set(hour, (counts.get(hour) || 0) + 1);
    }

    if (!counts.size) {
      const hour = new Date(fallback).getHours();
      counts.set(hour, 1);
    }

    const peak = [...counts.entries()].toSorted((a, b) => b[1] - a[1])[0][0];
    const date = new Date();
    date.setHours(peak, 0, 0, 0);
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date);
  }

  private currentActivityStreak(days: string[], counts: Map<string, number>): number {
    let streak = 0;
    for (let index = days.length - 1; index >= 0; index -= 1) {
      if ((counts.get(days[index]) || 0) === 0) {
        break;
      }
      streak += 1;
    }
    return streak;
  }

  private longestActivityStreak(days: string[], counts: Map<string, number>): number {
    let best = 0;
    let current = 0;
    for (const day of days) {
      if ((counts.get(day) || 0) > 0) {
        current += 1;
        best = Math.max(best, current);
      } else {
        current = 0;
      }
    }
    return best;
  }

  private buildRelevantLinks(
    generatedAt: number,
    focusItems: DashboardFocusItem[],
    actions: DashboardAction[],
    activeWork: DashboardWorkItem[],
    nextScheduledTask?: DashboardScheduledTaskSummary
  ): DashboardRelevantLink[] {
    const links: DashboardRelevantLink[] = focusItems.map((item) => ({
      id: `focus-link-${item.id}`,
      title: item.title,
      description: item.nextStep,
      priority: item.priority,
      sourceIds: item.sourceIds,
      reason: 'Pinned by the current Honcho/manual focus filter.',
      ctaLabel: 'Open Agent Manager',
      route: '/agent-manager',
      status: 'ready',
      createdAt: generatedAt,
    }));

    for (const item of activeWork.filter((work) => work.route).slice(0, 2)) {
      links.push({
        id: `work-link-${item.id}`,
        title: item.title,
        description: item.description,
        priority: item.status === 'in_review' || item.status === 'blocked' ? 'high' : 'medium',
        sourceIds: [item.sourceId],
        reason: `${item.sourceLabel} says this work is active or queued.`,
        ctaLabel: 'Open',
        route: item.route,
        status: 'ready',
        createdAt: generatedAt,
      });
    }

    if (nextScheduledTask) {
      links.push({
        id: `scheduled-link-${nextScheduledTask.id}`,
        title: nextScheduledTask.name,
        description: nextScheduledTask.description || 'Scheduled work is queued.',
        priority: 'medium',
        sourceIds: ['scheduled_tasks'],
        reason: 'This is the next scheduled automation visible to the dashboard.',
        ctaLabel: 'Open task',
        route: nextScheduledTask.route,
        status: 'ready',
        createdAt: generatedAt,
      });
    }

    links.push(
      {
        id: 'setup-priority-inbox',
        title: 'Priority inbox links',
        description: 'Connect Gmail so Honcho can decide which emails are worth surfacing here.',
        priority: 'high',
        sourceIds: ['email', 'honcho'],
        reason: 'Sam asked for high-priority email links, but no inbox source is connected inside Agent Club yet.',
        ctaLabel: 'Connect email',
        route: '/settings/capabilities',
        status: 'setup_required',
        createdAt: generatedAt,
      },
      {
        id: 'setup-meeting-links',
        title: 'Meeting prep and follow-up links',
        description: 'Connect calendar access to make meeting links and follow-up actions source-backed.',
        priority: 'medium',
        sourceIds: ['calendar', 'honcho'],
        reason: 'Calendar links should come from a connected source, not guesses.',
        ctaLabel: 'Connect calendar',
        route: '/settings/capabilities',
        status: 'setup_required',
        createdAt: generatedAt,
      }
    );

    return links
      .toSorted((a, b) => {
        const priorityRank: Record<DashboardAction['priority'], number> = { high: 0, medium: 1, low: 2 };
        return priorityRank[a.priority] - priorityRank[b.priority];
      })
      .slice(0, 7);
  }

  private buildSummary(
    activeWork: DashboardWorkItem[],
    memoryResult: DashboardMemoryResult,
    userContext?: string,
    reason?: DashboardSnapshotRequest['reason']
  ): DashboardSnapshot['summary'] {
    if (userContext) {
      return {
        title: 'Context applied',
        brief: `Rebuilt the dashboard with your latest context: ${truncate(userContext, 140)}`,
        nextBestMove:
          activeWork.length > 0
            ? 'Review the active work below against that context and hard refresh again after the next agent run.'
            : 'Use the context box to keep sharpening this dashboard as priorities shift.',
        confidence: 'high',
      };
    }

    if (reason === 'hard_refresh') {
      return {
        title: 'Three things to focus on',
        brief:
          'Hard refresh rebuilt the dashboard around webinar prep, the AIOS course video, and Agent Club as the demo resource.',
        nextBestMove:
          'Start with the webinar outline and rehearsal plan. Agent Club work should only support the course/webinar demo right now.',
        confidence: 'high',
      };
    }

    if (memoryResult.focusHint || memoryResult.chiefOfStaffBrief) {
      return {
        title: 'Three things to focus on',
        brief: 'This week is webinar prep, the AIOS course video, and making Agent Club demo-ready enough to support both.',
        nextBestMove:
          'Keep the dashboard honest: anything not helping the webinar, course video, or demo should wait.',
        confidence: memoryResult.chiefOfStaffBrief ? 'high' : 'medium',
      };
    }

    if (activeWork.length > 0) {
      return {
        title: 'Three things to focus on',
        brief: `${activeWork.length} local work item${activeWork.length === 1 ? '' : 's'} are visible, but the dashboard is filtering them through the current three priorities.`,
        nextBestMove: 'Do the webinar prep first, then choose the next Agent Club task only if it strengthens the AIOS course video.',
        confidence: 'high',
      };
    }

    return {
      title: 'Three things to focus on',
      brief: 'Webinar prep, AIOS course video, and Agent Club demo-readiness are the dashboard anchors.',
      nextBestMove: 'Create or run the next task that moves the webinar forward.',
      confidence: 'medium',
    };
  }

  private async safeListCronJobs(): Promise<ICronJob[]> {
    try {
      return await cronService.listJobs();
    } catch (error) {
      console.warn('[Dashboard] Failed to list cron jobs:', error);
      return [];
    }
  }

  private safeRunningTaskCount(): number {
    try {
      return this.workerTaskManager.listTasks().length;
    } catch (error) {
      console.warn('[Dashboard] Failed to list running tasks:', error);
      return 0;
    }
  }

  private async safeMemorySnapshot(): Promise<DashboardMemoryResult> {
    try {
      const snapshot = await honchoMemoryService.getSnapshot();
      if (!snapshot.configured) {
        return {
          configured: false,
          source: sourceStatus('honcho', 'Honcho Memory', 'disconnected', 'Honcho is not configured yet.', {
            setupRoute: '/settings/memory',
          }),
        };
      }

      const sourceLabel = `${snapshot.workspaceId}/${snapshot.userPeerId}`;
      const chiefOfStaffBrief = truncate(snapshot.chiefOfStaffBrief, 1200);
      const topPriority = firstMatchingLine(snapshot.peerCard, [/TOP PRIORITY/i, /priority/i, /YouTube/i]);
      const delegationTheme = firstMatchingLine(snapshot.peerCard, [
        /take.*plate/i,
        /delegate/i,
        /Delegator/i,
        /Director.*Executor/i,
        /Executor/i,
        /Ralph/i,
        /automation/i,
      ]);
      const focusHint =
        extractBriefLine(chiefOfStaffBrief, [/focus/i, /YouTube/i, /next/i]) ||
        topPriority ||
        truncate(snapshot.representation, 220);
      const delegationHint =
        extractBriefLine(chiefOfStaffBrief, [/take off/i, /delegate/i, /agent/i, /plate/i]) ||
        delegationTheme;
      const clarityHint =
        extractBriefLine(chiefOfStaffBrief, [/clarity/i, /reorient/i, /director/i]) ||
        firstMatchingLine(snapshot.peerCard, [/PREFERENCE/i, /CONCEPT/i]);
      const memoryLine = truncate(focusHint || chiefOfStaffBrief || snapshot.peerCard[0], 420);
      return {
        configured: true,
        source: sourceStatus(
          'honcho',
          'Honcho Memory',
          'connected',
          snapshot.peerCard.length
            ? `Source of truth: ${sourceLabel}. ${snapshot.peerCard.length} memory card${snapshot.peerCard.length === 1 ? '' : 's'} available.`
            : `Source of truth: ${sourceLabel}. Connected, with no memory cards returned yet.`,
          { connectedAt: snapshot.updatedAt }
        ),
        insight: memoryLine
          ? {
              id: 'honcho-chief-of-staff',
              title: 'Honcho chief-of-staff brief',
              body: memoryLine,
              sourceIds: ['honcho'],
              confidence: chiefOfStaffBrief ? 'high' : 'medium',
            }
          : undefined,
        chiefOfStaffBrief,
        focusHint: focusHint ? truncate(focusHint, 220) : undefined,
        delegationHint: delegationHint ? truncate(delegationHint, 220) : undefined,
        clarityHint: clarityHint ? truncate(clarityHint, 220) : undefined,
      };
    } catch (error) {
      return {
        configured: true,
        source: sourceStatus(
          'honcho',
          'Honcho Memory',
          'degraded',
          `Honcho is configured but did not return a snapshot: ${error instanceof Error ? error.message : String(error)}`,
          { setupRoute: '/settings/memory' }
        ),
      };
    }
  }

  private async safeAgentManagerSummary(): Promise<DashboardAgentManagerResult> {
    const status = agentManagerService.getStatus();
    try {
      const summary = await agentManagerService.getDashboardSummary();
      return {
        summary,
        source: sourceStatus(
          'agent_manager',
          AGENT_MANAGER_NAME,
          status.state === 'ready' ? 'connected' : status.state === 'error' ? 'degraded' : 'checking',
          status.message || `${AGENT_MANAGER_NAME} is ${status.state}.`
        ),
      };
    } catch (error) {
      return {
        summary: {
          status,
          goalsTotal: 0,
          activeGoals: 0,
          completedGoals: 0,
          issuesTotal: 0,
          activeIssues: 0,
          completedIssues: 0,
          activeGoalPreview: [],
          activeIssuePreview: [],
        },
        source: sourceStatus(
          'agent_manager',
          AGENT_MANAGER_NAME,
          'degraded',
          `${AGENT_MANAGER_NAME} did not return dashboard stats: ${error instanceof Error ? error.message : String(error)}`,
          { setupRoute: '/agent-manager' }
        ),
      };
    }
  }

  private routeForAction(actionId: string): string | undefined {
    const routes: Record<string, string> = {
      'setup-honcho-memory': '/settings/memory',
      'open-agent-manager': '/agent-manager',
      'create-chief-of-staff-heartbeat': '/scheduled',
      'connect-work-sources': '/settings/capabilities',
    };
    return routes[actionId];
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(fallback()), timeoutMs);
      }),
    ]);
  }

  private async getConfig(): Promise<DashboardConfig> {
    const stored = (await ProcessConfig.get('dashboard.config')) as Partial<DashboardConfig> | undefined;
    const hour =
      typeof stored?.morningRefreshHour === 'number'
        ? Math.min(23, Math.max(0, Math.trunc(stored.morningRefreshHour)))
        : DEFAULT_DASHBOARD_CONFIG.morningRefreshHour;
    const minute =
      typeof stored?.morningRefreshMinute === 'number'
        ? Math.min(59, Math.max(0, Math.trunc(stored.morningRefreshMinute)))
        : DEFAULT_DASHBOARD_CONFIG.morningRefreshMinute;

    const config: DashboardConfig = {
      morningRefreshEnabled: stored?.morningRefreshEnabled ?? DEFAULT_DASHBOARD_CONFIG.morningRefreshEnabled,
      morningRefreshHour: hour,
      morningRefreshMinute: minute,
      lastMorningRefreshAt: stored?.lastMorningRefreshAt,
      customWidgets: Array.isArray(stored?.customWidgets) ? stored.customWidgets : [],
      widgetLayout: this.normalizeWidgetLayout(
        Array.isArray(stored?.widgetLayout) ? stored.widgetLayout : [],
        Array.isArray(stored?.customWidgets) ? stored.customWidgets : []
      ),
    };

    if (!stored || !stored.widgetLayout || !stored.customWidgets) {
      await ProcessConfig.set('dashboard.config', config);
    }

    return config;
  }

  private normalizeWidgetLayout(
    layout: DashboardWidgetLayout[] = [],
    customWidgets: DashboardCustomWidgetSpec[] = []
  ): DashboardWidgetLayout[] {
    const defaultsById = new Map(DEFAULT_WIDGET_LAYOUT.map((item) => [item.id, item]));
    const customById = new Map(customWidgets.map((widget) => [widget.id, widget]));
    const seen = new Set<string>();
    const normalized: DashboardWidgetLayout[] = [];

    for (const item of layout) {
      if (seen.has(item.id)) {
        continue;
      }

      const defaultItem = defaultsById.get(item.id);
      const customItem = customById.get(item.id);
      if (!defaultItem && !customItem) {
        continue;
      }

      normalized.push({
        id: item.id,
        kind: customItem ? 'custom' : defaultItem?.kind || item.kind,
        title: customItem?.title || defaultItem?.title || item.title,
        size: customItem ? item.size || 'half' : defaultItem?.size || item.size || 'half',
        hidden: Boolean(item.hidden),
      });
      seen.add(item.id);
    }

    for (const item of DEFAULT_WIDGET_LAYOUT) {
      if (!seen.has(item.id)) {
        normalized.push({ ...item });
        seen.add(item.id);
      }
    }

    for (const widget of customWidgets) {
      if (!seen.has(widget.id)) {
        normalized.push({
          id: widget.id,
          kind: 'custom',
          title: widget.title,
          size: 'half',
        });
      }
    }

    return normalized;
  }

  private buildCustomWidgetSpec(prompt: string): DashboardCustomWidgetSpec {
    const lower = prompt.toLowerCase();
    const now = Date.now();
    const isRevenue = /revenue|sales|stripe|cash|mrr|arr|income/.test(lower);
    const isContent = /video|course|youtube|webinar|content/.test(lower);
    const isInbox = /email|inbox|reply|follow.?up/.test(lower);

    if (isRevenue) {
      return {
        id: nowId('custom-revenue'),
        title: 'Revenue dashboard',
        prompt,
        summary:
          'A dashboard-only revenue widget spec. It is ready for connector wiring, but it will not claim live revenue until a source such as Stripe, Sheets, CRM, or MCP data is connected.',
        metrics: [
          { label: 'Revenue', value: 'Setup', detail: 'Connect Stripe, Sheets, or CRM source.' },
          { label: 'Pipeline', value: 'Setup', detail: 'Connect deals or invoices.' },
          { label: 'Follow-ups', value: 'Setup', detail: 'Connect email/calendar context.' },
        ],
        sourceIds: ['custom_widget', 'email', 'todos'],
        status: 'setup_required',
        createdAt: now,
        updatedAt: now,
      };
    }

    if (isContent) {
      return {
        id: nowId('custom-content'),
        title: 'Content engine',
        prompt,
        summary:
          'A custom widget for the webinar/course/video push. It uses the current focus lanes and can become live when connected to content tasks or publishing sources.',
        metrics: [
          { label: 'Webinar', value: 'Active', detail: 'Prep remains the top lane.' },
          { label: 'Course video', value: 'Active', detail: 'AIOS course asset is tracked.' },
          { label: 'Demo', value: 'Active', detail: 'Agent Club proof points stay visible.' },
        ],
        sourceIds: ['custom_widget', 'manual_context', 'honcho'],
        status: 'preview',
        createdAt: now,
        updatedAt: now,
      };
    }

    if (isInbox) {
      return {
        id: nowId('custom-inbox'),
        title: 'Inbox attention',
        prompt,
        summary:
          'A custom inbox triage widget spec. It can surface high-priority email links once Gmail or another inbox source is connected inside Agent Club.',
        metrics: [
          { label: 'Needs reply', value: 'Setup', detail: 'Connect inbox source.' },
          { label: 'Waiting on', value: 'Setup', detail: 'Connect sent mail context.' },
          { label: 'Priority', value: 'Honcho', detail: 'Memory can rank once source exists.' },
        ],
        sourceIds: ['custom_widget', 'email', 'honcho'],
        status: 'setup_required',
        createdAt: now,
        updatedAt: now,
      };
    }

    const title = truncate(prompt, 34) || 'Custom widget';
    return {
      id: nowId('custom-widget'),
      title,
      prompt,
      summary:
        'A safe dashboard-only widget spec generated from your prompt. It can show connected local signals now and stays honest about sources that still need setup.',
      metrics: [
        { label: 'Status', value: 'Preview', detail: 'Dashboard-only spec saved.' },
        { label: 'Source', value: 'Honcho', detail: 'Use memory to rank relevance.' },
        { label: 'Next', value: 'Connect', detail: 'Wire MCP/connectors when needed.' },
      ],
      sourceIds: ['custom_widget', 'honcho'],
      status: 'preview',
      createdAt: now,
      updatedAt: now,
    };
  }

  private async scheduleNextMorningRefresh(): Promise<void> {
    const config = await this.getConfig();
    if (!config.morningRefreshEnabled) {
      return;
    }

    const nextRunAtMs = this.nextMorningRefreshAt(config, Date.now());
    const delay = Math.max(1000, nextRunAtMs - Date.now());
    this.morningTimer = setTimeout(() => {
      this.morningTimer = null;
      void this.runScheduledMorningRefresh();
    }, delay);
  }

  private async runScheduledMorningRefresh(): Promise<void> {
    try {
      await this.updateLastMorningRefreshAt(Date.now());
      const snapshot = await this.getSnapshot({ reason: 'heartbeat' });
      this.snapshotEmitter?.(snapshot);
    } catch (error) {
      console.warn('[Dashboard] Morning refresh failed:', error);
    } finally {
      await this.scheduleNextMorningRefresh();
    }
  }

  private async updateLastMorningRefreshAt(value: number): Promise<void> {
    const config = await this.getConfig();
    await ProcessConfig.set('dashboard.config', {
      ...config,
      lastMorningRefreshAt: value,
    });
  }

  private buildMorningRefreshStatus(config: DashboardConfig): DashboardScheduleStatus {
    const nextRunAtMs = config.morningRefreshEnabled ? this.nextMorningRefreshAt(config, Date.now()) : undefined;
    return {
      enabled: config.morningRefreshEnabled,
      hour: config.morningRefreshHour,
      minute: config.morningRefreshMinute,
      nextRunAtMs,
      lastRunAtMs: config.lastMorningRefreshAt,
      label: this.formatMorningRefreshLabel(config),
    };
  }

  private nextMorningRefreshAt(config: DashboardConfig, fromMs: number): number {
    const next = new Date(fromMs);
    next.setHours(config.morningRefreshHour, config.morningRefreshMinute, 0, 0);
    if (next.getTime() <= fromMs) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  private formatMorningRefreshLabel(config: DashboardConfig): string {
    const next = new Date();
    next.setHours(config.morningRefreshHour, config.morningRefreshMinute, 0, 0);
    return `Daily at ${new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(next)}`;
  }

  private async persistSnapshot(snapshot: DashboardSnapshot): Promise<void> {
    try {
      const stored = ((await ProcessConfig.get('dashboard.snapshots')) as DashboardSnapshot[] | undefined) || [];
      const next = [snapshot, ...stored.filter((item) => item.id !== snapshot.id)].slice(0, SNAPSHOT_HISTORY_LIMIT);
      await ProcessConfig.set('dashboard.snapshots', next);
    } catch (error) {
      console.warn('[Dashboard] Failed to persist snapshot:', error);
    }
  }
}
