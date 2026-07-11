export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendLine(line: string): void;
  sendBytes(bytes: Uint8Array): void;
  onLine(callback: (line: string, direction: 'tx' | 'rx') => void): void;
  onState(callback: (state: ConnectionState) => void): void;
  getState(): ConnectionState;
  isWebSerialSupported(): boolean;
}
