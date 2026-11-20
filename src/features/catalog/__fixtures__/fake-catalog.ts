/** Test helpers: a fake catalog server (mocked fetch) and in-memory catalog files. */
import { artworkData } from '@/content';
import type { ArtworkSource } from '@/lib/artwork/types';
import type { Manifest, ManifestAlbum } from '@/lib/catalog/manifest';
import { sha256Hex } from '@/lib/sha256';
import { encodeUtf8 } from '@/lib/utf8';

import type { CatalogFiles } from '../catalog-files';
import type { HttpFetch, HttpRequestInit, HttpResponse } from '../catalog-http';

export const BASE = 'https://catalog.test';
export const CONFIG = { base: BASE, host: 'catalog.test' };
export const PETS: ManifestAlbum = { id: 'pets', title: { fr: 'Animaux', en: 'Pets' }, access: { pack: 'pets' }, order: 7 };
export const GARDEN: ManifestAlbum = { id: 'garden', title: { fr: 'Jardin', en: 'Garden' }, access: 'free', order: 0 };

const strawberry = (artworkData as ArtworkSource[]).find((a) => a.id === 'strawberry')!;

/** A valid artwork (strawberry pixels) under another id / album / access. */
export function makeSource(id: string, album = 'pets', access: ArtworkSource['access'] = 'free', titleEn = id): ArtworkSource {
  return { ...strawberry, id, album, access, title: { fr: titleEn, en: titleEn } };
}

/** An artwork of `size`×`size` cells (all valid except, above MAX_SIZE, the size itself). */
export function makeSizedSource(id: string, size: number, album = 'pets'): ArtworkSource {
  const base = makeSource(id, album);
  const keys = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.slice(0, base.palette.length);
  const rows = Array.from({ length: size }, (_, y) => (y === 0 ? `${keys}${size - keys.length}A` : `${size}A`));
  return { ...base, w: size, h: size, rows };
}

export interface Published {
  source: ArtworkSource;
  rev?: number;
  publishedAt?: string;
  /** Declare the grid size (`w`, `h`) in the manifest entry, as the back-office does since F33. */
  declareSize?: boolean;
}

interface Route {
  status: number;
  body?: Uint8Array;
  headers?: Record<string, string>;
}

export class FakeCatalog {
  routes = new Map<string, Route>();
  requests: { url: string; init: HttpRequestInit }[] = [];
  /** When set, every request rejects (offline). */
  offline = false;
  inFlight = 0;
  maxInFlight = 0;
  etag = '"m1"';

  /** Publishes a manifest + its artwork files. */
  publish(albums: ManifestAlbum[], artworks: Published[], options: { etag?: string } = {}): Manifest {
    const manifest: Manifest = {
      v: 1,
      updatedAt: '2026-11-15T10:00:00.000Z',
      albums,
      artworks: artworks.map(({ source, rev = 1, publishedAt = '2026-11-15T10:00:00.000Z', declareSize = false }) => {
        const bytes = encodeUtf8(JSON.stringify(source));
        const url = `${BASE}/catalog/v1/artworks/${source.id}.${rev}.json`;
        this.routes.set(url, { status: 200, body: bytes });
        const entry = { id: source.id, album: source.album, rev, url, sha256: sha256Hex(bytes), publishedAt };
        return declareSize ? { ...entry, w: source.w, h: source.h } : entry;
      }),
    };
    this.setManifest(manifest, options.etag);
    return manifest;
  }

  setManifest(manifest: unknown, etag = this.etag) {
    this.etag = etag;
    this.routes.set(`${BASE}/catalog/v1/manifest.json`, { status: 200, body: encodeUtf8(JSON.stringify(manifest)), headers: { etag } });
  }

  fetch: HttpFetch = async (url, init) => {
    this.requests.push({ url, init });
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    try {
      await new Promise((r) => setTimeout(r, 1));
      if (this.offline) throw new TypeError('Network request failed');
      const route = this.routes.get(url);
      if (!route) return response(404);
      if (url.endsWith('manifest.json') && init.headers['If-None-Match'] === this.etag) return response(304, undefined, { etag: this.etag });
      return response(route.status, route.body, route.headers);
    } finally {
      this.inFlight--;
    }
  };

  manifestRequests() {
    return this.requests.filter((r) => r.url.endsWith('manifest.json'));
  }

  artworkRequests() {
    return this.requests.filter((r) => !r.url.endsWith('manifest.json'));
  }
}

function response(status: number, body?: Uint8Array, headers: Record<string, string> = {}): HttpResponse {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    arrayBuffer: async () => {
      const b = body ?? new Uint8Array();
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    },
  };
}

export function memoryFiles(): CatalogFiles & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    read: async (name) => data.get(name) ?? null,
    write: async (name, text) => {
      data.set(name, text);
    },
    remove: (name) => {
      data.delete(name);
    },
    list: () => [...data.keys()],
  };
}
