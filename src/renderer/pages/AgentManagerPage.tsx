import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spin, Tag, Tooltip } from '@arco-design/web-react';
import { LinkOut, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { ipcBridge } from '@/common';
import {
  AGENT_MANAGER_BOOT_PATH,
  AGENT_MANAGER_DEFAULT_WORKSPACE_PATH,
  AGENT_MANAGER_NAME,
  AGENT_MANAGER_WORKSPACE_SLUG,
} from '@/common/config/appBrand';
import type { AgentManagerStatus } from '@/common/types/agentManager';

const initialStatus: AgentManagerStatus = {
  state: 'starting',
  url: 'http://localhost:3330',
  backendUrl: 'http://localhost:18330',
  message: `Starting ${AGENT_MANAGER_NAME}`,
  updatedAt: Date.now(),
};

function joinUrl(baseUrl: string, pathName: string): string {
  return `${baseUrl.replace(/\/$/, '')}${pathName}`;
}

function normalizeNextPath(value: string | null): string {
  if (!value || !value.startsWith(`/${AGENT_MANAGER_WORKSPACE_SLUG}/`)) {
    return AGENT_MANAGER_DEFAULT_WORKSPACE_PATH;
  }
  return value;
}

function buildBootUrl(frontendUrl: string, nextPath: string): string {
  const params = new URLSearchParams({ next: nextPath });
  return `${joinUrl(frontendUrl, AGENT_MANAGER_BOOT_PATH)}?${params.toString()}`;
}

function buildWorkspaceUrl(frontendUrl: string, nextPath: string): string {
  return joinUrl(frontendUrl, nextPath);
}

const AgentManagerPage: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [status, setStatus] = useState<AgentManagerStatus>(initialStatus);
  const [frameKey, setFrameKey] = useState(0);
  const [frameUrl, setFrameUrl] = useState(initialStatus.url);
  const [sessionReady, setSessionReady] = useState(false);
  const readyFrontendUrlRef = useRef<string | null>(null);
  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeNextPath(params.get('next'));
  }, [location.search]);

  useEffect(() => {
    let mounted = true;
    ipcBridge.agentManager.getStatus
      .invoke()
      .then((nextStatus) => {
        if (mounted) {
          setStatus(nextStatus);
        }
      })
      .catch((error) => {
        console.error(`Failed to read ${AGENT_MANAGER_NAME} status:`, error);
      });

    const unsubscribe = ipcBridge.agentManager.statusChanged.on((nextStatus) => {
      setStatus(nextStatus);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status.state === 'ready') {
      if (readyFrontendUrlRef.current !== status.url) {
        readyFrontendUrlRef.current = status.url;
        setSessionReady(false);
        setFrameKey((current) => current + 1);
      }

      setFrameUrl(sessionReady ? buildWorkspaceUrl(status.url, nextPath) : buildBootUrl(status.url, nextPath));
      return;
    }

    readyFrontendUrlRef.current = null;
    setSessionReady(false);
    setFrameUrl(status.url);
  }, [nextPath, sessionReady, status.state, status.url]);

  const prewarm = status.prewarm;
  const isWarming = status.state === 'ready' && prewarm?.state === 'warming';
  const hasWarmFailures = status.state === 'ready' && prewarm?.state === 'error' && Boolean(prewarm.failed);
  const prewarmPercent =
    prewarm && prewarm.total > 0 ? Math.max(0, Math.min(100, (prewarm.completed / prewarm.total) * 100)) : 0;

  const tagColor = useMemo(() => {
    if (isWarming) return 'blue';
    if (hasWarmFailures) return 'orange';
    if (status.state === 'ready') return 'green';
    if (status.state === 'error') return 'red';
    if (status.state === 'disabled') return 'gray';
    return 'blue';
  }, [hasWarmFailures, isWarming, status.state]);

  const statusLabel = useMemo(() => {
    if (isWarming && prewarm) {
      return `Warming ${prewarm.completed}/${prewarm.total}`;
    }
    if (hasWarmFailures && prewarm) {
      return `Warm ${prewarm.completed}/${prewarm.total}`;
    }
    return t(`agentManager.status.${status.state}`);
  }, [hasWarmFailures, isWarming, prewarm, status.state, t]);

  const handleRestart = () => {
    readyFrontendUrlRef.current = null;
    setSessionReady(false);
    setFrameKey((current) => current + 1);
    void ipcBridge.agentManager.restart
      .invoke()
      .then(setStatus)
      .catch((error) => {
        console.error(`Failed to restart ${AGENT_MANAGER_NAME}:`, error);
      });
  };

  const handleFrameLoad = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const href = event.currentTarget.contentWindow?.location.href || '';
      if (href && !href.includes(AGENT_MANAGER_BOOT_PATH)) {
        setSessionReady(true);
      }
    } catch {
      setSessionReady(true);
    }
  };

  const handleOpenExternal = () => {
    const url = status.state === 'ready' ? buildBootUrl(status.url, nextPath) : status.url;
    void ipcBridge.shell.openExternal.invoke(url).catch((error) => {
      console.error(`Failed to open ${AGENT_MANAGER_NAME} externally:`, error);
    });
  };

  return (
    <div className='size-full min-h-0 flex flex-col bg-1'>
      <div className='h-46px shrink-0 flex items-center gap-10px px-14px border-b border-solid border-[var(--color-border-2)]'>
        <div className='text-15px font-600 text-t-primary min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap'>
          {AGENT_MANAGER_NAME}
        </div>
        {isWarming && prewarm?.currentLabel ? (
          <div className='hidden md:flex min-w-0 flex-1 items-center justify-end gap-8px text-12px text-t-secondary'>
            <span className='truncate'>Warming {prewarm.currentLabel}</span>
            <div className='h-4px w-120px overflow-hidden rd-999px bg-fill-3'>
              <div className='h-full bg-primary transition-all' style={{ width: `${prewarmPercent}%` }} />
            </div>
          </div>
        ) : null}
        <Tag color={tagColor}>{statusLabel}</Tag>
        <Tooltip content={t('common.refresh')}>
          <Button type='text' size='small' icon={<Refresh theme='outline' size='18' />} onClick={handleRestart} />
        </Tooltip>
        <Tooltip content={t('agentManager.openExternal')}>
          <Button type='text' size='small' icon={<LinkOut theme='outline' size='18' />} onClick={handleOpenExternal} />
        </Tooltip>
      </div>
      {status.state === 'error' ? (
        <div className='flex-1 min-h-0 flex items-center justify-center px-24px'>
          <div className='max-w-620px w-full border border-solid border-[var(--color-border-2)] rd-8px p-18px bg-2'>
            <div className='text-16px font-600 text-t-primary mb-8px'>{t('agentManager.startFailed')}</div>
            <div className='text-13px text-t-secondary whitespace-pre-wrap'>{status.detail || status.message}</div>
          </div>
        </div>
      ) : status.state !== 'ready' ? (
        <div className='flex-1 min-h-0 flex items-center justify-center gap-12px text-t-secondary'>
          <Spin size={24} />
          <span className='text-13px'>{t('agentManager.starting')}</span>
        </div>
      ) : (
        <iframe
          key={frameKey}
          title={AGENT_MANAGER_NAME}
          src={frameUrl}
          className='flex-1 min-h-0 w-full border-0 bg-1'
          allow='clipboard-read; clipboard-write; fullscreen'
          onLoad={handleFrameLoad}
        />
      )}
    </div>
  );
};

export default AgentManagerPage;
