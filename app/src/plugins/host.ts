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

class PluginHost {
  private actions = new Map<string, RegisteredPluginAction>();
  private listeners = new Set<() => void>();
  private bridge: HostBridge = { log: () => {}, setKeyFace: () => {} };
  private loaded = false;
  private installed: InstalledPlugin[] = [];

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
    try {
      await action.execute(settings, {
        log: (m) => this.bridge.log(`[${action.pluginId}] ${m}`),
        setKeyFace: this.bridge.setKeyFace,
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
