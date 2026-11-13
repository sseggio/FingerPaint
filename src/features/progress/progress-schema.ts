import type { Schema } from '@/lib/storage';

export type ProgressStatus = 'new' | 'in_progress' | 'completed';

/** Persisted progress of one artwork. `filled` is the base64 bitset of correctly filled cells. */
export interface Progress {
  artworkId: string;
  filled: string;
  filledCount: number;
  status: ProgressStatus;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  activeMs: number;
}

/** Lightweight index entry: everything but the bitset. */
export type ProgressSummary = Omit<Progress, 'filled'>;

export interface ProgressIndex {
  entries: Record<string, ProgressSummary>;
}

/** Payload stored under `fp:progress:<id>`. */
export interface ProgressCells {
  filled: string;
}

const STATUSES: readonly unknown[] = ['new', 'in_progress', 'completed'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isProgressSummary(value: unknown): value is ProgressSummary {
  return (
    isRecord(value) &&
    typeof value.artworkId === 'string' &&
    value.artworkId.length > 0 &&
    Number.isInteger(value.filledCount) &&
    (value.filledCount as number) >= 0 &&
    STATUSES.includes(value.status) &&
    isTime(value.startedAt) &&
    isTime(value.updatedAt) &&
    (value.completedAt === undefined || isTime(value.completedAt)) &&
    isTime(value.activeMs)
  );
}

/** Container-level guard; individual entries are filtered by `sanitizeIndex`. */
export function isProgressIndex(value: unknown): value is ProgressIndex {
  return isRecord(value) && isRecord(value.entries);
}

/** Drops invalid or mis-keyed entries so one bad record does not wipe all progress. */
export function sanitizeIndex(index: ProgressIndex): ProgressIndex {
  const entries: Record<string, ProgressSummary> = {};
  for (const [id, entry] of Object.entries(index.entries)) {
    if (isProgressSummary(entry) && entry.artworkId === id) entries[id] = entry;
  }
  return { entries };
}

export function isProgressCells(value: unknown): value is ProgressCells {
  return isRecord(value) && typeof value.filled === 'string';
}

export const progressIndexSchema: Schema<ProgressIndex> = {
  version: 1,
  migrations: {},
  guard: isProgressIndex,
  defaults: () => ({ entries: {} }),
};

export const progressCellsSchema: Schema<ProgressCells> = {
  version: 1,
  migrations: {},
  guard: isProgressCells,
  defaults: () => ({ filled: '' }),
};
