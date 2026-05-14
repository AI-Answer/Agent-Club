import { ipcBridge } from '@/common';
import type {
  DashboardActionRequest,
  DashboardContextRequest,
  DashboardCustomWidgetRequest,
  DashboardHardRefreshRequest,
  DashboardLayoutUpdateRequest,
  DashboardSnapshotRequest,
} from '@/common/types/dashboard';
import { DashboardService } from '@process/services/dashboard';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export function initDashboardBridge(workerTaskManager: IWorkerTaskManager): void {
  const dashboardService = new DashboardService(workerTaskManager);
  dashboardService.startMorningRefresh((snapshot) => {
    ipcBridge.dashboard.snapshotUpdated.emit(snapshot);
  });

  ipcBridge.dashboard.getSnapshot.provider(async (request?: DashboardSnapshotRequest) => {
    return dashboardService.getSnapshot(request || {});
  });

  ipcBridge.dashboard.runHeartbeat.provider(async () => {
    const snapshot = await dashboardService.runHeartbeat();
    ipcBridge.dashboard.snapshotUpdated.emit(snapshot);
    return snapshot;
  });

  ipcBridge.dashboard.hardRefresh.provider(async (request?: DashboardHardRefreshRequest) => {
    const snapshot = await dashboardService.hardRefresh(request || {});
    ipcBridge.dashboard.snapshotUpdated.emit(snapshot);
    return snapshot;
  });

  ipcBridge.dashboard.rebuildWithContext.provider(async (request: DashboardContextRequest) => {
    const snapshot = await dashboardService.rebuildWithContext(request);
    ipcBridge.dashboard.snapshotUpdated.emit(snapshot);
    return snapshot;
  });

  ipcBridge.dashboard.updateLayout.provider(async (request: DashboardLayoutUpdateRequest) => {
    const snapshot = await dashboardService.updateLayout(request);
    ipcBridge.dashboard.snapshotUpdated.emit(snapshot);
    return snapshot;
  });

  ipcBridge.dashboard.createCustomWidget.provider(async (request: DashboardCustomWidgetRequest) => {
    const snapshot = await dashboardService.createCustomWidget(request);
    ipcBridge.dashboard.snapshotUpdated.emit(snapshot);
    return snapshot;
  });

  ipcBridge.dashboard.getSchedule.provider(async () => {
    return dashboardService.getMorningRefreshStatus();
  });

  ipcBridge.dashboard.applyAction.provider(async (request: DashboardActionRequest) => {
    const result = await dashboardService.applyAction(request);
    if (result.snapshot) {
      ipcBridge.dashboard.snapshotUpdated.emit(result.snapshot);
    }
    return result;
  });
}
