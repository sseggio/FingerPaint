/**
 * Fixed-size bitsets stored as Uint8Array (bit i lives in byte i >> 3, mask 1 << (i & 7)),
 * serialized as standard base64 (RFC 4648, padded). The base64 codec is pure JS so it runs
 * identically in Hermes, Node/Jest and on the web, without Buffer/btoa.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function byteLengthFor(bitCount: number): number {
  if (!Number.isInteger(bitCount) || bitCount < 0) throw new RangeError(`invalid bit count: ${bitCount}`);
  return (bitCount + 7) >> 3;
}

export function createBitset(bitCount: number): Uint8Array {
  return new Uint8Array(byteLengthFor(bitCount));
}

export function getBit(bits: Uint8Array, index: number): boolean {
  return (bits[index >> 3] & (1 << (index & 7))) !== 0;
}

/** Sets bit `index`. Returns true when it was previously clear. */
export function setBit(bits: Uint8Array, index: number): boolean {
  const byte = index >> 3;
  const mask = 1 << (index & 7);
  if (bits[byte] & mask) return false;
  bits[byte] |= mask;
  return true;
}

export function clearBit(bits: Uint8Array, index: number): void {
  bits[index >> 3] &= ~(1 << (index & 7));
}

export function countBits(bits: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < bits.length; i++) {
    let b = bits[i];
    while (b) {
      b &= b - 1;
      count++;
    }
  }
  return count;
}

/** Encodes bytes to padded base64. */
export function encodeBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }
  return out;
}

/** Decodes padded base64. Throws on malformed input (bad length, characters or padding). */
export function decodeBase64(input: string): Uint8Array {
  if (input.length % 4 !== 0) throw new Error('base64: length must be a multiple of 4');
  let pad = 0;
  if (input.endsWith('==')) pad = 2;
  else if (input.endsWith('=')) pad = 1;
  const out = new Uint8Array((input.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < input.length; i += 4) {
    const last = i + 4 === input.length;
    const values = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const code = input.charCodeAt(i + k);
      if (last && k >= 4 - pad) continue; // padding '='
      const v = code < 128 ? LOOKUP[code] : -1;
      if (v < 0) throw new Error(`base64: invalid character at ${i + k}`);
      values[k] = v;
    }
    const n = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

export function bitsetToBase64(bits: Uint8Array): string {
  return encodeBase64(bits);
}

/**
 * Decodes a base64 bitset of `bitCount` bits. Throws when the payload does not match the
 * expected size or has bits set beyond `bitCount` (corrupted or for another artwork).
 */
export function bitsetFromBase64(input: string, bitCount: number): Uint8Array {
  const bits = decodeBase64(input);
  if (bits.length !== byteLengthFor(bitCount)) {
    throw new Error(`bitset: expected ${byteLengthFor(bitCount)} bytes, got ${bits.length}`);
  }
  const tail = bitCount & 7;
  if (tail !== 0 && bits[bits.length - 1] >> tail !== 0) {
    throw new Error('bitset: bits set beyond the declared size');
  }
  return bits;
}
