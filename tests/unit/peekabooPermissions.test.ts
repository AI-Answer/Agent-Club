import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  isTrustedAccessibilityClient: vi.fn(),
  openExternal: vi.fn(),
}));

vi.mock('electron', () => ({
  shell: {
    openExternal: electronMocks.openExternal,
  },
  systemPreferences: {
    isTrustedAccessibilityClient: electronMocks.isTrustedAccessibilityClient,
  },
}));

vi.mock('../../src/process/services/mcpServices/McpService', () => ({
  mcpService: {},
}));

vi.mock('../../src/process/services/mcpServices/McpOAuthService', () => ({
  mcpOAuthService: {},
}));

vi.mock('../../src/common/platform', () => ({
  getPlatformServices: () => ({
    paths: {
      isPackaged: () => false,
    },
    network: {
      fetch: vi.fn(),
    },
  }),
}));

describe('Peekaboo desktop control permissions', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  it('requests the native macOS Accessibility prompt through Electron', async () => {
    electronMocks.isTrustedAccessibilityClient.mockReturnValue(false);

    const { requestPeekabooDesktopControlPermissions } = await import('../../src/process/bridge/mcpBridge');
    const result = requestPeekabooDesktopControlPermissions();

    expect(electronMocks.isTrustedAccessibilityClient).toHaveBeenCalledWith(true);
    expect(result.requestedAccessibilityPrompt).toBe(true);
    expect(result.status.accessibility.granted).toBe(false);
    expect(result.message).toContain('macOS Accessibility prompt requested');
  });

  it('uses exact macOS privacy pane URLs for fallback settings', async () => {
    const { getPeekabooPermissionSettingsUrl } = await import('../../src/process/bridge/mcpBridge');

    expect(getPeekabooPermissionSettingsUrl('accessibility')).toBe(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility'
    );
    expect(getPeekabooPermissionSettingsUrl('screen_recording')).toBe(
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture'
    );
  });
});
