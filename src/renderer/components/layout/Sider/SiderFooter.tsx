/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { ArrowCircleLeft, CloseOne, Help, Moon, SettingTwo, SunOne } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { openExternalUrl } from '@renderer/utils/platform';

interface SiderFooterProps {
  isMobile: boolean;
  isSettings: boolean;
  collapsed?: boolean;
  theme: string;
  siderTooltipProps: SiderTooltipProps;
  onSettingsClick: () => void;
  onThemeToggle: () => void;
  showLogout?: boolean;
  onLogoutClick?: () => void;
}

const SiderFooter: React.FC<SiderFooterProps> = ({
  isMobile,
  isSettings,
  collapsed = false,
  theme,
  siderTooltipProps,
  onSettingsClick,
  onThemeToggle,
  showLogout = false,
  onLogoutClick,
}) => {
  const { t } = useTranslation();

  const openHelpLink = () => {
    openExternalUrl('https://www.skool.com/claude').catch((error) => {
      console.error('Failed to open help link:', error);
    });
  };

  const showThemeToggle = isSettings && !collapsed;
  const themeTooltip = theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode');
  const settingsLabel = isSettings ? t('common.back') : t('common.settings');

  const renderFooterAction = ({
    label,
    icon,
    onClick,
    active = false,
    iconOnly = false,
  }: {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    active?: boolean;
    iconOnly?: boolean;
  }) => (
    <Tooltip {...siderTooltipProps} content={label} position='right'>
      <button
        type='button'
        onClick={onClick}
        title={label}
        aria-label={label}
        className={classNames(
          'h-40px min-w-0 border-none bg-transparent flex items-center rd-10px cursor-pointer transition-colors',
          'text-t-primary outline-none',
          iconOnly ? 'w-full justify-center px-0' : 'w-full justify-start gap-8px px-10px',
          isMobile && 'sider-footer-btn-mobile',
          active
            ? 'bg-[rgba(var(--primary-6),0.12)] text-primary shadow-[inset_0_0_0_1px_rgba(var(--primary-6),0.08)]'
            : 'hover:bg-[rgba(var(--primary-6),0.12)] active:bg-fill-2'
        )}
      >
        <span className='w-24px h-24px flex items-center justify-center shrink-0 leading-none'>{icon}</span>
        {!iconOnly && <span className='min-w-0 flex-1 truncate text-left text-13px font-medium leading-20px'>{label}</span>}
      </button>
    </Tooltip>
  );

  const secondaryActions = [
    {
      key: 'help',
      label: t('settings.help'),
      icon: <Help theme='outline' size='18' fill='currentColor' className='block leading-none' style={{ lineHeight: 0 }} />,
      onClick: openHelpLink,
      iconOnly: collapsed,
    },
    ...(showLogout && onLogoutClick
      ? [
          {
            key: 'logout',
            label: t('settings.googleLogout'),
            icon: (
              <CloseOne
                theme='outline'
                size='18'
                fill='currentColor'
                className='block leading-none'
                style={{ lineHeight: 0 }}
              />
            ),
            onClick: onLogoutClick,
            iconOnly: collapsed,
          },
        ]
      : []),
    ...(showThemeToggle
      ? [
          {
            key: 'theme',
            label: themeTooltip,
            icon:
              theme === 'dark' ? (
                <SunOne theme='outline' size='18' fill='currentColor' className='block leading-none' style={{ lineHeight: 0 }} />
              ) : (
                <Moon theme='outline' size='18' fill='currentColor' className='block leading-none' style={{ lineHeight: 0 }} />
              ),
            onClick: onThemeToggle,
            iconOnly: true,
          },
        ]
      : []),
  ];

  return (
    <div className='shrink-0 sider-footer mt-auto pt-4px pb-8px'>
      <div className={classNames('flex flex-col', collapsed ? 'gap-2px' : 'gap-6px px-6px')}>
        {renderFooterAction({
          label: settingsLabel,
          icon: isSettings ? (
            <ArrowCircleLeft theme='outline' size='18' fill='currentColor' className='block leading-none' style={{ lineHeight: 0 }} />
          ) : (
            <SettingTwo theme='outline' size='18' fill='currentColor' className='block leading-none' style={{ lineHeight: 0 }} />
          ),
          onClick: onSettingsClick,
          active: isSettings,
          iconOnly: collapsed,
        })}
        {secondaryActions.length > 0 && (
          <div
            className={classNames(
              'grid gap-6px',
              collapsed
                ? 'grid-cols-1'
                : secondaryActions.length === 3
                  ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px]'
                  : secondaryActions.length === 2 && secondaryActions[1]?.iconOnly
                    ? 'grid-cols-[minmax(0,1fr)_40px]'
                    : secondaryActions.length === 2
                      ? 'grid-cols-2'
                    : 'grid-cols-1'
            )}
          >
            {secondaryActions.map((action) => (
              <div key={action.key} className='min-w-0'>
                {renderFooterAction(action)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SiderFooter;
