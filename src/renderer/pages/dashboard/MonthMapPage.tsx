import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button, Empty, Input, Message, Spin, Tooltip } from '@arco-design/web-react';
import { Calendar, CheckSmall, Delete, Left, Refresh, Right, Undo } from '@icon-park/react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ipcBridge } from '@/common';
import type {
  PlannerDayMark,
  PlannerEntry,
  PlannerEntryStatus,
  PlannerMonth,
  PlannerMonthDetailResponse,
  UpdatePlannerDayMarkRequest,
  UpdatePlannerEntryRequest,
} from '@/common/types/planner';
import { useLayoutContext } from '@renderer/hooks/context/LayoutContext';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_MARK_COLORS = ['#fecaca', '#fed7aa', '#fde68a', '#bbf7d0', '#bfdbfe', '#ddd6fe', '#fbcfe8', '#cbd5e1'];
const DAY_SELECTION_HIGHLIGHT_TIMEOUT_MS = 3500;

const STATUS_DOT_COLOR: Record<PlannerEntryStatus, string> = {
  planned: '#94a3b8',
  queued: '#3b82f6',
  working: '#f97316',
  done: '#22c55e',
  blocked: '#ef4444',
  skipped: '#94a3b8',
};

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildMonthCells(year: number, month: number): Array<{ key: string; day: number | null; date: string | null }> {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month, 0).getDate();
  const cells: Array<{ key: string; day: number | null; date: string | null }> = [];

  for (let index = 0; index < offset; index += 1) {
    cells.push({ key: `blank-${index}`, day: null, date: null });
  }
  for (let day = 1; day <= days; day += 1) {
    cells.push({ key: `${year}-${month}-${day}`, day, date: `${year}-${pad(month)}-${pad(day)}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `blank-end-${cells.length}`, day: null, date: null });
  }

  return cells;
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function statusLabel(status: PlannerEntryStatus): string {
  return status.replace(/_/g, ' ');
}

const MONTH_MAP_NAV_SELECTOR = 'input[data-month-map-nav="true"]';

function addDaysToKey(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day + days));
}

function focusMonthMapInput(input: HTMLInputElement | undefined): boolean {
  if (!input) return false;
  input.focus();
  requestAnimationFrame(() => {
    const position = input.value.length;
    input.setSelectionRange(position, position);
  });
  return true;
}

function monthMapNavTargets(date: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(MONTH_MAP_NAV_SELECTOR))
    .filter((input) => input.dataset.monthMapDate === date)
    .toSorted((a, b) => Number(a.dataset.monthMapIndex ?? 0) - Number(b.dataset.monthMapIndex ?? 0));
}

function focusMonthMapDate(date: string, current: HTMLInputElement): boolean {
  const targets = monthMapNavTargets(date);
  if (!targets.length) return false;
  if (current.dataset.monthMapKind === 'add') {
    return focusMonthMapInput(targets.find((input) => input.dataset.monthMapKind === 'add') ?? targets.at(-1));
  }
  const index = Number(current.dataset.monthMapIndex ?? 0);
  return focusMonthMapInput(
    targets.find((input) => Number(input.dataset.monthMapIndex ?? 0) === index) ??
      targets.find((input) => input.dataset.monthMapKind === 'add') ??
      targets.at(-1)
  );
}

function handleMonthMapArrowNavigation(event: React.KeyboardEvent<HTMLInputElement>): boolean {
  const input = event.currentTarget;
  const date = input.dataset.monthMapDate;
  if (!date) return false;

  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    const targets = monthMapNavTargets(date);
    const currentIndex = targets.indexOf(input);
    const next = targets[currentIndex + (event.key === 'ArrowDown' ? 1 : -1)];
    if (focusMonthMapInput(next)) return true;
    return focusMonthMapDate(addDaysToKey(date, event.key === 'ArrowDown' ? 7 : -7), input);
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
  const selectionStart = input.selectionStart ?? 0;
  const selectionEnd = input.selectionEnd ?? 0;
  const atStart = selectionStart === 0 && selectionEnd === 0;
  const atEnd = selectionStart === input.value.length && selectionEnd === input.value.length;
  if ((event.key === 'ArrowLeft' && !atStart) || (event.key === 'ArrowRight' && !atEnd)) return false;

  event.preventDefault();
  return focusMonthMapDate(addDaysToKey(date, event.key === 'ArrowRight' ? 1 : -1), input);
}

const MonthMapPage: React.FC = () => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [detail, setDetail] = useState<PlannerMonthDetailResponse | null>(null);
  const [monthTabs, setMonthTabs] = useState<PlannerMonth[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [objectivesText, setObjectivesText] = useState('');
  const [notesText, setNotesText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set());
  const [dayMarkLabel, setDayMarkLabel] = useState('');
  const [activeDragEntry, setActiveDragEntry] = useState<PlannerEntry | null>(null);
  const [keyboardFocusDate, setKeyboardFocusDate] = useState<string | null>(null);
  const dateSelectionActiveRef = useRef(false);
  const dateSelectionModeRef = useRef<'add' | 'remove'>('add');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadMonth = useCallback(async () => {
    setLoading(true);
    try {
      const [months, nextDetail] = await Promise.all([
        ipcBridge.agentManager.getPlannerMonths.invoke({ year }),
        ipcBridge.agentManager.getPlannerMonth.invoke({ year, month }),
      ]);
      setMonthTabs(months.months);
      setDetail(nextDetail);
      setObjectivesText(nextDetail.month.objectives.join('\n'));
      setNotesText(nextDetail.month.notes.join('\n'));
    } catch (error) {
      Message.error(`Month Map failed to load: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void loadMonth();
  }, [loadMonth]);

  useEffect(() => {
    setSelectedDates(new Set());
    setKeyboardFocusDate(null);
    setDayMarkLabel('');
  }, [month, year]);

  useEffect(() => {
    const stopDateSelection = () => {
      dateSelectionActiveRef.current = false;
    };
    window.addEventListener('pointerup', stopDateSelection);
    window.addEventListener('pointercancel', stopDateSelection);
    window.addEventListener('blur', stopDateSelection);
    return () => {
      window.removeEventListener('pointerup', stopDateSelection);
      window.removeEventListener('pointercancel', stopDateSelection);
      window.removeEventListener('blur', stopDateSelection);
    };
  }, []);

  const cells = useMemo(() => buildMonthCells(year, month), [month, year]);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, PlannerEntry[]>();
    for (const entry of detail?.entries ?? []) {
      const list = map.get(entry.entry_date) ?? [];
      list.push(entry);
      map.set(entry.entry_date, list);
    }
    for (const [key, list] of map) {
      map.set(key, list.toSorted((a, b) => a.position - b.position || a.title.localeCompare(b.title)));
    }
    return map;
  }, [detail?.entries]);

  const dayMarksByDate = useMemo(() => {
    const map = new Map<string, PlannerDayMark>();
    for (const mark of detail?.day_marks ?? []) {
      map.set(mark.mark_date, mark);
    }
    return map;
  }, [detail?.day_marks]);
  const selectedDatesList = useMemo(() => Array.from(selectedDates).sort(), [selectedDates]);
  const monthMeta = useMemo(() => new Map(monthTabs.map((item) => [item.month, item])), [monthTabs]);
  const activeMonth = detail?.month;

  const replaceEntry = useCallback((entry: PlannerEntry) => {
    setDetail((current) => {
      if (!current) return current;
      const exists = current.entries.some((item) => item.id === entry.id);
      return {
        ...current,
        entries: exists ? current.entries.map((item) => (item.id === entry.id ? entry : item)) : [...current.entries, entry],
      };
    });
  }, []);

  const removeEntry = useCallback((id: string) => {
    setDetail((current) => (current ? { ...current, entries: current.entries.filter((entry) => entry.id !== id) } : current));
  }, []);

  const replaceDayMark = useCallback((mark: PlannerDayMark) => {
    setDetail((current) => {
      if (!current) return current;
      const currentMarks = current.day_marks ?? [];
      const exists = currentMarks.some((item) => item.mark_date === mark.mark_date);
      return {
        ...current,
        day_marks: exists
          ? currentMarks.map((item) => (item.mark_date === mark.mark_date ? mark : item))
          : [...currentMarks, mark],
      };
    });
  }, []);

  const removeDayMark = useCallback((date: string) => {
    setDetail((current) =>
      current ? { ...current, day_marks: (current.day_marks ?? []).filter((mark) => mark.mark_date !== date) } : current
    );
  }, []);

  const updateEntry = useCallback(
    async (entry: PlannerEntry, data: UpdatePlannerEntryRequest) => {
      setSavingEntryId(entry.id);
      const optimistic = { ...entry, ...data, updated_at: new Date().toISOString() } as PlannerEntry;
      replaceEntry(optimistic);
      try {
        const next = await ipcBridge.agentManager.updatePlannerEntry.invoke({ id: entry.id, data });
        replaceEntry(next);
      } catch (error) {
        replaceEntry(entry);
        Message.error(`Task update failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setSavingEntryId(null);
      }
    },
    [replaceEntry]
  );

  const addEntry = useCallback(
    async (entryDate: string) => {
      const title = drafts[entryDate]?.trim();
      if (!title) return;
      try {
        const next = await ipcBridge.agentManager.createPlannerEntry.invoke({
          entry_date: entryDate,
          title,
          position: (entriesByDate.get(entryDate)?.length ?? 0) + 1,
        });
        replaceEntry(next);
        setDrafts((current) => ({ ...current, [entryDate]: '' }));
      } catch (error) {
        Message.error(`Task create failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [drafts, entriesByDate, replaceEntry]
  );

  const deleteEntry = useCallback(
    async (entry: PlannerEntry) => {
      removeEntry(entry.id);
      try {
        await ipcBridge.agentManager.deletePlannerEntry.invoke({ id: entry.id });
      } catch (error) {
        replaceEntry(entry);
        Message.error(`Task delete failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [removeEntry, replaceEntry]
  );

  const updateMonth = useCallback(
    async (data: { tab_color?: string | null; objectives?: string[]; notes?: string[] }) => {
      if (!activeMonth) return;
      const optimistic = { ...activeMonth, ...data };
      setDetail((current) => (current ? { ...current, month: optimistic } : current));
      setMonthTabs((current) => current.map((item) => (item.id === activeMonth.id ? optimistic : item)));
      try {
        const next = await ipcBridge.agentManager.updatePlannerMonth.invoke({ id: activeMonth.id, data });
        setDetail((current) => (current ? { ...current, month: next } : current));
        setMonthTabs((current) => current.map((item) => (item.id === next.id ? next : item)));
      } catch (error) {
        setDetail((current) => (current ? { ...current, month: activeMonth } : current));
        Message.error(`Month update failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [activeMonth]
  );

  const updateDayMark = useCallback(
    async (date: string, data: UpdatePlannerDayMarkRequest) => {
      try {
        const next = await ipcBridge.agentManager.updatePlannerDayMark.invoke({ date, data });
        replaceDayMark(next);
      } catch (error) {
        Message.error(`Day color failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [replaceDayMark]
  );

  const deleteDayMark = useCallback(
    async (date: string) => {
      const previous = dayMarksByDate.get(date);
      removeDayMark(date);
      try {
        await ipcBridge.agentManager.deletePlannerDayMark.invoke({ date });
      } catch (error) {
        if (previous) replaceDayMark(previous);
        Message.error(`Day color clear failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
    [dayMarksByDate, removeDayMark, replaceDayMark]
  );

  const clearSelectedDates = useCallback(() => {
    dateSelectionActiveRef.current = false;
    setSelectedDates(new Set());
    setDayMarkLabel('');
  }, []);

  const applyDayMark = useCallback(
    async (color: string) => {
      const label = dayMarkLabel.trim() || null;
      await Promise.all(selectedDatesList.map((date) => updateDayMark(date, { color, label })));
      clearSelectedDates();
    },
    [clearSelectedDates, dayMarkLabel, selectedDatesList, updateDayMark]
  );

  const clearSelectedDayMarks = useCallback(async () => {
    await Promise.all(selectedDatesList.map((date) => deleteDayMark(date)));
    clearSelectedDates();
  }, [clearSelectedDates, deleteDayMark, selectedDatesList]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelectedDates();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelectedDates]);

  useEffect(() => {
    if (!selectedDatesList.length) return undefined;
    const timeout = window.setTimeout(clearSelectedDates, DAY_SELECTION_HIGHLIGHT_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [clearSelectedDates, dayMarkLabel, selectedDatesList]);

  const beginDateSelection = useCallback((date: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement | null)?.closest('[data-month-map-interactive="true"]')) return;
    event.preventDefault();
    dateSelectionActiveRef.current = true;
    setSelectedDates((current) => {
      const shouldSelect = !current.has(date);
      dateSelectionModeRef.current = shouldSelect ? 'add' : 'remove';
      const next = new Set(current);
      if (shouldSelect) {
        next.add(date);
      } else {
        next.delete(date);
      }
      return next;
    });
  }, []);

  const extendDateSelection = useCallback((date: string) => {
    if (!dateSelectionActiveRef.current) return;
    setSelectedDates((current) => {
      const next = new Set(current);
      if (dateSelectionModeRef.current === 'add') {
        next.add(date);
      } else {
        next.delete(date);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const entry = event.active.data.current?.entry as PlannerEntry | undefined;
    setActiveDragEntry(entry ?? null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const entry = event.active.data.current?.entry as PlannerEntry | undefined;
      const overId = String(event.over?.id ?? '');
      setActiveDragEntry(null);
      if (!entry || !overId.startsWith('day:')) return;
      const nextDate = overId.slice(4);
      if (nextDate && nextDate !== entry.entry_date) {
        void updateEntry(entry, {
          entry_date: nextDate,
          position: (entriesByDate.get(nextDate)?.length ?? 0) + 1,
        });
      }
    },
    [entriesByDate, updateEntry]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragEntry(null);
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await loadMonth();
    setRefreshing(false);
  }, [loadMonth]);

  const goPrev = () => {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
    } else {
      setMonth((value) => value - 1);
    }
  };

  const goNext = () => {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
    } else {
      setMonth((value) => value + 1);
    }
  };

  return (
    <div className={classNames('size-full min-h-0 bg-1', isMobile ? 'overflow-y-auto p-12px' : 'overflow-hidden p-18px')}>
      <div className='flex size-full w-full max-w-none flex-col gap-10px'>
        <header className='shrink-0 rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 px-12px py-10px'>
          <div className='flex flex-wrap items-center justify-between gap-10px'>
            <div className='min-w-0'>
              <div className='mb-4px flex items-center gap-7px text-primary text-13px font-700'>
                <Calendar theme='outline' size='17' fill='currentColor' />
                <span>Dashboard</span>
              </div>
              <h1 className='m-0 text-24px font-800 leading-28px text-t-primary'>Month Map</h1>
            </div>
            <div className='flex flex-wrap items-center gap-6px'>
              <Button size='small' type='outline' icon={<Left theme='outline' size='14' />} onClick={goPrev} />
              <Button
                size='small'
                type='outline'
                onClick={() => {
                  setYear(today.getFullYear());
                  setMonth(today.getMonth() + 1);
                }}
              >
                Today
              </Button>
              <Button size='small' type='outline' icon={<Right theme='outline' size='14' />} onClick={goNext} />
              <Button size='small' type='primary' icon={<Refresh theme='outline' size='14' />} loading={refreshing} onClick={refresh}>
                Refresh
              </Button>
            </div>
          </div>
          <div className='mt-10px flex items-center gap-5px overflow-x-auto'>
            {MONTH_NAMES.map((name, index) => {
              const tabMonth = index + 1;
              const color = monthMeta.get(tabMonth)?.tab_color;
              const active = tabMonth === month;
              return (
                <button
                  key={name}
                  type='button'
                  onClick={() => setMonth(tabMonth)}
                  className={classNames(
                    'h-28px shrink-0 rounded-7px border border-solid px-9px text-12px font-700 leading-18px transition-colors',
                    active
                      ? 'border-[var(--color-text-1)] bg-1 text-t-primary'
                      : 'border-transparent text-t-secondary hover:bg-fill-3 hover:text-t-primary'
                  )}
                  style={color ? { borderTopColor: color, borderTopWidth: 3 } : undefined}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>
          {selectedDatesList.length ? (
            <div className='mt-8px flex flex-wrap items-center gap-7px border-t border-solid border-[var(--color-border-2)] pt-8px'>
              <span className='shrink-0 text-11px font-700 leading-16px text-t-secondary'>
                {selectedDatesList.length} selected
              </span>
              <Input
                size='mini'
                value={dayMarkLabel}
                placeholder='Label'
                onChange={setDayMarkLabel}
                className='w-150px text-11px'
              />
              <div className='flex items-center gap-5px'>
                {DAY_MARK_COLORS.map((color) => (
                  <button
                    key={color}
                    type='button'
                    className='size-20px rounded-full border border-solid border-[var(--color-border-2)] transition-transform hover:scale-110'
                    style={{ backgroundColor: color }}
                    title='Color selected days'
                    onClick={() => void applyDayMark(color)}
                  />
                ))}
              </div>
              <Button size='mini' type='outline' onClick={() => void clearSelectedDayMarks()}>
                Clear color
              </Button>
              <button
                type='button'
                className='flex h-24px items-center gap-6px rounded-5px border border-solid border-[var(--color-border-3)] bg-1 px-8px text-11px font-700 leading-16px text-t-primary shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:bg-fill-3'
                title='Deselect days'
                onClick={clearSelectedDates}
              >
                <span className='font-mono'>Esc</span>
                <span>Deselect</span>
              </button>
            </div>
          ) : null}
        </header>

        {loading && !detail ? (
          <div className='flex flex-1 items-center justify-center gap-10px text-t-secondary'>
            <Spin size={24} />
            <span>Loading Month Map...</span>
          </div>
        ) : !detail || !activeMonth ? (
          <div className='flex flex-1 items-center justify-center'>
            <Empty description='Month Map is not available yet' />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <main className='flex min-h-0 flex-1 flex-col gap-10px'>
              <section className='min-h-0 flex-1 overflow-hidden rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1'>
                <div className='grid h-30px grid-cols-7 border-b border-solid border-[var(--color-border-2)] bg-1 text-11px font-700 text-t-secondary'>
                  {WEEKDAYS.map((weekday) => (
                    <div key={weekday} className='flex min-w-0 items-center border-r border-solid border-[var(--color-border-2)] px-7px last:border-r-0'>
                      <span className='truncate'>{weekday}</span>
                    </div>
                  ))}
                </div>
                <div className='h-[calc(100%-30px)] min-h-0 overflow-auto'>
                  <div className='grid min-w-[1400px] grid-cols-7 gap-px bg-[var(--color-border-2)] p-px'>
                    {cells.map((cell) => (
                      <DayCell
                        key={cell.key}
                        cell={cell}
                        todayKey={todayKey}
                        entries={cell.date ? entriesByDate.get(cell.date) ?? [] : []}
                        dayMark={cell.date ? dayMarksByDate.get(cell.date) : undefined}
                        selected={cell.date ? selectedDates.has(cell.date) : false}
                        keyboardFocused={cell.date ? keyboardFocusDate === cell.date : false}
                        draft={cell.date ? drafts[cell.date] ?? '' : ''}
                        savingEntryId={savingEntryId}
                        onKeyboardFocus={() => cell.date && setKeyboardFocusDate(cell.date)}
                        onKeyboardBlur={() => {
                          if (cell.date) {
                            setKeyboardFocusDate((current) => (current === cell.date ? null : current));
                          }
                        }}
                        onSelectionStart={(event) => cell.date && beginDateSelection(cell.date, event)}
                        onSelectionEnter={() => cell.date && extendDateSelection(cell.date)}
                        onDraftChange={(value) => cell.date && setDrafts((current) => ({ ...current, [cell.date!]: value }))}
                        onAdd={() => (cell.date ? addEntry(cell.date) : undefined)}
                        onDelete={deleteEntry}
                        onUpdate={updateEntry}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <section className='grid shrink-0 gap-10px md:grid-cols-2'>
                <MonthNotes
                  title='Main Objectives'
                  value={objectivesText}
                  onChange={setObjectivesText}
                  onCommit={() => void updateMonth({ objectives: splitLines(objectivesText) })}
                />
                <MonthNotes
                  title='Notes'
                  value={notesText}
                  onChange={setNotesText}
                  onCommit={() => void updateMonth({ notes: splitLines(notesText) })}
                />
              </section>
            </main>
            <DragOverlay dropAnimation={null} zIndex={10000}>
              {activeDragEntry ? <PlannerEntryDragOverlay entry={activeDragEntry} saving={savingEntryId === activeDragEntry.id} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
};

const MonthNotes: React.FC<{
  title: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
}> = ({ title, value, onChange, onCommit }) => (
  <label className='flex h-128px min-h-0 flex-col rounded-10px border border-solid border-[var(--color-border-2)] bg-fill-1 p-10px'>
    <div className='mb-5px text-11px font-800 uppercase leading-14px text-t-secondary'>{title}</div>
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      className='min-h-0 flex-1 resize-none border-0 bg-transparent p-0 text-12px leading-17px text-t-primary outline-none'
    />
  </label>
);

const DayCell: React.FC<{
  cell: { day: number | null; date: string | null };
  todayKey: string;
  entries: PlannerEntry[];
  dayMark?: PlannerDayMark;
  selected: boolean;
  keyboardFocused: boolean;
  draft: string;
  savingEntryId: string | null;
  onKeyboardFocus: () => void;
  onKeyboardBlur: () => void;
  onSelectionStart: (event: React.PointerEvent<HTMLElement>) => void;
  onSelectionEnter: () => void;
  onDraftChange: (value: string) => void;
  onAdd: () => void | Promise<void>;
  onDelete: (entry: PlannerEntry) => void;
  onUpdate: (entry: PlannerEntry, data: UpdatePlannerEntryRequest) => void;
}> = ({
  cell,
  todayKey,
  entries,
  dayMark,
  selected,
  keyboardFocused,
  draft,
  savingEntryId,
  onKeyboardFocus,
  onKeyboardBlur,
  onSelectionStart,
  onSelectionEnter,
  onDraftChange,
  onAdd,
  onDelete,
  onUpdate,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: cell.date ? `day:${cell.date}` : `blank:${cell.day ?? 'x'}`,
    disabled: !cell.date,
  });
  const addInputRef = useRef<HTMLInputElement>(null);

  if (!cell.date || cell.day == null) {
    return <div className='h-142px min-w-0' style={{ backgroundColor: '#d1d5db' }} />;
  }

  const isPast = cell.date < todayKey;
  const isToday = cell.date === todayKey;
  const shadows = [
    keyboardFocused ? 'inset 0 0 0 2px rgba(37,99,235,0.58), inset 0 0 0 999px rgba(37,99,235,0.045)' : null,
    selected ? 'inset 0 0 0 2px rgba(17,24,39,0.42)' : null,
    !selected && isToday ? 'inset 0 0 0 2px #facc15' : null,
    dayMark ? `inset 0 4px 0 ${dayMark.color}` : null,
  ].filter(Boolean);
  const cellStyle = {
    backgroundColor: isToday
      ? isOver
        ? '#fde68a'
        : '#fef3c7'
      : dayMark
        ? dayMark.color
        : isPast
          ? '#d1d5db'
          : isOver
            ? 'rgba(var(--primary-6),0.10)'
            : undefined,
    boxShadow: shadows.length ? shadows.join(', ') : undefined,
  };
  const handleAddKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (handleMonthMapArrowNavigation(event)) return;
    if (event.key !== 'Enter' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void Promise.resolve(onAdd()).then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => addInputRef.current?.focus());
      });
    });
  };
  const focusAddInput = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => addInputRef.current?.focus());
    });
  };
  const renderAddTaskInput = (placement: 'top' | 'after-task') => (
    <div
      className={classNames(
        'flex h-19px shrink-0 items-center rounded-5px bg-[rgba(255,255,255,0.72)] px-5px transition-opacity focus-within:bg-white',
        placement === 'top' && 'mb-4px',
        isPast && 'opacity-25 hover:opacity-100 focus-within:opacity-100'
      )}
      data-month-map-interactive='true'
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        ref={addInputRef}
        value={draft}
        placeholder='Add task'
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleAddKeyDown}
        data-month-map-nav='true'
        data-month-map-date={cell.date}
        data-month-map-kind='add'
        data-month-map-index={entries.length}
        className='h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-10px leading-15px text-t-primary outline-none placeholder:text-t-tertiary'
        aria-label={cell.date ? `Add task for ${cell.date}` : 'Add task'}
      />
    </div>
  );

  return (
    <div
      ref={setNodeRef}
      style={cellStyle}
      data-month-map-cell-date={cell.date}
      onPointerDown={onSelectionStart}
      onPointerEnter={onSelectionEnter}
      onFocusCapture={(event) => {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.dataset.monthMapNav === 'true' &&
          event.target.dataset.monthMapDate === cell.date
        ) {
          onKeyboardFocus();
        }
      }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof HTMLInputElement) || next.dataset.monthMapDate !== cell.date) {
          onKeyboardBlur();
        }
      }}
      className={classNames(
        'flex h-142px min-w-0 cursor-crosshair select-none flex-col bg-1 p-6px transition-colors',
        isPast && 'text-t-secondary'
      )}
    >
      <div className='mb-4px flex items-center justify-between gap-5px'>
        <span
          className={classNames(
            'text-11px font-800 tabular-nums',
            isToday && 'rounded-4px bg-[#facc15] px-4px text-[#111827]'
          )}
        >
          {cell.day}
        </span>
        <div className='flex min-w-0 items-center gap-4px'>
          {dayMark?.label ? (
            <span className='max-w-90px truncate rounded-4px bg-[rgba(255,255,255,0.62)] px-4px text-9px font-800 uppercase leading-14px text-t-secondary'>
              {dayMark.label}
            </span>
          ) : null}
          {entries.length ? <span className='text-10px font-700 text-t-secondary'>{entries.length}</span> : null}
        </div>
      </div>
      {entries.length === 0 ? renderAddTaskInput('top') : null}
      <div className='min-h-0 flex-1 space-y-3px overflow-y-auto pr-2px'>
        {entries.map((entry, entryIndex) => (
          <PlannerEntryLine
            key={entry.id}
            entry={entry}
            entryIndex={entryIndex}
            saving={savingEntryId === entry.id}
            onDelete={() => onDelete(entry)}
            onUpdate={(data) => onUpdate(entry, data)}
            onFocusNextTask={focusAddInput}
          />
        ))}
        {entries.length > 0 ? renderAddTaskInput('after-task') : null}
      </div>
    </div>
  );
};

const PlannerEntryLine: React.FC<{
  entry: PlannerEntry;
  entryIndex: number;
  saving: boolean;
  onDelete: () => void;
  onUpdate: (data: UpdatePlannerEntryRequest) => void;
  onFocusNextTask: () => void;
}> = ({ entry, entryIndex, saving, onDelete, onUpdate, onFocusNextTask }) => {
  const [title, setTitle] = useState(entry.title);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  useEffect(() => {
    setTitle(entry.title);
  }, [entry.title]);

  const commitTitle = () => {
    const next = title.trim();
    if (!next) {
      setTitle(entry.title);
      return;
    }
    if (next !== entry.title) {
      onUpdate({ title: next });
    }
  };

  const done = entry.status === 'done';
  const toggleDone = () => {
    const next = title.trim();
    const data: UpdatePlannerEntryRequest = { status: done ? 'planned' : 'done' };
    if (next && next !== entry.title) {
      data.title = next;
    } else if (!next) {
      setTitle(entry.title);
    }
    onUpdate(data);
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      data-month-map-interactive='true'
      onClick={(event) => event.stopPropagation()}
      className={classNames(
        'group relative flex h-20px min-w-0 cursor-grab items-center gap-2px rounded-5px border border-solid border-[var(--color-border-2)] bg-fill-1 px-3px shadow-[0_1px_0_rgba(0,0,0,0.02)] active:cursor-grabbing',
        isDragging && 'z-50 opacity-35',
        done && 'opacity-75'
      )}
      {...attributes}
      {...listeners}
    >
      <button
        type='button'
        className='h-16px w-9px shrink-0 cursor-grab border-0 bg-transparent p-0 text-10px leading-14px text-t-tertiary active:cursor-grabbing'
        aria-label={`Drag ${entry.title}`}
      >
        ::
      </button>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={commitTitle}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (handleMonthMapArrowNavigation(event)) return;
          if (event.key !== 'Enter') return;
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            toggleDone();
            return;
          }
          event.preventDefault();
          event.currentTarget.blur();
          onFocusNextTask();
        }}
        data-month-map-nav='true'
        data-month-map-date={entry.entry_date}
        data-month-map-kind='task'
        data-month-map-index={entryIndex}
        className={classNames(
          'min-w-0 flex-1 border-0 bg-transparent p-0 text-10px leading-15px outline-none',
          done ? 'text-t-tertiary line-through decoration-1 decoration-[var(--color-text-3)]' : 'text-t-primary'
        )}
      />
      <Tooltip content={done ? 'Mark planned' : 'Mark done'}>
        <button
          type='button'
          className={classNames(
            'flex size-15px shrink-0 items-center justify-center rounded-full border border-solid p-0 transition-colors',
            done
              ? 'border-[#22c55e] bg-[#dcfce7] text-[#15803d] hover:bg-[#bbf7d0]'
              : 'border-[var(--color-border-3)] bg-transparent text-t-tertiary hover:border-[#22c55e] hover:bg-[#f0fdf4] hover:text-[#16a34a]',
            saving && 'animate-pulse'
          )}
          aria-label={done ? `Mark ${entry.title} planned` : `Mark ${entry.title} done`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={toggleDone}
        >
          {done ? <Undo theme='outline' size='9' /> : <CheckSmall theme='outline' size='10' />}
        </button>
      </Tooltip>
      <Tooltip content={statusLabel(entry.status)}>
        <span
          className={classNames('size-6px shrink-0 rounded-full', saving && 'animate-pulse')}
          style={{ backgroundColor: STATUS_DOT_COLOR[entry.status] }}
          aria-label={statusLabel(entry.status)}
        />
      </Tooltip>
      <button
        type='button'
        className='hidden size-16px shrink-0 items-center justify-center rounded-4px border-0 bg-transparent p-0 text-t-tertiary hover:bg-fill-3 hover:text-danger group-hover:flex'
        aria-label={`Delete ${entry.title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onDelete}
      >
        <Delete theme='outline' size='11' />
      </button>
    </div>
  );
};

const PlannerEntryDragOverlay: React.FC<{ entry: PlannerEntry; saving: boolean }> = ({ entry, saving }) => (
  <div className='pointer-events-none flex h-24px min-w-[180px] max-w-[260px] items-center gap-2px rounded-6px border border-solid border-[rgba(37,99,235,0.45)] bg-white px-5px shadow-[0_14px_32px_rgba(15,23,42,0.28)]'>
    <span className='h-16px w-9px shrink-0 text-10px leading-14px text-t-tertiary'>::</span>
    <span className='min-w-0 flex-1 truncate text-11px font-700 leading-16px text-t-primary'>{entry.title}</span>
    <Tooltip content={statusLabel(entry.status)}>
      <span
        className={classNames('size-7px shrink-0 rounded-full', saving && 'animate-pulse')}
        style={{ backgroundColor: STATUS_DOT_COLOR[entry.status] }}
        aria-label={statusLabel(entry.status)}
      />
    </Tooltip>
  </div>
);

export default MonthMapPage;
