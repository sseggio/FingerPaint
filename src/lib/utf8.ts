/** UTF-8 helpers in plain TypeScript (no dependency on TextEncoder / TextDecoder support). */

export class Utf8Error extends Error {
  constructor() {
    super('invalid UTF-8');
    this.name = 'Utf8Error';
  }
}

/** Strict UTF-8 decoding: throws Utf8Error on any malformed, overlong or surrogate sequence. */
export function decodeUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk: number[] = [];
  let i = 0;
  const cont = (k: number) => {
    const b = bytes[k];
    if (b === undefined || (b & 0xc0) !== 0x80) throw new Utf8Error();
    return b & 0x3f;
  };
  while (i < bytes.length) {
    const b0 = bytes[i];
    let cp: number;
    if (b0 < 0x80) {
      cp = b0;
      i += 1;
    } else if (b0 >= 0xc2 && b0 < 0xe0) {
      cp = ((b0 & 0x1f) << 6) | cont(i + 1);
      i += 2;
    } else if (b0 >= 0xe0 && b0 < 0xf0) {
      cp = ((b0 & 0x0f) << 12) | (cont(i + 1) << 6) | cont(i + 2);
      if (cp < 0x800 || (cp >= 0xd800 && cp <= 0xdfff)) throw new Utf8Error();
      i += 3;
    } else if (b0 >= 0xf0 && b0 < 0xf5) {
      cp = ((b0 & 0x07) << 18) | (cont(i + 1) << 12) | (cont(i + 2) << 6) | cont(i + 3);
      if (cp < 0x10000 || cp > 0x10ffff) throw new Utf8Error();
      i += 4;
    } else {
      throw new Utf8Error();
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      chunk.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    } else {
      chunk.push(cp);
    }
    if (chunk.length >= 4096) {
      parts.push(String.fromCharCode(...chunk));
      chunk = [];
    }
  }
  if (chunk.length > 0) parts.push(String.fromCharCode(...chunk));
  return parts.join('');
}

/** UTF-8 encoding of a JS string (lone surrogates become U+FFFD). */
export function encodeUtf8(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        cp = 0xfffd;
      }
    } else if (cp >= 0xd800 && cp <= 0xdfff) {
      cp = 0xfffd;
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}
