import { useCallback, useState } from 'react';
import { TOTAL_KEYS, defaultKeyForSlot } from '../protocol/constants';
import type { KeyAction } from '../actions/types';

const STORAGE_KEY = 'osd-key-actions-v2';
const LEGACY_KEY = 'osd-key-actions-v1';

export type TapLevel = 'single' | 'double' | 'triple';

export interface TapActionsStore {
  /** Single press — every key always has one */
  single: KeyAction[];
  /** Double / triple press — null = unbound (key fires single instantly) */
  double: (KeyAction | null)[];
  triple: (KeyAction | null)[];
}

function defaults(): TapActionsStore {
  return {
    single: Array.from({ length: TOTAL_KEYS }, (_, s) => ({
      type: 'hid' as const,
      code: defaultKeyForSlot(s).hid,
    })),
    double: Array(TOTAL_KEYS).fill(null),
    triple: Array(TOTAL_KEYS).fill(null),
  };
}

function padSingle(list: (KeyAction | undefined)[]): KeyAction[] {
  return Array.from(
    { length: TOTAL_KEYS },
    (_, s) => list[s] ?? { type: 'hid' as const, code: defaultKeyForSlot(s).hid },
  );
}

function padNullable(list: (KeyAction | null | undefined)[] | undefined): (KeyAction | null)[] {
  return Array.from({ length: TOTAL_KEYS }, (_, s) => list?.[s] ?? null);
}

function load(): TapActionsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TapActionsStore>;
      if (Array.isArray(parsed.single)) {
        return {
          single: padSingle(parsed.single),
          double: padNullable(parsed.double),
          triple: padNullable(parsed.triple),
        };
      }
    }
    // Migrate the v1 store (flat single-press array)
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as KeyAction[];
      if (Array.isArray(parsed)) {
        return { ...defaults(), single: padSingle(parsed) };
      }
    }
    return defaults();
  } catch {
    return defaults();
  }
}

export function useKeyActions() {
  const [store, setStore] = useState<TapActionsStore>(load);

  const persist = useCallback((next: TapActionsStore) => {
    setStore(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable
    }
  }, []);

  const setAction = useCallback(
    (index: number, level: TapLevel, action: KeyAction | null) => {
      setStore((prev) => {
        const next: TapActionsStore = {
          single: prev.single.slice(),
          double: prev.double.slice(),
          triple: prev.triple.slice(),
        };
        if (level === 'single') {
          // Single press is never unbound — fall back to the slot's HID
          next.single[index] = action ?? {
            type: 'hid',
            code: defaultKeyForSlot(index).hid,
          };
        } else {
          next[level][index] = action;
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Storage unavailable
        }
        return next;
      });
    },
    [],
  );

  const setAll = useCallback(
    (
      single: KeyAction[],
      double?: (KeyAction | null)[],
      triple?: (KeyAction | null)[],
    ) => {
      persist({
        single: padSingle(single),
        double: padNullable(double),
        triple: padNullable(triple),
      });
    },
    [persist],
  );

  const reset = useCallback(() => persist(defaults()), [persist]);

  return {
    /** Single-press actions (legacy shape — most consumers only need these) */
    actions: store.single,
    double: store.double,
    triple: store.triple,
    setAction,
    setAll,
    reset,
  };
}
