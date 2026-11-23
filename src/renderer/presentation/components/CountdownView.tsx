import type { TimerState } from '../../../shared/timer/timerState';
import { CountdownDisplay } from '../../shared/CountdownDisplay';
import { useCountdown } from '../../shared/useCountdown';

export function CountdownView({ timer }: { readonly timer: TimerState }) {
  const { time, status } = useCountdown(timer);
  return <CountdownDisplay label="Countdown" message={timer.message} time={time} status={status} />;
}
