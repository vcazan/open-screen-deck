import type { Transport, ConnectionState } from './types';

const BAUD_RATE = 115200;

export class WebSerialTransport implements Transport {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readBuffer = '';
  private state: ConnectionState = 'disconnected';
  private lineCb: ((line: string, direction: 'tx' | 'rx') => void) | null = null;
  private stateCb: ((state: ConnectionState) => void) | null = null;
  private readLoopActive = false;

  async connect(): Promise<void> {
    if (!this.isWebSerialSupported()) {
      throw new Error('Web Serial API is not available in this browser');
    }

    this.setState('connecting');

    try {
      this.port = await navigator.serial!.requestPort();
      await this.port.open({ baudRate: BAUD_RATE });

      if (!this.port.readable || !this.port.writable) {
        throw new Error('Port streams unavailable');
      }

      this.writer = this.port.writable.getWriter();
      this.reader = this.port.readable.getReader();
      this.readLoopActive = true;
      this.setState('connected');
      this.startReadLoop();
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.readLoopActive = false;

    if (this.reader) {
      try {
        await this.reader.cancel();
        this.reader.releaseLock();
      } catch {
        // Reader may already be released
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        await this.writer.close();
        this.writer.releaseLock();
      } catch {
        // Writer may already be closed
      }
      this.writer = null;
    }

    if (this.port) {
      try {
        await this.port.close();
      } catch {
        // Port may already be closed
      }
      this.port = null;
    }

    this.readBuffer = '';
    this.setState('disconnected');
  }

  sendLine(line: string): void {
    if (this.state !== 'connected' || !this.writer) return;
    const encoded = new TextEncoder().encode(line + '\n');
    this.writer.write(encoded);
    this.lineCb?.(line, 'tx');
  }

  sendBytes(bytes: Uint8Array): void {
    if (this.state !== 'connected' || !this.writer) return;
    this.writer.write(bytes);
    this.lineCb?.(`[${bytes.length} bytes binary]`, 'tx');
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
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.stateCb?.(state);
  }

  private async startReadLoop(): Promise<void> {
    while (this.readLoopActive && this.reader) {
      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        // Device → host traffic is always newline-delimited JSON; binary
        // payloads only ever flow host → device after a send_data event.
        this.handleTextChunk(value);
      } catch {
        if (this.readLoopActive) {
          this.setState('error');
        }
        break;
      }
    }
  }

  private handleTextChunk(chunk: Uint8Array): void {
    const text = new TextDecoder().decode(chunk);
    this.readBuffer += text;

    let newlineIdx: number;
    while ((newlineIdx = this.readBuffer.indexOf('\n')) >= 0) {
      const line = this.readBuffer.slice(0, newlineIdx).trim();
      this.readBuffer = this.readBuffer.slice(newlineIdx + 1);

      if (line.length === 0) continue;
      this.lineCb?.(line, 'rx');
    }
  }
}
