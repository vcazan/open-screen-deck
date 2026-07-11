/**
 * Tile scheduler — streams live key faces (SET_FACE) for every key whose
 * action is a tile AND whose slot is on the page currently shown by the
 * device. Frames flow through the protocol op lock, so tiles can never
 * interleave with media uploads.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { KeyAction, TileKind } from '../actions/types';
import { KEY_COUNT } from '../protocol/constants';
import { isTauri } from '../transport/TauriSerialTransport';
import { obsClient } from '../integrations/obs';
import { TILE_REFRESH_MS, renderTile, type TileData } from './render';

interface TimerState {
  running: boolean;
  startedAt: number;
  accumulatedMs: number;
}

interface UseTilesArgs {
  actions: KeyAction[];
  deckPage: number;
  connected: boolean;
  sendSetFace: (index: number, rgb565: Uint8Array) => Promise<void>;
}

const TIMER_STORE_KEY = 'osd-tile-timers';

function loadTimers(): Record<number, TimerState> {
  try {
    return JSON.parse(localStorage.getItem(TIMER_STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function useTiles({ actions, deckPage, connected, sendSetFace }: UseTilesArgs) {
  const timersRef = useRef<Record<number, TimerState>>(loadTimers());
  const lastPaintRef = useRef<Record<number, number>>({});
  const lastFrameSigRef = useRef<Record<number, string>>({});
  const cpuRef = useRef<TileData['cpu']>(null);
  const volumeRef = useRef<number | null>(null);
  const nowPlayingRef = useRef<TileData['nowPlaying']>(null);
  const obsSceneRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const pageRef = useRef(deckPage);
  pageRef.current = deckPage;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const sendRef = useRef(sendSetFace);
  sendRef.current = sendSetFace;

  /** Press on a timer tile: toggle. Returns true when handled. */
  const handleTilePress = useCallback((slot: number): boolean => {
    const action = actionsRef.current[slot];
    if (!action || action.type !== 'tile') return false;
    if (action.kind === 'timer') {
      // Stopwatch semantics: press to start, press to stop (pause), press to
      // resume. Reset by removing/re-adding the tile.
      const t = timersRef.current[slot] ?? { running: false, startedAt: 0, accumulatedMs: 0 };
      if (t.running) {
        t.accumulatedMs += Date.now() - t.startedAt;
        t.running = false;
      } else {
        t.startedAt = Date.now();
        t.running = true;
      }
      timersRef.current[slot] = t;
      try {
        localStorage.setItem(TIMER_STORE_KEY, JSON.stringify(timersRef.current));
      } catch {
        // Storage unavailable
      }
      lastPaintRef.current[slot] = 0; // repaint immediately
      return true;
    }
    return true; // other tiles: press is a no-op, but handled
  }, []);

  // Host data providers (companion only), polled off the paint loop
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const poll = async () => {
      const kinds = new Set(
        actionsRef.current.filter((a) => a?.type === 'tile').map((a) => (a as { kind: TileKind }).kind),
      );
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (kinds.has('cpu')) {
          const s = (await invoke('sys_stats')) as { cpu_pct: number; mem_pct: number };
          if (!cancelled) cpuRef.current = { cpuPct: s.cpu_pct, memPct: s.mem_pct };
        }
        if (kinds.has('volume')) {
          const v = (await invoke('output_volume')) as number | null;
          if (!cancelled) volumeRef.current = v;
        }
        if (kinds.has('now_playing')) {
          const np = (await invoke('now_playing')) as { title: string; artist: string } | null;
          if (!cancelled) nowPlayingRef.current = np;
        }
      } catch {
        // Backend unavailable — tiles show their fallback text
      }
    };
    const timer = setInterval(poll, 2000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => obsClient.onScene((scene) => {
    obsSceneRef.current = scene;
  }), []);

  // Paint loop
  useEffect(() => {
    const tick = async () => {
      if (busyRef.current || !connectedRef.current) return;
      const now = Date.now();
      const page = pageRef.current;

      for (let pos = 0; pos < KEY_COUNT; pos++) {
        const slot = page * KEY_COUNT + pos;
        const action = actionsRef.current[slot];
        if (!action || action.type !== 'tile') continue;

        const interval = TILE_REFRESH_MS[action.kind];
        if (now - (lastPaintRef.current[slot] ?? 0) < interval) continue;

        const t = timersRef.current[slot];
        const data: TileData = {
          now: new Date(),
          timer: t
            ? {
                running: t.running,
                elapsedMs: t.accumulatedMs + (t.running ? Date.now() - t.startedAt : 0),
              }
            : { running: false, elapsedMs: 0 },
          cpu: cpuRef.current,
          volumePct: volumeRef.current,
          nowPlaying: nowPlayingRef.current,
          obsScene: obsSceneRef.current,
        };

        const bytes = renderTile(action.kind, data);
        // Change detection — identical frames don't hit the wire. Full FNV-1a
        // hash: sampling misses small changes (a blinking colon is ~100 bytes)
        let h = 0x811c9dc5;
        for (let i = 0; i < bytes.length; i++) {
          h = ((h ^ bytes[i]) * 0x01000193) >>> 0;
        }
        const sig = `${bytes.length}:${h}`;
        if (lastFrameSigRef.current[slot] === sig) {
          lastPaintRef.current[slot] = now;
          continue;
        }

        busyRef.current = true;
        try {
          await sendRef.current(slot, bytes);
          lastPaintRef.current[slot] = now;
          lastFrameSigRef.current[slot] = sig;
        } catch {
          // Transfer failed (disconnect mid-frame) — retry next tick
          lastPaintRef.current[slot] = now;
        } finally {
          busyRef.current = false;
        }
      }
    };

    const timer = setInterval(() => void tick(), 250);
    return () => clearInterval(timer);
  }, []);

  // Page/action changes invalidate the frame cache so tiles repaint fresh
  useEffect(() => {
    lastFrameSigRef.current = {};
    lastPaintRef.current = {};
  }, [deckPage, actions]);

  return { handleTilePress };
}
