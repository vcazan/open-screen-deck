import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeCommand } from '../protocol/codec';
import { FRAME_BYTES } from '../protocol/constants';
import type { DeviceEvent } from '../protocol/types';
import { SimulatedDevice } from '../simulator/SimulatedDevice';
import { SimulatorTransport } from '../transport/SimulatorTransport';
import { TauriSerialTransport, isTauri } from '../transport/TauriSerialTransport';
import type { ConnectionState, Transport } from '../transport/types';
import { WebSerialTransport } from '../transport/WebSerialTransport';

export interface ConsoleEntry {
  id: number;
  timestamp: Date;
  direction: 'tx' | 'rx';
  line: string;
}

export type TransportMode = 'simulator' | 'webserial';

export interface SdEntry {
  name: string;
  dir: boolean;
  size: number;
}

export interface DeviceContextValue {
  transport: Transport;
  device: SimulatedDevice | null;
  connectionState: ConnectionState;
  transportMode: TransportMode;
  setTransportMode: (mode: TransportMode) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (line: string) => void;
  sendSetImage: (index: number, rgb565: Uint8Array) => Promise<void>;
  /** Draw-only frame (live tiles) — never touches the SD card. */
  sendSetFace: (index: number, rgb565: Uint8Array) => Promise<void>;
  sendAnimation: (
    index: number,
    frames: Uint8Array[],
    fps: number,
    onProgress?: (done: number, total: number) => void,
  ) => Promise<void>;
  listSdDir: (path: string) => Promise<SdEntry[]>;
  deleteSdPath: (path: string) => Promise<void>;
  fetchSdInfo: () => Promise<{ sizeMb: number; usedMb: number } | null>;
  pressKey: (index: number) => void;
  releaseKey: (index: number) => void;
  selectedKey: number | null;
  setSelectedKey: (index: number | null) => void;
  consoleEntries: ConsoleEntry[];
  clearConsole: () => void;
  deviceInfo: DeviceEvent | null;
  refreshTick: number;
  webSerialSupported: boolean;
  /** Register the action router — called with (slot, taps) on each resolved press. */
  setKeyPressHandler: (handler: ((index: number, taps: number) => void) | null) => void;
  /** Write an app-side note into the protocol console. */
  logLocal: (line: string) => void;
}

let consoleId = 0;

