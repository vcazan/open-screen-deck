/**
 * TauriSerialTransport — native serial via the Rust backend.
 * Auto-detects the deck (Espressif VID) and reconnects when it reappears.
 */

import type { Transport, ConnectionState } from './types';

const ESPRESSIF_VID = 0x303a;

interface TauriPortInfo {
  path: string;
  vid: number | null;
  pid: number | null;
  product: string | null;
}

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
type Listen = (
  event: string,
  handler: (event: { payload: unknown }) => void,
) => Promise<() => void>;

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function tauriApis(): Promise<{ invoke: Invoke; listen: Listen }> {
  const [{ invoke }, { listen }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
  ]);
  return { invoke: invoke as Invoke, listen: listen as Listen };
}

export class TauriSerialTransport implements Transport {
  private state: ConnectionState = 'disconnected';
  private lineCb: ((line: string, direction: 'tx' | 'rx') => void) | null = null;
  private stateCb: ((state: ConnectionState) => void) | null = null;
  private unlisteners: (() => void)[] = [];
  private invoke: Invoke | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private wantConnection = false;
  /** IPC calls are async — chain writes so lines/bytes hit the wire in order. */
  private writeChain: Promise<void> = Promise.resolve();

  async connect(): Promise<void> {
    if (!isTauri()) throw new Error('Not running inside the desktop app');
    this.setState('connecting');
    this.wantConnection = true;

    try {
      const { invoke, listen } = await tauriApis();
      this.invoke = invoke;

      if (this.unlisteners.length === 0) {
        this.unlisteners.push(
          await listen('serial-line', (e) => {
            const { line } = e.payload as { line: string };
            this.lineCb?.(line, 'rx');
          }),
          await listen('serial-status', (e) => {
            const { connected } = e.payload as { connected: boolean };
            if (!connected && this.state === 'connected') {
              this.setState('disconnected');
              this.scheduleReconnect();
            }
          }),
        );
      }

      const path = await this.findDeckPort();
      if (!path) {
        this.setState('error');
        this.scheduleReconnect();
        throw new Error('Deck not found — is it plugged in?');
      }

      await invoke('serial_open', { path });
      this.setState('connected');
    } catch (err) {
      if (this.state !== 'error') this.setState('error');
      this.scheduleReconnect();
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.wantConnection = false;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.invoke) {
      try {
        await this.invoke('serial_close');
      } catch {
        // Already closed
      }
    }
    this.setState('disconnected');
  }

  sendLine(line: string): void {
    if (this.state !== 'connected' || !this.invoke) return;
    this.lineCb?.(line, 'tx');
    const invoke = this.invoke;
    this.writeChain = this.writeChain.then(
      () => invoke('serial_write_line', { line }).then(() => undefined),
      () => invoke('serial_write_line', { line }).then(() => undefined),
    ).catch(() => {});
  }

  sendBytes(bytes: Uint8Array): void {
    if (this.state !== 'connected' || !this.invoke) return;
    this.lineCb?.(`[${bytes.length} bytes binary]`, 'tx');
    const invoke = this.invoke;
    const payload = Array.from(bytes);
    this.writeChain = this.writeChain.then(
      () => invoke('serial_write_bytes', { bytes: payload }).then(() => undefined),
      () => invoke('serial_write_bytes', { bytes: payload }).then(() => undefined),
    ).catch(() => {});
  }

  onLine(callback: (line: string, direction: 'tx' | 'rx') => void): void {
    this.lineCb = callback;
  }

  onState(callback: (state: ConnectionState) => void): void {
    this.stateCb = callback;
  }

  getState(): ConnectionState {
    return this.state;
  }

  isWebSerialSupported(): boolean {
    // Native serial: always available inside the desktop shell
    return isTauri();
  }

  private async findDeckPort(): Promise<string | null> {
    if (!this.invoke) return null;
    const ports = (await this.invoke('serial_list')) as TauriPortInfo[];
    // The ROM bootloader enumerates with the SAME VID/PID as the firmware
    // (303a:1001) — only the product string differs ("USB JTAG/serial debug
    // unit"). Connecting to it would look connected while every protocol
    // command times out, and it would steal the port from the flasher.
    const isBootloader = (p: TauriPortInfo) =>
      p.product?.toLowerCase().includes('jtag') ?? false;
    const deck =
      ports.find((p) => p.vid === ESPRESSIF_VID && !isBootloader(p)) ??
      ports.find((p) => p.product?.toLowerCase().includes('screen deck'));
    return deck?.path ?? null;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.wantConnection) return;
    this.reconnectTimer = setInterval(async () => {
      if (this.state === 'connected' || !this.wantConnection) {
        if (this.reconnectTimer) clearInterval(this.reconnectTimer);
        this.reconnectTimer = null;
        return;
      }
      try {
        const path = await this.findDeckPort();
        if (path && this.invoke) {
          await this.invoke('serial_open', { path });
          this.setState('connected');
          if (this.reconnectTimer) clearInterval(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      } catch {
        // Keep trying
      }
    }, 2000);
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.stateCb?.(state);
  }
}
