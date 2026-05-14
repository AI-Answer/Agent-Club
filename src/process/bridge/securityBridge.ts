import { ipcBridge } from '@/common';
import { securitySettingsService } from '@process/services/security/SecuritySettingsService';
import { shell } from 'electron';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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

  ipcBridge.security.syncAgentVault.provider(async (request) => {
    try {
      return { success: true, data: await securitySettingsService.syncAgentVault(request) };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.security.openAgentVaultFile.provider(async () => {
    try {
      const state = await securitySettingsService.prepareAgentVaultFile();
      const filePath = state.agentVault.filePath;
      const shellError = await shell.openPath(filePath);

      if (shellError) {
        if (process.platform === 'darwin') {
          await execFileAsync('open', ['-t', filePath]);
        } else {
          throw new Error(shellError);
        }
      }

      return { success: true, data: state };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });

  ipcBridge.security.revealAgentVaultFile.provider(async () => {
    try {
      const state = await securitySettingsService.prepareAgentVaultFile();
      shell.showItemInFolder(state.agentVault.filePath);
      return { success: true, data: state };
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

  ipcBridge.security.installOnePasswordCli.provider(async () => {
    try {
      return { success: true, data: await securitySettingsService.installOnePasswordCli() };
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

  ipcBridge.security.testOnePasswordConnection.provider(async () => {
    try {
      return { success: true, data: await securitySettingsService.testOnePasswordConnection() };
    } catch (error) {
      return { success: false, msg: errorMessage(error) };
    }
  });
}
