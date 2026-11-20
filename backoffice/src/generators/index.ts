/**
 * Procedural artwork generators (F34, no AI): pure and deterministic. The same generator, seed
 * and parameters always give the same artwork. Each drawing goes through the cleanup pass (no
 * orphan cells) and then through the PNG import's quantizer (`gridToConverted`: ΔE76 merge,
 * luminance-sorted palette, RLE rows), so the result is a regular, validated ArtworkSource.
 */
import type { ArtworkSource, Difficulty, HexColor } from '../artwork-lib';
import { decode, formatIssue, validateArtwork } from '../artwork-lib';
import { gridToConverted } from '../convert';
import { resolvePalette } from './color';
import { creature } from './creature';
import { landscape } from './landscape';
import { mandala } from './mandala';
import type { ParamSpec, ParamValues } from './params';
import { num, paletteOf, ParamError, parseParams, SOURCE_RE, str } from './params';
import { pattern } from './pattern';
import { plant } from './plant';
import { normalizeSeed, Rng } from './prng';
import { remix } from './remix';
import type { Detail, DrawContext, GeneratorDef, GeneratorId } from './types';
import { GENERATOR_IDS } from './types';

export { GENERATOR_IDS, ParamError };
export type { GeneratorId, ParamSpec, ParamValues };

export const GENERATORS: Record<GeneratorId, GeneratorDef> = { creature, mandala, landscape, plant, pattern, remix };

/** Wall-clock budget for one artwork (a 256×256 drawing takes well under it). */
export const GENERATE_BUDGET_MS = 1500;

export class GenerateTimeoutError extends Error {
  constructor() {
    super('generation took too long');
    this.name = 'GenerateTimeoutError';
  }
}

export function isGeneratorId(v: unknown): v is GeneratorId {
  return typeof v === 'string' && (GENERATOR_IDS as readonly string[]).includes(v);
}

export interface GenerateOptions {
  /** Remix sources: `embedded:<id>` / `catalog:<id>` → validated artwork, or null. */
  resolveSource?: (kind: 'embedded' | 'catalog', id: string) => ArtworkSource | null;
  budgetMs?: number;
  now?: () => number;
}

export interface GeneratedStats {
  /** Cells to color (non-empty). */
  cells: number;
  colors: number;
  /** 4-connected same-color regions. */
  regions: number;
  /** Non-empty cells with no 4-neighbor of the same color, over `cells`. */
  orphanRatio: number;
  /** Estimated difficulty (from size, colors and fragmentation). */
  estimatedDifficulty: Difficulty;
}

export interface GeneratedArtwork {
  generator: GeneratorId;
  seed: string;
  params: ParamValues;
  w: number;
  h: number;
  palette: HexColor[];
  rows: string[];
  /** Forced difficulty, or the estimated one. */
  difficulty: Difficulty;
  stats: GeneratedStats;
  ms: number;
}

/** Fragmentation statistics of a decoded grid (0 = empty). */
export function gridStats(cells: ArrayLike<number>, w: number, h: number): { cells: number; regions: number; orphans: number } {
  const n = w * h;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let filled = 0;
  let regions = 0;
  let orphans = 0;
  for (let i = 0; i < n; i++) {
    const v = cells[i];
    if (v === 0) continue;
    filled++;
    const x = i % w;
    const y = (i - x) / w;
    if (!((x > 0 && cells[i - 1] === v) || (x < w - 1 && cells[i + 1] === v) || (y > 0 && cells[i - w] === v) || (y < h - 1 && cells[i + w] === v))) orphans++;
    if (seen[i]) continue;
    regions++;
    let head = 0;
    let tail = 0;
    queue[tail++] = i;
    seen[i] = 1;
    while (head < tail) {
      const j = queue[head++];
      const jx = j % w;
      const nb = [jx > 0 ? j - 1 : -1, jx < w - 1 ? j + 1 : -1, j - w, j + w];
      for (const k of nb) {
        if (k < 0 || k >= n || seen[k] || cells[k] !== v) continue;
        seen[k] = 1;
        queue[tail++] = k;
      }
    }
  }
  return { cells: filled, regions, orphans };
}

/** Difficulty from the amount of work: cells to color, colors and how fragmented zones are. */
export function estimateDifficulty(cells: number, colors: number, regions: number): Difficulty {
  const avgRegion = cells / Math.max(1, regions);
  const score = Math.log2(Math.max(1, cells) / 400) * 0.9 + (colors - 8) / 6 + (avgRegion < 12 ? 1 : avgRegion < 30 ? 0.5 : 0);
  if (score < 1.6) return 1;
  if (score < 4.2) return 2;
  return 3;
}

function detailFor(params: ParamValues, w: number, h: number): Detail {
  const forced = params.difficulty;
  if (forced === '1' || forced === '2' || forced === '3') return Number(forced) as Detail;
  const side = Math.sqrt(w * h);
  return side <= 40 ? 1 : side <= 120 ? 2 : 3;
}

/** Smallest zone (cells) kept by the cleanup pass. */
export function minRegionFor(detail: Detail, w: number, h: number): number {
  if (Math.min(w, h) < 24) return 2;
  return detail === 1 ? 4 : detail === 2 ? 3 : 2;
}

