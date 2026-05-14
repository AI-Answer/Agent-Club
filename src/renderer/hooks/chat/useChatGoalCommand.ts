import { ipcBridge } from '@/common';
import { AGENT_MANAGER_WORKSPACE_SLUG } from '@/common/config/appBrand';
import { parseChatGoalSlashCommand } from '@/common/chat/goalSlashCommand';
import type { AgentManagerChatGoalCommandRequest } from '@/common/types/agentManager';
import { Message } from '@arco-design/web-react';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface UseChatGoalCommandOptions {
  conversationId: string;
  conversationType: string;
  workspacePath?: string;
}

export function useChatGoalCommand(options: UseChatGoalCommandOptions) {
  const { conversationId, conversationType, workspacePath } = options;
  const navigate = useNavigate();

  return useCallback(
    async (input: string): Promise<boolean> => {
      const parseResult = parseChatGoalSlashCommand(input);
      if (!parseResult.command) {
        if (parseResult.error) {
          Message.warning(parseResult.error);
          return true;
        }
        return false;
      }

      const request: AgentManagerChatGoalCommandRequest = {
        action: parseResult.command.action,
        title: parseResult.command.title,
        body: parseResult.command.body,
        projectHint: parseResult.command.projectHint,
        tags: parseResult.command.tags,
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
      const next = `/${AGENT_MANAGER_WORKSPACE_SLUG}/goals/${encodeURIComponent(result.goal.id)}`;
      await navigate(`/agent-manager?next=${encodeURIComponent(next)}`);

      if (result.warning) {
        Message.warning(result.warning);
      } else if (result.action === 'prep') {
        Message.success(`Goal prepped in Local Agent Manager: ${result.goal.title}`);
      } else {
        Message.success(`Goal running in Local Agent Manager: ${result.goal.title}`);
      }
      return true;
    },
    [conversationId, conversationType, navigate, workspacePath]
  );
}
