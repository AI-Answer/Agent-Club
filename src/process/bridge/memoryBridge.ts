import { ipcBridge } from '@/common';
import type { HonchoMemoryConfig } from '@/common/types/memory';
import { honchoMemoryService } from '@process/services/memory/HonchoMemoryService';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function initMemoryBridge(): void {
  ipcBridge.memory.testHoncho.provider(async (config: HonchoMemoryConfig) => {
    try {
      return {
        success: true,
        data: await honchoMemoryService.testConfig(config),
      };
    } catch (error) {
      return {
        success: false,
        msg: errorMessage(error),
      };
    }
  });

  ipcBridge.memory.getHonchoSnapshot.provider(async () => {
    try {
      return {
        success: true,
        data: await honchoMemoryService.getSnapshot(),
      };
    } catch (error) {
      return {
        success: false,
        msg: errorMessage(error),
      };
    }
  });
}
