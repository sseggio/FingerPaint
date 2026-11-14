/**
 * Runs `callback` at most once per animation frame however many times `request()` is called in
 * between. The coloring screen uses it so several fill batches landing in the same frame
 * rebuild the color layer image only once.
 */
export interface FrameCoalescer {
  request(): void;
  cancel(): void;
}

export interface FrameScheduler {
  request(cb: () => void): number;
  cancel(handle: number): void;
}

const defaultScheduler: FrameScheduler = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export function createFrameCoalescer(callback: () => void, scheduler: FrameScheduler = defaultScheduler): FrameCoalescer {
  let handle: number | null = null;
  return {
    request() {
      if (handle !== null) return;
      handle = scheduler.request(() => {
        handle = null;
        callback();
      });
    },
    cancel() {
      if (handle === null) return;
      scheduler.cancel(handle);
      handle = null;
    },
  };
}
