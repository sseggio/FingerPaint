/**
 * Timing of the completion replay (F18): the finished artwork refills itself in its recorded
 * order, in a fixed total time whatever its size (a 16×16 and a 128×128 both take
 * `REPLAY_DURATION_MS`), so the number of cells drawn per frame is derived from the elapsed time.
 *
 * The progress follows a gentle ease-in-out (sine): it starts slowly, speeds up in the middle,
 * then settles, and always ends exactly on the last cell at `durationMs`.
 */

/** Total replay time, whatever the artwork size. */
export const REPLAY_DURATION_MS = 2500;
/** Small "pop" of the finished artwork right after the replay. */
export const REPLAY_POP_SCALE = 1.04;
export const REPLAY_POP_MS = 320;
/** Nominal frame time (60 Hz) used to describe a replay frame by frame. */
export const FRAME_MS = 1000 / 60;

/** Sine ease-in-out on 0..1 (clamped): 0 → 0, 0.5 → 0.5, 1 → 1, symmetric, monotonic. */
export function replayEasing(t: number): number {
  if (!(t > 0)) return 0;
  if (t >= 1) return 1;
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/**
 * Cells shown `elapsedMs` after the start of a replay of `total` cells lasting `durationMs`.
 * Never decreases with time, 0 at the start, exactly `total` from `durationMs` on.
 */
export function replayCountAt(elapsedMs: number, durationMs: number, total: number): number {
  if (total <= 0) return 0;
  if (!(durationMs > 0) || elapsedMs >= durationMs) return total;
  if (!(elapsedMs > 0)) return 0;
  return Math.min(total, Math.floor(total * replayEasing(elapsedMs / durationMs)));
}

/**
 * Cells added at each frame of a replay at a steady frame rate (what `replayCountAt` produces
 * frame by frame). The sum is exactly `total`; the frame count is ceil(duration / frame).
 */
export function replayFramePlan(total: number, durationMs: number = REPLAY_DURATION_MS, frameMs: number = FRAME_MS): number[] {
  const frames = Math.max(1, Math.ceil(durationMs / frameMs - 1e-9));
  const plan: number[] = [];
  let shown = 0;
  for (let f = 1; f <= frames; f++) {
    const next = f === frames ? total : replayCountAt(f * frameMs, durationMs, total);
    plan.push(next - shown);
    shown = next;
  }
  return plan;
}
