import {
  bitsetFromBase64,
  bitsetToBase64,
  byteLengthFor,
  clearBit,
  countBits,
  createBitset,
  decodeBase64,
  encodeBase64,
  getBit,
  setBit,
} from './bitset';

function pseudoRandomBytes(length: number, seed = 42): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed;
  for (let i = 0; i < length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = s & 255;
  }
  return out;
}

describe('bitset', () => {
  it('sets, reads, clears and counts bits', () => {
    const bits = createBitset(20);
    expect(bits).toHaveLength(3);
    expect(setBit(bits, 0)).toBe(true);
    expect(setBit(bits, 0)).toBe(false);
    setBit(bits, 9);
    setBit(bits, 19);
    expect([0, 1, 9, 19].map((i) => getBit(bits, i))).toEqual([true, false, true, true]);
    expect(countBits(bits)).toBe(3);
    clearBit(bits, 9);
    expect(getBit(bits, 9)).toBe(false);
    expect(countBits(bits)).toBe(2);
  });

  it('round-trips a 128×128 bitset (16 384 bits) through base64', () => {
    const n = 128 * 128;
    const bits = createBitset(n);
    for (let i = 0; i < n; i += 3) setBit(bits, i);
    setBit(bits, n - 1);
    const encoded = bitsetToBase64(bits);
    expect(encoded.length).toBeLessThanOrEqual(2732); // ≈ 2 KB
    const back = bitsetFromBase64(encoded, n);
    expect(back).toEqual(bits);
    expect(countBits(back)).toBe(countBits(bits));
  });

  it.each([0, 1, 2, 3, 4, 5, 255, 2048])('matches Node Buffer base64 for %i bytes', (length) => {
    const bytes = pseudoRandomBytes(length, length + 1);
    const expected = Buffer.from(bytes).toString('base64');
    expect(encodeBase64(bytes)).toBe(expected);
    expect(Array.from(decodeBase64(expected))).toEqual(Array.from(bytes));
  });

  it.each(['abc', 'ab$=', '====', 'a=bc', 'éabc'])('rejects malformed base64 %p', (input) => {
    expect(() => decodeBase64(input)).toThrow('base64');
  });

  it('rejects bitsets of the wrong size or with bits beyond the size', () => {
    expect(() => bitsetFromBase64(encodeBase64(new Uint8Array(3)), 16)).toThrow('expected 2 bytes');
    expect(() => bitsetFromBase64(encodeBase64(Uint8Array.of(0, 0b1000_0000)), 12)).toThrow('beyond');
    expect(bitsetFromBase64(encodeBase64(Uint8Array.of(255, 0b0000_1111)), 12)).toHaveLength(2);
    expect(() => byteLengthFor(-1)).toThrow(RangeError);
  });
});
