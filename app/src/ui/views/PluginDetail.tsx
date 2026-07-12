/**
 * Plugin detail — click any plugin card to land here. One place for
 * everything about a plugin: face previews rendered by the plugin's own
 * code, plugin-level settings (connections etc.), per-action defaults
 * that prefill the key inspector, the full changelog, and install /
 * update / uninstall.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fieldDefaults,
  getActionDefaults,
  notesSince,
  pluginHost,
  setActionDefaults,
  versionNewer,
  type InstalledPlugin,
  type RegistryPlugin,
} from '../../plugins/host';
import { Button } from '../components/Button';
import { PluginFields } from '../components/PluginFields';

export interface PluginDetailTarget {
  installed?: InstalledPlugin;
  registry?: RegistryPlugin;
  /** Icon to show (data URL for installed, fetched for store entries) */
  icon?: string;
}

interface PluginDetailProps {
  target: PluginDetailTarget;
  busy: string | null;
  onInstall: (entry: RegistryPlugin) => void;
  onUninstall: (id: string) => void;
  onClose: () => void;
}

/** One action's corner: preview face + defaults form. */
function ActionCard({ actionId }: { actionId: string }) {
  const action = pluginHost.get(actionId);
  const [defaults, setDefaults] = useState<Record<string, string>>(() => ({
    ...(pluginHost.get(actionId) ? fieldDefaults(pluginHost.get(actionId)!.fields) : {}),
    ...getActionDefaults(actionId),
  }));
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  const [preview, setPreview] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<'loading' | 'done' | 'none'>('loading');
  const [savedTick, setSavedTick] = useState(false);

  const renderPreview = useCallback(
    async (values: Record<string, string>) => {
      setPreviewState('loading');
      try {
        const url = await pluginHost.previewFace(actionId, values);
        setPreview(url);
        setPreviewState(url ? 'done' : 'none');
      } catch {
        setPreview(null);
        setPreviewState('none');
      }
    },
    [actionId],
  );

  useEffect(() => {
    void renderPreview(defaultsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionId, renderPreview]);

  if (!action) return null;

  const saveField = (key: string, value: string) => {
    const next = { ...defaults, [key]: value };
    setDefaults(next);
    setActionDefaults(actionId, next);
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1200);
  };

  return (
    <div className="plugin-detail-action">
      <div className="plugin-detail-action-preview">
        {previewState === 'loading' && <span className="plugin-detail-preview-spinner" aria-label="Rendering preview" />}
        {previewState === 'done' && preview && (
          <img src={preview} alt={`${action.label} preview`} draggable={false} />
        )}
        {previewState === 'none' && (
          <span className="plugin-detail-preview-empty">
            No preview — this action uses the key's own label and color.
          </span>
        )}
      </div>
      <div className="plugin-detail-action-info">
        <div className="plugin-detail-action-title">
          {action.label}
          {savedTick && <span className="plugin-detail-saved">defaults saved</span>}
        </div>
        {action.hint && <p className="plugin-detail-action-hint">{action.hint}</p>}
        {action.fields.length > 0 ? (
          <div className="plugin-detail-fields">
            <PluginFields
              fields={action.fields}
              values={defaults}
              onChange={saveField}
              onCommit={() => void renderPreview({ ...defaultsRef.current })}
            />
            <span className="plugin-detail-fields-hint">
              Defaults prefill new keys using this action — the preview follows.
            </span>
          </div>
        ) : (
          <span className="plugin-detail-fields-hint">No settings — assign and press.</span>
        )}
      </div>
    </div>
  );
}

