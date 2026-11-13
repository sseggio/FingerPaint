import { decode, decodeRow, encode, encodeRow, RleError, toArtwork } from './codec';
import type { ArtworkSource } from './types';
import { KEYS } from './types';

function randomGrid(width: number, height: number, colors: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) {
    // Mix long runs and noise.
    cells[i] = rand() < 0.7 && i > 0 ? cells[i - 1] : Math.floor(rand() * (colors + 1));
  }
  return { width, height, cells };
}

describe('RLE codec', () => {
  it('decodes the documented example', () => {
    expect(decodeRow('4.3A2B')).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2]);
  });

  it('encodes runs of 1 without a count', () => {
    expect(encodeRow([1, 2, 2, 0, 1])).toBe('A2B.A');
  });

  it('handles empty cells', () => {
    expect(encodeRow([0, 0, 0])).toBe('3.');
    expect(decodeRow('.A.')).toEqual([0, 1, 0]);
  });

  it('handles long runs and 128 columns', () => {
    const row = new Array(128).fill(52);
    expect(encodeRow(row)).toBe('128z');
    expect(decodeRow('128z')).toEqual(row);
    expect(decodeRow('100A28.')).toHaveLength(128);
  });

  it('uses every key of the 52-key alphabet', () => {
    const values = Array.from({ length: KEYS.length }, (_, i) => i + 1);
    expect(encodeRow(values)).toBe(KEYS);
    expect(decodeRow(KEYS)).toEqual(values);
  });

  it.each([
    [8, 8, 2, 1],
    [16, 16, 7, 2],
    [48, 30, 40, 3],
    [128, 128, 52, 4],
    [128, 9, 3, 5],
  ])('decode(encode(g)) is the identity (%i×%i, %i colors)', (w, h, colors, seed) => {
    const grid = randomGrid(w, h, colors, seed);
    const rows = encode(grid);
    expect(rows).toHaveLength(h);
    const back = decode(rows, w, h, colors);
    expect(back.width).toBe(w);
    expect(back.height).toBe(h);
    expect(Array.from(back.cells)).toEqual(Array.from(grid.cells));
  });

  it.each([
    ['A1', 'run length without key'],
    ['0A', 'invalid run length'],
    ['05A', 'invalid run length'],
    ['A#', 'unknown key'],
    ['A3', 'run length without key'],
  ])('rejects malformed row %s', (row, message) => {
    expect(() => decodeRow(row)).toThrow(RleError);
    expect(() => decodeRow(row)).toThrow(message);
  });

  it('rejects keys outside the palette', () => {
    expect(() => decodeRow('ABC', 2)).toThrow('outside the palette');
  });

  it('reports the row on width/height mismatches', () => {
    expect(() => decode(['8A', '7A'], 8, 2)).toThrow('row 1: decodes to 7 cells, expected 8');
    expect(() => decode(['8A'], 8, 2)).toThrow('expected 2 rows, got 1');
  });

  it('builds the runtime model with counts', () => {
    const source: ArtworkSource = {
      v: 1,
      id: 'tiny',
      album: 'garden',
      title: { fr: 'Mini', en: 'Tiny' },
      w: 8,
      h: 8,
      palette: ['#000000', '#FFFFFF'],
      rows: ['8A', '4A4B', '8.', '8B', '8B', '8B', '8B', '8B'],
      access: 'free',
      difficulty: 1,
    };
    const art = toArtwork(source);
    expect(art.cells[0]).toBe(1);
    expect(art.cells[8 + 4]).toBe(2);
    expect(art.cells[16]).toBe(0);
    expect(Array.from(art.colorCounts)).toEqual([12, 44]);
    expect(art.totalCells).toBe(56);
    expect(art.palette.colors[1]).toMatchObject({ hex: '#FFFFFF', rgb: [255, 255, 255], number: 2 });
  });
});
