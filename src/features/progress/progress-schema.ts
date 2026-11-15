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

/**
 * Payload stored under `fp:progress:<id>`.
 * - v1: `{ filled }` (bitset only).
 * - v2 (F18): optional `order`, the fill order journal (base64 little-endian Uint16 cell
 *   indices, see `@/lib/fill-order`). v1 payloads migrate as they are: progress without a
 *   journal stays valid, its replay order is completed when needed.
 */
export interface ProgressCells {
  filled: string;
  /**
   * Written as a string; read back as `unknown` on purpose: it is validated against the bitset
   * by `decodeFillOrder`, and a bad journal only drops the journal, never the progress.
   */
  order?: unknown;
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

/** v1 → v2: same payload, without journal (only the bitset is carried over). */
function migrateCellsV1(data: unknown): ProgressCells {
  if (!isRecord(data) || typeof data.filled !== 'string') throw new Error('progress cells v1: invalid');
  return { filled: data.filled };
}

export const progressIndexSchema: Schema<ProgressIndex> = {
  version: 1,
  migrations: {},
  guard: isProgressIndex,
  defaults: () => ({ entries: {} }),
};

export const progressCellsSchema: Schema<ProgressCells> = {
  version: 2,
  migrations: { 1: migrateCellsV1 },
  guard: isProgressCells,
  defaults: () => ({ filled: '' }),
};
