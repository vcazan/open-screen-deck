/**
 * Deck snapshots for undo/redo and copy/paste — a full picture of every key
 * slot (config + action + media) plus a diff-applier that replays the
 * minimal protocol operations to reach a target snapshot.
 */

import type { KeyAction } from '../actions/types';
import { encodeCommand } from '../protocol/codec';
import { TOTAL_KEYS } from '../protocol/constants';
import type { SimulatedDevice } from '../simulator/SimulatedDevice';

export interface KeySnapshot {
  label: string;
  sublabel: string;
  hid: number;
  bg: number;
  icon?: string;
  overlay: boolean;
  action: KeyAction | null;
  /** Raw RGB565 icon — shared refs are fine, the mirror copies on write */
  image: Uint8Array | null;
  anim: { fps: number; frames: Uint8Array[] } | null;
}

export interface DeckSnapshot {
  keys: KeySnapshot[];
  /** Page count at snapshot time — undo restores removed/added pages */
  pages: number;
}

export interface DeckOps {
  sendCommand: (line: string) => void;
  sendSetImage: (index: number, rgb565: Uint8Array) => Promise<void>;
  sendAnimation: (index: number, frames: Uint8Array[], fps: number) => Promise<void>;
  deleteSdPath: (path: string) => Promise<void>;
  setAllActions: (actions: KeyAction[]) => void;
}

export function takeDeckSnapshot(
  device: SimulatedDevice,
  actions: KeyAction[],
): DeckSnapshot {
  const state = device.getState();
  const media = device.getMediaSnapshot();
  return {
    pages: state.pages,
    keys: Array.from({ length: TOTAL_KEYS }, (_, i) => {
      const k = state.keys[i];
      return {
        label: k?.label ?? '',
        sublabel: k?.sublabel ?? '',
        hid: k?.hidKey ?? 240,
        bg: k?.bgColor ?? 0,
        icon: k?.icon,
        overlay: k?.overlay === true,
        action: actions[i] ?? null,
        image: media.icons[i] ?? null,
        anim: media.animations[i] ?? null,
      };
    }),
  };
}

function bytesEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  // Sparse compare — frames are 32 KB; sampling every 251 bytes is plenty
  for (let i = 0; i < a.length; i += 251) {
    if (a[i] !== b[i]) return false;
  }
  return a[a.length - 1] === b[b.length - 1];
}

function animEqual(
  a: KeySnapshot['anim'],
  b: KeySnapshot['anim'],
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.fps !== b.fps || a.frames.length !== b.frames.length) return false;
  for (let i = 0; i < a.frames.length; i++) {
    if (!bytesEqual(a.frames[i], b.frames[i])) return false;
  }
  return true;
}

function configEqual(a: KeySnapshot, b: KeySnapshot): boolean {
  return (
    a.label === b.label &&
    a.sublabel === b.sublabel &&
    a.hid === b.hid &&
    a.bg === b.bg &&
    a.icon === b.icon &&
    a.overlay === b.overlay
  );
}

/** Replay the minimal protocol ops to move the deck from `current` to `target`. */
export async function applyDeckSnapshot(
  target: DeckSnapshot,
  current: DeckSnapshot,
  ops: DeckOps,
): Promise<void> {
  if (target.pages !== current.pages) {
    ops.sendCommand(encodeCommand({ type: 'SET_PAGES', pages: target.pages }));
  }
  for (let i = 0; i < TOTAL_KEYS; i++) {
    const t = target.keys[i];
    const c = current.keys[i];
    if (!t || !c) continue;

    if (!configEqual(t, c)) {
      ops.sendCommand(
        encodeCommand({
          type: 'SET_KEY',
          payload: {
            index: i,
            label: t.label,
            sublabel: t.sublabel,
            hid: t.hid,
            bg: t.bg,
            ov: t.overlay ? 1 : 0,
            icon: t.icon,
          },
        }),
      );
    }

    if (!animEqual(t.anim, c.anim)) {
      if (t.anim && t.anim.frames.length > 0) {
        await ops.sendAnimation(i, t.anim.frames, t.anim.fps).catch(() => {});
      } else {
        ops.sendCommand(encodeCommand({ type: 'ANIM_CLEAR', index: i }));
      }
    }

    if (!bytesEqual(t.image, c.image)) {
      if (t.image) {
        await ops.sendSetImage(i, t.image).catch(() => {});
      } else {
        await ops.deleteSdPath(`/osd/keys/${i}/icon.rgb565`).catch(() => {});
        ops.sendCommand(encodeCommand({ type: 'DRAW', index: i }));
      }
    }
  }

  ops.setAllActions(
    target.keys.map((k, i) => k.action ?? current.keys[i]?.action ?? { type: 'hid', code: 240 }),
  );
}

/** Swap the full identity of two key slots (config + action + media). */
export async function swapKeySlots(
  a: number,
  b: number,
  device: SimulatedDevice,
  actions: KeyAction[],
  ops: DeckOps,
): Promise<void> {
  const snap = takeDeckSnapshot(device, actions);
  const target: DeckSnapshot = { ...snap, keys: snap.keys.slice() };
  target.keys[a] = snap.keys[b];
  target.keys[b] = snap.keys[a];
  await applyDeckSnapshot(target, snap, ops);
}

/** Paste one key's identity onto another slot. */
export async function pasteKeySlot(
  source: KeySnapshot,
  dest: number,
  device: SimulatedDevice,
  actions: KeyAction[],
  ops: DeckOps,
): Promise<void> {
  const snap = takeDeckSnapshot(device, actions);
  const target: DeckSnapshot = { ...snap, keys: snap.keys.slice() };
  target.keys[dest] = source;
  await applyDeckSnapshot(target, snap, ops);
}
