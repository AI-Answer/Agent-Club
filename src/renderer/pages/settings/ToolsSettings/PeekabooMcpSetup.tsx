import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import { mcpService } from '@/common/adapter/ipcBridge';
import { Alert, Button, Tag } from '@arco-design/web-react';
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

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
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
              supervised runs. Agent Club will not grant Screen Recording, Accessibility, or app-control permission for
              you.
            </div>
          </div>
          <Button type='outline' size='small' href={PEEKABOO_DOCS_URL} target='_blank'>
            Docs
          </Button>
        </div>

        <div className='grid grid-cols-1 gap-8px md:grid-cols-3'>
          <PeekabooGate label='Install path' value='Packaged with Agent Club' tone='blue' />
          <PeekabooGate label='Required permission' value='Screen Recording' tone='orange' />
          <PeekabooGate label='Recommended gate' value='Accessibility before clicks' tone='orange' />
        </div>

        <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'>
          <div className='mb-8px text-13px font-600 leading-20px text-t-primary'>Hermes supervised run contract</div>
          <div className='grid grid-cols-1 gap-6px text-12px leading-18px text-t-secondary md:grid-cols-2'>
            <div>1. Verify permissions with Peekaboo before Hermes can act.</div>
            <div>2. Show every run in the dashboard with stop and pause controls.</div>
            <div>3. Ask before opening Slack, Discord, iMessage, or any other app.</div>
            <div>4. Never send messages or make destructive changes without owner approval.</div>
          </div>
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

const PeekabooGate: React.FC<{ label: string; value: string; tone: 'blue' | 'orange' }> = ({ label, value, tone }) => (
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
