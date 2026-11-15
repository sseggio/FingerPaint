import { useDiagnosticsStore } from './diagnostics-store';

/** A fatal error waits at most this long for its record to be written before the app goes down. */
export const FATAL_WRITE_TIMEOUT_MS = 500;

type Handler = (error: unknown, isFatal?: boolean) => void;

interface ErrorUtilsLike {
  setGlobalHandler(handler: Handler): void;
  getGlobalHandler(): Handler;
}

let installed = false;

/**
 * Records uncaught JS errors in the local diagnostics log, then delegates to the previous global
 * handler (red box in development, crash report in release). Idempotent.
 */
export function installGlobalErrorHandler(
  errorUtils: ErrorUtilsLike | null | undefined = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils,
  record: (source: string, error: unknown) => Promise<void> = (source, error) =>
    useDiagnosticsStore.getState().record(source, error),
): boolean {
  if (installed || !errorUtils) return false;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    let written: Promise<void> = Promise.resolve();
    try {
      written = record(isFatal ? 'js:fatal' : 'js:error', error);
    } catch {
      // The diagnostics must never get in the way of the error itself.
    }
    if (!isFatal) {
      previous(error, isFatal);
      return;
    }
    // Fatal: the previous handler ends the app, give the record a short chance to reach storage.
    let done = false;
    const delegate = () => {
      if (done) return;
      done = true;
      previous(error, isFatal);
    };
    const timer = setTimeout(delegate, FATAL_WRITE_TIMEOUT_MS);
    written.then(
      () => {
        clearTimeout(timer);
        delegate();
      },
      () => {
        clearTimeout(timer);
        delegate();
      },
    );
  });
  return true;
}

/** Test helper: allows installing again. */
export function resetGlobalErrorHandlerForTests(): void {
  installed = false;
}
