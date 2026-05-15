/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IRegisteredAction, ActionHandler } from './types';
import { PlatformActionNames, createSuccessResponse, createErrorResponse } from './types';
import { getPairingService } from '../pairing/PairingService';
import {
  createPairingCodeKeyboard,
  createPairingStatusKeyboard,
  createMainMenuKeyboard,
} from '../plugins/telegram/TelegramKeyboards';
import {
  createPairingCard,
  createPairingStatusCard,
  createMainMenuCard,
  createPairingHelpCard,
} from '../plugins/lark/LarkCards';
import {
  createMainMenuCard as createDingTalkMainMenuCard,
  createPairingCard as createDingTalkPairingCard,
  createPairingStatusCard as createDingTalkPairingStatusCard,
  createPairingHelpCard as createDingTalkPairingHelpCard,
} from '../plugins/dingtalk/DingTalkCards';

/**
 * PlatformActions - Handlers for platform-specific actions
 *
 * Supports both Telegram and Lark platforms with platform-specific UI components.
 * These actions are handled by the plugin itself, not through the Gateway.
 */

// ==================== Platform-specific Markup Helpers ====================

/**
 * Get main menu markup based on platform
 */
function getMainMenuMarkup(platform: string) {
  if (platform === 'lark') {
    return createMainMenuCard();
  }
  if (platform === 'dingtalk') {
    return createDingTalkMainMenuCard();
  }
  return createMainMenuKeyboard();
}

/**
 * Get pairing code markup based on platform
 */
function getPairingCodeMarkup(platform: string, code: string) {
  if (platform === 'lark') {
    return createPairingCard(code);
  }
  if (platform === 'dingtalk') {
    return createDingTalkPairingCard(code);
  }
  return createPairingCodeKeyboard();
}

/**
 * Get pairing status markup based on platform
 */
function getPairingStatusMarkup(platform: string, code: string) {
  if (platform === 'lark') {
    return createPairingStatusCard(code);
  }
  if (platform === 'dingtalk') {
    return createDingTalkPairingStatusCard(code);
  }
  return createPairingStatusKeyboard();
}

/**
 * Get pairing help markup based on platform
 */
function getPairingHelpMarkup(platform: string) {
  if (platform === 'lark') {
    return createPairingHelpCard();
  }
  if (platform === 'dingtalk') {
    return createDingTalkPairingHelpCard();
  }
  return createPairingCodeKeyboard();
}

function getAgentClubChannelSettingsPath(platform: string): string {
  const channelName =
    platform === 'discord'
      ? 'Discord'
      : platform === 'slack'
        ? 'Slack'
        : platform === 'imessage'
          ? 'iMessage'
          : 'the channel';
  return `Agent Club → Settings → Remote → Channels → ${channelName}`;
}

function getHermesPairingBoxTitle(platform: string): string {
  if (platform === 'discord') return 'Pair Discord to Hermes';
  if (platform === 'slack') return 'Pair Slack to Hermes';
  if (platform === 'imessage') return 'Pair iMessage to Hermes';
  return 'Pending Pairing Requests';
}

function shouldUsePlainPairingText(platform: string): boolean {
  return platform === 'discord' || platform === 'slack' || platform === 'imessage';
}

function getErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Handle pairing.show - Show pairing code to user
 * Called when user sends /start or first message
 */
