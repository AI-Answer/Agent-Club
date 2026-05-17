import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { app } from 'electron';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { ipcBridge } from '@/common';
import {
  AGENT_MANAGER_LOCAL_CODE,
  AGENT_MANAGER_LOCAL_EMAIL,
  AGENT_MANAGER_NAME,
  AGENT_MANAGER_WORKSPACE_SLUG,
} from '@/common/config/appBrand';
import type {
  AgentManagerChatGoalCommandRequest,
  AgentManagerGoalCommandResult,
  AgentManagerGoalStatus,
  AgentManagerGoalSummary,
  AgentManagerPrewarmRouteStatus,
  AgentManagerPrewarmStatus,
  AgentManagerStatus,
} from '@/common/types/agentManager';
import type { DashboardAgentManagerSummary, DashboardWorkItem } from '@/common/types/dashboard';
import type {
  CreatePlannerEntryRequest,
  ListPlannerMonthsResponse,
  PlannerDayMark,
  PlannerEntry,
  PlannerMonth,
  PlannerMonthDetailResponse,
  UpdatePlannerDayMarkRequest,
  UpdatePlannerEntryRequest,
  UpdatePlannerMonthRequest,
} from '@/common/types/planner';

const DEFAULT_FRONTEND_PORT = '3330';
const DEFAULT_BACKEND_PORT = '18330';
const DEFAULT_POSTGRES_PORT = '55432';
const POSTGRES_PASSWORD = 'multica';
const AGENT_MANAGER_DAEMON_PROFILE = 'agent-club';
const AGENT_MANAGER_DAEMON_ID = 'agent-club-local-runtime';
const AGENT_MANAGER_DAEMON_DEVICE_NAME = 'Agent Club';
const AGENT_MANAGER_DAEMON_HEALTH_PORT = 20509;
const AGENT_MANAGER_CLI_VERSION = '0.2.20';
const AGENT_MANAGER_CLI_COMMIT = 'agent-club';
const AGENT_MANAGER_DEFAULT_PROJECT_TITLE = 'Agent Club Operating Board';

const HOMEBREW_BIN_PATHS = [
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/local/sbin',
  '/opt/homebrew/opt/postgresql@17/bin',
  '/usr/local/opt/postgresql@17/bin',
];

type CommandResult = {
  stdout: string;
  stderr: string;
};

type ResolvedCommand = {
  command: string;
  argsPrefix: string[];
  envPatch?: NodeJS.ProcessEnv;
};

type AgentManagerPrewarmRoute = {
  path: string;
  label: string;
  timeoutMs?: number;
};

type AgentManagerProjectSummary = {
  id: string;
  title: string;
  description?: string | null;
  status?: string;
};

type AgentManagerIssueSummary = {
  id: string;
  number?: number;
  identifier?: string;
  title: string;
  description?: string | null;
  status: string;
  priority?: string;
  project_id?: string | null;
  goal_id?: string | null;
  updated_at?: string;
};

type AgentManagerProjectListResponse = {
  projects?: AgentManagerProjectSummary[];
};

type AgentManagerGoalListResponse = {
  goals?: Array<AgentManagerGoalSummary & { updated_at?: string }>;
};

type AgentManagerIssueListResponse = {
  issues?: AgentManagerIssueSummary[];
};

type AgentManagerExpandGoalResponse = {
  task_id?: string;
  readiness?: {
    ready?: boolean;
  };
};

export class AgentManagerService {
  private processes = new Set<ChildProcess>();
  private startPromise: Promise<AgentManagerStatus> | null = null;
  private prewarmPromise: Promise<void> | null = null;
  private prewarmStatus: AgentManagerPrewarmStatus = this.createPrewarmStatus('idle', []);
  private status: AgentManagerStatus = this.createStatus('idle', `${AGENT_MANAGER_NAME} is idle`);

  getStatus(): AgentManagerStatus {
    return this.status;
  }

