import {
  classifyTouch,
  isLongPressMs,
  LONG_PRESS_FILL_GESTURE,
  LONG_PRESS_MS,
  LONG_PRESS_OPTIONS_MS,
  longPressFillGestureConfig,
  TAP_ALONE_MAX_MS,
  TAP_GESTURE,
  TAP_MAX_MS,
  tapGestureConfig,
  tapMaxMs,
  TOUCH_SLOP,
  VIEWPORT_PAN_GESTURE,
  type TouchSample,
} from './touch-intent';

const base: TouchSample = { elapsedMs: 0, maxDistance: 0, pointers: 1, released: false, longPressFill: true };
const touch = (s: Partial<TouchSample>) => classifyTouch({ ...base, ...s });

describe('one-finger touch model', () => {
  it('uses a slop of ~8–10 pt and a default long press of 150 ms, with no gap between tap and long press', () => {
    expect(TOUCH_SLOP).toBeGreaterThanOrEqual(8);
    expect(TOUCH_SLOP).toBeLessThanOrEqual(10);
    expect(LONG_PRESS_MS).toBe(150);
    expect(LONG_PRESS_OPTIONS_MS).toEqual([120, 150, 250]);
    expect(LONG_PRESS_OPTIONS_MS).toContain(LONG_PRESS_MS);
    expect(TAP_MAX_MS).toBe(LONG_PRESS_MS);
    expect(TAP_ALONE_MAX_MS).toBe(250);
  });

  it('is pending while the finger is down, still, before the long press', () => {
    expect(touch({})).toBe('pending');
    expect(touch({ elapsedMs: LONG_PRESS_MS - 1, maxDistance: TOUCH_SLOP })).toBe('pending');
  });

  it('fills on a short tap released within the slop', () => {
    expect(touch({ elapsedMs: 80, released: true })).toBe('tap');
    expect(touch({ elapsedMs: LONG_PRESS_MS - 1, maxDistance: TOUCH_SLOP, released: true })).toBe('tap');
    // Long-press fill off: taps still fill, with the longer pre-F23 tap length.
    expect(touch({ elapsedMs: 80, released: true, longPressFill: false })).toBe('tap');
    expect(touch({ elapsedMs: 200, released: true, longPressFill: false })).toBe('tap');
  });

  it('pans as soon as the finger moves past the slop, quickly or slowly', () => {
    expect(touch({ elapsedMs: 40, maxDistance: TOUCH_SLOP + 1 })).toBe('pan');
    expect(touch({ elapsedMs: 140, maxDistance: 30 })).toBe('pan');
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
    expect(touch({ elapsedMs: TAP_ALONE_MAX_MS, longPressFill: false, released: true })).toBe('none');
    expect(touch({ elapsedMs: 400, maxDistance: 20, longPressFill: false })).toBe('pan');
  });

  it('hands over to pinch / pan as soon as a second finger lands', () => {
    expect(touch({ pointers: 2 })).toBe('pinch');
    expect(touch({ pointers: 2, elapsedMs: 400 })).toBe('pinch');
    expect(touch({ pointers: 2, maxDistance: 50 })).toBe('pinch');
  });
});

describe.each(LONG_PRESS_OPTIONS_MS)('long-press delay of %i ms (F23 setting)', (longPressMs) => {
  const at = (s: Partial<TouchSample>) => touch({ longPressMs, ...s });

  it('taps before the delay, fills from the delay on, pans past the slop', () => {
    expect(at({ elapsedMs: longPressMs - 1, released: true })).toBe('tap');
    expect(at({ elapsedMs: longPressMs - 1 })).toBe('pending');
    expect(at({ elapsedMs: longPressMs })).toBe('fill');
    // A touch held longer than the delay starts continuous fill (which fills its cell): no gap.
    expect(at({ elapsedMs: longPressMs, released: true })).toBe('fill');
    expect(at({ elapsedMs: longPressMs - 1, maxDistance: TOUCH_SLOP + 1 })).toBe('pan');
  });

  it('builds gesture configs that match the model', () => {
    const tap = tapGestureConfig(longPressMs, true);
    const longPress = longPressFillGestureConfig(longPressMs);
    expect(tap.maxDistance).toBe(TOUCH_SLOP);
    expect(tap.maxDuration).toBe(tapMaxMs(longPressMs, true));
    expect(tap.maxDuration).toBe(longPress.activateAfterLongPress);
    expect(at({ elapsedMs: tap.maxDuration - 1, maxDistance: tap.maxDistance, released: true })).toBe('tap');
    expect(at({ elapsedMs: longPress.activateAfterLongPress })).toBe('fill');
    expect(at({ elapsedMs: longPress.activateAfterLongPress - 1 })).toBe('pending');
    expect(longPress.maxPointers).toBe(1);
  });

  it('keeps the long tap when long-press fill is off', () => {
    const tap = tapGestureConfig(longPressMs, false);
    expect(tap.maxDuration).toBe(TAP_ALONE_MAX_MS);
    expect(at({ elapsedMs: tap.maxDuration - 1, released: true, longPressFill: false })).toBe('tap');
    expect(at({ elapsedMs: tap.maxDuration, released: true, longPressFill: false })).toBe('none');
  });
});

describe('gesture configs (shared with the gesture handlers)', () => {
  it('use exactly the thresholds of the reference model', () => {
    // Tap: released within the slop and before the tap delay.
    expect(TAP_GESTURE.maxDistance).toBe(TOUCH_SLOP);
    expect(TAP_GESTURE.maxDuration).toBe(TAP_MAX_MS);
    expect(touch({ elapsedMs: TAP_GESTURE.maxDuration - 1, maxDistance: TAP_GESTURE.maxDistance, released: true })).toBe(
      'tap',
    );
    // Long press: one finger, held for the long-press delay.
    expect(LONG_PRESS_FILL_GESTURE.maxPointers).toBe(1);
    expect(LONG_PRESS_FILL_GESTURE.activateAfterLongPress).toBe(LONG_PRESS_MS);
    expect(touch({ elapsedMs: LONG_PRESS_FILL_GESTURE.activateAfterLongPress })).toBe('fill');
    expect(touch({ elapsedMs: LONG_PRESS_FILL_GESTURE.activateAfterLongPress - 1 })).toBe('pending');
    expect(touch({ pointers: LONG_PRESS_FILL_GESTURE.maxPointers + 1 })).toBe('pinch');
    // Pan: past the slop.
    expect(VIEWPORT_PAN_GESTURE.minDistance).toBe(TOUCH_SLOP);
    expect(VIEWPORT_PAN_GESTURE.minPointers).toBe(1);
    expect(touch({ maxDistance: VIEWPORT_PAN_GESTURE.minDistance + 1 })).toBe('pan');
    expect(touch({ maxDistance: VIEWPORT_PAN_GESTURE.minDistance })).toBe('pending');
  });

  it('validates stored delays', () => {
    for (const ms of LONG_PRESS_OPTIONS_MS) expect(isLongPressMs(ms)).toBe(true);
    expect(isLongPressMs(200)).toBe(false);
    expect(isLongPressMs('150')).toBe(false);
  });
});
