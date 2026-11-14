import { canonicalJson, fnv1a64 } from './checksum';

describe('fnv1a64', () => {
  it('matches the reference vectors', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c');
    expect(fnv1a64('foobar')).toBe('85944171f73967e8');
  });

  it('hashes the UTF-8 bytes (non-ASCII and astral characters)', () => {
    expect(fnv1a64('é')).not.toBe(fnv1a64('e'));
    expect(fnv1a64('🎨')).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1a64('🎨')).not.toBe(fnv1a64('\ud83c'));
  });

  it('changes when a single character changes', () => {
    expect(fnv1a64('{"filled":"AAAA"}')).not.toBe(fnv1a64('{"filled":"AAAB"}'));
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 0, y: null }], c: 'x' }, u: undefined })).toBe(
      '{"a":{"c":"x","d":[1,{"y":null,"z":0}]},"b":1}',
    );
  });

  it('is stable across key order', () => {
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }));
  });
});
