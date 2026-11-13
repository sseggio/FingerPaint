/** Lifts data from schema version n to n + 1. May throw on unexpected input. */
export type Migration = (data: unknown) => unknown;

/** Describes one persisted value: its current version, how to upgrade old data, and its guard. */
export interface Schema<T> {
  /** Current schema version (>= 1). */
  version: number;
  /** migrations[n] upgrades version n to n + 1. */
  migrations: Readonly<Record<number, Migration>>;
  /** Type guard for data at the current version. */
  guard: (data: unknown) => data is T;
  /** Fresh defaults, used when nothing valid is stored. */
  defaults: () => T;
}

export type MigrationResult<T> =
  | { ok: true; data: T; migrated: boolean }
  | { ok: false; reason: 'unknown-version' | 'missing-migration' | 'migration-failed' | 'invalid' };

/** Runs migrations from `fromVersion` up to `schema.version`, then the type guard. Never throws. */
export function migrate<T>(data: unknown, fromVersion: number, schema: Schema<T>): MigrationResult<T> {
  if (!Number.isInteger(fromVersion) || fromVersion < 0 || fromVersion > schema.version) {
    return { ok: false, reason: 'unknown-version' };
  }
  let current = data;
  for (let v = fromVersion; v < schema.version; v++) {
    const step = schema.migrations[v];
    if (!step) return { ok: false, reason: 'missing-migration' };
    try {
      current = step(current);
    } catch {
      return { ok: false, reason: 'migration-failed' };
    }
  }
  if (!schema.guard(current)) return { ok: false, reason: 'invalid' };
  return { ok: true, data: current, migrated: fromVersion !== schema.version };
}
