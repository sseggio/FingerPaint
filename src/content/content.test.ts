/**
 * Content validation — also run by `npm run validate:art`.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

import type { AlbumsFile, ArtworkSource } from '@/lib/artwork/types';
import { formatIssue, validateContent } from '@/lib/artwork/validate';

import { albumsData, artworkData } from './index';

const ARTWORKS_DIR = join(__dirname, 'artworks');
const artworks = artworkData as ArtworkSource[];
const { albums } = albumsData as AlbumsFile;

const accessKind = (a: ArtworkSource) => (typeof a.access === 'string' ? a.access : 'pack');

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listJsonFiles(path);
    return entry.name.endsWith('.json') ? [path] : [];
  });
}

describe('bundled content', () => {
  it('passes validation', () => {
    const report = validateContent(albumsData, artworkData).map(formatIssue).join('\n');
    expect(report).toBe('');
  });

  it('lists every artwork file in the manifest, at artworks/<album>/<id>.json', () => {
    const files = listJsonFiles(ARTWORKS_DIR).map((f) => relative(ARTWORKS_DIR, f)).sort();
    const manifest = artworkData
      .map((raw) => {
        const { album, id } = raw as { album: string; id: string };
        return join(album, `${id}.json`);
      })
      .sort();
    expect(manifest).toEqual(files);
    for (const file of files) {
      const parsed = JSON.parse(readFileSync(join(ARTWORKS_DIR, file), 'utf8')) as { id: string };
      expect(file.endsWith(`${parsed.id}.json`)).toBe(true);
    }
  });
});

describe('content V1 catalog', () => {
  it('has 6 albums of 8 artworks each', () => {
    expect(albums.map((a) => a.id)).toEqual(['garden', 'ocean', 'kitchen', 'animals', 'space', 'deep-ocean']);
    for (const album of albums) {
      expect([album.id, artworks.filter((a) => a.album === album.id).length]).toEqual([album.id, 8]);
    }
    expect(artworks).toHaveLength(48);
  });

  it('splits access into 32 free, 8 Pro (spread over free albums) and 8 pack artworks', () => {
    const count = (kind: string) => artworks.filter((a) => accessKind(a) === kind).length;
    expect({ free: count('free'), pro: count('pro'), pack: count('pack') }).toEqual({ free: 32, pro: 8, pack: 8 });

    const packAlbums = albums.filter((a) => a.pack);
    for (const album of albums) {
      const inAlbum = artworks.filter((a) => a.album === album.id);
      if (album.pack) {
        // A pack album is entirely in its pack.
        expect(inAlbum.every((a) => typeof a.access === 'object' && a.access.pack === album.pack)).toBe(true);
      } else {
        // Every free album keeps most of its artworks free, with 1 or 2 Pro ones.
        const pro = inAlbum.filter((a) => a.access === 'pro').length;
        expect(pro).toBeGreaterThanOrEqual(1);
        expect(pro).toBeLessThanOrEqual(2);
        expect(inAlbum.some((a) => accessKind(a) === 'pack')).toBe(false);
      }
    }
    expect(packAlbums.map((a) => a.id)).toEqual(['deep-ocean']);
  });

  it('varies sizes (16 to 64, plus 2 large ones of 96 or 128), difficulties and palettes', () => {
    const large = artworks.filter((a) => Math.max(a.w, a.h) > 64);
    expect(large).toHaveLength(2);
    for (const a of large) {
      expect([96, 128]).toContain(Math.max(a.w, a.h));
      expect(a.difficulty).toBe(3);
    }
    for (const a of artworks) {
      expect(Math.max(a.w, a.h)).toBeGreaterThanOrEqual(16);
      expect(a.palette.length).toBeGreaterThanOrEqual(4);
      expect(a.palette.length).toBeLessThanOrEqual(24);
    }
    for (const d of [1, 2, 3] as const) expect(artworks.filter((a) => a.difficulty === d).length).toBeGreaterThanOrEqual(8);
    // Easy artworks are available for free in every free album.
    for (const album of albums.filter((a) => !a.pack)) {
      expect(artworks.some((a) => a.album === album.id && a.access === 'free' && a.difficulty === 1)).toBe(true);
    }
  });

  it('weighs less than 1 MB', () => {
    const files = [join(__dirname, 'albums.json'), ...listJsonFiles(ARTWORKS_DIR)];
    const bytes = files.reduce((sum, f) => sum + statSync(f).size, 0);
    expect(bytes).toBeLessThan(1024 * 1024);
  });
});
