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

export interface PluginField {
  key: string;
  label: string;
  placeholder?: string;
}

export interface PluginActionSpec {
  /** Unique within the plugin, e.g. "webhook" */
  type: string;
  label: string;
  hint?: string;
  fields: PluginField[];
  execute: (settings: Record<string, string>, ctx: PluginContext) => void | Promise<void>;
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
  /** The key slot that fired the action */
  slot: number;
}

export interface RegisteredPluginAction extends PluginActionSpec {
  /** Fully-qualified id: "<pluginId>:<type>" */
  id: string;
  pluginId: string;
  pluginName: string;
}

interface HostBridge {
  log: (msg: string) => void;
  setKeyFace: PluginContext['setKeyFace'];
}

export interface InstalledPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
}

export interface RegistryPlugin {
  id: string;
  name: string;
  version: string;
  author?: string;
  description: string;
  base: string;
  files: string[];
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
  private bridge: HostBridge = { log: () => {}, setKeyFace: () => {} };
  private loaded = false;
  private installed: InstalledPlugin[] = [];
  /** Cleanup callbacks per plugin — run on reload/uninstall (timers, audio) */
  private disposers = new Map<string, (() => void)[]>();

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

  async execute(id: string, settings: Record<string, string>, slot: number): Promise<void> {
    const action = this.actions.get(id);
    if (!action) {
      this.bridge.log(`plugin action ${id} is not installed`);
      return;
    }
    const log = (m: string) => this.bridge.log(`[${action.pluginId}] ${m}`);
    try {
      await action.execute(settings, {
        log,
        setKeyFace: (s, face) => this.bridge.setKeyFace(s, face),
        shell: (command) => runHostAction({ type: 'shell', command }, log),
        hotkey: (keys) => runHostAction({ type: 'hotkey', keys }, log),
        fetch: pluginFetch,
        slot,
      });
    } catch (err) {
      this.bridge.log(`[${action.pluginId}] failed: ${String(err)}`);
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
      }[];
      this.installed = plugins.map((p) => ({
        id: p.id,
        name: p.manifest.name ?? p.id,
        version: p.manifest.version ?? '0.0.0',
        description: p.manifest.description ?? '',
      }));
      for (const plugin of plugins) {
        await this.loadOne(plugin.id, plugin.manifest.name ?? plugin.id, plugin.code);
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

  private async loadOne(pluginId: string, pluginName: string, code: string): Promise<void> {
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
          this.actions.set(id, { ...spec, id, pluginId, pluginName });
          this.listeners.forEach((cb) => cb());
        },
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
