export type ChatGoalCommandAction = 'prep' | 'run' | 'run_prepared';

export interface ParsedChatGoalCommand {
  action: ChatGoalCommandAction;
  title: string;
  body: string;
  projectHint?: string;
  tags: string[];
}

export interface ChatGoalCommandParseResult {
  command: ParsedChatGoalCommand | null;
  error?: string;
}

const GOAL_COMMAND_RE = /^\/goal(?:\s+([\s\S]*))?$/i;
const PROJECT_HINT_RE = /(?:^|\s)(?:project|proj):(?:"([^"]+)"|'([^']+)'|([^\s#]+))/i;
const TAG_RE = /(?:^|\s)#([a-zA-Z0-9_-]+)/g;
const GOAL_APPROVAL_RE =
  /^(?:go ahead|start actioning(?: the goal)?|start(?: the)? goal|run(?: the)? goal|action(?: the)? goal)$/i;
const MAX_TITLE_LENGTH = 96;

function trimTitle(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_TITLE_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trim()}...`;
}

function extractProjectHint(value: string): { body: string; projectHint?: string } {
  const match = value.match(PROJECT_HINT_RE);
  if (!match) {
    return { body: value };
  }

  const projectHint = (match[1] || match[2] || match[3] || '').trim();
  const start = match.index ?? 0;
  const end = start + match[0].length;
  return {
    body: `${value.slice(0, start)} ${value.slice(end)}`.replace(/\s+/g, ' ').trim(),
    projectHint: projectHint || undefined,
  };
}

function extractTags(value: string): { body: string; tags: string[] } {
  const tags: string[] = [];
  const body = value.replace(TAG_RE, (_match, tag: string) => {
    tags.push(tag);
    return ' ';
  });
  return {
    body: body.replace(/\s+/g, ' ').trim(),
    tags: Array.from(new Set(tags)),
  };
}

export function parseChatGoalSlashCommand(input: string): ChatGoalCommandParseResult {
  const raw = input.trim();
  const match = raw.match(GOAL_COMMAND_RE);
  if (!match) {
    return { command: null };
  }

  const rest = (match[1] || '').trim();
  if (!rest) {
    return {
      command: {
        action: 'run_prepared',
        title: 'Run prepared goal',
        body: '',
        tags: [],
      },
    };
  }

  const [firstToken, ...remainingTokens] = rest.split(/\s+/);
  let action: ChatGoalCommandAction = 'run';
  let commandBody = rest;
  const normalizedFirstToken = firstToken.toLowerCase();

  if (normalizedFirstToken === 'prep' || normalizedFirstToken === 'prepare') {
    action = 'prep';
    commandBody = remainingTokens.join(' ').trim();
  } else if (firstToken === 'run' || firstToken === 'start') {
    action = 'run';
    commandBody = remainingTokens.join(' ').trim();
  }

  if (!commandBody) {
    return {
      command: null,
      error: `Add goal details after /goal ${action === 'prep' ? 'prep' : 'run'}.`,
    };
  }

  const projectResult = extractProjectHint(commandBody);
  const tagResult = extractTags(projectResult.body);
  const body = tagResult.body || commandBody;
  const firstLine = body.split(/\r?\n/).find((line) => line.trim()) || body;
  const title = trimTitle(firstLine);

  return {
    command: {
      action,
      title,
      body: body.trim(),
      projectHint: projectResult.projectHint,
      tags: tagResult.tags,
    },
  };
}

export function isChatGoalSlashCommand(input: string): boolean {
  return GOAL_COMMAND_RE.test(input.trim());
}

export function isChatGoalApprovalCommand(input: string): boolean {
  return GOAL_APPROVAL_RE.test(input.trim());
}
