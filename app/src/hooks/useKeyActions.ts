import { useCallback, useState } from 'react';
import { TOTAL_KEYS, defaultKeyForSlot } from '../protocol/constants';
import type { KeyAction } from '../actions/types';

const STORAGE_KEY = 'osd-key-actions-v1';

function defaults(): KeyAction[] {
  return Array.from({ length: TOTAL_KEYS }, (_, s) => ({
    type: 'hid' as const,
    code: defaultKeyForSlot(s).hid,
  }));
}

function load(): KeyAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw) as KeyAction[];
    if (!Array.isArray(parsed)) return defaults();
    if (parsed.length === TOTAL_KEYS) return parsed;
    // Older stores (6 or 24 entries) migrate in place; extra slots default
    const full = defaults();
    parsed.slice(0, TOTAL_KEYS).forEach((a, i) => {
      if (a) full[i] = a;
    });
    return full;
  } catch {
    return defaults();
  }
}

export function useKeyActions() {
  const [actions, setActions] = useState<KeyAction[]>(load);

  const persist = useCallback((next: KeyAction[]) => {
    setActions(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable
    }
  }, []);

  const setAction = useCallback(
    (index: number, action: KeyAction) => {
      persist(actions.map((a, i) => (i === index ? action : a)));
    },
    [actions, persist],
  );

  const setAll = useCallback(
    (next: KeyAction[]) => {
      persist(
        Array.from({ length: TOTAL_KEYS }, (_, i) => next[i] ?? {
          type: 'hid' as const,
          code: defaultKeyForSlot(i).hid,
        }),
      );
    },
    [persist],
  );

  const reset = useCallback(() => persist(defaults()), [persist]);

  return { actions, setAction, setAll, reset };
}
