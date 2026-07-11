/**
 * App-side multi-tap resolver — same smart rule as the firmware engine:
 * keys without double/triple bindings resolve on the first press with zero
 * latency; keys with them wait out the tap window (resolving early when the
 * highest bound level is hit).
 *
 * Used for on-screen Test-mode presses when real hardware is connected —
 * those clicks never reach the firmware, so the app must count taps itself.
 */

import { TAP_WINDOW_MS } from '../protocol/constants';

export type TapLevel = 1 | 2 | 3;

interface PendingTaps {
  count: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface TapResolver {
  /** Register one press of `slot`; `maxTaps` = highest bound level (1–3). */
  press: (slot: number, maxTaps: number) => void;
  /** Cancel all pending sequences (mode switches, unmount). */
  dispose: () => void;
}

export function createTapResolver(
  fire: (slot: number, taps: TapLevel) => void,
  windowMs = TAP_WINDOW_MS,
): TapResolver {
  const pending = new Map<number, PendingTaps>();

  const resolve = (slot: number) => {
    const p = pending.get(slot);
    if (!p) return;
    pending.delete(slot);
    if (p.timer) clearTimeout(p.timer);
    fire(slot, Math.min(p.count, 3) as TapLevel);
  };

  return {
    press(slot, maxTaps) {
      if (maxTaps <= 1 && !pending.has(slot)) {
        fire(slot, 1); // zero-latency fast path
        return;
      }
      const p = pending.get(slot) ?? { count: 0, timer: null };
      p.count++;
      if (p.timer) clearTimeout(p.timer);
      pending.set(slot, p);
      if (p.count >= maxTaps) {
        resolve(slot); // highest level reached — no need to keep waiting
        return;
      }
      p.timer = setTimeout(() => resolve(slot), windowMs);
    },
    dispose() {
      for (const p of pending.values()) {
        if (p.timer) clearTimeout(p.timer);
      }
      pending.clear();
    },
  };
}
