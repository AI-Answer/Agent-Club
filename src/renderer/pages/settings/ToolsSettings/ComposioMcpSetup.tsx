import type { IMcpServer, IMcpTool } from '@/common/config/storage';
import { mcpService } from '@/common/adapter/ipcBridge';
import { Alert, Button, Input } from '@arco-design/web-react';
import { CheckOne, LinkCloud } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const COMPOSIO_SERVER_NAME = 'composio';
const COMPOSIO_DEFAULT_USER_ID = 'agent-club';

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

  const existingServer = React.useMemo(
    () => mcpServers.find((server) => server.name.toLowerCase() === COMPOSIO_SERVER_NAME),
    [mcpServers]
  );
  const isConfigured = Boolean(existingServer);

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
    <div className='mb-4 rounded-lg border border-solid border-[var(--border-2)] bg-[var(--fill-1)] p-4'>
      <div className='flex flex-col gap-3 lg:flex-row lg:items-end'>
        <div className='min-w-0 flex-1'>
          <div className='mb-1 flex items-center gap-2 text-sm font-medium text-t-primary'>
            <LinkCloud size={'16'} />
            <span>{t('settings.composioMcp.title')}</span>
            {isConfigured && (
              <span className='inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-green-600 bg-green-50'>
                <CheckOne size={'12'} />
                {t('settings.composioMcp.configured')}
              </span>
            )}
          </div>
          <div className='text-xs text-t-secondary'>{t('settings.composioMcp.description')}</div>
        </div>
        <div className='grid min-w-[280px] grid-cols-1 gap-2 sm:grid-cols-[1fr_130px_auto] lg:min-w-[560px]'>
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
    </div>
  );
};

export default ComposioMcpSetup;
