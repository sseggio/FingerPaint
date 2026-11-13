/** Versioned wrapper stored under every persistence key. */
export interface Envelope<T = unknown> {
  schemaVersion: number;
  /** Epoch ms of the write. */
  savedAt: number;
  data: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEnvelope(value: unknown): value is Envelope {
  return (
    isRecord(value) &&
    Number.isInteger(value.schemaVersion) &&
    (value.schemaVersion as number) >= 0 &&
    typeof value.savedAt === 'number' &&
    Number.isFinite(value.savedAt) &&
    'data' in value
  );
}

export function createEnvelope<T>(data: T, schemaVersion: number, savedAt: number = Date.now()): Envelope<T> {
  return { schemaVersion, savedAt, data };
}

/**
 * Parses a raw stored string into an envelope. Values written before envelopes existed
 * (valid JSON, but not an envelope) are treated as schema version 0 so migrations can lift
 * them. Returns undefined for unparsable JSON.
 */
export function parseEnvelope(raw: string): Envelope | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (isEnvelope(parsed)) return parsed;
  return { schemaVersion: 0, savedAt: 0, data: parsed };
}
