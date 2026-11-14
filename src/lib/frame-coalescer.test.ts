import { createFrameCoalescer, type FrameScheduler } from './frame-coalescer';

function fakeScheduler() {
  const queue = new Map<number, () => void>();
  let next = 1;
  const scheduler: FrameScheduler = {
    request: (cb) => {
      queue.set(next, cb);
      return next++;
    },
    cancel: (h) => {
      queue.delete(h);
    },
  };
  const frame = () => {
    const cbs = [...queue.values()];
    queue.clear();
    cbs.forEach((cb) => cb());
  };
  return { scheduler, frame, pending: () => queue.size };
}

describe('frame coalescer', () => {
  it('runs once per frame however many requests', () => {
    const { scheduler, frame } = fakeScheduler();
    const cb = jest.fn();
    const c = createFrameCoalescer(cb, scheduler);
    c.request();
    c.request();
    c.request();
    frame();
    expect(cb).toHaveBeenCalledTimes(1);
    c.request();
    frame();
    expect(cb).toHaveBeenCalledTimes(2);
    frame();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('can be cancelled', () => {
    const { scheduler, frame, pending } = fakeScheduler();
    const cb = jest.fn();
    const c = createFrameCoalescer(cb, scheduler);
    c.request();
    c.cancel();
    expect(pending()).toBe(0);
    frame();
    expect(cb).not.toHaveBeenCalled();
  });
});
