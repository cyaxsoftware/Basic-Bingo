import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER, type TimerState } from '../../../shared/timer/timerState';
import { createSnapshotStore } from '../../shared/snapshotStore';
import { createFakeBingoApi, makeSnapshot } from '../../test/fakeBingoApi';
import { ControllerApp } from '../ControllerApp';

async function renderPanel(timer: TimerState = DEFAULT_TIMER) {
  const api = createFakeBingoApi(makeSnapshot({ presentationMode: 'countdown', timer }));
  render(<ControllerApp api={api} store={createSnapshotStore(api)} />);
  const panel = within(await screen.findByRole('region', { name: 'Countdown controls' }));
  const button = (name: string) => panel.getByRole('button', { name });
  const time = panel.getByRole('timer', { name: 'Time remaining' });
  const preview = within(panel.getByRole('region', { name: 'Projector preview' }));
  return { api, panel, time, button, preview, user: userEvent.setup() };
}

describe('Countdown panel', () => {
  it('shows the preset duration, status and preview and enables the appropriate controls', async () => {
    const { api, panel, time, button, preview, user } = await renderPanel();
    expect(time).toHaveTextContent('05:00');
    expect(panel.getByRole('status')).toHaveTextContent('Not started');
    expect(preview.getByText(DEFAULT_TIMER.message)).toBeInTheDocument();
    expect(preview.getByRole('timer')).toHaveTextContent('05:00');
    expect(button('5 min')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Pause')).toBeDisabled();
    expect(button('Resume')).toBeDisabled();
    expect(button('Reset')).toBeDisabled();

    await user.click(button('1 min'));
    expect(api.setTimerDuration).toHaveBeenCalledExactlyOnceWith(60);
    expect(time).toHaveTextContent('01:00');
    await user.click(button('Start'));
    expect(panel.getByRole('status')).toHaveTextContent('Running');
    expect(button('Start')).toBeDisabled();
    expect(button('2 min')).toBeDisabled();
    expect(panel.getByRole('spinbutton', { name: 'Minutes' })).toBeDisabled();

    await user.click(button('Pause'));
    expect(panel.getByRole('status')).toHaveTextContent('Paused');
    expect(preview.getByText('Paused')).toBeInTheDocument();
    expect(button('Pause')).toBeDisabled();
    expect(button('2 min')).toBeEnabled();
    await user.click(button('Resume'));
    expect(panel.getByRole('status')).toHaveTextContent('Running');
    await user.click(button('Reset'));
    expect(panel.getByRole('status')).toHaveTextContent('Not started');
    expect(time).toHaveTextContent('01:00');
  });

  it('applies a custom duration and refuses zero', async () => {
    const { api, panel, time, button, user } = await renderPanel();
    const minutes = () => panel.getByRole('spinbutton', { name: 'Minutes' });
    const seconds = () => panel.getByRole('spinbutton', { name: 'Seconds' });
    await user.clear(minutes());
    await user.type(minutes(), '0');
    await user.click(button('Set duration'));
    expect(panel.getByRole('alert')).toHaveTextContent('0:01 to 99:59');
    expect(api.setTimerDuration).not.toHaveBeenCalled();
    await user.clear(seconds());
    await user.type(seconds(), '42');
    await user.click(button('Set duration'));
    expect(api.setTimerDuration).toHaveBeenCalledExactlyOnceWith(42);
    expect(time).toHaveTextContent('00:42');
  });

  it('commits the projector message on Enter and blur, refusing blank edits', async () => {
    const { api, panel, preview, user } = await renderPanel();
    const input = () => panel.getByRole('textbox', { name: 'Countdown message' });
    await user.clear(input());
    await user.type(input(), 'Next round{Enter}');
    expect(api.setCountdownMessage).toHaveBeenCalledExactlyOnceWith('Next round');
    expect(preview.getByText('Next round')).toBeInTheDocument();

    await user.clear(input());
    await user.tab();
    expect(panel.getByRole('alert')).toHaveTextContent('between 1 and 80 characters');
    expect(preview.getByText('Next round')).toBeInTheDocument();
    expect(api.setCountdownMessage).toHaveBeenCalledTimes(1);

    await user.type(input(), 'Round two');
    await user.tab();
    expect(api.setCountdownMessage).toHaveBeenLastCalledWith('Round two');
    expect(preview.getByText('Round two')).toBeInTheDocument();
  });

  it('shows expiry and lets the operator start a fresh timer', async () => {
    const { panel, time, button, preview, user } = await renderPanel({ ...DEFAULT_TIMER, status: 'expired' });
    expect(time).toHaveTextContent('00:00');
    expect(panel.getByRole('status')).toHaveTextContent("Time's up");
    expect(preview.getByText('Time to Play!')).toBeInTheDocument();
    await user.click(button('Start'));
    expect(panel.getByRole('status')).toHaveTextContent('Running');
    expect(preview.queryByText('Time to Play!')).toBeNull();
  });
});
