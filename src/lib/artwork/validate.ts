import { decodeRow, RleError } from './codec';
import { deltaE76, isHexColor } from './color';
import type { AlbumsFile, ArtworkSource } from './types';
import { KEYS, MAX_COLORS, MAX_SIZE, MIN_COLORS, MIN_DELTA_E, MIN_SIZE } from './types';

export interface ValidationIssue {
  /** Artwork or album id (or `#<index>` when the id itself is missing). */
  id: string;
  /** Where in the file: `row 3`, `palette[2]`, `title.fr`, ... */
  where: string;
  message: string;
}

export function formatIssue(issue: ValidationIssue): string {
  return `[${issue.id}] ${issue.where}: ${issue.message}`;
}

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function checkTitle(title: unknown, push: (where: string, message: string) => void) {
  if (!isRecord(title)) {
    push('title', 'must be an object { fr, en }');
    return;
  }
  for (const lang of ['fr', 'en'] as const) {
    if (!isNonEmptyString(title[lang])) push(`title.${lang}`, 'must be a non-empty string');
  }
}

function checkAccess(access: unknown): boolean {
  if (access === 'free' || access === 'pro') return true;
  return isRecord(access) && Object.keys(access).length === 1 && typeof access.pack === 'string' && ID_RE.test(access.pack);
}

export interface ArtworkContext {
  /** Known album ids; when given, `album` must be one of them. */
  albumIds?: ReadonlySet<string>;
}

/** Validates one artwork file. Returns an empty array when valid. */
export function validateArtwork(raw: unknown, ctx: ArtworkContext = {}, index = 0): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const id = isRecord(raw) && typeof raw.id === 'string' && raw.id ? raw.id : `#${index}`;
  const push = (where: string, message: string) => issues.push({ id, where, message });

  if (!isRecord(raw)) {
    push('root', 'must be an object');
    return issues;
  }
  if (raw.v !== 1) push('v', `unsupported version ${JSON.stringify(raw.v)} (expected 1)`);
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) push('id', 'must be kebab-case');
  if (typeof raw.album !== 'string' || !ID_RE.test(raw.album)) {
    push('album', 'must be a kebab-case album id');
  } else if (ctx.albumIds && !ctx.albumIds.has(raw.album)) {
    push('album', `unknown album "${raw.album}"`);
  }
  checkTitle(raw.title, push);
  if (!checkAccess(raw.access)) push('access', `must be "free", "pro" or { pack: "<id>" }`);
  if (raw.difficulty !== 1 && raw.difficulty !== 2 && raw.difficulty !== 3) {
    push('difficulty', 'must be 1, 2 or 3');
  }

  const sizeOk = isIntIn(raw.w, MIN_SIZE, MAX_SIZE) && isIntIn(raw.h, MIN_SIZE, MAX_SIZE);
  if (!isIntIn(raw.w, MIN_SIZE, MAX_SIZE)) push('w', `must be an integer in ${MIN_SIZE}..${MAX_SIZE}`);
  if (!isIntIn(raw.h, MIN_SIZE, MAX_SIZE)) push('h', `must be an integer in ${MIN_SIZE}..${MAX_SIZE}`);

  // Palette
  const palette = raw.palette;
  let paletteOk = false;
  if (!Array.isArray(palette)) {
    push('palette', 'must be an array of #RRGGBB colors');
  } else if (palette.length < MIN_COLORS || palette.length > MAX_COLORS) {
    push('palette', `must hold ${MIN_COLORS}..${MAX_COLORS} colors (got ${palette.length})`);
  } else {
    paletteOk = true;
    palette.forEach((c, i) => {
      if (!isHexColor(c)) {
        push(`palette[${i}]`, `invalid color ${JSON.stringify(c)} (expected #RRGGBB)`);
        paletteOk = false;
      }
    });
    if (paletteOk) {
      const hexes = palette as string[];
      for (let i = 0; i < hexes.length; i++) {
        for (let j = i + 1; j < hexes.length; j++) {
          if (hexes[i].toUpperCase() === hexes[j].toUpperCase()) {
            push(`palette[${j}]`, `duplicate of palette[${i}] (${hexes[i]})`);
            continue;
          }
          const d = deltaE76(hexes[i], hexes[j]);
          if (d < MIN_DELTA_E) {
            push(
              `palette[${j}]`,
              `too close to palette[${i}] (${hexes[i]} vs ${hexes[j]}, ΔE76 ${d.toFixed(1)} < ${MIN_DELTA_E})`,
            );
          }
        }
      }
    }
  }

  // Rows
  const rows = raw.rows;
  if (!Array.isArray(rows)) {
    push('rows', 'must be an array of RLE strings');
    return issues;
  }
  if (sizeOk && rows.length !== raw.h) push('rows', `expected ${String(raw.h)} rows, got ${rows.length}`);
  const paletteSize = paletteOk ? (palette as unknown[]).length : KEYS.length;
  const used = new Set<number>();
  rows.forEach((row, y) => {
    if (typeof row !== 'string') {
      push(`row ${y}`, 'must be a string');
      return;
    }
    try {
      const values = decodeRow(row, paletteSize);
      if (sizeOk && values.length !== raw.w) {
        push(`row ${y}`, `decodes to ${values.length} cells, expected ${String(raw.w)}`);
      }
      for (const v of values) if (v > 0) used.add(v - 1);
    } catch (e) {
      if (e instanceof RleError) push(`row ${y}`, `${e.message} (col ${e.column})`);
      else throw e;
    }
  });
  if (paletteOk) {
    for (let i = 0; i < paletteSize; i++) {
      if (!used.has(i)) push(`palette[${i}]`, `color ${KEYS[i]} (${String((palette as unknown[])[i])}) is never used`);
    }
  }
  return issues;
}

