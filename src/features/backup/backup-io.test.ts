import AsyncStorage from '@react-native-async-storage/async-storage';

import { getArtwork } from '@/features/artwork/registry';
import { useDailyStore } from '@/features/daily/daily-store';
import { DEFAULT_ENTITLEMENTS } from '@/features/entitlements/can-access';
import { useEntitlementsStore } from '@/features/entitlements/entitlements-store';
import * as files from '@/features/files/files';
import { createProgressRepo } from '@/features/progress/progress-repo';
import type { ProgressSummary } from '@/features/progress/progress-schema';
import { createProgressStore, useProgressStore } from '@/features/progress/progress-store';
import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import { createSettingsStore, useSettingsStore } from '@/features/settings/settings-store';
import { countBits, createBitset, setBit } from '@/lib/bitset';
import { StorageKeys } from '@/lib/storage';

import { checksumOf, MAX_BACKUP_BYTES } from './backup-format';
import { applyImport, backupFileName, exportBackup, pickBackup } from './backup-io';

jest.mock('@/features/files/files', () => {
  const disk = new Map<string, string | Uint8Array>();
  class FileTooLargeError extends Error {}
  return {
    disk,
    FileTooLargeError,
    writeFile: jest.fn(async (location: string, folder: string, name: string, content: string | Uint8Array) => {
      const uri = `file:///${location}/${folder}/${name}`;
      disk.set(uri, content);
      return uri;
    }),
    shareFile: jest.fn(async () => true),
    pruneFolder: jest.fn(() => 0),
    pickFile: jest.fn(async () => null),
    readTextFile: jest.fn(async (uri: string, maxBytes: number) => {
      const content = disk.get(uri);
      if (typeof content !== 'string') throw new Error('missing');
      if (content.length > maxBytes) throw new FileTooLargeError();
      return content;
    }),
  };
});

const mocked = files as unknown as typeof files & {
  disk: Map<string, string | Uint8Array>;
  writeFile: jest.Mock;
  shareFile: jest.Mock;
  pickFile: jest.Mock;
  pruneFolder: jest.Mock;
};

const NOW = new Date(2026, 10, 14, 10, 0);

function artwork(id: string) {
  const a = getArtwork(id);
  if (!a) throw new Error(`missing ${id}`);
  return a;
}

function colored(id: string, count: number): { summary: ProgressSummary; bits: Uint8Array } {
  const a = artwork(id);
  const bits = createBitset(a.totalCells);
  for (let i = 0; i < count; i++) setBit(bits, i);
  const done = count === a.totalCells;
  const summary: ProgressSummary = {
    artworkId: id,
    filledCount: count,
    status: done ? 'completed' : 'in_progress',
    startedAt: 1000,
    updatedAt: 2000 + count,
    activeMs: 60_000,
  };
  if (done) summary.completedAt = 3000;
  return { summary, bits };
}

async function wipeDevice() {
  // "Reinstall": storage gone, every store back to its defaults.
  await useProgressStore.getState().removeAll();
  await useDailyStore.getState().reset();
  await useSettingsStore.getState().reset();
  await AsyncStorage.clear();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mocked.disk.clear();
  jest.clearAllMocks();
  await useSettingsStore.getState().hydrate();
  await useSettingsStore.getState().reset();
  await useProgressStore.getState().hydrate();
  await useProgressStore.getState().removeAll();
  await useDailyStore.getState().reset();
});