/**
 * Generates one artwork. Throws ParamError on invalid parameters or seed (and unknown remix
 * sources), GenerateTimeoutError past the time budget.
 */
export function generate(generator: GeneratorId, rawParams: unknown, rawSeed: unknown, opts: GenerateOptions = {}): GeneratedArtwork {
  const def = GENERATORS[generator];
  const params = parseParams(def.params, rawParams);
  const seed = normalizeSeed(rawSeed);
  if (seed === null) throw new ParamError([{ field: 'seed', message: 'Graine attendue : entier ≥ 0 ou texte court (32 caractères max.).' }]);
  const now = opts.now ?? (() => performance.now());
  const start = now();
  const deadline = start + (opts.budgetMs ?? GENERATE_BUDGET_MS);
  const check = () => {
    if (now() > deadline) throw new GenerateTimeoutError();
  };

  let source: ArtworkSource | undefined;
  let w: number;
  let h: number;
  let colors: number;
  if (generator === 'remix') {
    const m = SOURCE_RE.exec(str(params, 'source'));
    const found = m ? (opts.resolveSource?.(m[1] as 'embedded' | 'catalog', m[2]) ?? null) : null;
    if (!found) throw new ParamError([{ field: 'params.source', message: 'Œuvre source introuvable.' }]);
    source = found;
    w = found.w;
    h = found.h;
    colors = found.palette.length;
  } else {
    w = num(params, 'width');
    h = num(params, 'height');
    colors = num(params, 'colors');
  }
  const rng = new Rng(`${generator}:${seed}`);
  const detail = detailFor(params, w, h);
  const keys = generator === 'remix' && str(params, 'mode') === 'hue' ? [] : resolvePalette(paletteOf(params), rng.fork('palette'));
  const ctx: DrawContext = { rng: rng.fork('draw'), params, w, h, colors, detail, keys, check, source };
  const canvas = def.draw(ctx);
  check();
  if (def.clean) canvas.cleanSmallRegions(minRegionFor(detail, w, h));
  check();
  const grid = gridToConverted(canvas.toGrid(), generator === 'remix' ? 40 : colors);
  const { cells } = decode(grid.rows, grid.w, grid.h, grid.palette.length);
  const st = gridStats(cells, grid.w, grid.h);
  const estimated = estimateDifficulty(st.cells, grid.palette.length, st.regions);
  const forced = params.difficulty;
  const difficulty: Difficulty =
    forced === '1' || forced === '2' || forced === '3' ? (Number(forced) as Difficulty) : source ? source.difficulty : estimated;
  // Same validator as uploads and the app: a generator bug can never produce an invalid file.
  const issues = validateArtwork(toArtworkSource({ generator, seed, params, w, h, palette: grid.palette, rows: grid.rows, difficulty }, PROBE_META));
  if (issues.length) throw new Error(`generator ${generator} produced an invalid artwork: ${formatIssue(issues[0])}`);
  return {
    generator,
    seed,
    params,
    w: grid.w,
    h: grid.h,
    palette: grid.palette,
    rows: grid.rows,
    difficulty,
    stats: {
      cells: st.cells,
      colors: grid.palette.length,
      regions: st.regions,
      orphanRatio: st.cells ? st.orphans / st.cells : 0,
      estimatedDifficulty: estimated,
    },
    ms: Math.round(now() - start),
  };
}

export interface ArtworkMeta {
  id: string;
  album: string;
  title: { fr: string; en: string };
  access: ArtworkSource['access'];
  difficulty?: Difficulty;
}

const PROBE_META: ArtworkMeta = { id: 'generated', album: 'generated', title: { fr: 'Généré', en: 'Generated' }, access: 'free' };

/** Generated grid + metadata → artwork file (difficulty from meta when given). */
export function toArtworkSource(
  art: Pick<GeneratedArtwork, 'w' | 'h' | 'palette' | 'rows' | 'difficulty'> & Partial<GeneratedArtwork>,
  meta: ArtworkMeta,
): ArtworkSource {
  return {
    v: 1,
    id: meta.id,
    album: meta.album,
    title: meta.title,
    w: art.w,
    h: art.h,
    palette: art.palette,
    rows: art.rows,
    access: meta.access,
    difficulty: meta.difficulty ?? art.difficulty,
  };
}

/** Suggested titles, e.g. « Mandala n°4821 » / "Mandala #4821". */
export function suggestTitle(generator: GeneratorId, seed: string): { fr: string; en: string } {
  const n = /^\d{1,6}$/.test(seed) ? Number(seed) : hashNumber(seed);
  const name = GENERATORS[generator].name;
  return { fr: `${name.fr} n°${n}`, en: `${name.en} #${n}` };
}

function hashNumber(seed: string): number {
  return new Rng(seed).int(1, 9999);
}

/** Public description of the generators and their parameters (for the admin UI). */
export function describeGenerators() {
  return GENERATOR_IDS.map((id) => {
    const g = GENERATORS[id];
    return { id, name: g.name, description: g.description, params: g.params };
  });
}
