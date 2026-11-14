import { create } from 'zustand';

import { getArtwork } from '@/features/artwork/registry';
import { useDailyStore } from '@/features/daily/daily-store';
import { FileTooLargeError, pickFile, pruneFolder, readTextFile, shareFile, writeFile } from '@/features/files/files';
import { useProgressStore } from '@/features/progress/progress-store';
import { useSettingsStore } from '@/features/settings/settings-store';
import { toDayKey } from '@/lib/daily';

import {
  BACKUP_EXTENSION,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  type BackupArtwork,
  type BackupData,
  type BackupError,
  type CatalogLookup,
  type DecodedBackup,
} from './backup-format';
import { planImport, type ImportPlan } from './backup-merge';

/** Catalog lookup over the bundled content. */
export const catalogLookup: CatalogLookup = (id) => getArtwork(id)?.totalCells;

/**
 * Snapshot of everything a backup carries: progress (index + bitsets), streak and settings.
 * Purchases are deliberately not read. Artworks no longer in the catalog, or whose bitset is
 * missing or corrupt, are skipped.
 */
export async function collectBackupData(): Promise<BackupData> {
  const progressStore = useProgressStore.getState();
  await progressStore.flush();
  const progress = new Map<string, BackupArtwork>();
  for (const [id, summary] of Object.entries(progressStore.index)) {
    const total = catalogLookup(id);
    if (total === undefined) continue;
    const bits = await progressStore.loadFilled(id, total);
    if (!bits) continue;
    progress.set(id, { summary, bits: bits.slice() });
  }
  return {
    progress,
    daily: useDailyStore.getState().daily,
    settings: useSettingsStore.getState().settings,
  };
}

export function backupFileName(date: Date): string {
  return `fingerpaint-${toDayKey(date)}${BACKUP_EXTENSION}`;
}

/** Writes a `.fingerpaint` file to the cache and opens the share sheet. */
export async function exportBackup(dialogTitle: string, now: () => Date = () => new Date()): Promise<'shared' | 'unavailable'> {
  const date = now();
  const text = serializeBackup(await collectBackupData(), date.getTime());
  const name = backupFileName(date);
  const uri = await writeFile('cache', 'backups', name, text);
  // Earlier exports are only temporary share copies: keep the latest one.
  pruneFolder('cache', 'backups', (file) => file !== name);
  // `application/octet-stream` keeps the `.fingerpaint` extension on iOS (no type is appended).
  const shared = await shareFile(uri, { mimeType: 'application/octet-stream', dialogTitle });
  return shared ? 'shared' : 'unavailable';
}

export type PickOutcome =
  | { status: 'cancelled' }
  | { status: 'error'; error: BackupError | 'read-failed' }
  | { status: 'ready'; backup: DecodedBackup; plan: ImportPlan };

/** Plans an import against the CURRENT local state (nothing is applied). */
export function planFromCurrentState(backup: DecodedBackup, today: Date = new Date()): ImportPlan {
  return planImport(
    { index: useProgressStore.getState().index, daily: useDailyStore.getState().daily },
    backup,
    toDayKey(today),
  );
}

/** Reads, validates and plans an import from raw file text (nothing is applied). */
export function prepareImport(text: string, today: Date = new Date()): PickOutcome {
  const result = parseBackup(text, catalogLookup);
  if (!result.ok) return { status: 'error', error: result.error };
  return { status: 'ready', backup: result.backup, plan: planFromCurrentState(result.backup, today) };
}

/** Lets the user pick a backup file, then validates it and computes the merge plan. */
export async function pickBackup(today: Date = new Date()): Promise<PickOutcome> {
  const picked = await pickFile();
  if (!picked) return { status: 'cancelled' };
  // Fast path only: some document providers report no size, or 0, for a file that is not empty.
  // `readTextFile` checks the real size again, and `parseBackup` the text length.
  if (picked.size !== undefined && picked.size > MAX_BACKUP_BYTES) return { status: 'error', error: 'too-large' };
  let text: string;
  try {
    text = await readTextFile(picked.uri, MAX_BACKUP_BYTES);
  } catch (e) {
    return { status: 'error', error: e instanceof FileTooLargeError ? 'too-large' : 'read-failed' };
  }
  return prepareImport(text, today);
}

/**
 * Applies a confirmed backup: progress entries, merged streak, restored settings. The merge is
 * recomputed from the current state at this moment (the user may have colored, or reset, while
 * the confirmation screen was open), so nothing done in between is overwritten. Returns the
 * plan actually applied.
 */
export async function applyImport(backup: DecodedBackup, today: Date = new Date()): Promise<ImportPlan> {
  const plan = planFromCurrentState(backup, today);
  await useProgressStore.getState().importEntries(plan.writes);
  await useDailyStore.getState().replace(plan.daily);
  await useSettingsStore.getState().update(plan.settings);
  return plan;
}

/** A validated backup and its preview plan, waiting for the user's confirmation. */
export interface PendingImport {
  backup: DecodedBackup;
  /** Preview shown on the confirmation screen (recomputed when applied). */
  plan: ImportPlan;
}

export interface PendingImportState {
  pending: PendingImport | null;
  setPending(pending: PendingImport | null): void;
}

export const usePendingImportStore = create<PendingImportState>()((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}));