export function isArtworkSource(raw: unknown, ctx?: ArtworkContext): raw is ArtworkSource {
  return validateArtwork(raw, ctx).length === 0;
}

/** Validates albums.json. */
export function validateAlbums(raw: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.albums)) {
    issues.push({ id: 'albums.json', where: 'root', message: 'must be { v: 1, albums: [...] }' });
    return issues;
  }
  const seen = new Set<string>();
  raw.albums.forEach((album: unknown, index: number) => {
    const id = isRecord(album) && typeof album.id === 'string' && album.id ? album.id : `album #${index}`;
    const push = (where: string, message: string) => issues.push({ id, where, message });
    if (!isRecord(album)) {
      push('root', 'must be an object');
      return;
    }
    if (typeof album.id !== 'string' || !ID_RE.test(album.id)) push('id', 'must be kebab-case');
    else if (seen.has(album.id)) push('id', 'duplicate album id');
    else seen.add(album.id);
    checkTitle(album.title, push);
    if (!isIntIn(album.order, 0, 10_000)) push('order', 'must be a non-negative integer');
    if (album.pack !== undefined && (typeof album.pack !== 'string' || !ID_RE.test(album.pack))) {
      push('pack', 'must be a kebab-case pack id');
    }
  });
  return issues;
}

export function isAlbumsFile(raw: unknown): raw is AlbumsFile {
  return validateAlbums(raw).length === 0;
}

/** Validates the whole content set: albums, every artwork and id uniqueness. */
export function validateContent(albumsRaw: unknown, artworksRaw: readonly unknown[]): ValidationIssue[] {
  const issues = validateAlbums(albumsRaw);
  const albumIds = new Set<string>(
    isRecord(albumsRaw) && Array.isArray(albumsRaw.albums)
      ? (albumsRaw.albums as unknown[])
          .filter(isRecord)
          .map((a) => a.id)
          .filter((id): id is string => typeof id === 'string')
      : [],
  );
  const seen = new Set<string>();
  artworksRaw.forEach((raw, index) => {
    issues.push(...validateArtwork(raw, { albumIds }, index));
    if (isRecord(raw) && typeof raw.id === 'string') {
      if (seen.has(raw.id)) issues.push({ id: raw.id, where: 'id', message: 'duplicate artwork id' });
      seen.add(raw.id);
    }
  });
  return issues;
}
