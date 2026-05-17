import { ipcBridge } from '@/common';
import {
  buildVaultContent,
  parseVaultEntries,
  VAULT_ENV_KEY_PATTERN,
  type VaultEntry,
} from '@/common/skills/agentVaultContent';
import { Alert, Button, Input, Message } from '@arco-design/web-react';
import { Delete, Plus, Save } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AgentVaultSecretEditorProps = {
  vaultEnabled: boolean;
  onVaultEnabledChange: (enabled: boolean) => void;
  loading?: boolean;
  compact?: boolean;
  onSaved?: () => void;
};

const createRowId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const entriesToRows = (entries: VaultEntry[]): Array<VaultEntry & { id: string }> =>
  entries.map((entry) => ({ ...entry, id: createRowId() }));

const AgentVaultSecretEditor: React.FC<AgentVaultSecretEditorProps> = ({
  vaultEnabled,
  onVaultEnabledChange,
  loading = false,
  compact = false,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Array<VaultEntry & { id: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const loadVault = useCallback(async () => {
    const result = await ipcBridge.security.getState.invoke();
    if (!result.success || !result.data) {
      Message.error(result.msg || t('settings.securityPage.loadFailed'));
      return;
    }

    const entries = parseVaultEntries(result.data.agentVault.content || '');
    setRows(entriesToRows(entries));
    onVaultEnabledChange(result.data.agentVault.enabled);
    setHydrated(true);
  }, [onVaultEnabledChange, t]);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  const invalidKeys = useMemo(
    () => rows.map((row) => row.key.trim()).filter((key) => key.length > 0 && !VAULT_ENV_KEY_PATTERN.test(key)),
    [rows]
  );

  const handleAddRow = () => {
    setRows((prev) => [...prev, { id: createRowId(), key: '', value: '' }]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSave = async () => {
    if (invalidKeys.length > 0) {
      Message.warning(t('settings.securityPage.vaultInvalidKeys'));
      return;
    }

    const entries = rows
      .map((row) => ({ key: row.key.trim(), value: row.value }))
      .filter((row) => row.key.length > 0);

    setSaving(true);
    try {
      const result = await ipcBridge.security.saveAgentVault.invoke({
        enabled: vaultEnabled,
        content: buildVaultContent(entries),
      });
      if (!result.success) {
        Message.error(result.msg || t('settings.securityPage.saveFailed'));
        return;
      }

      const savedEntries = parseVaultEntries(result.data?.agentVault.content || buildVaultContent(entries));
      setRows(entriesToRows(savedEntries));
      onVaultEnabledChange(result.data?.agentVault.enabled ?? vaultEnabled);
      Message.success(t('settings.securityPage.saved'));
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='flex flex-col gap-12px'>
      <div className='text-13px text-t-secondary'>{t('settings.securityPage.vaultEditorSubtitle')}</div>

      {!hydrated && <div className='text-12px text-t-tertiary'>{t('common.loading', { defaultValue: 'Loading...' })}</div>}

      {invalidKeys.length > 0 && (
        <Alert
          type='warning'
          showIcon
          content={t('settings.securityPage.vaultInvalidKeysDetail', { keys: invalidKeys.join(', ') })}
        />
      )}

      <div className='flex flex-col gap-10px'>
        {rows.length === 0 && (
          <div className='rounded-8px border border-dashed border-border-2 bg-fill-1 px-12px py-14px text-13px text-t-secondary'>
            {t('settings.securityPage.vaultEmpty')}
          </div>
        )}

        {rows.map((row) => (
          <div
            key={row.id}
            className={`grid grid-cols-1 gap-8px ${compact ? '' : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]'}`}
          >
            <Input
              value={row.key}
              placeholder={t('settings.securityPage.vaultKeyPlaceholder')}
              disabled={loading || saving}
              onChange={(value) =>
                setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, key: value } : item)))
              }
            />
            <Input.Password
              value={row.value}
              visibilityToggle
              placeholder={t('settings.securityPage.vaultValuePlaceholder')}
              disabled={loading || saving}
              onChange={(value) =>
                setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, value } : item)))
              }
            />
            <Button
              type='text'
              status='danger'
              icon={<Delete theme='outline' size='16' />}
              disabled={loading || saving}
              onClick={() => handleRemoveRow(row.id)}
            >
              {t('settings.securityPage.vaultRemoveRow')}
            </Button>
          </div>
        ))}
      </div>

      <div className='flex flex-wrap gap-8px'>
        <Button icon={<Plus theme='outline' size='16' />} disabled={loading || saving} onClick={handleAddRow}>
          {t('settings.securityPage.vaultAddRow')}
        </Button>
        <Button type='primary' icon={<Save theme='outline' size='16' />} loading={saving} disabled={loading} onClick={handleSave}>
          {t('settings.securityPage.saveVaultSecrets')}
        </Button>
      </div>

      <div className='text-12px text-t-tertiary'>{t('settings.securityPage.vaultEnvHint')}</div>
    </div>
  );
};

export default AgentVaultSecretEditor;
