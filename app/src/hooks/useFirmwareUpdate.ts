import { useCallback, useEffect, useRef, useState } from 'react';
import { isTauri } from '../transport/TauriSerialTransport';

export type FlashState =
  | { phase: 'idle' }
  | { phase: 'flashing'; stage: string; percent: number }
  | { phase: 'done' }
  | { phase: 'error'; message: string };

interface UseFirmwareUpdateArgs {
  usbConnected: boolean;
  /** Paint the six keys before the MCU reboots into the ROM bootloader. */
  paintBanner?: () => Promise<void>;
}

export function useFirmwareUpdate({ usbConnected, paintBanner }: UseFirmwareUpdateArgs) {
  const [bundled, setBundled] = useState<string | null>(null);
  const [flash, setFlash] = useState<FlashState>({ phase: 'idle' });
  const [bootloaderPort, setBootloaderPort] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const paintRef = useRef(paintBanner);
  paintRef.current = paintBanner;

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
        if (stage === 'done' || stage === 'failed') return;
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
    const timer = setInterval(scan, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [usbConnected]);

  const [quietUntil, setQuietUntil] = useState(0);

  const recoverDeck = useCallback(async () => {
    if (!bootloaderPort) return;
    setRecovering(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('deck_recover', { port: bootloaderPort });
      setBootloaderPort(null);
      setFlash({ phase: 'idle' });
    } catch (err) {
      setFlash({ phase: 'error', message: `Recovery failed: ${String(err)}` });
    } finally {
      setRecovering(false);
    }
  }, [bootloaderPort]);

  const startFlash = useCallback(async () => {
    setFlash({ phase: 'flashing', stage: 'Preparing the deck', percent: 0 });
    try {
      await paintRef.current?.().catch(() => {});
      const { invoke } = await import('@tauri-apps/api/core');
      const port = (await invoke('serial_is_open')) as string | null;
      if (!port) {
        setFlash({ phase: 'error', message: 'No deck connected over USB.' });
        return;
      }
      await invoke('flash_firmware', { port });
      setFlash({ phase: 'done' });
      setQuietUntil(Date.now() + 12_000);
    } catch (err) {
      setFlash({ phase: 'error', message: String(err) });
    }
  }, []);

  const dismiss = useCallback(() => {
    setFlash({ phase: 'idle' });
  }, []);

  const stuckInBootloader =
    Boolean(bootloaderPort) &&
    !usbConnected &&
    flash.phase !== 'flashing' &&
    flash.phase !== 'done' &&
    Date.now() > quietUntil;

  return {
    bundled,
    flash,
    bootloaderPort,
    stuckInBootloader,
    recovering,
    startFlash,
    recoverDeck,
    dismiss,
  };
}