export const handlePairingShow: ActionHandler = async (context) => {
  const pairingService = getPairingService();
  const platform = context.platform;

  // Check if user is already authorized
  if (await pairingService.isUserAuthorized(context.userId, platform)) {
    if (shouldUsePlainPairingText(platform)) {
      return createSuccessResponse({
        type: 'text',
        text: [
          'Authorized',
          '',
          'This account is already paired and ready to use.',
          '',
          'DMs should work directly. In server channels, mention the bot first.',
        ].join('\n'),
        replyMarkup: getMainMenuMarkup(platform),
      });
    }

    return createSuccessResponse({
      type: 'text',
      text: [
        '✅ <b>Authorized</b>',
        '',
        'Your account is already paired and ready to use.',
        '',
        'Send a message to start chatting, or use the buttons below.',
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: getMainMenuMarkup(platform),
    });
  }

  // Generate pairing code
  try {
    const { code, expiresAt } = await pairingService.generatePairingCode(context.userId, platform, context.displayName);

    const expiresInMinutes = Math.ceil((expiresAt - Date.now()) / 1000 / 60);
    const settingsPath = getAgentClubChannelSettingsPath(platform);

    if (shouldUsePlainPairingText(platform)) {
      const pairingBoxTitle = getHermesPairingBoxTitle(platform);
      return createSuccessResponse({
        type: 'text',
        text: [
          'Device pairing',
          '',
          'Approve this account in Agent Club:',
          '',
          `Pairing code: ${code}`,
          `Valid for: ${expiresInMinutes} minutes`,
          '',
          'Where to approve it:',
          `1. Open ${settingsPath}`,
          `2. Find the "${pairingBoxTitle}" approval box`,
          '3. Click Approve next to your name and code',
          '',
          'What to expect after approval:',
          'DMs should work directly. In server channels, mention the bot first; ordinary server chatter is ignored.',
        ].join('\n'),
        replyMarkup: getPairingCodeMarkup(platform, code),
      });
    }

    return createSuccessResponse({
      type: 'text',
      text: [
        '🔗 <b>Device Pairing</b>',
        '',
        'Please approve this pairing request in the Agent Club app:',
        '',
        `<code>${code}</code>`,
        '',
        `⏱ Valid for: ${expiresInMinutes} minutes`,
        '',
        '<b>Steps:</b>',
        '1. Open Agent Club app',
        '2. Go to Settings → Remote → Channels',
        '3. Click "Approve" in pending pairing requests',
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: getPairingCodeMarkup(platform, code),
    });
  } catch (error) {
    return createErrorResponse(`Failed to generate pairing code: ${getErrorText(error)}`);
  }
};

/**
 * Handle pairing.refresh - Refresh pairing code
 */
export const handlePairingRefresh: ActionHandler = async (context) => {
  const pairingService = getPairingService();
  const platform = context.platform;

  // Check if user is already authorized
  if (await pairingService.isUserAuthorized(context.userId, platform)) {
    if (shouldUsePlainPairingText(platform)) {
      return createSuccessResponse({
        type: 'text',
        text: 'You are already paired. No need to refresh the pairing code.',
        replyMarkup: getMainMenuMarkup(platform),
      });
    }

    return createSuccessResponse({
      type: 'text',
      text: '✅ You are already paired. No need to refresh the pairing code.',
      parseMode: 'HTML',
      replyMarkup: getMainMenuMarkup(platform),
    });
  }

  // Generate new pairing code
  try {
    const { code, expiresAt } = await pairingService.refreshPairingCode(context.userId, platform, context.displayName);

    const expiresInMinutes = Math.ceil((expiresAt - Date.now()) / 1000 / 60);
    const settingsPath = getAgentClubChannelSettingsPath(platform);

    if (shouldUsePlainPairingText(platform)) {
      const pairingBoxTitle = getHermesPairingBoxTitle(platform);
      return createSuccessResponse({
        type: 'text',
        text: [
          'New pairing code',
          '',
          `Pairing code: ${code}`,
          `Valid for: ${expiresInMinutes} minutes`,
          '',
          `Open ${settingsPath}`,
          `Then use the "${pairingBoxTitle}" box to approve this request.`,
        ].join('\n'),
        replyMarkup: getPairingCodeMarkup(platform, code),
      });
    }

    return createSuccessResponse({
      type: 'text',
      text: [
        '🔄 <b>New Pairing Code</b>',
        '',
        `<code>${code}</code>`,
        '',
        `⏱ Valid for: ${expiresInMinutes} minutes`,
        '',
        'Please approve this pairing request in Agent Club settings.',
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: getPairingCodeMarkup(platform, code),
    });
  } catch (error) {
    return createErrorResponse(`Failed to refresh pairing code: ${getErrorText(error)}`);
  }
};

/**
 * Handle pairing.check - Check pairing status
 */
export const handlePairingCheck: ActionHandler = async (context) => {
  const pairingService = getPairingService();
  const platform = context.platform;

  // Check if user is already authorized
  if (await pairingService.isUserAuthorized(context.userId, platform)) {
    if (shouldUsePlainPairingText(platform)) {
      return createSuccessResponse({
        type: 'text',
        text: [
          'Pairing successful',
          '',
          'Your account is paired and ready to use.',
          '',
          'Send a DM or mention the bot in a server channel to chat with Hermes.',
        ].join('\n'),
        replyMarkup: getMainMenuMarkup(platform),
      });
    }

    return createSuccessResponse({
      type: 'text',
      text: [
        '✅ <b>Pairing Successful!</b>',
        '',
        'Your account is now paired and ready to use.',
        '',
        'Send a message to chat with the AI assistant.',
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: getMainMenuMarkup(platform),
    });
  }

  // Check for pending request
  const pendingRequest = await pairingService.getPendingRequestForUser(context.userId, platform);

  if (pendingRequest) {
    const expiresInMinutes = Math.ceil((pendingRequest.expiresAt - Date.now()) / 1000 / 60);
    const settingsPath = getAgentClubChannelSettingsPath(platform);

    if (shouldUsePlainPairingText(platform)) {
      const pairingBoxTitle = getHermesPairingBoxTitle(platform);
      return createSuccessResponse({
        type: 'text',
        text: [
          'Waiting for approval',
          '',
          `Pairing code: ${pendingRequest.code}`,
          `Time remaining: ${expiresInMinutes} minutes`,
          '',
          `Open ${settingsPath}`,
          `Then use the "${pairingBoxTitle}" box to approve this request.`,
        ].join('\n'),
        replyMarkup: getPairingStatusMarkup(platform, pendingRequest.code),
      });
    }

    return createSuccessResponse({
      type: 'text',
      text: [
        '⏳ <b>Waiting for Approval</b>',
        '',
        `Pairing code: <code>${pendingRequest.code}</code>`,
        `Time remaining: ${expiresInMinutes} minutes`,
        '',
        'Please approve the pairing request in Agent Club settings.',
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: getPairingStatusMarkup(platform, pendingRequest.code),
    });
  }

  // No pending request - need to generate new code
  return handlePairingShow(context);
};

/**
 * Handle pairing.help - Show pairing help
 */
export const handlePairingHelp: ActionHandler = async (context) => {
  const platform = context.platform;
  const platformName =
    platform === 'lark'
      ? 'Lark/Feishu'
      : platform === 'dingtalk'
        ? 'DingTalk'
        : platform === 'wecom'
          ? 'WeCom'
          : platform === 'discord'
            ? 'Discord'
            : platform === 'slack'
              ? 'Slack'
              : platform === 'imessage'
                ? 'iMessage'
                : 'Telegram';
  const settingsPath = getAgentClubChannelSettingsPath(platform);

  if (shouldUsePlainPairingText(platform)) {
    const pairingBoxTitle = getHermesPairingBoxTitle(platform);
    return createSuccessResponse({
      type: 'text',
      text: [
        'Pairing help',
        '',
        `Pairing links your ${platformName} account with the local Agent Club application.`,
        '',
        'Steps:',
        '1. Send a DM to the bot, or mention it in a server channel',
        '2. Copy the six digit pairing code from the bot reply',
        `3. Open ${settingsPath}`,
        `4. Use the "${pairingBoxTitle}" box to approve the request`,
        '',
        'Notes:',
        'Pairing codes are valid for 10 minutes.',
        'Agent Club must be running.',
        'Server channels require an @mention before Hermes responds.',
      ].join('\n'),
    });
  }

  return createSuccessResponse({
    type: 'text',
    text: [
      '❓ <b>Pairing Help</b>',
      '',
      '<b>What is pairing?</b>',
      `Pairing links your ${platformName} account with the local Agent Club application.`,
      'You need to pair before using the AI assistant.',
      '',
      '<b>Pairing steps:</b>',
      '1. Get pairing code (send any message)',
      '2. Open Agent Club app',
      '3. Go to Settings → Remote → Channels',
      '4. Click "Approve" in pending requests',
      '',
      '<b>FAQ:</b>',
      '• Pairing code valid for 10 minutes, refresh if expired',
      '• Agent Club app must be running',
      '• Ensure network connection is stable',
    ].join('\n'),
    parseMode: 'HTML',
    replyMarkup: getPairingHelpMarkup(platform),
  });
};

/**
 * All platform actions
 */
export const platformActions: IRegisteredAction[] = [
  {
    name: PlatformActionNames.PAIRING_SHOW,
    category: 'platform',
    description: 'Show pairing code',
    handler: handlePairingShow,
  },
  {
    name: PlatformActionNames.PAIRING_REFRESH,
    category: 'platform',
    description: 'Refresh pairing code',
    handler: handlePairingRefresh,
  },
  {
    name: PlatformActionNames.PAIRING_CHECK,
    category: 'platform',
    description: 'Check pairing status',
    handler: handlePairingCheck,
  },
  {
    name: PlatformActionNames.PAIRING_HELP,
    category: 'platform',
    description: 'Show pairing help',
    handler: handlePairingHelp,
  },
];
