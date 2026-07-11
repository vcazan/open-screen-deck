import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REGISTRY_URL,
  getRegistryUrl,
  pluginHost,
  setRegistryUrl,
  type InstalledPlugin,
  type RegistryPlugin,
} from '../../plugins/host';
import { isTauri } from '../../transport/TauriSerialTransport';
import { Button } from '../components/Button';
import { Input } from '../components/Input';

function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/** Plugin manager: installed list, the store (registry), and dev tools. */
export function PluginsCard() {
  const [installed, setInstalled] = useState<InstalledPlugin[]>(pluginHost.listInstalled());
  const [registry, setRegistry] = useState<RegistryPlugin[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pluginsDir, setPluginsDir] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false);
  const [regUrl, setRegUrl] = useState(getRegistryUrl);
  const [newId, setNewId] = useState('');

  useEffect(() => pluginHost.onChange(() => setInstalled(pluginHost.listInstalled())), []);

  useEffect(() => {
    if (!isTauri()) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('plugins_dir'))
      .then((d) => setPluginsDir(d as string))
      .catch(() => {});
  }, []);

  const loadRegistry = useCallback(async () => {
    setRegistryError(null);
    try {
      setRegistry(await pluginHost.fetchRegistry());
    } catch (err) {
      setRegistry(null);
      setRegistryError(
        `Could not reach the plugin registry — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, []);

  useEffect(() => {
    if (isTauri()) void loadRegistry();
  }, [loadRegistry]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setStatus(null);
    try {
      await fn();
    } catch (err) {
      setStatus(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  if (!isTauri()) {
    return (
      <div className="settings-card">
        <h2>Plugins</h2>
        <p className="muted">
          Plugins run in the desktop companion app — the browser build can't load them.
        </p>
      </div>
    );
  }

  const installedById = new Map(installed.map((p) => [p.id, p]));

  return (
    <div className="settings-card">
      <h2>Plugins</h2>
      <p className="muted">
        Plugins add new action types to your keys. Install from the store below, or build
        your own — plugins are a folder with a manifest and one JS module.
      </p>

      {installed.length > 0 && (
        <div className="plugin-section">
          <div className="plugin-section-title">Installed</div>
          {installed.map((p) => (
            <div key={p.id} className="plugin-row">
              <div className="plugin-row-id">
                <span className="plugin-row-name">
                  {p.name} <span className="plugin-row-version">v{p.version}</span>
                </span>
                {p.description && <span className="plugin-row-desc">{p.description}</span>}
              </div>
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => run(`uninstall ${p.id}`, () => pluginHost.uninstall(p.id))}
              >
                {busy === `uninstall ${p.id}` ? 'Removing…' : 'Uninstall'}
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="plugin-section">
        <div className="plugin-section-title">
          Store
          <button
            type="button"
            className="plugin-minor-link"
            onClick={() => void loadRegistry()}
          >
            Refresh
          </button>
        </div>
        {registryError && <div className="storage-error">{registryError}</div>}
        {registry === null && !registryError && <p className="muted">Loading registry…</p>}
        {registry?.length === 0 && <p className="muted">The registry is empty.</p>}
        {registry?.map((p) => {
          const local = installedById.get(p.id);
          const updatable = local && versionNewer(p.version, local.version);
          return (
            <div key={p.id} className="plugin-row">
              <div className="plugin-row-id">
                <span className="plugin-row-name">
                  {p.name} <span className="plugin-row-version">v{p.version}</span>
                  {p.author && <span className="plugin-row-author"> · {p.author}</span>}
                </span>
                <span className="plugin-row-desc">{p.description}</span>
              </div>
              {local && !updatable ? (
                <span className="badge">Installed</span>
              ) : (
                <Button
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => run(`install ${p.id}`, () => pluginHost.install(p))}
                >
                  {busy === `install ${p.id}`
                    ? 'Installing…'
                    : updatable
                      ? `Update to v${p.version}`
                      : 'Install'}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <div className="plugin-section">
        <button
          type="button"
          className="plugin-section-title plugin-dev-toggle"
          onClick={() => setDevOpen(!devOpen)}
          aria-expanded={devOpen}
        >
          Developer {devOpen ? '▾' : '▸'}
        </button>
        {devOpen && (
          <div className="plugin-dev">
            <div className="plugin-dev-row">
              <Input
                label="New plugin id"
                placeholder="my-plugin"
                value={newId}
                onChange={(e) =>
                  setNewId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                }
              />
              <Button
                disabled={!newId || busy !== null}
                onClick={() =>
                  run('scaffold', async () => {
                    await pluginHost.scaffold(newId);
                    setNewId('');
                    setStatus(`Created "${newId}" — its Hello action is live. Edit main.js and hit Reload.`);
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('plugins_open_dir');
                  })
                }
              >
                Create
              </Button>
            </div>
            <div className="settings-obs-actions">
              <Button
                variant="ghost"
                onClick={() =>
                  run('open folder', async () => {
                    const { invoke } = await import('@tauri-apps/api/core');
                    await invoke('plugins_open_dir');
                  })
                }
              >
                Open plugin folder
              </Button>
              <Button
                variant="ghost"
                disabled={busy !== null}
                onClick={() => run('reload', () => pluginHost.reload())}
              >
                Reload plugins
              </Button>
            </div>
            <Input
              label="Registry URL"
              value={regUrl}
              placeholder={DEFAULT_REGISTRY_URL}
              onChange={(e) => {
                setRegUrl(e.target.value);
                setRegistryUrl(e.target.value.trim());
              }}
            />
            {pluginsDir && <span className="plugin-row-desc mono">{pluginsDir}</span>}
          </div>
        )}
      </div>

      {status && <p className="muted">{status}</p>}
    </div>
  );
}
