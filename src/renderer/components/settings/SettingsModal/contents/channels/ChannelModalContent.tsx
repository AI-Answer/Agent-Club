/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IChannelPluginStatus } from '@process/channels/types';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { channel, webui, type IWebUIStatus } from '@/common/adapter/ipcBridge';
import { ConfigStorage } from '@/common/config/storage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import type { GeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import { useGeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import { Input, InputNumber, Message, Select, Switch } from '@arco-design/web-react';
import { CheckOne } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsViewMode } from '../../settingsViewContext';
import ChannelItem from './ChannelItem';
import type { ChannelConfig } from './types';
import DingTalkConfigForm from './DingTalkConfigForm';
import LarkConfigForm from './LarkConfigForm';
import TelegramConfigForm from './TelegramConfigForm';
import WeixinConfigForm from './WeixinConfigForm';
import WecomConfigForm from './WecomConfigForm';

type ChannelModelConfigKey =
  | 'assistant.telegram.defaultModel'
  | 'assistant.lark.defaultModel'
  | 'assistant.dingtalk.defaultModel'
  | 'assistant.weixin.defaultModel'
  | 'assistant.wecom.defaultModel';

type ExtensionFieldType = 'text' | 'password' | 'select' | 'number' | 'boolean';

type ExtensionFieldSchema = {
  key: string;
  label: string;
  type: ExtensionFieldType;
  required?: boolean;
  options?: string[];
  default?: string | number | boolean;
};

type ExtensionFieldValues = Record<string, Record<string, string | number | boolean>>;

type HermesNativeChannelId = 'slack' | 'discord' | 'imessage';
type HermesNativeChannelFields = Record<HermesNativeChannelId, Record<string, string>>;

const HERMES_NATIVE_CHANNEL_IDS = new Set<HermesNativeChannelId>(['slack', 'discord', 'imessage']);
const HIDDEN_CHANNEL_SETTING_IDS = new Set(['lark', 'dingtalk', 'wecom']);
const BUILTIN_CHANNEL_TYPES = new Set([
  'telegram',
  'lark',
  'dingtalk',
  'weixin',
  'wecom',
  'slack',
  'discord',
  'imessage',
]);

const IMESSAGE_WEBHOOK_PATH = '/channels/imessage/bluebubbles/webhook';
const IMESSAGE_SETUP_DOC_LINKS = [
  {
    label: 'Hermes BlueBubbles setup',
    href: 'https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/messaging/bluebubbles.md',
    description: 'Hermes gateway steps, including the `hermes gateway setup` CLI path.',
  },
  {
    label: 'BlueBubbles install',
    href: 'https://bluebubbles.app/install/',
    description: 'Install the macOS server that bridges Messages.app.',
  },
  {
    label: 'BlueBubbles API + webhooks',
    href: 'https://docs.bluebubbles.app/server/developer-guides/rest-api-and-webhooks',
    description: 'Server URL, password/guid, REST API, and webhook setup.',
  },
  {
    label: 'Private API helper',
    href: 'https://docs.bluebubbles.app/private-api/installation',
    description: 'Optional advanced iMessage features like reactions and faster sends.',
  },
];

const getErrorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Internal hook: wraps useGeminiModelSelection with ConfigStorage persistence
 * for a specific channel config key (e.g. 'assistant.telegram.defaultModel').
 *
 * Restoration is done by resolving the saved model reference into a full
 * TProviderWithModel and passing it as `initialModel` — this avoids triggering
 * the onSelectModel callback (and its toast) on mount.
 */
const useChannelModelSelection = (configKey: ChannelModelConfigKey): GeminiModelSelection => {
  const { t } = useTranslation();

  // Resolve persisted model into a full TProviderWithModel for initialModel.
  // useModelProviderList is SWR-backed so the duplicate call inside
  // useGeminiModelSelection is deduplicated automatically.
  const { providers } = useModelProviderList();
  const [resolvedInitialModel, setResolvedInitialModel] = useState<TProviderWithModel | undefined>(undefined);
  const [restored, setRestored] = useState(false);
  const retryCountRef = useRef(0);

  // Cap retries to prevent infinite re-runs when a saved provider ID is stale
  // (e.g. provider deleted, or agent switched to a non-gemini backend).
  // The Google Auth provider typically loads within 1-2 SWR cycles, so 5 is generous.
  const MAX_RESTORE_RETRIES = 5;

  useEffect(() => {
    if (restored || providers.length === 0) return;

    const restore = async () => {
      try {
        const saved = (await ConfigStorage.get(configKey)) as { id: string; useModel: string } | undefined;
        if (!saved?.id || !saved?.useModel) {
          // Nothing saved — mark restored so we don't keep retrying
          setRestored(true);
          return;
        }

        const provider = providers.find((p) => p.id === saved.id);
        if (!provider) {
          retryCountRef.current += 1;
          if (retryCountRef.current >= MAX_RESTORE_RETRIES) {
            // Provider is permanently missing — give up to avoid infinite retries
            setRestored(true);
          }
          // The Google Auth provider may load after API-key providers;
          // leaving restored=false lets this effect re-run when providers update.
          return;
        }

        // Google Auth provider's model array only contains top-level modes
        // ('auto', 'auto-gemini-2.5', 'manual'), but sub-model values like
        // 'gemini-2.5-flash' are also valid — skip strict membership check.
        const isGoogleAuth = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
        if (isGoogleAuth || provider.model?.includes(saved.useModel)) {
          setResolvedInitialModel({
            ...provider,
            useModel: saved.useModel,
          } as TProviderWithModel);
        }
        setRestored(true);
      } catch (error) {
        console.error(`[ChannelSettings] Failed to restore model for ${configKey}:`, error);
        setRestored(true);
      }
    };

    void restore();
  }, [configKey, providers, restored]);

  // Only called on explicit user selection — not during restoration
  const onSelectModel = useCallback(
    async (provider: IProvider, modelName: string) => {
      try {
        const modelRef = { id: provider.id, useModel: modelName };
        await ConfigStorage.set(configKey, modelRef);

        // Derive platform from configKey and sync to channel system
        const platform = configKey.replace('assistant.', '').replace('.defaultModel', '') as
          | 'telegram'
          | 'lark'
          | 'dingtalk'
          | 'weixin'
          | 'wecom';
        const agentKey = `assistant.${platform}.agent` as const;
        const currentAgent = await ConfigStorage.get(agentKey);
        await channel.syncChannelSettings
          .invoke({
            platform,
            agent: (currentAgent as {
              backend: string;
              customAgentId?: string;
              name?: string;
            }) || {
              backend: 'gemini',
            },
            model: modelRef,
          })
          .catch((err) => console.warn(`[ChannelSettings] syncChannelSettings failed for ${platform}:`, err));

        Message.success(t('settings.assistant.modelSwitched', 'Model switched successfully'));
        return true;
      } catch (error) {
        console.error(`[ChannelSettings] Failed to save model for ${configKey}:`, error);
        Message.error(t('settings.assistant.modelSaveFailed', 'Failed to save model'));
        return false;
      }
    },
    [configKey, t]
  );

  return useGeminiModelSelection({
    initialModel: resolvedInitialModel,
    onSelectModel,
  });
};

