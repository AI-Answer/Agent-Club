/**
 * @license
 * Copyright 2025 Agent Club
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, Switch, Message, Empty, Spin, Tooltip } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';
import { useAllCronJobs } from '@renderer/pages/cron/useCronJobs';
import { formatSchedule, formatNextRun } from '@renderer/pages/cron/cronUtils';
import { systemSettings, type ICronJob } from '@/common/adapter/ipcBridge';
import { ACP_BACKENDS_ALL, type AcpBackendAll, type AcpBackendConfig } from '@/common/types/acpTypes';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import CronStatusTag from './CronStatusTag';
import CreateTaskDialog from './CreateTaskDialog';

function normalizeAgentBackend(agent: string | undefined): AcpBackendAll | undefined {
  if (!agent) return undefined;
  return agent.replace(/^cli:/, '').replace(/^preset:/, '') as AcpBackendAll;
}

function getJobAgentMeta(job: ICronJob): { name?: string; logo?: string | null } {
  const backend = job.metadata.agentConfig?.backend || normalizeAgentBackend(job.metadata.agentType);
  if (!backend) return {};

  return {
    name:
      job.metadata.agentConfig?.name ||
      (ACP_BACKENDS_ALL as Record<string, AcpBackendConfig>)[backend]?.name ||
      backend,
    logo: getAgentLogo(backend),
  };
}

function isHermesCronJob(job: ICronJob): boolean {
  const agentConfig = job.metadata.agentConfig;
  const backend = agentConfig?.backend || normalizeAgentBackend(job.metadata.agentType) || '';
  const haystack = [
    backend,
    agentConfig?.name,
    job.name,
    job.description,
    job.metadata.conversationTitle,
    job.target.payload.text,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes('hermes') || haystack.includes('chief of staff') || haystack.includes('chief-of-staff');
}

const ScheduledTasksPage: React.FC = () => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { jobs, loading, pauseJob, resumeJob } = useAllCronJobs();
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'all' | 'hermes'>('all');
  const hermesJobs = useMemo(() => jobs.filter(isHermesCronJob), [jobs]);
  const visibleJobs = taskFilter === 'hermes' ? hermesJobs : jobs;
  const nextHermesJob = useMemo(
    () =>
      hermesJobs
        .filter((job) => job.enabled && job.state.nextRunAtMs)
        .toSorted((a, b) => (a.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER) - (b.state.nextRunAtMs ?? Number.MAX_SAFE_INTEGER))[0],
    [hermesJobs]
  );

  useEffect(() => {
    systemSettings.getKeepAwake
      .invoke()
      .then(setKeepAwake)
      .catch(() => {});
  }, []);

  const handleKeepAwakeChange = useCallback(async (enabled: boolean) => {
    try {
      await systemSettings.setKeepAwake.invoke({ enabled });
      setKeepAwake(enabled);
    } catch (err) {
      Message.error(String(err));
    }
  }, []);

  const handleGoToDetail = useCallback(
    (job: ICronJob) => {
      navigate(`/scheduled/${job.id}`);
    },
    [navigate]
  );

  const handleToggleEnabled = useCallback(
    async (job: ICronJob) => {
      try {
        if (job.enabled) {
          await pauseJob(job.id);
          Message.success(t('cron.pauseSuccess'));
        } else {
          await resumeJob(job.id);
          Message.success(t('cron.resumeSuccess'));
        }
      } catch (err) {
        Message.error(String(err));
      }
    },
    [pauseJob, resumeJob, t]
  );

  return (
    <div
      className={classNames(
        'w-full min-h-full box-border overflow-y-auto',
        isMobile ? 'px-16px py-14px' : 'px-12px py-24px md:px-40px md:py-32px'
      )}
    >
      <div
        className={classNames(
          'mx-auto flex w-full max-w-800px box-border flex-col',
          isMobile ? 'gap-14px' : 'gap-16px'
        )}
      >
        <div className={classNames('flex w-full flex-col', isMobile ? 'gap-6px' : 'gap-8px')}>
          <div className='flex w-full items-start justify-between gap-12px sm:gap-16px max-[520px]:flex-wrap'>
            <h1
              className={classNames(
                'm-0 min-w-0 flex-1 font-bold text-t-primary',
                isMobile ? 'text-24px leading-[1.2]' : 'text-28px leading-[1.15]'
              )}
            >
              {t('cron.scheduledTasks')}
            </h1>
            <Button
              type='primary'
              shape='round'
              className='shrink-0'
              icon={<Plus theme='outline' size={14} />}
              onClick={() => setCreateDialogVisible(true)}
            >
              {t('cron.page.newTask')}
            </Button>
          </div>
          <p
            className={classNames(
              'm-0 w-full text-t-secondary',
              isMobile ? 'text-13px leading-20px' : 'text-14px leading-22px'
            )}
          >
            {t('cron.page.description')}
          </p>
        </div>

        <div className='grid w-full box-border grid-cols-[minmax(0,1fr)_auto] items-center gap-x-12px gap-y-10px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-2 px-14px py-12px sm:rounded-14px sm:px-16px max-[520px]:grid-cols-1'>
          <span
            className={classNames(
              'min-w-0 text-t-primary',
              isMobile ? 'text-12px leading-18px' : 'text-13px leading-20px'
            )}
          >
            {t('cron.page.awakeBanner')}
          </span>
          <div className='justify-self-end max-[520px]:justify-self-start'>
            <Tooltip content={t('cron.page.keepAwakeTooltip')}>
              <div className='flex items-center gap-8px text-t-secondary text-12px leading-18px sm:text-13px'>
                <span>{t('cron.page.keepAwake')}</span>
                <Switch size='small' checked={keepAwake} onChange={handleKeepAwakeChange} />
              </div>
            </Tooltip>
          </div>
        </div>

        <div className='grid w-full box-border grid-cols-[minmax(0,1fr)_auto] items-center gap-x-14px gap-y-12px rounded-14px border border-solid border-[rgba(var(--primary-6),0.16)] bg-[rgba(var(--primary-6),0.045)] px-14px py-12px sm:px-16px max-[620px]:grid-cols-1'>
          <div className='min-w-0'>
            <div className='mb-2px flex flex-wrap items-center gap-8px'>
              <span className='text-13px font-semibold leading-19px text-t-primary'>
                {t('cron.page.hermesScheduledWork', 'Hermes scheduled work')}
              </span>
              <span className='rounded-999px bg-[rgba(var(--primary-6),0.12)] px-8px py-2px text-11px font-medium leading-16px text-[rgb(var(--primary-6))]'>
                {hermesJobs.length} {t('cron.page.hermesTasks', 'Hermes tasks')}
              </span>
            </div>
            <p className='m-0 text-12px leading-18px text-t-secondary'>
              {hermesJobs.length
                ? nextHermesJob
                  ? `${t('cron.nextRun')} ${formatNextRun(nextHermesJob.state.nextRunAtMs)} · ${nextHermesJob.name}`
                  : t('cron.page.hermesTrackedNoNext', 'Hermes jobs are tracked here, with no upcoming enabled run yet.')
                : t(
                    'cron.page.hermesTrackedEmpty',
                    'No Hermes-owned cron jobs yet. When Hermes schedules chief-of-staff work, it will appear in this same Scheduled Tasks list.'
                  )}
            </p>
          </div>
          <div className='flex shrink-0 items-center gap-6px justify-self-end rounded-999px border border-solid border-[var(--color-border-2)] bg-fill-1 p-3px max-[620px]:justify-self-start'>
            <Button size='small' shape='round' type={taskFilter === 'all' ? 'primary' : 'text'} onClick={() => setTaskFilter('all')}>
              {t('common.all', 'All')} {jobs.length}
            </Button>
            <Button
              size='small'
              shape='round'
              type={taskFilter === 'hermes' ? 'primary' : 'text'}
              onClick={() => setTaskFilter('hermes')}
            >
              Hermes {hermesJobs.length}
            </Button>
          </div>
        </div>

        {loading ? (
          <div className='flex min-h-220px items-center justify-center rounded-16px border border-dashed border-border-2 bg-fill-1'>
            <Spin />
          </div>
        ) : visibleJobs.length === 0 ? (
          <div className='flex min-h-220px items-center justify-center rounded-16px border border-dashed border-border-2 bg-fill-1'>
            <Empty
              description={
                taskFilter === 'hermes'
                  ? t('cron.page.noHermesTasks', 'No Hermes scheduled tasks yet')
                  : t('cron.noTasks')
              }
            />
          </div>
        ) : (
          <div
            className={classNames(
              'grid w-full items-start grid-cols-1 gap-12px',
              isMobile ? '' : 'sm:grid-cols-2 lg:grid-cols-3'
            )}
          >
            {visibleJobs.map((job) => {
              const agentMeta = getJobAgentMeta(job);
              const hermesOwned = isHermesCronJob(job);
              const isManualOnly = job.schedule.kind === 'cron' && !job.schedule.expr;
              const executionModeLabel =
                job.target.executionMode === 'new_conversation'
                  ? t('cron.page.form.newConversation')
                  : t('cron.page.form.existingConversation');

              return (
                <div
                  key={job.id}
                  className={classNames(
                    'group flex cursor-pointer flex-col border border-solid border-[var(--color-border-2)] bg-fill-1 transition-colors duration-200 hover:border-[var(--color-border-3)] hover:shadow-sm',
                    isMobile ? 'rounded-12px px-16px py-16px' : 'rounded-12px px-20px py-18px'
                  )}
                  onClick={() => handleGoToDetail(job)}
                >
                  <div className='mb-12px flex items-center justify-between gap-8px'>
                    <span
                      className={classNames(
                        'mr-8px min-w-0 flex-1 font-medium text-t-primary',
                        isMobile ? 'truncate text-14px leading-20px' : 'truncate text-15px leading-22px'
                      )}
                    >
                      {job.name}
                    </span>
                    {hermesOwned ? (
                      <span className='shrink-0 rounded-999px bg-[rgba(var(--primary-6),0.1)] px-7px py-2px text-11px font-medium leading-16px text-[rgb(var(--primary-6))]'>
                        Hermes
                      </span>
                    ) : null}
                    <CronStatusTag job={job} />
                  </div>

                  <div
                    className={classNames(
                      'min-w-0 break-words text-t-secondary',
                      isMobile ? 'text-13px leading-20px' : 'text-14px leading-22px'
                    )}
                    title={formatSchedule(job, t)}
                  >
                    {formatSchedule(job, t)}
                  </div>

                  <div
                    className='mt-16px min-w-0 break-words text-t-secondary text-13px leading-20px'
                    title={job.state.nextRunAtMs ? `${t('cron.nextRun')} ${formatNextRun(job.state.nextRunAtMs)}` : '-'}
                  >
                    {job.state.nextRunAtMs ? `${t('cron.nextRun')} ${formatNextRun(job.state.nextRunAtMs)}` : '-'}
                  </div>

                  <div className='mt-14px flex items-center justify-between gap-10px'>
                    <div className='min-w-0 flex items-center gap-6px text-12px leading-18px text-t-secondary'>
                      {agentMeta.name ? (
                        <Tooltip content={agentMeta.name}>
                          <div className='flex h-16px w-16px shrink-0 items-center justify-center text-t-secondary'>
                            {agentMeta.logo ? (
                              <img
                                src={agentMeta.logo}
                                alt={agentMeta.name}
                                className='h-16px w-16px shrink-0 rounded-50%'
                              />
                            ) : (
                              <span className='flex h-16px w-16px items-center justify-center rounded-50% text-10px font-medium text-t-secondary'>
                                {agentMeta.name.slice(0, 1)}
                              </span>
                            )}
                          </div>
                        </Tooltip>
                      ) : null}
                      <span className='min-w-0 truncate'>{executionModeLabel}</span>
                    </div>

                    <div className='shrink-0' onClick={(e) => e.stopPropagation()}>
                      {!isManualOnly && (
                        <Switch size='small' checked={job.enabled} onChange={() => handleToggleEnabled(job)} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <CreateTaskDialog visible={createDialogVisible} onClose={() => setCreateDialogVisible(false)} />
      </div>
    </div>
  );
};

export default ScheduledTasksPage;
