import {
  albumProgress,
  artworkStatus,
  chunk,
  continueList,
  filterArtworks,
  hasActiveFilters,
  NO_FILTERS,
  percentFilled,
  type CatalogArtwork,
  type ProgressEntry,
} from './library';

const catalog: CatalogArtwork[] = [
  { id: 'cactus', album: 'garden', difficulty: 1 },
  { id: 'mushroom', album: 'garden', difficulty: 2 },
  { id: 'fish', album: 'ocean', difficulty: 1 },
  { id: 'whale', album: 'ocean', difficulty: 3 },
  { id: 'rocket', album: 'space', difficulty: 2 },
];

const entry = (status: ProgressEntry['status'], updatedAt: number, filledCount = 3): ProgressEntry => ({
  status,
  updatedAt,
  filledCount,
});

const index = {
  cactus: entry('completed', 10),
  mushroom: entry('in_progress', 30),
  fish: entry('in_progress', 50),
  rocket: entry('in_progress', 40, 0),
  gone: entry('in_progress', 99),
};

describe('artworkStatus', () => {
  it('defaults to new', () => {
    expect(artworkStatus('whale', index)).toBe('new');
    expect(artworkStatus('cactus', index)).toBe('completed');
  });
});

describe('albumProgress', () => {
  it('counts completed and in-progress artworks of one album', () => {
    expect(albumProgress('garden', catalog, index)).toEqual({ completed: 1, inProgress: 1, total: 2, complete: false });
    expect(albumProgress('ocean', catalog, index)).toEqual({ completed: 0, inProgress: 1, total: 2, complete: false });
  });

  it('is complete only when every artwork is completed', () => {
    const done = { ...index, mushroom: entry('completed', 31) };
    expect(albumProgress('garden', catalog, done).complete).toBe(true);
  });

  it('never marks an empty album complete', () => {
    expect(albumProgress('deep-ocean', catalog, index)).toEqual({ completed: 0, inProgress: 0, total: 0, complete: false });
  });
});

describe('continueList', () => {
  it('lists started artworks, most recent first, ignoring unknown and empty ones', () => {
    expect(continueList(catalog, index).map((a) => a.id)).toEqual(['fish', 'mushroom']);
  });

  it('honors the limit', () => {
    expect(continueList(catalog, index, 1).map((a) => a.id)).toEqual(['fish']);
    expect(continueList(catalog, index, 0)).toEqual([]);
  });

  it('is empty without progress', () => {
    expect(continueList(catalog, {})).toEqual([]);
  });
});

describe('filterArtworks', () => {
  it('returns everything without filters, in catalog order', () => {
    expect(filterArtworks(catalog, index, NO_FILTERS)).toEqual(catalog);
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('filters by difficulty', () => {
    expect(filterArtworks(catalog, index, { difficulty: 2, status: 'all' }).map((a) => a.id)).toEqual([
      'mushroom',
      'rocket',
    ]);
  });

  it('filters by status (new includes never-started artworks)', () => {
    expect(filterArtworks(catalog, index, { difficulty: 'all', status: 'new' }).map((a) => a.id)).toEqual(['whale']);
    expect(filterArtworks(catalog, index, { difficulty: 'all', status: 'completed' }).map((a) => a.id)).toEqual([
      'cactus',
    ]);
  });

  it('combines both filters', () => {
    const filters = { difficulty: 1, status: 'in_progress' } as const;
    expect(hasActiveFilters(filters)).toBe(true);
    expect(filterArtworks(catalog, index, filters).map((a) => a.id)).toEqual(['fish']);
  });
});

describe('helpers', () => {
  it('computes a clamped percentage', () => {
    expect(percentFilled(1, 3)).toBe(33);
    expect(percentFilled(5, 0)).toBe(0);
    expect(percentFilled(9, 3)).toBe(100);
  });

  it('chunks rows', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
