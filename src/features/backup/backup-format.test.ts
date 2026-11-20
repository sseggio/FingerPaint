import { DEFAULT_SETTINGS } from '@/features/settings/settings-schema';
import type { ProgressSummary } from '@/features/progress/progress-schema';
import { bitsetToBase64, createBitset, setBit } from '@/lib/bitset';
import { canonicalJson, fnv1a64 } from '@/lib/checksum';
import { encodeFillOrder } from '@/lib/fill-order';
import type { DailyState } from '@/lib/daily';

import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  checksumOf,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  type BackupArtwork,
  type BackupData,
  type CatalogLookup,
} from './backup-format';

const CATALOG: Record<string, number> = { cat: 20, fish: 9 };
const catalog: CatalogLookup = (id) =>
  Object.prototype.hasOwnProperty.call(CATALOG, id) ? { cellCount: CATALOG[id], totalCells: CATALOG[id] } : undefined;

function bitsWith(total: number, count: number): Uint8Array {
  const bits = createBitset(total);
  for (let i = 0; i < count; i++) setBit(bits, i);
  return bits;
}

function summary(artworkId: string, filledCount: number, status: ProgressSummary['status']): ProgressSummary {
  const s: ProgressSummary = { artworkId, filledCount, status, startedAt: 100, updatedAt: 200, activeMs: 5000 };
  if (status === 'completed') s.completedAt = 300;
  return s;
}

const daily: DailyState = {
  lastActiveDay: '2026-11-13',
  streak: 4,
  best: 9,
  jokerDays: ['2026-11-11'],
  activeDays: ['2026-11-09', '2026-11-10', '2026-11-12', '2026-11-13'],
};

function sample(): BackupData {
  return {
    progress: new Map([
      ['cat', { summary: summary('cat', 3, 'in_progress'), bits: bitsWith(20, 3) }],
      ['fish', { summary: summary('fish', 9, 'completed'), bits: bitsWith(9, 9) }],
    ]),
    daily,
    settings: { ...DEFAULT_SETTINGS, colorblindSymbols: true, locale: 'fr' },
  };
}

/** Re-signs an edited file so that only the targeted check can fail. */
function resign(file: Record<string, unknown>): string {
  return JSON.stringify({ ...file, checksum: checksumOf(file.payload) });
}

function fileOf(text: string): Record<string, unknown> & { payload: Record<string, unknown> } {
  return JSON.parse(text);
}

describe('serializeBackup / parseBackup', () => {
  it('round-trips progress, bitsets, streak and settings', () => {
    const text = serializeBackup(sample(), 1_700_000_000_000);
    const result = parseBackup(text, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.createdAt).toBe(1_700_000_000_000);
    expect([...result.backup.progress.keys()]).toEqual(['cat', 'fish']);
    expect(result.backup.progress.get('cat')).toEqual({ summary: summary('cat', 3, 'in_progress'), bits: bitsWith(20, 3) });
    expect(result.backup.progress.get('fish')?.summary.completedAt).toBe(300);
    expect(result.backup.daily).toEqual(daily);
    expect(result.backup.settings).toEqual({ ...DEFAULT_SETTINGS, colorblindSymbols: true, locale: 'fr' });
  });

  it('writes a versioned, checksummed document', () => {
    const file = fileOf(serializeBackup(sample(), 1));
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.version).toBe(BACKUP_VERSION);
    expect(file.checksum).toBe(fnv1a64(canonicalJson(file.payload)));
    expect(file.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect((file.payload.progress as Record<string, { filled: string }>).cat.filled).toBe(bitsetToBase64(bitsWith(20, 3)));
  });

  it('never writes purchases or entitlements', () => {
    const text = serializeBackup(sample(), 1);
    expect(text).not.toMatch(/entitlement|purchase|pro"|pack/i);
    expect(Object.keys(fileOf(text).payload).sort()).toEqual(['daily', 'progress', 'settings']);
  });

  it('accepts a re-formatted file (checksum over canonical JSON)', () => {
    const file = fileOf(serializeBackup(sample(), 1));
    expect(parseBackup(JSON.stringify(file), catalog).ok).toBe(true);
  });

  it('ignores injected purchases even when the file is re-signed', () => {
    const file = fileOf(serializeBackup(sample(), 1));
    file.payload.entitlements = { pro: true, packs: ['all'] };
    file.entitlements = { pro: true };
    const result = parseBackup(resign(file), catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.backup).sort()).toEqual(['createdAt', 'daily', 'progress', 'settings', 'unknownCount']);
    expect(JSON.stringify(result.backup.settings)).not.toMatch(/pro|pack/);
  });
});

