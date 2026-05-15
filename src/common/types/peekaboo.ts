export interface PeekabooDesktopControlSetupResult {
  proxyScriptPath: string;
  packageName: string;
  packageVersion: string;
}

export type PeekabooDesktopControlPermissionPane = 'accessibility' | 'screen_recording';

export interface PeekabooDesktopControlPermissionGate {
  supported: boolean;
  granted: boolean | null;
  label: string;
  detail: string;
  settingsUrl?: string;
}

export interface PeekabooDesktopControlPermissionStatus {
  platform: string;
  isMac: boolean;
  accessibility: PeekabooDesktopControlPermissionGate & {
    promptable: boolean;
  };
  screenRecording: PeekabooDesktopControlPermissionGate;
}

export interface PeekabooDesktopControlPermissionRequestResult {
  status: PeekabooDesktopControlPermissionStatus;
  requestedAccessibilityPrompt: boolean;
  message: string;
}
