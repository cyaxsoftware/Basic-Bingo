import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameRecord } from '../../../shared/games/gameLog';
import { GamesPlayed } from './GamesPlayed';

const NOW = Date.now();
const record = (
  id: string,
  number: number,
  minutesAgo: number,
  title: string,
  durationSeconds: number,
): GameRecord => ({
  id,
  number,
  startedAt: NOW - minutesAgo * 60_000,
  title,
  durationSeconds,
});

const RECORDS = [
  record('a', 1, 90, 'Four Corners', 754),
  record('b', 2, 60, 'Big L', 95),
  record('c', 3, 30, 'Blackout', 3730),
];

function renderLog(records: readonly GameRecord[] = RECORDS, onClear = vi.fn()) {
  render(<GamesPlayed records={records} onClear={onClear} now={NOW} />);
  return onClear;
}

const dataRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('GamesPlayed', () => {
  it('lists the newest game first, numbered in the order they were played', () => {
    renderLog();
    expect(screen.getByRole('heading', { name: 'Games played · 3' })).toBeInTheDocument();
    expect(
      dataRows().map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      ),
    ).toEqual([
      ['3', expect.any(String), 'Blackout', '1:02:10'],
      ['2', expect.any(String), 'Big L', '1:35'],
      ['1', expect.any(String), 'Four Corners', '12:34'],
    ]);
  });

  it('shows the number each game was played as, even when the oldest have aged out', () => {
    renderLog([record('x', 41, 20, 'Blackout', 600), record('y', 42, 5, 'Big L', 700)]);
    expect(dataRows().map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual(['42', '41']);
  });

  it('labels its columns', () => {
    renderLog();
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      '#',
      'First ball',
      'Game',
      'Duration',
    ]);
  });

  it('shows the time of the first ball', () => {
    renderLog([record('a', 1, 0, 'Four Corners', 60)]);
    const time = new Date(NOW).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    expect(dataRows()[0]).toHaveTextContent(time);
  });

  it('says how a game gets here when there are none, and has nothing to clear', () => {
    renderLog([]);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText(/press New Game after calling at least one ball/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear history…' })).toBeDisabled();
  });

  it('asks before clearing, and clears only when confirmed', async () => {
    const onClear = renderLog();
    await userEvent.click(screen.getByRole('button', { name: 'Clear history…' }));
    const dialog = screen.getByRole('dialog', { name: 'Clear the games played?' });
    expect(dialog).toHaveTextContent('the list of 3 games played');
    expect(onClear).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Clear history…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('puts a long pattern name in the tooltip', () => {
    renderLog([record('a', 1, 5, 'Postage Stamp (corner, two by two squares)', 100)]);
    expect(screen.getByText('Postage Stamp (corner, two by two squares)')).toHaveAttribute(
      'title',
      'Postage Stamp (corner, two by two squares)',
    );
  });
});
