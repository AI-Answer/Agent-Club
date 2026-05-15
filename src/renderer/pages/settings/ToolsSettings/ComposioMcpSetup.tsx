import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import { mcpService } from '@/common/adapter/ipcBridge';
import { Alert, Button, Input, Modal, Tag } from '@arco-design/web-react';
import { CheckOne, LinkCloud } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const COMPOSIO_SERVER_NAME = 'composio';
const COMPOSIO_DEFAULT_USER_ID = 'agent-club';

type ComposioCatalogApp = {
  id: string;
  name: string;
  auth: 'OAuth' | 'API Key' | 'No Auth';
  description: string;
  tools: number;
  triggers: number;
  tags: string[];
};

const CATALOG_APPS: ComposioCatalogApp[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    auth: 'OAuth',
    description: 'Priority email, reply drafting, and inbox follow-up context for Hermes.',
    tools: 61,
    triggers: 2,
    tags: ['email'],
  },
  {
    id: 'slack',
    name: 'Slack',
    auth: 'OAuth',
    description: 'Channel context and team-message routing when Hermes needs team awareness.',
    tools: 145,
    triggers: 8,
    tags: ['team chat'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    auth: 'OAuth',
    description: 'Meeting prep, follow-up sweeps, and schedule-aware chief-of-staff actions.',
    tools: 42,
    triggers: 8,
    tags: ['calendar'],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    auth: 'OAuth',
    description: 'Docs, Sheets, and Drive files as source-backed dashboard context.',
    tools: 74,
    triggers: 8,
    tags: ['files'],
  },
  {
    id: 'github',
    name: 'GitHub',
    auth: 'OAuth',
    description: 'Repositories, issues, and PRs for coding work that should be visible.',
    tools: 846,
    triggers: 46,
    tags: ['developer tools'],
  },
  {
    id: 'notion',
    name: 'Notion',
    auth: 'OAuth',
    description: 'Notes, docs, and lightweight task context for planning surfaces.',
    tools: 45,
    triggers: 13,
    tags: ['notes'],
  },
  {
    id: 'composio',
    name: 'Composio',
    auth: 'No Auth',
    description: 'The Tool Router MCP session that exposes selected app actions to local agents.',
    tools: 24,
    triggers: 0,
    tags: ['ai agents'],
  },
];