  async start(): Promise<AgentManagerStatus> {
    if (process.env.AGENT_MANAGER_AUTOSTART === '0') {
      this.updateStatus('disabled', `${AGENT_MANAGER_NAME} autostart is disabled`);
      return this.status;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.status.state === 'ready') {
      return this.status;
    }

    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async restart(): Promise<AgentManagerStatus> {
    await this.stop();
    return this.start();
  }

  async handleChatGoalCommand(request: AgentManagerChatGoalCommandRequest): Promise<AgentManagerGoalCommandResult> {
    const readyStatus = await this.ensureReadyForApi();
    const backendUrl = readyStatus.backendUrl || this.getBackendUrl();
    const token = await this.createLocalSessionToken({ NEXT_PUBLIC_API_URL: backendUrl } as NodeJS.ProcessEnv);

    let project: AgentManagerProjectSummary;
    let goal: AgentManagerGoalSummary;

    if (request.action === 'run_prepared') {
      if (!request.goalId) {
        throw new Error('No prepared goal is available to run yet');
      }
      goal = await this.getChatGoal(backendUrl, token, request.goalId);
      project = await this.resolveGoalProjectById(backendUrl, token, goal.project_id);
      if (goal.status !== 'in_progress') {
        goal = await this.updateChatGoal(backendUrl, token, goal.id, { status: 'in_progress' });
      }
    } else {
      project = await this.resolveGoalProject(backendUrl, token, request.projectHint);
      goal = await this.createChatGoal(backendUrl, token, request, project.id);
    }

    let expanded = false;
    let taskId: string | undefined;
    let readinessReady: boolean | undefined;
    let warning: string | undefined;
    let markdownPath = this.extractMarkdownPath(goal.description);

    const goalPath = `/${AGENT_MANAGER_WORKSPACE_SLUG}/goals/${encodeURIComponent(goal.id)}`;
    const projectPath = `/${AGENT_MANAGER_WORKSPACE_SLUG}/projects/${encodeURIComponent(project.id)}`;
    const goalUrl = this.buildAgentManagerAppLink(goalPath);
    const projectUrl = this.buildAgentManagerAppLink(projectPath);
    const boardUrl = projectUrl;

    if (request.action !== 'run_prepared') {
      markdownPath = this.writeChatGoalMarkdown(request, project, goal, {
        goalUrl,
        projectUrl,
        boardUrl,
      });
      if (markdownPath) {
        goal = await this.updateChatGoal(backendUrl, token, goal.id, {
          description: this.buildChatGoalDescription(request, markdownPath),
        });
      }
    }

    if (request.action === 'run' || request.action === 'run_prepared') {
      try {
        const prompt = request.body.trim() || goal.description || goal.title;
        const expandResult = await this.agentManagerApi<AgentManagerExpandGoalResponse>(
          backendUrl,
          `/api/goals/${encodeURIComponent(goal.id)}/expand`,
          token,
          {
            method: 'POST',
            body: JSON.stringify({ prompt }),
          }
        );
        expanded = true;
        taskId = expandResult.task_id;
        readinessReady = expandResult.readiness?.ready;
      } catch (error) {
        warning = `Goal was created, but native expansion did not start: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    return {
      action: request.action,
      goal,
      projectId: project.id,
      projectTitle: project.title,
      goalUrl,
      managerUrl: goalUrl,
      boardUrl,
      projectUrl,
      markdownPath,
      expanded,
      taskId,
      readinessReady,
      warning,
    };
  }

  async buildChatGoalContextReminder(conversationId: string): Promise<string | undefined> {
    if (!conversationId || this.status.state !== 'ready') {
      return undefined;
    }

    const backendUrl = this.status.backendUrl || this.getBackendUrl();
    const token = await this.createLocalSessionToken({ NEXT_PUBLIC_API_URL: backendUrl } as NodeJS.ProcessEnv);
    const goalContext = await this.findLatestChatGoalContext(backendUrl, token, conversationId);
    if (!goalContext) {
      return undefined;
    }

    const issueLines = goalContext.issues.length
      ? goalContext.issues.slice(0, 8).map((issue) => {
          const label = issue.identifier || `Issue ${issue.number || issue.id}`;
          const priority = issue.priority && issue.priority !== 'none' ? ` priority=${issue.priority}` : '';
          return `- ${label}: ${issue.title} [${issue.status}${priority}]`;
        })
      : [
          '- No goal-linked issues are visible yet. If the user asks for work to begin, create or expand a goal-linked issue first.',
        ];

    const activeIssue = this.pickActiveIssue(goalContext.issues);
    const activeIssueLine = activeIssue
      ? `Active task hint: ${activeIssue.identifier || activeIssue.id} (${activeIssue.status}) - ${activeIssue.title}`
      : 'Active task hint: no open task is visible yet; inspect or create a goal-linked issue before saying there is no task.';

    const parts = [
      '<system-reminder>',
      'Active Local Agent Manager context for this Agent Club chat thread:',
      `Project: ${goalContext.project.title} (${goalContext.project.id})`,
      `Project board: ${goalContext.projectUrl}`,
      `Goal: ${goalContext.goal.title} (${goalContext.goal.id})`,
      `Goal status: ${goalContext.goal.status}`,
      `Goal detail: ${goalContext.goalUrl}`,
      activeIssueLine,
      'Goal-linked issues:',
      ...issueLines,
    ];

    if (goalContext.markdownPath) {
      parts.push(`Goal markdown: ${goalContext.markdownPath}`);
    }

    parts.push(
      'When the user says "this goal", "the project", "the board", "the task", "mark it done", or similar, resolve that wording against this context first.',
      'Prefer updating the matching Local Agent Manager issue/goal/project with available tools, CLI, or API before asking what task they mean. If more than one open issue could match, ask one short clarifying question.',
      '</system-reminder>'
    );

    return parts.join('\n');
  }

  async getDashboardSummary(): Promise<DashboardAgentManagerSummary> {
    const status = this.getStatus();
    const emptySummary: DashboardAgentManagerSummary = {
      status,
      goalsTotal: 0,
      activeGoals: 0,
      completedGoals: 0,
      issuesTotal: 0,
      activeIssues: 0,
      completedIssues: 0,
      activeGoalPreview: [],
      activeIssuePreview: [],
    };

    if (status.state !== 'ready') {
      return emptySummary;
    }

    const backendUrl = status.backendUrl || this.getBackendUrl();
    const token = await this.createLocalSessionToken({ NEXT_PUBLIC_API_URL: backendUrl } as NodeJS.ProcessEnv);
    const [goalsResult, issuesResult] = await Promise.allSettled([
      this.agentManagerApi<AgentManagerGoalListResponse>(backendUrl, '/api/goals?limit=100', token),
      this.agentManagerApi<AgentManagerIssueListResponse>(backendUrl, '/api/issues?limit=100', token),
    ]);

    const goals = goalsResult.status === 'fulfilled' ? goalsResult.value.goals || [] : [];
    const issues = issuesResult.status === 'fulfilled' ? issuesResult.value.issues || [] : [];
    const activeGoals = goals.filter((goal) => !['completed', 'cancelled'].includes(goal.status));
    const activeIssues = issues.filter((issue) => !['done', 'cancelled'].includes(issue.status));

    return {
      status,
      goalsTotal: goals.length,
      activeGoals: activeGoals.length,
      completedGoals: goals.filter((goal) => goal.status === 'completed').length,
      issuesTotal: issues.length,
      activeIssues: activeIssues.length,
      completedIssues: issues.filter((issue) => issue.status === 'done').length,
      activeGoalPreview: activeGoals.slice(0, 3).map((goal) => this.goalToDashboardWorkItem(goal)),
      activeIssuePreview: activeIssues.slice(0, 4).map((issue) => this.issueToDashboardWorkItem(issue)),
    };
  }

  async getPlannerMonths(year: number): Promise<ListPlannerMonthsResponse> {
    const { backendUrl, token } = await this.getReadyApiContext();
    const search = new URLSearchParams({ year: String(year) });
    return this.agentManagerApi<ListPlannerMonthsResponse>(backendUrl, `/api/planner/months?${search}`, token);
  }

  async getPlannerMonth(year: number, month: number): Promise<PlannerMonthDetailResponse> {
    const { backendUrl, token } = await this.getReadyApiContext();
    return this.agentManagerApi<PlannerMonthDetailResponse>(backendUrl, `/api/planner/months/${year}/${month}`, token);
  }

  async updatePlannerMonth(id: string, data: UpdatePlannerMonthRequest): Promise<PlannerMonth> {
    const { backendUrl, token } = await this.getReadyApiContext();
    return this.agentManagerApi<PlannerMonth>(backendUrl, `/api/planner/months/${encodeURIComponent(id)}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async createPlannerEntry(data: CreatePlannerEntryRequest): Promise<PlannerEntry> {
    const { backendUrl, token } = await this.getReadyApiContext();
    return this.agentManagerApi<PlannerEntry>(backendUrl, '/api/planner/entries', token, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePlannerEntry(id: string, data: UpdatePlannerEntryRequest): Promise<PlannerEntry> {
    const { backendUrl, token } = await this.getReadyApiContext();
    return this.agentManagerApi<PlannerEntry>(backendUrl, `/api/planner/entries/${encodeURIComponent(id)}`, token, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deletePlannerEntry(id: string): Promise<void> {
    const { backendUrl, token } = await this.getReadyApiContext();
    await this.agentManagerApi<unknown>(backendUrl, `/api/planner/entries/${encodeURIComponent(id)}`, token, {
      method: 'DELETE',
    });
  }

  async updatePlannerDayMark(date: string, data: UpdatePlannerDayMarkRequest): Promise<PlannerDayMark> {
    const { backendUrl, token } = await this.getReadyApiContext();
    return this.agentManagerApi<PlannerDayMark>(
      backendUrl,
      `/api/planner/day-marks/${encodeURIComponent(date)}`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
  }

  async deletePlannerDayMark(date: string): Promise<void> {
    const { backendUrl, token } = await this.getReadyApiContext();
    await this.agentManagerApi<unknown>(backendUrl, `/api/planner/day-marks/${encodeURIComponent(date)}`, token, {
      method: 'DELETE',
    });
  }

  async stop(): Promise<void> {
    this.prewarmPromise = null;
    this.updatePrewarmStatus(this.createPrewarmStatus('idle', []), false);

    if (this.processes.size === 0) {
      if (this.status.state !== 'idle') {
        this.updateStatus('idle', `${AGENT_MANAGER_NAME} is stopped`);
      }
      return;
    }

    this.updateStatus('stopping', `Stopping ${AGENT_MANAGER_NAME}`);
    const processes = Array.from(this.processes);
    this.processes.clear();

    await Promise.all(
      processes.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.killed || child.exitCode !== null) {
              resolve();
              return;
            }

            const timeout = setTimeout(() => {
              this.killProcessTree(child, 'SIGKILL');
              resolve();
            }, 5000);

            child.once('exit', () => {
              clearTimeout(timeout);
              resolve();
            });

            try {
              this.killProcessTree(child, 'SIGTERM');
            } catch {
              clearTimeout(timeout);
              resolve();
            }
          })
      )
    );

    this.updateStatus('idle', `${AGENT_MANAGER_NAME} is stopped`);
  }

  private async ensureReadyForApi(): Promise<AgentManagerStatus> {
    if (this.status.state === 'ready') {
      return this.status;
    }

    const status = await this.start();
    if (status.state !== 'ready') {
      throw new Error(status.detail || status.message || `${AGENT_MANAGER_NAME} is not ready`);
    }
    return status;
  }

  private async getReadyApiContext(): Promise<{ backendUrl: string; token: string }> {
    const backendUrl = await this.ensureBackendReadyForApi();
    const token = await this.createLocalSessionToken({ NEXT_PUBLIC_API_URL: backendUrl } as NodeJS.ProcessEnv);
    return { backendUrl, token };
  }

  private async ensureBackendReadyForApi(): Promise<string> {
    const backendUrl = this.status.backendUrl || this.getBackendUrl();
    const healthUrl = `${backendUrl.replace(/\/$/, '')}/health`;

    if (this.status.state === 'ready' || (await this.isHttpAvailable(healthUrl, 750))) {
      return backendUrl;
    }

    if (process.env.AGENT_MANAGER_AUTOSTART === '0') {
      throw new Error(`${AGENT_MANAGER_NAME} autostart is disabled`);
    }

    void this.start();
    await this.waitForHttp(healthUrl, 90000);
    return backendUrl;
  }

  private buildAgentManagerAppLink(nextPath: string): string {
    const params = new URLSearchParams({ next: nextPath });
    return `/agent-manager?${params.toString()}`;
  }

  private async resolveGoalProject(
    backendUrl: string,
    token: string,
    projectHint?: string
  ): Promise<AgentManagerProjectSummary> {
    const response = await this.agentManagerApi<AgentManagerProjectListResponse>(backendUrl, '/api/projects', token);
    const projects = response.projects || [];
    const normalizedHint = this.normalizeName(projectHint);

    if (normalizedHint) {
      const exact = projects.find((project) => this.normalizeName(project.title) === normalizedHint);
      if (exact) {
        return exact;
      }
      return this.createGoalProject(backendUrl, token, projectHint?.trim() || AGENT_MANAGER_DEFAULT_PROJECT_TITLE);
    }

    const defaultProject = projects.find(
      (project) => this.normalizeName(project.title) === this.normalizeName(AGENT_MANAGER_DEFAULT_PROJECT_TITLE)
    );
    if (defaultProject) {
      return defaultProject;
    }

    if (projects[0]) {
      return projects[0];
    }

    return this.createGoalProject(backendUrl, token, AGENT_MANAGER_DEFAULT_PROJECT_TITLE, {
      description: 'Default task board for Agent Club apps, agents, and bundled workflows.',
      priority: 'high',
    });
  }

  private createGoalProject(
    backendUrl: string,
    token: string,
    title: string,
    options?: { description?: string; priority?: string }
  ): Promise<AgentManagerProjectSummary> {
    return this.agentManagerApi<AgentManagerProjectSummary>(backendUrl, '/api/projects', token, {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: options?.description || `Created from an Agent Club chat goal for ${title}.`,
        status: 'in_progress',
        priority: options?.priority || 'medium',
      }),
    });
  }

  private async resolveGoalProjectById(
    backendUrl: string,
    token: string,
    projectId: string
  ): Promise<AgentManagerProjectSummary> {
    const response = await this.agentManagerApi<AgentManagerProjectListResponse>(backendUrl, '/api/projects', token);
    const project = (response.projects || []).find((candidate) => candidate.id === projectId);
    if (project) {
      return project;
    }
    return {
      id: projectId,
      title: 'Local Agent Manager Project',
    };
  }

  private async findLatestChatGoalContext(
    backendUrl: string,
    token: string,
    conversationId: string
  ): Promise<
    | {
        goal: AgentManagerGoalSummary & { updated_at?: string };
        project: AgentManagerProjectSummary;
        issues: AgentManagerIssueSummary[];
        goalUrl: string;
        projectUrl: string;
        markdownPath?: string;
      }
    | undefined
  > {
    const response = await this.agentManagerApi<AgentManagerGoalListResponse>(
      backendUrl,
      '/api/goals?limit=100',
      token
    );
    const goals = (response.goals || [])
      .filter((goal) => goal.description?.includes(`Conversation: ${conversationId}`))
      .toSorted((a, b) => {
        const bTime = Date.parse(b.updated_at || '') || 0;
        const aTime = Date.parse(a.updated_at || '') || 0;
        return bTime - aTime;
      });

    const goal =
      goals.find((candidate) => candidate.status === 'in_progress') ||
      goals.find((candidate) => candidate.status === 'planned') ||
      goals[0];

    if (!goal) {
      return undefined;
    }

    const project = await this.resolveGoalProjectById(backendUrl, token, goal.project_id);
    const issues = await this.fetchGoalIssues(backendUrl, token, goal.id);
    const goalPath = `/${AGENT_MANAGER_WORKSPACE_SLUG}/goals/${encodeURIComponent(goal.id)}`;
    const projectPath = `/${AGENT_MANAGER_WORKSPACE_SLUG}/projects/${encodeURIComponent(project.id)}`;

    return {
      goal,
      project,
      issues,
      goalUrl: this.buildAgentManagerAppLink(goalPath),
      projectUrl: this.buildAgentManagerAppLink(projectPath),
      markdownPath: this.extractMarkdownPath(goal.description),
    };
  }

  private async fetchGoalIssues(
    backendUrl: string,
    token: string,
    goalId: string
  ): Promise<AgentManagerIssueSummary[]> {
    const apiPath = `/api/issues?goal_id=${encodeURIComponent(goalId)}&open_only=true&limit=50`;
    const response = await this.agentManagerApi<AgentManagerIssueListResponse>(backendUrl, apiPath, token);
    return (response.issues || []).toSorted((a, b) => {
      const statusDelta = this.issueStatusRank(a.status) - this.issueStatusRank(b.status);
      if (statusDelta !== 0) {
        return statusDelta;
      }
      const bTime = Date.parse(b.updated_at || '') || 0;
      const aTime = Date.parse(a.updated_at || '') || 0;
      return bTime - aTime;
    });
  }

  private pickActiveIssue(issues: AgentManagerIssueSummary[]): AgentManagerIssueSummary | undefined {
    return issues.find((issue) => !['done', 'cancelled'].includes(issue.status));
  }

  private goalToDashboardWorkItem(goal: AgentManagerGoalSummary & { updated_at?: string }): DashboardWorkItem {
    const goalPath = `/${AGENT_MANAGER_WORKSPACE_SLUG}/goals/${encodeURIComponent(goal.id)}`;
    return {
      id: `agent-manager-goal-${goal.id}`,
      title: goal.title,
      description: this.compactDashboardText(goal.description) || 'Long-running goal in Local Agent Manager.',
      status: goal.status,
      sourceId: 'agent_manager',
      sourceLabel: AGENT_MANAGER_NAME,
      route: this.buildAgentManagerAppLink(goalPath),
      updatedAt: this.parseDashboardTime(goal.updated_at),
    };
  }

  private issueToDashboardWorkItem(issue: AgentManagerIssueSummary): DashboardWorkItem {
    const issuePath = `/${AGENT_MANAGER_WORKSPACE_SLUG}/issues/${encodeURIComponent(issue.id)}`;
    return {
      id: `agent-manager-issue-${issue.id}`,
      title: issue.identifier ? `${issue.identifier}: ${issue.title}` : issue.title,
      description: this.compactDashboardText(issue.description) || 'Open Local Agent Manager ticket.',
      status: issue.status,
      sourceId: 'agent_manager',
      sourceLabel: AGENT_MANAGER_NAME,
      route: this.buildAgentManagerAppLink(issuePath),
      updatedAt: this.parseDashboardTime(issue.updated_at),
    };
  }

  private compactDashboardText(value?: string | null, max = 160): string {
    const cleaned = (value || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= max) {
      return cleaned;
    }
    return `${cleaned.slice(0, max - 1).trim()}...`;
  }

  private parseDashboardTime(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private issueStatusRank(status: string): number {
    const order = ['in_progress', 'in_review', 'todo', 'blocked', 'backlog', 'done', 'cancelled'];
    const index = order.indexOf(status);
    return index === -1 ? order.length : index;
  }

  private async getChatGoal(backendUrl: string, token: string, goalId: string): Promise<AgentManagerGoalSummary> {
    return this.agentManagerApi<AgentManagerGoalSummary>(backendUrl, `/api/goals/${encodeURIComponent(goalId)}`, token);
  }

  private async createChatGoal(
    backendUrl: string,
    token: string,
    request: AgentManagerChatGoalCommandRequest,
    projectId: string
  ): Promise<AgentManagerGoalSummary> {
    const status: AgentManagerGoalStatus = request.action === 'run' ? 'in_progress' : 'planned';
    return this.agentManagerApi<AgentManagerGoalSummary>(backendUrl, '/api/goals', token, {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        title: request.title,
        description: this.buildChatGoalDescription(request),
        status,
      }),
    });
  }

  private async updateChatGoal(
    backendUrl: string,
    token: string,
    goalId: string,
    updates: Partial<Pick<AgentManagerGoalSummary, 'title' | 'description' | 'status'>>
  ): Promise<AgentManagerGoalSummary> {
    return this.agentManagerApi<AgentManagerGoalSummary>(
      backendUrl,
      `/api/goals/${encodeURIComponent(goalId)}`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify(updates),
      }
    );
  }

  private buildChatGoalDescription(request: AgentManagerChatGoalCommandRequest, markdownPath?: string): string {
    const parts = [request.body.trim()];
    const metadata = [
      'Source: Agent Club chat slash command',
      `Action: ${request.action}`,
      `Conversation: ${request.sourceConversationId}`,
    ];

    if (request.sourceConversationType) {
      metadata.push(`Runtime: ${request.sourceConversationType}`);
    }
    if (request.sourceWorkspacePath) {
      metadata.push(`Workspace path: ${request.sourceWorkspacePath}`);
    }
    if (request.projectHint) {
      metadata.push(`Project hint: ${request.projectHint}`);
    }
    if (request.tags?.length) {
      metadata.push(`Tags: ${request.tags.map((tag) => `#${tag}`).join(' ')}`);
    }
    if (markdownPath) {
      metadata.push(`Markdown file: ${markdownPath}`);
    }

    metadata.push(`Original command: ${request.rawInput}`);
    parts.push('', '---', ...metadata);
    return parts.join('\n');
  }

  private writeChatGoalMarkdown(
    request: AgentManagerChatGoalCommandRequest,
    project: AgentManagerProjectSummary,
    goal: AgentManagerGoalSummary,
    links: { goalUrl: string; projectUrl: string; boardUrl: string }
  ): string | undefined {
    try {
      const workspaceRoot = this.resolveGoalMarkdownRoot(request.sourceWorkspacePath);
      const goalRoot = this.nextAvailableGoalDirectory(
        path.join(workspaceRoot, 'docs', 'goals', this.slugifyGoalTitle(goal.title))
      );
      fs.mkdirSync(goalRoot, { recursive: true });
      const markdownPath = path.join(goalRoot, 'goal.md');
      fs.writeFileSync(markdownPath, this.buildGoalMarkdown(request, project, goal, links), 'utf8');
      return markdownPath;
    } catch (error) {
      console.warn('[AgentManager] Failed to write chat goal markdown:', error);
      return undefined;
    }
  }

  private resolveGoalMarkdownRoot(workspacePath?: string): string {
    if (workspacePath?.trim()) {
      return path.resolve(workspacePath);
    }
    return path.join(os.homedir(), 'Agent Club Goals');
  }

  private nextAvailableGoalDirectory(baseDir: string): string {
    if (!fs.existsSync(baseDir)) {
      return baseDir;
    }

    const suffix = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    return `${baseDir}-${suffix}`;
  }

  private slugifyGoalTitle(title: string): string {
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return slug || `goal-${Date.now()}`;
  }

  private buildGoalMarkdown(
    request: AgentManagerChatGoalCommandRequest,
    project: AgentManagerProjectSummary,
    goal: AgentManagerGoalSummary,
    links: { goalUrl: string; projectUrl: string; boardUrl: string }
  ): string {
    const body = request.body.trim() || goal.title;
    const tags = request.tags?.length ? request.tags.map((tag) => `#${tag}`).join(' ') : 'None';

    return [
      `# ${goal.title}`,
      '',
      '## Objective',
      '',
      body,
      '',
      '## First Objective',
      '',
      'Clarify the plan, confirm the first safe action slice, and then start actioning this goal from Agent Club chat when approved.',
      '',
      '## Local Agent Manager',
      '',
      `- Project: [${project.title}](${links.projectUrl})`,
      `- Goal: [${goal.title}](${links.goalUrl})`,
      `- Board / tasks: [Open goal board](${links.boardUrl})`,
      '',
      '## Chat Source',
      '',
      `- Conversation: ${request.sourceConversationId}`,
      request.sourceConversationType ? `- Runtime: ${request.sourceConversationType}` : null,
      request.sourceWorkspacePath ? `- Workspace path: ${request.sourceWorkspacePath}` : null,
      `- Tags: ${tags}`,
      `- Original command: ${request.rawInput}`,
      '',
      '## Start Actioning',
      '',
      'From the same Agent Club chat, send `/goal`, `go ahead`, or `start actioning the goal` to run this prepared goal.',
      '',
    ]
      .filter((line): line is string => line !== null)
      .join('\n');
  }

  private extractMarkdownPath(description?: string | null): string | undefined {
    const match = description?.match(/^Markdown file:\s*(.+)$/m);
    return match?.[1]?.trim() || undefined;
  }

  private normalizeName(value?: string): string {
    return (value || '').trim().toLowerCase();
  }

  private async agentManagerApi<T>(
    backendUrl: string,
    apiPath: string,
    token: string,
    init: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'X-Workspace-Slug': AGENT_MANAGER_WORKSPACE_SLUG,
      'X-Client-Platform': 'desktop',
      'X-Client-Version': AGENT_MANAGER_CLI_VERSION,
      'X-Client-OS': process.platform,
      ...(init.headers as Record<string, string> | undefined),
    };

    if (init.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${backendUrl.replace(/\/$/, '')}${apiPath}`, {
      ...init,
      headers,
    });
    const text = await response.text();
    const payload = text ? this.parseJsonResponse(text) : undefined;

    if (!response.ok) {
      const message =
        payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `${apiPath} returned ${response.status}`;
      throw new Error(message);
    }

    return payload as T;
  }

  private parseJsonResponse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  private async startInternal(): Promise<AgentManagerStatus> {
    this.updateStatus('starting', `Preparing ${AGENT_MANAGER_NAME}`);

    try {
      const repoDir = this.resolveRepoDir();
      if (!fs.existsSync(repoDir)) {
        throw new Error(`Multica checkout not found at ${repoDir}`);
      }

      const runtimeDir = path.join(repoDir, '.agent-club');
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.mkdirSync(path.join(runtimeDir, 'uploads'), { recursive: true });

      const env = this.buildEnv(repoDir, runtimeDir);
      await this.ensureDependencies(repoDir, env);
      const multicaCliPath = await this.ensureMulticaCli(repoDir, runtimeDir, env);
      env.MULTICA_CLI_PATH = multicaCliPath;
      env.PATH = this.withToolPaths(env.PATH || '', [path.dirname(multicaCliPath)]);
      await this.ensurePostgres(repoDir, runtimeDir, env);

      this.updateStatus('starting', `Running ${AGENT_MANAGER_NAME} migrations`);
      await this.runCommand('go', ['run', './cmd/migrate', 'up'], path.join(repoDir, 'server'), env, 'migrate', 120000);
      await this.seedLocalWorkspace(repoDir, env);

      const backendHealthUrl = `${env.NEXT_PUBLIC_API_URL}/health`;
      if (await this.isHttpAvailable(backendHealthUrl, 1000)) {
        console.log(`[AgentManager] reusing existing ${AGENT_MANAGER_NAME} backend`);
      } else {
        this.updateStatus('starting', `Starting ${AGENT_MANAGER_NAME} backend`);
        this.spawnManaged('go', ['run', './cmd/server'], path.join(repoDir, 'server'), env, 'backend');
      }
      await this.waitForHttp(backendHealthUrl, 90000);

      await this.ensureLocalDaemonProfile(repoDir, env);
      await this.stopExistingLocalDaemon();
      this.updateStatus('starting', `Starting ${AGENT_MANAGER_NAME} local runtime`);
      this.spawnManaged(
        multicaCliPath,
        [
          '--profile',
          AGENT_MANAGER_DAEMON_PROFILE,
          'daemon',
          'start',
          '--foreground',
          '--daemon-id',
          AGENT_MANAGER_DAEMON_ID,
          '--device-name',
          AGENT_MANAGER_DAEMON_DEVICE_NAME,
          '--runtime-name',
          'Agent Club Runtime',
          '--poll-interval',
          '5s',
          '--heartbeat-interval',
          '15s',
          '--max-concurrent-tasks',
          '6',
        ],
        path.join(repoDir, 'server'),
        this.buildDaemonEnv(env, runtimeDir, multicaCliPath),
        'daemon'
      );
      await this.waitForLocalDaemonReady(45000);
      await this.syncLocalRuntimeAgents(repoDir, env);

      const frontendUrl = this.getFrontendUrl();
      const frontendPort = Number(env.FRONTEND_PORT || DEFAULT_FRONTEND_PORT);
      if (await this.isPortOpen('127.0.0.1', frontendPort, 500)) {
        if (await this.tryWaitForHttp(frontendUrl, 15000)) {
          console.log(`[AgentManager] reusing existing ${AGENT_MANAGER_NAME} web UI`);
        } else {
          throw new Error(
            `${AGENT_MANAGER_NAME} web port ${frontendPort} is in use but ${frontendUrl} is not responding`
          );
        }
      } else {
        this.updateStatus('starting', `Starting ${AGENT_MANAGER_NAME} web UI`);
        const pnpm = this.resolvePnpmCommand();
        this.spawnManaged(pnpm.command, [...pnpm.argsPrefix, 'dev:web'], repoDir, { ...env, ...pnpm.envPatch }, 'web');
      }
      await this.waitForHttp(frontendUrl, 120000);

      this.updatePrewarmStatus(this.createPrewarmStatus('idle', this.getPrewarmRoutes()), false);
      this.updateStatus('ready', `${AGENT_MANAGER_NAME} is running; warming common screens`);
      this.startFrontendPrewarm();
      return this.status;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus('error', `${AGENT_MANAGER_NAME} failed to start`, message);
      return this.status;
    }
  }

  private resolveRepoDir(): string {
    const override = process.env.AGENT_MANAGER_DIR;
    if (override) {
      return override;
    }

    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'agent-manager');
    }

    return path.join(process.cwd(), 'apps', 'agent-manager');
  }

  private buildEnv(repoDir: string, runtimeDir: string): NodeJS.ProcessEnv {
    const frontendPort = process.env.AGENT_MANAGER_FRONTEND_PORT || DEFAULT_FRONTEND_PORT;
    const backendPort = process.env.AGENT_MANAGER_BACKEND_PORT || DEFAULT_BACKEND_PORT;
    const postgresPort = process.env.AGENT_MANAGER_POSTGRES_PORT || DEFAULT_POSTGRES_PORT;
    const frontendUrl = `http://localhost:${frontendPort}`;
    const backendUrl = `http://localhost:${backendPort}`;
    const wsUrl = `ws://localhost:${backendPort}/ws`;
    const pathValue = this.withToolPaths(process.env.PATH || '', [path.join(runtimeDir, 'bin')]);

    return {
      ...process.env,
      PATH: pathValue,
      POSTGRES_DB: 'multica',
      POSTGRES_USER: 'multica',
      POSTGRES_PASSWORD,
      POSTGRES_PORT: postgresPort,
      DATABASE_URL: `postgres://multica:${POSTGRES_PASSWORD}@127.0.0.1:${postgresPort}/multica?sslmode=disable`,
      PORT: backendPort,
      FRONTEND_PORT: frontendPort,
      FRONTEND_ORIGIN: frontendUrl,
      MULTICA_APP_URL: frontendUrl,
      MULTICA_SERVER_URL: wsUrl,
      NEXT_PUBLIC_API_URL: backendUrl,
      NEXT_PUBLIC_WS_URL: wsUrl,
      REMOTE_API_URL: backendUrl,
      GOOGLE_REDIRECT_URI: `${frontendUrl}/auth/callback`,
      ALLOWED_ORIGINS: `${frontendUrl},http://localhost:5173,http://127.0.0.1:5173`,
      CORS_ALLOWED_ORIGINS: `${frontendUrl},http://localhost:5173,http://127.0.0.1:5173`,
      LOCAL_UPLOAD_DIR: path.join(runtimeDir, 'uploads'),
      LOCAL_UPLOAD_BASE_URL: backendUrl,
      JWT_SECRET: this.getJwtSecret(runtimeDir),
      MULTICA_DEV_VERIFICATION_CODE: AGENT_MANAGER_LOCAL_CODE,
      AGENT_CLUB_AUTO_LOGIN: '1',
      AGENT_CLUB_AUTO_LOGIN_EMAIL: AGENT_MANAGER_LOCAL_EMAIL,
      ALLOW_SIGNUP: 'true',
      APP_ENV: '',
      RESEND_API_KEY: '',
      MULTICA_CODEX_PATH: process.env.MULTICA_CODEX_PATH || 'codex',
      MULTICA_CODEX_WORKDIR: repoDir,
      MULTICA_CLI_PATH: process.env.MULTICA_CLI_PATH || path.join(runtimeDir, 'bin', this.getMulticaExecutableName()),
    };
  }

  private buildDaemonEnv(env: NodeJS.ProcessEnv, runtimeDir: string, multicaCliPath: string): NodeJS.ProcessEnv {
    return {
      ...env,
      MULTICA_SERVER_URL: env.NEXT_PUBLIC_API_URL || this.getBackendUrl(),
      MULTICA_DAEMON_ID: AGENT_MANAGER_DAEMON_ID,
      MULTICA_DAEMON_DEVICE_NAME: AGENT_MANAGER_DAEMON_DEVICE_NAME,
      MULTICA_AGENT_RUNTIME_NAME: 'Agent Club Runtime',
      MULTICA_DAEMON_POLL_INTERVAL: '5s',
      MULTICA_DAEMON_HEARTBEAT_INTERVAL: '15s',
      MULTICA_WORKSPACES_ROOT: path.join(runtimeDir, 'workspaces'),
      MULTICA_LAUNCHED_BY: 'desktop',
      MULTICA_CODEX_PATH: env.MULTICA_CODEX_PATH || 'codex',
      MULTICA_CLI_PATH: multicaCliPath,
      PATH: this.withToolPaths(env.PATH || '', [path.dirname(multicaCliPath)]),
    };
  }

  private async ensureLocalDaemonProfile(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const workspaceId = await this.getLocalWorkspaceId(repoDir, env);
    const token = await this.createLocalSessionToken(env);
    const profileDir = path.join(os.homedir(), '.multica', 'profiles', AGENT_MANAGER_DAEMON_PROFILE);
    const configPath = path.join(profileDir, 'config.json');

    fs.mkdirSync(profileDir, { recursive: true });
    const config = {
      server_url: env.NEXT_PUBLIC_API_URL || this.getBackendUrl(),
      app_url: this.getFrontendUrl(),
      workspace_id: workspaceId,
      token,
    };

    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(configPath, 0o600);
  }

  private async getLocalWorkspaceId(repoDir: string, env: NodeJS.ProcessEnv): Promise<string> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`${AGENT_MANAGER_NAME} database URL is not configured`);
    }

