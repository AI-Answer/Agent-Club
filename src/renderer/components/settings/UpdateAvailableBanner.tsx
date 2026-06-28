/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';
import { Button } from '@arco-design/web-react';
import { Download } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { openUpdateModal, useAppUpdateStatus } from '@/renderer/hooks/system/useAppUpdateStatus';
import { isElectronDesktop } from '@/renderer/utils/platform';

interface UpdateAvailableBannerProps {
  className?: string;
}

const UpdateAvailableBanner: React.FC<UpdateAvailableBannerProps> = ({ className }) => {
  const { t } = useTranslation();
  const { updateAvailable, latestVersion } = useAppUpdateStatus();

  if (!isElectronDesktop() || !updateAvailable) {
    return null;
  }

  const versionLabel = latestVersion ? `v${latestVersion}` : null;

  return (
    <div
      className={classNames(
        'flex flex-wrap items-center justify-between gap-12px rounded-12px border border-solid',
        'border-[rgba(var(--primary-6),0.22)] bg-[rgba(var(--primary-6),0.08)] px-16px py-14px',
        className
      )}
    >
      <div className='flex min-w-0 items-start gap-12px'>
        <div
          className='mt-2px flex h-36px w-36px shrink-0 items-center justify-center rounded-10px bg-[rgba(var(--primary-6),0.14)] text-primary'
        >
          <Download theme='outline' size='18' fill='currentColor' />
        </div>
        <div className='min-w-0'>
          <div className='text-14px font-600 leading-20px text-t-primary'>
            {versionLabel ? t('update.updateAvailableButton', { version: latestVersion }) : t('update.availableTitle')}
          </div>
          <p className='m-0 mt-4px text-13px leading-20px text-t-secondary'>{t('update.dashboardBannerDesc')}</p>
        </div>
      </div>
      <Button type='primary' shape='round' className='shrink-0' onClick={openUpdateModal}>
        {t('update.viewUpdateButton')}
      </Button>
    </div>
  );
};

export default UpdateAvailableBanner;