/** Plugin-level settings (connections etc.) with save + feedback. */
function PluginSettings({ pluginId }: { pluginId: string }) {
  const spec = pluginHost.getSettingsSpec(pluginId);
  const [values, setValues] = useState<Record<string, string>>(() =>
    pluginHost.getPluginSettings(pluginId),
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  if (!spec) return null;

  const save = async () => {
    setState('saving');
    try {
      await pluginHost.savePluginSettings(pluginId, values);
      setState('saved');
      setTimeout(() => setState('idle'), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  };

  return (
    <section className="plugin-detail-section">
      <h3>Settings</h3>
      <div className="plugin-detail-fields">
        <PluginFields
          fields={spec.fields}
          values={values}
          onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
        />
      </div>
      <div className="plugin-detail-settings-foot">
        <Button variant="primary" onClick={() => void save()} disabled={state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save settings'}
        </Button>
        {state === 'saved' && <span className="plugin-detail-saved">applied</span>}
        {state === 'error' && <span className="plugin-update-error">{error}</span>}
      </div>
    </section>
  );
}

export function PluginDetail({ target, busy, onInstall, onUninstall, onClose }: PluginDetailProps) {
  const id = target.installed?.id ?? target.registry?.id ?? '';
  const name = target.installed?.name ?? target.registry?.name ?? id;
  const version = target.installed?.version ?? target.registry?.version ?? '';
  const description = target.installed?.description || target.registry?.description || '';
  const isInstalled = !!target.installed;

  const actions = useMemo(
    () => pluginHost.list().filter((a) => a.pluginId === id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  const update =
    target.installed && target.registry &&
    versionNewer(target.registry.version, target.installed.version)
      ? target.registry
      : null;
  const updateNotes = update ? notesSince(update.changelog, target.installed!.version) : [];

  // Full history, newest first
  const changelog = Object.entries(target.registry?.changelog ?? {}).sort(([a], [b]) =>
    versionNewer(a, b) ? -1 : 1,
  );

  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="plugin-update-backdrop" role="dialog" aria-modal="true" aria-label={`${name} details`}>
      <div className="plugin-detail-card">
        <header className="plugin-detail-head">
          {target.icon ? (
            <img className="plugin-detail-icon" src={target.icon} alt="" draggable={false} />
          ) : (
            <span className="plugin-detail-icon placeholder" aria-hidden />
          )}
          <div className="plugin-detail-id">
            <h2>{name}</h2>
            <span className="plugin-card-version">
              v{version}
              {target.registry?.author ? ` · ${target.registry.author}` : ''}
              {isInstalled ? ' · installed' : ''}
            </span>
          </div>
          <button type="button" className="plugin-update-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="plugin-detail-scroll">
          {description && <p className="plugin-detail-desc">{description}</p>}

          {update && (
            <section className="plugin-detail-section update">
              <div className="plugin-detail-update-row">
                <span>
                  Update available: v{target.installed!.version} →{' '}
                  <strong>v{update.version}</strong>
                </span>
                <Button
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => onInstall(update)}
                >
                  {busy === `install ${id}` ? 'Updating…' : 'Update'}
                </Button>
              </div>
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
            </section>
          )}

          {isInstalled && <PluginSettings pluginId={id} />}

          {isInstalled && actions.length > 0 && (
            <section className="plugin-detail-section">
              <h3>
                Keys
                <span className="plugin-detail-section-sub">
                  previews rendered live by the plugin
                </span>
              </h3>
              <div className="plugin-detail-actions-list">
                {actions.map((a) => (
                  <ActionCard key={a.id} actionId={a.id} />
                ))}
              </div>
            </section>
          )}

          {changelog.length > 0 && (
            <section className="plugin-detail-section">
              <h3>Changelog</h3>
              <ul className="plugin-detail-changelog">
                {changelog.map(([v, note]) => (
                  <li key={v}>
                    <span className="plugin-card-changelog-version">v{v}</span>
                    {note}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="plugin-detail-foot">
          {isInstalled ? (
            <button
              type="button"
              className={`profile-minor-btn danger ${confirmRemove ? 'confirm' : ''}`}
              disabled={busy !== null}
              onClick={() => {
                if (confirmRemove) {
                  setConfirmRemove(false);
                  onUninstall(id);
                } else {
                  setConfirmRemove(true);
                }
              }}
              onBlur={() => setConfirmRemove(false)}
            >
              {busy === `uninstall ${id}`
                ? 'Removing…'
                : confirmRemove
                  ? 'Confirm uninstall?'
                  : 'Uninstall'}
            </button>
          ) : target.registry ? (
            <Button
              variant="primary"
              disabled={busy !== null}
              onClick={() => onInstall(target.registry!)}
            >
              {busy === `install ${id}` ? 'Installing…' : 'Install'}
            </Button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
