/** Public catalog manifest (`GET /catalog/v1/manifest.json`). Format documented in README.md. */
import type { ArtworkAccess } from './artwork-lib';
import type { CatalogDb } from './db';
import { accessToSource } from './input';

export const CHANGED_AT_KEY = 'changed_at';

export interface ManifestAlbum {
  id: string;
  title: { fr: string; en: string };
  access: ArtworkAccess;
  order: number;
}

export interface ManifestArtwork {
  id: string;
  album: string;
  rev: number;
  url: string;
  sha256: string;
  publishedAt: string;
}

export interface Manifest {
  v: 1;
  updatedAt: string;
  albums: ManifestAlbum[];
  artworks: ManifestArtwork[];
}

export function artworkPath(id: string, rev: number): string {
  return `/catalog/v1/artworks/${id}.${rev}.json`;
}

/**
 * Only artworks with status "published" and publishedAt <= now are listed (scheduled ones
 * appear by themselves once their date passes). Albums are listed when at least one visible
 * artwork uses them, including albums already shipped in the app.
 */
export function buildManifest(db: CatalogDb, publicUrl: string, now: Date): Manifest {
  const nowIso = now.toISOString();
  const visible = db.listVisibleArtworks(nowIso);
  const used = new Set(visible.map((a) => a.album));
  const albums = db.listAlbums().filter((a) => used.has(a.id));
  let updatedAt = db.getMeta(CHANGED_AT_KEY) ?? new Date(0).toISOString();
  if (updatedAt > nowIso) updatedAt = nowIso;
  for (const a of visible) if (a.publishedAt && a.publishedAt > updatedAt) updatedAt = a.publishedAt;
  for (const a of albums) if (a.updatedAt > updatedAt && a.updatedAt <= nowIso) updatedAt = a.updatedAt;
  const base = publicUrl.replace(/\/+$/, '');
  return {
    v: 1,
    updatedAt,
    albums: albums.map((a) => ({
      id: a.id,
      title: { fr: a.titleFr, en: a.titleEn },
      access: accessToSource(a.access),
      order: a.order,
    })),
    artworks: visible.map((a) => ({
      id: a.id,
      album: a.album,
      rev: a.rev,
      url: `${base}${artworkPath(a.id, a.rev)}`,
      sha256: a.sha256,
      publishedAt: a.publishedAt ?? nowIso,
    })),
  };
}
