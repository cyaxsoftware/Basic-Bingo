import { useState, type FormEvent } from 'react';
import {
  isCountdownMessage,
  isTimerDuration,
  MAX_COUNTDOWN_MESSAGE_LENGTH,
  type TimerState,
} from '../../../shared/timer/timerState';
import { CountdownDisplay } from '../../shared/CountdownDisplay';
import { useCountdown } from '../../shared/useCountdown';
import styles from './CountdownPanel.module.css';

const PRESETS = [1, 2, 5, 10, 15, 20];
const STATUS_LABELS = { idle: 'Not started', running: 'Running', paused: 'Paused', expired: "Time's up" };

export interface CountdownPanelProps {
  readonly timer: TimerState;
  readonly onDuration: (seconds: number) => void;
  readonly onMessage: (message: string) => void;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onReset: () => void;
  readonly compact?: boolean;
}

function DurationControls({
  duration,
  disabled,
  onDuration,
}: {
  readonly duration: number;
  readonly disabled: boolean;
  readonly onDuration: (seconds: number) => void;
}) {
  const [minutes, setMinutes] = useState(String(Math.floor(duration / 60)));
  const [seconds, setSeconds] = useState(String(duration % 60));
  const [invalid, setInvalid] = useState(false);

  const choose = (total: number) => {
    if (!isTimerDuration(total)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setMinutes(String(Math.floor(total / 60)));
    setSeconds(String(total % 60));
    onDuration(total);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    choose(Number(minutes) * 60 + Number(seconds));
  };

  return (
    <form onSubmit={submit}>
      <fieldset className={styles.duration} disabled={disabled}>
        <legend>Duration</legend>
        <div className={styles.presets}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={duration === preset * 60}
              onClick={() => choose(preset * 60)}
            >
              {preset} min
            </button>
          ))}
        </div>
        <div className={styles.custom}>
          <label>
            Minutes
            <input
              type="number"
              min={0}
              max={99}
              step={1}
              required
              value={minutes}
              onChange={(event) => {
                setMinutes(event.currentTarget.value);
                setInvalid(false);
              }}
            />
          </label>
          <label>
            Seconds
            <input
              type="number"
              min={0}
              max={59}
              step={1}
              required
              value={seconds}
              onChange={(event) => {
                setSeconds(event.currentTarget.value);
                setInvalid(false);
              }}
            />
          </label>
          <button type="submit">Set duration</button>
        </div>
        {invalid ? (
          <p className={styles.error} role="alert">
            Choose a duration from 0:01 to 99:59.
          </p>
        ) : null}
      </fieldset>
    </form>
  );
}

function MessageField({
  message,
  onMessage,
}: {
  readonly message: string;
  readonly onMessage: (message: string) => void;
}) {
  const [draft, setDraft] = useState(message);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (!isCountdownMessage(draft)) {
      setInvalid(true);
      return;
    }
    const clean = draft.trim();
    setDraft(clean);
    if (clean !== message) onMessage(clean);
  };

  return (
    <div>
      <label className={styles.message}>
        Countdown message
        <input
          type="text"
          maxLength={MAX_COUNTDOWN_MESSAGE_LENGTH}
          value={draft}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.currentTarget.blur();
          }}
        />
      </label>
      {invalid ? (
        <p className={styles.error} role="alert">
          Enter a countdown message between 1 and 80 characters.
        </p>
      ) : null}
    </div>
  );
}

export function CountdownPanel({
  timer,
  onDuration,
  onMessage,
  onStart,
  onPause,
  onResume,
  onReset,
  compact = false,
}: CountdownPanelProps) {
  const { time, status } = useCountdown(timer);
  return (
    <section className={styles.panel} data-compact={compact} aria-label="Countdown controls">
      <div className={styles.controls}>
        <div className={styles.readout}>
          <p className={styles.time} role="timer" aria-label="Time remaining">
            {time}
          </p>
          <p className={styles.status} role="status">
            {STATUS_LABELS[status]}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primary}
            disabled={status !== 'idle' && status !== 'expired'}
            onClick={onStart}
          >
            Start
          </button>
          <button type="button" disabled={status !== 'running'} onClick={onPause}>
            Pause
          </button>
          <button type="button" className={styles.primary} disabled={status !== 'paused'} onClick={onResume}>
            Resume
          </button>
          <button type="button" disabled={status === 'idle'} onClick={onReset}>
            Reset
          </button>
        </div>
        <DurationControls
          key={timer.durationSeconds}
          duration={timer.durationSeconds}
          disabled={status === 'running'}
          onDuration={onDuration}
        />
        <MessageField key={timer.message} message={timer.message} onMessage={onMessage} />
      </div>
      {compact ? null : (
        <figure className={styles.preview}>
          <figcaption>Projector preview</figcaption>
          <div className={styles.previewStage}>
            <CountdownDisplay label="Projector preview" message={timer.message} time={time} status={status} />
          </div>
        </figure>
      )}
    </section>
  );
}
