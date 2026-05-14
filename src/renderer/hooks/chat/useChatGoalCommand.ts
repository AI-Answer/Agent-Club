import { ipcBridge } from '@/common';
import { buildGoalResultMessage } from '@/common/chat/goalResultMessage';
import { isChatGoalApprovalCommand, parseChatGoalSlashCommand } from '@/common/chat/goalSlashCommand';
import type { AgentManagerChatGoalCommandRequest, AgentManagerGoalCommandResult } from '@/common/types/agentManager';
import { uuid } from '@/common/utils';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { Message } from '@arco-design/web-react';
import { useCallback } from 'react';

interface UseChatGoalCommandOptions {
  conversationId: string;
  conversationType: string;
  workspacePath?: string;
}

interface PreparedGoalRef {
  goalId: string;
  title: string;
  body: string;
  projectTitle?: string;
  projectId?: string;
  goalUrl: string;
  boardUrl: string;
  projectUrl?: string;
  markdownPath?: string;
  updatedAt: number;
}

function preparedGoalKey(conversationId: string): string {
  return `agent-club.prepared-goal.${conversationId}`;
}

export function loadPreparedGoal(conversationId: string): PreparedGoalRef | null {
  try {
    const raw = window.localStorage.getItem(preparedGoalKey(conversationId));
    return raw ? (JSON.parse(raw) as PreparedGoalRef) : null;
  } catch {
    return null;
  }
}

export function savePreparedGoal(conversationId: string, result: AgentManagerGoalCommandResult): void {
  try {
    window.localStorage.setItem(
      preparedGoalKey(conversationId),
      JSON.stringify({
        goalId: result.goal.id,
        title: result.goal.title,
        body: result.goal.description || result.goal.title,
        projectTitle: result.projectTitle,
        projectId: result.projectId,
        goalUrl: result.goalUrl,
        boardUrl: result.boardUrl,
        projectUrl: result.projectUrl,
        markdownPath: result.markdownPath,
        updatedAt: Date.now(),
      } satisfies PreparedGoalRef)
    );
  } catch {
    // Best-effort convenience cache; native Local Agent Manager remains source of truth.
  }
}

export function useChatGoalCommand(options: UseChatGoalCommandOptions) {
  const { conversationId, conversationType, workspacePath } = options;
  const addOrUpdateMessage = useAddOrUpdateMessage();

  return useCallback(
    async (input: string): Promise<boolean> => {
      const parseResult = parseChatGoalSlashCommand(input);
      let command = parseResult.command;
      let preparedGoal = loadPreparedGoal(conversationId);

      if (!command && !parseResult.error && isChatGoalApprovalCommand(input)) {
        if (!preparedGoal) {
          return false;
        }
        command = {
          action: 'run_prepared',
          title: preparedGoal.title,
          body: preparedGoal.body,
          tags: [],
        };
      }

      if (!command) {
        if (parseResult.error) {
          Message.warning(parseResult.error);
          return true;
        }
        return false;
      }

      if (command.action === 'run_prepared' && !preparedGoal) {
        Message.warning('Prep a goal first, or add goal details after /goal.');
        return true;
      }

      const request: AgentManagerChatGoalCommandRequest = {
        action: command.action,
        title: command.action === 'run_prepared' && preparedGoal ? preparedGoal.title : command.title,
        body: command.action === 'run_prepared' && preparedGoal ? preparedGoal.body : command.body,
        goalId: command.action === 'run_prepared' ? preparedGoal?.goalId : undefined,
        projectHint: command.projectHint,
        tags: command.tags,
        sourceConversationId: conversationId,
        sourceConversationType: conversationType,
        sourceWorkspacePath: workspacePath,
        rawInput: input,
      };

      let response;
      try {
        response = await ipcBridge.agentManager.handleChatGoalCommand.invoke(request);
      } catch (error) {
        Message.error(error instanceof Error ? error.message : 'Failed to create goal in Local Agent Manager');
        return true;
      }

      if (!response.success || !response.data) {
        Message.error(response.msg || 'Failed to create goal in Local Agent Manager');
        return true;
      }

      const result = response.data;
      if (result.action === 'prep') {
        savePreparedGoal(conversationId, result);
      }

      addOrUpdateMessage(
        {
          id: uuid(),
          msg_id: `agent-manager-goal-${result.goal.id}-${Date.now()}`,
          conversation_id: conversationId,
          type: 'text',
          position: 'left',
          status: 'finish',
          content: {
            content: buildGoalResultMessage(result),
          },
        },
        true
      );

      if (result.warning) {
        Message.warning(result.warning);
      } else if (result.action === 'prep') {
        Message.success(`Goal prepped in Local Agent Manager: ${result.goal.title}`);
      } else if (result.action === 'run_prepared') {
        Message.success(`Prepared goal is actioning in Local Agent Manager: ${result.goal.title}`);
      } else {
        Message.success(`Goal running in Local Agent Manager: ${result.goal.title}`);
      }
      return true;
    },
    [addOrUpdateMessage, conversationId, conversationType, workspacePath]
  );
}
