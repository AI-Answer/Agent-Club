import { ipcBridge } from '@/common';
import { securitySettingsService } from '@process/services/security/SecuritySettingsService';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function initSecurityBridge(): void {
  ipcBridge.security.getState.provider(async () => {
    try {
      return { success: true, data: await securitySettingsService.getState() };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.security.saveAgentVault.provider(async (request) => {
    try {
      return { success: true, data: await securitySettingsService.saveAgentVault(request) };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.security.saveOnePassword.provider(async (request) => {
    try {
      return { success: true, data: await securitySettingsService.saveOnePassword(request) };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.security.testOnePasswordCli.provider(async () => {
    try {
      return { success: true, data: await securitySettingsService.testOnePasswordCli() };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });
}