    const psql = this.getPostgresCommand('psql');
    const result = await this.runCommand(
      psql,
      [
        '-v',
        'ON_ERROR_STOP=1',
        databaseUrl,
        '-tAc',
        `SELECT id FROM workspace WHERE slug = '${AGENT_MANAGER_WORKSPACE_SLUG}' LIMIT 1`,
      ],
      repoDir,
      env,
      `${AGENT_MANAGER_NAME} local workspace lookup`,
      30000
    );
    const workspaceId = result.stdout.trim().split(/\s+/)[0];
    if (!workspaceId) {
      throw new Error(`${AGENT_MANAGER_NAME} local workspace was not created`);
    }
    return workspaceId;
  }

  private async createLocalSessionToken(env: NodeJS.ProcessEnv): Promise<string> {
    const response = await fetch(`${env.NEXT_PUBLIC_API_URL || this.getBackendUrl()}/auth/agent-club`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: AGENT_MANAGER_LOCAL_EMAIL }),
    });

    if (!response.ok) {
      throw new Error(`${AGENT_MANAGER_NAME} local login returned ${response.status}`);
    }

    const payload = (await response.json()) as { token?: string };
    if (!payload.token) {
      throw new Error(`${AGENT_MANAGER_NAME} local login did not return a token`);
    }
    return payload.token;
  }

  private async stopExistingLocalDaemon(): Promise<void> {
    const healthUrl = `http://127.0.0.1:${AGENT_MANAGER_DAEMON_HEALTH_PORT}/health`;
    const shutdownUrl = `http://127.0.0.1:${AGENT_MANAGER_DAEMON_HEALTH_PORT}/shutdown`;

    try {
      const response = await fetch(healthUrl, { method: 'GET' });
      if (!response.ok) {
        return;
      }

      const health = (await response.json()) as { status?: string; daemon_id?: string };
      if (health.status !== 'running' || health.daemon_id !== AGENT_MANAGER_DAEMON_ID) {
        return;
      }

      await this.fetchWithTimeout(shutdownUrl, 5000, 'POST');
      await this.waitForPortClosed('127.0.0.1', AGENT_MANAGER_DAEMON_HEALTH_PORT, 10000);
    } catch {
      // No prior Local Agent Manager daemon is running.
    }
  }

  private async waitForLocalDaemonReady(timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    const healthUrl = `http://127.0.0.1:${AGENT_MANAGER_DAEMON_HEALTH_PORT}/health`;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(healthUrl, { method: 'GET' });
        if (response.ok) {
          const health = (await response.json()) as { status?: string; daemon_id?: string };
          if (health.status === 'running' && health.daemon_id === AGENT_MANAGER_DAEMON_ID) {
            return;
          }
        }
      } catch {
        // Daemon is still booting.
      }
      await this.delay(1000);
    }

    throw new Error(`Timed out waiting for ${AGENT_MANAGER_NAME} local runtime`);
  }

  private async syncLocalRuntimeAgents(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`${AGENT_MANAGER_NAME} database URL is not configured`);
    }

    const psql = this.getPostgresCommand('psql');
    await this.runCommand(
      psql,
      ['-v', 'ON_ERROR_STOP=1', databaseUrl],
      repoDir,
      env,
      `${AGENT_MANAGER_NAME} runtime agent sync`,
      60000,
      this.getLocalRuntimeAgentSyncSql()
    );
  }

  private getLocalRuntimeAgentSyncSql(): string {
    return `
WITH workspace_selected AS (
  SELECT id FROM workspace WHERE slug = '${AGENT_MANAGER_WORKSPACE_SLUG}' LIMIT 1
),
app_user AS (
  SELECT id FROM "user" WHERE email = '${AGENT_MANAGER_LOCAL_EMAIL}' LIMIT 1
),
runtime_seed AS (
  SELECT
    r.workspace_id,
    r.id AS runtime_id,
    r.provider,
    CASE r.provider
      WHEN 'hermes' THEN 'Hermes Chief of Staff'
      WHEN 'codex' THEN 'Codex Builder'
      WHEN 'claude' THEN 'Claude Assistant'
      WHEN 'openclaw' THEN 'OpenClaw Operator'
      WHEN 'gemini' THEN 'Gemini Analyst'
      WHEN 'opencode' THEN 'OpenCode Builder'
      ELSE initcap(r.provider) || ' Agent'
    END AS name,
    CASE r.provider
      WHEN 'hermes' THEN 'Coordinates local agent work through Hermes and keeps Agent Club tasks moving.'
      WHEN 'codex' THEN 'Runs implementation tasks through the Codex runtime bundled with Agent Club.'
      WHEN 'claude' THEN 'Runs planning and implementation tasks through the Claude runtime detected by Agent Club.'
      WHEN 'openclaw' THEN 'Runs OpenClaw workflows from the local Agent Club runtime.'
      WHEN 'gemini' THEN 'Runs research and analysis tasks through the Gemini runtime detected by Agent Club.'
      WHEN 'opencode' THEN 'Runs coding tasks through the OpenCode runtime detected by Agent Club.'
      ELSE 'Runs tasks through the local Agent Club runtime provider.'
    END AS description,
    CASE r.provider
      WHEN 'hermes' THEN 'Act as the Chief of Staff: understand the goal, route work to the right tools, keep progress observable, and report concise next steps.'
      WHEN 'codex' THEN 'Keep edits scoped, run focused checks, and report concrete results back to Agent Club.'
      WHEN 'claude' THEN 'Plan clearly, execute carefully, and keep Agent Club tasks updated with concise progress notes.'
      WHEN 'openclaw' THEN 'Operate local OpenClaw workflows and keep task state synchronized with Agent Club.'
      WHEN 'gemini' THEN 'Gather context, compare options, and summarize findings for Agent Club tasks.'
      ELSE 'Use the local runtime to complete Agent Club tasks and keep task state current.'
    END AS instructions,
    NULL::text AS model
  FROM agent_runtime r
  JOIN workspace_selected w ON w.id = r.workspace_id
  WHERE r.daemon_id = '${AGENT_MANAGER_DAEMON_ID}'
    AND r.status = 'online'
)
INSERT INTO agent (
  workspace_id,
  name,
  description,
  avatar_url,
  runtime_mode,
  runtime_config,
  runtime_id,
  visibility,
  status,
  max_concurrent_tasks,
  owner_id,
  instructions,
  custom_env,
  custom_args,
  mcp_config,
  model
)
SELECT
  runtime_seed.workspace_id,
  runtime_seed.name,
  runtime_seed.description,
  NULL,
  'local',
  jsonb_build_object('managedBy', 'Agent Club', 'source', 'aionui-runtime', 'provider', runtime_seed.provider),
  runtime_seed.runtime_id,
  'workspace',
  'idle',
  3,
  app_user.id,
  runtime_seed.instructions,
  '{}'::jsonb,
  '[]'::jsonb,
  NULL::jsonb,
  runtime_seed.model
FROM runtime_seed
CROSS JOIN app_user
ON CONFLICT (workspace_id, name) DO UPDATE
  SET description = EXCLUDED.description,
      runtime_config = EXCLUDED.runtime_config,
      runtime_id = EXCLUDED.runtime_id,
      visibility = 'workspace',
      status = 'idle',
      max_concurrent_tasks = EXCLUDED.max_concurrent_tasks,
      owner_id = EXCLUDED.owner_id,
      instructions = EXCLUDED.instructions,
      custom_env = EXCLUDED.custom_env,
      custom_args = EXCLUDED.custom_args,
      mcp_config = EXCLUDED.mcp_config,
      model = EXCLUDED.model,
      archived_at = NULL,
      archived_by = NULL,
      updated_at = NOW();
`;
  }

  private getJwtSecret(runtimeDir: string): string {
    const secretPath = path.join(runtimeDir, 'jwt-secret');
    if (fs.existsSync(secretPath)) {
      return fs.readFileSync(secretPath, 'utf-8').trim();
    }

    const secret = randomBytes(32).toString('hex');
    fs.writeFileSync(secretPath, secret, { mode: 0o600 });
    return secret;
  }

  private withToolPaths(pathValue: string, prependPaths: string[] = []): string {
    const existing = new Set(pathValue.split(path.delimiter).filter(Boolean));
    const prepend = prependPaths.filter((item) => item && fs.existsSync(item) && !existing.has(item));
    prepend.forEach((item) => existing.add(item));
    const additions = HOMEBREW_BIN_PATHS.filter((item) => fs.existsSync(item) && !existing.has(item));
    return [...prepend, ...additions, pathValue].filter(Boolean).join(path.delimiter);
  }

  private async ensureMulticaCli(repoDir: string, runtimeDir: string, env: NodeJS.ProcessEnv): Promise<string> {
    const explicitPath = process.env.MULTICA_CLI_PATH;
    if (explicitPath && fs.existsSync(explicitPath)) {
      return explicitPath;
    }

    const bundledPath = this.resolveBundledMulticaCliPath();
    if (bundledPath) {
      this.ensureExecutable(bundledPath);
      return bundledPath;
    }

    const binDir = path.join(runtimeDir, 'bin');
    const cliPath = path.join(binDir, this.getMulticaExecutableName());
    if (fs.existsSync(cliPath)) {
      this.ensureExecutable(cliPath);
      return cliPath;
    }

    fs.mkdirSync(binDir, { recursive: true });
    this.updateStatus('starting', `Building ${AGENT_MANAGER_NAME} CLI`);
    await this.runCommand(
      'go',
      ['build', '-trimpath', '-ldflags', this.getMulticaCliLdflags(), '-o', cliPath, './cmd/multica'],
      path.join(repoDir, 'server'),
      env,
      'multica cli build',
      180000
    );
    this.ensureExecutable(cliPath);
    return cliPath;
  }

  private resolveBundledMulticaCliPath(): string | null {
    const platformArch = this.getGoPlatformArch();
    const executable = this.getMulticaExecutableName();
    const candidates = [];

    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, 'bundled-multica', platformArch, executable));
    }

    candidates.push(path.join(process.cwd(), 'resources', 'bundled-multica', platformArch, executable));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private getGoPlatformArch(): string {
    return this.getGoOS() + '-' + this.getGoArch();
  }

  private getGoOS(): string {
    if (process.platform === 'win32') return 'windows';
    return process.platform;
  }

  private getGoArch(): string {
    if (process.arch === 'x64') return 'amd64';
    return process.arch;
  }

  private getMulticaExecutableName(): string {
    return this.getGoOS() === 'windows' ? 'multica.exe' : 'multica';
  }

  private getMulticaCliLdflags(): string {
    return [
      '-X main.version=' + AGENT_MANAGER_CLI_VERSION,
      '-X main.commit=' + AGENT_MANAGER_CLI_COMMIT,
      '-X main.date=' + new Date().toISOString(),
    ].join(' ');
  }

  private ensureExecutable(filePath: string): void {
    if (process.platform !== 'win32') {
      fs.chmodSync(filePath, 0o755);
    }
  }

  private async ensureDependencies(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const pnpm = this.resolvePnpmCommand();
    this.assertResolvedCommand(
      pnpm,
      ['--version'],
      `pnpm is required to start ${AGENT_MANAGER_NAME}. The packaged app should include pnpm; reinstall Agent Club from the latest release if this appears.`
    );
    this.assertCommand('go', ['version'], `Go is required to start the ${AGENT_MANAGER_NAME} backend.`);

    if (fs.existsSync(path.join(repoDir, 'node_modules', '.modules.yaml'))) {
      return;
    }

    this.updateStatus('starting', `Installing ${AGENT_MANAGER_NAME} dependencies`);
    await this.runCommand(
      pnpm.command,
      [...pnpm.argsPrefix, 'install'],
      repoDir,
      { ...env, ...pnpm.envPatch },
      'pnpm install',
      240000
    );
  }

  private resolvePnpmCommand(): ResolvedCommand {
    const bundledPnpm = this.resolveBundledPnpmPath();
    if (bundledPnpm) {
      return {
        command: process.execPath,
        argsPrefix: [bundledPnpm],
        envPatch: { ELECTRON_RUN_AS_NODE: '1' },
      };
    }

    return { command: 'pnpm', argsPrefix: [] };
  }

  private resolveBundledPnpmPath(): string | null {
    const candidates = [];

    if (app.isPackaged) {
      candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
      candidates.push(path.join(process.resourcesPath, 'app.asar', 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));
    }

    candidates.push(path.join(process.cwd(), 'node_modules', 'pnpm', 'bin', 'pnpm.cjs'));

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async ensurePostgres(repoDir: string, runtimeDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const postgresPort = Number(env.POSTGRES_PORT || DEFAULT_POSTGRES_PORT);
    const pgBin = this.getPostgresCommand('postgres');
    const initdb = this.getPostgresCommand('initdb');
    const psql = this.getPostgresCommand('psql');
    const createdb = this.getPostgresCommand('createdb');
    const pgDataDir = path.join(runtimeDir, 'postgres-data');
    const passwordPath = path.join(runtimeDir, 'postgres-password');

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(passwordPath, `${POSTGRES_PASSWORD}\n`, { mode: 0o600 });

    if (!fs.existsSync(path.join(pgDataDir, 'PG_VERSION'))) {
      this.updateStatus('starting', `Initializing ${AGENT_MANAGER_NAME} database`);
      await this.runCommand(
        initdb,
        ['-D', pgDataDir, '-U', 'multica', '--pwfile', passwordPath, '--auth-local=trust', '--auth-host=md5'],
        repoDir,
        env,
        'postgres init',
        120000
      );
    }

    if (!(await this.isPortOpen('127.0.0.1', postgresPort, 500))) {
      this.updateStatus('starting', `Starting ${AGENT_MANAGER_NAME} database`);
      this.spawnManaged(
        pgBin,
        ['-D', pgDataDir, '-h', '127.0.0.1', '-p', String(postgresPort)],
        repoDir,
        env,
        'postgres'
      );
      await this.waitForPort('127.0.0.1', postgresPort, 60000);
    }

    const dbCheck = await this.runCommand(
      psql,
      [
        '-h',
        '127.0.0.1',
        '-p',
        String(postgresPort),
        '-U',
        'multica',
        '-d',
        'postgres',
        '-tAc',
        "SELECT 1 FROM pg_database WHERE datname='multica'",
      ],
      repoDir,
      { ...env, PGPASSWORD: POSTGRES_PASSWORD },
      'postgres check',
      30000
    );

    if (!dbCheck.stdout.trim().includes('1')) {
      await this.runCommand(
        createdb,
        ['-h', '127.0.0.1', '-p', String(postgresPort), '-U', 'multica', 'multica'],
        repoDir,
        { ...env, PGPASSWORD: POSTGRES_PASSWORD },
        'postgres createdb',
        30000
      );
    }
  }

  private assertCommand(command: string, args: string[], message: string): void {
    const result = spawnSync(command, args, {
      env: { ...process.env, PATH: this.withToolPaths(process.env.PATH || '') },
    });
    if (result.error || result.status !== 0) {
      throw new Error(message);
    }
  }

  private assertResolvedCommand(resolved: ResolvedCommand, args: string[], message: string): void {
    const result = spawnSync(resolved.command, [...resolved.argsPrefix, ...args], {
      env: {
        ...process.env,
        ...resolved.envPatch,
        PATH: this.withToolPaths(process.env.PATH || ''),
      },
    });
    if (result.error || result.status !== 0) {
      throw new Error(message);
    }
  }

  private getPostgresCommand(command: string): string {
    const candidates = [
      command,
      path.join('/opt/homebrew/opt/postgresql@17/bin', command),
      path.join('/usr/local/opt/postgresql@17/bin', command),
    ];

    for (const candidate of candidates) {
      const result = spawnSync(candidate, ['--version'], {
        env: { ...process.env, PATH: this.withToolPaths(process.env.PATH || '') },
      });
      if (!result.error && result.status === 0) {
        return candidate;
      }
    }

    throw new Error(`PostgreSQL command not found: ${command}`);
  }

  private killProcessTree(child: ChildProcess, signal: NodeJS.Signals): void {
    if (child.killed || child.exitCode !== null) {
      return;
    }

    if (process.platform !== 'win32' && child.pid) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // Fall back to the root process if the process group is already gone.
      }
    }

    child.kill(signal);
  }

  private spawnManaged(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    label: string
  ): ChildProcess {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    this.processes.add(child);

    child.stdout?.on('data', (chunk: Buffer) => this.logChild(label, chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.logChild(label, chunk));
    child.on('exit', (code, signal) => {
      this.processes.delete(child);
      console.log(`[AgentManager:${label}] exited code=${code ?? 'null'} signal=${signal ?? 'null'}`);
      if (this.status.state === 'ready' && label !== 'postgres') {
        void this.handleManagedProcessExitWhileReady(label, code, signal);
      }
    });

    child.on('error', (error) => {
      this.processes.delete(child);
      this.updateStatus('error', `Failed to start ${AGENT_MANAGER_NAME} ${label}`, error.message);
    });

    return child;
  }

  private async seedLocalWorkspace(repoDir: string, env: NodeJS.ProcessEnv): Promise<void> {
    const databaseUrl = env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(`${AGENT_MANAGER_NAME} database URL is not configured`);
    }

    this.updateStatus('starting', `Preparing local ${AGENT_MANAGER_NAME} workspace`);

    const psql = this.getPostgresCommand('psql');
    await this.runCommand(
      psql,
      ['-v', 'ON_ERROR_STOP=1', databaseUrl],
      repoDir,
      env,
      `${AGENT_MANAGER_NAME} local workspace seed`,
      60000,
      this.getLocalWorkspaceSeedSql()
    );
  }

  private getLocalWorkspaceSeedSql(): string {
    return `
WITH app_user AS (
  INSERT INTO "user" (name, email, avatar_url, onboarded_at, starter_content_state, language)
  VALUES ('Agent Club', '${AGENT_MANAGER_LOCAL_EMAIL}', NULL, NOW(), 'imported', 'en')
  ON CONFLICT (email) DO UPDATE
    SET name = EXCLUDED.name,
        onboarded_at = COALESCE("user".onboarded_at, NOW()),
        starter_content_state = COALESCE("user".starter_content_state, 'imported'),
        updated_at = NOW()
  RETURNING id
),
workspace_upsert AS (
  INSERT INTO workspace (name, slug, description, context, settings, repos, issue_prefix, issue_counter)
  VALUES (
    'Agent Club',
    '${AGENT_MANAGER_WORKSPACE_SLUG}',
    'Local Agent Manager workspace bundled with Agent Club.',
    'Agent Club is the local operating workspace for bundled applications, agents, and task management.',
    '{"agentClub":true,"managedBy":"Agent Club"}'::jsonb,
    '[]'::jsonb,
    'AC',
    20
  )
  ON CONFLICT (slug) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        context = EXCLUDED.context,
        settings = EXCLUDED.settings,
        issue_prefix = EXCLUDED.issue_prefix,
        issue_counter = GREATEST(workspace.issue_counter, EXCLUDED.issue_counter),
        updated_at = NOW()
  RETURNING id
),
member_upsert AS (
  INSERT INTO member (workspace_id, user_id, role)
  SELECT workspace_upsert.id, app_user.id, 'owner'
  FROM workspace_upsert, app_user
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET role = 'owner'
  RETURNING id, workspace_id, user_id
),
runtime_upsert AS (
  INSERT INTO agent_runtime (
    workspace_id,
    daemon_id,
    name,
    runtime_mode,
    provider,
    status,
    device_info,
    metadata,
    last_seen_at,
    owner_id,
    timezone,
    visibility
  )
  SELECT
    workspace_upsert.id,
    'agent-club-local-runtime',
    'Agent Club Local Runtime',
    'local',
    'codex',
    'online',
    'Agent Club bundled local runtime',
    '{"managedBy":"Agent Club"}'::jsonb,
    NOW(),
    app_user.id,
    'America/New_York',
    'public'
  FROM workspace_upsert, app_user
  ON CONFLICT (workspace_id, daemon_id, provider) DO UPDATE
    SET name = EXCLUDED.name,
        status = 'online',
        device_info = EXCLUDED.device_info,
        metadata = EXCLUDED.metadata,
        last_seen_at = NOW(),
        owner_id = EXCLUDED.owner_id,
        timezone = EXCLUDED.timezone,
        visibility = EXCLUDED.visibility,
        updated_at = NOW()
  RETURNING id, workspace_id
),
seed_agents(name, description, instructions, model, max_tasks) AS (
  VALUES
    ('Coordinator', 'Plans work and routes tasks across Agent Club.', 'Keep Agent Club work organized, break goals into clear tasks, and route execution to the right agent.', NULL::text, 4),
    ('Builder', 'Implements application and automation changes.', 'Focus on concrete implementation work, test changes, and keep edits scoped to the active Agent Club workspace.', NULL::text, 3),
    ('Researcher', 'Collects context for tools, integrations, and workflows.', 'Gather precise context, summarize tradeoffs, and attach useful references to tasks before execution begins.', NULL::text, 2)
),
agent_upsert AS (
  INSERT INTO agent (
    workspace_id,
    name,
    description,
    avatar_url,
    runtime_mode,
    runtime_config,
    runtime_id,
    visibility,
    status,
    max_concurrent_tasks,
    owner_id,
    instructions,
    custom_env,
    custom_args,
    mcp_config,
    model
  )
  SELECT
    runtime_upsert.workspace_id,
    seed_agents.name,
    seed_agents.description,
    NULL,
    'local',
    '{"managedBy":"Agent Club"}'::jsonb,
    runtime_upsert.id,
    'workspace',
    'idle',
    seed_agents.max_tasks,
    app_user.id,
    seed_agents.instructions,
    '{}'::jsonb,
    '[]'::jsonb,
    NULL::jsonb,
    seed_agents.model
  FROM seed_agents, runtime_upsert, app_user
  ON CONFLICT (workspace_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        runtime_config = EXCLUDED.runtime_config,
        runtime_id = EXCLUDED.runtime_id,
        visibility = 'workspace',
        status = 'idle',
        max_concurrent_tasks = EXCLUDED.max_concurrent_tasks,
        owner_id = EXCLUDED.owner_id,
        instructions = EXCLUDED.instructions,
        custom_env = EXCLUDED.custom_env,
        custom_args = EXCLUDED.custom_args,
        mcp_config = EXCLUDED.mcp_config,
        model = EXCLUDED.model,
        archived_at = NULL,
        archived_by = NULL,
        updated_at = NOW()
  RETURNING id, name, workspace_id
),
project_existing AS (
  SELECT project.id
  FROM project, workspace_upsert
  WHERE project.workspace_id = workspace_upsert.id
    AND project.title = 'Agent Club Operating Board'
  LIMIT 1
),
project_created AS (
  INSERT INTO project (workspace_id, title, description, icon, status, lead_type, lead_id, priority)
  SELECT
    workspace_upsert.id,
    'Agent Club Operating Board',
    'Default task board for Agent Club apps, agents, and bundled workflows.',
    NULL,
    'in_progress',
    'member',
    member_upsert.id,
    'high'
  FROM workspace_upsert, member_upsert
  WHERE NOT EXISTS (SELECT 1 FROM project_existing)
  RETURNING id
),
project_selected AS (
  SELECT id FROM project_created
  UNION ALL
  SELECT id FROM project_existing
  LIMIT 1
),
issue_seed(title, description, status, priority, agent_name, number, position) AS (
  VALUES
    ('Review bundled applications', 'Keep track of which local tools are bundled into Agent Club and whether each one starts correctly.', 'todo', 'medium', 'Coordinator', 1, 1),
    ('Maintain Local Agent Manager workspace', 'Use this board for task management, agents, and application planning inside the bundled Multica instance.', 'in_progress', 'high', 'Builder', 2, 2),
    ('Document next integrations', 'Capture candidates for the next apps or automations that should be added to Agent Club.', 'todo', 'low', 'Researcher', 3, 3)
)
INSERT INTO issue (
  workspace_id,
  title,
  description,
  status,
  priority,
  assignee_type,
  assignee_id,
  creator_type,
  creator_id,
  acceptance_criteria,
  context_refs,
  position,
  number,
  project_id
)
SELECT
  workspace_upsert.id,
  issue_seed.title,
  issue_seed.description,
  issue_seed.status,
  issue_seed.priority,
  'agent',
  agent_upsert.id,
  'member',
  member_upsert.id,
  '[]'::jsonb,
  '[]'::jsonb,
  issue_seed.position,
  issue_seed.number,
  project_selected.id
FROM issue_seed
JOIN agent_upsert ON agent_upsert.name = issue_seed.agent_name
CROSS JOIN workspace_upsert
CROSS JOIN member_upsert
CROSS JOIN project_selected
ON CONFLICT (workspace_id, number) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      status = EXCLUDED.status,
      priority = EXCLUDED.priority,
      assignee_type = EXCLUDED.assignee_type,
      assignee_id = EXCLUDED.assignee_id,
      acceptance_criteria = EXCLUDED.acceptance_criteria,
      context_refs = EXCLUDED.context_refs,
      position = EXCLUDED.position,
      project_id = EXCLUDED.project_id,
      updated_at = NOW();

UPDATE project
SET icon = NULL,
    updated_at = NOW()
WHERE title = 'Agent Club Operating Board'
  AND workspace_id = (SELECT id FROM workspace WHERE slug = '${AGENT_MANAGER_WORKSPACE_SLUG}');
`;
  }

  private async runCommand(
    command: string,
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    label: string,
    timeoutMs: number,
    input?: string
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, env, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
      if (input && child.stdin) {
        child.stdin.end(input);
      }
      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        this.logChild(label, chunk);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        this.logChild(label, chunk);
      });
      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`${label} failed with exit code ${code}: ${stderr || stdout}`));
        }
      });
    });
  }

  private getPrewarmRoutes(): AgentManagerPrewarmRoute[] {
    const workspaceBase = `/${AGENT_MANAGER_WORKSPACE_SLUG}`;
    const encodedAgentsPath = encodeURIComponent(`${workspaceBase}/agents`);

    return [
      {
        path: `/agent-club-boot?next=${encodedAgentsPath}`,
        label: 'Session boot',
        timeoutMs: 45000,
      },
      { path: `${workspaceBase}/agents`, label: 'Agents', timeoutMs: 45000 },
      { path: `${workspaceBase}/goals`, label: 'Goals', timeoutMs: 90000 },
      { path: `${workspaceBase}/issues`, label: 'Issues', timeoutMs: 90000 },
      { path: `${workspaceBase}/planner`, label: 'Planner', timeoutMs: 90000 },
      { path: `${workspaceBase}/projects`, label: 'Projects', timeoutMs: 60000 },
      { path: `${workspaceBase}/runtimes`, label: 'Runtimes', timeoutMs: 60000 },
      { path: `${workspaceBase}/skills`, label: 'Skills', timeoutMs: 60000 },
      { path: `${workspaceBase}/inbox`, label: 'Inbox', timeoutMs: 45000 },
      { path: `${workspaceBase}/my-issues`, label: 'My Issues', timeoutMs: 45000 },
      { path: `${workspaceBase}/autopilots`, label: 'Autopilots', timeoutMs: 45000 },
      { path: `${workspaceBase}/squads`, label: 'Squads', timeoutMs: 45000 },
    ];
  }

  private startFrontendPrewarm(): void {
    if (this.prewarmPromise) {
      return;
    }

    this.prewarmPromise = this.prewarmFrontendRoutes().finally(() => {
      this.prewarmPromise = null;
    });
  }

  private async prewarmFrontendRoutes(): Promise<void> {
    const frontendUrl = this.getFrontendUrl();
    const routes = this.getPrewarmRoutes();
    const startedAt = Date.now();
    let routeStatuses = this.createPrewarmRouteStatuses(routes);
    let completed = 0;
    let failed = 0;

    console.log(`[AgentManager] prewarming common ${AGENT_MANAGER_NAME} screens`);
    this.updatePrewarmStatus({
      state: 'warming',
      total: routes.length,
      completed,
      failed,
      startedAt,
      routes: routeStatuses,
    });

    for (const route of routes) {
      const url = `${frontendUrl}${route.path}`;
      const routeStartedAt = Date.now();
      routeStatuses = this.updatePrewarmRoute(routeStatuses, route.path, {
        state: 'warming',
        updatedAt: routeStartedAt,
      });
      this.updatePrewarmStatus({
        state: 'warming',
        total: routes.length,
        completed,
        failed,
        currentPath: route.path,
        currentLabel: route.label,
        startedAt,
        routes: routeStatuses,
      });

      try {
        await this.fetchWithTimeout(url, route.timeoutMs || 45000);
        completed += 1;
        routeStatuses = this.updatePrewarmRoute(routeStatuses, route.path, {
          state: 'ready',
          durationMs: Date.now() - routeStartedAt,
          updatedAt: Date.now(),
        });
        console.log(`[AgentManager] prewarmed ${route.path} in ${Date.now() - routeStartedAt}ms`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        routeStatuses = this.updatePrewarmRoute(routeStatuses, route.path, {
          state: 'error',
          durationMs: Date.now() - routeStartedAt,
          error: message,
          updatedAt: Date.now(),
        });
        console.warn(`[AgentManager] prewarm skipped ${route.path}: ${message}`);
      }

      this.updatePrewarmStatus({
        state: 'warming',
        total: routes.length,
        completed,
        failed,
        startedAt,
        routes: routeStatuses,
      });
    }

    this.updatePrewarmStatus({
      state: failed > 0 ? 'error' : 'ready',
      total: routes.length,
      completed,
      failed,
      startedAt,
      completedAt: Date.now(),
      routes: routeStatuses,
    });

    console.log(
      `[AgentManager] common ${AGENT_MANAGER_NAME} screens prewarmed (${completed}/${routes.length}, failed=${failed})`
    );
  }

  private createPrewarmStatus(
    state: AgentManagerPrewarmStatus['state'],
    routes: AgentManagerPrewarmRoute[]
  ): AgentManagerPrewarmStatus {
    return {
      state,
      total: routes.length,
      completed: 0,
      failed: 0,
      routes: this.createPrewarmRouteStatuses(routes),
    };
  }

  private createPrewarmRouteStatuses(routes: AgentManagerPrewarmRoute[]): AgentManagerPrewarmRouteStatus[] {
    return routes.map((route) => ({
      path: route.path,
      label: route.label,
      state: 'queued',
    }));
  }

  private updatePrewarmRoute(
    routes: AgentManagerPrewarmRouteStatus[],
    pathName: string,
    patch: Partial<AgentManagerPrewarmRouteStatus>
  ): AgentManagerPrewarmRouteStatus[] {
    return routes.map((route) => (route.path === pathName ? { ...route, ...patch } : route));
  }

  private updatePrewarmStatus(prewarm: AgentManagerPrewarmStatus, emit = true): void {
    this.prewarmStatus = prewarm;

    if (!emit) {
      return;
    }

    this.status = {
      ...this.status,
      prewarm,
      updatedAt: Date.now(),
    };
    ipcBridge.agentManager.statusChanged.emit(this.status);
  }

  private async fetchWithTimeout(url: string, timeoutMs: number, method: 'GET' | 'POST' = 'GET'): Promise<number> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { method, signal: controller.signal });
      await response.arrayBuffer();
      if (response.status >= 500) {
        throw new Error(`${url} returned ${response.status}`);
      }
      return response.status;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async isHttpAvailable(url: string, timeoutMs: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { method: 'GET', signal: controller.signal });
        return response.status < 500;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  private async tryWaitForHttp(url: string, timeoutMs: number): Promise<boolean> {
    try {
      await this.waitForHttp(url, timeoutMs);
      return true;
    } catch {
      return false;
    }
  }

  private async handleManagedProcessExitWhileReady(
    label: string,
    code: number | null,
    signal: NodeJS.Signals | null
  ): Promise<void> {
    if (label === 'web' && (await this.isHttpAvailable(this.getFrontendUrl(), 5000))) {
      console.log(`[AgentManager:web] exited, but ${AGENT_MANAGER_NAME} web UI is still available`);
      return;
    }

    this.updateStatus('error', `${AGENT_MANAGER_NAME} process exited`, `${label} exited with code ${code ?? signal}`);
  }

  private async waitForHttp(url: string, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch(url, { method: 'GET' });
        if (response.status < 500) {
          return;
        }
      } catch {
        // Server is still booting.
      }
      await this.delay(1000);
    }
    throw new Error(`Timed out waiting for ${url}`);
  }

  private async waitForPort(host: string, port: number, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isPortOpen(host, port, 750)) {
        return;
      }
      await this.delay(500);
    }
    throw new Error(`Timed out waiting for ${host}:${port}`);
  }

  private async waitForPortClosed(host: string, port: number, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!(await this.isPortOpen(host, port, 750))) {
        return;
      }
      await this.delay(500);
    }
    throw new Error(`Timed out waiting for ${host}:${port} to close`);
  }

  private isPortOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const done = (value: boolean) => {
        socket.destroy();
        resolve(value);
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => done(true));
      socket.once('timeout', () => done(false));
      socket.once('error', () => done(false));
      socket.connect(port, host);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getFrontendUrl(): string {
    const frontendPort = process.env.AGENT_MANAGER_FRONTEND_PORT || DEFAULT_FRONTEND_PORT;
    return `http://localhost:${frontendPort}`;
  }

  private getBackendUrl(): string {
    const backendPort = process.env.AGENT_MANAGER_BACKEND_PORT || DEFAULT_BACKEND_PORT;
    return `http://localhost:${backendPort}`;
  }

  private createStatus(state: AgentManagerStatus['state'], message?: string, detail?: string): AgentManagerStatus {
    return {
      state,
      url: this.getFrontendUrl(),
      backendUrl: this.getBackendUrl(),
      message,
      detail,
      prewarm: this.prewarmStatus,
      updatedAt: Date.now(),
    };
  }

  private updateStatus(state: AgentManagerStatus['state'], message?: string, detail?: string): void {
    this.status = this.createStatus(state, message, detail);
    console.log(`[AgentManager] ${state}: ${message || ''}${detail ? ` (${detail})` : ''}`);
    ipcBridge.agentManager.statusChanged.emit(this.status);
  }

  private logChild(label: string, chunk: Buffer): void {
    const lines = chunk
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    lines.forEach((line) => console.log(`[AgentManager:${label}] ${line}`));
  }
}
