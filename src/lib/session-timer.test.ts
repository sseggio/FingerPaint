import { createSessionTimer } from './session-timer';

const MIN = 60_000;

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('createSessionTimer', () => {
  it('fires after the limit of active time, then again each period', () => {
    const onElapsed = jest.fn();
    const timer = createSessionTimer({ onElapsed });
    timer.setLimit(20 * MIN);
    timer.resume();
    jest.advanceTimersByTime(20 * MIN - 1);
    expect(onElapsed).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    expect(timer.activeMs()).toBe(0);
    jest.advanceTimersByTime(20 * MIN);
    expect(onElapsed).toHaveBeenCalledTimes(2);
    timer.dispose();
  });

  it('counts active time only: paused time does not count', () => {
    const onElapsed = jest.fn();
    const timer = createSessionTimer({ onElapsed });
    timer.setLimit(10 * MIN);
    timer.resume();
    jest.advanceTimersByTime(6 * MIN);
    timer.pause();
    expect(timer.isRunning()).toBe(false);
    jest.advanceTimersByTime(60 * MIN);
    expect(onElapsed).not.toHaveBeenCalled();
    expect(timer.activeMs()).toBe(6 * MIN);
    timer.resume();
    jest.advanceTimersByTime(4 * MIN);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('is disabled with a 0 limit and can be changed on the fly', () => {
    const onElapsed = jest.fn();
    const timer = createSessionTimer({ onElapsed });
    timer.resume();
    jest.advanceTimersByTime(45 * MIN);
    expect(onElapsed).not.toHaveBeenCalled();
    // 45 min already active: a 30 min limit fires right away.
    timer.setLimit(30 * MIN);
    jest.advanceTimersByTime(0);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    timer.setLimit(0);
    jest.advanceTimersByTime(120 * MIN);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    timer.dispose();
  });

  it('reset forgets the accumulated time; dispose stops everything', () => {
    const onElapsed = jest.fn();
    const timer = createSessionTimer({ onElapsed });
    timer.setLimit(10 * MIN);
    timer.resume();
    jest.advanceTimersByTime(9 * MIN);
    timer.reset();
    jest.advanceTimersByTime(9 * MIN);
    expect(onElapsed).not.toHaveBeenCalled();
    timer.dispose();
    jest.advanceTimersByTime(60 * MIN);
    expect(onElapsed).not.toHaveBeenCalled();
    expect(timer.isRunning()).toBe(false);
  });

  it('resume and pause are idempotent', () => {
    const onElapsed = jest.fn();
    const timer = createSessionTimer({ onElapsed });
    timer.setLimit(10 * MIN);
    timer.resume();
    jest.advanceTimersByTime(5 * MIN);
    timer.resume();
    jest.advanceTimersByTime(5 * MIN);
    expect(onElapsed).toHaveBeenCalledTimes(1);
    timer.pause();
    timer.pause();
    expect(timer.activeMs()).toBe(0);
    timer.dispose();
  });
});
