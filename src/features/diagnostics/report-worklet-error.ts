import { scheduleOnRN } from 'react-native-worklets';

import { recordWorkletError } from './diagnostics-store';

/**
 * Called from the `catch` of a gesture worklet (UI runtime): an exception there would abort the
 * app (F19). Hands the error to the JS runtime as plain strings, and never throws itself.
 */
export function reportWorkletError(source: string, error: unknown): void {
  'worklet';
  try {
    let stack = '';
    if (typeof error === 'object' && error !== null) {
      const s = (error as { stack?: unknown }).stack;
      if (typeof s === 'string') stack = s;
    }
    scheduleOnRN(recordWorkletError, `gesture:${source}`, String(error), stack);
  } catch {
    // Nothing else can be done safely from here.
  }
}
