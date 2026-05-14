import { Tag, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const hookKeys = ['onInstall', 'onActivate', 'onDeactivate'] as const;

const HooksSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageWrapper contentClassName='max-w-900px'>
      <div className='space-y-16px'>
        <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <div className='flex flex-col gap-8px'>
            <div className='flex items-center gap-8px flex-wrap'>
              <Typography.Title heading={4} className='!m-0 text-t-primary'>
                {t('settings.hooksPage.title')}
              </Typography.Title>
              <Tag color='arcoblue'>{t('settings.hooksPage.status')}</Tag>
            </div>
            <Typography.Text className='text-14px text-t-secondary'>
              {t('settings.hooksPage.description')}
            </Typography.Text>
          </div>
        </section>

        <section className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
          <div className='flex flex-col gap-16px'>
            <div>
              <Typography.Title heading={5} className='!m-0 text-t-primary'>
                {t('settings.hooksPage.lifecycleTitle')}
              </Typography.Title>
              <Typography.Text className='text-13px text-t-secondary'>
                {t('settings.hooksPage.lifecycleDescription')}
              </Typography.Text>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-12px'>
              {hookKeys.map((hookKey) => (
                <div key={hookKey} className='border border-border-2 rd-8px p-14px bg-fill-1 min-w-0'>
                  <div className='text-14px font-medium text-t-primary break-words'>
                    {t(`settings.hooksPage.lifecycle.${hookKey}.title`)}
                  </div>
                  <div className='text-13px text-t-secondary mt-6px leading-20px'>
                    {t(`settings.hooksPage.lifecycle.${hookKey}.description`)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </SettingsPageWrapper>
  );
};

export default HooksSettings;
