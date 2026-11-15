import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, StorageKeys } from '@/lib/storage';

import {
  appendEntry,
  formatReport,
  isDiagnosticsData,
  MAX_DIAGNOSTICS,
  MAX_MESSAGE_LENGTH,
  toEntry,
  type DiagnosticEntry,
} from './diagnostics-schema';
import { createDiagnosticsStore, useDiagnosticsStore } from './diagnostics-store';
import { FATAL_WRITE_TIMEOUT_MS, installGlobalErrorHandler, resetGlobalErrorHandlerForTests } from './global-error-handler';
import { reportWorkletError } from './report-worklet-error';

const entry = (at: number): DiagnosticEntry => ({ at, source: 'test', message: `error ${at}`, stack: '' });

async function stored(): Promise<unknown> {
  const raw = await AsyncStorage.getItem(StorageKeys.diagnostics);
  return raw === null ? null : JSON.parse(raw);
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('diagnostics schema', () => {
  it('validates the stored data', () => {
    expect(isDiagnosticsData({ entries: [] })).toBe(true);
    expect(isDiagnosticsData({ entries: [entry(1)] })).toBe(true);
    expect(isDiagnosticsData({ entries: [{ ...entry(1), at: 'now' }] })).toBe(false);
    expect(isDiagnosticsData({ entries: Array.from({ length: MAX_DIAGNOSTICS + 1 }, (_, k) => entry(k)) })).toBe(false);
    expect(isDiagnosticsData(null)).toBe(false);
    expect(isDiagnosticsData({})).toBe(false);
  });

  it('keeps the newest entries first, at most MAX_DIAGNOSTICS', () => {
    let entries: DiagnosticEntry[] = [];
    for (let k = 0; k < MAX_DIAGNOSTICS + 5; k++) entries = appendEntry(entries, entry(k));
    expect(entries).toHaveLength(MAX_DIAGNOSTICS);
    expect(entries[0].at).toBe(MAX_DIAGNOSTICS + 4);
    expect(entries[MAX_DIAGNOSTICS - 1].at).toBe(5);
  });

  it('builds bounded entries from anything thrown', () => {
    const e = toEntry('js:error', new TypeError('nope'), 3);
    expect(e.message).toBe('TypeError: nope');
    expect(e.stack).toContain('nope');
    expect(toEntry('w', 'plain', 1, 'given stack').stack).toBe('given stack');
    expect(toEntry('w', 'x'.repeat(MAX_MESSAGE_LENGTH * 2), 1).message.length).toBe(MAX_MESSAGE_LENGTH + 1);
    const unprintable = {
      toString() {
        throw new Error('no');
      },
    };
    expect(toEntry('w', unprintable, 1).message).toBe('Unprintable error');
  });

  it('formats a plain-text report', () => {
    const report = formatReport([{ at: 0, source: 'gesture:tap', message: 'boom', stack: 'at x' }], 'Header');
    expect(report).toBe('Header\n\n[1970-01-01T00:00:00.000Z] gesture:tap\nboom\nat x');
  });
});

describe('diagnostics store', () => {
  it('persists the records in a versioned envelope and reads them back', async () => {
    const store = createDiagnosticsStore(AsyncStorage, () => 42);
    await store.getState().record('js:error', new Error('first'));
    const envelope = (await stored()) as { schemaVersion: number; data: { entries: DiagnosticEntry[] } };
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.data.entries[0]).toMatchObject({ at: 42, source: 'js:error', message: 'Error: first' });

    const again = createDiagnosticsStore(AsyncStorage);
    await again.getState().hydrate();
    expect(again.getState().entries).toHaveLength(1);
  });

  it('keeps records made before hydration on top of the stored ones', async () => {
    await AsyncStorage.setItem(
      StorageKeys.diagnostics,
      JSON.stringify(createEnvelope({ entries: [entry(1)] }, 1)),
    );
    const store = createDiagnosticsStore(AsyncStorage, () => 9);
    await store.getState().record('js:error', 'late');
    expect(store.getState().entries.map((e) => e.at)).toEqual([9, 1]);
  });

  it('starts empty on corrupt or unknown data', async () => {
    await AsyncStorage.setItem(StorageKeys.diagnostics, '{not json');
    const store = createDiagnosticsStore(AsyncStorage);
    await store.getState().hydrate();
    expect(store.getState().entries).toEqual([]);

    await AsyncStorage.setItem(StorageKeys.diagnostics, JSON.stringify(createEnvelope({ entries: [entry(1)] }, 99)));
    const future = createDiagnosticsStore(AsyncStorage);
    await future.getState().hydrate();
    expect(future.getState().entries).toEqual([]);
  });

  it('never rejects when the storage fails, and clears', async () => {
    const backend = {
      getItem: jest.fn(() => Promise.reject(new Error('io'))),
      multiSet: jest.fn(() => Promise.reject(new Error('io'))),
      removeItem: jest.fn(() => Promise.resolve()),
    };
    const store = createDiagnosticsStore(backend);
    await expect(store.getState().record('js:error', 'x')).resolves.toBeUndefined();
    expect(store.getState().entries).toHaveLength(1);
    await store.getState().clear();
    expect(store.getState().entries).toEqual([]);
  });
});