/**
 * Assistant Settings Content Component
 */
const ChannelModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  // Plugin state
  const [pluginStatus, setPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [larkPluginStatus, setLarkPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [dingtalkPluginStatus, setDingtalkPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [weixinPluginStatus, setWeixinPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [wecomPluginStatus, setWecomPluginStatus] = useState<IChannelPluginStatus | null>(null);
  const [enableLoading, setEnableLoading] = useState(false);
  const [larkEnableLoading, setLarkEnableLoading] = useState(false);
  const [dingtalkEnableLoading, setDingtalkEnableLoading] = useState(false);
  const [weixinEnableLoading, setWeixinEnableLoading] = useState(false);
  const [wecomEnableLoading, setWecomEnableLoading] = useState(false);
  const [extensionStatuses, setExtensionStatuses] = useState<Record<string, IChannelPluginStatus>>({});
  const [extensionLoadingMap, setExtensionLoadingMap] = useState<Record<string, boolean>>({});
  const [extensionFieldValues, setExtensionFieldValues] = useState<ExtensionFieldValues>({});
  const [hermesNativeStatuses, setHermesNativeStatuses] = useState<
    Partial<Record<HermesNativeChannelId, IChannelPluginStatus>>
  >({});
  const [hermesNativeLoadingMap, setHermesNativeLoadingMap] = useState<Record<HermesNativeChannelId, boolean>>({
    slack: false,
    discord: false,
    imessage: false,
  });
  const [hermesNativeFieldValues, setHermesNativeFieldValues] = useState<HermesNativeChannelFields>({
    slack: {},
    discord: {},
    imessage: {},
  });
  const [webuiStatus, setWebuiStatus] = useState<IWebUIStatus | null>(null);

  // Track the token entered in TelegramConfigForm so the toggle handler can use it
  const telegramTokenRef = React.useRef<string>('');

  // Collapse state - true means collapsed (closed), false means expanded (open)
  const [collapseKeys, setCollapseKeys] = useState<Record<string, boolean>>({
    telegram: true, // Default to collapsed
    slack: true,
    discord: true,
    imessage: true,
    lark: true,
    dingtalk: true,
    weixin: true,
    wecom: true,
  });

  // Model selection state — uses unified hook with ConfigStorage persistence
  const telegramModelSelection = useChannelModelSelection('assistant.telegram.defaultModel');
  const larkModelSelection = useChannelModelSelection('assistant.lark.defaultModel');
  const dingtalkModelSelection = useChannelModelSelection('assistant.dingtalk.defaultModel');
  const weixinModelSelection = useChannelModelSelection('assistant.weixin.defaultModel');
  const wecomModelSelection = useChannelModelSelection('assistant.wecom.defaultModel');

  // Load plugin status
  const loadPluginStatus = useCallback(async () => {
    try {
      const result = await channel.getPluginStatus.invoke();
      if (result.success && result.data) {
        const telegramPlugin = result.data.find((p) => p.type === 'telegram');
        const larkPlugin = result.data.find((p) => p.type === 'lark');
        const dingtalkPlugin = result.data.find((p) => p.type === 'dingtalk');
        const weixinPlugin = result.data.find((p) => p.type === 'weixin');
        const wecomPlugin = result.data.find((p) => p.type === 'wecom');
        const hermesNativePlugins = result.data.filter((p) =>
          HERMES_NATIVE_CHANNEL_IDS.has(p.type as HermesNativeChannelId)
        );
        const extensionPlugins = result.data.filter((p) => !BUILTIN_CHANNEL_TYPES.has(p.type));

        setPluginStatus(telegramPlugin || null);
        setLarkPluginStatus(larkPlugin || null);
        setDingtalkPluginStatus(dingtalkPlugin || null);
        setWeixinPluginStatus(weixinPlugin || null);
        setWecomPluginStatus(wecomPlugin || null);
        setHermesNativeStatuses(() => {
          const next: Partial<Record<HermesNativeChannelId, IChannelPluginStatus>> = {};
          for (const nativePlugin of hermesNativePlugins) {
            next[nativePlugin.type as HermesNativeChannelId] = nativePlugin;
          }
          return next;
        });
        setExtensionStatuses(() => {
          const next: Record<string, IChannelPluginStatus> = {};
          for (const plugin of extensionPlugins) {
            next[plugin.type] = plugin;
          }
          return next;
        });

        setExtensionFieldValues((prev) => {
          const next: ExtensionFieldValues = { ...prev };
          for (const plugin of extensionPlugins) {
            const fields = [
              ...(plugin.extensionMeta?.credentialFields || []),
              ...(plugin.extensionMeta?.configFields || []),
            ] as ExtensionFieldSchema[];
            if (!next[plugin.type]) {
              next[plugin.type] = {};
            }
            for (const field of fields) {
              if (next[plugin.type][field.key] === undefined && field.default !== undefined) {
                next[plugin.type][field.key] = field.default;
              }
            }
          }
          return next;
        });
      }
    } catch (error) {
      console.error('[ChannelSettings] Failed to load plugin status:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void loadPluginStatus();
  }, [loadPluginStatus]);

  useEffect(() => {
    const loadWebuiStatus = async () => {
      try {
        const result = await webui.getStatus.invoke();
        if (result?.success && result.data) {
          setWebuiStatus(result.data);
        }
      } catch {
        // Best-effort only: channel settings should not fail if webui status is unavailable.
      }
    };
    void loadWebuiStatus();
  }, []);

  // Listen for plugin status changes
  useEffect(() => {
    const unsubscribe = channel.pluginStatusChanged.on(({ status }) => {
      if (status.type === 'telegram') {
        setPluginStatus(status);
      } else if (status.type === 'lark') {
        setLarkPluginStatus(status);
      } else if (status.type === 'dingtalk') {
        setDingtalkPluginStatus(status);
      } else if (status.type === 'weixin') {
        setWeixinPluginStatus(status);
      } else if (status.type === 'wecom') {
        setWecomPluginStatus(status);
      } else if (HERMES_NATIVE_CHANNEL_IDS.has(status.type as HermesNativeChannelId)) {
        setHermesNativeStatuses((prev) => ({
          ...prev,
          [status.type]: status,
        }));
      } else if (!BUILTIN_CHANNEL_TYPES.has(status.type)) {
        setExtensionStatuses((prev) => ({
          ...prev,
          [status.type]: {
            ...prev[status.type],
            ...status,
            extensionMeta: status.extensionMeta || prev[status.type]?.extensionMeta,
          },
        }));
      }
    });
    return () => unsubscribe();
  }, []);

  // Toggle collapse
  const handleToggleCollapse = (channelId: string) => {
    setCollapseKeys((prev) => ({
      ...prev,
      [channelId]: !prev[channelId],
    }));
  };

  // Enable/Disable plugin
  const handleTogglePlugin = async (enabled: boolean) => {
    setEnableLoading(true);
    try {
      if (enabled) {
        // Check if we have a token - either saved in database or entered in the form
        const pendingToken = telegramTokenRef.current.trim();
        if (!pluginStatus?.hasToken && !pendingToken) {
          Message.warning(t('settings.assistant.tokenRequired', 'Please enter a bot token first'));
          setEnableLoading(false);
          return;
        }

        const result = await channel.enablePlugin.invoke({
          pluginId: 'telegram_default',
          config: pendingToken ? { token: pendingToken } : {},
        });

        if (result.success) {
          Message.success(t('settings.assistant.pluginEnabled', 'Telegram bot enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.assistant.enableFailed', 'Failed to enable plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({
          pluginId: 'telegram_default',
        });

        if (result.success) {
          Message.success(t('settings.assistant.pluginDisabled', 'Telegram bot disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.assistant.disableFailed', 'Failed to disable plugin'));
        }
      }
    } catch (error) {
      Message.error(getErrorMessage(error));
    } finally {
      setEnableLoading(false);
    }
  };

  // Enable/Disable Lark plugin
  const handleToggleLarkPlugin = async (enabled: boolean) => {
    setLarkEnableLoading(true);
    try {
      if (enabled) {
        // Check if we have credentials - already saved in database
        if (!larkPluginStatus?.hasToken) {
          Message.warning(t('settings.lark.credentialsRequired', 'Please configure Lark credentials first'));
          setLarkEnableLoading(false);
          return;
        }

        const result = await channel.enablePlugin.invoke({
          pluginId: 'lark_default',
          config: {},
        });

        if (result.success) {
          Message.success(t('settings.lark.pluginEnabled', 'Lark bot enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.lark.enableFailed', 'Failed to enable Lark plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({
          pluginId: 'lark_default',
        });

        if (result.success) {
          Message.success(t('settings.lark.pluginDisabled', 'Lark bot disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.assistant.disableFailed', 'Failed to disable plugin'));
        }
      }
    } catch (error) {
      Message.error(getErrorMessage(error));
    } finally {
      setLarkEnableLoading(false);
    }
  };

  // Enable/Disable DingTalk plugin
  const handleToggleDingtalkPlugin = async (enabled: boolean) => {
    setDingtalkEnableLoading(true);
    try {
      if (enabled) {
        if (!dingtalkPluginStatus?.hasToken) {
          Message.warning(t('settings.dingtalk.credentialsRequired', 'Please configure DingTalk credentials first'));
          setDingtalkEnableLoading(false);
          return;
        }

        const result = await channel.enablePlugin.invoke({
          pluginId: 'dingtalk_default',
          config: {},
        });

        if (result.success) {
          Message.success(t('settings.dingtalk.pluginEnabled', 'DingTalk bot enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.dingtalk.enableFailed', 'Failed to enable DingTalk plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({
          pluginId: 'dingtalk_default',
        });

        if (result.success) {
          Message.success(t('settings.dingtalk.pluginDisabled', 'DingTalk bot disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.dingtalk.disableFailed', 'Failed to disable DingTalk plugin'));
        }
      }
    } catch (error) {
      Message.error(getErrorMessage(error));
    } finally {
      setDingtalkEnableLoading(false);
    }
  };

  // Enable/Disable WeChat plugin
  const handleToggleWeixinPlugin = async (enabled: boolean) => {
    setWeixinEnableLoading(true);
    try {
      if (enabled) {
        if (!weixinPluginStatus?.hasToken) {
          Message.warning(t('settings.weixin.loginRequired', 'Please login with WeChat QR code first'));
          setWeixinEnableLoading(false);
          return;
        }
        const result = await channel.enablePlugin.invoke({
          pluginId: 'weixin_default',
          config: {},
        });
        if (result.success) {
          Message.success(t('settings.weixin.pluginEnabled', 'WeChat channel enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.weixin.enableFailed', 'Failed to enable WeChat plugin'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({
          pluginId: 'weixin_default',
        });
        if (result.success) {
          Message.success(t('settings.weixin.pluginDisabled', 'WeChat channel disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.weixin.disableFailed', 'Failed to disable WeChat plugin'));
        }
      }
    } catch (error) {
      Message.error(getErrorMessage(error));
    } finally {
      setWeixinEnableLoading(false);
    }
  };

  const handleToggleWecomPlugin = async (enabled: boolean) => {
    setWecomEnableLoading(true);
    try {
      if (enabled) {
        if (!wecomPluginStatus?.hasToken) {
          Message.warning(t('settings.wecom.configureFirst', 'Please save Token and EncodingAESKey first'));
          setWecomEnableLoading(false);
          return;
        }
        const result = await channel.enablePlugin.invoke({
          pluginId: 'wecom_default',
          config: {},
        });
        if (result.success) {
          Message.success(t('settings.wecom.pluginEnabled', 'WeCom channel enabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.wecom.enableFailed', 'Failed to enable WeCom channel'));
        }
      } else {
        const result = await channel.disablePlugin.invoke({
          pluginId: 'wecom_default',
        });
        if (result.success) {
          Message.success(t('settings.wecom.pluginDisabled', 'WeCom channel disabled'));
          await loadPluginStatus();
        } else {
          Message.error(result.msg || t('settings.wecom.disableFailed', 'Failed to disable WeCom channel'));
        }
      }
    } catch (error: unknown) {
      Message.error(error instanceof Error ? error.message : String(error));
    } finally {
      setWecomEnableLoading(false);
    }
  };

  const updateExtensionFieldValue = useCallback((pluginType: string, key: string, value: string | number | boolean) => {
    setExtensionFieldValues((prev) => ({
      ...prev,
      [pluginType]: {
        ...prev[pluginType],
        [key]: value,
      },
    }));
  }, []);

  const updateHermesNativeFieldValue = useCallback((pluginType: HermesNativeChannelId, key: string, value: string) => {
    setHermesNativeFieldValues((prev) => ({
      ...prev,
      [pluginType]: {
        ...prev[pluginType],
        [key]: value,
      },
    }));
  }, []);

  const handleToggleHermesNativePlugin = useCallback(
    async (pluginType: HermesNativeChannelId, enabled: boolean) => {
      const status = hermesNativeStatuses[pluginType];
      setHermesNativeLoadingMap((prev) => ({ ...prev, [pluginType]: true }));

      try {
        if (enabled) {
          const fieldValues = hermesNativeFieldValues[pluginType] || {};
          const requiredKeys: Record<HermesNativeChannelId, string[]> = {
            slack: ['botToken', 'appToken'],
            discord: ['botToken'],
            imessage: ['serverUrl', 'guid'],
          };
          const missingKey = requiredKeys[pluginType].find(
            (key) => !status?.hasToken && !String(fieldValues[key] || '').trim()
          );

          if (missingKey) {
            Message.warning(
              t('settings.channels.hermes.requiredField', {
                defaultValue: 'Please fill required Hermes channel credentials first.',
              })
            );
            return;
          }

          const result = await channel.enablePlugin.invoke({
            pluginId: `${pluginType}_default`,
            config: Object.fromEntries(
              Object.entries(fieldValues).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
            ),
          });

          if (result.success) {
            Message.success(
              t('settings.channels.hermes.enabled', {
                defaultValue: 'Hermes channel enabled',
              })
            );
            await loadPluginStatus();
          } else {
            Message.error(
              result.msg ||
                t('settings.channels.hermes.enableFailed', {
                  defaultValue: 'Failed to enable Hermes channel',
                })
            );
          }
        } else {
          const result = await channel.disablePlugin.invoke({
            pluginId: status?.id || `${pluginType}_default`,
          });
          if (result.success) {
            Message.success(
              t('settings.channels.hermes.disabled', {
                defaultValue: 'Hermes channel disabled',
              })
            );
            await loadPluginStatus();
          } else {
            Message.error(
              result.msg ||
                t('settings.channels.hermes.disableFailed', {
                  defaultValue: 'Failed to disable Hermes channel',
                })
            );
          }
        }
      } catch (error) {
        Message.error(getErrorMessage(error));
      } finally {
        setHermesNativeLoadingMap((prev) => ({ ...prev, [pluginType]: false }));
      }
    },
    [hermesNativeStatuses, hermesNativeFieldValues, t, loadPluginStatus]
  );

  const handleToggleExtensionPlugin = useCallback(
    async (pluginType: string, enabled: boolean) => {
      const status = extensionStatuses[pluginType];
      if (!status) return;

      setExtensionLoadingMap((prev) => ({ ...prev, [pluginType]: true }));
      try {
        if (enabled) {
          const fieldValues = extensionFieldValues[pluginType] || {};
          const credentialFields = (status.extensionMeta?.credentialFields || []) as ExtensionFieldSchema[];
          const missingField = credentialFields.find((field) => {
            if (!field.required) return false;
            const value = fieldValues[field.key];
            if (field.type === 'boolean') return value === undefined;
            return value === undefined || value === '';
          });

          if (missingField) {
            Message.warning(
              t('settings.channels.extension.requiredField', {
                defaultValue: 'Please fill required field: {{field}}',
                field: missingField.label,
              })
            );
            return;
          }

          const result = await channel.enablePlugin.invoke({
            pluginId: status.id || pluginType,
            config: fieldValues,
          });

          if (result.success) {
            Message.success(
              t('settings.channels.extension.enabled', {
                defaultValue: 'Channel enabled',
              })
            );
            await loadPluginStatus();
          } else {
            Message.error(
              result.msg ||
                t('settings.channels.extension.enableFailed', {
                  defaultValue: 'Failed to enable channel',
                })
            );
          }
        } else {
          const result = await channel.disablePlugin.invoke({
            pluginId: status.id || pluginType,
          });
          if (result.success) {
            Message.success(
              t('settings.channels.extension.disabled', {
                defaultValue: 'Channel disabled',
              })
            );
            await loadPluginStatus();
          } else {
            Message.error(
              result.msg ||
                t('settings.channels.extension.disableFailed', {
                  defaultValue: 'Failed to disable channel',
                })
            );
          }
        }
      } catch (error) {
        Message.error(getErrorMessage(error));
      } finally {
        setExtensionLoadingMap((prev) => ({ ...prev, [pluginType]: false }));
      }
    },
    [extensionStatuses, extensionFieldValues, t, loadPluginStatus]
  );

  const renderExtensionConfigForm = useCallback(
    (status: IChannelPluginStatus) => {
      const pluginType = status.type;
      const fields = [
        ...((status.extensionMeta?.credentialFields || []) as ExtensionFieldSchema[]),
        ...((status.extensionMeta?.configFields || []) as ExtensionFieldSchema[]),
      ];
      const values = extensionFieldValues[pluginType] || {};
      const callbackPath = '/ext-wecom-bot/webhook';
      const localCallbackUrl = webuiStatus?.localUrl
        ? `${webuiStatus.localUrl}${callbackPath}`
        : `http://localhost:25808${callbackPath}`;
      const lanCallbackUrl = webuiStatus?.networkUrl ? `${webuiStatus.networkUrl}${callbackPath}` : null;
      const publicBaseUrl =
        typeof values.publicBaseUrl === 'string' ? values.publicBaseUrl.trim().replace(/\/+$/, '') : '';
      const publicCallbackUrl = publicBaseUrl ? `${publicBaseUrl}${callbackPath}` : null;

      if (fields.length === 0) {
        return (
          <div className='text-14px text-t-secondary py-12px'>
            {status.extensionMeta?.description ||
              t('settings.channels.extension.noConfig', {
                defaultValue: 'No extra configuration required.',
              })}
          </div>
        );
      }

      return (
        <div className='space-y-10px py-4px'>
          {status.extensionMeta?.description && (
            <div className='text-13px text-t-secondary leading-relaxed'>{status.extensionMeta.description}</div>
          )}
          {pluginType === 'ext-wecom-bot' && (
            <div className='text-12px leading-relaxed p-10px rd-8px bg-[rgba(var(--orange-6),0.08)] border border-[rgba(var(--orange-6),0.3)] text-t-secondary'>
              <div className='font-500 text-t-primary mb-6px'>企微回调地址说明</div>
              <div>本机 Callback URL: {localCallbackUrl}</div>
              {lanCallbackUrl ? <div>局域网 Callback URL: {lanCallbackUrl}</div> : null}
              {publicCallbackUrl ? <div>公网 Callback URL(配置值): {publicCallbackUrl}</div> : null}
              <div className='mt-6px'>
                仅开启 WebUI 远程访问（LAN）通常不能直接通过企微回调。企微服务器需要可访问的公网 HTTPS 地址。
              </div>
              <div>建议：使用反向代理 + 证书，或 Cloudflare Tunnel / ngrok 映射到本机。</div>
            </div>
          )}
          {fields.map((field) => {
            const rawValue = values[field.key];
            const label = `${field.label}${field.required ? ' *' : ''}`;

            if (field.type === 'boolean') {
              return (
                <div key={`${pluginType}-${field.key}`} className='flex items-center justify-between'>
                  <span className='text-13px text-t-primary'>{label}</span>
                  <Switch
                    checked={Boolean(rawValue)}
                    onChange={(checked) => updateExtensionFieldValue(pluginType, field.key, checked)}
                  />
                </div>
              );
            }

            if (field.type === 'number') {
              return (
                <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                  <div className='text-13px text-t-primary'>{label}</div>
                  <InputNumber
                    value={typeof rawValue === 'number' ? rawValue : undefined}
                    onChange={(value) => updateExtensionFieldValue(pluginType, field.key, Number(value || 0))}
                    className='w-full'
                  />
                </div>
              );
            }

            if (field.type === 'select') {
              return (
                <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                  <div className='text-13px text-t-primary'>{label}</div>
                  <Select
                    value={typeof rawValue === 'string' ? rawValue : undefined}
                    options={(field.options || []).map((option) => ({
                      label: option,
                      value: option,
                    }))}
                    onChange={(value) => updateExtensionFieldValue(pluginType, field.key, String(value))}
                    placeholder={t('settings.channels.extension.selectPlaceholder', { defaultValue: 'Please select' })}
                    allowClear
                  />
                </div>
              );
            }

            return (
              <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                <div className='text-13px text-t-primary'>{label}</div>
                <Input
                  value={typeof rawValue === 'string' ? rawValue : ''}
                  onChange={(value) => updateExtensionFieldValue(pluginType, field.key, value)}
                  placeholder={field.label}
                  type={field.type === 'password' ? 'password' : 'text'}
                />
              </div>
            );
          })}
        </div>
      );
    },
    [extensionFieldValues, t, updateExtensionFieldValue, webuiStatus]
  );

  const renderHermesNativeConfigForm = useCallback(
    (pluginType: HermesNativeChannelId, detail: string) => {
      const status = hermesNativeStatuses[pluginType];
      const fields = hermesNativeFieldValues[pluginType] || {};
      const fieldSpecs: Record<
        HermesNativeChannelId,
        Array<{ key: string; label: string; type?: 'password' | 'text'; placeholder: string }>
      > = {
        slack: [
          { key: 'botToken', label: 'Slack bot token', type: 'password', placeholder: 'xoxb-...' },
          { key: 'appToken', label: 'Slack app-level token', type: 'password', placeholder: 'xapp-...' },
        ],
        discord: [{ key: 'botToken', label: 'Discord bot token', type: 'password', placeholder: 'Bot token' }],
        imessage: [
          { key: 'serverUrl', label: 'BlueBubbles server URL', placeholder: 'https://your-server.example.com' },
          { key: 'guid', label: 'BlueBubbles server password/guid', type: 'password', placeholder: 'Server password' },
        ],
      };
      const localWebhookUrl = webuiStatus?.localUrl
        ? `${webuiStatus.localUrl}${IMESSAGE_WEBHOOK_PATH}`
        : `http://localhost:25808${IMESSAGE_WEBHOOK_PATH}`;
      const lanWebhookUrl = webuiStatus?.networkUrl ? `${webuiStatus.networkUrl}${IMESSAGE_WEBHOOK_PATH}` : null;

      return (
        <div className='space-y-10px py-12px'>
          <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-2 px-12px py-10px'>
            <div className='mb-6px flex items-center gap-6px text-13px font-600 text-t-primary'>
              <CheckOne theme='outline' size='14' className='text-[rgb(var(--primary-6))]' />
              <span>Hermes Chief of Staff only</span>
            </div>
            <div className='text-12px leading-18px text-t-secondary'>{detail}</div>
          </div>

          <div className='grid grid-cols-1 gap-8px sm:grid-cols-3'>
            {[
              ['Scope', 'Personal chief-of-staff channel'],
              ['Routing', 'Hermes agent only'],
              ['Status', status?.connected ? 'Connected' : status?.hasToken ? 'Ready to enable' : 'Needs credentials'],
            ].map(([label, value]) => (
              <div key={`${pluginType}-${label}`} className='rounded-8px bg-fill-2 px-10px py-8px'>
                <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>{label}</div>
                <div className='mt-3px text-12px font-600 leading-17px text-t-primary'>{value}</div>
              </div>
            ))}
          </div>

          <div className='grid grid-cols-1 gap-10px sm:grid-cols-2'>
            {fieldSpecs[pluginType].map((field) => (
              <div key={`${pluginType}-${field.key}`} className='space-y-6px'>
                <div className='text-13px text-t-primary'>{field.label}</div>
                <Input
                  value={fields[field.key] || ''}
                  onChange={(value) => updateHermesNativeFieldValue(pluginType, field.key, value)}
                  placeholder={status?.hasToken ? 'Saved. Enter a new value to replace.' : field.placeholder}
                  type={field.type || 'text'}
                />
              </div>
            ))}
          </div>

          {pluginType === 'imessage' ? (
            <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 px-12px py-10px'>
              <div className='mb-8px text-12px font-600 uppercase leading-16px text-t-secondary'>
                BlueBubbles webhook
              </div>
              <div className='grid grid-cols-1 gap-8px md:grid-cols-2'>
                {[
                  ['Local URL', localWebhookUrl],
                  ...(lanWebhookUrl ? [['LAN URL', lanWebhookUrl] as [string, string]] : []),
                ].map(([label, value]) => (
                  <div key={label} className='rounded-8px bg-fill-2 px-10px py-8px'>
                    <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>{label}</div>
                    <div className='mt-3px break-all font-mono text-11px leading-16px text-t-primary'>{value}</div>
                  </div>
                ))}
              </div>
              <div className='mt-8px text-11px leading-16px text-t-secondary'>
                Add one of these URLs in BlueBubbles Server webhooks and include the same password/guid as a
                <span className='mx-4px font-600 text-t-primary'>guid</span>
                query param or
                <span className='mx-4px font-600 text-t-primary'>x-bluebubbles-guid</span>
                header. Agent Club will ignore personal traffic until this channel is explicitly enabled.
              </div>
            </div>
          ) : null}

          {pluginType === 'imessage' ? (
            <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 px-12px py-10px'>
              <div className='mb-8px text-12px font-600 uppercase leading-16px text-t-secondary'>Setup docs</div>
              <div className='grid grid-cols-1 gap-8px sm:grid-cols-2'>
                {IMESSAGE_SETUP_DOC_LINKS.map((doc) => (
                  <a
                    key={doc.href}
                    href={doc.href}
                    target='_blank'
                    rel='noreferrer'
                    className='block rounded-8px border border-solid border-[var(--color-border-2)] bg-bg-1 px-10px py-8px no-underline transition hover:border-[rgb(var(--primary-5))] hover:bg-fill-2'
                  >
                    <div className='text-12px font-600 leading-17px text-[rgb(var(--primary-6))]'>{doc.label}</div>
                    <div className='mt-3px text-11px leading-16px text-t-secondary'>{doc.description}</div>
                  </a>
                ))}
              </div>
              <div className='mt-8px rounded-8px bg-fill-2 px-10px py-8px text-11px leading-16px text-t-secondary'>
                Install BlueBubbles Server first, copy its server URL and password/guid, then use this card to enable
                the Hermes iMessage channel for the chief-of-staff agent.
              </div>
            </div>
          ) : null}

          {status?.error ? <div className='text-12px leading-18px text-red-500'>{status.error}</div> : null}
        </div>
      );
    },
    [hermesNativeStatuses, hermesNativeFieldValues, updateHermesNativeFieldValue, webuiStatus]
  );

  // Build channel configurations
  const channels: ChannelConfig[] = useMemo(() => {
    const telegramChannel: ChannelConfig = {
      id: 'telegram',
      title: t('settings.channels.telegramTitle', 'Telegram'),
      description: t('settings.channels.telegramDesc', 'Chat with Agent Club assistant via Telegram'),
      status: 'active',
      enabled: pluginStatus?.enabled || false,
      disabled: enableLoading,
      isConnected: pluginStatus?.connected || false,
      botUsername: pluginStatus?.botUsername,
      defaultModel: telegramModelSelection.currentModel?.useModel,
      content: (
        <TelegramConfigForm
          pluginStatus={pluginStatus}
          modelSelection={telegramModelSelection}
          onStatusChange={setPluginStatus}
          onTokenChange={(token) => {
            telegramTokenRef.current = token;
          }}
        />
      ),
    };

    const larkChannel: ChannelConfig = {
      id: 'lark',
      title: t('settings.channels.larkTitle', 'Lark / Feishu'),
      description: t('settings.channels.larkDesc', 'Chat with Agent Club assistant via Lark or Feishu'),
      status: 'active',
      enabled: larkPluginStatus?.enabled || false,
      disabled: larkEnableLoading,
      isConnected: larkPluginStatus?.connected || false,
      defaultModel: larkModelSelection.currentModel?.useModel,
      content: (
        <LarkConfigForm
          pluginStatus={larkPluginStatus}
          modelSelection={larkModelSelection}
          onStatusChange={setLarkPluginStatus}
        />
      ),
    };

    const dingtalkChannel: ChannelConfig = {
      id: 'dingtalk',
      title: t('settings.channels.dingtalkTitle', 'DingTalk'),
      description: t('settings.channels.dingtalkDesc', 'Chat with Agent Club assistant via DingTalk'),
      status: 'active',
      enabled: dingtalkPluginStatus?.enabled || false,
      disabled: dingtalkEnableLoading,
      isConnected: dingtalkPluginStatus?.connected || false,
      defaultModel: dingtalkModelSelection.currentModel?.useModel,
      content: (
        <DingTalkConfigForm
          pluginStatus={dingtalkPluginStatus}
          modelSelection={dingtalkModelSelection}
          onStatusChange={setDingtalkPluginStatus}
        />
      ),
    };

    const weixinChannel: ChannelConfig = {
      id: 'weixin',
      title: t('settings.channels.weixinTitle', 'WeChat'),
      description: t('settings.channels.weixinDesc', 'Chat with Agent Club assistant via WeChat'),
      status: 'active',
      enabled: weixinPluginStatus?.enabled || false,
      disabled: weixinEnableLoading,
      isConnected: weixinPluginStatus?.connected || false,
      defaultModel: weixinModelSelection.currentModel?.useModel,
      content: (
        <WeixinConfigForm
          pluginStatus={weixinPluginStatus}
          modelSelection={weixinModelSelection}
          onStatusChange={setWeixinPluginStatus}
        />
      ),
    };

    const wecomChannel: ChannelConfig = {
      id: 'wecom',
      title: t('settings.channels.wecomTitle', 'WeCom'),
      description: t('settings.channels.wecomDesc', 'Chat with Agent Club assistant via WeCom (Enterprise WeChat)'),
      status: 'active',
      enabled: wecomPluginStatus?.enabled || false,
      disabled: wecomEnableLoading,
      isConnected: wecomPluginStatus?.connected || false,
      defaultModel: wecomModelSelection.currentModel?.useModel,
      content: (
        <WecomConfigForm
          pluginStatus={wecomPluginStatus}
          modelSelection={wecomModelSelection}
          onStatusChange={setWecomPluginStatus}
          webuiStatus={webuiStatus}
        />
      ),
    };

    const extensionChannels: ChannelConfig[] = Object.values(extensionStatuses)
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((status) => ({
        id: status.type,
        title: status.name,
        description:
          status.extensionMeta?.description ||
          t('settings.channels.extension.defaultDesc', {
            defaultValue: 'Extension channel plugin',
          }),
        status: 'active',
        enabled: status.enabled || false,
        disabled: extensionLoadingMap[status.type] || false,
        isConnected: status.connected || false,
        icon: status.extensionMeta?.icon,
        isExtension: true,
        content: renderExtensionConfigForm(status),
      }));

    const extensionTypeSet = new Set(extensionChannels.map((channelConfig) => String(channelConfig.id).toLowerCase()));
    const hermesNativeChannels: ChannelConfig[] = [
      {
        id: 'slack',
        title: t('settings.channels.slackTitle', 'Slack'),
        description: 'Hermes-only Slack Socket Mode channel for team-message triage and routing.',
        status: 'active' as const,
        enabled: hermesNativeStatuses.slack?.enabled || false,
        disabled: hermesNativeLoadingMap.slack,
        isConnected: hermesNativeStatuses.slack?.connected || false,
        botUsername: hermesNativeStatuses.slack?.botUsername,
        content: renderHermesNativeConfigForm(
          'slack',
          'Uses Slack Socket Mode. Requires a bot token and an app-level token with connections:write; messages route into Hermes only after you enable this channel.'
        ),
      },
      {
        id: 'discord',
        title: t('settings.channels.discordTitle', 'Discord'),
        description: 'Hermes-only Discord bot channel for community or course-server attention.',
        status: 'active' as const,
        enabled: hermesNativeStatuses.discord?.enabled || false,
        disabled: hermesNativeLoadingMap.discord,
        isConnected: hermesNativeStatuses.discord?.connected || false,
        botUsername: hermesNativeStatuses.discord?.botUsername,
        content: renderHermesNativeConfigForm(
          'discord',
          'Uses the Discord Gateway and REST message API. Requires a bot token and Message Content intent for useful server-channel triage.'
        ),
      },
      {
        id: 'imessage',
        title: 'iMessage',
        description: 'Mac-local Hermes channel for personal message triage.',
        status: 'active' as const,
        enabled: hermesNativeStatuses.imessage?.enabled || false,
        disabled: hermesNativeLoadingMap.imessage,
        isConnected: hermesNativeStatuses.imessage?.connected || false,
        botUsername: hermesNativeStatuses.imessage?.botUsername,
        content: renderHermesNativeConfigForm(
          'imessage',
          'Uses BlueBubbles Server webhooks and REST calls. Requires an owner-approved test chat before Agent Club sends or reads live iMessage traffic.'
        ),
      },
    ].filter((channelConfig) => !extensionTypeSet.has(String(channelConfig.id).toLowerCase()));

    return [
      telegramChannel,
      larkChannel,
      dingtalkChannel,
      weixinChannel,
      wecomChannel,
      ...extensionChannels,
      ...hermesNativeChannels,
    ].filter((channelConfig) => !HIDDEN_CHANNEL_SETTING_IDS.has(String(channelConfig.id).toLowerCase()));
  }, [
    pluginStatus,
    larkPluginStatus,
    dingtalkPluginStatus,
    extensionStatuses,
    extensionLoadingMap,
    hermesNativeStatuses,
    hermesNativeLoadingMap,
    telegramModelSelection,
    larkModelSelection,
    dingtalkModelSelection,
    enableLoading,
    larkEnableLoading,
    dingtalkEnableLoading,
    weixinPluginStatus,
    weixinEnableLoading,
    weixinModelSelection,
    wecomPluginStatus,
    wecomEnableLoading,
    wecomModelSelection,
    webuiStatus,
    renderExtensionConfigForm,
    renderHermesNativeConfigForm,
    t,
  ]);

  // Get toggle handler for each channel
  const getToggleHandler = (channelId: string) => {
    if (channelId === 'telegram') return handleTogglePlugin;
    if (channelId === 'lark') return handleToggleLarkPlugin;
    if (channelId === 'dingtalk') return handleToggleDingtalkPlugin;
    if (channelId === 'weixin') return handleToggleWeixinPlugin;
    if (channelId === 'wecom') return handleToggleWecomPlugin;
    if (channelId === 'slack' || channelId === 'discord' || channelId === 'imessage') {
      return (enabled: boolean) => {
        void handleToggleHermesNativePlugin(channelId, enabled);
      };
    }
    if (extensionStatuses[channelId]) {
      return (enabled: boolean) => {
        void handleToggleExtensionPlugin(channelId, enabled);
      };
    }
    return undefined;
  };
  const channelGuideText = t('settings.webui.featureChannelsDesc', {
    defaultValue:
      'Connect channels to interact with Agent Club from IM apps. Slack, Discord, and iMessage are tracked here as Hermes-only chief-of-staff channels.',
  });
  const channelSetupSteps = [
    t('settings.channels.selectFirst', {
      defaultValue: 'Select a channel and configure credentials.',
    }),
    t('settings.channels.enableAfterConfig', {
      defaultValue: 'Enable it and start chatting with your AI agent.',
    }),
    'Keep Hermes channels scoped to Hermes Chief of Staff.',
  ];

  return (
    <AionScrollArea className={isPageMode ? 'h-full' : ''}>
      <div className='px-[12px] md:px-[28px]'>
        <h2 className='text-20px font-500 text-t-primary m-0'>{t('settings.channels.title', 'Channels')}</h2>
        <div className='space-y-8px mt-10px'>
          <div className='text-13px text-t-secondary leading-relaxed'>{channelGuideText}</div>
          <div className='inline-flex flex-wrap items-center gap-6px rd-8px bg-fill-2 px-10px py-7px text-12px text-t-secondary leading-relaxed'>
            <span className='font-500 text-t-primary'>Hermes Chief of Staff only:</span>
            <span>
              Slack, Discord, and iMessage stay setup-gated here until each native channel can route through Hermes.
            </span>
          </div>
          <div className='flex flex-wrap gap-x-12px gap-y-6px'>
            {channelSetupSteps.map((stepLabel, idx) => (
              <div key={stepLabel} className='inline-flex items-center gap-6px'>
                <span className='inline-flex items-center justify-center w-16px h-16px rd-50% text-10px font-600 bg-[rgba(var(--primary-6),0.12)] text-[rgb(var(--primary-6))]'>
                  {idx + 1}
                </span>
                <CheckOne theme='outline' size='12' className='text-[rgb(var(--primary-6))]' />
                <span className='text-12px text-t-secondary'>{stepLabel}</span>
              </div>
            ))}
          </div>
        </div>

        <div className='space-y-12px mt-12px'>
          {channels.map((channelConfig) => (
            <ChannelItem
              key={channelConfig.id}
              channel={channelConfig}
              isCollapsed={collapseKeys[channelConfig.id] || false}
              onToggleCollapse={() => handleToggleCollapse(channelConfig.id)}
              onToggleEnabled={getToggleHandler(channelConfig.id)}
            />
          ))}
        </div>
      </div>
    </AionScrollArea>
  );
};

export default ChannelModalContent;
