import type { Progress, ProgressSummary } from '@/features/progress/progress-schema';
import { isProgressSummary } from '@/features/progress/progress-schema';
import { isSettings, withNewerSettingsDefaults, type Settings } from '@/features/settings/settings-schema';
import { bitsetFromBase64, bitsetToBase64, countBits } from '@/lib/bitset';
import { canonicalJson, fnv1a64 } from '@/lib/checksum';
import { decodeFillOrder, encodeFillOrder } from '@/lib/fill-order';
import { isDailyState, type DailyState } from '@/lib/daily';

/**
 * `.pixeljoy` backup file (see docs/backup-format.md). A versioned JSON document:
 *
 * ```
 * { format: 'pixeljoy-backup', version: 1, createdAt, checksum, payload: { progress, daily, settings } }
 * ```
 *
 * `checksum` is the FNV-1a 64 of the canonical JSON of `payload`. Purchases / entitlements are
 * NEVER written, and anything that is not progress, streak or settings is ignored on import:
 * a backup can never unlock paid content.
 *
 * Since F18 a progress entry may carry `order`, its fill order journal (base64 little-endian
 * Uint16 cell indices). The field is optional and compatible: the format version stays 1, files
 * without it import as before (their replay order is completed on the fly), and older app
 * versions ignore it. An `order` that does not match its bitset is dropped on import (the
 * progress itself is kept, the checksum already guards against tampering).
 */
export const BACKUP_FORMAT = 'pixeljoy-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.pixeljoy';
/**
 * Files larger than this are refused before being parsed. A full V1 backup was ~100 KB; since
 * F33 a finished 256×256 artwork weighs ~190 KB (11 KB of bitset + 175 KB of fill order), so the
 * limit went from 5 MB to 16 MB: ~80 finished 256×256 artworks plus the whole catalog at
 * smaller sizes. Should a backup still exceed it, `serializeBackup` drops fill orders (optional,
 * the replay order is then completed on the fly) rather than writing a file that cannot be
 * imported. Builds up to 7 keep refusing files above 5 MB.
 */
export const MAX_BACKUP_BYTES = 16 * 1024 * 1024;
/** Upper bound on progress entries (far above the catalog size; guards against huge files). */
export const MAX_BACKUP_ENTRIES = 10_000;

/** One artwork's progress, decoded and checked against the catalog. */
export interface BackupArtwork {
  summary: ProgressSummary;
  bits: Uint8Array;
  /** Fill order journal (F18), when known; validated against `bits`. */
  order?: Uint16Array;
}

/** A progress entry as written in the file. */
export type BackupProgress = Progress & { order?: string };

/** What a backup carries once decoded. */
export interface BackupData {
  progress: Map<string, BackupArtwork>;
  daily: DailyState;
  settings: Settings;
}

export interface DecodedBackup extends BackupData {
  createdAt: number;
  /** Progress entries of artworks this version does not know (skipped, not imported). */
  unknownCount: number;
}

export interface BackupPayload {
  progress: Record<string, BackupProgress>;
  daily: DailyState;
  settings: Settings;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: number;
  checksum: string;
  payload: BackupPayload;
}

export type BackupError =
  | 'too-large'
  | 'not-json'
  | 'not-a-backup'
  | 'unsupported-version'
  | 'checksum'
  | 'invalid';

export type ParseResult = { ok: true; backup: DecodedBackup } | { ok: false; error: BackupError };

/**
 * Size of a catalog artwork: `cellCount` = grid cells (w×h, the bitset size), `totalCells` =
 * cells to color (non-empty). Both are needed: bitsets cover the whole grid, while completion is
 * counted on the cells to color.
 */
export interface CatalogSize {
  cellCount: number;
  totalCells: number;
}

/** Size of a catalog artwork, undefined when the id is unknown. */
export type CatalogLookup = (artworkId: string) => CatalogSize | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summaryOf(summary: ProgressSummary): ProgressSummary {
  // Copies only the known fields: nothing else from the store leaks into the file.
  const out: ProgressSummary = {
    artworkId: summary.artworkId,
    filledCount: summary.filledCount,
    status: summary.status,
    startedAt: summary.startedAt,
    updatedAt: summary.updatedAt,
    activeMs: summary.activeMs,
  };
  if (summary.completedAt !== undefined) out.completedAt = summary.completedAt;
  return out;
}

export function checksumOf(payload: unknown): string {
  return fnv1a64(canonicalJson(payload));
}

/**
 * Serializes a backup (pretty-printed JSON, newline-terminated). The result never exceeds
 * `maxBytes` because of fill orders: when it would, the largest orders are left out (progress,
 * streak and settings are always written in full).
 */
