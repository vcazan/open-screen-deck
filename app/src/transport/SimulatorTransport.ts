import type { Transport, ConnectionState } from './types';
import { SimulatedDevice } from '../simulator/SimulatedDevice';

export class SimulatorTransport implements Transport {
  private device: SimulatedDevice;
  private state: ConnectionState = 'disconnected';
  private lineCb: ((line: string, direction: 'tx' | 'rx') => void) | null = null;
  private stateCb: ((state: ConnectionState) => void) | null = null;

  constructor(device?: SimulatedDevice) {
    this.device = device ?? new SimulatedDevice();
    this.device.onLine((line) => {
      this.lineCb?.(line, 'rx');
    });
  }

  getDevice(): SimulatedDevice {
    return this.device;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') return;
    this.setState('connecting');
    await new Promise((r) => setTimeout(r, 100));
    this.setState('connected');
    this.device.boot();
  }

  async disconnect(): Promise<void> {
    this.device.destroy();
    this.setState('disconnected');
  }

  sendLine(line: string): void {
    if (this.state !== 'connected') return;
    this.lineCb?.(line, 'tx');
    this.device.handleLine(line);
  }

  sendBytes(bytes: Uint8Array): void {
    if (this.state !== 'connected') return;
    this.lineCb?.(`[${bytes.length} bytes binary]`, 'tx');
    this.device.handleBytes(bytes);
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
    return false;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.stateCb?.(state);
  }
}
