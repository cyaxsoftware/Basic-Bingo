import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameClock as Clock } from '../../../shared/games/gameLog';
import { GameClock } from './GameClock';

const START = Date.UTC(2026, 10, 22, 19, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});

afterEach(() => {
  vi.useRealTimers();
});

const clock = (over: Partial<Clock> = {}): Clock => ({
  firstBallAt: START - 65_000,
  lastBingoAt: null,
  resumedAt: null,
  pausedMs: 0,
  bingoTitle: null,
  ...over,
});

const timer = () => screen.getByRole('timer', { name: /time$/ });
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('GameClock', () => {
  it('shows the game number and the time since the first ball, and keeps running', () => {
    render(<GameClock gameNumber={4} clock={clock()} />);
    expect(timer()).toHaveTextContent('Game 4');
    expect(timer()).toHaveTextContent('1:05');
    expect(timer()).toHaveAccessibleName('Game 4 time');

    advance(10_000);
    expect(timer()).toHaveTextContent('1:15');
    advance(3_600_000);
    expect(timer()).toHaveTextContent('1:01:15');
  });

  it('starts at 0:00 on the first ball', () => {
    render(<GameClock gameNumber={1} clock={clock({ firstBallAt: START })} />);
    expect(timer()).toHaveTextContent('0:00');
  });

  it('holds still while BINGO CALLED is up', () => {
    render(
      <GameClock
        gameNumber={2}
        clock={clock({ firstBallAt: START - 120_000, lastBingoAt: START - 30_000 })}
      />,
    );
    expect(timer()).toHaveTextContent('1:30');
    advance(60_000);
    expect(timer()).toHaveTextContent('1:30');
    expect(timer()).toHaveAttribute('title', expect.stringContaining('Held'));
  });

  it('carries on from where it was held once BINGO CALLED is dismissed, leaving out the time spent checking', () => {
    const held = clock({ firstBallAt: START - 120_000, lastBingoAt: START - 30_000 });
    const { rerender } = render(<GameClock gameNumber={2} clock={held} />);
    expect(timer()).toHaveTextContent('1:30');

    // Dismissed 20 s after it was pressed, i.e. now minus 10 s: 20 s were spent checking.
    rerender(<GameClock gameNumber={2} clock={{ ...held, resumedAt: START - 10_000 }} />);
    expect(timer()).toHaveTextContent('1:40');
    advance(5_000);
    expect(timer()).toHaveTextContent('1:45');
    expect(timer()).toHaveAttribute('title', 'Time since the first ball');
  });

  it('leaves out the checking time of earlier false bingos too', () => {
    render(<GameClock gameNumber={3} clock={clock({ firstBallAt: START - 200_000, pausedMs: 45_000 })} />);
    expect(timer()).toHaveTextContent('2:35');
  });

  it('never shows a negative time if the computer clock moved back', () => {
    render(<GameClock gameNumber={1} clock={clock({ firstBallAt: START + 60_000 })} />);
    expect(timer()).toHaveTextContent('0:00');
  });

  it('stops its timer when it goes away', () => {
    const { unmount } = render(<GameClock gameNumber={1} clock={clock({ firstBallAt: START })} />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
