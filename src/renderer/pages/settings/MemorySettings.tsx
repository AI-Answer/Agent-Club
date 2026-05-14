import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import {
  DEFAULT_HONCHO_MEMORY_CONFIG,
  type HonchoMemoryConfig,
  type HonchoMemorySnapshot,
} from '@/common/types/memory';
import { Alert, Button, Form, Input, Message, Switch, Tag, Typography } from '@arco-design/web-react';
import { Brain, CheckOne, CloudStorage, Refresh, Save } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const MemorySettings: React.FC = () => {
  const { t } = useTranslation();
  const [config, setConfig] = useState<HonchoMemoryConfig>(DEFAULT_HONCHO_MEMORY_CONFIG);
  const [snapshot, setSnapshot] = useState<HonchoMemorySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void ConfigStorage.get('memory.honcho')
      .then((stored) => {
        setConfig({
          ...DEFAULT_HONCHO_MEMORY_CONFIG,
          ...stored,
        });
      })
      .catch(() => {});
  }, []);

  const isHonchoSelected = config.provider === 'honcho';
  const hasApiKey = useMemo(() => isHonchoSelected && config.apiKey.trim().length > 0, [config.apiKey, isHonchoSelected]);
  const selectedSnapshot = snapshot?.provider === config.provider ? snapshot : null;

  const updateConfig = useCallback(<Key extends keyof HonchoMemoryConfig>(key: Key, value: HonchoMemoryConfig[Key]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveConfig = useCallback(
    async (nextConfig: HonchoMemoryConfig = config) => {
      await ConfigStorage.set('memory.honcho', nextConfig);
      setConfig(nextConfig);
    },
    [config]
  );

  const refreshMemories = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await ipcBridge.memory.getHonchoSnapshot.invoke();
      if (!result.success || !result.data) {
        Message.error(result.msg || t('settings.memoryPage.loadFailed'));
        return;
      }
      setSnapshot(result.data);
    } finally {
      setRefreshing(false);
    }
  }, [t]);

  const handleSave = useCallback(async () => {
    await saveConfig();
    Message.success(t('settings.memoryPage.saved'));
  }, [saveConfig, t]);

  const handleSetup = useCallback(async () => {
    const nextConfig = {
      ...config,
      enabled: true,
      workspaceId: config.workspaceId.trim() || DEFAULT_HONCHO_MEMORY_CONFIG.workspaceId,
      userPeerId: config.userPeerId.trim() || DEFAULT_HONCHO_MEMORY_CONFIG.userPeerId,
      baseURL: config.baseURL.trim() || DEFAULT_HONCHO_MEMORY_CONFIG.baseURL,
    };

    setLoading(true);
    try {
      await saveConfig(nextConfig);
      const result = await ipcBridge.memory.testHoncho.invoke(nextConfig);
      if (!result.success || !result.data) {
        Message.error(result.msg || t('settings.memoryPage.connectionFailed'));
        return;
      }

      const verifiedConfig = { ...nextConfig, lastVerifiedAt: Date.now() };
      await saveConfig(verifiedConfig);
      Message.success(t('settings.memoryPage.connectionSuccess'));
      await refreshMemories();
    } finally {
      setLoading(false);
    }
  }, [config, refreshMemories, saveConfig, t]);

  const openApiKeys = useCallback(() => {
    void ipcBridge.shell.openExternal.invoke('https://app.honcho.dev/api-keys');
  }, []);

  return (
    <SettingsPageWrapper contentClassName='max-w-1100px'>
      <div className='space-y-16px'>
        <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <div className='flex flex-col gap-10px'>
            <div className='flex items-center gap-8px flex-wrap'>
              <Typography.Title heading={4} className='!m-0 text-t-primary'>
                {t('settings.memoryPage.title')}
              </Typography.Title>
              <Tag color={config.enabled && hasApiKey ? 'green' : 'gray'}>
                {config.enabled && hasApiKey
                  ? t('settings.memoryPage.statusReady')
                  : t('settings.memoryPage.statusNotReady')}
              </Tag>
            </div>
            <Typography.Text className='text-14px text-t-secondary'>
              {t('settings.memoryPage.description')}
            </Typography.Text>
          </div>
        </section>

        <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <Typography.Title heading={5} className='!m-0 text-t-primary'>
            {t('settings.memoryPage.providerTitle')}
          </Typography.Title>
          <Typography.Text className='mt-4px block text-13px text-t-secondary'>
            {t('settings.memoryPage.providerSubtitle')}
          </Typography.Text>
          <div className='mt-16px grid grid-cols-1 gap-12px md:grid-cols-2'>
            <button
              type='button'
              className={`rounded-10px border border-solid px-14px py-12px text-left transition-colors ${
                config.provider === 'honcho'
                  ? 'border-[rgba(var(--primary-6),0.70)] bg-[rgba(var(--primary-6),0.10)]'
                  : 'border-border-2 bg-fill-1 hover:border-border-3'
              }`}
              onClick={() => updateConfig('provider', 'honcho')}
            >
              <div className='flex items-center justify-between gap-10px'>
                <Typography.Text className='font-medium text-t-primary'>
                  {t('settings.memoryPage.providerHoncho')}
                </Typography.Text>
                {config.provider === 'honcho' && <Tag color='arcoblue'>{t('settings.memoryPage.selected')}</Tag>}
              </div>
              <Typography.Text className='mt-6px block text-13px leading-20px text-t-secondary'>
                {t('settings.memoryPage.providerHonchoDesc')}
              </Typography.Text>
            </button>

            <button
              type='button'
              className={`rounded-10px border border-solid px-14px py-12px text-left transition-colors ${
                config.provider === 'supermemory'
                  ? 'border-[rgba(var(--primary-6),0.70)] bg-[rgba(var(--primary-6),0.10)]'
                  : 'border-border-2 bg-fill-1 hover:border-border-3'
              }`}
              onClick={() => updateConfig('provider', 'supermemory')}
            >
              <div className='flex items-center justify-between gap-10px'>
                <Typography.Text className='font-medium text-t-primary'>
                  {t('settings.memoryPage.providerSupermemory')}
                </Typography.Text>
                {config.provider === 'supermemory' && <Tag color='arcoblue'>{t('settings.memoryPage.selected')}</Tag>}
              </div>
              <Typography.Text className='mt-6px block text-13px leading-20px text-t-secondary'>
                {t('settings.memoryPage.providerSupermemoryDesc')}
              </Typography.Text>
            </button>
          </div>
          {config.provider === 'supermemory' && (
            <Alert type='info' content={t('settings.memoryPage.supermemoryNotReady')} className='mt-14px' />
          )}
        </section>

        <div className='grid grid-cols-1 gap-16px lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]'>
          <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
            <div className='mb-18px flex items-center gap-10px'>
              <Brain theme='outline' size='22' />
              <div>
                <Typography.Title heading={5} className='!m-0 text-t-primary'>
                  {t('settings.memoryPage.honchoTitle')}
                </Typography.Title>
                <Typography.Text className='text-13px text-t-secondary'>
                  {t('settings.memoryPage.honchoSubtitle')}
                </Typography.Text>
              </div>
            </div>

            <Form layout='vertical'>
              <Form.Item label={t('settings.memoryPage.apiKey')}>
                <Input.Password
                  value={config.apiKey}
                  visibilityToggle
                  placeholder={t('settings.memoryPage.apiKeyPlaceholder')}
                  disabled={!isHonchoSelected}
                  onChange={(value) => updateConfig('apiKey', value)}
                />
              </Form.Item>
              <div className='grid grid-cols-1 gap-12px md:grid-cols-2'>
                <Form.Item label={t('settings.memoryPage.workspaceId')}>
                  <Input
                    value={config.workspaceId}
                    placeholder={DEFAULT_HONCHO_MEMORY_CONFIG.workspaceId}
                    disabled={!isHonchoSelected}
                    onChange={(value) => updateConfig('workspaceId', value)}
                  />
                </Form.Item>
                <Form.Item label={t('settings.memoryPage.userPeerId')}>
                  <Input
                    value={config.userPeerId}
                    placeholder={DEFAULT_HONCHO_MEMORY_CONFIG.userPeerId}
                    disabled={!isHonchoSelected}
                    onChange={(value) => updateConfig('userPeerId', value)}
                  />
                </Form.Item>
              </div>
              <Form.Item label={t('settings.memoryPage.baseUrl')}>
                <Input
                  value={config.baseURL}
                  placeholder={DEFAULT_HONCHO_MEMORY_CONFIG.baseURL}
                  disabled={!isHonchoSelected}
                  onChange={(value) => updateConfig('baseURL', value)}
                />
              </Form.Item>
            </Form>

            <div className='mt-4px grid grid-cols-1 gap-10px md:grid-cols-3'>
              <div className='flex items-center justify-between rounded-8px bg-fill-1 px-12px py-10px'>
                <Typography.Text className='text-13px'>{t('settings.memoryPage.enableHooks')}</Typography.Text>
                <Switch
                  checked={config.enabled}
                  disabled={!isHonchoSelected}
                  onChange={(checked) => updateConfig('enabled', checked)}
                />
              </div>
              <div className='flex items-center justify-between rounded-8px bg-fill-1 px-12px py-10px'>
                <Typography.Text className='text-13px'>{t('settings.memoryPage.captureUsers')}</Typography.Text>
                <Switch
                  checked={config.captureUserMessages}
                  disabled={!isHonchoSelected}
                  onChange={(checked) => updateConfig('captureUserMessages', checked)}
                />
              </div>
              <div className='flex items-center justify-between rounded-8px bg-fill-1 px-12px py-10px'>
                <Typography.Text className='text-13px'>{t('settings.memoryPage.captureAgents')}</Typography.Text>
                <Switch
                  checked={config.captureAgentMessages}
                  disabled={!isHonchoSelected}
                  onChange={(checked) => updateConfig('captureAgentMessages', checked)}
                />
              </div>
            </div>

            <div className='mt-18px flex flex-wrap gap-10px'>
              <Button icon={<Save theme='outline' size='16' />} onClick={handleSave}>
                {t('settings.memoryPage.save')}
              </Button>
              <Button
                type='primary'
                icon={<CheckOne theme='outline' size='16' />}
                loading={loading}
                disabled={!isHonchoSelected || !hasApiKey}
                onClick={handleSetup}
              >
                {t('settings.memoryPage.setupHoncho')}
              </Button>
              <Button type='text' onClick={openApiKeys}>
                {t('settings.memoryPage.openApiKeys')}
              </Button>
            </div>
          </section>

          <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
            <div className='mb-16px flex items-center justify-between gap-12px'>
              <div className='flex items-center gap-10px'>
                <CloudStorage theme='outline' size='22' />
                <div>
                  <Typography.Title heading={5} className='!m-0 text-t-primary'>
                    {t('settings.memoryPage.memoriesTitle')}
                  </Typography.Title>
                  <Typography.Text className='text-13px text-t-secondary'>
                    {t('settings.memoryPage.memoriesSubtitle')}
                  </Typography.Text>
                </div>
              </div>
              <Button
                size='small'
                icon={<Refresh theme='outline' size='14' />}
                loading={refreshing}
                disabled={!isHonchoSelected || !hasApiKey}
                onClick={refreshMemories}
              >
                {t('settings.memoryPage.refresh')}
              </Button>
            </div>

            {!isHonchoSelected && <Alert type='info' content={t('settings.memoryPage.supermemoryNotReady')} />}
            {isHonchoSelected && !hasApiKey && <Alert type='warning' content={t('settings.memoryPage.apiKeyRequired')} />}

            {selectedSnapshot?.peerCard && selectedSnapshot.peerCard.length > 0 && (
              <div className='mt-14px'>
                <Typography.Text className='mb-8px block text-12px font-medium text-t-secondary'>
                  {t('settings.memoryPage.peerCard')}
                </Typography.Text>
                <div className='flex flex-col gap-8px'>
                  {selectedSnapshot.peerCard.map((item, index) => (
                    <div key={`${item}-${index}`} className='rounded-8px bg-fill-1 px-12px py-9px text-13px text-t-primary'>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSnapshot?.representation && (
              <div className='mt-16px'>
                <Typography.Text className='mb-8px block text-12px font-medium text-t-secondary'>
                  {t('settings.memoryPage.representation')}
                </Typography.Text>
                <div className='max-h-[360px] overflow-auto whitespace-pre-wrap rounded-8px bg-fill-1 px-12px py-10px text-13px leading-20px text-t-primary'>
                  {selectedSnapshot.representation}
                </div>
              </div>
            )}

            {isHonchoSelected && hasApiKey && selectedSnapshot && !selectedSnapshot.representation && selectedSnapshot.peerCard.length === 0 && (
              <Alert type='info' content={t('settings.memoryPage.noMemoriesYet')} className='mt-14px' />
            )}
          </section>
        </div>

        <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <div className='flex items-center justify-between gap-12px'>
            <div>
              <Typography.Title heading={5} className='!m-0 text-t-primary'>
                {t('settings.memoryPage.supermemoryTitle')}
              </Typography.Title>
              <Typography.Text className='text-13px text-t-secondary'>
                {t('settings.memoryPage.supermemorySubtitle')}
              </Typography.Text>
            </div>
            <Tag>{t('settings.memoryPage.next')}</Tag>
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
};

export default MemorySettings;
