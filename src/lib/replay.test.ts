import { FRAME_MS, REPLAY_DURATION_MS, replayCountAt, replayEasing, replayFramePlan } from './replay';

describe('replayEasing', () => {
  it('eases in and out: slow ends, symmetric, monotonic, clamped', () => {
    expect(replayEasing(0)).toBe(0);
    expect(replayEasing(1)).toBe(1);
    expect(replayEasing(0.5)).toBeCloseTo(0.5);
    expect(replayEasing(-1)).toBe(0);
    expect(replayEasing(2)).toBe(1);
    expect(replayEasing(Number.NaN)).toBe(0);
    expect(replayEasing(0.1)).toBeLessThan(0.1);
    expect(replayEasing(0.9)).toBeGreaterThan(0.9);
    expect(replayEasing(0.25) + replayEasing(0.75)).toBeCloseTo(1);
    for (let t = 0; t < 1; t += 0.01) expect(replayEasing(t + 0.01)).toBeGreaterThanOrEqual(replayEasing(t));
  });
});

describe('replayCountAt', () => {
  it('starts empty and ends exactly on the last cell at the duration', () => {
    expect(replayCountAt(0, 2500, 1000)).toBe(0);
    expect(replayCountAt(-5, 2500, 1000)).toBe(0);
    expect(Math.abs(replayCountAt(1250, 2500, 1000) - 500)).toBeLessThanOrEqual(1);
    expect(replayCountAt(2499, 2500, 1000)).toBeLessThan(1000);
    expect(replayCountAt(2500, 2500, 1000)).toBe(1000);
    expect(replayCountAt(9999, 2500, 1000)).toBe(1000);
  });

  it('handles empty replays and a zero duration', () => {
    expect(replayCountAt(100, 2500, 0)).toBe(0);
    expect(replayCountAt(0, 0, 10)).toBe(10);
  });
});

describe('replayFramePlan', () => {
  it.each([
    ['16×16', 256],
    ['64×64', 4096],
    ['128×128', 16_384],
  ])('%s: fixed duration, cells per frame derived, sum exact', (_name, total) => {
    const plan = replayFramePlan(total);
    expect(plan).toHaveLength(Math.ceil(REPLAY_DURATION_MS / FRAME_MS));
    expect(plan.reduce((a, b) => a + b, 0)).toBe(total);
    expect(plan.every((n) => n >= 0)).toBe(true);
    // Ease-in-out: the middle frames carry more cells than the first and last ones.
    const mid = plan[Math.floor(plan.length / 2)];
    expect(mid).toBeGreaterThan(plan[1]);
    expect(mid).toBeGreaterThan(plan[plan.length - 2]);
    expect(Math.max(...plan)).toBeLessThanOrEqual(Math.ceil((total * Math.PI) / 2 / plan.length) + 1);
  });

  it('a tiny artwork still fills in the same time (some frames add nothing)', () => {
    const plan = replayFramePlan(5, 2500);
    expect(plan.reduce((a, b) => a + b, 0)).toBe(5);
    expect(plan.filter((n) => n === 0).length).toBeGreaterThan(100);
  });

  it('follows the given duration and frame time', () => {
    expect(replayFramePlan(100, 1000, 100)).toEqual([2, 7, 11, 14, 15, 16, 14, 11, 7, 3]);
  });
});
