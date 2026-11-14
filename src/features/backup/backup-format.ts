import type { Progress, ProgressSummary } from '@/features/progress/progress-schema';
import { isProgressSummary } from '@/features/progress/progress-schema';
import { isSettings, withNewerSettingsDefaults, type Settings } from '@/features/settings/settings-schema';
import { bitsetFromBase64, bitsetToBase64, countBits } from '@/lib/bitset';
import { canonicalJson, fnv1a64 } from '@/lib/checksum';
import { isDailyState, type DailyState } from '@/lib/daily';

/**
 * `.fingerpaint` backup file (see docs/backup-format.md). A versioned JSON document:
 *
 * ```
 * { format: 'fingerpaint-backup', version: 1, createdAt, checksum, payload: { progress, daily, settings } }
 * ```
 *
 * `checksum` is the FNV-1a 64 of the canonical JSON of `payload`. Purchases / entitlements are
 * NEVER written, and anything that is not progress, streak or settings is ignored on import:
 * a backup can never unlock paid content.
 */
export const BACKUP_FORMAT = 'fingerpaint-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_EXTENSION = '.fingerpaint';
/** Files larger than this are refused before being parsed (a full V1 backup is ~100 KB). */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
/** Upper bound on progress entries (far above the catalog size; guards against huge files). */
export const MAX_BACKUP_ENTRIES = 10_000;

/** One artwork's progress, decoded and checked against the catalog. */
export interface BackupArtwork {
  summary: ProgressSummary;
  bits: Uint8Array;
}

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
  progress: Record<string, Progress>;
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

/** Total cell count of a catalog artwork, undefined when the id is unknown. */
export type CatalogLookup = (artworkId: string) => number | undefined;

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

/** Serializes a backup (pretty-printed JSON, newline-terminated). */
export function serializeBackup(data: BackupData, createdAt: number): string {
  const progress: Record<string, Progress> = {};
  for (const id of [...data.progress.keys()].sort()) {
    const entry = data.progress.get(id);
    if (entry) progress[id] = { ...summaryOf(entry.summary), filled: bitsetToBase64(entry.bits) };
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
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    checksum: checksumOf(payload),
    payload,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Validates one progress entry against the catalog ('unknown' when the id is not in it). */
function decodeEntry(id: string, raw: unknown, catalog: CatalogLookup): BackupArtwork | BackupError | 'unknown' {
  const total = catalog(id);
  if (total === undefined) return 'unknown';
  if (!isRecord(raw) || typeof raw.filled !== 'string') return 'invalid';
  const { filled, ...rest } = raw;
  if (!isProgressSummary(rest) || rest.artworkId !== id) return 'invalid';
  let bits: Uint8Array;
  try {
    bits = bitsetFromBase64(filled as string, total);
  } catch {
    return 'invalid';
  }
  const count = countBits(bits);
  if (count !== rest.filledCount) return 'invalid';
  const expected = count === total ? 'completed' : count > 0 ? 'in_progress' : 'new';
  if (rest.status !== expected) return 'invalid';
  return { summary: summaryOf(rest), bits };
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
