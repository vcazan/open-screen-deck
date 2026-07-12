/**
 * Plugin host — loads plugin modules (companion only) and lets them
 * contribute action types with settings UI + host-side effects.
 *
 * A plugin exports `activate(api)`. The API is intentionally narrow:
 *   api.registerAction({ type, label, hint, fields, execute })
 *   api.setKeyFace(slot, { label?, sublabel?, bg? })
 *   api.log(message)
 *
 * Trust model: plugins run inside the webview with the same reach as the
 * app itself. Install only plugins you trust.
 */

import { isTauri } from '../transport/TauriSerialTransport';

export interface PluginFieldOption {
  value: string;
  label: string;
}

/**
 * A settings/customization field declared by a plugin action. Types map to
 * native controls in the key inspector and the plugin's defaults page:
 * `text` (default), `select` (dropdown of options), `color` (swatch,
 * stored as "#rrggbb"), `toggle` (stored as "yes" / "").
 */
export interface PluginField {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'select' | 'color' | 'toggle';
  /** Choices for `select` fields */
  options?: PluginFieldOption[];
  /** Prefilled when the action is assigned to a key */
  default?: string;
}

/** Declared field defaults for an action — the base layer for new keys. */
export function fieldDefaults(fields: PluginField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.default !== undefined) out[f.key] = f.default;
  }
  return out;
}

export interface PluginActionSpec {
  /** Unique within the plugin, e.g. "webhook" */
  type: string;
  label: string;
  hint?: string;
  fields: PluginField[];
  execute: (settings: Record<string, string>, ctx: PluginContext) => void | Promise<void>;
  /**
   * Called when the action is assigned to a key (and when its settings
   * change). Paint the key's branded face here — plugin keys own their look.
   */
  onAssign?: (settings: Record<string, string>, ctx: PluginContext) => void | Promise<void>;
}

export interface PluginContext {
  log: (msg: string) => void;
  setKeyFace: (
    slot: number,
    face: { label?: string; sublabel?: string; bg?: number },
  ) => void;
  /** Run a shell command on the host (dry-runs in the browser build). */
  shell: (command: string) => Promise<void>;
  /** Press a hotkey chord like "cmd+shift+a" on the host. */
  hotkey: (keys: string) => Promise<void>;
  /**
   * HTTP through the Rust backend — use this instead of window.fetch for
   * plain-http and CORS-less targets (Hue bridges, local webhooks, LAN
   * devices), which the webview refuses to reach.
   */
  fetch: (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{ status: number; ok: boolean; body: string; json: () => unknown }>;
  /**
   * Stream a fully custom 128×128 face to this key (SET_FACE): fast,
   * draw-only, never touches the SD card. Use for live data — prices,
   * clocks, status feedback. Transparent pixels take the key's bg color.
   */
  paintFace: (canvas: HTMLCanvasElement) => Promise<void>;
  /**
   * Set a persistent branded face (SET_IMAGE): survives reboots and shows
   * standalone. Use in onAssign; stream live updates over it with paintFace.
   */
  setKeyImage: (canvas: HTMLCanvasElement) => Promise<void>;
  /**
   * Send a request over the app's obs-websocket connection (v5 protocol),
   * e.g. ctx.obs('SetCurrentProgramScene', { sceneName: 'Scene 1' }).
   * The connection itself is managed by the obs-control plugin's settings.
   */
  obs: (requestType: string, requestData?: Record<string, unknown>) => Promise<unknown>;
  /** The key slot that fired the action */
  slot: number;
}

export interface RegisteredPluginAction extends PluginActionSpec {
  /** Fully-qualified id: "<pluginId>:<type>" */
  id: string;
  pluginId: string;
  pluginName: string;
  /** data: URL of the plugin's icon, if it ships one */
  pluginIcon?: string;
}

interface HostBridge {
  log: (msg: string) => void;
  setKeyFace: PluginContext['setKeyFace'];
  /** Stream a draw-only RGB565 frame (SET_FACE) */
  sendFace: (slot: number, rgb565: Uint8Array) => Promise<void>;
  /** Persist an RGB565 frame as the key's image (SET_IMAGE) */
  sendImage: (slot: number, rgb565: Uint8Array) => Promise<void>;
  /** Request over the app's obs-websocket connection */
  obsRequest: (requestType: string, requestData?: Record<string, unknown>) => Promise<unknown>;
  /** Reconfigure the app's shared obs-websocket connection */
  obsConfigure: (url: string, password: string, autoConnect: boolean) => Promise<void>;
}

/**
 * Plugin-level settings (as opposed to per-key action settings) — global
 * config like connection details, managed from the plugin's detail page.
 */
export interface PluginSettingsSpec {
  fields: PluginField[];
  /** Called with stored values on load and whenever the user saves */
  apply: (values: Record<string, string>) => void | Promise<void>;
}

const PLUGIN_SETTINGS_KEY = 'osd-plugin-settings';
const ACTION_DEFAULTS_KEY = 'osd-plugin-action-defaults';

function readStore(key: string): Record<string, Record<string, string>> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}

