import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import type {
  PeekabooDesktopControlPermissionPane,
  PeekabooDesktopControlPermissionStatus,
} from '@/common/types/peekaboo';
import { mcpService } from '@/common/adapter/ipcBridge';
import { Alert, Button, Message, Tag } from '@arco-design/web-react';
import { CheckOne, LinkCloud } from '@icon-park/react';
import React from 'react';

const PEEKABOO_SERVER_NAME = 'peekaboo';
const PEEKABOO_DOCS_URL = 'https://peekaboo.sh/';
const PEEKABOO_INSTALL_URL = 'https://peekaboo.sh/install.html';
const PEEKABOO_PERMISSIONS_URL = 'https://peekaboo.sh/permissions.html';
const PEEKABOO_MCP_URL = 'https://peekaboo.sh/MCP.html';

interface PeekabooMcpSetupProps {
  mcpServers: IMcpServer[];
  onSaveServer: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
}

const PEEKABOO_TOOLS: IMcpTool[] = [
  { name: 'image', description: 'Capture screenshots and visual state from the Mac.' },
  { name: 'see', description: 'Read visible UI and accessibility context before taking action.' },
  { name: 'click', description: 'Click visible UI targets during a supervised Hermes run.' },
  { name: 'type', description: 'Type into the focused app only after operator approval.' },
  { name: 'hotkey', description: 'Press keyboard shortcuts such as Cmd+L or Cmd+K.' },
  { name: 'scroll', description: 'Scroll the current window or view.' },
  { name: 'set_value', description: 'Set values on supported accessibility controls.' },
  { name: 'perform_action', description: 'Invoke supported native accessibility actions.' },
];

const permissionValue = (
  gate: PeekabooDesktopControlPermissionStatus['accessibility' | 'screenRecording'] | undefined,
  fallback: string
): string => {
  if (!gate) return fallback;
  if (!gate.supported) return 'Not needed';
  if (gate.granted === true) return 'Granted';
  if (gate.granted === false) return 'Needs approval';
  return fallback;
};

const permissionTone = (
  gate: PeekabooDesktopControlPermissionStatus['accessibility' | 'screenRecording'] | undefined
): 'blue' | 'green' | 'orange' => {
  if (!gate?.supported) return 'blue';
  return gate.granted === true ? 'green' : 'orange';
};

const buildPeekabooOriginalJson = (proxyScriptPath: string): string =>
  JSON.stringify(
    {
      mcpServers: {
        [PEEKABOO_SERVER_NAME]: {
          command: 'node',
          args: [proxyScriptPath],
        },
      },
    },
    null,
    2
  );