describe('fill order journal (F18)', () => {
  function withJournal(): BackupData {
    const data = sample();
    data.progress.set('cat', { summary: summary('cat', 3, 'in_progress'), bits: bitsWith(20, 3), order: Uint16Array.from([2, 0, 1]) });
    return data;
  }

  it('round-trips an optional journal without changing the format version', () => {
    const text = serializeBackup(withJournal(), 1);
    const file = fileOf(text);
    expect(file.version).toBe(1);
    const progress = file.payload.progress as Record<string, { order?: string }>;
    expect(progress.cat.order).toBe(encodeFillOrder(Uint16Array.from([2, 0, 1])));
    expect(progress.fish).not.toHaveProperty('order');
    const result = parseBackup(text, catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.progress.get('cat')?.order).toEqual(Uint16Array.from([2, 0, 1]));
    expect(result.backup.progress.get('fish')).not.toHaveProperty('order');
  });

  it('still imports files written before the journal existed', () => {
    const result = parseBackup(serializeBackup(sample(), 1), catalog);
    expect(result.ok && result.backup.progress.get('cat')).toEqual({ summary: summary('cat', 3, 'in_progress'), bits: bitsWith(20, 3) });
  });

  it.each([
    ['a cell not filled', encodeFillOrder(Uint16Array.from([0, 5]))],
    ['a duplicate', encodeFillOrder(Uint16Array.from([0, 0]))],
    ['an index outside the grid', encodeFillOrder(Uint16Array.from([25]))],
    ['malformed base64', '###'],
    ['the wrong type', 12],
  ])('drops a journal with %s and keeps the progress', (_name, order) => {
    const file = fileOf(serializeBackup(sample(), 1));
    (file.payload.progress as Record<string, Record<string, unknown>>).cat.order = order;
    const result = parseBackup(resign(file), catalog);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.progress.get('cat')).toEqual({ summary: summary('cat', 3, 'in_progress'), bits: bitsWith(20, 3) });
  });
});

describe('parseBackup rejections', () => {
  const base = () => fileOf(serializeBackup(sample(), 1));
  const expectError = (text: string, error: string) => expect(parseBackup(text, catalog)).toEqual({ ok: false, error });

  it('rejects an unknown (future or past) version', () => {
    expectError(JSON.stringify({ ...base(), version: 2 }), 'unsupported-version');
    expectError(JSON.stringify({ ...base(), version: 0 }), 'unsupported-version');
    expectError(JSON.stringify({ ...base(), version: '1' }), 'unsupported-version');
  });

  it('rejects an altered file (checksum mismatch)', () => {
    const file = base();
    (file.payload.daily as DailyState).streak = 400;
    (file.payload.daily as DailyState).best = 400;
    expectError(JSON.stringify(file), 'checksum');
    const text = serializeBackup(sample(), 1);
    expectError(text.replace('"streak": 4', '"streak": 3'), 'checksum');
    expectError(JSON.stringify({ ...base(), checksum: undefined }), 'invalid');
  });

  it('rejects a file that is too large without parsing it', () => {
    const parse = jest.spyOn(JSON, 'parse');
    expectError(' '.repeat(MAX_BACKUP_BYTES + 1), 'too-large');
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('rejects non-JSON and foreign JSON', () => {
    expectError('{"format":', 'not-json');
    expectError('[]', 'not-a-backup');
    expectError(JSON.stringify({ ...base(), format: 'other-app' }), 'not-a-backup');
  });

  it('skips and counts unknown artwork ids instead of rejecting the file', () => {
    const file = base();
    const progress = file.payload.progress as Record<string, unknown>;
    progress.dragon = { ...summary('dragon', 1, 'in_progress'), filled: bitsetToBase64(bitsWith(8, 1)) };
    progress.unicorn = 'whatever: never decoded';
    const result = parseBackup(resign(file), catalog);
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.unknownCount).toBe(2);
    expect([...result.backup.progress.keys()].sort()).toEqual(['cat', 'fish']);

    const proto = base();
    (proto.payload.progress as Record<string, unknown>)['constructor'] = (proto.payload.progress as Record<string, unknown>).cat;
    const protoResult = parseBackup(resign(proto), catalog);
    if (!protoResult.ok) throw new Error(protoResult.error);
    expect(protoResult.backup.unknownCount).toBe(1);
    expect(protoResult.backup.progress.has('constructor')).toBe(false);
  });

  it('still rejects an invalid entry of a known artwork', () => {
    const file = base();
    (file.payload.progress as Record<string, unknown>).cat = { filled: 'AAAA' };
    expectError(resign(file), 'invalid');
  });

  it('accepts backups written before the cosmetic settings existed', () => {
    const file = base();
    const settings = file.payload.settings as Record<string, unknown>;
    delete settings.neonTheme;
    delete settings.goldConfetti;
    const result = parseBackup(resign(file), catalog);
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.settings).toMatchObject({ neonTheme: true, goldConfetti: true });
  });

  it('accepts backups written before the long-press delay existed, and restores it when present (F23)', () => {
    const old = base();
    delete (old.payload.settings as Record<string, unknown>).fillDelayMs;
    const result = parseBackup(resign(old), catalog);
    if (!result.ok) throw new Error(result.error);
    expect(result.backup.settings.fillDelayMs).toBe(150);

    const custom = base();
    (custom.payload.settings as Record<string, unknown>).fillDelayMs = 250;
    const restored = parseBackup(resign(custom), catalog);
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.backup.settings.fillDelayMs).toBe(250);

    const invalid = base();
    (invalid.payload.settings as Record<string, unknown>).fillDelayMs = 999;
    expectError(resign(invalid), 'invalid');
  });

  it('rejects bitsets of the wrong length, bits beyond the grid and mismatched counts', () => {
    const wrongLength = base();
    (wrongLength.payload.progress as Record<string, { filled: string }>).cat.filled = bitsetToBase64(bitsWith(9, 3));
    expectError(resign(wrongLength), 'invalid');

    const beyond = base();
    const overflow = bitsWith(24, 3); // 3 bytes, like 20 bits, but bit 23 set past the grid
    setBit(overflow, 23);
    (beyond.payload.progress as Record<string, { filled: string; filledCount: number }>).cat.filled = bitsetToBase64(overflow);
    (beyond.payload.progress as Record<string, { filled: string; filledCount: number }>).cat.filledCount = 4;
    expectError(resign(beyond), 'invalid');

    const count = base();
    (count.payload.progress as Record<string, { filledCount: number }>).cat.filledCount = 5;
    expectError(resign(count), 'invalid');

    const garbage = base();
    (garbage.payload.progress as Record<string, { filled: string }>).cat.filled = '!!!!';
    expectError(resign(garbage), 'invalid');
  });

  it('rejects inconsistent statuses and malformed sections', () => {
    const status = base();
    (status.payload.progress as Record<string, { status: string }>).cat.status = 'completed';
    expectError(resign(status), 'invalid');

    const key = base();
    (key.payload.progress as Record<string, { artworkId: string }>).cat.artworkId = 'fish';
    expectError(resign(key), 'invalid');

    const settings = base();
    (settings.payload.settings as Record<string, unknown>).theme = 'neon';
    expectError(resign(settings), 'invalid');

    const streak = base();
    (streak.payload.daily as Record<string, unknown>).best = 1;
    expectError(resign(streak), 'invalid');

    const created = base();
    created.createdAt = -5;
    expectError(resign(created), 'invalid');
  });
});

