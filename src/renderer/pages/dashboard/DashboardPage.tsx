import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button, Empty, Message, Spin, Tag, Tooltip } from '@arco-design/web-react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlarmClock,
  Calendar,
  CheckOne,
  DashboardOne,
  LinkOut,
  ListCheckbox,
  Mail,
  MagicWand,
  Memory,
  Refresh,
  Tips,
} from '@icon-park/react';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type {
  DashboardAction,
  DashboardAutomationIdea,
  DashboardActivityOverview,
  DashboardCustomWidgetSpec,
  DashboardFocusItem,
  DashboardHermesChannel,
  DashboardHermesControlCenter,
  DashboardHermesItemStatus,
  DashboardHermesMcpApp,
  DashboardInsight,
  DashboardRelevantLink,
  DashboardSnapshot,
  DashboardSourceId,
  DashboardSourceState,
  DashboardSourceStatus,
  DashboardWidgetLayout,
  DashboardWorkItem,
} from '@/common/types/dashboard';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';

function formatDateTime(value?: number): string {
  if (!value) {
    return '-';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
}

function tagColorForPriority(priority: DashboardAction['priority']): string {
  if (priority === 'high') return 'red';
  if (priority === 'medium') return 'orange';
  return 'gray';
}

function tagColorForSource(state: DashboardSourceState): string {
  if (state === 'connected') return 'green';
  if (state === 'degraded') return 'orange';
  if (state === 'checking') return 'blue';
  return 'gray';
}

function tagColorForHermesStatus(status: DashboardHermesItemStatus): string {
  if (status === 'connected') return 'green';
  if (status === 'ready') return 'blue';
  if (status === 'blocked') return 'red';
  return 'orange';
}

function iconForSource(sourceId: DashboardSourceId): React.ReactNode {
  const iconProps = { theme: 'outline' as const, size: 18, fill: 'currentColor' };
  if (sourceId === 'honcho') return <Memory {...iconProps} />;
  if (sourceId === 'scheduled_tasks') return <AlarmClock {...iconProps} />;
  if (sourceId === 'agent_manager') return <DashboardOne {...iconProps} />;
  if (sourceId === 'mcp') return <LinkOut {...iconProps} />;
  if (sourceId === 'channels') return <ListCheckbox {...iconProps} />;
  if (sourceId === 'manual_context') return <MagicWand {...iconProps} />;
  if (sourceId === 'email') return <Mail {...iconProps} />;
  if (sourceId === 'calendar') return <Calendar {...iconProps} />;
  return <ListCheckbox {...iconProps} />;
}

function withUiTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Dashboard load timed out. Try a hard refresh or restart the app.')), timeoutMs);
    }),
  ]);
}

const DEFAULT_CONTEXT_PROMPT =
  "Use Honcho as Sam's source of truth, but prioritize these current focus lanes: 1) prepare the webinar until Monday, May 18, 2026, 2) build the AI operating systems course video, 3) make Agent Club demo-ready as the resource I can show people. Rebuild into three concrete next moves and what an agent can take off my plate.";

