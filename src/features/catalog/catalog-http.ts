/**
 * Minimal HTTP layer of the catalog sync. Requests are anonymous on purpose: no cookies
 * (`credentials: 'omit'`), no identifying header (only `Accept` and, for the manifest,
 * `If-None-Match`), no redirect followed (a redirect could leave the catalog host).
 */

export interface HttpResponse {
  status: number;
  headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface HttpRequestInit {
  method: 'GET';
  headers: Record<string, string>;
  credentials: 'omit';
  redirect: 'error';
  signal: AbortSignal;
}

export type HttpFetch = (url: string, init: HttpRequestInit) => Promise<HttpResponse>;

export const REQUEST_TIMEOUT_MS = 10_000;

export class HttpError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'timeout' | 'status' | 'too-large',
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export type GetResult = { status: 304; etag: string | null } | { status: 200; etag: string | null; bytes: Uint8Array };

/**
 * GET with a hard timeout and a byte limit. Resolves 200 (with the body) or 304; rejects with
 * HttpError for anything else.
 */
export async function httpGet(
  fetchFn: HttpFetch,
  url: string,
  options: { maxBytes: number; etag?: string | null; timeoutMs?: number },
): Promise<GetResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new HttpError('timeout', 'timeout'));
    }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  });
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.etag) headers['If-None-Match'] = options.etag;
  const run = async (): Promise<GetResult> => {
    let res: HttpResponse;
    try {
      res = await fetchFn(url, { method: 'GET', headers, credentials: 'omit', redirect: 'error', signal: controller.signal });
    } catch (e) {
      throw e instanceof HttpError ? e : new HttpError(String(e), 'network');
    }
    const etag = res.headers.get('etag');
    if (res.status === 304) return { status: 304, etag: etag ?? options.etag ?? null };
    if (res.status !== 200) throw new HttpError(`HTTP ${res.status}`, 'status');
    const declared = Number(res.headers.get('content-length') ?? '');
    if (Number.isFinite(declared) && declared > options.maxBytes) throw new HttpError('too large', 'too-large');
    let buffer: ArrayBuffer;
    try {
      buffer = await res.arrayBuffer();
    } catch (e) {
      throw new HttpError(String(e), 'network');
    }
    if (buffer.byteLength > options.maxBytes) throw new HttpError('too large', 'too-large');
    return { status: 200, etag, bytes: new Uint8Array(buffer) };
  };
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `worker` over `items` with at most `limit` in flight. Never rejects (errors are per item). */
export async function mapLimit<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i]);
      } catch {
        results[i] = undefined;
      }
    }
  });
  await Promise.all(lanes);
  return results;
}