export function serializeBackup(data: BackupData, createdAt: number, maxBytes: number = MAX_BACKUP_BYTES): string {
  const progress: Record<string, BackupProgress> = {};
  for (const id of [...data.progress.keys()].sort()) {
    const entry = data.progress.get(id);
    if (!entry) continue;
    const out: BackupProgress = { ...summaryOf(entry.summary), filled: bitsetToBase64(entry.bits) };
    if (entry.order && entry.order.length > 0) out.order = encodeFillOrder(entry.order);
    progress[id] = out;
  }
  const payload: BackupPayload = {
    progress,
    daily: {
      lastActiveDay: data.daily.lastActiveDay,
      streak: data.daily.streak,
      best: data.daily.best,
      jokerDays: [...data.daily.jokerDays],
      activeDays: [...data.daily.activeDays],
    },
    settings: { ...data.settings },
  };
  const write = () => {
    const file: BackupFile = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt,
      checksum: checksumOf(payload),
      payload,
    };
    return `${JSON.stringify(file, null, 2)}\n`;
  };
  let text = write();
  // Base64 and JSON keys are ASCII: the string length is the byte size, except for non-ASCII
  // settings, a few bytes at most (covered by the margin below).
  if (text.length <= maxBytes) return text;
  const withOrder = Object.values(progress)
    .filter((p) => p.order !== undefined)
    .sort((a, b) => (b.order?.length ?? 0) - (a.order?.length ?? 0));
  let size = text.length;
  for (const p of withOrder) {
    if (size <= maxBytes - 1024) break;
    size -= (p.order?.length ?? 0) + 20;
    delete p.order;
  }
  text = write();
  return text;
}

/** Validates one progress entry against the catalog ('unknown' when the id is not in it). */
function decodeEntry(id: string, raw: unknown, catalog: CatalogLookup): BackupArtwork | BackupError | 'unknown' {
  const size = catalog(id);
  if (size === undefined) return 'unknown';
  const { cellCount, totalCells: total } = size;
  if (!isRecord(raw) || typeof raw.filled !== 'string') return 'invalid';
  const { filled, order: rawOrder, ...rest } = raw;
  if (!isProgressSummary(rest) || rest.artworkId !== id) return 'invalid';
  let bits: Uint8Array;
  try {
    bits = bitsetFromBase64(filled as string, cellCount);
  } catch {
    return 'invalid';
  }
  const count = countBits(bits);
  if (count !== rest.filledCount) return 'invalid';
  const expected = count === total ? 'completed' : count > 0 ? 'in_progress' : 'new';
  if (rest.status !== expected) return 'invalid';
  const entry: BackupArtwork = { summary: summaryOf(rest), bits };
  // Optional journal: kept only when it matches the bitset, otherwise dropped (not fatal).
  const order = rawOrder === undefined ? null : decodeFillOrder(rawOrder, bits, cellCount);
  if (order && order.length > 0) entry.order = order;
  return entry;
}

/**
 * Parses and strictly validates a backup: size, JSON, format marker, version, checksum, then
 * every field (bitsets must match their artwork's size and filled count). Artworks unknown to
 * this version (e.g. a backup from a newer one) are skipped and counted, not fatal. Unknown
 * members (e.g. an injected `entitlements`) are ignored. Never throws.
 */
export function parseBackup(text: string, catalog: CatalogLookup): ParseResult {
  // UTF-16 length is a lower bound of the byte size; the file size is also checked on read.
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-large' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) return { ok: false, error: 'not-a-backup' };
  if (parsed.version !== BACKUP_VERSION) return { ok: false, error: 'unsupported-version' };
  const { payload, checksum, createdAt } = parsed;
  if (typeof checksum !== 'string' || !isRecord(payload)) return { ok: false, error: 'invalid' };
  let actual: string;
  try {
    actual = checksumOf(payload);
  } catch {
    return { ok: false, error: 'invalid' };
  }
  if (actual !== checksum) return { ok: false, error: 'checksum' };
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt < 0) {
    return { ok: false, error: 'invalid' };
  }
  // Backups written before a setting existed get its default.
  const settings = withNewerSettingsDefaults(payload.settings);
  if (!isRecord(payload.progress) || !isDailyState(payload.daily) || !isSettings(settings)) {
    return { ok: false, error: 'invalid' };
  }
  const ids = Object.keys(payload.progress);
  if (ids.length > MAX_BACKUP_ENTRIES) return { ok: false, error: 'invalid' };
  const progress = new Map<string, BackupArtwork>();
  let unknownCount = 0;
  for (const id of ids) {
    const entry = decodeEntry(id, payload.progress[id], catalog);
    if (entry === 'unknown') {
      unknownCount++;
      continue;
    }
    if (typeof entry === 'string') return { ok: false, error: entry };
    progress.set(id, entry);
  }
  const daily = payload.daily;
  const s = settings;
  return {
    ok: true,
    backup: {
      createdAt,
      progress,
      unknownCount,
      daily: {
        lastActiveDay: daily.lastActiveDay,
        streak: daily.streak,
        best: daily.best,
        jokerDays: [...daily.jokerDays],
        activeDays: [...daily.activeDays],
      },
      // Only the known settings keys are kept.
      settings: {
        locale: s.locale,
        theme: s.theme,
        dragToFill: s.dragToFill,
        fillDelayMs: s.fillDelayMs,
        haptics: s.haptics,
        colorblindSymbols: s.colorblindSymbols,
        largeNumbers: s.largeNumbers,
        highContrast: s.highContrast,
        leftHanded: s.leftHanded,
        sessionTimerMin: s.sessionTimerMin,
        neonTheme: s.neonTheme,
        goldConfetti: s.goldConfetti,
      },
    },
  };
}
