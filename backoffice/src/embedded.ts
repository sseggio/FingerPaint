/**
 * Content shipped inside the app (generated from `src/content` by `npm run gen:embedded`, at
 * Docker build time). Catalog ids must never collide with these artwork ids.
 */
import { readFileSync } from 'node:fs';

import type { ArtworkSource } from './artwork-lib';

export interface EmbeddedAlbum {
  id: string;
  title: { fr: string; en: string };
  order: number;
  pack?: string;
}

export interface EmbeddedContent {
  artworkIds: string[];
  albums: EmbeddedAlbum[];
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates the generated file; throws on any malformed entry (fail fast at startup). */
export function parseEmbedded(raw: unknown): EmbeddedContent {
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.artworkIds) || !Array.isArray(raw.albums)) {
    throw new Error('embedded.json: expected { v: 1, artworkIds: [], albums: [] }');
  }
  const artworkIds = raw.artworkIds.map((id) => {
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`embedded.json: invalid artwork id ${JSON.stringify(id)}`);
    return id;
  });
  const albums = raw.albums.map((a): EmbeddedAlbum => {
    if (
      !isRecord(a) ||
      typeof a.id !== 'string' ||
      !ID_RE.test(a.id) ||
      !isRecord(a.title) ||
      typeof a.title.fr !== 'string' ||
      typeof a.title.en !== 'string' ||
      typeof a.order !== 'number' ||
      (a.pack !== undefined && (typeof a.pack !== 'string' || !ID_RE.test(a.pack)))
    ) {
      throw new Error(`embedded.json: invalid album ${JSON.stringify(a)}`);
    }
    return { id: a.id, title: { fr: a.title.fr, en: a.title.en }, order: a.order, ...(a.pack ? { pack: a.pack } : {}) };
  });
  return { artworkIds, albums };
}

export function loadEmbedded(path: string): EmbeddedContent {
  return parseEmbedded(JSON.parse(readFileSync(path, 'utf8')));
}

/**
 * Full artworks shipped in the app (`generated/embedded-artworks.json`, written next to
 * embedded.json by `npm run gen:embedded`): sources for the remix generator (F34). Invalid
 * entries are skipped; a missing file simply means no embedded remix source.
 */
export function parseEmbeddedSources(raw: unknown, validate: (art: unknown) => boolean): Map<string, ArtworkSource> {
  const out = new Map<string, ArtworkSource>();
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.artworks)) return out;
  for (const art of raw.artworks) {
    if (isRecord(art) && typeof art.id === 'string' && validate(art)) out.set(art.id, art as unknown as ArtworkSource);
  }
  return out;
}

export function loadEmbeddedSources(path: string, validate: (art: unknown) => boolean): Map<string, ArtworkSource> {
  try {
    return parseEmbeddedSources(JSON.parse(readFileSync(path, 'utf8')), validate);
  } catch {
    return new Map();
  }
}
