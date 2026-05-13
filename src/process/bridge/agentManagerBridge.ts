import { ipcBridge } from '@/common';
import { agentManagerService } from '@process/services/agentManager';

export function initAgentManagerBridge(): void {
  ipcBridge.agentManager.getStatus.provider(async () => agentManagerService.getStatus());
  ipcBridge.agentManager.restart.provider(async () => agentManagerService.restart());
}
