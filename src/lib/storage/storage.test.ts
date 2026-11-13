import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, isEnvelope, parseEnvelope } from './envelope';
import { migrate, type Schema } from './migrations';
import { readValue, removeValue, StorageKeys, writeValue } from './storage';

interface Counter {
  count: number;
  label: string;
}

const isCounter = (v: unknown): v is Counter =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Counter).count === 'number' &&
  typeof (v as Counter).label === 'string';

/** v0 stored a bare number; v1 wraps it with a label. */
const counterSchema: Schema<Counter> = {
  version: 1,
  migrations: {
    0: (data) => {
      if (typeof data !== 'number') throw new Error('not a number');
      return { count: data, label: 'migrated' };
    },
  },
  guard: isCounter,
  defaults: () => ({ count: 0, label: 'default' }),
};

const KEY = 'fp:test';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('envelope', () => {
  it('builds and recognizes envelopes', () => {
    const env = createEnvelope({ a: 1 }, 3, 1000);
    expect(env).toEqual({ schemaVersion: 3, savedAt: 1000, data: { a: 1 } });
    expect(isEnvelope(env)).toBe(true);
    expect(isEnvelope({ schemaVersion: -1, savedAt: 0, data: 1 })).toBe(false);
    expect(isEnvelope({ schemaVersion: 1, savedAt: 0 })).toBe(false);
    expect(isEnvelope(null)).toBe(false);
  });

  it('treats legacy (non-envelope) JSON as version 0 and rejects unparsable JSON', () => {
    expect(parseEnvelope('42')).toEqual({ schemaVersion: 0, savedAt: 0, data: 42 });
    expect(parseEnvelope('{not json')).toBeUndefined();
  });
});

describe('migrate', () => {
  it('runs n → n+1 steps then the guard', () => {
    expect(migrate(7, 0, counterSchema)).toEqual({ ok: true, data: { count: 7, label: 'migrated' }, migrated: true });
    expect(migrate({ count: 1, label: 'x' }, 1, counterSchema)).toEqual({
      ok: true,
      data: { count: 1, label: 'x' },
      migrated: false,
    });
  });

  it('reports failures without throwing', () => {
    expect(migrate({}, 2, counterSchema)).toEqual({ ok: false, reason: 'unknown-version' });
    expect(migrate('x', 0, counterSchema)).toEqual({ ok: false, reason: 'migration-failed' });
    expect(migrate({ count: 'x' }, 1, counterSchema)).toEqual({ ok: false, reason: 'invalid' });
    expect(migrate(1, 0, { ...counterSchema, migrations: {} })).toEqual({ ok: false, reason: 'missing-migration' });
  });
});

describe('storage (official AsyncStorage mock)', () => {
  it('returns defaults when nothing is stored', async () => {
    await expect(readValue(KEY, counterSchema)).resolves.toEqual({
      data: { count: 0, label: 'default' },
      status: 'missing',
    });
  });

  it('writes an envelope and reads it back', async () => {
    await writeValue(KEY, { count: 3, label: 'ok' }, counterSchema);
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? 'null');
    expect(stored).toMatchObject({ schemaVersion: 1, data: { count: 3, label: 'ok' } });
    expect(typeof stored.savedAt).toBe('number');
    await expect(readValue(KEY, counterSchema)).resolves.toEqual({ data: { count: 3, label: 'ok' }, status: 'ok' });
  });

  it.each([
    ['unparsable JSON', '{"schemaVersion":1,', 'corrupt'],
    ['wrong shape', JSON.stringify(createEnvelope({ count: 'nope' }, 1)), 'corrupt'],
    ['unknown future version', JSON.stringify(createEnvelope({ count: 1, label: 'x' }, 99)), 'unknown-version'],
    ['legacy garbage', JSON.stringify('hello'), 'corrupt'],
  ])('falls back to defaults on %s', async (_name, raw, status) => {
    await AsyncStorage.setItem(KEY, raw);
    await expect(readValue(KEY, counterSchema)).resolves.toEqual({
      data: { count: 0, label: 'default' },
      status,
    });
  });

  it('migrates v0 data on read', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(createEnvelope(5, 0)));
    await expect(readValue(KEY, counterSchema)).resolves.toEqual({
      data: { count: 5, label: 'migrated' },
      status: 'migrated',
    });
  });

  it('returns defaults when the backend throws', async () => {
    const backend = {
      getItem: jest.fn().mockRejectedValue(new Error('disk')),
      multiSet: jest.fn(),
      removeItem: jest.fn(),
    };
    await expect(readValue(KEY, counterSchema, backend)).resolves.toEqual({
      data: { count: 0, label: 'default' },
      status: 'error',
    });
  });

  it('removes values and exposes the documented keys', async () => {
    await writeValue(KEY, { count: 1, label: 'x' }, counterSchema);
    await removeValue(KEY);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(StorageKeys.progress('cat')).toBe('fp:progress:cat');
    expect(StorageKeys.settings).toBe('fp:settings');
    expect(StorageKeys.progressIndex).toBe('fp:progress-index');
  });
});
