import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import QuickActionButtons from '@renderer/pages/guid/components/QuickActionButtons';

const { navigateMock, onStatusChangedMock, getStatusInvokeMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  onStatusChangedMock: vi.fn(() => vi.fn()),
  getStatusInvokeMock: vi.fn(() => new Promise(() => {})),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  webui: {
    getStatus: {
      invoke: getStatusInvokeMock,
    },
    statusChanged: {
      on: onStatusChangedMock,
    },
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Earth: () => React.createElement('span', { 'data-testid': 'earth-icon' }, 'Earth'),
  Youtube: () => React.createElement('span', { 'data-testid': 'youtube-icon' }, 'Youtube'),
}));

vi.mock('@renderer/pages/guid/index.module.css', () => ({
  default: {
    guidQuickActions: 'guidQuickActions',
  },
}));

describe('QuickActionButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls the feedback callback from the first quick action', () => {
    const onOpenFeedback = vi.fn();

    render(
      <QuickActionButtons
        onOpenLink={vi.fn()}
        onOpenFeedback={onOpenFeedback}
        inactiveBorderColor='#ccc'
        activeShadow='none'
      />
    );

    fireEvent.click(screen.getByText('conversation.welcome.quickActionFeedback').closest('div') as HTMLElement);
    expect(onOpenFeedback).toHaveBeenCalledTimes(1);
  });

  it('keeps the repo and WebUI quick actions working without triggering feedback', () => {
    const onOpenLink = vi.fn();
    const onOpenFeedback = vi.fn();

    render(
      <QuickActionButtons
        onOpenLink={onOpenLink}
        onOpenFeedback={onOpenFeedback}
        inactiveBorderColor='#ccc'
        activeShadow='none'
      />
    );

    fireEvent.click(screen.getByText('conversation.welcome.quickActionStar').closest('div') as HTMLElement);
    expect(onOpenLink).toHaveBeenCalledWith('https://www.youtube.com/@SaminYasar_?sub_confirmation=1');
    expect(onOpenFeedback).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(/settings\.webui/).closest('div') as HTMLElement);
    expect(navigateMock).toHaveBeenCalledWith('/settings/webui');
    expect(onOpenFeedback).not.toHaveBeenCalled();
  });
});
