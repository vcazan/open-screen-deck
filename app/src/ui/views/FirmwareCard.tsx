import { isTauri } from '../../transport/TauriSerialTransport';
import { Button } from '../components/Button';

interface FirmwareCardProps {
  deviceFw: string | null;
  usbConnected: boolean;
  bundled: string | null;
  flashing: boolean;
  onFlash: () => void;
}

function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false;
}

/** In-app firmware updater — the bundled binary flashes over USB, no tools. */
export function FirmwareCard({
  deviceFw,
  usbConnected,
  bundled,
  flashing,
  onFlash,
}: FirmwareCardProps) {
  if (!isTauri()) return null;

  const updateAvailable =
    bundled !== null && deviceFw !== null && versionNewer(bundled, deviceFw);

  return (
    <div className="settings-card">
      <h2>Firmware</h2>
      <ul className="settings-list">
        <li>
          <span>On this deck</span>
          <span className="badge">{usbConnected ? (deviceFw ?? '…') : 'not connected'}</span>
        </li>
        <li>
          <span>Bundled with the app</span>
          <span className="badge">{bundled ?? '—'}</span>
        </li>
      </ul>

      <div className="settings-obs-actions">
        <Button
          variant={updateAvailable ? 'primary' : 'ghost'}
          onClick={onFlash}
          disabled={!usbConnected || bundled === null || flashing}
        >
          {flashing
            ? 'Updating…'
            : updateAvailable
              ? `Update to ${bundled}`
              : 'Reflash firmware'}
        </Button>
        {updateAvailable && !flashing && (
          <span className="obs-status">A newer firmware ships with this app</span>
        )}
      </div>
      <p className="muted">
        The keys switch to BOOT / LOADER, then the bundled firmware writes over USB and the deck
        restarts. No Arduino IDE, no command line. If a flash is interrupted the app will offer
        one-click recovery.
      </p>
    </div>
  );
}