describe('worklet errors', () => {
  afterEach(async () => {
    await useDiagnosticsStore.getState().clear();
  });

  it('cross to the JS runtime as strings and are recorded', async () => {
    reportWorkletError('tap.onActivate', new RangeError('out'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await useDiagnosticsStore.getState().hydrate();
    const [e] = useDiagnosticsStore.getState().entries;
    expect(e.source).toBe('gesture:tap.onActivate');
    expect(e.message).toBe('RangeError: out');
    expect(e.stack).toContain('out');
  });

  it('never throw, even for odd values', () => {
    expect(() => reportWorkletError('x', undefined)).not.toThrow();
    expect(() => reportWorkletError('x', Object.create(null))).not.toThrow();
  });
});

describe('global error handler', () => {
  afterEach(() => {
    resetGlobalErrorHandlerForTests();
    jest.useRealTimers();
  });

  function fakeErrorUtils() {
    const previous = jest.fn();
    let handler: (error: unknown, isFatal?: boolean) => void = previous;
    return {
      previous,
      utils: {
        getGlobalHandler: () => handler,
        setGlobalHandler: (h: typeof handler) => {
          handler = h;
        },
      },
      fire: (error: unknown, isFatal?: boolean) => handler(error, isFatal),
    };
  }

  it('records the error, then delegates to the previous handler (once installed)', async () => {
    const { previous, utils, fire } = fakeErrorUtils();
    const record = jest.fn(() => Promise.resolve());
    expect(installGlobalErrorHandler(utils, record)).toBe(true);
    expect(installGlobalErrorHandler(utils, record)).toBe(false);
    const error = new Error('oops');
    fire(error, false);
    expect(record).toHaveBeenCalledWith('js:error', error);
    expect(previous).toHaveBeenCalledWith(error, false);

    fire(error, true);
    expect(record).toHaveBeenCalledWith('js:fatal', error);
    // Fatal: delegated once the record is written.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(previous).toHaveBeenCalledTimes(2);
    expect(previous).toHaveBeenLastCalledWith(error, true);
  });

  it('a fatal error is delegated after a short timeout if the write hangs, and recording errors are ignored', () => {
    jest.useFakeTimers();
    const { previous, utils, fire } = fakeErrorUtils();
    installGlobalErrorHandler(utils, () => new Promise(() => undefined));
    fire('fatal', true);
    expect(previous).not.toHaveBeenCalled();
    jest.advanceTimersByTime(FATAL_WRITE_TIMEOUT_MS);
    expect(previous).toHaveBeenCalledTimes(1);

    resetGlobalErrorHandlerForTests();
    const second = fakeErrorUtils();
    installGlobalErrorHandler(second.utils, () => {
      throw new Error('record failed');
    });
    second.fire('x', false);
    expect(second.previous).toHaveBeenCalledWith('x', false);
  });

  it('does nothing without ErrorUtils', () => {
    expect(installGlobalErrorHandler(null)).toBe(false);
  });
});
