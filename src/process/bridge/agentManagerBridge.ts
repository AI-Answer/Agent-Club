import { ipcBridge } from '@/common';
import { buildGoalResultMessage } from '@/common/chat/goalResultMessage';
import type { TMessage } from '@/common/chat/chatLib';
import type { AgentManagerChatGoalCommandRequest, AgentManagerGoalCommandResult } from '@/common/types/agentManager';
import { uuid } from '@/common/utils';
import { agentManagerService } from '@process/services/agentManager';
import { addMessage } from '@process/utils/message';

function persistChatGoalResult(
  request: AgentManagerChatGoalCommandRequest,
  result: AgentManagerGoalCommandResult
): void {
  if (!request.sourceConversationId) {
    return;
  }

  const message: TMessage = {
    id: uuid(),
    msg_id: `agent-manager-goal-${result.goal.id}-${Date.now()}`,
    conversation_id: request.sourceConversationId,
    type: 'text',
    position: 'left',
    status: 'finish',
    content: {
      content: buildGoalResultMessage(result),
    },
    createdAt: Date.now(),
  };

  addMessage(request.sourceConversationId, message);
}

export function initAgentManagerBridge(): void {
  ipcBridge.agentManager.getStatus.provider(async () => agentManagerService.getStatus());
  ipcBridge.agentManager.restart.provider(async () => agentManagerService.restart());
  ipcBridge.agentManager.handleChatGoalCommand.provider(async (request) => {
    try {
      const result = await agentManagerService.handleChatGoalCommand(request);
      persistChatGoalResult(request, result);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
