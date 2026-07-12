/**
 * Plugin update prompt — appears when the registry has newer versions of
 * installed plugins. Nothing installs without a yes: the prompt shows each
 * plugin's icon, the version jump, and its release notes, then waits.
 * "Later" snoozes until a *newer* version shows up (no per-launch nagging).
 */

import { useEffect, useState } from 'react';
import {
  fetchRegistryIcon,
  pluginHost,
  type PluginUpdate,
} from '../../plugins/host';
import { Button } from './Button';

export const UPDATE_DISMISS_KEY = 'osd-plugin-updates-dismissed';

/** Stable signature of an update set — used to remember a dismissal. */
export function updateSignature(updates: PluginUpdate[]): string {
  return updates
    .map((u) => `${u.entry.id}@${u.entry.version}`)
    .sort()
    .join(',');
}

interface PluginUpdatePromptProps {
  updates: PluginUpdate[];
  onClose: () => void;
}

export function PluginUpdatePrompt({ updates, onClose }: PluginUpdatePromptProps) {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<'ask' | 'installing' | 'done'>('ask');
  const [progress, setProgress] = useState('');
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    for (const u of updates) {
      void fetchRegistryIcon(u.entry).then((icon) => {
        if (icon) setIcons((prev) => ({ ...prev, [u.entry.id]: icon }));
      });
    }
  }, [updates]);

  const dismiss = () => {
    localStorage.setItem(UPDATE_DISMISS_KEY, updateSignature(updates));
    onClose();
  };

  const updateAll = async () => {
    setPhase('installing');
    setFailed(null);
    try {
      for (let i = 0; i < updates.length; i++) {
        setProgress(`${updates[i].entry.name} (${i + 1}/${updates.length})`);
        await pluginHost.install(updates[i].entry);
      }
      localStorage.removeItem(UPDATE_DISMISS_KEY);
      setPhase('done');
      setTimeout(onClose, 1600);
    } catch (err) {
      setFailed(err instanceof Error ? err.message : String(err));
      setPhase('ask');
    }
  };

  return (
    <div className="plugin-update-backdrop" role="dialog" aria-modal="true" aria-label="Plugin updates">
      <div className="plugin-update-card">
        {phase === 'done' ? (
          <div className="plugin-update-done">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" opacity="0.25" />
              <path d="M8 12.5l2.6 2.6L16 9.5" />
            </svg>
            <span>
              {updates.length === 1 ? 'Plugin updated' : `${updates.length} plugins updated`}
            </span>
          </div>
        ) : (
          <>
            <header className="plugin-update-head">
              <h2>
                {updates.length === 1
                  ? 'Plugin update available'
                  : `${updates.length} plugin updates available`}
              </h2>
              <button
                type="button"
                className="plugin-update-close"
                onClick={dismiss}
                disabled={phase === 'installing'}
                aria-label="Not now"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            <div className="plugin-update-list">
              {updates.map((u) => (
                <div key={u.entry.id} className="plugin-update-row">
                  {icons[u.entry.id] ? (
                    <img src={icons[u.entry.id]} alt="" draggable={false} />
                  ) : (
                    <span className="plugin-update-icon-slot" aria-hidden />
                  )}
                  <div className="plugin-update-info">
                    <div className="plugin-update-title">
                      <span className="plugin-update-name">{u.entry.name}</span>
                      <span className="plugin-update-versions">
                        v{u.installed.version}
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                        v{u.entry.version}
                      </span>
                    </div>
                    {u.notes.length > 0 ? (
                      <ul className="plugin-update-notes">
                        {u.notes.map((n) => (
                          <li key={n.version}>
                            <span className="plugin-update-note-version">v{n.version}</span>
                            {n.note}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="plugin-update-notes-empty">No release notes.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {failed && <p className="plugin-update-error">Update failed — {failed}</p>}

            <footer className="plugin-update-actions">
              <Button variant="ghost" onClick={dismiss} disabled={phase === 'installing'}>
                Later
              </Button>
              <Button variant="primary" onClick={() => void updateAll()} disabled={phase === 'installing'}>
                {phase === 'installing'
                  ? `Updating ${progress}…`
                  : updates.length === 1
                    ? 'Update'
                    : 'Update all'}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
