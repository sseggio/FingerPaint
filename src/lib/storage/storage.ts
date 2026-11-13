import AsyncStorage from '@react-native-async-storage/async-storage';

import { createEnvelope, parseEnvelope } from './envelope';
import { migrate, type Schema } from './migrations';

/** Persistence keys (all prefixed `fp:`). */
export const StorageKeys = {
  settings: 'fp:settings',
  progressIndex: 'fp:progress-index',
  progress: (artworkId: string) => `fp:progress:${artworkId}`,
  daily: 'fp:daily',
  entitlements: 'fp:entitlements',
} as const;

/** Subset of the AsyncStorage API we rely on (injectable for tests). */
export interface StorageBackend {
  getItem(key: string): Promise<string | null>;
  multiSet(pairs: [string, string][]): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
}

export const defaultBackend: StorageBackend = AsyncStorage;

export type ReadStatus = 'ok' | 'missing' | 'migrated' | 'corrupt' | 'unknown-version' | 'error';

export interface ReadResult<T> {
  data: T;
  status: ReadStatus;
}

function warn(message: string) {
  if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
    console.warn(`[storage] ${message}`);
  }
}

/**
 * Reads, validates and migrates a value. Never throws: anything unreadable, unknown or
 * invalid resolves to `schema.defaults()` with a status describing why.
 */
export async function readValue<T>(
  key: string,
  schema: Schema<T>,
  backend: StorageBackend = defaultBackend,
): Promise<ReadResult<T>> {
  let raw: string | null;
  try {
    raw = await backend.getItem(key);
  } catch (e) {
    warn(`${key}: read failed (${String(e)})`);
    return { data: schema.defaults(), status: 'error' };
  }
  if (raw === null) return { data: schema.defaults(), status: 'missing' };

  const envelope = parseEnvelope(raw);
  if (!envelope) {
    warn(`${key}: unparsable JSON, using defaults`);
    return { data: schema.defaults(), status: 'corrupt' };
  }
  const result = migrate(envelope.data, envelope.schemaVersion, schema);
  if (!result.ok) {
    warn(`${key}: ${result.reason} (v${envelope.schemaVersion}), using defaults`);
    return {
      data: schema.defaults(),
      status: result.reason === 'unknown-version' ? 'unknown-version' : 'corrupt',
    };
  }
  return { data: result.data, status: result.migrated ? 'migrated' : 'ok' };
}

/** Serializes one value in its envelope (exposed for batched writes). */
export function serializeValue<T>(data: T, schema: Schema<T>, now: number = Date.now()): string {
  return JSON.stringify(createEnvelope(data, schema.version, now));
}

/** Writes a single value. Rejects on storage failure. */
export async function writeValue<T>(
  key: string,
  data: T,
  schema: Schema<T>,
  backend: StorageBackend = defaultBackend,
): Promise<void> {
  await backend.multiSet([[key, serializeValue(data, schema)]]);
}

export async function removeValue(key: string, backend: StorageBackend = defaultBackend): Promise<void> {
  await backend.removeItem(key);
}
