import type { Difficulty } from '@/lib/artwork/types';

/**
 * Pure library selectors over the content catalog and the progress index. Structural types
 * keep this module independent of the stores: anything with these fields works.
 */

export type ArtworkStatus = 'new' | 'in_progress' | 'completed';

export interface CatalogArtwork {
  id: string;
  album: string;
  difficulty: Difficulty;
}

export interface ProgressEntry {
  status: ArtworkStatus;
  filledCount: number;
  updatedAt: number;
}

export type ProgressLookup = Readonly<Record<string, ProgressEntry | undefined>>;

export function artworkStatus(id: string, index: ProgressLookup): ArtworkStatus {
  return index[id]?.status ?? 'new';
}

export interface AlbumProgress {
  completed: number;
  /** Artworks started but not finished. */
  inProgress: number;
  total: number;
  /** True when every artwork of a non-empty album is completed (reveals the album meta-image). */
  complete: boolean;
}

export function albumProgress(
  albumId: string,
  artworks: readonly CatalogArtwork[],
  index: ProgressLookup,
): AlbumProgress {
  let completed = 0;
  let inProgress = 0;
  let total = 0;
  for (const a of artworks) {
    if (a.album !== albumId) continue;
    total++;
    const status = artworkStatus(a.id, index);
    if (status === 'completed') completed++;
    else if (status === 'in_progress') inProgress++;
  }
  return { completed, inProgress, total, complete: total > 0 && completed === total };
}

export const CONTINUE_LIMIT = 10;

/**
 * Artworks to resume: in progress (with at least one filled cell), most recently colored
 * first. Only catalog artworks are listed (stale progress of removed content is ignored).
 */
export function continueList<T extends CatalogArtwork>(
  artworks: readonly T[],
  index: ProgressLookup,
  limit = CONTINUE_LIMIT,
): T[] {
  return artworks
    .filter((a) => {
      const entry = index[a.id];
      return entry?.status === 'in_progress' && entry.filledCount > 0;
    })
    .sort((a, b) => (index[b.id]?.updatedAt ?? 0) - (index[a.id]?.updatedAt ?? 0) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}

export type DifficultyFilter = 'all' | Difficulty;
export type StatusFilter = 'all' | ArtworkStatus;

export interface LibraryFilters {
  difficulty: DifficultyFilter;
  status: StatusFilter;
}

export const NO_FILTERS: LibraryFilters = Object.freeze({ difficulty: 'all', status: 'all' });

export function hasActiveFilters(filters: LibraryFilters): boolean {
  return filters.difficulty !== 'all' || filters.status !== 'all';
}

/** Keeps catalog order; both filters must match. */
export function filterArtworks<T extends CatalogArtwork>(
  artworks: readonly T[],
  index: ProgressLookup,
  filters: LibraryFilters,
): T[] {
  return artworks.filter(
    (a) =>
      (filters.difficulty === 'all' || a.difficulty === filters.difficulty) &&
      (filters.status === 'all' || artworkStatus(a.id, index) === filters.status),
  );
}

/** Whole percent of colored cells, clamped to 0..100. */
export function percentFilled(filledCount: number, totalCells: number): number {
  if (totalCells <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((filledCount / totalCells) * 100)));
}

/** Splits a list into rows of `columns` items (the last row may be shorter). */
export function chunk<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}
