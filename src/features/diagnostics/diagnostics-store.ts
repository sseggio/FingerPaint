import { create } from 'zustand';

import { defaultBackend, readValue, StorageKeys, writeValue, type StorageBackend } from '@/lib/storage';

import { appendEntry, diagnosticsSchema, toEntry, type DiagnosticEntry } from './diagnostics-schema';

export interface DiagnosticsState {
  /** Newest first. */
  entries: DiagnosticEntry[];
  hydrated: boolean;
  /** Loads `fp:diagnostics` (empty on missing / corrupt data). Never rejects; idempotent. */
  hydrate(): Promise<void>;
  /** Records an error and persists it. Never rejects. */
  record(source: string, error: unknown, stack?: string): Promise<void>;
  clear(): Promise<void>;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.warn(`[diagnostics] ${message}`);
  }
}

/**
 * Local log of the last errors caught on the device (F19). Offline only: nothing is ever sent;
 * the user may copy the report from "About" and share it themselves.
 */
export function createDiagnosticsStore(backend: StorageBackend = defaultBackend, now: () => number = Date.now) {
  let loading: Promise<void> | null = null;
  // Writes are chained: two quick records never land out of order.
  let writes: Promise<void> = Promise.resolve();

  return create<DiagnosticsState>()((set, get) => {
    const persist = () => {
      writes = writes.then(async () => {
        try {
          await writeValue(StorageKeys.diagnostics, { entries: get().entries }, diagnosticsSchema, backend);
        } catch (e) {
          warn(`write failed: ${String(e)}`);
        }
      });
      return writes;
    };

    const hydrate = () => {
      loading ??= readValue(StorageKeys.diagnostics, diagnosticsSchema, backend).then(({ data }) => {
        // Errors recorded while reading come first (newest), then the stored ones.
        let entries = data.entries;
        for (const e of [...get().entries].reverse()) entries = appendEntry(entries, e);
        set({ entries, hydrated: true });
      });
      return loading;
    };

    return {
      entries: [],
      hydrated: false,
      hydrate,
      async record(source, error, stack) {
        try {
          set({ entries: appendEntry(get().entries, toEntry(source, error, now(), stack)) });
          await hydrate();
          await persist();
        } catch (e) {
          warn(`record failed: ${String(e)}`);
        }
      },
      async clear() {
        await hydrate();
        set({ entries: [] });
        await persist();
      },
    };
  });
}

export const useDiagnosticsStore = createDiagnosticsStore();

/**
 * Receives an error caught in a worklet (UI runtime) through `scheduleOnRN`: plain strings only
 * cross the runtimes.
 */
export function recordWorkletError(source: string, message: string, stack: string): void {
  void useDiagnosticsStore.getState().record(source, message, stack);
}
