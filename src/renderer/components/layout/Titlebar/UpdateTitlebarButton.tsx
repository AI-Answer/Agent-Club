/**
 * @license
 * Copyright 2025 Agent Club (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import classNames from 'classnames';
import { Download } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { openUpdateModal, useAppUpdateStatus } from '@/renderer/hooks/system/useAppUpdateStatus';
import { isElectronDesktop } from '@/renderer/utils/platform';

interface UpdateTitlebarButtonProps {
  iconSize?: number;
  isMobile?: boolean;
}

const UpdateTitlebarButton: React.FC<UpdateTitlebarButtonProps> = ({ iconSize = 18, isMobile = false }) => {
  const { t } = useTranslation();
  const { updateAvailable, latestVersion } = useAppUpdateStatus();

  if (!isElectronDesktop() || !updateAvailable) {
    return null;
  }

  const label = latestVersion
    ? t('update.updateAvailableButton', { version: latestVersion })
    : t('update.availableTitle');

  return (
    <button
      type='button'
      className={classNames(
        'app-titlebar__button app-titlebar__update-button',
        isMobile && 'app-titlebar__button--mobile'
      )}
      onClick={openUpdateModal}
      aria-label={label}
      title={label}
    >
      <Download theme='outline' size={iconSize} fill='currentColor' />
      <span className='app-titlebar__update-label'>{label}</span>
    </button>
  );
};

export default UpdateTitlebarButton;
