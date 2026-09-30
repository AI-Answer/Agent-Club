/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DEMO-ONLY (hardcoded for a recording session — safe to delete after).
 * Static daily-brief dock panel: channel stats, top-3 focus, today's agenda.
 */

import React from 'react';
import { JARVIS_COLORS, withAlpha } from './theme';

const STATS = [
  { label: 'YOUTUBE SUBS', value: '104,000' },
  { label: 'TOTAL VIEWS', value: '4.2M' },
  { label: 'VIDEOS', value: '476' },
];

const TOP_THREE = ['Webinar — main priority (2–4pm)', 'Check Skool posts', 'Continue filming the JEV course'];

const AGENDA = [
  { time: '12:15', item: 'Skool community — check posts' },
  { time: '2:00', item: 'Webinar — main priority' },
  { time: '4:15', item: 'Film — JEV course (continued)' },
];

const SectionLabel: React.FC<{ text: string }> = ({ text }) => (
  <span className='font-mono text-8px font-600 tracking-[0.22em] text-[#7fdfff]/55'>{text}</span>
);

const DailyBrief: React.FC = () => (
  <div className='flex flex-col gap-9px rounded-12px border border-[#00e5ff]/25 bg-[#00e5ff]/4 px-14px py-12px'>
    <div className='flex items-center justify-between'>
      <span className='font-mono text-10px font-600 tracking-[0.24em] text-[#7fdfff]'>DAILY BRIEF // TODAY</span>
      <span className='font-mono text-8px font-600 tracking-[0.18em]' style={{ color: withAlpha(JARVIS_COLORS.teal, 0.9) }}>
        SYNCED
      </span>
    </div>

    <div className='flex items-stretch justify-between gap-6px'>
      {STATS.map((s) => (
        <div key={s.label} className='flex flex-1 flex-col items-center gap-3px rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-6px py-8px'>
          <span className='font-mono text-13px font-700 tracking-[0.04em]' style={{ color: '#d6f6ff' }}>
            {s.value}
          </span>
          <span className='text-center font-mono text-7px font-600 tracking-[0.14em] text-[#7fdfff]/60'>{s.label}</span>
        </div>
      ))}
    </div>

    <div className='flex flex-col gap-6px rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-10px py-9px'>
      <SectionLabel text='TOP 3 TODAY' />
      {TOP_THREE.map((t, i) => (
        <div key={t} className='flex items-center gap-8px'>
          <span className='font-mono text-9px font-700' style={{ color: JARVIS_COLORS.amber }}>
            {i + 1}
          </span>
          <span className='font-mono text-9px tracking-[0.06em]' style={{ color: withAlpha('#d6f6ff', 0.85) }}>
            {t}
          </span>
        </div>
      ))}
    </div>

    <div className='flex flex-col gap-6px rounded-8px border border-[#00e5ff]/15 bg-[#03060f]/60 px-10px py-9px'>
      <SectionLabel text='AGENDA' />
      {AGENDA.map((a) => (
        <div key={a.time} className='flex items-center justify-between gap-8px'>
          <span className='shrink-0 font-mono text-9px font-600 tracking-[0.1em] text-[#7fdfff]/80'>{a.time}</span>
          <span className='truncate font-mono text-9px tracking-[0.06em]' style={{ color: withAlpha('#d6f6ff', 0.85) }}>
            {a.item}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default DailyBrief;
