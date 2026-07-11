import { useEffect, useRef, useState } from 'react';
import { isTauri } from '../../transport/TauriSerialTransport';

interface HotkeyInputProps {
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}

/** Map a KeyboardEvent to the executor's key vocabulary (see actions.rs). */
export function mainKeyName(e: Pick<KeyboardEvent, 'code'>): string | null {
  const { code } = e;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();

  const named: Record<string, string> = {
    Space: 'space',
    Enter: 'enter',
    NumpadEnter: 'enter',
    Tab: 'tab',
    Backspace: 'backspace',
    Delete: 'delete',
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    Home: 'home',
    End: 'end',
    PageUp: 'pageup',
    PageDown: 'pagedown',
    Minus: '-',
    Equal: '=',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Backquote: '`',
  };
  return named[code] ?? null;
}

/**
 * Hotkey chord field with a recorder.
 *
 * In the desktop companion, recording arms a native system-wide event grab:
 * the pressed combo is captured AND swallowed, so shortcuts that are already
 * bound (screenshots, Spotlight, app hotkeys) don't fire while you record.
 * The browser build falls back to DOM capture, which cannot suppress
 * OS-level shortcuts.
 */
export function HotkeyInput({ value, onChange, compact = false }: HotkeyInputProps) {
  const [recording, setRecording] = useState(false);
  const [nativeGrab, setNativeGrab] = useState(false);
  const unlistenersRef = useRef<(() => void)[]>([]);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stopNative = async (cancel: boolean) => {
    unlistenersRef.current.forEach((fn) => fn());
    unlistenersRef.current = [];
    setNativeGrab(false);
    if (cancel && isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('hotkey_record_cancel');
      } catch {
        // Backend gone — nothing to cancel
      }
    }
  };

  const startNative = async (): Promise<boolean> => {
    try {
      const [{ invoke }, { listen }] = await Promise.all([
        import('@tauri-apps/api/core'),
        import('@tauri-apps/api/event'),
      ]);
      unlistenersRef.current = await Promise.all([
        listen('hotkey-recorded', (e) => {
          onChangeRef.current((e.payload as { chord: string }).chord);
          setRecording(false);
          void stopNative(false);
        }),
        listen('hotkey-record-cancelled', () => {
          setRecording(false);
          void stopNative(false);
        }),
        listen('hotkey-record-error', () => {
          // No Accessibility permission — DOM fallback keeps working
          setNativeGrab(false);
        }),
      ]);
      await invoke('hotkey_record_start');
      setNativeGrab(true);
      return true;
    } catch {
      return false;
    }
  };

  const toggleRecording = () => {
    if (recording) {
      setRecording(false);
      void stopNative(true);
      return;
    }
    setRecording(true);
    if (isTauri()) void startNative();
  };

  // DOM fallback (browser build, or desktop without Accessibility): only
  // fires when the native grab isn't swallowing events.
  useEffect(() => {
    if (!recording || nativeGrab) return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setRecording(false);
        void stopNative(true);
        return;
      }

      const main = mainKeyName(e);
      if (!main) return; // modifier-only press — keep listening

      const mods: string[] = [];
      if (e.metaKey) mods.push('cmd');
      if (e.ctrlKey) mods.push('ctrl');
      if (e.altKey) mods.push('alt');
      if (e.shiftKey) mods.push('shift');

      onChangeRef.current([...mods, main].join('+'));
      setRecording(false);
      void stopNative(true);
    };

    const cancelOnBlur = () => {
      setRecording(false);
      void stopNative(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', cancelOnBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', cancelOnBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, nativeGrab]);

  // Unmount safety: never leave a system-wide grab armed
  useEffect(
    () => () => {
      void stopNative(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className={`hotkey-input-row ${compact ? 'compact' : ''}`}>
      <input
        className={compact ? 'macro-step-param' : 'field-input'}
        value={recording ? '' : value}
        placeholder={recording ? 'Press keys… (Esc cancels)' : 'cmd+shift+m'}
        onChange={(e) => onChange(e.target.value)}
        readOnly={recording}
        aria-label="Hotkey chord"
      />
      <button
        type="button"
        className={`hotkey-record-btn ${recording ? 'recording' : ''}`}
        onClick={toggleRecording}
        title={recording ? 'Cancel recording' : 'Record a key combo'}
        aria-pressed={recording}
      >
        <span className="hotkey-record-dot" aria-hidden />
        {recording ? 'Listening' : 'Record'}
      </button>
    </div>
  );
}
