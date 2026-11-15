#!/usr/bin/env node
/**
 * Writes generated/embedded.json: the artwork ids and albums shipped in the app
 * (src/content), so the server can refuse id collisions with built-in content.
 *   node scripts/gen-embedded.mjs [--content <dir>] [--out <file>]
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? resolve(args[i + 1]) : fallback;
};
const contentDir = opt('--content', join(HERE, '..', '..', 'src', 'content'));
const out = opt('--out', join(HERE, '..', 'generated', 'embedded.json'));

const albumsFile = JSON.parse(readFileSync(join(contentDir, 'albums.json'), 'utf8'));
const artworkIds = [];
const artDir = join(contentDir, 'artworks');
for (const album of readdirSync(artDir, { withFileTypes: true })) {
  if (!album.isDirectory()) continue;
  for (const file of readdirSync(join(artDir, album.name))) {
    if (!file.endsWith('.json')) continue;
    const art = JSON.parse(readFileSync(join(artDir, album.name, file), 'utf8'));
    artworkIds.push(art.id);
  }
}
artworkIds.sort();
const albums = albumsFile.albums.map(({ id, title, order, pack }) => ({ id, title, order, ...(pack ? { pack } : {}) }));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ v: 1, artworkIds, albums }, null, 2)}\n`);
console.log(`wrote ${out} (${artworkIds.length} artworks, ${albums.length} albums)`);
