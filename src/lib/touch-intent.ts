/**
 * One-finger touch model of the coloring canvas (F15):
 * - a short tap (released quickly, without moving past the slop) fills the touched cell;
 * - a finger that moves past the slop pans the view (with momentum);
 * - a finger held still for `LONG_PRESS_MS` starts continuous fill: the cell under it is filled,
 *   then every cell it slides over (when long-press fill is enabled in the settings).
 * Two fingers always pinch / pan.
 *
 * `classifyTouch` is the reference model of the thresholds: the gestures do not call it, they are
 * configured with the shared gesture configs below (`TAP_GESTURE`, `LONG_PRESS_FILL_GESTURE`,
 * `VIEWPORT_PAN_GESTURE`), built from the same constants. The tests pin the classifier down and
 * check that these configs use exactly its thresholds, so the two cannot drift apart.
 */

/** Finger travel (points) under which a touch is still a tap / a long press, not a pan. */
export const TOUCH_SLOP = 10;
/** Hold time (ms) that turns a still finger into continuous fill. */
export const LONG_PRESS_MS = 250;
/** A tap must be released before this (ms); the same as the long press, so they never overlap. */
export const TAP_MAX_MS = LONG_PRESS_MS;

/** Tap-to-fill: released before `TAP_MAX_MS`, within the slop. */
export const TAP_GESTURE = { maxDuration: TAP_MAX_MS, maxDistance: TOUCH_SLOP } as const;
/** Continuous fill: one finger held within the slop for `LONG_PRESS_MS`. */
export const LONG_PRESS_FILL_GESTURE = { maxPointers: 1, activateAfterLongPress: LONG_PRESS_MS } as const;
/** Viewport pan: one finger past the slop (or two fingers). */
export const VIEWPORT_PAN_GESTURE = { minPointers: 1, minDistance: TOUCH_SLOP } as const;

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
}

/**
 * What a one-finger touch means at this point of its life: the reference model of the touch
 * thresholds (see above). The gesture handlers implement it through the shared configs
 * (`TAP_GESTURE`, `LONG_PRESS_FILL_GESTURE`, `VIEWPORT_PAN_GESTURE`); any threshold change goes
 * through the constants of this file so that the model and the gestures stay identical.
 */
export function classifyTouch({ elapsedMs, maxDistance, pointers, released, longPressFill }: TouchSample): TouchIntent {
  'worklet';
  if (pointers > 1) return 'pinch';
  // Moving past the slop before the long press elapsed is always a pan.
  if (maxDistance > TOUCH_SLOP) return 'pan';
  if (elapsedMs >= LONG_PRESS_MS) return longPressFill ? 'fill' : released ? 'none' : 'pending';
  if (released) return elapsedMs < TAP_MAX_MS ? 'tap' : 'none';
  return 'pending';
}
