import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_REGISTRY_URL,
  fetchRegistryIcon,
  getRegistryUrl,
  notesSince,
  pluginHost,
  setRegistryUrl,
  versionNewer,
  type InstalledPlugin,
  type RegistryPlugin,
} from '../../plugins/host';
import { isTauri } from '../../transport/TauriSerialTransport';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { PluginDetail, type PluginDetailTarget } from './PluginDetail';

function PuzzleGlyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 3.5A1.5 1.5 0 0111.5 2h1A1.5 1.5 0 0114 3.5V5h3a2 2 0 012 2v3h-1.5a1.5 1.5 0 00-1.5 1.5v1a1.5 1.5 0 001.5 1.5H19v3a2 2 0 01-2 2h-3v-1.5a1.5 1.5 0 00-1.5-1.5h-1a1.5 1.5 0 00-1.5 1.5V19H7a2 2 0 01-2-2v-3H3.5A1.5 1.5 0 012 12.5v-1A1.5 1.5 0 013.5 10H5V7a2 2 0 012-2h3V3.5z" />
    </svg>
  );
}

/** Plugin icon with a graceful fallback to the puzzle glyph. */
function PluginIcon({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="plugin-card-glyph">
        <PuzzleGlyph />
      </span>
    );
  }
  return (
    <img
      className="plugin-card-icon"
      src={src}
      alt={`${name} icon`}
      onError={() => setFailed(true)}
      draggable={false}
    />
  );
}