describe('backup export → reinstall → import', () => {
  it('restores progress, bitsets, streak and settings, and never purchases', async () => {
    const partial = colored('tabby-cat', 17);
    const done = colored('frog', artwork('frog').totalCells);
    await useProgressStore.getState().importEntries([partial, done]);
    const streak = { lastActiveDay: '2026-11-14', streak: 6, best: 11, jokerDays: ['2026-11-12'], activeDays: ['2026-11-13', '2026-11-14'] };
    await useDailyStore.getState().replace(streak);
    await useSettingsStore.getState().update({ colorblindSymbols: true, sessionTimerMin: 20 });

    await expect(exportBackup('Save', () => NOW)).resolves.toBe('shared');
    expect(mocked.writeFile).toHaveBeenCalledWith('cache', 'backups', 'fingerpaint-2026-11-14.fingerpaint', expect.any(String));
    const uri = mocked.writeFile.mock.results[0].value as Promise<string>;
    const fileUri = await uri;
    expect(mocked.shareFile).toHaveBeenCalledWith(fileUri, expect.objectContaining({ dialogTitle: 'Save' }));

    // Someone slips purchases into the file and fixes the checksum: they must be ignored.
    const file = JSON.parse(mocked.disk.get(fileUri) as string);
    file.payload.entitlements = { pro: true, packs: ['ocean'], source: 'mock' };
    file.entitlements = { pro: true };
    file.checksum = checksumOf(file.payload);
    mocked.disk.set(fileUri, JSON.stringify(file));

    await wipeDevice();
    expect(useProgressStore.getState().index).toEqual({});

    mocked.pickFile.mockResolvedValueOnce({ uri: fileUri, name: 'backup.fingerpaint', size: 1000 });
    const outcome = await pickBackup(NOW);
    expect(outcome.status).toBe('ready');
    if (outcome.status !== 'ready') return;
    expect(outcome.plan.summary).toMatchObject({ inFile: 2, added: 2, improved: 0, kept: 0, completedAfter: 1, streakAfter: 6 });
    await applyImport(outcome.backup, NOW);

    // Everything is back, in memory and in storage (fresh stores hydrate it).
    const fresh = createProgressStore(createProgressRepo());
    await fresh.getState().hydrate();
    expect(fresh.getState().index).toEqual({ 'tabby-cat': partial.summary, frog: done.summary });
    await expect(fresh.getState().loadFilled('tabby-cat', artwork('tabby-cat').totalCells)).resolves.toEqual(partial.bits);
    const frogBits = await fresh.getState().loadFilled('frog', artwork('frog').totalCells);
    expect(frogBits && countBits(frogBits)).toBe(artwork('frog').totalCells);
    expect(useDailyStore.getState().daily).toEqual(streak);
    expect(JSON.parse((await AsyncStorage.getItem(StorageKeys.daily)) ?? 'null').data).toEqual(streak);
    const settings = createSettingsStore();
    await settings.getState().hydrate();
    expect(settings.getState().settings).toEqual({ ...DEFAULT_SETTINGS, colorblindSymbols: true, sessionTimerMin: 20 });

    // Purchases never imported.
    expect(useEntitlementsStore.getState().entitlements).toBe(DEFAULT_ENTITLEMENTS);
    expect(await AsyncStorage.getItem(StorageKeys.entitlements)).toBeNull();
  });

  it('merges with local progress: the most advanced state wins per artwork', async () => {
    await useProgressStore.getState().importEntries([colored('tabby-cat', 5), colored('owl', 40)]);
    await exportBackup('Save', () => NOW);
    const fileUri = await (mocked.writeFile.mock.results[0].value as Promise<string>);
    // Meanwhile, more coloring on the device for the owl only.
    await useProgressStore.getState().importEntries([colored('owl', 50)]);
    await useProgressStore.getState().remove('tabby-cat');
    await useProgressStore.getState().importEntries([colored('tabby-cat', 2)]);

    mocked.pickFile.mockResolvedValueOnce({ uri: fileUri, name: 'b.fingerpaint' });
    const outcome = await pickBackup(NOW);
    if (outcome.status !== 'ready') throw new Error(`unexpected ${outcome.status}`);
    expect(outcome.plan.summary).toMatchObject({ improved: 1, kept: 1, added: 0 });
    await applyImport(outcome.backup, NOW);
    expect(useProgressStore.getState().index['tabby-cat'].filledCount).toBe(5);
    expect(useProgressStore.getState().index.owl.filledCount).toBe(50);
  });

  it('reports cancellation, oversized and altered files without touching anything', async () => {
    await expect(pickBackup(NOW)).resolves.toEqual({ status: 'cancelled' });

    mocked.pickFile.mockResolvedValueOnce({ uri: 'file:///x', name: 'x', size: MAX_BACKUP_BYTES + 1 });
    await expect(pickBackup(NOW)).resolves.toEqual({ status: 'error', error: 'too-large' });

    await useProgressStore.getState().importEntries([colored('tabby-cat', 5)]);
    await exportBackup('Save', () => NOW);
    const fileUri = await (mocked.writeFile.mock.results[0].value as Promise<string>);
    const text = mocked.disk.get(fileUri) as string;
    mocked.disk.set(fileUri, text.replace('"filledCount": 5', '"filledCount": 6'));
    mocked.pickFile.mockResolvedValueOnce({ uri: fileUri, name: 'b.fingerpaint' });
    await expect(pickBackup(NOW)).resolves.toEqual({ status: 'error', error: 'checksum' });

    mocked.pickFile.mockResolvedValueOnce({ uri: 'file:///missing', name: 'm' });
    await expect(pickBackup(NOW)).resolves.toEqual({ status: 'error', error: 'read-failed' });
    expect(useProgressStore.getState().index['tabby-cat'].filledCount).toBe(5);
  });

  it('re-plans from the current state when applying (changes made meanwhile are kept)', async () => {
    await useProgressStore.getState().importEntries([colored('tabby-cat', 5)]);
    await exportBackup('Save', () => NOW);
    const fileUri = await (mocked.writeFile.mock.results[0].value as Promise<string>);
    await useProgressStore.getState().remove('tabby-cat');

    mocked.pickFile.mockResolvedValueOnce({ uri: fileUri, name: 'b.fingerpaint' });
    const outcome = await pickBackup(NOW);
    if (outcome.status !== 'ready') throw new Error(`unexpected ${outcome.status}`);
    expect(outcome.plan.summary).toMatchObject({ added: 1, kept: 0 });

    // While the confirmation screen is open, the user colors further on this device.
    await useProgressStore.getState().importEntries([colored('tabby-cat', 8)]);
    const applied = await applyImport(outcome.backup, NOW);
    expect(applied.summary).toMatchObject({ added: 0, improved: 0, kept: 1 });
    expect(applied.writes).toEqual([]);
    expect(useProgressStore.getState().index['tabby-cat'].filledCount).toBe(8);
  });

  it('keeps only the latest exported backup in the cache', async () => {
    await exportBackup('Save', () => NOW);
    expect(mocked.pruneFolder).toHaveBeenCalledWith('cache', 'backups', expect.any(Function));
    const shouldDelete = mocked.pruneFolder.mock.calls[0][2] as (name: string) => boolean;
    expect(shouldDelete('fingerpaint-2026-11-14.fingerpaint')).toBe(false);
    expect(shouldDelete('fingerpaint-2026-11-01.fingerpaint')).toBe(true);
  });

  it('says when sharing is unavailable', async () => {
    mocked.shareFile.mockResolvedValueOnce(false);
    await expect(exportBackup('Save', () => NOW)).resolves.toBe('unavailable');
  });

  it('names files by local day', () => {
    expect(backupFileName(new Date(2026, 0, 2, 23, 30))).toBe('fingerpaint-2026-01-02.fingerpaint');
  });
});
