import type { Schema } from '@/lib/storage';

/** At most this many errors are kept (the most recent ones). */
export const MAX_DIAGNOSTICS = 20;
/** Long messages / stacks are cut: the log stays small and readable. */
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_STACK_LENGTH = 2000;

/** One error caught on the device. Stays local: never sent anywhere. */
export interface DiagnosticEntry {
  /** Epoch ms. */
  at: number;
  /** Where it was caught, e.g. `gesture:tap.onActivate` or `js:fatal`. */
  source: string;
  message: string;
  /** Stack trace when the error carried one ('' otherwise). */
  stack: string;
}

export interface DiagnosticsData {
  entries: DiagnosticEntry[];
}

function isEntry(value: unknown): value is DiagnosticEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.at === 'number' &&
    Number.isFinite(e.at) &&
    typeof e.source === 'string' &&
    typeof e.message === 'string' &&
    typeof e.stack === 'string'
  );
}

export function isDiagnosticsData(value: unknown): value is DiagnosticsData {
  if (typeof value !== 'object' || value === null) return false;
  const entries = (value as Record<string, unknown>).entries;
  return Array.isArray(entries) && entries.length <= MAX_DIAGNOSTICS && entries.every(isEntry);
}

/** `fp:diagnostics` v1. */
export const diagnosticsSchema: Schema<DiagnosticsData> = {
  version: 1,
  migrations: {},
  guard: isDiagnosticsData,
  defaults: () => ({ entries: [] }),
};

function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Builds a bounded entry from anything thrown (never throws itself). */
export function toEntry(source: string, error: unknown, at: number, stack?: string): DiagnosticEntry {
  let message: string;
  try {
    message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  } catch {
    message = 'Unprintable error';
  }
  let trace = stack ?? '';
  if (!trace && error instanceof Error && typeof error.stack === 'string') trace = error.stack;
  return { at, source: cut(source, 100), message: cut(message, MAX_MESSAGE_LENGTH), stack: cut(trace, MAX_STACK_LENGTH) };
}

/** Newest first, capped to MAX_DIAGNOSTICS. */
export function appendEntry(entries: readonly DiagnosticEntry[], entry: DiagnosticEntry): DiagnosticEntry[] {
  return [entry, ...entries].slice(0, MAX_DIAGNOSTICS);
}

/** Plain-text report for the "Copy" button (shared by the user only, on their own action). */
export function formatReport(entries: readonly DiagnosticEntry[], header: string): string {
  const lines = [header];
  for (const e of entries) {
    lines.push('', `[${new Date(e.at).toISOString()}] ${e.source}`, e.message);
    if (e.stack) lines.push(e.stack);
  }
  return lines.join('\n');
}