const PeekabooMcpSetup: React.FC<PeekabooMcpSetupProps> = ({ mcpServers, onSaveServer }) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRequestingPermissions, setIsRequestingPermissions] = React.useState(false);
  const [openingPermissionPane, setOpeningPermissionPane] =
    React.useState<PeekabooDesktopControlPermissionPane | null>(null);
  const [permissionStatus, setPermissionStatus] = React.useState<PeekabooDesktopControlPermissionStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const existingServer = React.useMemo(
    () => mcpServers.find((server) => server.name.toLowerCase() === PEEKABOO_SERVER_NAME),
    [mcpServers]
  );
  const isConfigured = Boolean(existingServer);
  const isPackagedRunner =
    existingServer?.transport.type === 'stdio' &&
    existingServer.transport.command === 'node' &&
    (existingServer.transport.args || []).some((arg) => arg.includes('builtin-mcp-peekaboo.js'));

  const loadPermissionStatus = React.useCallback(async () => {
    try {
      const result = await mcpService.getPeekabooDesktopControlPermissions.invoke();
      if (result.success && result.data) {
        setPermissionStatus(result.data);
      }
    } catch (err) {
      console.warn('[Peekaboo] Failed to load desktop control permissions:', err);
    }
  }, []);

  React.useEffect(() => {
    void loadPermissionStatus();
  }, [loadPermissionStatus]);

  const requestAccessibilityPermission = React.useCallback(
    async (options: { forceOpenSettings?: boolean; quiet?: boolean } = {}) => {
      setIsRequestingPermissions(true);
      setError(null);

      try {
        const result = await mcpService.requestPeekabooDesktopControlPermissions.invoke();
        if (!result.success || !result.data) {
          throw new Error(result.msg || 'Could not request macOS Accessibility permission.');
        }

        let nextStatus = result.data.status;
        let didOpenSettings = false;
        if (nextStatus.isMac && (options.forceOpenSettings || nextStatus.accessibility.granted !== true)) {
          const settingsResult = await mcpService.openPeekabooPermissionSettings.invoke({ pane: 'accessibility' });
          didOpenSettings = settingsResult.success;
          if (settingsResult.success && settingsResult.data) {
            nextStatus = settingsResult.data;
          }
        }

        setPermissionStatus(nextStatus);
        if (!options.quiet) {
          if (didOpenSettings) {
            Message.info('Opening Accessibility settings so you can grant Agent Club control permission.');
          } else if (nextStatus.accessibility.granted) {
            Message.success(result.data.message);
          } else {
            Message.info('Accessibility permission still needs approval in System Settings.');
          }
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        if (!options.quiet) {
          Message.error(message);
        }
        return false;
      } finally {
        setIsRequestingPermissions(false);
      }
    },
    []
  );

  const openPermissionSettings = React.useCallback(
    async (pane: PeekabooDesktopControlPermissionPane) => {
      setOpeningPermissionPane(pane);
      setError(null);

      try {
        const result = await mcpService.openPeekabooPermissionSettings.invoke({ pane });
        if (!result.success) {
          throw new Error(result.msg || 'Could not open macOS permission settings.');
        }
        if (result.data) {
          setPermissionStatus(result.data);
        }
        Message.info(
          pane === 'accessibility'
            ? 'Opening Accessibility settings for Agent Club.'
            : 'Opening Screen Recording settings for Agent Club.'
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        Message.error(message);
      } finally {
        setOpeningPermissionPane(null);
        void loadPermissionStatus();
      }
    },
    [loadPermissionStatus]
  );

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      await requestAccessibilityPermission({ quiet: true });
      const setup = await mcpService.getPeekabooDesktopControlSetup.invoke();
      if (!setup.success || !setup.data?.proxyScriptPath) {
        throw new Error(setup.msg || 'Could not resolve the packaged Agent Club Peekaboo runner.');
      }

      await onSaveServer({
        name: PEEKABOO_SERVER_NAME,
        description: 'Built-in Peekaboo desktop control MCP packaged with Agent Club for supervised Hermes sessions.',
        enabled: true,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
          args: [setup.data.proxyScriptPath],
        },
        status: 'disconnected',
        tools: PEEKABOO_TOOLS,
        originalJson: buildPeekabooOriginalJson(setup.data.proxyScriptPath),
      });
      void loadPermissionStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className='mb-4 rounded-12px border border-solid border-[var(--border-2)] bg-[var(--fill-1)] p-4'>
      <div className='flex flex-col gap-12px'>
        <div className='flex flex-col gap-10px lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0 flex-1'>
            <div className='mb-1 flex flex-wrap items-center gap-2 text-sm font-medium text-t-primary'>
              <LinkCloud size={'16'} />
              <span>Peekaboo Desktop Control</span>
              {isConfigured && (
                <span className='inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-green-600 bg-green-50'>
                  <CheckOne size={'12'} />
                  {isPackagedRunner ? 'packaged' : 'configured'}
                </span>
              )}
              <Tag color={isConfigured ? 'green' : 'orange'}>
                {isConfigured
                  ? `${existingServer?.tools?.length || PEEKABOO_TOOLS.length} tools visible`
                  : 'setup required'}
              </Tag>
            </div>
            <div className='max-w-780px text-xs leading-18px text-t-secondary'>
              Add the Agent Club-packaged Peekaboo MCP so Hermes can observe and control the Mac during explicit
              supervised runs. Agent Club can ask macOS for Accessibility access from here; Screen Recording may still
              require approving Agent Club in System Settings after the first capture attempt.
            </div>
          </div>
          <Button type='outline' size='small' href={PEEKABOO_DOCS_URL} target='_blank'>
            Docs
          </Button>
        </div>

        <div className='grid grid-cols-1 gap-8px md:grid-cols-3'>
          <PeekabooGate label='Install path' value='Packaged with Agent Club' tone='blue' />
          <PeekabooGate
            label='Required permission'
            value={permissionValue(permissionStatus?.screenRecording, 'Open settings')}
            tone={permissionTone(permissionStatus?.screenRecording)}
          />
          <PeekabooGate
            label='Recommended gate'
            value={permissionValue(permissionStatus?.accessibility, 'Accessibility before clicks')}
            tone={permissionTone(permissionStatus?.accessibility)}
          />
        </div>

        <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'>
          <div className='mb-8px text-13px font-600 leading-20px text-t-primary'>Hermes supervised run contract</div>
          <div className='grid grid-cols-1 gap-6px text-12px leading-18px text-t-secondary md:grid-cols-2'>
            <div>1. Verify permissions with Peekaboo before Hermes can act.</div>
            <div>2. Show every run in the dashboard with stop and pause controls.</div>
            <div>3. Ask before opening Slack, Discord, iMessage, or any other app.</div>
            <div>4. Never send messages or make destructive changes without owner approval.</div>
          </div>
          <div className='mt-10px flex flex-wrap gap-8px'>
            <Button
              type='outline'
              size='small'
              loading={isRequestingPermissions}
              onClick={() => void requestAccessibilityPermission({ forceOpenSettings: true })}
            >
              Grant Accessibility
            </Button>
            <Button
              type='outline'
              size='small'
              loading={openingPermissionPane === 'accessibility'}
              onClick={() => void openPermissionSettings('accessibility')}
            >
              Open Accessibility Settings
            </Button>
            <Button
              type='outline'
              size='small'
              loading={openingPermissionPane === 'screen_recording'}
              onClick={() => void openPermissionSettings('screen_recording')}
            >
              Open Screen Recording
            </Button>
          </div>
          {permissionStatus?.accessibility.detail ? (
            <div className='mt-8px text-11px leading-16px text-t-secondary'>{permissionStatus.accessibility.detail}</div>
          ) : null}
        </div>

        <div className='flex flex-col gap-8px lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex flex-wrap gap-6px'>
            <DocLink href={PEEKABOO_INSTALL_URL}>Install guide</DocLink>
            <DocLink href={PEEKABOO_PERMISSIONS_URL}>Permission guide</DocLink>
            <DocLink href={PEEKABOO_MCP_URL}>MCP tools</DocLink>
          </div>
          <Button type='primary' icon={<LinkCloud size={'14'} />} loading={isSaving} onClick={handleSave}>
            {isConfigured ? 'Use Packaged Peekaboo MCP' : 'Enable Packaged Peekaboo MCP'}
          </Button>
        </div>
      </div>
      {error && <Alert className='mt-3' type='error' showIcon content={error} />}
    </div>
  );
};

const PeekabooGate: React.FC<{ label: string; value: string; tone: 'blue' | 'green' | 'orange' }> = ({
  label,
  value,
  tone,
}) => (
  <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-1 px-10px py-9px'>
    <div className='mb-4px text-10px font-700 uppercase leading-14px text-t-secondary'>{label}</div>
    <div className='flex items-center justify-between gap-8px'>
      <span className='min-w-0 truncate text-12px font-600 leading-18px text-t-primary'>{value}</span>
      <Tag color={tone} size='small'>
        gate
      </Tag>
    </div>
  </div>
);

const DocLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a
    href={href}
    target='_blank'
    rel='noreferrer'
    className='rounded-6px bg-fill-2 px-8px py-5px text-12px leading-18px text-t-secondary no-underline hover:text-t-primary'
  >
    {children}
  </a>
);

export default PeekabooMcpSetup;
