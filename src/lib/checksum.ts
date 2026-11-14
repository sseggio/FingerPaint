/**
 * Integrity checksums (pure JS, identical in Hermes, Node/Jest and on the web).
 *
 * FNV-1a 64-bit over the UTF-8 bytes of a string. It detects accidental corruption and casual
 * edits of a backup file; it is NOT a cryptographic signature (a determined user can recompute
 * it, which is fine: a backup only ever restores the user's own, validated progress).
 */

const TWO_32 = 4294967296;
const FNV_PRIME_LOW = 0x1b3; // 64-bit prime 0x100000001b3 = 2^40 + 0x1b3

/** Streams the UTF-8 bytes of `value` (lone surrogates encoded as U+FFFD). */
function forEachUtf8Byte(value: string, visit: (byte: number) => void): void {
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd;
    }
    if (code < 0x80) visit(code);
    else if (code < 0x800) {
      visit(0xc0 | (code >> 6));
      visit(0x80 | (code & 63));
    } else if (code < 0x10000) {
      visit(0xe0 | (code >> 12));
      visit(0x80 | ((code >> 6) & 63));
      visit(0x80 | (code & 63));
    } else {
      visit(0xf0 | (code >> 18));
      visit(0x80 | ((code >> 12) & 63));
      visit(0x80 | ((code >> 6) & 63));
      visit(0x80 | (code & 63));
    }
  }
}

/** FNV-1a 64-bit of the UTF-8 encoding of `value`, as 16 lowercase hex digits. */
export function fnv1a64(value: string): string {
  // The 64-bit state is kept as two 32-bit halves; every intermediate stays below 2^53.
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  forEachUtf8Byte(value, (byte) => {
    lo = (lo ^ byte) >>> 0;
    // h * prime = h * 0x1b3 + (h << 40)  (mod 2^64)
    const low = lo * FNV_PRIME_LOW;
    const carry = Math.floor(low / TWO_32);
    hi = (Math.imul(hi, FNV_PRIME_LOW) + ((lo << 8) >>> 0) + carry) >>> 0;
    lo = low >>> 0;
  });
  return hi.toString(16).padStart(8, '0') + lo.toString(16).padStart(8, '0');
}

/**
 * Deterministic JSON: object keys sorted, no whitespace. Two equal values always serialize to
 * the same string, whatever their key order or the formatting of the file they came from.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const out = JSON.stringify(value);
    if (out === undefined) throw new TypeError('canonicalJson: unsupported value');
    return out;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}