function writeStore(key: string, id: string, values: Record<string, string>): void {
  const all = readStore(key);
  all[id] = values;
  localStorage.setItem(key, JSON.stringify(all));
}

/** Stored per-key defaults for a plugin action — prefill on assignment. */
export function getActionDefaults(actionId: string): Record<string, string> {
  return readStore(ACTION_DEFAULTS_KEY)[actionId] ?? {};
}

export function setActionDefaults(actionId: string, values: Record<string, string>): void {
  writeStore(ACTION_DEFAULTS_KEY, actionId, values);
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  /** data: URL of the plugin's icon.svg, if it ships one */
  icon?: string;
}

export interface RegistryPlugin {
  id: string;
  name: string;
  version: string;
  author?: string;
  description: string;
  base: string;
  files: string[];
  /** Icon filename within `base`, e.g. "icon.svg" */
  icon?: string;
  /** Release notes per version, e.g. { "2.1.0": "Added …" } */
  changelog?: Record<string, string>;
}

/** An available update: the registry entry plus what's new since installed. */
export interface PluginUpdate {
  entry: RegistryPlugin;
  installed: InstalledPlugin;
  /** Release notes newer than the installed version, newest first */
  notes: { version: string; note: string }[];
}

export function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/** Changelog entries newer than `sinceVersion`, newest first. */
export function notesSince(
  changelog: Record<string, string> | undefined,
  sinceVersion: string,
): { version: string; note: string }[] {
  if (!changelog) return [];
  return Object.entries(changelog)
    .filter(([v]) => versionNewer(v, sinceVersion))
    .sort(([a], [b]) => (versionNewer(a, b) ? -1 : 1))
    .map(([version, note]) => ({ version, note }));
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

const registryIconCache = new Map<string, string | null>();

/**
 * Fetch a registry plugin's icon as a data URL. Goes through the Rust HTTP
 * proxy because raw-file hosts (GitHub raw) serve SVG as text/plain, which
 * <img> refuses. Cached per URL.
 */
export async function fetchRegistryIcon(p: RegistryPlugin): Promise<string | null> {
  if (!p.icon) return null;
  const url = `${p.base.replace(/\/+$/, '')}/${p.icon}`;
  const cached = registryIconCache.get(url);
  if (cached !== undefined) return cached;
  try {
    const res = await pluginFetch(url);
    const icon = res.ok && res.body.includes('<svg') ? svgDataUrl(res.body) : null;
    registryIconCache.set(url, icon);
    return icon;
  } catch {
    registryIconCache.set(url, null);
    return null;
  }
}

export const DEFAULT_REGISTRY_URL =
  'https://raw.githubusercontent.com/vcazan/open-screen-deck/main/plugins/registry.json';
const REGISTRY_URL_KEY = 'osd-plugin-registry-url';

export function getRegistryUrl(): string {
  return localStorage.getItem(REGISTRY_URL_KEY) || DEFAULT_REGISTRY_URL;
}

export function setRegistryUrl(url: string): void {
  if (url && url !== DEFAULT_REGISTRY_URL) localStorage.setItem(REGISTRY_URL_KEY, url);
  else localStorage.removeItem(REGISTRY_URL_KEY);
}

async function runHostAction(action: Record<string, unknown>, log: (m: string) => void) {
  if (!isTauri()) {
    log(`(dry-run, needs the desktop app): ${JSON.stringify(action)}`);
    return;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('execute_action', { action });
}

async function pluginFetch(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
): Promise<{ status: number; ok: boolean; body: string; json: () => unknown }> {
  if (!isTauri()) {
    // Browser build: plain window.fetch (subject to normal CORS rules)
    const res = await fetch(url, init);
    const body = await res.text();
    return { status: res.status, ok: res.ok, body, json: () => JSON.parse(body) };
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const result = (await invoke('plugin_http', {
    method: init?.method ?? 'GET',
    url,
    headers: init?.headers ?? null,
    body: init?.body ?? null,
  })) as { status: number; body: string };
  return {
    status: result.status,
    ok: result.status >= 200 && result.status < 300,
    body: result.body,
    json: () => JSON.parse(result.body),
  };
}

class PluginHost {
  private actions = new Map<string, RegisteredPluginAction>();
  private listeners = new Set<() => void>();
  private bridge: HostBridge = {
    log: () => {},
    setKeyFace: () => {},
    sendFace: async () => {},
    sendImage: async () => {},
    obsRequest: async () => {
      throw new Error('OBS bridge not connected');
    },
    obsConfigure: async () => {},
  };
  private loaded = false;
  private installed: InstalledPlugin[] = [];
  /** Cleanup callbacks per plugin — run on reload/uninstall (timers, audio) */
  private disposers = new Map<string, (() => void)[]>();
  /** Plugin-level settings specs, keyed by plugin id */
  private settingsSpecs = new Map<string, PluginSettingsSpec>();

  /** Wire the host to the live app (protocol + console). */
  connect(bridge: HostBridge): void {
    this.bridge = bridge;
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  list(): RegisteredPluginAction[] {
    return [...this.actions.values()];
  }

  listInstalled(): InstalledPlugin[] {
    return [...this.installed];
  }

  get(id: string): RegisteredPluginAction | undefined {
    return this.actions.get(id);
  }

  private makeContext(pluginId: string, slot: number): PluginContext {
    const log = (m: string) => this.bridge.log(`[${pluginId}] ${m}`);
    return {
      log,
      setKeyFace: (s, face) => this.bridge.setKeyFace(s, face),
      shell: (command) => runHostAction({ type: 'shell', command }, log),
      hotkey: (keys) => runHostAction({ type: 'hotkey', keys }, log),
      fetch: pluginFetch,
      paintFace: async (canvas) => {
        const { canvasToRgb565Alpha } = await import('../protocol/rgb565');
        await this.bridge.sendFace(slot, canvasToRgb565Alpha(canvas));
      },
      setKeyImage: async (canvas) => {
        const { canvasToRgb565Alpha } = await import('../protocol/rgb565');
        await this.bridge.sendImage(slot, canvasToRgb565Alpha(canvas));
      },
      obs: (requestType, requestData) => this.bridge.obsRequest(requestType, requestData),
      slot,
    };
  }

  /**
   * Render what an action's face would look like — runs onAssign in a
   * sandbox where face writes are captured and host effects are inert.
   * Returns a data URL, or null if the plugin doesn't paint.
   */
  async previewFace(
    actionId: string,
    settings?: Record<string, string>,
  ): Promise<string | null> {
    const action = this.actions.get(actionId);
    if (!action?.onAssign) return null;
    let captured: string | null = null;
    const ctx: PluginContext = {
      ...this.makeContext(action.pluginId, 0),
      shell: async () => {},
      hotkey: async () => {},
      setKeyFace: () => {},
      paintFace: async (canvas) => {
        captured = canvas.toDataURL();
      },
      setKeyImage: async (canvas) => {
        captured = canvas.toDataURL();
      },
    };
    await action.onAssign(settings ?? getActionDefaults(actionId), ctx);
    return captured;
  }

  // ── Plugin-level settings ──

  getSettingsSpec(pluginId: string): PluginSettingsSpec | undefined {
    return this.settingsSpecs.get(pluginId);
  }

  getPluginSettings(pluginId: string): Record<string, string> {
    return readStore(PLUGIN_SETTINGS_KEY)[pluginId] ?? {};
  }

  async savePluginSettings(pluginId: string, values: Record<string, string>): Promise<void> {
    writeStore(PLUGIN_SETTINGS_KEY, pluginId, values);
    const spec = this.settingsSpecs.get(pluginId);
    if (spec) await spec.apply(values);
  }

  async execute(id: string, settings: Record<string, string>, slot: number): Promise<void> {
    const action = this.actions.get(id);
    if (!action) {
      this.bridge.log(`plugin action ${id} is not installed`);
      return;
    }
    try {
      await action.execute(settings, this.makeContext(action.pluginId, slot));
    } catch (err) {
      this.bridge.log(`[${action.pluginId}] failed: ${String(err)}`);
    }
  }

  /**
   * A plugin action was assigned to a key (or its settings changed) — the
   * plugin takes ownership of the face via its onAssign hook.
   */
  async notifyAssigned(id: string, settings: Record<string, string>, slot: number): Promise<void> {
    const action = this.actions.get(id);
    if (!action?.onAssign) return;
    try {
      await action.onAssign(settings, this.makeContext(action.pluginId, slot));
    } catch (err) {
      this.bridge.log(`[${action.pluginId}] onAssign failed: ${String(err)}`);
    }
  }

  /** Load every plugin from the app data dir (idempotent). */
  async loadAll(): Promise<void> {
    if (this.loaded || !isTauri()) return;
    this.loaded = true;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const plugins = (await invoke('plugins_list')) as {
        id: string;
        manifest: { name?: string; version?: string; description?: string };
        code: string;
        icon?: string | null;
      }[];
      this.installed = plugins.map((p) => ({
        id: p.id,
        name: p.manifest.name ?? p.id,
        version: p.manifest.version ?? '0.0.0',
        description: p.manifest.description ?? '',
        icon: p.icon ? svgDataUrl(p.icon) : undefined,
      }));
      for (const plugin of plugins) {
        await this.loadOne(
          plugin.id,
          plugin.manifest.name ?? plugin.id,
          plugin.code,
          plugin.icon ? svgDataUrl(plugin.icon) : undefined,
        );
      }
      if (plugins.length) {
        this.bridge.log(`plugins: loaded ${plugins.map((p) => p.id).join(', ')}`);
      }
      this.listeners.forEach((cb) => cb());
    } catch (err) {
      this.bridge.log(`plugins: load failed — ${String(err)}`);
    }
  }

  /** Hot reload: drop everything and re-import from disk (dev loop). */
  async reload(): Promise<void> {
    // Give live plugins (clocks, tickers, audio) a chance to shut down
    for (const [id, cbs] of this.disposers) {
      cbs.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          this.bridge.log(`plugin ${id}: dispose failed — ${String(err)}`);
        }
      });
    }
    this.disposers.clear();
    this.actions.clear();
    this.settingsSpecs.clear();
    this.installed = [];
    this.loaded = false;
    this.listeners.forEach((cb) => cb());
    await this.loadAll();
  }

  /**
   * Fetch the plugin registry. Runs through the Rust backend so any host
   * works — the webview's CORS/mixed-content rules don't apply.
   */
  async fetchRegistry(): Promise<RegistryPlugin[]> {
    const { invoke } = await import('@tauri-apps/api/core');
    const data = (await invoke('plugin_fetch_registry', { url: getRegistryUrl() })) as {
      plugins?: RegistryPlugin[];
    };
    return (data.plugins ?? []).filter((p) => p.id && p.base && Array.isArray(p.files));
  }

  /**
   * Compare installed plugins against the registry. Returns available
   * updates with their release notes — installing stays the user's call.
   */
  async checkForUpdates(): Promise<PluginUpdate[]> {
    if (this.installed.length === 0) return [];
    const registry = await this.fetchRegistry();
    const updates: PluginUpdate[] = [];
    for (const installed of this.installed) {
      const entry = registry.find(
        (r) => r.id === installed.id && versionNewer(r.version, installed.version),
      );
      if (entry) {
        updates.push({ entry, installed, notes: notesSince(entry.changelog, installed.version) });
      }
    }
    return updates;
  }

  /** Install a plugin from the registry (downloads happen in Rust). */
  async install(plugin: RegistryPlugin): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin_install', {
      id: plugin.id,
      base: plugin.base,
      files: plugin.files,
    });
    this.bridge.log(`plugins: installed ${plugin.id}@${plugin.version}`);
    await this.reload();
  }

  async uninstall(id: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin_uninstall', { id });
    this.bridge.log(`plugins: uninstalled ${id}`);
    await this.reload();
  }

  /** Developer tool: scaffold a template plugin, returns its path. */
  async scaffold(id: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/core');
    const dir = (await invoke('plugin_scaffold', { id })) as string;
    await this.reload();
    return dir;
  }

  private async loadOne(
    pluginId: string,
    pluginName: string,
    code: string,
    pluginIcon?: string,
  ): Promise<void> {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
      const mod = (await import(/* @vite-ignore */ url)) as {
        activate?: (api: unknown) => void;
      };
      if (typeof mod.activate !== 'function') {
        this.bridge.log(`plugin ${pluginId}: no activate() export`);
        return;
      }
      mod.activate({
        registerAction: (spec: PluginActionSpec) => {
          const id = `${pluginId}:${spec.type}`;
          this.actions.set(id, { ...spec, id, pluginId, pluginName, pluginIcon });
          this.listeners.forEach((cb) => cb());
        },
        registerSettings: (fields: PluginField[], apply: PluginSettingsSpec['apply']) => {
          this.settingsSpecs.set(pluginId, { fields, apply });
          // Feed stored values immediately so connections come up on load
          void Promise.resolve(apply(this.getPluginSettings(pluginId))).catch((err) =>
            this.bridge.log(`plugin ${pluginId}: settings apply failed — ${String(err)}`),
          );
          this.listeners.forEach((cb) => cb());
        },
        obsConnection: (url: string, password: string, autoConnect: boolean) =>
          this.bridge.obsConfigure(url, password, autoConnect),
        onDispose: (cb: () => void) => {
          const list = this.disposers.get(pluginId) ?? [];
          list.push(cb);
          this.disposers.set(pluginId, list);
        },
        log: (m: string) => this.bridge.log(`[${pluginId}] ${m}`),
      });
    } catch (err) {
      this.bridge.log(`plugin ${pluginId}: activation failed — ${String(err)}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export const pluginHost = new PluginHost();
