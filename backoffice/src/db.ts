/**
 * SQLite metadata store (node:sqlite, no native addon). Artwork pixels live in immutable JSON
 * files (see store.ts); the database only holds metadata, albums and admin sessions.
 * Schema changes bump PRAGMA user_version and add a migration step below.
 */
import { DatabaseSync } from 'node:sqlite';

import type { EmbeddedContent } from './embedded';

export const SCHEMA_VERSION = 1;

export type ArtworkStatus = 'draft' | 'published';

export interface AlbumRecord {
  id: string;
  titleFr: string;
  titleEn: string;
  /** `free` | `pro` | `pack:<id>` */
  access: string;
  order: number;
  /** Album shipped inside the app (titles and order are read-only here). */
  builtin: boolean;
  updatedAt: string;
}

export interface ArtworkRecord {
  id: string;
  album: string;
  titleFr: string;
  titleEn: string;
  /** `free` | `pro` | `pack:<id>` */
  access: string;
  difficulty: 1 | 2 | 3;
  w: number;
  h: number;
  colors: number;
  cells: number;
  rev: number;
  sha256: string;
  status: ArtworkStatus;
  /** ISO date; visible in the public manifest when status is published and publishedAt <= now. */
  publishedAt: string | null;
  /** Once published, an id is reserved forever (players may have progress on it). */
  everPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'bigint' ? Number(v) : Number(v ?? 0));

function toAlbum(r: Row): AlbumRecord {
  return {
    id: str(r.id),
    titleFr: str(r.title_fr),
    titleEn: str(r.title_en),
    access: str(r.access),
    order: num(r.ord),
    builtin: num(r.builtin) === 1,
    updatedAt: str(r.updated_at),
  };
}

