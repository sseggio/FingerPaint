import { classifyTouch, LONG_PRESS_MS, TAP_MAX_MS, TOUCH_SLOP, type TouchSample } from './touch-intent';

const base: TouchSample = { elapsedMs: 0, maxDistance: 0, pointers: 1, released: false, longPressFill: true };
const touch = (s: Partial<TouchSample>) => classifyTouch({ ...base, ...s });

describe('one-finger touch model', () => {
  it('uses a slop of ~8–10 pt and a long press of ~250 ms, with no gap between tap and long press', () => {
    expect(TOUCH_SLOP).toBeGreaterThanOrEqual(8);
    expect(TOUCH_SLOP).toBeLessThanOrEqual(10);
    expect(LONG_PRESS_MS).toBe(250);
    expect(TAP_MAX_MS).toBe(LONG_PRESS_MS);
  });

  it('is pending while the finger is down, still, before the long press', () => {
    expect(touch({})).toBe('pending');
    expect(touch({ elapsedMs: 200, maxDistance: TOUCH_SLOP })).toBe('pending');
  });

  it('fills on a short tap released within the slop', () => {
    expect(touch({ elapsedMs: 80, released: true })).toBe('tap');
    expect(touch({ elapsedMs: LONG_PRESS_MS - 1, maxDistance: TOUCH_SLOP, released: true })).toBe('tap');
    // Long-press fill off: taps still fill.
    expect(touch({ elapsedMs: 80, released: true, longPressFill: false })).toBe('tap');
  });

  it('pans as soon as the finger moves past the slop, quickly or slowly', () => {
    expect(touch({ elapsedMs: 40, maxDistance: TOUCH_SLOP + 1 })).toBe('pan');
    expect(touch({ elapsedMs: 200, maxDistance: 30 })).toBe('pan');
    // A fast flick released before the tap delay is a pan, not a tap.
    expect(touch({ elapsedMs: 90, maxDistance: 40, released: true })).toBe('pan');
  });

  it('starts continuous fill after a still long press', () => {
    expect(touch({ elapsedMs: LONG_PRESS_MS })).toBe('fill');
    expect(touch({ elapsedMs: 600, maxDistance: 4 })).toBe('fill');
    expect(touch({ elapsedMs: 600, released: true })).toBe('fill');
  });

  it('does not fill after a long press when the setting is off: it waits for a pan or does nothing', () => {
    expect(touch({ elapsedMs: 400, longPressFill: false })).toBe('pending');
    expect(touch({ elapsedMs: 400, longPressFill: false, released: true })).toBe('none');
    expect(touch({ elapsedMs: 400, maxDistance: 20, longPressFill: false })).toBe('pan');
  });

  it('hands over to pinch / pan as soon as a second finger lands', () => {
    expect(touch({ pointers: 2 })).toBe('pinch');
    expect(touch({ pointers: 2, elapsedMs: 400 })).toBe('pinch');
    expect(touch({ pointers: 2, maxDistance: 50 })).toBe('pinch');
  });
});
