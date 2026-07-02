/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { JARVIS_COLORS, withAlpha } from './theme';

const HERMES_DOCS_URL = 'https://hermes-agent.nousresearch.com';

/**
 * First-run guide shown when the Hermes CLI is not detected. Replaces the old
 * bare "HERMES OFFLINE" label with actionable steps: install the CLI, enable
 * its voice toolset, allow the mic — plus a re-scan that re-runs detection
 * without leaving the page.
 */
interface SetupGuideProps {
  /** Re-run Hermes detection (voicePipeline.recheck). */
  onRescan: () => void;
  /** True while a re-scan is in flight (pipeline status === 'checking'). */
  scanning: boolean;
  /** True when at least one scan already came back empty. */
  scannedEmpty: boolean;
}

const Step: React.FC<{ index: number; title: string; body: string; command?: string; link?: { href: string; label: string } }> = ({ index, title, body, command, link }) => (
  <div className='flex gap-12px'>
    <span
      className='mt-2px h-20px w-20px shrink-0 rounded-full text-center font-mono text-10px font-700 leading-20px'
      style={{ border: `1px solid ${withAlpha(JARVIS_COLORS.cyan, 0.5)}`, color: '#7fdfff' }}
    >
      {index}
    </span>
    <div className='flex min-w-0 flex-col gap-6px'>
      <span className='font-mono text-11px font-600 tracking-[0.12em] text-[#d6f6ff]'>{title}</span>
      <p className='font-mono text-10px leading-relaxed tracking-[0.03em] text-[#7fdfff]/70'>{body}</p>
      {command && (
        <code className='w-fit select-text rounded-6px border border-[#00e5ff]/25 bg-[#00e5ff]/6 px-10px py-6px font-mono text-10px tracking-[0.06em] text-[#18ffff]'>{command}</code>
      )}
      {link && (
        <a href={link.href} target='_blank' rel='noreferrer' className='w-fit font-mono text-10px tracking-[0.08em] text-[#18ffff] underline underline-offset-3px hover:text-[#d6f6ff]'>
          {link.label} ↗
        </a>
      )}
    </div>
  </div>
);

const SetupGuide: React.FC<SetupGuideProps> = ({ onRescan, scanning, scannedEmpty }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className='pointer-events-auto w-460px max-w-[88vw] rounded-14px border border-[#00e5ff]/30 bg-[#03060f]/92 px-24px py-22px shadow-[0_0_60px_rgba(0,229,255,0.12)] backdrop-blur-md'>
      <h2 className='font-mono text-13px font-700 tracking-[0.24em] text-[#d6f6ff]'>{t('jarvis.setup.title').toUpperCase()}</h2>
      <p className='mt-8px font-mono text-10px leading-relaxed tracking-[0.04em] text-[#7fdfff]/75'>{t('jarvis.setup.intro')}</p>

      <div className='mt-18px flex flex-col gap-16px'>
        <Step index={1} title={t('jarvis.setup.step1Title')} body={t('jarvis.setup.step1Body')} command='hermes' link={{ href: HERMES_DOCS_URL, label: t('jarvis.setup.step1Docs') }} />
        <Step index={2} title={t('jarvis.setup.step2Title')} body={t('jarvis.setup.step2Body')} command='hermes tools enable tts' />
        <Step index={3} title={t('jarvis.setup.step3Title')} body={t('jarvis.setup.step3Body')} />
      </div>

      {scannedEmpty && !scanning && <p className='mt-14px font-mono text-9px tracking-[0.08em] text-[#ffb547]/80'>{t('jarvis.setup.stillOffline')}</p>}

      <div className='mt-16px flex items-center gap-10px'>
        <button
          type='button'
          disabled={scanning}
          onClick={onRescan}
          className='rounded-8px border px-14px py-9px font-mono text-10px font-700 tracking-[0.18em] transition-all'
          style={{
            cursor: scanning ? 'wait' : 'pointer',
            borderColor: withAlpha(JARVIS_COLORS.cyan, 0.6),
            background: withAlpha(JARVIS_COLORS.cyan, 0.12),
            color: JARVIS_COLORS.cyanBright,
          }}
        >
          {(scanning ? t('jarvis.setup.rescanning') : t('jarvis.setup.rescan')).toUpperCase()}
        </button>
        <button
          type='button'
          onClick={() => navigate('/settings/agent')}
          className='rounded-8px border px-14px py-9px font-mono text-10px font-600 tracking-[0.18em] transition-all'
          style={{
            cursor: 'pointer',
            borderColor: withAlpha(JARVIS_COLORS.cyan, 0.3),
            background: 'transparent',
            color: '#7fdfff',
          }}
        >
          {t('jarvis.setup.openAgentSettings').toUpperCase()}
        </button>
      </div>
    </div>
  );
};

export default SetupGuide;
