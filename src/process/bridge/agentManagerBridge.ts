import { ipcBridge } from '@/common';
import { agentManagerService } from '@process/services/agentManager';

export function initAgentManagerBridge(): void {
  ipcBridge.agentManager.getStatus.provider(async () => agentManagerService.getStatus());
  ipcBridge.agentManager.restart.provider(async () => agentManagerService.restart());
  ipcBridge.agentManager.handleChatGoalCommand.provider(async (request) => {
    try {
      const result = await agentManagerService.handleChatGoalCommand(request);
      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        msg: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