interface ComposioMcpSetupProps {
  mcpServers: IMcpServer[];
  onSaveServer: (server: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void> | void;
}

const buildComposioOriginalJson = (proxyScriptPath: string, mcpUrl: string, userId: string): string =>
  JSON.stringify(
    {
      mcpServers: {
        [COMPOSIO_SERVER_NAME]: {
          command: 'node',
          args: [proxyScriptPath],
          env: {
            COMPOSIO_MCP_URL: mcpUrl,
            COMPOSIO_API_KEY: '<saved in Agent Club config>',
            COMPOSIO_USER_ID: userId,
          },
        },
      },
    },
    null,
    2
  );

const ComposioMcpSetup: React.FC<ComposioMcpSetupProps> = ({ mcpServers, onSaveServer }) => {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = React.useState('');
  const [userId, setUserId] = React.useState(COMPOSIO_DEFAULT_USER_ID);
  const [isConnecting, setIsConnecting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [marketplaceOpen, setMarketplaceOpen] = React.useState(false);

  const existingServer = React.useMemo(
    () => mcpServers.find((server) => server.name.toLowerCase() === COMPOSIO_SERVER_NAME),
    [mcpServers]
  );
  const isConfigured = Boolean(existingServer);
  const visibleToolCount = existingServer?.tools?.length || 0;

  const handleConnect = async () => {
    const trimmedApiKey = apiKey.trim();
    const trimmedUserId = userId.trim() || COMPOSIO_DEFAULT_USER_ID;

    if (!trimmedApiKey) {
      setError(t('settings.composioMcp.apiKeyRequired'));
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const response = await mcpService.createComposioToolRouterSession.invoke({
        apiKey: trimmedApiKey,
        userId: trimmedUserId,
      });

      if (!response.success || !response.data) {
        setError(response.msg || t('settings.composioMcp.connectionFailed'));
        return;
      }

      const tools: IMcpTool[] = response.data.toolRouterTools.map((name) => ({ name }));

      await onSaveServer({
        name: COMPOSIO_SERVER_NAME,
        description: t('settings.composioMcp.serverDescription'),
        enabled: true,
        builtin: true,
        transport: {
          type: 'stdio',
          command: 'node',
          args: [response.data.proxyScriptPath],
          env: {
            COMPOSIO_MCP_URL: response.data.mcpUrl,
            COMPOSIO_API_KEY: trimmedApiKey,
            COMPOSIO_USER_ID: trimmedUserId,
            COMPOSIO_MCP_SESSION_ID: response.data.sessionId,
          },
        },
        status: 'disconnected',
        tools,
        originalJson: buildComposioOriginalJson(response.data.proxyScriptPath, response.data.mcpUrl, trimmedUserId),
      });

      setApiKey('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className='mb-4 rounded-12px border border-solid border-[var(--border-2)] bg-[var(--fill-1)] p-4'>
      <div className='flex flex-col gap-12px'>
        <div className='flex flex-col gap-10px lg:flex-row lg:items-start lg:justify-between'>
          <div className='min-w-0 flex-1'>
            <div className='mb-1 flex flex-wrap items-center gap-2 text-sm font-medium text-t-primary'>
              <LinkCloud size={'16'} />
              <span>{t('settings.composioMcp.title')}</span>
              {isConfigured && (
                <span className='inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-green-600 bg-green-50'>
                  <CheckOne size={'12'} />
                  {t('settings.composioMcp.configured')}
                </span>
              )}
              <Tag color={isConfigured ? 'green' : 'orange'}>
                {isConfigured ? `${visibleToolCount} tools visible` : 'setup required'}
              </Tag>
            </div>
            <div className='max-w-780px text-xs leading-18px text-t-secondary'>
              {t('settings.composioMcp.description')}
            </div>
          </div>
          <Button type='outline' size='small' onClick={() => setMarketplaceOpen(true)}>
            Browse apps
          </Button>
        </div>

        <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'>
          <div className='mb-8px flex flex-wrap items-center justify-between gap-8px'>
            <div>
              <div className='text-13px font-600 leading-20px text-t-primary'>App marketplace</div>
              <div className='text-12px leading-18px text-t-secondary'>
                Curated Composio apps for Hermes. Install only the actions this chief-of-staff actually needs.
              </div>
            </div>
            <Tag>{CATALOG_APPS.length} apps</Tag>
          </div>
          <div className='flex gap-8px overflow-x-auto pb-1'>
            {CATALOG_APPS.map((app) => (
              <ComposioAppCard key={app.id} app={app} isConfigured={isConfigured} />
            ))}
          </div>
        </div>

        <div className='grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_130px_auto]'>
          <Input.Password
            value={apiKey}
            placeholder={
              isConfigured
                ? t('settings.composioMcp.apiKeyRotatePlaceholder')
                : t('settings.composioMcp.apiKeyPlaceholder')
            }
            onChange={setApiKey}
            autoComplete='off'
          />
          <Input
            value={userId}
            placeholder={t('settings.composioMcp.userIdPlaceholder')}
            onChange={setUserId}
            autoComplete='off'
          />
          <Button type='primary' icon={<LinkCloud size={'14'} />} loading={isConnecting} onClick={handleConnect}>
            {isConfigured ? t('settings.composioMcp.updateButton') : t('settings.composioMcp.connectButton')}
          </Button>
        </div>
      </div>
      {error && <Alert className='mt-3' type='error' showIcon content={error} />}

      <Modal
        title='Attach apps through Composio MCP'
        visible={marketplaceOpen}
        footer={null}
        onCancel={() => setMarketplaceOpen(false)}
        style={{ width: 820 }}
      >
        <Alert
          className='mb-12px'
          type='warning'
          showIcon
          content='Only connect the specific app actions Hermes needs. Extra actions increase noise, permission scope, and review burden.'
        />
        <div className='max-h-[520px] overflow-y-auto pr-2px'>
          <div className='grid grid-cols-1 gap-10px md:grid-cols-2'>
            {CATALOG_APPS.map((app) => (
              <ComposioAppCard key={app.id} app={app} isConfigured={isConfigured} expanded />
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};

const ComposioAppCard: React.FC<{
  app: ComposioCatalogApp;
  isConfigured: boolean;
  expanded?: boolean;
}> = ({ app, isConfigured, expanded = false }) => (
  <div
    className={
      expanded
        ? 'rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 p-12px'
        : 'w-220px shrink-0 rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'
    }
  >
    <div className='flex items-start justify-between gap-8px'>
      <div className='min-w-0'>
        <div className='truncate text-13px font-700 leading-20px text-t-primary'>{app.name}</div>
        <Tag color='blue' size='small'>
          {app.auth}
        </Tag>
      </div>
      <Tag color={isConfigured ? 'green' : 'orange'}>{isConfigured ? 'ready' : 'setup'}</Tag>
    </div>
    <p className='m-0 mt-8px text-12px leading-18px text-t-secondary'>{app.description}</p>
    <div className='mt-10px grid grid-cols-2 gap-6px'>
      <div className='rounded-7px bg-fill-2 px-8px py-6px'>
        <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>Tools</div>
        <div className='text-15px font-700 leading-20px text-t-primary'>{app.tools}</div>
      </div>
      <div className='rounded-7px bg-fill-2 px-8px py-6px'>
        <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>Triggers</div>
        <div className='text-15px font-700 leading-20px text-t-primary'>{app.triggers}</div>
      </div>
    </div>
    <div className='mt-8px flex flex-wrap gap-5px'>
      {app.tags.map((tag) => (
        <span key={tag} className='rounded-6px bg-fill-2 px-6px py-2px text-11px leading-16px text-t-secondary'>
          {tag}
        </span>
      ))}
    </div>
  </div>
);

export default ComposioMcpSetup;
