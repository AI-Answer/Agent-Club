import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PeekabooDesktopControlPermissionStatus } from '../../src/common/types/peekaboo';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  openSettings: vi.fn(),
  getSetup: vi.fn(),
  messageSuccess: vi.fn(),
  messageInfo: vi.fn(),
  messageError: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Alert: ({ content }: { content: React.ReactNode }) => <div role='alert'>{content}</div>,
  Button: ({ children, loading, onClick }: any) => (
    <button disabled={loading} onClick={onClick}>
      {children}
    </button>
  ),
  Message: {
    success: mocks.messageSuccess,
    info: mocks.messageInfo,
    error: mocks.messageError,
  },
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@icon-park/react', () => ({
  CheckOne: () => <span data-testid='check-icon' />,
  LinkCloud: () => <span data-testid='link-icon' />,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    getPeekabooDesktopControlPermissions: { invoke: mocks.getPermissions },
    requestPeekabooDesktopControlPermissions: { invoke: mocks.requestPermissions },
    openPeekabooPermissionSettings: { invoke: mocks.openSettings },
    getPeekabooDesktopControlSetup: { invoke: mocks.getSetup },
  },
}));

import PeekabooMcpSetup from '../../src/renderer/pages/settings/ToolsSettings/PeekabooMcpSetup';

const makeStatus = (accessibilityGranted = false): PeekabooDesktopControlPermissionStatus => ({
  platform: 'darwin',
  isMac: true,
  accessibility: {
    supported: true,
    granted: accessibilityGranted,
    promptable: true,
    label: 'Accessibility',
    detail: accessibilityGranted ? 'Agent Club is trusted.' : 'Click Grant Accessibility.',
    settingsUrl: 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Accessibility',
  },
  screenRecording: {
    supported: true,
    granted: null,
    label: 'Screen Recording',
    detail: 'Open System Settings if needed.',
    settingsUrl: 'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ScreenCapture',
  },
});

describe('PeekabooMcpSetup permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPermissions.mockResolvedValue({ success: true, data: makeStatus(false) });
    mocks.requestPermissions.mockResolvedValue({
      success: true,
      data: {
        status: makeStatus(false),
        requestedAccessibilityPrompt: true,
        message: 'macOS Accessibility prompt requested.',
      },
    });
    mocks.openSettings.mockResolvedValue({ success: true, data: makeStatus(false) });
    mocks.getSetup.mockResolvedValue({
      success: true,
      data: {
        proxyScriptPath: '/Applications/Agent Club.app/Contents/Resources/builtin-mcp-peekaboo.js',
        packageName: '@steipete/peekaboo',
        packageVersion: '3.1.2',
      },
    });
  });

  it('requests the native Accessibility permission path from the Grant Accessibility button', async () => {
    render(<PeekabooMcpSetup mcpServers={[]} onSaveServer={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /grant accessibility/i }));

    await waitFor(() => expect(mocks.requestPermissions).toHaveBeenCalledOnce());
    expect(mocks.openSettings).toHaveBeenCalledWith({ pane: 'accessibility' });
    expect(mocks.messageInfo).toHaveBeenCalledWith(
      'Opening Accessibility settings so you can grant Agent Club control permission.'
    );
  });

  it('opens Accessibility settings from Grant Accessibility even when the native status already looks granted', async () => {
    mocks.getPermissions.mockResolvedValue({ success: true, data: makeStatus(true) });
    mocks.requestPermissions.mockResolvedValue({
      success: true,
      data: {
        status: makeStatus(true),
        requestedAccessibilityPrompt: true,
        message: 'macOS Accessibility already granted.',
      },
    });
    mocks.openSettings.mockResolvedValue({ success: true, data: makeStatus(true) });

    render(<PeekabooMcpSetup mcpServers={[]} onSaveServer={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /grant accessibility/i }));

    await waitFor(() => expect(mocks.requestPermissions).toHaveBeenCalledOnce());
    expect(mocks.openSettings).toHaveBeenCalledWith({ pane: 'accessibility' });
    expect(mocks.messageInfo).toHaveBeenCalledWith(
      'Opening Accessibility settings so you can grant Agent Club control permission.'
    );
  });

  it('requests Accessibility before saving the packaged Peekaboo MCP', async () => {
    const onSaveServer = vi.fn();
    render(<PeekabooMcpSetup mcpServers={[]} onSaveServer={onSaveServer} />);

    fireEvent.click(await screen.findByRole('button', { name: /enable packaged peekaboo mcp/i }));

    await waitFor(() => expect(onSaveServer).toHaveBeenCalledOnce());
    expect(mocks.requestPermissions).toHaveBeenCalledOnce();
    expect(mocks.openSettings).toHaveBeenCalledWith({ pane: 'accessibility' });
    expect(mocks.getSetup).toHaveBeenCalledOnce();
    expect(mocks.requestPermissions.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getSetup.mock.invocationCallOrder[0]
    );
  });

  it('opens the exact macOS fallback panes from the settings buttons', async () => {
    render(<PeekabooMcpSetup mcpServers={[]} onSaveServer={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /open accessibility settings/i }));
    fireEvent.click(await screen.findByRole('button', { name: /open screen recording/i }));

    await waitFor(() => expect(mocks.openSettings).toHaveBeenCalledTimes(2));
    expect(mocks.openSettings).toHaveBeenNthCalledWith(1, { pane: 'accessibility' });
    expect(mocks.openSettings).toHaveBeenNthCalledWith(2, { pane: 'screen_recording' });
  });
});
