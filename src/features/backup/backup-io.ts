import { create } from 'zustand';

import { getArtwork } from '@/features/artwork/registry';
import { useDailyStore } from '@/features/daily/daily-store';
import { FileTooLargeError, pickFile, readTextFile, shareFile, writeFile } from '@/features/files/files';
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
  const uri = await writeFile('cache', 'backups', backupFileName(date), text);
  // `application/octet-stream` keeps the `.fingerpaint` extension on iOS (no type is appended).
  const shared = await shareFile(uri, { mimeType: 'application/octet-stream', dialogTitle });
  return shared ? 'shared' : 'unavailable';
}

export type PickOutcome =
  | { status: 'cancelled' }
  | { status: 'error'; error: BackupError | 'read-failed' }
  | { status: 'ready'; plan: ImportPlan };

/** Reads, validates and plans an import from raw file text (nothing is applied). */
export function prepareImport(text: string, today: Date = new Date()): PickOutcome {
  const result = parseBackup(text, catalogLookup);
  if (!result.ok) return { status: 'error', error: result.error };
  const plan = planImport(
    { index: useProgressStore.getState().index, daily: useDailyStore.getState().daily },
    result.backup,
    toDayKey(today),
  );
  return { status: 'ready', plan };
}

/** Lets the user pick a backup file, then validates it and computes the merge plan. */
export async function pickBackup(today: Date = new Date()): Promise<PickOutcome> {
  const picked = await pickFile();
  if (!picked) return { status: 'cancelled' };
  if (picked.size !== undefined && picked.size > MAX_BACKUP_BYTES) return { status: 'error', error: 'too-large' };
  let text: string;
  try {
    text = await readTextFile(picked.uri, MAX_BACKUP_BYTES);
  } catch (e) {
    return { status: 'error', error: e instanceof FileTooLargeError ? 'too-large' : 'read-failed' };
  }
  return prepareImport(text, today);
}

/** Applies a confirmed plan: progress entries, merged streak, restored settings. */
export async function applyImport(plan: ImportPlan): Promise<void> {
  await useProgressStore.getState().importEntries(plan.writes);
  await useDailyStore.getState().replace(plan.daily);
  await useSettingsStore.getState().update(plan.settings);
}

/** Validated plan waiting for the user's confirmation (passed to the confirmation screen). */
export interface PendingImportState {
  plan: ImportPlan | null;
  setPlan(plan: ImportPlan | null): void;
}

export const usePendingImportStore = create<PendingImportState>()((set) => ({
  plan: null,
  setPlan: (plan) => set({ plan }),
}));