export function useDeviceManager(): DeviceContextValue {
  // Lazy init: constructing these inline in useRef() would create throwaway
  // instances on every render (StrictMode renders twice), and each extra
  // SimulatorTransport re-registers onLine on the kept device — stealing its
  // line callback so no events ever reach the UI.
  const simStackRef = useRef<{
    device: SimulatedDevice;
    transport: SimulatorTransport;
    web: Transport;
  } | null>(null);
  if (!simStackRef.current) {
    const device = new SimulatedDevice();
    simStackRef.current = {
      device,
      transport: new SimulatorTransport(device),
      // Inside the desktop shell, "USB" means native serial via Rust
      web: isTauri() ? new TauriSerialTransport() : new WebSerialTransport(),
    };
  }
  const simDeviceRef = { current: simStackRef.current.device };
  const simTransportRef = { current: simStackRef.current.transport };
  const webTransportRef = { current: simStackRef.current.web };

  // The desktop companion exists to drive real hardware — default to USB there
  const [transportMode, setTransportModeState] = useState<TransportMode>(
    isTauri() ? 'webserial' : 'simulator',
  );
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([]);
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceEvent | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const transportRef = useRef<Transport>(simTransportRef.current);
  const pendingBinaryRef = useRef<Uint8Array | null>(null);
  const lineWaitersRef = useRef<
    {
      pred: (line: string) => boolean;
      resolve: () => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }[]
  >([]);
  const sdLsCollectorRef = useRef<{ entries: SdEntry[] } | null>(null);
  const keyPressHandlerRef = useRef<((index: number, taps: number) => void) | null>(null);

  /**
   * Protocol operation lock. Binary transfers (SET_IMAGE / SET_ANIM) span
   * several writes with device acks between them — if any other command
   * (heartbeat PING, face updates) lands mid-transfer, its bytes get counted
   * as frame data by the firmware and the transfer corrupts. Every operation
   * that writes to the wire goes through this chain.
   */
  const opChainRef = useRef<Promise<void>>(Promise.resolve());
  const withLock = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = opChainRef.current.then(fn, fn);
    opChainRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  /**
   * Register interest in a future device line. Must be called BEFORE the
   * command is sent — the simulator responds synchronously.
   */
  const expectLine = useCallback((pred: (line: string) => boolean, timeoutMs = 5000) => {
    return new Promise<void>((resolve, reject) => {
      const waiter = {
        pred,
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = lineWaitersRef.current.indexOf(waiter);
          if (i >= 0) lineWaitersRef.current.splice(i, 1);
          reject(new Error('Device response timed out'));
        }, timeoutMs),
      };
      lineWaitersRef.current.push(waiter);
    });
  }, []);

  const getTransport = useCallback((): Transport => {
    return transportMode === 'simulator' ? simTransportRef.current : webTransportRef.current;
  }, [transportMode]);

  const addConsoleEntry = useCallback((line: string, direction: 'tx' | 'rx') => {
    setConsoleEntries((prev) => [
      ...prev.slice(-500),
      { id: ++consoleId, timestamp: new Date(), direction, line },
    ]);
  }, []);

  const setupTransport = useCallback((transport: Transport) => {
    transport.onLine((line, direction) => {
      addConsoleEntry(line, direction);

      if (direction === 'rx' && line.includes('"event":"send_data"')) {
        pendingBinaryRef.current = new Uint8Array(0);
      }

      if (direction === 'rx') {
        if (sdLsCollectorRef.current && line.includes('"event":"sd_entry"')) {
          try {
            const ev = JSON.parse(line) as { name: string; dir: boolean; size: number };
            sdLsCollectorRef.current.entries.push({ name: ev.name, dir: ev.dir, size: ev.size });
          } catch {
            // Malformed entry — skip
          }
        }

        const isError = line.includes('"event":"error"');
        const waiters = lineWaitersRef.current;
        for (let i = waiters.length - 1; i >= 0; i--) {
          if (waiters[i].pred(line)) {
            clearTimeout(waiters[i].timer);
            waiters[i].resolve();
            waiters.splice(i, 1);
          } else if (isError) {
            clearTimeout(waiters[i].timer);
            waiters[i].reject(new Error(line));
            waiters.splice(i, 1);
          }
        }

        try {
          const ev = JSON.parse(line) as DeviceEvent;
          if (ev.event === 'info') {
            setDeviceInfo(ev);
            if (transportMode === 'webserial') {
              if (ev.orient !== undefined) simDeviceRef.current.mirrorOrientation(ev.orient);
              if (ev.pages !== undefined) simDeviceRef.current.mirrorPages(ev.pages);
              if (ev.page !== undefined) simDeviceRef.current.mirrorPage(ev.page);
            }
          }
          // Page/page-count changed on-device — keep the mirror in step
          if (ev.event === 'page' && transportMode === 'webserial') {
            simDeviceRef.current.mirrorPage(ev.page);
          }
          if (ev.event === 'pages' && transportMode === 'webserial') {
            simDeviceRef.current.mirrorPages(ev.pages);
          }
          if (ev.event === 'key' && ev.action === 'press') {
            keyPressHandlerRef.current?.(ev.index, ev.taps ?? 1);
          }
          // USB: sync the local mirror from the device's reported key state
          if (ev.event === 'key_state' && transportMode === 'webserial') {
            simDeviceRef.current.mirrorKeyState(
              ev.index,
              ev.label,
              ev.sublabel,
              ev.hid,
              ev.bg,
              ev.ov,
              ev.h2,
              ev.h3,
            );
          }
        } catch {
          // Non-JSON line
        }
      }
    });

    transport.onState((state) => {
      setConnectionState(state);
    });

    // Always subscribe: in simulator mode this is the live device, in USB
    // mode it's the mirror of the physical deck — the on-screen canvases
    // must repaint for both.
    simDeviceRef.current.onState(() => {
      setRefreshTick((t) => t + 1);
    });
  }, [addConsoleEntry, transportMode, simDeviceRef]);

  useEffect(() => {
    const transport = getTransport();
    transportRef.current = transport;
    setupTransport(transport);

    if (connectionState === 'disconnected' && (transportMode === 'simulator' || isTauri())) {
      // Simulator connects instantly; the Tauri transport auto-detects the
      // deck by USB VID and keeps retrying until it appears.
      transport.connect().catch(() => {});
    }

    return () => {
      // Cleanup on mode switch handled by disconnect
    };
  }, [transportMode, getTransport, setupTransport]);

  const setTransportMode = useCallback(async (mode: TransportMode) => {
    await transportRef.current.disconnect();
    setTransportModeState(mode);
    setConnectionState('disconnected');
    setDeviceInfo(null);
  }, []);

  // USB: once connected, pull the device's key state into the local mirror
  useEffect(() => {
    if (transportMode !== 'webserial' || connectionState !== 'connected') return;
    const timer = setTimeout(() => {
      void withLock(async () => {
        transportRef.current.sendLine('INFO');
        transportRef.current.sendLine('GET_KEYS');
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [transportMode, connectionState, withLock]);

  const connect = useCallback(async () => {
    const transport = getTransport();
    transportRef.current = transport;
    setupTransport(transport);
    await transport.connect();
  }, [getTransport, setupTransport]);

  const disconnect = useCallback(async () => {
    await transportRef.current.disconnect();
  }, []);

  /**
   * In USB mode, replay outgoing commands into the local SimulatedDevice so
   * the on-screen deck mirrors what the physical deck is showing.
   */
  const mirrorLine = useCallback(
    (line: string) => {
      if (transportMode === 'webserial') simDeviceRef.current.mirrorLine(line);
    },
    [transportMode, simDeviceRef],
  );

  const mirrorBytes = useCallback(
    (bytes: Uint8Array) => {
      if (transportMode === 'webserial') simDeviceRef.current.mirrorBytes(bytes);
    },
    [transportMode, simDeviceRef],
  );

  const sendCommand = useCallback(
    (line: string) => {
      void withLock(async () => {
        transportRef.current.sendLine(line);
        mirrorLine(line);
      });
    },
    [withLock, mirrorLine],
  );

  const sendSetImage = useCallback(
    (index: number, rgb565: Uint8Array) =>
      withLock(async () => {
        const t = transportRef.current;
        const header = encodeCommand({ type: 'SET_IMAGE', payload: { index, len: FRAME_BYTES } });
        const ready = expectLine((l) => l.includes('"event":"send_data"'));
        t.sendLine(header);
        await ready;
        const done = expectLine((l) => l.includes('"cmd":"SET_IMAGE"'), 8000);
        t.sendBytes(rgb565);
        await done;
        mirrorLine(header);
        mirrorBytes(rgb565);
      }),
    [withLock, expectLine, mirrorLine, mirrorBytes],
  );

  const sendSetFace = useCallback(
    (index: number, rgb565: Uint8Array) =>
      withLock(async () => {
        const t = transportRef.current;
        const header = encodeCommand({ type: 'SET_FACE', payload: { index, len: FRAME_BYTES } });
        const ready = expectLine((l) => l.includes('"event":"send_data"'));
        t.sendLine(header);
        await ready;
        const done = expectLine((l) => l.includes('"cmd":"SET_FACE"'), 8000);
        t.sendBytes(rgb565);
        await done;
        mirrorLine(header);
        mirrorBytes(rgb565);
      }),
    [withLock, expectLine, mirrorLine, mirrorBytes],
  );

  /**
   * Stream animation frames to the device SD card and start playback.
   * Uses the same SET_ANIM protocol on both simulator and USB transports.
   */
  const sendAnimation = useCallback(
    (
      index: number,
      frames: Uint8Array[],
      fps: number,
      onProgress?: (done: number, total: number) => void,
    ) =>
      withLock(async () => {
        const t = transportRef.current;

        const clearCmd = encodeCommand({ type: 'ANIM_CLEAR', index });
        const cleared = expectLine((l) => l.includes('"cmd":"ANIM_CLEAR"'));
        t.sendLine(clearCmd);
        await cleared;
        mirrorLine(clearCmd);

        for (let i = 0; i < frames.length; i++) {
          const header = encodeCommand({
            type: 'SET_ANIM',
            payload: { index, frame: i + 1, len: FRAME_BYTES },
          });
          const ready = expectLine((l) => l.includes('"event":"send_data"'));
          t.sendLine(header);
          await ready;
          const written = expectLine((l) => l.includes('"cmd":"SET_ANIM"'), 8000);
          t.sendBytes(frames[i]);
          await written;
          mirrorLine(header);
          mirrorBytes(frames[i]);
          onProgress?.(i + 1, frames.length);
        }

        const playCmd = encodeCommand({ type: 'ANIM', index, fps });
        t.sendLine(playCmd);
        mirrorLine(playCmd);
      }),
    [withLock, expectLine, mirrorLine, mirrorBytes],
  );

  const listSdDir = useCallback(
    (path: string): Promise<SdEntry[]> =>
      withLock(async () => {
        const collector: { entries: SdEntry[] } = { entries: [] };
        sdLsCollectorRef.current = collector;
        try {
          const done = expectLine((l) => l.includes('"event":"sd_ls_done"'));
          transportRef.current.sendLine(encodeCommand({ type: 'SD_LS', path }));
          await done;
          return collector.entries;
        } finally {
          sdLsCollectorRef.current = null;
        }
      }),
    [withLock, expectLine],
  );

  const deleteSdPath = useCallback(
    (path: string): Promise<void> =>
      withLock(async () => {
        const cmd = encodeCommand({ type: 'SD_RM', path });
        const done = expectLine((l) => l.includes('"cmd":"SD_RM"'));
        transportRef.current.sendLine(cmd);
        try {
          await done;
        } finally {
          // Mirror even if the device reported rm_failed (file may only
          // exist on one side) — removal must always converge the UI.
          mirrorLine(cmd);
        }
      }),
    [withLock, expectLine, mirrorLine],
  );

  const fetchSdInfo = useCallback(
    (): Promise<{ sizeMb: number; usedMb: number } | null> =>
      withLock(async () => {
        let info: { sizeMb: number; usedMb: number } | null = null;
        const done = expectLine((l) => {
          if (!l.includes('"event":"sd"')) return false;
          try {
            const ev = JSON.parse(l) as { size_mb?: number; used_mb?: number; mounted?: boolean };
            info =
              ev.size_mb !== undefined
                ? { sizeMb: ev.size_mb, usedMb: ev.used_mb ?? 0 }
                : null;
          } catch {
            info = null;
          }
          return true;
        });
        transportRef.current.sendLine(encodeCommand({ type: 'SD_INFO' }));
        await done;
        return info;
      }),
    [withLock, expectLine],
  );

  const pressKey = useCallback((index: number) => {
    if (transportMode === 'simulator') {
      simDeviceRef.current.press(index);
      setRefreshTick((t) => t + 1);
    }
  }, [transportMode]);

  const releaseKey = useCallback((index: number) => {
    if (transportMode === 'simulator') {
      simDeviceRef.current.release(index);
    }
  }, [transportMode]);

  const clearConsole = useCallback(() => {
    setConsoleEntries([]);
  }, []);

  const setKeyPressHandler = useCallback(
    (handler: ((index: number, taps: number) => void) | null) => {
      keyPressHandlerRef.current = handler;
    },
    [],
  );

  const logLocal = useCallback(
    (line: string) => {
      addConsoleEntry(line, 'tx');
    },
    [addConsoleEntry],
  );

  return {
    transport: transportRef.current,
    // Always present: the live device in simulator mode, the local mirror
    // of the physical deck in USB mode.
    device: simDeviceRef.current,
    connectionState,
    transportMode,
    setTransportMode,
    connect,
    disconnect,
    sendCommand,
    sendSetImage,
    sendSetFace,
    sendAnimation,
    listSdDir,
    deleteSdPath,
    fetchSdInfo,
    pressKey,
    releaseKey,
    selectedKey,
    setSelectedKey,
    consoleEntries,
    clearConsole,
    deviceInfo,
    refreshTick,
    webSerialSupported: webTransportRef.current.isWebSerialSupported(),
    setKeyPressHandler,
    logLocal,
  };
}
