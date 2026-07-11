import { useEffect, useState } from 'react';
import { isTauri } from '../../transport/TauriSerialTransport';
import { Button } from '../components/Button';

interface FirmwareCardProps {
  /** Firmware version reported by the connected deck (INFO), if any */
  deviceFw: string | null;
  usbConnected: boolean;
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

type FlashState =
  | { phase: 'idle' }
  | { phase: 'flashing'; stage: string; percent: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

/** In-app firmware updater — the bundled binary flashes over USB, no tools. */
export function FirmwareCard({ deviceFw, usbConnected }: FirmwareCardProps) {
  const [bundled, setBundled] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>({ phase: 'idle' });
  const [bootloaderPort, setBootloaderPort] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);

  // A deck stuck in its ROM bootloader looks like a missing deck — watch
  // for its telltale port and offer one-click recovery.
  useEffect(() => {
    if (!isTauri() || usbConnected) {
      setBootloaderPort(null);
      return;
    }
    let cancelled = false;
    const scan = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const ports = (await invoke('serial_list')) as {
          path: string;
          vid: number | null;
          product: string | null;
        }[];
        const boot = ports.find(
          (p) => p.vid === 0x303a && p.product?.toLowerCase().includes('jtag'),
        );
        if (!cancelled) setBootloaderPort(boot?.path ?? null);
      } catch {
        if (!cancelled) setBootloaderPort(null);
      }
    };
    void scan();
    const timer = setInterval(scan, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [usbConnected]);

  const recoverDeck = async () => {
    if (!bootloaderPort) return;
    setRecovering(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('deck_recover', { port: bootloaderPort });
      setBootloaderPort(null);
    } catch (err) {
      setFlash({ phase: 'error', message: `Recovery failed: ${String(err)}` });
    } finally {
      setRecovering(false);
    }
  };

  useEffect(() => {
    if (!isTauri()) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('bundled_firmware_version'))
      .then((v) => setBundled(v as string))
      .catch(() => setBundled(null));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import('@tauri-apps/api/event').then(({ listen }) =>
      listen('flash-progress', (e) => {
        const { stage, percent } = e.payload as { stage: string; percent: number };
        if (stage === 'done' || stage === 'failed') return; // final state set by invoke result
        setFlash({ phase: 'flashing', stage, percent });
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const startFlash = async () => {
    setFlash({ phase: 'flashing', stage: 'preparing', percent: 0 });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const port = (await invoke('serial_is_open')) as string | null;
      if (!port) {
        setFlash({ phase: 'error', message: 'No deck connected over USB.' });
        return;
      }
      await invoke('flash_firmware', { port });
      setFlash({ phase: 'done' });
    } catch (err) {
      setFlash({ phase: 'error', message: String(err) });
    }
  };

  if (!isTauri()) return null;

  const updateAvailable =
    bundled !== null && deviceFw !== null && versionNewer(bundled, deviceFw);

  return (
    <div className="settings-card">
      <h2>Firmware</h2>
      {bootloaderPort && !usbConnected && (
        <div className="fw-recover">
          <div>
            <strong>Deck stuck in bootloader mode.</strong> It's waiting for a flash that
            never finished — one click resets it back into its firmware.
          </div>
          <Button variant="primary" onClick={recoverDeck} disabled={recovering}>
            {recovering ? 'Recovering…' : 'Recover deck'}
          </Button>
        </div>
      )}
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

      {flash.phase === 'flashing' ? (
        <div className="fw-flash-progress">
          <div className="fw-flash-stage">{flash.stage}</div>
          <div className="progress-bar">
            <span className="progress-fill" style={{ width: `${flash.percent}%` }} />
          </div>
          <p className="muted">Don't unplug the deck — this takes about 30 seconds.</p>
        </div>
      ) : flash.phase === 'done' ? (
        <p className="fw-flash-ok">
          Firmware updated. The deck restarts by itself and reconnects in a few seconds.
        </p>
      ) : (
        <>
          {flash.phase === 'error' && <div className="storage-error">{flash.message}</div>}
          <div className="settings-obs-actions">
            <Button
              variant={updateAvailable ? 'primary' : 'ghost'}
              onClick={startFlash}
              disabled={!usbConnected || bundled === null}
            >
              {updateAvailable ? `Update to ${bundled}` : 'Reflash firmware'}
            </Button>
            {updateAvailable && (
              <span className="obs-status">A newer firmware ships with this app</span>
            )}
          </div>
          <p className="muted">
            One click: the deck reboots into its bootloader, the bundled firmware flashes over
            USB, and it restarts. No Arduino IDE, no command line. If a flash is interrupted,
            hold BOOT while plugging in and try again.
          </p>
        </>
      )}
    </div>
  );
}
