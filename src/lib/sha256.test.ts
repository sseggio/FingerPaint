import { createHash, randomBytes } from 'node:crypto';

import { sha256Hex } from './sha256';
import { encodeUtf8 } from './utf8';

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe('sha256Hex', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    [
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    ],
  ])('FIPS 180-2 vector %#', (input, digest) => {
    expect(sha256Hex(ascii(input))).toBe(digest);
  });

  it('hashes one million "a"', () => {
    expect(sha256Hex(new Uint8Array(1_000_000).fill(0x61))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });

  it('matches node:crypto around block boundaries and on a 256 KB file', () => {
    for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 1000, 256 * 1024]) {
      const bytes = new Uint8Array(randomBytes(n));
      expect(sha256Hex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('hashes the UTF-8 bytes of non-ASCII text', () => {
    const text = '{"title":{"fr":"Océan profond 🐙"}}';
    expect(sha256Hex(encodeUtf8(text))).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});
