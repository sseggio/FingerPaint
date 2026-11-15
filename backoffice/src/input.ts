/** Strict parsing of admin API payloads. Every field is checked; unknown fields are ignored. */
import type { ArtworkAccess, Difficulty } from './artwork-lib';

export const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ID_LENGTH = 48;
export const MAX_TITLE_LENGTH = 60;

export interface FieldError {
  field: string;
  message: string;
}

export class InputError extends Error {
  constructor(readonly errors: FieldError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join('; '));
    this.name = 'InputError';
  }
}

type Rec = Record<string, unknown>;

export function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidId(v: unknown): v is string {
  return typeof v === 'string' && v.length <= MAX_ID_LENGTH && ID_RE.test(v);
}

/** `free` | `pro` | `pack:<id>` (the form used in the database and the admin UI). */
export function isAccessCode(v: unknown): v is string {
  if (v === 'free' || v === 'pro') return true;
  return typeof v === 'string' && v.startsWith('pack:') && isValidId(v.slice(5));
}

export function accessToSource(code: string): ArtworkAccess {
  if (code === 'free' || code === 'pro') return code;
  return { pack: code.slice(5) };
}

class Collector {
  readonly errors: FieldError[] = [];

  push(field: string, message: string) {
    this.errors.push({ field, message });
  }

  id(raw: Rec, field: string, label = 'L’identifiant'): string {
    const v = raw[field];
    if (!isValidId(v)) {
      this.push(field, `${label} doit être en kebab-case (a-z, 0-9, tirets), ${MAX_ID_LENGTH} caractères max.`);
      return '';
    }
    return v;
  }

  title(raw: Rec, field: string): string {
    const v = raw[field];
    const s = typeof v === 'string' ? v.normalize('NFC').trim() : '';
    // Control characters are refused (titles are shown as plain text in the app).
    if (!s || s.length > MAX_TITLE_LENGTH || /[\u0000-\u001f\u007f]/.test(s)) {
      this.push(field, `Titre requis, ${MAX_TITLE_LENGTH} caractères max., sans caractère de contrôle.`);
      return '';
    }
    return s;
  }

  access(raw: Rec, field: string): string {
    const v = raw[field];
    if (!isAccessCode(v)) {
      this.push(field, 'Accès attendu : free, pro ou pack:<id>.');
      return 'free';
    }
    return v;
  }

  difficulty(raw: Rec, field: string): Difficulty {
    const v = raw[field];
    if (v !== 1 && v !== 2 && v !== 3) {
      this.push(field, 'Difficulté attendue : 1, 2 ou 3.');
      return 1;
    }
    return v;
  }

  int(raw: Rec, field: string, min: number, max: number): number {
    const v = raw[field];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
      this.push(field, `Entier attendu entre ${min} et ${max}.`);
      return min;
    }
    return v;
  }

  publish(raw: Rec, nowIso: string): Publication {
    const p = raw.publish;
    if (!isRecord(p) || (p.mode !== 'draft' && p.mode !== 'now' && p.mode !== 'schedule')) {
      this.push('publish', 'Publication attendue : brouillon, immédiate ou planifiée.');
      return { status: 'draft', publishedAt: null };
    }
    if (p.mode === 'draft') return { status: 'draft', publishedAt: null };
    if (p.mode === 'now') return { status: 'published', publishedAt: nowIso };
    const at = typeof p.at === 'string' && p.at.length <= 40 ? new Date(p.at) : null;
    if (!at || Number.isNaN(at.getTime()) || at.getUTCFullYear() < 2020 || at.getUTCFullYear() > 2100) {
      this.push('publish.at', 'Date de publication invalide.');
      return { status: 'draft', publishedAt: null };
    }
    return { status: 'published', publishedAt: at.toISOString() };
  }

  done<T>(value: T): T {
    if (this.errors.length) throw new InputError(this.errors);
    return value;
  }
}

export interface Publication {
  status: 'draft' | 'published';
  publishedAt: string | null;
}

export interface NewAlbumInput {
  id: string;
  titleFr: string;
  titleEn: string;
  access: string;
}

export interface ArtworkMetaInput {
  titleFr: string;
  titleEn: string;
  album: string;
  newAlbum: NewAlbumInput | null;
  difficulty: Difficulty;
  access: string;
  publication: Publication;
}

export interface ArtworkCreateInput extends ArtworkMetaInput {
  id: string;
  w: number;
  h: number;
  /** Not checked here: the whole artwork goes through validateArtwork. */
  palette: unknown;
  rows: unknown;
}

function parseMeta(c: Collector, raw: Rec, nowIso: string): ArtworkMetaInput {
  const titleFr = c.title(raw, 'titleFr');
  const titleEn = c.title(raw, 'titleEn');
  let newAlbum: NewAlbumInput | null = null;
  let album = '';
  if (raw.newAlbum !== undefined && raw.newAlbum !== null) {
    const na = isRecord(raw.newAlbum) ? raw.newAlbum : {};
    newAlbum = {
      id: c.id(na, 'id', 'L’identifiant d’album'),
      titleFr: c.title(na, 'titleFr'),
      titleEn: c.title(na, 'titleEn'),
      access: c.access(na, 'access'),
    };
    album = newAlbum.id;
  } else {
    album = c.id(raw, 'album', 'L’album');
  }
  return {
    titleFr,
    titleEn,
    album,
    newAlbum,
    difficulty: c.difficulty(raw, 'difficulty'),
    access: c.access(raw, 'access'),
    publication: c.publish(raw, nowIso),
  };
}

export function parseArtworkCreate(raw: unknown, nowIso: string): ArtworkCreateInput {
  const c = new Collector();
  const r = isRecord(raw) ? raw : {};
  const id = c.id(r, 'id');
  const meta = parseMeta(c, r, nowIso);
  const w = c.int(r, 'w', 1, 4096);
  const h = c.int(r, 'h', 1, 4096);
  return c.done({ ...meta, id, w, h, palette: r.palette, rows: r.rows });
}

export function parseArtworkUpdate(raw: unknown, nowIso: string): ArtworkMetaInput {
  const c = new Collector();
  return c.done(parseMeta(c, isRecord(raw) ? raw : {}, nowIso));
}

export interface AlbumInput {
  id: string;
  titleFr: string;
  titleEn: string;
  access: string;
  order: number;
}

export function parseAlbum(raw: unknown, requireId: boolean): AlbumInput {
  const c = new Collector();
  const r = isRecord(raw) ? raw : {};
  return c.done({
    id: requireId ? c.id(r, 'id', 'L’identifiant d’album') : '',
    titleFr: c.title(r, 'titleFr'),
    titleEn: c.title(r, 'titleEn'),
    access: c.access(r, 'access'),
    order: c.int(r, 'order', 0, 10_000),
  });
}
