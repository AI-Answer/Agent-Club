import React, { useState } from 'react';
import { Button, Tooltip } from '@arco-design/web-react';
import { LinkOut, Refresh } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import { AGENT_MANAGER_NAME } from '@/common/config/appBrand';
import { HOSTED_MULTICA_URL } from '@/common/config/constants';

const AgentManagerPage: React.FC = () => {
  const { t } = useTranslation();
  // Render the HOSTED Multica app immediately. The local Multica stack is no longer
  // spawned at launch, so we must NOT block rendering on its "ready" status.
  const [frameKey, setFrameKey] = useState(0);

  const handleRestart = () => {
    // Just reload the hosted iframe; the local AgentManagerService is no longer the source.
    setFrameKey((current) => current + 1);
  };

  const handleFrameLoad = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    // The hosted URL is cross-origin; reading contentWindow.location will throw.
    // Guard so a SecurityError never bubbles up.
    try {
      void event.currentTarget.contentWindow?.location.href;
    } catch {
      // Expected for cross-origin hosted Multica — nothing to do.
    }
  };

  const handleOpenExternal = () => {
    void ipcBridge.shell.openExternal.invoke(HOSTED_MULTICA_URL).catch((error) => {
      console.error(`Failed to open ${AGENT_MANAGER_NAME} externally:`, error);
    });
  };

  return (
    <div className='size-full min-h-0 flex flex-col bg-1'>
      <div className='h-46px shrink-0 flex items-center gap-10px px-14px border-b border-solid border-[var(--color-border-2)]'>
        <div className='text-15px font-600 text-t-primary min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap'>
          {AGENT_MANAGER_NAME}
        </div>
        <Tooltip content={t('common.refresh')}>
          <Button type='text' size='small' icon={<Refresh theme='outline' size='18' />} onClick={handleRestart} />
        </Tooltip>
        <Tooltip content={t('agentManager.openExternal')}>
          <Button type='text' size='small' icon={<LinkOut theme='outline' size='18' />} onClick={handleOpenExternal} />
        </Tooltip>
      </div>
      <iframe
        key={frameKey}
        title={AGENT_MANAGER_NAME}
        src={HOSTED_MULTICA_URL}
        className='flex-1 min-h-0 w-full border-0 bg-1'
        sandbox='allow-scripts allow-forms allow-same-origin'
        allow='clipboard-read; clipboard-write; fullscreen'
        onLoad={handleFrameLoad}
      />
    </div>
  );
};

export default AgentManagerPage;
