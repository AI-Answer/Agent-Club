import { ipcBridge } from '@/common';
import type {
  AgentVaultState,
  OnePasswordCliStatus,
  OnePasswordConnectionStatus,
  OnePasswordSecurityPublicConfig,
  SecuritySettingsState,
} from '@/common/types/security';
import { Alert, Button, Input, Message, Switch } from '@arco-design/web-react';
import { CheckOne, Connection, FileCode, FolderOpen, Install, LinkOne, Refresh, Shield } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AgentVaultSecretEditor from './components/AgentVaultSecretEditor';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ONE_PASSWORD_CLI_DOCS_URL = 'https://www.1password.dev/cli/get-started';

const EMPTY_VAULT: AgentVaultState = {
  enabled: false,
  content: '',
  filePath: '',
  keyCount: 0,
  keys: [],
  mcpServerName: 'agent-club-vault',
};

const EMPTY_ONE_PASSWORD: OnePasswordSecurityPublicConfig = {
  enabled: false,
  resolveReferences: true,
  hasServiceAccountToken: false,
};

const SecuritySettings: React.FC = () => {
  const { t } = useTranslation();
  const [message, contextHolder] = Message.useMessage();
  const messageRef = useRef(message);
  const tRef = useRef(t);
  const [loading, setLoading] = useState(true);
  const [savingVault, setSavingVault] = useState(false);
  const [openingVaultFile, setOpeningVaultFile] = useState(false);
  const [revealingVaultFile, setRevealingVaultFile] = useState(false);
  const [savingOnePassword, setSavingOnePassword] = useState(false);
  const [installingOnePassword, setInstallingOnePassword] = useState(false);
  const [testingOnePassword, setTestingOnePassword] = useState(false);
  const [testingOnePasswordConnection, setTestingOnePasswordConnection] = useState(false);
  const [agentVault, setAgentVault] = useState<AgentVaultState>(EMPTY_VAULT);
  const [onePassword, setOnePassword] = useState<OnePasswordSecurityPublicConfig>(EMPTY_ONE_PASSWORD);
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [onePasswordEnabled, setOnePasswordEnabled] = useState(false);
  const [resolveReferences, setResolveReferences] = useState(true);
  const [onePasswordAccount, setOnePasswordAccount] = useState('');
  const [onePasswordToken, setOnePasswordToken] = useState('');
  const [onePasswordCliStatus, setOnePasswordCliStatus] = useState<OnePasswordCliStatus | null>(null);
  const [onePasswordConnectionStatus, setOnePasswordConnectionStatus] =
    useState<OnePasswordConnectionStatus | null>(null);

  useEffect(() => {
    messageRef.current = message;
  }, [message]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const vaultSummary = useMemo(() => {
    if (!agentVault.keyCount) return t('settings.securityPage.noKeys');
    return t('settings.securityPage.keyCount', { count: agentVault.keyCount });
  }, [agentVault.keyCount, t]);

  const hydrate = useCallback(
    (state: SecuritySettingsState | undefined) => {
      if (!state) return;
      setAgentVault(state.agentVault);
      setOnePassword(state.onePassword);
      setVaultEnabled(state.agentVault.enabled);
      setOnePasswordEnabled(state.onePassword.enabled);
      setResolveReferences(state.onePassword.resolveReferences);
      setOnePasswordAccount(state.onePassword.account || '');
      setOnePasswordToken('');
    },
    []
  );

  const loadState = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ipcBridge.security.getState.invoke();
      if (!result.success) {
        messageRef.current.error(result.msg || tRef.current('settings.securityPage.loadFailed'));
        return;
      }
      hydrate(result.data);
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const handleSaveVault = useCallback(async () => {
    setSavingVault(true);
    try {
      const result = await ipcBridge.security.syncAgentVault.invoke({
        enabled: vaultEnabled,
      });
      if (!result.success) {
        message.error(result.msg || t('settings.securityPage.saveFailed'));
        return;
      }
      hydrate(result.data);
      message.success(t('settings.securityPage.saved'));
    } finally {
      setSavingVault(false);
    }
  }, [hydrate, message, t, vaultEnabled]);

  const handleOpenVaultFile = useCallback(async () => {
    setOpeningVaultFile(true);
    try {
      const result = await ipcBridge.security.openAgentVaultFile.invoke();
      if (!result.success) {
        message.error(result.msg || t('settings.securityPage.openFileFailed'));
        return;
      }
      hydrate(result.data);
      message.success(t('settings.securityPage.openFileStarted'));
    } finally {
      setOpeningVaultFile(false);
    }
  }, [hydrate, message, t]);

  const handleRevealVaultFile = useCallback(async () => {
    setRevealingVaultFile(true);
    try {
      const result = await ipcBridge.security.revealAgentVaultFile.invoke();
      if (!result.success) {
        message.error(result.msg || t('settings.securityPage.showFileFailed'));
        return;
      }
      hydrate(result.data);
      message.success(t('settings.securityPage.showFileStarted'));
    } finally {
      setRevealingVaultFile(false);
    }
  }, [hydrate, message, t]);

  const handleSaveOnePassword = useCallback(async () => {
    setSavingOnePassword(true);
    try {
      const result = await ipcBridge.security.saveOnePassword.invoke({
        enabled: onePasswordEnabled,
        resolveReferences,
        account: onePasswordAccount,
        serviceAccountToken: onePasswordToken,
        keepExistingToken: onePassword.hasServiceAccountToken && !onePasswordToken.trim(),
      });
      if (!result.success) {
        message.error(result.msg || t('settings.securityPage.onePasswordSaveFailed'));
        return;
      }
      hydrate(result.data);
      message.success(t('settings.securityPage.onePasswordSaved'));
    } finally {
      setSavingOnePassword(false);
    }
  }, [
    hydrate,
    message,
    onePassword.hasServiceAccountToken,
    onePasswordAccount,
    onePasswordEnabled,
    onePasswordToken,
    resolveReferences,
    t,
  ]);

  const handleInstallOnePassword = useCallback(async () => {
    setInstallingOnePassword(true);
    try {
      const result = await ipcBridge.security.installOnePasswordCli.invoke();
      if (!result.success || !result.data) {
        message.error(result.msg || t('settings.securityPage.onePasswordInstallFailed'));
        return;
      }

      setOnePasswordCliStatus(result.data);
      if (result.data.installed) {
        message.success(t('settings.securityPage.onePasswordInstallReady'));
      } else {
        message.warning(result.data.error || t('settings.securityPage.onePasswordInstallManual'));
        void ipcBridge.shell.openExternal.invoke(result.data.docsUrl);
      }
    } finally {
      setInstallingOnePassword(false);
    }
  }, [message, t]);

  const handleOpenOnePasswordGuide = useCallback(() => {
    void ipcBridge.shell.openExternal.invoke(ONE_PASSWORD_CLI_DOCS_URL);
  }, []);

  const handleTestOnePassword = useCallback(async () => {
    setTestingOnePassword(true);
    try {
      const result = await ipcBridge.security.testOnePasswordCli.invoke();
      if (!result.success || !result.data) {
        message.error(result.msg || t('settings.securityPage.onePasswordTestFailed'));
        return;
      }
      setOnePasswordCliStatus(result.data);
      if (result.data.installed) {
        message.success(t('settings.securityPage.onePasswordFound'));
      } else {
        message.warning(t('settings.securityPage.onePasswordMissing'));
      }
    } finally {
      setTestingOnePassword(false);
    }
  }, [message, t]);

  const handleTestOnePasswordConnection = useCallback(async () => {
    setTestingOnePasswordConnection(true);
    try {
      const result = await ipcBridge.security.testOnePasswordConnection.invoke();
      if (!result.success || !result.data) {
        message.error(result.msg || t('settings.securityPage.onePasswordConnectionTestFailed'));
        return;
      }

      setOnePasswordCliStatus(result.data);
      setOnePasswordConnectionStatus(result.data);
      if (result.data.connected) {
        message.success(result.data.details || t('settings.securityPage.onePasswordConnectionReady'));
      } else {
        message.warning(result.data.error || t('settings.securityPage.onePasswordConnectionMissing'));
      }
    } finally {
      setTestingOnePasswordConnection(false);
    }
  }, [message, t]);

  return (
    <SettingsPageWrapper contentClassName='max-w-1100px'>
      {contextHolder}
      <div className='flex flex-col gap-16px'>
        <div>
          <div className='flex items-center gap-8px text-20px font-semibold text-t-primary'>
            <Shield theme='outline' size='22' />
            <span>{t('settings.securityPage.title')}</span>
          </div>
          <div className='mt-6px text-13px text-t-secondary'>{t('settings.securityPage.subtitle')}</div>
        </div>

        <div className='px-[12px] md:px-[24px] py-[20px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <div className='flex flex-col gap-12px'>
            <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
              <div className='min-w-0'>
                <div className='text-15px font-medium text-t-primary'>{t('settings.securityPage.vaultTitle')}</div>
                <div className='mt-4px text-13px text-t-secondary'>{vaultSummary}</div>
              </div>
              <Switch checked={vaultEnabled} onChange={setVaultEnabled} disabled={loading || savingVault} />
            </div>

            <Alert type='warning' showIcon content={t('settings.securityPage.vaultWarning')} />
            <AgentVaultSecretEditor
              vaultEnabled={vaultEnabled}
              onVaultEnabledChange={setVaultEnabled}
              loading={loading}
              onSaved={() => {
                void loadState();
              }}
            />

            <div className='flex flex-col gap-8px md:flex-row md:items-center md:justify-between'>
              <div className='min-w-0 text-12px text-t-tertiary'>
                {agentVault.updatedAt
                  ? t('settings.securityPage.vaultUpdated', {
                      time: new Date(agentVault.updatedAt).toLocaleString(),
                    })
                  : t('settings.securityPage.vaultPathPending')}
              </div>
              <div className='flex shrink-0 flex-wrap items-center gap-8px md:justify-end'>
                <Button
                  icon={<FileCode size='14' />}
                  disabled={!agentVault.filePath}
                  loading={openingVaultFile}
                  onClick={handleOpenVaultFile}
                >
                  {t('settings.securityPage.openFile')}
                </Button>
                <Button
                  icon={<FolderOpen size='14' />}
                  disabled={!agentVault.filePath}
                  loading={revealingVaultFile}
                  onClick={handleRevealVaultFile}
                >
                  {t('settings.securityPage.showFile')}
                </Button>
                <Button type='primary' icon={<Refresh size='14' />} loading={savingVault} onClick={handleSaveVault}>
                  {t('settings.securityPage.saveVault')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <div className='flex flex-col gap-16px'>
            <div className='flex flex-col gap-12px md:flex-row md:items-start md:justify-between'>
              <div className='min-w-0'>
                <div className='text-15px font-medium text-t-primary'>
                  {t('settings.securityPage.onePasswordTitle')}
                </div>
                <div className='mt-4px text-13px text-t-secondary'>
                  {t('settings.securityPage.onePasswordSubtitle')}
                </div>
              </div>
              <Switch
                checked={onePasswordEnabled}
                onChange={setOnePasswordEnabled}
                disabled={loading || savingOnePassword}
              />
            </div>

            <div className='grid grid-cols-1 gap-12px md:grid-cols-[1fr_1fr]'>
              <label className='flex flex-col gap-6px'>
                <span className='text-12px font-medium text-t-secondary'>
                  {t('settings.securityPage.onePasswordAccount')}
                </span>
                <Input
                  value={onePasswordAccount}
                  onChange={setOnePasswordAccount}
                  placeholder={t('settings.securityPage.onePasswordAccountPlaceholder')}
                  autoComplete='off'
                  disabled={loading}
                />
              </label>

              <label className='flex flex-col gap-6px'>
                <span className='text-12px font-medium text-t-secondary'>
                  {t('settings.securityPage.onePasswordToken')}
                </span>
                <Input.Password
                  value={onePasswordToken}
                  onChange={setOnePasswordToken}
                  placeholder={
                    onePassword.hasServiceAccountToken
                      ? t('settings.securityPage.onePasswordTokenSaved')
                      : t('settings.securityPage.onePasswordTokenPlaceholder')
                  }
                  autoComplete='off'
                  disabled={loading}
                />
              </label>
            </div>

            <div className='flex flex-col gap-10px md:flex-row md:items-center md:justify-between'>
              <label className='flex items-center gap-8px text-13px text-t-primary'>
                <Switch checked={resolveReferences} onChange={setResolveReferences} disabled={loading} size='small' />
                <span>{t('settings.securityPage.resolveReferences')}</span>
              </label>
              <div className='flex flex-wrap items-center justify-end gap-8px'>
                {onePasswordCliStatus && (
                  <span className='text-12px text-t-tertiary'>
                    {onePasswordConnectionStatus
                      ? onePasswordConnectionStatus.connected
                        ? onePasswordConnectionStatus.vaultCount === undefined
                          ? t('settings.securityPage.onePasswordConnectionReady')
                          : t('settings.securityPage.onePasswordConnectionVaults', {
                              count: onePasswordConnectionStatus.vaultCount,
                            })
                        : t('settings.securityPage.onePasswordConnectionNotReady')
                      : onePasswordCliStatus.installed
                        ? t('settings.securityPage.onePasswordCliVersion', { version: onePasswordCliStatus.version })
                        : t('settings.securityPage.onePasswordCliNotFound')}
                  </span>
                )}
                <Button icon={<Install size='14' />} loading={installingOnePassword} onClick={handleInstallOnePassword}>
                  {t('settings.securityPage.installOnePassword')}
                </Button>
                <Button icon={<LinkOne size='14' />} onClick={handleOpenOnePasswordGuide}>
                  {t('settings.securityPage.onePasswordSetupGuide')}
                </Button>
                <Button icon={<Refresh size='14' />} loading={testingOnePassword} onClick={handleTestOnePassword}>
                  {t('settings.securityPage.testOnePassword')}
                </Button>
                <Button
                  icon={<Connection size='14' />}
                  loading={testingOnePasswordConnection}
                  onClick={handleTestOnePasswordConnection}
                >
                  {t('settings.securityPage.testOnePasswordConnection')}
                </Button>
                <Button
                  type='primary'
                  icon={<CheckOne size='14' />}
                  loading={savingOnePassword}
                  onClick={handleSaveOnePassword}
                >
                  {t('settings.securityPage.saveOnePassword')}
                </Button>
              </div>
            </div>

            <Alert type='info' showIcon content={t('settings.securityPage.onePasswordNote')} />
          </div>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default SecuritySettings;
