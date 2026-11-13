/**
 * Content validation — also run by `npm run validate:art`.
 */
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

import { formatIssue, validateContent } from '@/lib/artwork/validate';

import { albumsData, artworkData } from './index';

const ARTWORKS_DIR = join(__dirname, 'artworks');

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
