import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTapResolver } from '../tapResolver';

describe('createTapResolver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires single-only keys immediately, no window', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 1);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(0, 1);
  });

  it('waits for the window before resolving a lone press on a multi-tap key', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 2);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(299);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(0, 1);
  });

  it('resolves a double the moment the second tap lands (max=2)', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 2);
    vi.advanceTimersByTime(100);
    r.press(0, 2);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(0, 2); // early, no wait
  });

  it('counts up to a triple across the window', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 3);
    vi.advanceTimersByTime(150);
    r.press(0, 3);
    vi.advanceTimersByTime(150);
    expect(fire).not.toHaveBeenCalled(); // window keeps resetting
    r.press(0, 3);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(0, 3);
  });

  it('two presses on a triple-bound key resolve as a double after the window', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 3);
    vi.advanceTimersByTime(100);
    r.press(0, 3);
    vi.advanceTimersByTime(301);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(0, 2);
  });

  it('tracks slots independently', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 2);
    r.press(1, 1);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(fire).toHaveBeenCalledWith(1, 1);
    r.press(0, 2);
    expect(fire).toHaveBeenCalledTimes(2);
    expect(fire).toHaveBeenLastCalledWith(0, 2);
  });

  it('dispose cancels pending sequences', () => {
    const fire = vi.fn();
    const r = createTapResolver(fire, 300);
    r.press(0, 2);
    r.dispose();
    vi.advanceTimersByTime(500);
    expect(fire).not.toHaveBeenCalled();
  });
});
