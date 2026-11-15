import { decodeUtf8, encodeUtf8, Utf8Error } from './utf8';

describe('utf8', () => {
  it('round-trips ASCII, accents, CJK and astral characters', () => {
    for (const text of ['', 'hello', 'Océan · Jardin’s', '漢字', '🐙🎨 ok', 'x'.repeat(10_000) + 'é']) {
      const bytes = encodeUtf8(text);
      expect(Buffer.from(bytes).equals(Buffer.from(text, 'utf8'))).toBe(true);
      expect(decodeUtf8(bytes)).toBe(text);
    }
  });

  it.each([
    [[0xff]],
    [[0xc3]],
    [[0xc0, 0xaf]],
    [[0xe0, 0x80, 0xaf]],
    [[0xed, 0xa0, 0x80]],
    [[0xf4, 0x90, 0x80, 0x80]],
    [[0x80]],
  ])('rejects malformed sequence %#', (bytes) => {
    expect(() => decodeUtf8(Uint8Array.from(bytes))).toThrow(Utf8Error);
  });
});