function toArtwork(r: Row): ArtworkRecord {
  const d = num(r.difficulty);
  return {
    id: str(r.id),
    album: str(r.album),
    titleFr: str(r.title_fr),
    titleEn: str(r.title_en),
    access: str(r.access),
    difficulty: d === 2 || d === 3 ? d : 1,
    w: num(r.w),
    h: num(r.h),
    colors: num(r.colors),
    cells: num(r.cells),
    rev: num(r.rev),
    sha256: str(r.sha256),
    status: r.status === 'published' ? 'published' : 'draft',
    publishedAt: typeof r.published_at === 'string' ? r.published_at : null,
    everPublished: num(r.ever_published) === 1,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

function migrate(db: DatabaseSync) {
  const version = num((db.prepare('PRAGMA user_version').get() as Row).user_version);
  if (version > SCHEMA_VERSION) {
    throw new Error(`Database schema v${version} is newer than this server (v${SCHEMA_VERSION}).`);
  }
  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        title_fr TEXT NOT NULL,
        title_en TEXT NOT NULL,
        access TEXT NOT NULL DEFAULT 'free',
        ord INTEGER NOT NULL DEFAULT 0,
        builtin INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS artworks (
        id TEXT PRIMARY KEY,
        album TEXT NOT NULL REFERENCES albums(id),
        title_fr TEXT NOT NULL,
        title_en TEXT NOT NULL,
        access TEXT NOT NULL,
        difficulty INTEGER NOT NULL CHECK (difficulty IN (1, 2, 3)),
        w INTEGER NOT NULL,
        h INTEGER NOT NULL,
        colors INTEGER NOT NULL,
        cells INTEGER NOT NULL,
        rev INTEGER NOT NULL CHECK (rev >= 1),
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('draft', 'published')),
        published_at TEXT,
        ever_published INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        csrf TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      PRAGMA user_version = 1;
    `);
  }
}

export class CatalogDb {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(this.db);
  }

  close() {
    this.db.close();
  }

  /** Inserts or refreshes the albums shipped in the app (read-only in the back-office). */
  syncBuiltinAlbums(embedded: EmbeddedContent, now: string) {
    const upsert = this.db.prepare(`
      INSERT INTO albums (id, title_fr, title_en, access, ord, builtin, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET title_fr = excluded.title_fr, title_en = excluded.title_en,
        access = excluded.access, ord = excluded.ord, builtin = 1,
        updated_at = CASE WHEN albums.title_fr = excluded.title_fr AND albums.title_en = excluded.title_en
          AND albums.access = excluded.access AND albums.ord = excluded.ord THEN albums.updated_at ELSE excluded.updated_at END
    `);
    for (const a of embedded.albums) {
      upsert.run(a.id, a.title.fr, a.title.en, a.pack ? `pack:${a.pack}` : 'free', a.order, now);
    }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as Row | undefined;
    return row ? str(row.value) : null;
  }

  setMeta(key: string, value: string) {
    this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  // ------------------------------------------------------------------ albums

  listAlbums(): AlbumRecord[] {
    return (this.db.prepare('SELECT * FROM albums ORDER BY ord, id').all() as Row[]).map(toAlbum);
  }

  getAlbum(id: string): AlbumRecord | null {
    const row = this.db.prepare('SELECT * FROM albums WHERE id = ?').get(id) as Row | undefined;
    return row ? toAlbum(row) : null;
  }

  insertAlbum(a: Omit<AlbumRecord, 'builtin'>) {
    this.db
      .prepare('INSERT INTO albums (id, title_fr, title_en, access, ord, builtin, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)')
      .run(a.id, a.titleFr, a.titleEn, a.access, a.order, a.updatedAt);
  }

  updateAlbum(a: Omit<AlbumRecord, 'builtin'>) {
    this.db
      .prepare('UPDATE albums SET title_fr = ?, title_en = ?, access = ?, ord = ?, updated_at = ? WHERE id = ? AND builtin = 0')
      .run(a.titleFr, a.titleEn, a.access, a.order, a.updatedAt, a.id);
  }

  nextAlbumOrder(): number {
    const row = this.db.prepare('SELECT COALESCE(MAX(ord), -1) + 1 AS n FROM albums').get() as Row;
    return num(row.n);
  }

  // ------------------------------------------------------------------ artworks

  listArtworks(): ArtworkRecord[] {
    return (this.db.prepare('SELECT * FROM artworks ORDER BY updated_at DESC, id').all() as Row[]).map(toArtwork);
  }

  /** Published artworks whose publication date has passed, in publication order. */
  listVisibleArtworks(nowIso: string): ArtworkRecord[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM artworks WHERE status = 'published' AND published_at IS NOT NULL AND published_at <= ?
           ORDER BY published_at, id`,
        )
        .all(nowIso) as Row[]
    ).map(toArtwork);
  }

  getArtwork(id: string): ArtworkRecord | null {
    const row = this.db.prepare('SELECT * FROM artworks WHERE id = ?').get(id) as Row | undefined;
    return row ? toArtwork(row) : null;
  }

  insertArtwork(a: ArtworkRecord) {
    this.db
      .prepare(
        `INSERT INTO artworks (id, album, title_fr, title_en, access, difficulty, w, h, colors, cells, rev, sha256,
           status, published_at, ever_published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.id, a.album, a.titleFr, a.titleEn, a.access, a.difficulty, a.w, a.h, a.colors, a.cells, a.rev, a.sha256,
        a.status, a.publishedAt, a.everPublished ? 1 : 0, a.createdAt, a.updatedAt,
      );
  }

  updateArtwork(a: ArtworkRecord) {
    this.db
      .prepare(
        `UPDATE artworks SET album = ?, title_fr = ?, title_en = ?, access = ?, difficulty = ?, rev = ?, sha256 = ?,
           status = ?, published_at = ?, ever_published = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        a.album, a.titleFr, a.titleEn, a.access, a.difficulty, a.rev, a.sha256, a.status, a.publishedAt,
        a.everPublished ? 1 : 0, a.updatedAt, a.id,
      );
  }

  deleteArtwork(id: string) {
    this.db.prepare('DELETE FROM artworks WHERE id = ?').run(id);
  }

  // ------------------------------------------------------------------ sessions

  insertSession(tokenHash: string, csrf: string, expiresAt: number) {
    this.db.prepare('INSERT INTO sessions (token_hash, csrf, expires_at) VALUES (?, ?, ?)').run(tokenHash, csrf, expiresAt);
  }

  getSession(tokenHash: string, nowMs: number): { csrf: string; expiresAt: number } | null {
    const row = this.db
      .prepare('SELECT csrf, expires_at FROM sessions WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash, nowMs) as Row | undefined;
    return row ? { csrf: str(row.csrf), expiresAt: num(row.expires_at) } : null;
  }

  deleteSession(tokenHash: string) {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  purgeSessions(nowMs: number) {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowMs);
  }

  /** Consistent copy of the database (used by the backup script). */
  backupTo(path: string) {
    this.db.prepare('VACUUM INTO ?').run(path);
  }
}
