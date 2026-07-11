import { useEffect, useState } from 'react';
import { obsClient, loadObsSettings, saveObsSettings } from '../../integrations/obs';
import { isTauri } from '../../transport/TauriSerialTransport';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { FirmwareCard } from './FirmwareCard';

interface SettingsViewProps {
  deviceFw?: string | null;
  usbConnected?: boolean;
}

export function SettingsView({ deviceFw = null, usbConnected = false }: SettingsViewProps) {
  const [obs, setObs] = useState(loadObsSettings);
  const [obsConnected, setObsConnected] = useState(obsClient.isConnected());
  const [obsScene, setObsScene] = useState<string | null>(obsClient.getCurrentScene());
  const [obsError, setObsError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [autostart, setAutostart] = useState(false);

  useEffect(() => {
    const unStatus = obsClient.onStatus(setObsConnected);
    const unScene = obsClient.onScene(setObsScene);
    return () => {
      unStatus();
      unScene();
    };
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    import('@tauri-apps/plugin-autostart')
      .then(({ isEnabled }) => isEnabled())
      .then(setAutostart)
      .catch(() => {});
  }, []);

  const handleObsConnect = async () => {
    setObsError(null);
    setConnecting(true);
    saveObsSettings(obs);
    try {
      await obsClient.connect(obs.url, obs.password);
    } catch (err) {
      setObsError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleObsDisconnect = () => {
    obsClient.disconnect();
  };

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
        <div className="settings-card">
          <h2>OBS Studio</h2>
          <p className="muted">
            Connect to obs-websocket (OBS → Tools → WebSocket Server Settings) to switch scenes
            from keys and show the live scene on the deck.
          </p>
          <div className="settings-obs-form">
            <Input
              label="WebSocket URL"
              value={obs.url}
              onChange={(e) => setObs({ ...obs, url: e.target.value })}
              placeholder="ws://127.0.0.1:4455"
            />
            <Input
              label="Password"
              type="password"
              value={obs.password}
              onChange={(e) => setObs({ ...obs, password: e.target.value })}
              placeholder="From OBS WebSocket settings"
            />
            <label className="sidebar-toggle">
              <input
                type="checkbox"
                className="custom-checkbox"
                checked={obs.autoConnect}
                onChange={(e) => {
                  const next = { ...obs, autoConnect: e.target.checked };
                  setObs(next);
                  saveObsSettings(next);
                }}
              />
              <span>Connect automatically on launch</span>
            </label>
            <div className="settings-obs-actions">
              {obsConnected ? (
                <>
                  <span className="obs-status ok">
                    <span className="status-dot connected" /> Connected
                    {obsScene ? ` · scene: ${obsScene}` : ''}
                  </span>
                  <Button variant="ghost" onClick={handleObsDisconnect}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button variant="primary" onClick={handleObsConnect} disabled={connecting}>
                  {connecting ? 'Connecting…' : 'Connect'}
                </Button>
              )}
            </div>
            {obsError && <div className="storage-error">{obsError}</div>}
          </div>
        </div>

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
