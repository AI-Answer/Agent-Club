/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from '@/common/types/acpTypes';
import type { TChatConversation } from '@/common/config/storage';
import type { PluginType } from '../types';
import { resolveChannelConvType } from '../types';

const WEIXIN_FILE_SEND_SKILL = 'weixin-file-send';
const HERMES_NATIVE_CHANNELS = new Set<PluginType>(['slack', 'discord', 'imessage']);

export type ChannelAgentPreference = {
  backend: string;
  customAgentId?: string;
  name?: string;
};

export function getChannelEnabledSkills(platform: PluginType): string[] | undefined {
  return platform === 'weixin' ? [WEIXIN_FILE_SEND_SKILL] : undefined;
}

export function isHermesNativeChannel(platform: PluginType): boolean {
  return HERMES_NATIVE_CHANNELS.has(platform);
}

export function getDefaultChannelBackend(platform: PluginType): string {
  return isHermesNativeChannel(platform) ? 'hermes' : 'gemini';
}

export function resolveChannelAgentPreference(savedAgent: unknown, platform: PluginType): ChannelAgentPreference {
  if (savedAgent && typeof savedAgent === 'object') {
    const value = savedAgent as Partial<ChannelAgentPreference>;
    if (typeof value.backend === 'string' && value.backend.trim()) {
      return {
        backend: value.backend.trim(),
        customAgentId: typeof value.customAgentId === 'string' ? value.customAgentId : undefined,
        name: typeof value.name === 'string' ? value.name : undefined,
      };
    }
  }

  return isHermesNativeChannel(platform) ? { backend: 'hermes', name: 'Hermes Chief of Staff' } : { backend: 'gemini' };
}

export function isChannelConversationForAgent(
  conversation: TChatConversation | null | undefined,
  args: {
    platform: PluginType;
    channelChatId?: string;
    backend: string;
  }
): boolean {
  if (!conversation) return false;

  const { convType, convBackend } = resolveChannelConvType(args.backend);
  if (conversation.source !== args.platform) return false;
  if ((conversation.channelChatId || undefined) !== (args.channelChatId || undefined)) return false;
  if (conversation.type !== convType) return false;

  const extraBackend = (conversation.extra as { backend?: unknown }).backend;
  if (convBackend) return extraBackend === convBackend;

  return true;
}

export function buildChannelConversationExtra(args: {
  platform: PluginType;
  backend: string;
  customAgentId?: string;
  agentName?: string;
}): {
  backend?: AcpBackend;
  customAgentId?: string;
  agentName?: string;
  enabledSkills?: string[];
} {
  const enabledSkills = getChannelEnabledSkills(args.platform);

  if (
    args.backend === 'gemini' ||
    args.backend === 'aionrs' ||
    args.backend === 'codex' ||
    args.backend === 'openclaw-gateway'
  ) {
    return enabledSkills ? { enabledSkills } : {};
  }

  return {
    backend: args.backend as AcpBackend,
    customAgentId: args.customAgentId,
    agentName: args.agentName,
    ...(enabledSkills ? { enabledSkills } : {}),
  };
}
