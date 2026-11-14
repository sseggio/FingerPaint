import type { ProgressSummary } from '@/features/progress/progress-schema';

import { nextArtworkId } from './next-artwork';

const done = (artworkId: string): ProgressSummary => ({
  artworkId,
  filledCount: 1,
  status: 'completed',
  startedAt: 0,
  updatedAt: 0,
  activeMs: 0,
});

describe('nextArtworkId', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('offers the next unfinished artwork, wrapping around', () => {
    expect(nextArtworkId('a', ids, {})).toBe('b');
    expect(nextArtworkId('b', ids, { c: done('c') })).toBe('d');
    expect(nextArtworkId('d', ids, { a: done('a') })).toBe('b');
  });

  it('falls back to the next one when everything is finished, null when alone', () => {
    const all = Object.fromEntries(ids.map((id) => [id, done(id)]));
    expect(nextArtworkId('c', ids, all)).toBe('d');
    expect(nextArtworkId('a', ['a'], {})).toBeNull();
    expect(nextArtworkId('dev', ids, {})).toBe('a');
  });
});
