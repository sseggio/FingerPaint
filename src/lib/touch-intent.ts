/**
 * One-finger touch model of the coloring canvas (F15):
 * - a short tap (released quickly, without moving past the slop) fills the touched cell;
 * - a finger that moves past the slop pans the view (with momentum);
 * - a finger held still for the long-press delay (`LONG_PRESS_MS` by default, a setting since F23)
 *   starts continuous fill: the cell under it is filled,
 *   then every cell it slides over (when long-press fill is enabled in the settings).
 * Two fingers always pinch / pan.
 *
 * `classifyTouch` is the reference model of the thresholds: the gestures do not call it, they are
 * configured with the shared gesture configs below (`tapGestureConfig`, `longPressFillGestureConfig`,
 * `VIEWPORT_PAN_GESTURE`), built from the same constants. The tests pin the classifier down and
 * check that these configs use exactly its thresholds, so the two cannot drift apart.
 */

/** Finger travel (points) under which a touch is still a tap / a long press, not a pan. */
export const TOUCH_SLOP = 10;
/**
 * Hold times (ms) offered by the "Delay before coloring by sliding" setting (F23): short,
 * normal (the default) and long. Moving past the slop before the delay always pans.
 */
export const LONG_PRESS_OPTIONS_MS = [120, 150, 250] as const;
export type LongPressMs = (typeof LONG_PRESS_OPTIONS_MS)[number];
/** Default hold time (ms) that turns a still finger into continuous fill. */
export const LONG_PRESS_MS: LongPressMs = 150;
/**
 * Longest tap (ms) when long-press fill is off: nothing else can happen to a still finger, so a
 * tap keeps its comfortable pre-F23 length instead of following the long-press delay.
 */
export const TAP_ALONE_MAX_MS = 250;
/** A tap must be released before this (ms); the same as the long press, so they never overlap. */
export const TAP_MAX_MS = LONG_PRESS_MS;

/**
 * Longest tap (ms) for a long-press delay: with long-press fill on, the tap ends where the long
 * press begins (a longer still touch starts continuous fill, which fills the cell under the
 * finger: no dead zone); with it off, `TAP_ALONE_MAX_MS`.
 */
export function tapMaxMs(longPressMs: number, longPressFill: boolean): number {
  'worklet';
  return longPressFill ? longPressMs : TAP_ALONE_MAX_MS;
}

/** Tap-to-fill config for a long-press delay: released before `tapMaxMs`, within the slop. */
export function tapGestureConfig(longPressMs: number, longPressFill: boolean) {
  return { maxDuration: tapMaxMs(longPressMs, longPressFill), maxDistance: TOUCH_SLOP } as const;
}

/** Continuous-fill config: one finger held within the slop for `longPressMs`. */
export function longPressFillGestureConfig(longPressMs: number) {
  return { maxPointers: 1, activateAfterLongPress: longPressMs } as const;
}

/** Tap-to-fill with the default delay. */
export const TAP_GESTURE = tapGestureConfig(LONG_PRESS_MS, true);
/** Continuous fill with the default delay. */
export const LONG_PRESS_FILL_GESTURE = longPressFillGestureConfig(LONG_PRESS_MS);
/** Viewport pan: one finger past the slop (or two fingers). */
export const VIEWPORT_PAN_GESTURE = { minPointers: 1, minDistance: TOUCH_SLOP } as const;

/** True for one of the delays offered by the setting (validation of stored settings). */
export function isLongPressMs(value: unknown): value is LongPressMs {
  return (LONG_PRESS_OPTIONS_MS as readonly unknown[]).includes(value);
}

export type TouchIntent =
  /** Nothing decided yet: the finger is down, still, and the long press has not elapsed. */
  | 'pending'
  | 'tap'
  | 'pan'
  | 'fill'
  /** Held still, then released, with long-press fill disabled: nothing happens. */
  | 'none'
  /** Two fingers or more: pinch / pan. */
  | 'pinch';

export interface TouchSample {
  /** Time since the finger went down (ms). */
  elapsedMs: number;
  /** Farthest distance (points) from where the finger went down, before any decision. */
  maxDistance: number;
  /** Fingers on the screen. */
  pointers: number;
  /** The finger is lifted (end of the touch). */
  released: boolean;
  /** "Fill by sliding after a long press" setting. */
  longPressFill: boolean;
  /** "Delay before coloring by sliding" setting (ms), `LONG_PRESS_MS` by default. */
  longPressMs?: number;
}

/**
 * What a one-finger touch means at this point of its life: the reference model of the touch
 * thresholds (see above). The gesture handlers implement it through the shared configs
 * (`TAP_GESTURE`, `LONG_PRESS_FILL_GESTURE`, `VIEWPORT_PAN_GESTURE`); any threshold change goes
 * through the constants of this file so that the model and the gestures stay identical.
 */
export function classifyTouch({
  elapsedMs,
  maxDistance,
  pointers,
  released,
  longPressFill,
  longPressMs = LONG_PRESS_MS,
}: TouchSample): TouchIntent {
  'worklet';
  if (pointers > 1) return 'pinch';
  // Moving past the slop before the long press elapsed is always a pan.
  if (maxDistance > TOUCH_SLOP) return 'pan';
  if (longPressFill && elapsedMs >= longPressMs) return 'fill';
  if (released) return elapsedMs < tapMaxMs(longPressMs, longPressFill) ? 'tap' : 'none';
  return 'pending';
}
