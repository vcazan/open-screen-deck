/**
 * Minimal obs-websocket v5 client — connect, authenticate, switch scenes,
 * track the current program scene. Runs in any environment (plain WebSocket).
 */

type SceneListener = (scene: string) => void;
type StatusListener = (connected: boolean) => void;

const OP_HELLO = 0;
const OP_IDENTIFY = 1;
const OP_IDENTIFIED = 2;
const OP_EVENT = 5;
const OP_REQUEST = 6;
const OP_RESPONSE = 7;

const EVENT_SUB_SCENES = 1 << 2; // Scenes event group

async function sha256b64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

class ObsClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private currentScene: string | null = null;
  private sceneListeners = new Set<SceneListener>();
  private statusListeners = new Set<StatusListener>();
  private requestId = 0;
  private pending = new Map<string, { resolve: (data: unknown) => void; reject: (e: Error) => void }>();

  isConnected(): boolean {
    return this.connected;
  }

  getCurrentScene(): string | null {
    return this.currentScene;
  }

  onScene(cb: SceneListener): () => void {
    this.sceneListeners.add(cb);
    return () => this.sceneListeners.delete(cb);
  }

  onStatus(cb: StatusListener): () => void {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  async connect(url: string, password: string): Promise<void> {
    this.disconnect();

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      const fail = (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      ws.onerror = () => fail(new Error('Could not reach OBS — is obs-websocket enabled?'));
      ws.onclose = () => {
        this.connected = false;
        this.statusListeners.forEach((cb) => cb(false));
        fail(new Error('Connection closed'));
      };

      ws.onmessage = async (msg) => {
        const packet = JSON.parse(msg.data as string) as { op: number; d: Record<string, unknown> };

        if (packet.op === OP_HELLO) {
          const auth = packet.d.authentication as
            | { challenge: string; salt: string }
            | undefined;
          let authString: string | undefined;
          if (auth) {
            const secret = await sha256b64(password + auth.salt);
            authString = await sha256b64(secret + auth.challenge);
          }
          ws.send(
            JSON.stringify({
              op: OP_IDENTIFY,
              d: { rpcVersion: 1, authentication: authString, eventSubscriptions: EVENT_SUB_SCENES },
            }),
          );
        } else if (packet.op === OP_IDENTIFIED) {
          this.connected = true;
          this.statusListeners.forEach((cb) => cb(true));
          if (!settled) {
            settled = true;
            resolve();
          }
          // Prime current scene
          this.request('GetCurrentProgramScene', {})
            .then((data) => {
              const scene = (data as { currentProgramSceneName?: string }).currentProgramSceneName;
              if (scene) {
                this.currentScene = scene;
                this.sceneListeners.forEach((cb) => cb(scene));
              }
            })
            .catch(() => {});
        } else if (packet.op === OP_EVENT) {
          const d = packet.d as { eventType?: string; eventData?: { sceneName?: string } };
          if (d.eventType === 'CurrentProgramSceneChanged' && d.eventData?.sceneName) {
            this.currentScene = d.eventData.sceneName;
            this.sceneListeners.forEach((cb) => cb(d.eventData!.sceneName!));
          }
        } else if (packet.op === OP_RESPONSE) {
          const d = packet.d as {
            requestId: string;
            requestStatus: { result: boolean; comment?: string };
            responseData?: unknown;
          };
          const pending = this.pending.get(d.requestId);
          if (pending) {
            this.pending.delete(d.requestId);
            if (d.requestStatus.result) pending.resolve(d.responseData ?? {});
            else pending.reject(new Error(d.requestStatus.comment ?? 'OBS request failed'));
          }
        }
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.connected) {
      this.connected = false;
      this.statusListeners.forEach((cb) => cb(false));
    }
  }

  async setScene(scene: string): Promise<void> {
    await this.request('SetCurrentProgramScene', { sceneName: scene });
  }

  private request(requestType: string, requestData: Record<string, unknown>): Promise<unknown> {
    const ws = this.ws;
    if (!ws || !this.connected) return Promise.reject(new Error('OBS not connected'));
    const requestId = `r${++this.requestId}`;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ op: OP_REQUEST, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error('OBS request timed out'));
        }
      }, 4000);
    });
  }
}

export const obsClient = new ObsClient();

const OBS_SETTINGS_KEY = 'osd-obs-settings';

export interface ObsSettings {
  url: string;
  password: string;
  autoConnect: boolean;
}

export function loadObsSettings(): ObsSettings {
  try {
    const raw = localStorage.getItem(OBS_SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as ObsSettings;
  } catch {
    // fall through
  }
  return { url: 'ws://127.0.0.1:4455', password: '', autoConnect: false };
}

export function saveObsSettings(settings: ObsSettings): void {
  localStorage.setItem(OBS_SETTINGS_KEY, JSON.stringify(settings));
}