/** Full Plugins page — store, installed list, and the developer corner. */
export function PluginsView() {
  const [installed, setInstalled] = useState<InstalledPlugin[]>(pluginHost.listInstalled());
  const [registry, setRegistry] = useState<RegistryPlugin[] | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pluginsDir, setPluginsDir] = useState<string | null>(null);
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

  const [registryIcons, setRegistryIcons] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<PluginDetailTarget | null>(null);

  const loadRegistry = useCallback(async () => {
    setRegistryError(null);
    try {
      const entries = await pluginHost.fetchRegistry();
      setRegistry(entries);
      // Icons arrive as they load — cards upgrade from the puzzle glyph
      for (const entry of entries) {
        void fetchRegistryIcon(entry).then((icon) => {
          if (icon) setRegistryIcons((prev) => ({ ...prev, [entry.id]: icon }));
        });
      }
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
      <div className="plugins-view">
        <div className="plugins-empty">
          <PuzzleGlyph />
          <div className="profiles-empty-title">Plugins live in the desktop app</div>
          <div className="profiles-empty-sub">
            The browser build can't load plugin code — grab the companion app to install
            plugins, or build your own from <code>plugins/README.md</code>.
          </div>
        </div>
      </div>
    );
  }

  const installedById = new Map(installed.map((p) => [p.id, p]));
  const notInstalled = (registry ?? []).filter((p) => !installedById.has(p.id));

  return (
    <div className="plugins-view">
      {/* ── Installed ── */}
      <section className="plugins-section">
        <div className="plugins-section-head">
          <h2>Installed</h2>
          <span className="plugins-count">{installed.length}</span>
        </div>
        {installed.length === 0 ? (
          <div className="plugins-empty">
            <PuzzleGlyph />
            <div className="profiles-empty-title">No plugins yet</div>
            <div className="profiles-empty-sub">
              Everything in the store below installs with one click — actions appear in the
              key inspector immediately.
            </div>
          </div>
        ) : (
          <div className="plugins-grid">
            {installed.map((p) => {
              const update = (registry ?? []).find(
                (r) => r.id === p.id && versionNewer(r.version, p.version),
              );
              const updateNotes = update ? notesSince(update.changelog, p.version) : [];
              const registryEntry = (registry ?? []).find((r) => r.id === p.id);
              const openDetail = () =>
                setDetail({ installed: p, registry: registryEntry, icon: p.icon });
              return (
                <article
                  key={p.id}
                  className="plugin-card installed clickable"
                  onClick={openDetail}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openDetail();
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.name} details`}
                >
                  <div className="plugin-card-head">
                    <PluginIcon src={p.icon} name={p.name} />
                    <div className="plugin-card-id">
                      <span className="plugin-card-name">{p.name}</span>
                      <span className="plugin-card-version">v{p.version}</span>
                    </div>
                    {pluginHost.getSettingsSpec(p.id) && (
                      <span className="plugin-card-badge">settings</span>
                    )}
                  </div>
                  <p className="plugin-card-desc">{p.description || 'No description.'}</p>
                  {updateNotes.length > 0 && (
                    <ul className="plugin-card-changelog">
                      {updateNotes.map((n) => (
                        <li key={n.version}>
                          <span className="plugin-card-changelog-version">v{n.version}</span>
                          {n.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {update && (
                    <div className="plugin-card-actions">
                      <Button
                        variant="primary"
                        disabled={busy !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void run(`update ${p.id}`, () => pluginHost.install(update));
                        }}
                      >
                        {busy === `update ${p.id}` ? 'Updating…' : `Update to v${update.version}`}
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Store ── */}
      <section className="plugins-section">
        <div className="plugins-section-head">
          <h2>Store</h2>
          <button type="button" className="plugin-minor-link" onClick={() => void loadRegistry()}>
            Refresh
          </button>
        </div>
        {registryError && (
          <div className="storage-error">
            {registryError}
            {getRegistryUrl() !== DEFAULT_REGISTRY_URL && (
              <button
                type="button"
                className="plugin-minor-link"
                onClick={() => {
                  setRegistryUrl('');
                  setRegUrl(DEFAULT_REGISTRY_URL);
                  void loadRegistry();
                }}
              >
                Use the default registry (GitHub)
              </button>
            )}
          </div>
        )}
        {registry === null && !registryError && <p className="muted">Loading registry…</p>}
        {registry !== null && notInstalled.length === 0 && !registryError && (
          <p className="muted">
            Everything in the registry is installed. New plugins appear here when they're
            merged into the repo.
          </p>
        )}
        <div className="plugins-grid">
          {notInstalled.map((p) => {
            const openDetail = () => setDetail({ registry: p, icon: registryIcons[p.id] });
            return (
              <article
                key={p.id}
                className="plugin-card clickable"
                onClick={openDetail}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') openDetail();
                }}
                role="button"
                tabIndex={0}
                aria-label={`${p.name} details`}
              >
                <div className="plugin-card-head">
                  <PluginIcon src={registryIcons[p.id]} name={p.name} />
                  <div className="plugin-card-id">
                    <span className="plugin-card-name">{p.name}</span>
                    <span className="plugin-card-version">
                      v{p.version}
                      {p.author ? ` · ${p.author}` : ''}
                    </span>
                  </div>
                </div>
                <p className="plugin-card-desc">{p.description}</p>
                <div className="plugin-card-actions">
                  <Button
                    variant="primary"
                    disabled={busy !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      void run(`install ${p.id}`, () => pluginHost.install(p));
                    }}
                  >
                    {busy === `install ${p.id}` ? 'Installing…' : 'Install'}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── Developer ── */}
      <section className="plugins-section">
        <div className="plugins-section-head">
          <h2>Developer</h2>
        </div>
        <div className="plugin-dev">
          <p className="muted">
            A plugin is a folder with a manifest and one JS module. <strong>Create</strong>{' '}
            scaffolds a working plugin — its Hello action goes live instantly; edit{' '}
            <code>main.js</code> and hit Reload to iterate. Publish by PR-ing the folder plus a
            registry entry into the repo.
          </p>
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
                  const id = newId;
                  await pluginHost.scaffold(id);
                  setNewId('');
                  setStatus(`Created "${id}" — its Hello action is live. Edit main.js, then Reload.`);
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
          {regUrl !== DEFAULT_REGISTRY_URL && (
            <button
              type="button"
              className="plugin-minor-link"
              onClick={() => {
                setRegistryUrl('');
                setRegUrl(DEFAULT_REGISTRY_URL);
                void loadRegistry();
              }}
            >
              Reset to the default registry
            </button>
          )}
          {pluginsDir && <span className="plugin-row-desc mono">{pluginsDir}</span>}
        </div>
      </section>

      {status && <p className="muted plugins-status">{status}</p>}

      {detail && (
        <PluginDetail
          target={detail}
          busy={busy}
          onInstall={(entry) =>
            void run(`install ${entry.id}`, async () => {
              await pluginHost.install(entry);
              setDetail(null);
            })
          }
          onUninstall={(id) =>
            void run(`uninstall ${id}`, async () => {
              await pluginHost.uninstall(id);
              setDetail(null);
            })
          }
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
