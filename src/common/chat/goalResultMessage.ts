import type { AgentManagerGoalCommandResult } from '@/common/types/agentManager';

export function buildGoalResultMessage(result: AgentManagerGoalCommandResult): string {
  const isPrep = result.action === 'prep';
  const lines = [
    `**${isPrep ? 'Goal prepped' : 'Goal actioning'}:** ${result.goal.title}`,
    '',
    result.projectTitle && result.projectUrl ? `- Project: [${result.projectTitle}](${result.projectUrl})` : null,
    `- Goal: [Open goal](${result.goalUrl})`,
    `- Project board: [Open board](${result.boardUrl})`,
    result.markdownPath ? `- Markdown: \`${result.markdownPath}\`` : null,
  ];

  if (isPrep) {
    lines.push('', 'Send `/goal`, `go ahead`, or `start actioning the goal` in this chat when you want agents to run it.');
  } else if (result.expanded) {
    lines.push('', result.taskId ? `Native expansion started: \`${result.taskId}\`.` : 'Native expansion started.');
  } else if (result.warning) {
    lines.push('', `Warning: ${result.warning}`);
  }

  return lines.filter((line): line is string => line !== null).join('\n');
}