describe('256×256 artworks (F33)', () => {
  const N = 256 * 256;
  const big: CatalogLookup = (id) => (id.startsWith('mural-') ? { cellCount: N, totalCells: N } : undefined);
  const fullOrder = () => {
    const order = new Uint16Array(N);
    for (let k = 0; k < N; k++) order[k] = N - 1 - k;
    return order;
  };
  function bigData(count: number): BackupData {
    const progress = new Map<string, BackupArtwork>();
    for (let i = 0; i < count; i++) {
      const id = `mural-${i}`;
      progress.set(id, { summary: summary(id, N, 'completed'), bits: createBitset(N).fill(255), order: fullOrder() });
    }
    return { progress, daily, settings: { ...DEFAULT_SETTINGS } };
  }

  it('round-trips finished artworks with their full 65 536-cell fill order', () => {
    const text = serializeBackup(bigData(2), 1);
    // ~190 KB per finished 256×256 artwork: dozens fit under the limit.
    expect(text.length).toBeLessThan(2 * 200 * 1024);
    expect(Math.floor(MAX_BACKUP_BYTES / (text.length / 2))).toBeGreaterThanOrEqual(80);
    const r = parseBackup(text, big);
    if (!r.ok) throw new Error(r.error);
    expect(r.backup.progress.get('mural-1')?.order?.length).toBe(N);
    expect(r.backup.progress.get('mural-1')?.order?.[0]).toBe(N - 1);
  });

  it('drops fill orders rather than writing a file above the size limit', () => {
    const limit = 500 * 1024;
    const text = serializeBackup(bigData(4), 1, limit);
    expect(text.length).toBeLessThanOrEqual(limit);
    const r = parseBackup(text, big);
    if (!r.ok) throw new Error(r.error);
    // Progress is complete; some orders were left out (the replay completes them on the fly).
    expect(r.backup.progress.size).toBe(4);
    const kept = [...r.backup.progress.values()].filter((e) => e.order).length;
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(4);
  });
});
