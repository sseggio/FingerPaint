import { staleExport } from './export-artwork';

// Only the pure cleanup rule is tested here (rendering needs Skia, files need the device).
jest.mock('./render-png', () => ({ renderArtworkPng: jest.fn() }));

describe('staleExport (old PNG cleanup)', () => {
  it('keeps only the latest export of the same artwork', () => {
    const stale = staleExport('export', 'cat', 'pixeljoy-cat-512x512.png');
    expect(stale('pixeljoy-cat-512x512.png')).toBe(false);
    expect(stale('pixeljoy-cat-256x256.png')).toBe(true);
    // Other artworks (even with a shared prefix) and foreign files are left alone.
    expect(stale('pixeljoy-cat-big-256x256.png')).toBe(false);
    expect(stale('pixeljoy-owl-256x256.png')).toBe(false);
    expect(stale('notes.txt')).toBe(false);
  });

  it('purges every older share copy', () => {
    const stale = staleExport('share', 'cat', 'pixeljoy-cat-512x512.png');
    expect(stale('pixeljoy-cat-512x512.png')).toBe(false);
    expect(stale('pixeljoy-owl-256x256.png')).toBe(true);
  });
});
