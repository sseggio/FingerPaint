import { en } from './en';
import type { PluralMessage } from './types';

type Reference = typeof en;

export type MessageKey = keyof Reference;

/** `{a} and {b}` → `'a' | 'b'`. */
type ParamsOf<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | ParamsOf<Rest> : never;

type MessageParamNames<K extends MessageKey> = Reference[K] extends string
  ? ParamsOf<Reference[K]>
  : Reference[K] extends { other: infer O extends string }
    ? ParamsOf<O> | 'count'
    : never;

export type ParamValue = string | number;

/** Interpolation values required by a key (`count` is required for plural messages). */
export type MessageParams<K extends MessageKey> = { [P in MessageParamNames<K>]: P extends 'count' ? number : ParamValue };

/**
 * Shape every translation must match: same keys as the English reference, a plain string where
 * English has one, and plural forms where English has them. A missing key is a type error.
 */
export type Dictionary = { readonly [K in MessageKey]: Reference[K] extends string ? string : PluralMessage };
