/**
 * Deck undo/redo — snapshot-based command stack.
 *
 * Every user gesture that changes the deck (typing a label, picking a color,
 * setting media, swapping keys, pasting) calls `checkpoint()` FIRST; rapid
 * edits within a coalescing window collapse into one undo step, so Cmd+Z
 * undoes "typed the label" rather than one keystroke at a time.
 */

import { useCallback, useRef, useState } from 'react';
import type { KeyAction } from '../actions/types';
import type { SimulatedDevice } from '../simulator/SimulatedDevice';
import {
  applyDeckSnapshot,
  takeDeckSnapshot,
  type DeckOps,
  type DeckSnapshot,
} from '../utils/deckSnapshot';

const MAX_DEPTH = 50;
const COALESCE_MS = 1200;

export function useUndoStack(
  device: SimulatedDevice | null,
  actionsRef: React.MutableRefObject<KeyAction[]>,
  ops: DeckOps,
) {
  const undoRef = useRef<DeckSnapshot[]>([]);
  const redoRef = useRef<DeckSnapshot[]>([]);
  const lastCheckpointAt = useRef(0);
  const applyingRef = useRef(false);
  const [depths, setDepths] = useState({ undo: 0, redo: 0 });

  const publish = useCallback(() => {
    setDepths({ undo: undoRef.current.length, redo: redoRef.current.length });
  }, []);

  /** Record the CURRENT deck state as an undo point (before a change). */
  const checkpoint = useCallback(
    (coalesce = true) => {
      if (!device || applyingRef.current) return;
      const now = Date.now();
      if (coalesce && now - lastCheckpointAt.current < COALESCE_MS && undoRef.current.length > 0) {
        lastCheckpointAt.current = now; // same gesture — keep the older snapshot
        return;
      }
      lastCheckpointAt.current = now;
      undoRef.current.push(takeDeckSnapshot(device, actionsRef.current));
      if (undoRef.current.length > MAX_DEPTH) undoRef.current.shift();
      redoRef.current = []; // new timeline
      publish();
    },
    [device, actionsRef, publish],
  );

  const undo = useCallback(async () => {
    if (!device || applyingRef.current) return;
    const target = undoRef.current.pop();
    if (!target) return;
    applyingRef.current = true;
    try {
      const current = takeDeckSnapshot(device, actionsRef.current);
      redoRef.current.push(current);
      await applyDeckSnapshot(target, current, ops);
    } finally {
      applyingRef.current = false;
      publish();
    }
  }, [device, actionsRef, ops, publish]);

  const redo = useCallback(async () => {
    if (!device || applyingRef.current) return;
    const target = redoRef.current.pop();
    if (!target) return;
    applyingRef.current = true;
    try {
      const current = takeDeckSnapshot(device, actionsRef.current);
      undoRef.current.push(current);
      await applyDeckSnapshot(target, current, ops);
    } finally {
      applyingRef.current = false;
      publish();
    }
  }, [device, actionsRef, ops, publish]);

  return { checkpoint, undo, redo, canUndo: depths.undo > 0, canRedo: depths.redo > 0 };
}
