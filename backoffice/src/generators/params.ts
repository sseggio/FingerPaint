/**
 * Generator parameters: a small declarative schema per generator (also sent to the admin UI so
 * it can build its controls), and strict validation. Out-of-range or unknown values are refused,
 * never silently clamped; missing values take their default.
 */
import type { PaletteChoice } from './color';
import { PALETTE_NAMES, PALETTES, RANDOM_PALETTE } from './color';

export const MIN_GEN_SIZE = 16;
export const MAX_GEN_SIZE = 256;
/** Longest side / shortest side. */
export const MAX_ASPECT = 2;
export const MIN_GEN_COLORS = 4;
export const MAX_GEN_COLORS = 24;

export interface EnumOption {
  value: string;
  label: string;
}

export type ParamSpec =
  | { key: string; kind: 'int'; label: string; min: number; max: number; step?: number; default: number }
  | { key: string; kind: 'enum'; label: string; options: EnumOption[]; default: string }
  | { key: string; kind: 'bool'; label: string; default: boolean }
  /** Reference to an existing artwork: `embedded:<id>` or `catalog:<id>` (existence checked by the caller). */
  | { key: string; kind: 'source'; label: string; default: string };

export const SOURCE_RE = /^(embedded|catalog):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface ParamIssue {
  field: string;
  message: string;
}

export class ParamError extends Error {
  constructor(readonly issues: ParamIssue[]) {
    super(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
    this.name = 'ParamError';
  }
}

export const PALETTE_OPTIONS: EnumOption[] = [
  { value: RANDOM_PALETTE, label: 'Aléatoire harmonieuse' },
  ...PALETTE_NAMES.map((name) => ({ value: name, label: PALETTES[name].fr })),
];

/** Size, colors, palette and difficulty: shared by every drawing generator. */
export function commonSpecs(defaults: { colors?: number; palette?: string } = {}): ParamSpec[] {
  return [
    { key: 'width', kind: 'int', label: 'Largeur', min: MIN_GEN_SIZE, max: MAX_GEN_SIZE, default: 64 },
    { key: 'height', kind: 'int', label: 'Hauteur', min: MIN_GEN_SIZE, max: MAX_GEN_SIZE, default: 64 },
    { key: 'colors', kind: 'int', label: 'Couleurs (max.)', min: MIN_GEN_COLORS, max: MAX_GEN_COLORS, default: defaults.colors ?? 12 },
    { key: 'palette', kind: 'enum', label: 'Palette', options: PALETTE_OPTIONS, default: defaults.palette ?? RANDOM_PALETTE },
    {
      key: 'difficulty',
      kind: 'enum',
      label: 'Difficulté',
      options: [
        { value: 'auto', label: 'Automatique' },
        { value: '1', label: 'Facile' },
        { value: '2', label: 'Moyen' },
        { value: '3', label: 'Difficile' },
      ],
      default: 'auto',
    },
  ];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validates `raw` against `specs`; throws ParamError listing every problem. */
export function parseParams(specs: readonly ParamSpec[], raw: unknown): ParamValues {
  const issues: ParamIssue[] = [];
  const out: ParamValues = {};
  if (raw !== undefined && raw !== null && !isRecord(raw)) throw new ParamError([{ field: 'params', message: 'Objet attendu.' }]);
  const input = isRecord(raw) ? raw : {};
  const known = new Set(specs.map((s) => s.key));
  for (const key of Object.keys(input)) if (!known.has(key)) issues.push({ field: `params.${key}`, message: 'Paramètre inconnu.' });
  for (const spec of specs) {
    const v = input[spec.key];
    const field = `params.${spec.key}`;
    if (v === undefined || v === null) {
      if (spec.kind === 'source' && spec.default === '') issues.push({ field, message: 'Choisis une œuvre source.' });
      out[spec.key] = spec.default;
      continue;
    }
    if (spec.kind === 'int') {
      const n = typeof v === 'string' && /^-?\d{1,6}$/.test(v) ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < spec.min || n > spec.max) {
        issues.push({ field, message: `Entier attendu entre ${spec.min} et ${spec.max}.` });
      } else out[spec.key] = n;
    } else if (spec.kind === 'enum') {
      const s = typeof v === 'number' ? String(v) : v;
      if (typeof s !== 'string' || !spec.options.some((o) => o.value === s)) {
        issues.push({ field, message: `Valeur attendue : ${spec.options.map((o) => o.value).join(', ')}.` });
      } else out[spec.key] = s;
    } else if (spec.kind === 'source') {
      if (typeof v !== 'string' || v.length > 60 || !SOURCE_RE.test(v)) {
        issues.push({ field, message: 'Œuvre source attendue (embedded:<id> ou catalog:<id>).' });
      } else out[spec.key] = v;
    } else if (typeof v !== 'boolean') {
      issues.push({ field, message: 'Booléen attendu.' });
    } else out[spec.key] = v;
  }
  if (known.has('width') && known.has('height') && typeof out.width === 'number' && typeof out.height === 'number') {
    const ratio = Math.max(out.width, out.height) / Math.min(out.width, out.height);
    if (ratio > MAX_ASPECT) issues.push({ field: 'params.height', message: `Proportions trop allongées (au plus ${MAX_ASPECT}:1).` });
  }
  if (issues.length) throw new ParamError(issues);
  return out;
}

/** Typed accessors (the values were validated by parseParams). */
export const num = (p: ParamValues, key: string): number => p[key] as number;
export const str = (p: ParamValues, key: string): string => p[key] as string;
export const bool = (p: ParamValues, key: string): boolean => p[key] as boolean;
export const paletteOf = (p: ParamValues): PaletteChoice => p.palette as PaletteChoice;
