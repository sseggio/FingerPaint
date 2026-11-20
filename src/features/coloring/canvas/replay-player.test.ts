import { toArtwork } from '@/lib/artwork/codec';
import { completeReplayOrder } from '@/lib/fill-order';
import { REPLAY_DURATION_MS } from '@/lib/replay';

import { tinyArtwork } from '../__fixtures__/tiny-artwork';
import { createPerfArtworkSource } from './__fixtures__/perf-artwork';
import { buildColorPixels } from './layers';
import { createReplayPlayer } from './replay-player';

const artwork = tinyArtwork();
const order = completeReplayOrder(artwork.cells, []);

/** Manual frame clock: `frame(ms)` advances time and runs the pending frame callback. */
function harness() {
  let time = 0;
  let pending: (() => void) | null = null;
  const frames: number[] = [];
  const onDone = jest.fn();
  const player = createReplayPlayer({
    artwork,
    order,
    onFrame: (_pixels, shown) => frames.push(shown),
    onDone,
    now: () => time,
    scheduler: {
      request: (cb) => {
        pending = cb;
        return 1;
      },
      cancel: () => {
        pending = null;
      },
    },
  });
  const frame = (ms: number) => {
    time += ms;
    const cb = pending;
    pending = null;
    cb?.();
  };
  return { player, frames, onDone, frame, hasPending: () => pending !== null };
}

function fullPixels() {
  const bits = new Uint8Array(Math.ceil(artwork.cells.length / 8));
  for (const i of order) bits[i >> 3] |= 1 << (i & 7);
  return buildColorPixels(artwork, bits);
}

describe('replay player', () => {
  it('starts from the empty drawing and ends exactly on the last cell at the fixed duration', () => {
    const { player, frames, onDone, frame } = harness();
    player.start();
    expect(frames).toEqual([0]);
    expect(player.pixels.every((b) => b === 0)).toBe(true);
    frame(REPLAY_DURATION_MS / 2);
    expect(player.shown()).toBeGreaterThan(0);
    expect(player.shown()).toBeLessThan(order.length);
    expect(onDone).not.toHaveBeenCalled();
    frame(REPLAY_DURATION_MS / 2);
    expect(player.shown()).toBe(order.length);
    expect(onDone).toHaveBeenCalledWith(false);
    expect(player.pixels).toEqual(fullPixels());
  });

  it('paints in batches: one frame callback per frame at most, never decreasing', () => {
    const { player, frames, onDone, frame } = harness();
    player.start();
    for (let k = 0; k < 200 && !onDone.mock.calls.length; k++) frame(1000 / 60);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(frames.length).toBeLessThanOrEqual(Math.ceil(REPLAY_DURATION_MS / (1000 / 60)) + 2);
    for (let k = 1; k < frames.length; k++) expect(frames[k]).toBeGreaterThan(frames[k - 1]);
    expect(frames[frames.length - 1]).toBe(order.length);
  });

  it('skip finishes at once: every cell painted, done once, no more frames', () => {
    const { player, onDone, frame, hasPending } = harness();
    player.start();
    frame(100);
    player.skip();
    expect(player.pixels).toEqual(fullPixels());
    expect(onDone).toHaveBeenCalledWith(true);
    expect(hasPending()).toBe(false);
    player.skip();
    frame(5000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('cancel stops without finishing', () => {
    const { player, onDone, frame } = harness();
    player.start();
    player.cancel();
    frame(5000);
    expect(onDone).not.toHaveBeenCalled();
    expect(player.shown()).toBe(0);
  });
});

describe('replay player on a 256×256 artwork (F33)', () => {
  it('keeps the fixed duration, one image per frame, every cell painted', () => {
    const big = toArtwork(createPerfArtworkSource());
    const bigOrder = completeReplayOrder(big.cells, []);
    let time = 0;
    let pending: (() => void) | null = null;
    const frames: number[] = [];
    const onDone = jest.fn();
    const player = createReplayPlayer({
      artwork: big,
      order: bigOrder,
      onFrame: (_p, shown) => frames.push(shown),
      onDone,
      now: () => time,
      scheduler: {
        request: (cb) => {
          pending = cb;
          return 1;
        },
        cancel: () => {
          pending = null;
        },
      },
    });
    player.start();
    let ticks = 0;
    while (!onDone.mock.calls.length && ticks < 1000) {
      time += 1000 / 60;
      ticks++;
      const cb = pending as (() => void) | null;
      pending = null;
      cb?.();
    }
    expect(time).toBeGreaterThan(REPLAY_DURATION_MS - 1000 / 60);
    expect(time).toBeLessThan(REPLAY_DURATION_MS + 1000 / 60 + 1);
    // At most one onFrame per tick (plus the empty first frame).
    expect(frames.length).toBeLessThanOrEqual(ticks + 1);
    expect(frames[frames.length - 1]).toBe(bigOrder.length);
    const bits = new Uint8Array(big.cells.length / 8).fill(255);
    expect(player.pixels).toEqual(buildColorPixels(big, bits));
  });
});
