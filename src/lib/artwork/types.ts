/** `#RRGGBB` color string. */
export type HexColor = `#${string}`;

export type ArtworkAccess = 'free' | 'pro' | { pack: string };
export type Difficulty = 1 | 2 | 3;

export interface LocalizedText {
  fr: string;
  en: string;
}

/** On-disk artwork format (one JSON file per artwork). See docs/artwork-format.md. */
export interface ArtworkSource {
  v: 1;
  id: string;
  album: string;
  title: LocalizedText;
  w: number;
  h: number;
  /** palette[i] is addressed by KEYS[i] in `rows`. */
  palette: HexColor[];
  /** h rows, run-length encoded (`<n?><key>`). */
  rows: string[];
  access: ArtworkAccess;
  difficulty: Difficulty;
}

export interface AlbumSource {
  id: string;
  title: LocalizedText;
  order: number;
  /** Content pack id when the whole album belongs to a paid pack. */
  pack?: string;
}

export interface AlbumsFile {
  v: 1;
  albums: AlbumSource[];
}

export interface PaletteColor {
  hex: HexColor;
  rgb: [number, number, number];
  /** 1-based number shown on cells. */
  number: number;
  /** Shape shown in colorblind mode. */
  symbol: string;
}

export interface Palette {
  colors: PaletteColor[];
}

/** Runtime model built from an ArtworkSource. */
export interface Artwork {
  id: string;
  albumId: string;
  title: LocalizedText;
  width: number;
  height: number;
  palette: Palette;
  /** Row-major, 0 = empty, otherwise palette index + 1. */
  cells: Uint8Array;
  /** colorCounts[i] = number of cells of palette color i. */
  colorCounts: Uint32Array;
  totalCells: number;
  access: ArtworkAccess;
  difficulty: Difficulty;
}

/** 52 palette keys: A–Z then a–z. No digits, so RLE is unambiguous. */
export const KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Key for an empty (non-colorable) cell. */
export const EMPTY_KEY = '.';

export const MIN_SIZE = 8;
export const MAX_SIZE = 128;
export const MIN_COLORS = 2;
export const MAX_COLORS = 40;
export const MIN_DELTA_E = 10;
