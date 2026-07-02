/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { JARVIS_COLORS, withAlpha } from './theme';

/**
 * A small row of starter prompts. Each button sends a real text turn through
 * the shared voice pipeline, so the reply streams into the transcript and
 * speaks exactly like a spoken request. Prompts are generic on purpose — they
 * work on any install, with no assumptions about the user's data.
 */
interface QuickActionsProps {
  /** Forward a prompt to Hermes; returns false when the link is down. */
  onSend: (text: string) => boolean;
  disabled?: boolean;
}

const QuickActions: React.FC<QuickActionsProps> = ({ onSend, disabled }) => {
  const { t } = useTranslation();

  const actions: { label: string; prompt: string }[] = [
    { label: t('jarvis.quick.capabilitiesLabel'), prompt: t('jarvis.quick.capabilitiesPrompt') },
    { label: t('jarvis.quick.briefLabel'), prompt: t('jarvis.quick.briefPrompt') },
    { label: t('jarvis.quick.planLabel'), prompt: t('jarvis.quick.planPrompt') },
  ];

  return (
    <div className='flex flex-col gap-8px rounded-12px border border-[#00e5ff]/20 bg-[#03060f]/60 px-14px py-12px'>
      <span className='font-mono text-9px font-600 tracking-[0.24em] text-[#7fdfff]/70'>{t('jarvis.quick.title').toUpperCase()}</span>
      <div className='flex flex-wrap gap-8px'>
        {actions.map((a) => (
          <button
            key={a.label}
            type='button'
            disabled={disabled}
            onClick={() => onSend(a.prompt)}
            className='rounded-6px border px-10px py-6px font-mono text-9px font-600 tracking-[0.14em] transition-all'
            style={{
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.4 : 1,
              borderColor: withAlpha(JARVIS_COLORS.cyan, 0.35),
              background: withAlpha(JARVIS_COLORS.cyan, 0.05),
              color: '#7fdfff',
            }}
          >
            {a.label.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickActions;
