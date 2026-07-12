import { useEffect, useState } from 'react';
import { isTauri } from '../../transport/TauriSerialTransport';
import { Button } from '../components/Button';
import { FirmwareCard } from './FirmwareCard';

interface SettingsViewProps {
  deviceFw?: string | null;
  usbConnected?: boolean;
}

export function SettingsView({ deviceFw = null, usbConnected = false }: SettingsViewProps) {
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    import('@tauri-apps/plugin-autostart')
      .then(({ isEnabled }) => isEnabled())
      .then(setAutostart)
      .catch(() => {});
  }, []);

  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  const handleCheckUpdates = async () => {
    setUpdateStatus('Checking…');
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setUpdateStatus('You’re on the latest version.');
        return;
      }
      setUpdateStatus(`Downloading ${update.version}…`);
      await update.downloadAndInstall();
      setUpdateStatus('Update installed — restart the app to finish.');
    } catch (err) {
      setUpdateStatus(`Update check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAutostartToggle = async (enabled: boolean) => {
    setAutostart(enabled);
    try {
      const { enable, disable } = await import('@tauri-apps/plugin-autostart');
      if (enabled) await enable();
      else await disable();
    } catch {
      setAutostart(!enabled);
    }
  };

  return (
    <div className="settings-view">
      <div className="settings-stack">
        <FirmwareCard deviceFw={deviceFw} usbConnected={usbConnected} />

        <div className="settings-card">
          <h2>Companion</h2>
          {isTauri() ? (
            <ul className="settings-list">
              <li>
                <span>Launch at login</span>
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={autostart}
                  onChange={(e) => handleAutostartToggle(e.target.checked)}
                  aria-label="Launch at login"
                />
              </li>
              <li>
                <span>Runs in the tray</span>
                <span className="badge">Close hides the window</span>
              </li>
              <li>
                <span>App updates</span>
                <Button variant="ghost" onClick={handleCheckUpdates}>
                  Check for updates
                </Button>
              </li>
              {updateStatus && (
                <li>
                  <span className="muted">{updateStatus}</span>
                </li>
              )}
            </ul>
          ) : (
            <p className="muted">
              You're running the browser build. Launch apps, hotkeys, and live mic status need
              the desktop companion app — actions dry-run to the console here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
