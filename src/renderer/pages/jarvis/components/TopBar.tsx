/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

// ---------------------------------------------------------------------------
// TopBar — wordmark, live core-mode chip, Hermes link chip, clock, and the
// exit control. Everything it shows is real: the mode derives from the voice
// pipeline and the link chip from actual Hermes detection.
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CoreMode } from './GraphCore';

function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface TopBarProps {
  mode: CoreMode;
  /** Hermes ACP agent detected and the conversation is live. */
  online: boolean;
  /** Leave Jarvis Mode. */
  onExit: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ mode, online, onExit }) => {
  const { t } = useTranslation();
  const now = useClock();
  return (
    <header className='topbar boot-stagger' style={{ animationDelay: '0.05s' }}>
      <div className='wordmark'>
        <span className='name'>JARVIS</span>
        <span className='expansion'>Agent Club</span>
      </div>
      <div className='status-line'>
        <span className={`mode-chip mode-${mode}`}>
          <i className='status-dot' /> {t('jarvis.topBar.core')} · {mode}
        </span>
        <span className={`chip ${online ? 'on' : 'dead'}`}>{online ? t('jarvis.topBar.linkOnline') : t('jarvis.topBar.linkOffline')}</span>
      </div>
      <div className='topbar-right'>
        <button type='button' className='jarvis-exit' onClick={onExit}>
          <span className='jarvis-exit-dot' />
          {t('jarvis.exit')}
        </button>
        <div className='clock-wrap'>
          <div className='clock'>
            {now ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '--:--'}
            <span className='sec'>{now ? `:${String(now.getSeconds()).padStart(2, '0')}` : ''}</span>
          </div>
          <div className='clock-date'>{now ? `${DAYS[now.getDay()]} · ${MONTHS[now.getMonth()]} ${now.getDate()}` : ''}</div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