let dashboardSnapshotCache: DashboardSnapshot | null = null;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(() => dashboardSnapshotCache);
  const [loading, setLoading] = useState(() => !dashboardSnapshotCache);
  const [loadingSlow, setLoadingSlow] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextInput, setContextInput] = useState(DEFAULT_CONTEXT_PROMPT);
  const [savingLayout, setSavingLayout] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(
    'Show me a revenue dashboard from connected MCPs and connectors, but label anything unconnected as setup required.'
  );
  const layoutRef = useRef<DashboardWidgetLayout[]>([]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const rememberSnapshot = useCallback((next: DashboardSnapshot) => {
    dashboardSnapshotCache = next;
    setSnapshot(next);
  }, []);

  const loadSnapshot = useCallback(async () => {
    const hasCachedSnapshot = Boolean(dashboardSnapshotCache);
    if (!hasCachedSnapshot) {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const next = await withUiTimeout(ipcBridge.dashboard.getSnapshot.invoke({ reason: 'initial' }), 18000);
      rememberSnapshot(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      if (!hasCachedSnapshot) {
        Message.error(`Dashboard failed to load: ${message}`);
      } else {
        console.warn('[Dashboard] Cached dashboard stayed visible after load failure:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [rememberSnapshot]);

  useEffect(() => {
    void loadSnapshot();
    const unsubscribe = ipcBridge.dashboard.snapshotUpdated.on((next) => {
      rememberSnapshot(next);
    });
    return () => unsubscribe();
  }, [loadSnapshot, rememberSnapshot]);

  useEffect(() => {
    if (!loading || snapshot) {
      setLoadingSlow(false);
      return;
    }
    const timeout = window.setTimeout(() => setLoadingSlow(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [loading, snapshot]);

  const sourceMap = useMemo(() => {
    const map = new Map<DashboardSourceId, DashboardSourceStatus>();
    snapshot?.sources.forEach((source) => map.set(source.id, source));
    return map;
  }, [snapshot]);

  const visibleWidgets = useMemo(() => snapshot?.widgetLayout.filter((widget) => !widget.hidden) || [], [snapshot]);
  const hiddenWidgets = useMemo(() => snapshot?.widgetLayout.filter((widget) => widget.hidden) || [], [snapshot]);

  useEffect(() => {
    if (snapshot) {
      layoutRef.current = snapshot.widgetLayout;
    }
  }, [snapshot]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await ipcBridge.dashboard.runHeartbeat.invoke();
      rememberSnapshot(next);
      Message.success('Dashboard refreshed');
    } catch (error) {
      Message.error(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleHardRefresh = useCallback(async () => {
    setHardRefreshing(true);
    setLoadError(null);
    try {
      const next = await withUiTimeout(ipcBridge.dashboard.hardRefresh.invoke({}), 20000);
      rememberSnapshot(next);
      setLoading(false);
      Message.success('Dashboard hard refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLoadError(message);
      Message.error(`Hard refresh failed: ${message}`);
    } finally {
      setHardRefreshing(false);
    }
  }, [rememberSnapshot]);

  const handleContextSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const context = contextInput.trim();
      if (!context) {
        Message.warning('Add a little context first.');
        return;
      }

      setThinking(true);
      setLoadError(null);
      try {
        const next = await withUiTimeout(ipcBridge.dashboard.rebuildWithContext.invoke({ context }), 20000);
        rememberSnapshot(next);
        setContextInput(DEFAULT_CONTEXT_PROMPT);
        setContextPanelOpen(false);
        setLoading(false);
        Message.success('Dashboard rebuilt with your context');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLoadError(message);
        Message.error(`Context rebuild failed: ${message}`);
      } finally {
        setThinking(false);
      }
    },
    [contextInput, rememberSnapshot]
  );

  const persistLayout = useCallback(async (nextWidgetLayout: DashboardWidgetLayout[]) => {
    layoutRef.current = nextWidgetLayout;
    setSavingLayout(true);
    setSnapshot((current) => {
      const next = current ? { ...current, widgetLayout: nextWidgetLayout } : current;
      dashboardSnapshotCache = next;
      return next;
    });
    try {
      const next = await ipcBridge.dashboard.updateLayout.invoke({ layout: nextWidgetLayout });
      rememberSnapshot(next);
    } catch (error) {
      Message.error(`Layout save failed: ${error instanceof Error ? error.message : String(error)}`);
      void loadSnapshot();
    } finally {
      setSavingLayout(false);
    }
  }, [loadSnapshot, rememberSnapshot]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const currentLayout = layoutRef.current.length ? layoutRef.current : snapshot?.widgetLayout || [];
      if (!currentLayout.length || !event.over || event.active.id === event.over.id) {
        return;
      }

      const currentVisible = currentLayout.filter((widget) => !widget.hidden);
      const oldIndex = currentVisible.findIndex((widget) => widget.id === event.active.id);
      const newIndex = currentVisible.findIndex((widget) => widget.id === event.over?.id);
      if (oldIndex < 0 || newIndex < 0) {
        return;
      }

      const reorderedVisible = arrayMove(currentVisible, oldIndex, newIndex);
      let visibleIndex = 0;
      const nextLayout = currentLayout.map((widget) => {
        if (widget.hidden) {
          return widget;
        }
        const nextWidget = reorderedVisible[visibleIndex];
        visibleIndex += 1;
        return nextWidget || widget;
      });

      void persistLayout(nextLayout);
    },
    [persistLayout, snapshot]
  );

  const setWidgetHidden = useCallback(
    (widgetId: string, hidden: boolean) => {
      const currentLayout = layoutRef.current.length ? layoutRef.current : snapshot?.widgetLayout || [];
      if (!currentLayout.length) {
        return;
      }
      void persistLayout(
        currentLayout.map((widget) => (widget.id === widgetId ? Object.assign({}, widget, { hidden }) : widget))
      );
    },
    [persistLayout, snapshot]
  );

  const showAllWidgets = useCallback(() => {
    const currentLayout = layoutRef.current.length ? layoutRef.current : snapshot?.widgetLayout || [];
    if (!currentLayout.length) {
      return;
    }
    void persistLayout(currentLayout.map((widget) => Object.assign({}, widget, { hidden: false })));
  }, [persistLayout, snapshot]);

  const handleCustomWidgetSubmit = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault();
      const prompt = customPrompt.trim();
      if (!prompt) {
        Message.warning('Describe the widget you want first.');
        return;
      }

      setCustomizing(true);
      try {
        const next = await ipcBridge.dashboard.createCustomWidget.invoke({ prompt });
        rememberSnapshot(next);
        Message.success('Custom dashboard widget added');
      } catch (error) {
        Message.error(`Widget creation failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setCustomizing(false);
      }
    },
    [customPrompt, rememberSnapshot]
  );

  const revealContextPanel = useCallback(() => {
    setContextPanelOpen(true);
    window.setTimeout(() => {
      document.getElementById('dashboard-manual-context')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 0);
  }, []);

  const handleAction = useCallback(
    async (item: DashboardAction) => {
      if (item.id === 'hard-refresh-dashboard') {
        await handleHardRefresh();
        return;
      }
      if (item.action.kind === 'refresh') {
        await handleRefresh();
        return;
      }
      if (item.action.route) {
        navigate(item.action.route);
        return;
      }
      const result = await ipcBridge.dashboard.applyAction.invoke({ actionId: item.id });
      if (result.route) {
        navigate(result.route);
      }
      if (result.snapshot) {
        rememberSnapshot(result.snapshot);
      }
      if (result.message) {
        (result.success ? Message.success : Message.warning)(result.message);
      }
    },
    [handleHardRefresh, handleRefresh, navigate, rememberSnapshot]
  );

  const handleRelevantLink = useCallback(
    (link: DashboardRelevantLink) => {
      if (link.route) {
        navigate(link.route);
        return;
      }
      if (link.url) {
        void ipcBridge.shell.openExternal.invoke(link.url);
      }
    },
    [navigate]
  );

  const navigateMaybe = useCallback(
    (route?: string) => {
      if (route) navigate(route);
    },
    [navigate]
  );

  const renderWidget = useCallback(
    (widget: DashboardWidgetLayout) => {
      if (!snapshot) {
        return null;
      }

      if (widget.kind === 'metrics') {
        return (
          <div className='grid grid-cols-1 gap-10px sm:grid-cols-2 xl:grid-cols-4'>
            <MetricCard label='Tasks Done' value={snapshot.metrics.completedTasksTotal.toLocaleString()} detail='Completed tickets' />
            <MetricCard label='Queued Tasks' value={snapshot.metrics.queuedTasksTotal.toLocaleString()} detail='Scheduled and open work' />
            <MetricCard
              label='Next Scheduled'
              value={snapshot.metrics.nextScheduledTask ? formatDateTime(snapshot.metrics.nextScheduledTask.nextRunAtMs) : '-'}
              detail={snapshot.metrics.nextScheduledTask?.name || 'No queued task'}
              route={snapshot.metrics.nextScheduledTask?.route}
              onNavigate={navigateMaybe}
            />
            <MetricCard
              label='Time Saved'
              value={formatMinutes(snapshot.metrics.estimatedMinutesSaved)}
              detail='Estimate from AIOS work'
            />
          </div>
        );
      }

      if (widget.kind === 'focus') {
        return (
          <div className='grid grid-cols-1 gap-8px md:grid-cols-3'>
            {snapshot.focusItems.map((item) => (
              <FocusItem key={item.id} item={item} sourceMap={sourceMap} />
            ))}
          </div>
        );
      }

      if (widget.kind === 'hermes_control') {
        return snapshot.hermesControl ? (
          <HermesControlCenter data={snapshot.hermesControl} onNavigate={navigateMaybe} />
        ) : (
          <Empty description='Hermes control data will appear after a hard refresh' />
        );
      }

      if (widget.kind === 'activity') {
        return <ActivityOverview activity={snapshot.activity} />;
      }

      if (widget.kind === 'brief_sources') {
        return (
          <section className='grid grid-cols-1 items-start gap-10px'>
            <div className='self-start rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
              <div className='mb-7px flex items-center gap-6px text-t-secondary text-12px font-600 uppercase'>
                <Tips theme='outline' size='16' fill='currentColor' />
                <span>Today&apos;s Brief</span>
              </div>
              <h2 className='m-0 text-16px font-700 leading-22px text-t-primary'>{snapshot.summary.title}</h2>
              <p className='m-0 mt-6px text-13px leading-19px text-t-secondary'>{snapshot.summary.nextBestMove}</p>
            </div>
            <div className='self-start rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
              <SectionHeader title='Source Health' />
              <div className='mt-8px grid grid-cols-1 gap-6px min-[1180px]:grid-cols-2'>
                {snapshot.sources.map((source) => (
                  <SourceRow key={source.id} source={source} onNavigate={navigateMaybe} />
                ))}
              </div>
            </div>
          </section>
        );
      }

      if (widget.kind === 'actions') {
        return snapshot.actions.length ? (
          <div className='flex flex-col gap-10px'>
            {snapshot.actions.map((action) => (
              <ActionItem key={action.id} action={action} sourceMap={sourceMap} onAction={handleAction} />
            ))}
          </div>
        ) : (
          <Empty description='No urgent actions surfaced yet' />
        );
      }

      if (widget.kind === 'active_work') {
        return snapshot.activeWork.length ? (
          <div className='grid grid-cols-1 gap-10px'>
            {snapshot.activeWork.map((item) => (
              <WorkItem key={item.id} item={item} onNavigate={navigateMaybe} />
            ))}
          </div>
        ) : (
          <Empty description='No active local work visible yet' />
        );
      }

      if (widget.kind === 'relevant_links') {
        return <RelevantLinks links={snapshot.relevantLinks} sourceMap={sourceMap} onOpen={handleRelevantLink} />;
      }

      if (widget.kind === 'insights') {
        return (
          <div className='grid grid-cols-1 gap-10px'>
            {snapshot.insights.map((insight) => (
              <InsightItem key={insight.id} insight={insight} sourceMap={sourceMap} />
            ))}
          </div>
        );
      }

      if (widget.kind === 'automations') {
        return (
          <div className='grid grid-cols-1 gap-10px md:grid-cols-3'>
            {snapshot.automationIdeas.map((idea) => (
              <AutomationIdeaItem key={idea.id} idea={idea} onNavigate={navigateMaybe} />
            ))}
          </div>
        );
      }

      if (widget.kind === 'custom_lab') {
        return (
          <CustomWidgetLab
            prompt={customPrompt}
            loading={customizing}
            onPromptChange={setCustomPrompt}
            onSubmit={handleCustomWidgetSubmit}
          />
        );
      }

      if (widget.kind === 'manual_context') {
        return (
          <ManualContextPanel
            contextInput={contextInput}
            contextPanelOpen={contextPanelOpen}
            morningRefresh={snapshot.morningRefresh}
            thinking={thinking}
            onContextInputChange={setContextInput}
            onContextPanelOpenChange={setContextPanelOpen}
            onSubmit={handleContextSubmit}
          />
        );
      }

      if (widget.kind === 'custom') {
        const spec = snapshot.customWidgets.find((item) => item.id === widget.id);
        return spec ? <CustomWidgetCard spec={spec} sourceMap={sourceMap} /> : null;
      }

      return null;
    },
    [
      contextInput,
      contextPanelOpen,
      customPrompt,
      customizing,
      handleAction,
      handleContextSubmit,
      handleCustomWidgetSubmit,
      handleRelevantLink,
      navigateMaybe,
      snapshot,
      sourceMap,
      thinking,
    ]
  );

  if (loading && !snapshot) {
    return (
      <div className='size-full flex items-center justify-center bg-1 px-24px text-t-secondary'>
        <div className='flex max-w-460px flex-col items-center gap-14px text-center'>
          <Spin size={28} />
          <div className='text-14px leading-22px'>
            {loadingSlow ? 'Dashboard is still waiting on the app bridge.' : 'Loading your dashboard...'}
          </div>
          {loadingSlow ? (
            <div className='flex flex-wrap justify-center gap-8px'>
              <Button type='primary' loading={hardRefreshing} onClick={handleHardRefresh}>
                Hard refresh
              </Button>
              <Button type='outline' onClick={() => window.location.reload()}>
                Reload page
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className='size-full flex items-center justify-center bg-1 px-24px'>
        <div className='max-w-520px rounded-12px border border-solid border-[var(--color-border-2)] bg-fill-1 p-18px text-center'>
          <Empty description='Dashboard is not available yet' />
          {loadError ? <p className='m-0 mt-8px text-13px leading-20px text-t-secondary'>{loadError}</p> : null}
          <div className='mt-14px flex flex-wrap justify-center gap-8px'>
            <Button type='primary' loading={hardRefreshing} onClick={handleHardRefresh}>
              Hard refresh
            </Button>
            <Button type='outline' onClick={loadSnapshot}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={classNames(
        'w-full min-h-full box-border overflow-y-auto bg-1',
        isMobile ? 'px-14px py-12px' : 'px-16px py-18px md:px-24px md:py-22px'
      )}
    >
      <div className='mx-auto flex w-full max-w-[1760px] flex-col gap-12px'>
        <div className='flex items-start justify-between gap-12px max-[780px]:flex-col'>
          <div className='min-w-0'>
            <div className='mb-6px flex items-center gap-8px text-primary text-13px font-600 leading-20px'>
              <DashboardOne theme='outline' size='18' fill='currentColor' />
              <span>Hermes Chief of Staff</span>
            </div>
            <h1 className='m-0 text-25px font-700 leading-[1.15] text-t-primary max-[520px]:text-22px'>Dashboard</h1>
            <p className='m-0 mt-6px max-w-900px text-13px leading-20px text-t-secondary'>{snapshot.summary.brief}</p>
          </div>
          <div className='flex shrink-0 flex-wrap items-center justify-end gap-8px max-[780px]:justify-start'>
            <Tooltip content={`Last refreshed ${formatDateTime(snapshot.generatedAt)}`}>
              <Tag color='blue'>{snapshot.summary.confidence} confidence</Tag>
            </Tooltip>
            <Button
              type='outline'
              shape='round'
              icon={<Calendar theme='outline' size={14} fill='currentColor' />}
              onClick={() => navigate('/dashboard/month-map')}
            >
              Month Map
            </Button>
            <Button
              type='primary'
              shape='round'
              icon={<Refresh theme='outline' size={14} />}
              loading={refreshing}
              onClick={handleRefresh}
            >
              Refresh
            </Button>
            <Button
              type='outline'
              shape='round'
              icon={<Refresh theme='outline' size={14} />}
              loading={hardRefreshing}
              onClick={handleHardRefresh}
            >
              Hard refresh
            </Button>
            <Button
              size='small'
              type='outline'
              shape='round'
              icon={<MagicWand theme='outline' size={14} />}
              onClick={revealContextPanel}
            >
              Add context
            </Button>
          </div>
        </div>

        <WidgetControls
          hiddenWidgets={hiddenWidgets}
          saving={savingLayout}
          visibleCount={visibleWidgets.length}
          onShowAll={showAllWidgets}
          onShowWidget={(widgetId) => setWidgetHidden(widgetId, false)}
        />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleWidgets.map((widget) => widget.id)} strategy={rectSortingStrategy}>
            <section className='grid grid-cols-1 items-start gap-12px md:grid-cols-6 xl:grid-cols-12'>
              {visibleWidgets.map((widget) => (
                <SortableDashboardWidget
                  key={widget.id}
                  widget={widget}
                  onHide={() => setWidgetHidden(widget.id, true)}
                >
                  {renderWidget(widget)}
                </SortableDashboardWidget>
              ))}
            </section>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  route?: string;
  onNavigate?: (route?: string) => void;
}

function widgetSizeClass(size: DashboardWidgetLayout['size']): string {
  if (size === 'third') return 'md:col-span-3 xl:col-span-4';
  if (size === 'half') return 'md:col-span-3 xl:col-span-6';
  if (size === 'wide') return 'md:col-span-6 xl:col-span-8';
  return 'md:col-span-6 xl:col-span-12';
}

const WidgetControls: React.FC<{
  hiddenWidgets: DashboardWidgetLayout[];
  saving: boolean;
  visibleCount: number;
  onShowAll: () => void;
  onShowWidget: (widgetId: string) => void;
}> = ({ hiddenWidgets, saving, visibleCount, onShowAll, onShowWidget }) => (
  <section className='sticky top-0 z-2 rounded-10px border border-solid border-[var(--color-border-2)] bg-1/95 px-12px py-9px shadow-[0_1px_0_rgba(0,0,0,0.03)] backdrop-blur'>
    <div className='flex flex-wrap items-center justify-between gap-8px'>
      <div className='flex min-w-0 flex-wrap items-center gap-6px'>
        <span className='text-13px font-700 leading-20px text-t-primary'>Widget controls</span>
        <Tag>{visibleCount} visible</Tag>
        <Tag color={hiddenWidgets.length ? 'orange' : 'green'}>{hiddenWidgets.length} hidden</Tag>
      </div>
      <div className='flex flex-wrap items-center justify-end gap-6px'>
        {hiddenWidgets.map((widget) => (
          <Button key={widget.id} size='mini' type='outline' onClick={() => onShowWidget(widget.id)}>
            Show {widget.title}
          </Button>
        ))}
        <Button size='mini' type='outline' disabled={!hiddenWidgets.length} loading={saving} onClick={onShowAll}>
          Show all
        </Button>
      </div>
    </div>
  </section>
);

const SortableDashboardWidget: React.FC<{
  widget: DashboardWidgetLayout;
  onHide: () => void;
  children: React.ReactNode;
}> = ({ widget, onHide, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 3 : undefined,
  };

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={classNames(
        'min-w-0',
        'self-start',
        widgetSizeClass(widget.size),
        isDragging ? 'opacity-85' : 'opacity-100'
      )}
    >
      <div className='rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 p-12px shadow-[0_1px_0_rgba(0,0,0,0.02)]'>
        <div className='mb-10px flex items-center justify-between gap-8px'>
          <div className='min-w-0'>
            <h2 className='m-0 truncate text-15px font-700 leading-22px text-t-primary'>{widget.title}</h2>
            {widget.kind === 'custom' ? (
              <div className='mt-2px text-11px leading-16px text-t-secondary'>Dashboard-only custom widget</div>
            ) : null}
          </div>
          <div className='flex shrink-0 items-center gap-6px'>
            <button
              type='button'
              className='h-24px rounded-6px border border-solid border-[var(--color-border-2)] bg-1 px-7px text-12px leading-18px text-t-secondary cursor-grab active:cursor-grabbing'
              aria-label={`Drag ${widget.title}`}
              {...attributes}
              {...listeners}
            >
              Drag
            </button>
            <Button size='mini' type='text' onClick={onHide}>
              Hide
            </Button>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
};

const MetricCard: React.FC<MetricCardProps> = ({ label, value, detail, route, onNavigate }) => (
  <button
    type='button'
    className={classNames(
      'min-h-74px rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 p-10px text-left transition-colors',
      route ? 'cursor-pointer hover:border-[var(--color-border-3)]' : 'cursor-default'
    )}
    onClick={() => onNavigate?.(route)}
  >
    <div className='text-11px font-600 uppercase leading-16px text-t-secondary'>{label}</div>
    <div className='mt-5px min-w-0 break-words text-19px font-700 leading-24px text-t-primary'>{value}</div>
    <div className='mt-3px min-w-0 break-words text-12px leading-17px text-t-secondary'>{detail}</div>
  </button>
);

const HermesControlCenter: React.FC<{
  data: DashboardHermesControlCenter;
  onNavigate: (route?: string) => void;
}> = ({ data, onNavigate }) => (
  <div className='grid grid-cols-1 gap-10px xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.9fr)]'>
    <div className='min-w-0'>
      <div className='mb-8px flex flex-wrap items-start justify-between gap-8px'>
        <div className='min-w-0'>
          <div className='text-13px font-700 leading-19px text-t-primary'>{data.title}</div>
          <div className='mt-2px max-w-760px text-12px leading-17px text-t-secondary'>{data.subtitle}</div>
        </div>
        <Button size='small' type='primary' onClick={() => onNavigate(data.primaryCtaRoute)}>
          {data.primaryCtaLabel}
        </Button>
      </div>
      <div className='-mx-2px flex max-h-284px gap-8px overflow-x-auto px-2px pb-2px'>
        {data.mcpApps.map((app) => (
          <HermesMcpAppCard key={app.id} app={app} onNavigate={onNavigate} />
        ))}
      </div>
    </div>

    <div className='grid min-w-0 grid-cols-1 gap-10px md:grid-cols-2 xl:grid-cols-1'>
      <div className='rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
        <div className='mb-8px flex items-center justify-between gap-8px'>
          <div className='text-13px font-700 leading-19px text-t-primary'>Hermes channels</div>
          <Tag>Hermes only</Tag>
        </div>
        <div className='grid grid-cols-1 gap-7px'>
          {data.channels.map((channel) => (
            <HermesChannelRow key={channel.id} channel={channel} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
      <HermesScheduledWorkPanel data={data} onNavigate={onNavigate} />
    </div>
  </div>
);

const HermesMcpAppCard: React.FC<{
  app: DashboardHermesMcpApp;
  onNavigate: (route?: string) => void;
}> = ({ app, onNavigate }) => (
  <button
    type='button'
    className='w-236px shrink-0 rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px text-left transition-colors hover:border-[var(--color-border-3)]'
    onClick={() => onNavigate(app.route)}
  >
    <div className='flex items-start justify-between gap-8px'>
      <div className='min-w-0'>
        <div className='truncate text-13px font-700 leading-19px text-t-primary'>{app.title}</div>
        <div className='mt-3px text-11px leading-16px text-t-secondary'>{app.authLabel}</div>
      </div>
      <Tag color={tagColorForHermesStatus(app.status)}>{app.status === 'setup_required' ? 'setup' : app.status}</Tag>
    </div>
    <p className='m-0 mt-7px h-50px overflow-hidden text-12px leading-17px text-t-secondary'>{app.description}</p>
    <div className='mt-8px grid grid-cols-2 gap-6px'>
      <div className='rounded-7px bg-fill-2 px-7px py-5px'>
        <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>Tools</div>
        <div className='text-15px font-700 leading-20px text-t-primary'>{app.toolCount}</div>
      </div>
      <div className='rounded-7px bg-fill-2 px-7px py-5px'>
        <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>Triggers</div>
        <div className='text-15px font-700 leading-20px text-t-primary'>{app.triggerCount}</div>
      </div>
    </div>
    <div className='mt-8px flex items-center justify-between gap-8px'>
      <div className='flex min-w-0 flex-wrap gap-4px'>
        {app.tags.slice(0, 2).map((tag) => (
          <span key={tag} className='rounded-6px bg-fill-2 px-6px py-2px text-10px leading-14px text-t-secondary'>
            {tag}
          </span>
        ))}
      </div>
      <span className='shrink-0 text-11px font-600 leading-16px text-primary'>{app.ctaLabel}</span>
    </div>
  </button>
);

const HermesChannelRow: React.FC<{
  channel: DashboardHermesChannel;
  onNavigate: (route?: string) => void;
}> = ({ channel, onNavigate }) => (
  <button
    type='button'
    className='w-full rounded-8px bg-fill-2 px-9px py-8px text-left transition-colors hover:bg-fill-3'
    onClick={() => onNavigate(channel.route)}
  >
    <div className='flex items-start justify-between gap-8px'>
      <div className='min-w-0'>
        <div className='truncate text-12px font-700 leading-18px text-t-primary'>{channel.title}</div>
        <div className='mt-2px text-11px leading-16px text-t-secondary'>{channel.description}</div>
      </div>
      <Tag color={tagColorForHermesStatus(channel.status)}>
        {channel.status === 'setup_required' ? 'setup' : channel.status}
      </Tag>
    </div>
    <div className='mt-6px line-clamp-2 text-11px leading-16px text-t-secondary'>{channel.detail}</div>
  </button>
);

const HermesScheduledWorkPanel: React.FC<{
  data: DashboardHermesControlCenter;
  onNavigate: (route?: string) => void;
}> = ({ data, onNavigate }) => (
  <div className='rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
    <div className='mb-8px flex items-center justify-between gap-8px'>
      <div className='text-13px font-700 leading-19px text-t-primary'>Hermes scheduled work</div>
      <Button size='mini' type='outline' onClick={() => onNavigate('/scheduled')}>
        Scheduled Tasks
      </Button>
    </div>
    <div className='grid grid-cols-2 gap-6px'>
      <div className='rounded-7px bg-fill-2 px-8px py-6px'>
        <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>Hermes</div>
        <div className='text-16px font-700 leading-21px text-t-primary'>{data.scheduledWork.hermesScheduledTasks}</div>
      </div>
      <div className='rounded-7px bg-fill-2 px-8px py-6px'>
        <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>All Tasks</div>
        <div className='text-16px font-700 leading-21px text-t-primary'>{data.scheduledWork.totalScheduledTasks}</div>
      </div>
    </div>
    <p className='m-0 mt-7px text-11px leading-16px text-t-secondary'>{data.scheduledWork.detail}</p>
    {data.scheduledWork.items.length ? (
      <div className='mt-8px grid grid-cols-1 gap-6px'>
        {data.scheduledWork.items.map((item) => (
          <button
            key={item.id}
            type='button'
            className='rounded-7px bg-fill-2 px-8px py-6px text-left transition-colors hover:bg-fill-3'
            onClick={() => onNavigate(item.route)}
          >
            <div className='truncate text-12px font-700 leading-17px text-t-primary'>{item.name}</div>
            <div className='mt-2px truncate text-11px leading-16px text-t-secondary'>
              {item.nextRunAtMs ? `Next ${formatDateTime(item.nextRunAtMs)}` : item.description || 'Manual trigger'}
            </div>
          </button>
        ))}
      </div>
    ) : null}
  </div>
);

const ActivityOverview: React.FC<{ activity: DashboardActivityOverview }> = ({ activity }) => {
  const primaryStats = activity.stats.slice(0, 4);
  const secondaryStats = activity.stats.slice(4);

  return (
    <div>
      <div className='mb-7px flex flex-wrap items-center justify-between gap-6px'>
        <div>
          <div className='text-10px font-600 uppercase leading-14px text-t-secondary'>{activity.rangeLabel}</div>
          <div className='text-14px font-700 leading-19px text-t-primary'>{activity.title}</div>
        </div>
        <div className='flex rounded-7px bg-fill-2 p-2px text-10px leading-14px text-t-secondary'>
          <span className='rounded-5px bg-1 px-6px py-2px text-t-primary'>Overview</span>
          <span className='px-6px py-2px'>Sources</span>
        </div>
      </div>
      <div className='grid grid-cols-4 gap-4px'>
        {primaryStats.map((stat) => (
          <div key={stat.label} className='min-h-38px rounded-7px bg-fill-2 p-5px'>
            <div className='truncate text-9px font-600 uppercase leading-12px text-t-secondary'>{stat.label}</div>
            <div className='mt-2px truncate text-14px font-700 leading-18px text-t-primary'>{stat.value}</div>
          </div>
        ))}
      </div>
      <div className='mt-6px flex flex-wrap gap-x-8px gap-y-2px text-10px leading-14px text-t-secondary'>
        {secondaryStats.map((stat) => (
          <span key={stat.label} className='whitespace-nowrap'>
            {stat.label}: <strong className='font-700 text-t-primary'>{stat.value}</strong>
          </span>
        ))}
      </div>
      <div
        className='mt-8px grid w-max max-w-full auto-cols-[7px] grid-flow-col grid-rows-7 gap-2px overflow-x-auto pb-1'
        aria-label='Dashboard activity heatmap'
      >
        {activity.days.map((day) => (
          <Tooltip key={day.date} content={day.label}>
            <div
              className='h-7px w-7px rounded-2px'
              style={{ backgroundColor: activityColor(day.intensity) }}
            />
          </Tooltip>
        ))}
      </div>
      <div className='mt-6px max-h-30px overflow-hidden text-10px leading-14px text-t-secondary'>{activity.footnote}</div>
    </div>
  );
};

function activityColor(intensity: DashboardActivityOverview['days'][number]['intensity']): string {
  if (intensity === 4) return '#2f6bd3';
  if (intensity === 3) return '#5f8fe4';
  if (intensity === 2) return '#8fb1ec';
  if (intensity === 1) return '#bdd0f4';
  return 'var(--color-fill-2)';
}

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className='flex items-center justify-between gap-10px'>
    <h2 className='m-0 text-15px font-700 leading-22px text-t-primary'>{title}</h2>
  </div>
);

const FocusItem: React.FC<{
  item: DashboardFocusItem;
  sourceMap: Map<DashboardSourceId, DashboardSourceStatus>;
}> = ({ item, sourceMap }) => (
  <div className='rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
    <div className='flex flex-wrap items-center gap-5px'>
      <Tag color={tagColorForPriority(item.priority)}>{item.horizon}</Tag>
      <Tag>{item.priority}</Tag>
    </div>
    <h3 className='m-0 mt-8px text-14px font-700 leading-20px text-t-primary'>{item.title}</h3>
    <p className='m-0 mt-5px text-12px leading-18px text-t-secondary'>{item.description}</p>
    <div className='mt-8px rounded-7px bg-fill-2 px-8px py-6px text-12px leading-17px text-t-primary'>
      {item.nextStep}
    </div>
    <SourceChips sourceIds={item.sourceIds} sourceMap={sourceMap} />
  </div>
);

const SourceRow: React.FC<{ source: DashboardSourceStatus; onNavigate: (route?: string) => void }> = ({
  source,
  onNavigate,
}) => (
  <div className='grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-7px rounded-7px bg-fill-2 px-8px py-6px'>
    <span className='text-t-secondary'>{iconForSource(source.id)}</span>
    <div className='min-w-0'>
      <div className='truncate text-12px font-600 leading-18px text-t-primary'>{source.label}</div>
      <div className='truncate text-11px leading-16px text-t-secondary'>{source.detail}</div>
    </div>
    <button
      type='button'
      className={classNames('border-0 bg-transparent p-0', source.setupRoute ? 'cursor-pointer' : 'cursor-default')}
      onClick={() => onNavigate(source.setupRoute)}
    >
      <Tag color={tagColorForSource(source.state)}>{source.state}</Tag>
    </button>
  </div>
);

const ActionItem: React.FC<{
  action: DashboardAction;
  sourceMap: Map<DashboardSourceId, DashboardSourceStatus>;
  onAction: (action: DashboardAction) => void;
}> = ({ action, sourceMap, onAction }) => (
  <div className='rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
    <div className='flex items-start justify-between gap-8px'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-5px'>
          <span className='text-13px font-700 leading-19px text-t-primary'>{action.title}</span>
          <Tag color={tagColorForPriority(action.priority)}>{action.priority}</Tag>
        </div>
        <p className='m-0 mt-5px text-12px leading-18px text-t-secondary'>{action.description}</p>
        <SourceChips sourceIds={action.sourceIds} sourceMap={sourceMap} />
      </div>
      <Button size='small' type='outline' onClick={() => onAction(action)}>
        {action.ctaLabel}
      </Button>
    </div>
  </div>
);

const WorkItem: React.FC<{ item: DashboardWorkItem; onNavigate: (route?: string) => void }> = ({
  item,
  onNavigate,
}) => (
  <button
    type='button'
    className={classNames(
      'w-full rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px text-left transition-colors',
      item.route ? 'cursor-pointer hover:border-[var(--color-border-3)]' : 'cursor-default'
    )}
    onClick={() => onNavigate(item.route)}
  >
    <div className='flex items-start justify-between gap-8px'>
      <div className='min-w-0'>
        <div className='text-13px font-700 leading-19px text-t-primary'>{item.title}</div>
        <div className='mt-5px text-12px leading-18px text-t-secondary'>{item.description}</div>
        <div className='mt-7px flex items-center gap-6px text-11px leading-16px text-t-secondary'>
          {iconForSource(item.sourceId)}
          <span>{item.sourceLabel}</span>
          {item.updatedAt ? <span>{formatDateTime(item.updatedAt)}</span> : null}
        </div>
      </div>
      <Tag>{item.status}</Tag>
    </div>
  </button>
);

const RelevantLinks: React.FC<{
  links: DashboardRelevantLink[];
  sourceMap: Map<DashboardSourceId, DashboardSourceStatus>;
  onOpen: (link: DashboardRelevantLink) => void;
}> = ({ links, sourceMap, onOpen }) =>
  links.length ? (
    <div className='grid grid-cols-1 gap-8px'>
      {links.map((link) => (
        <button
          key={link.id}
          type='button'
          className='w-full rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px text-left transition-colors hover:border-[var(--color-border-3)]'
          onClick={() => onOpen(link)}
        >
          <div className='flex items-start justify-between gap-8px'>
            <div className='min-w-0'>
              <div className='flex flex-wrap items-center gap-5px'>
                <span className='text-13px font-700 leading-19px text-t-primary'>{link.title}</span>
                <Tag color={tagColorForPriority(link.priority)}>{link.priority}</Tag>
                <Tag color={link.status === 'ready' ? 'green' : 'orange'}>
                  {link.status === 'ready' ? 'ready' : 'setup'}
                </Tag>
              </div>
              <p className='m-0 mt-5px text-12px leading-18px text-t-secondary'>{link.description}</p>
              <div className='mt-7px rounded-7px bg-fill-2 px-8px py-5px text-11px leading-16px text-t-secondary'>
                {link.reason}
              </div>
              <SourceChips sourceIds={link.sourceIds} sourceMap={sourceMap} />
            </div>
            <span className='inline-flex shrink-0 items-center gap-4px text-12px leading-17px text-primary'>
              {link.ctaLabel}
              <LinkOut theme='outline' size='12' fill='currentColor' />
            </span>
          </div>
        </button>
      ))}
    </div>
  ) : (
    <Empty description='No relevant links yet' />
  );

const InsightItem: React.FC<{
  insight: DashboardInsight;
  sourceMap: Map<DashboardSourceId, DashboardSourceStatus>;
}> = ({ insight, sourceMap }) => (
  <div className='rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px'>
    <div className='flex items-center gap-7px'>
      <CheckOne theme='outline' size='16' fill='currentColor' className='text-primary' />
      <div className='min-w-0 text-13px font-700 leading-19px text-t-primary'>{insight.title}</div>
    </div>
    <p className='m-0 mt-6px text-12px leading-18px text-t-secondary'>{insight.body}</p>
    <SourceChips sourceIds={insight.sourceIds} sourceMap={sourceMap} />
  </div>
);

const AutomationIdeaItem: React.FC<{
  idea: DashboardAutomationIdea;
  onNavigate: (route?: string) => void;
}> = ({ idea, onNavigate }) => (
  <button
    type='button'
    className='min-h-126px rounded-8px border border-solid border-[var(--color-border-2)] bg-1 p-10px text-left transition-colors hover:border-[var(--color-border-3)]'
    onClick={() => onNavigate(idea.route)}
  >
    <div className='mb-8px flex h-24px w-24px items-center justify-center rounded-7px bg-fill-2 text-primary'>
      <MagicWand theme='outline' size='16' fill='currentColor' />
    </div>
    <div className='text-13px font-700 leading-19px text-t-primary'>{idea.title}</div>
    <p className='m-0 mt-6px text-12px leading-18px text-t-secondary'>{idea.description}</p>
    <div className='mt-9px flex items-center justify-between gap-8px text-11px leading-16px text-t-secondary'>
      <span>{formatMinutes(idea.estimatedMinutesSaved)} est.</span>
      <span className='inline-flex items-center gap-4px text-primary'>
        {idea.ctaLabel}
        <LinkOut theme='outline' size='12' fill='currentColor' />
      </span>
    </div>
  </button>
);

const CustomWidgetLab: React.FC<{
  prompt: string;
  loading: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: (event?: React.FormEvent) => void;
}> = ({ prompt, loading, onPromptChange, onSubmit }) => (
  <div>
    <div className='rounded-8px bg-fill-2 px-10px py-8px text-12px leading-18px text-t-secondary'>
      Build dashboard-only widgets from safe specs. This does not execute arbitrary code; it creates a widget that can later be wired to
      MCPs/connectors and labels unconnected data honestly.
    </div>
    <form className='mt-10px grid grid-cols-[minmax(0,1fr)_auto] gap-8px max-[720px]:grid-cols-1' onSubmit={onSubmit}>
      <textarea
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        rows={3}
        className='box-border min-h-68px w-full resize-none rounded-8px border border-solid border-[var(--color-border-2)] bg-1 px-10px py-8px text-12px leading-18px text-t-primary outline-none transition-colors placeholder:text-t-tertiary focus:border-primary'
      />
      <Button type='primary' htmlType='submit' loading={loading}>
        Build
      </Button>
    </form>
  </div>
);

const CustomWidgetCard: React.FC<{
  spec: DashboardCustomWidgetSpec;
  sourceMap: Map<DashboardSourceId, DashboardSourceStatus>;
}> = ({ spec, sourceMap }) => (
  <div>
    <div className='flex flex-wrap items-center gap-5px'>
      <Tag color={spec.status === 'live' ? 'green' : spec.status === 'preview' ? 'blue' : 'orange'}>{spec.status}</Tag>
      <Tag>safe spec</Tag>
    </div>
    <p className='m-0 mt-6px text-12px leading-18px text-t-secondary'>{spec.summary}</p>
    <div className='mt-10px grid grid-cols-1 gap-8px md:grid-cols-3'>
      {spec.metrics.map((metric) => (
        <div key={`${spec.id}-${metric.label}`} className='rounded-8px bg-fill-2 p-8px'>
          <div className='truncate text-11px font-600 uppercase leading-16px text-t-secondary'>{metric.label}</div>
          <div className='mt-3px truncate text-17px font-700 leading-22px text-t-primary'>{metric.value}</div>
          <div className='mt-3px text-11px leading-16px text-t-secondary'>{metric.detail}</div>
        </div>
      ))}
    </div>
    <div className='mt-8px rounded-7px border border-solid border-[var(--color-border-2)] bg-1 px-8px py-6px text-11px leading-16px text-t-secondary'>
      Prompt: {spec.prompt}
    </div>
    <SourceChips sourceIds={spec.sourceIds} sourceMap={sourceMap} />
  </div>
);

const ManualContextPanel: React.FC<{
  contextInput: string;
  contextPanelOpen: boolean;
  morningRefresh: DashboardSnapshot['morningRefresh'];
  thinking: boolean;
  onContextInputChange: (value: string) => void;
  onContextPanelOpenChange: (value: boolean | ((value: boolean) => boolean)) => void;
  onSubmit: (event?: React.FormEvent) => void;
}> = ({
  contextInput,
  contextPanelOpen,
  morningRefresh,
  thinking,
  onContextInputChange,
  onContextPanelOpenChange,
  onSubmit,
}) => (
  <div id='dashboard-manual-context'>
    <div className='flex items-center justify-between gap-10px max-[620px]:flex-col max-[620px]:items-start'>
      <div className='min-w-0'>
        <div className='flex items-center gap-7px text-13px font-700 leading-20px text-t-primary'>
          <MagicWand theme='outline' size='18' fill='currentColor' />
          <span>Manual reorientation</span>
        </div>
        <div className='mt-3px text-12px leading-17px text-t-secondary'>
          Optional override. The dashboard defaults to Honcho memory first.
        </div>
      </div>
      <div className='flex items-center gap-8px'>
        <Tag color={morningRefresh.enabled ? 'green' : 'gray'}>{morningRefresh.label}</Tag>
        <Button size='small' type='outline' onClick={() => onContextPanelOpenChange((value) => !value)}>
          {contextPanelOpen ? 'Hide' : 'Add context'}
        </Button>
      </div>
    </div>
    {contextPanelOpen ? (
      <form className='mt-10px grid grid-cols-[minmax(0,1fr)_auto] gap-8px max-[720px]:grid-cols-1' onSubmit={onSubmit}>
        <textarea
          value={contextInput}
          onChange={(event) => onContextInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          rows={3}
          className='box-border min-h-68px w-full resize-none rounded-8px border border-solid border-[var(--color-border-2)] bg-1 px-10px py-8px text-12px leading-18px text-t-primary outline-none transition-colors placeholder:text-t-tertiary focus:border-primary'
        />
        <Button type='primary' htmlType='submit' loading={thinking}>
          Think
        </Button>
      </form>
    ) : null}
    {morningRefresh.nextRunAtMs ? (
      <div className='mt-7px text-11px leading-16px text-t-secondary'>
        Next automatic dashboard refresh: {formatDateTime(morningRefresh.nextRunAtMs)}
      </div>
    ) : null}
  </div>
);

const SourceChips: React.FC<{
  sourceIds: DashboardSourceId[];
  sourceMap: Map<DashboardSourceId, DashboardSourceStatus>;
}> = ({ sourceIds, sourceMap }) => (
  <div className='mt-8px flex flex-wrap gap-5px'>
    {sourceIds.map((sourceId) => {
      const source = sourceMap.get(sourceId);
      return (
        <span
          key={sourceId}
          className='inline-flex items-center gap-4px rounded-6px bg-fill-2 px-6px py-2px text-11px leading-16px text-t-secondary'
        >
          {iconForSource(sourceId)}
          <span>{source?.label || sourceId}</span>
        </span>
      );
    })}
  </div>
);

export default DashboardPage;
