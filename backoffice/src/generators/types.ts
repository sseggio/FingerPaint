import type { ArtworkSource, HexColor } from '../artwork-lib';
import type { ParamSpec, ParamValues } from './params';
import type { Rng } from './prng';
import type { Canvas } from './raster';

/** Level of detail a drawing aims for (1 = big zones, 3 = fine detail). */
export type Detail = 1 | 2 | 3;

export const GENERATOR_IDS = ['creature', 'mandala', 'landscape', 'plant', 'pattern', 'remix'] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export interface DrawContext {
  rng: Rng;
  params: ParamValues;
  w: number;
  h: number;
  /** Color budget (max colors after quantization). */
  colors: number;
  detail: Detail;
  /** Key colors of the chosen palette. */
  keys: HexColor[];
  /** Throws GenerateTimeoutError past the deadline (called between drawing passes). */
  check(): void;
  /** Remix only: the resolved source artwork. */
  source?: ArtworkSource;
}

export interface GeneratorDef {
  id: GeneratorId;
  name: { fr: string; en: string };
  description: string;
  params: ParamSpec[];
  /** Run the small-region cleanup after drawing (off for remixes: the structure is kept as is). */
  clean: boolean;
  draw(ctx: DrawContext): Canvas;
}
