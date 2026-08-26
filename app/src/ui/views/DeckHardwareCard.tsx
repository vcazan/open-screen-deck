import { useEffect, useState } from 'react';
import { encodeCommand } from '../../protocol/codec';
import type { InfoEvent, SelftestEvent } from '../../protocol/types';
import { Button } from '../components/Button';

interface DeckHardwareCardProps {
  /** Latest INFO event from the deck (null until connected). */
  info: InfoEvent | null;
  /** Most recent SELFTEST result, if one has run. */
  selftest: SelftestEvent | null;
  sendCommand: (line: string) => void;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/**
 * Rev E hardware controls — glow LEDs, backlight/auto-dim, haptics, piezo,
 * and the SELFTEST diagnostic. Only rendered when the connected deck reports
 * LED-capable hardware (proto 14+).
 */
export function DeckHardwareCard({ info, selftest, sendCommand }: DeckHardwareCardProps) {
  const [autoDim, setAutoDim] = useState(info?.autodim ?? true);
  const [brightness, setBrightness] = useState(info?.bright ?? 255);
  const [clickBeep, setClickBeep] = useState(info?.clickbeep ?? false);
  const [ledHex, setLedHex] = useState('#3a86ff');
  const [ledsActive, setLedsActive] = useState(false);
  const [selftestPending, setSelftestPending] = useState(false);

  // Follow the device whenever it re-announces itself
  useEffect(() => {
    if (!info) return;
    if (info.autodim !== undefined) setAutoDim(info.autodim);
    if (info.bright !== undefined) setBrightness(info.bright);
    if (info.clickbeep !== undefined) setClickBeep(info.clickbeep);
  }, [info]);

  useEffect(() => {
    if (selftest) setSelftestPending(false);
  }, [selftest]);

  if (!info?.leds) return null;

  const handleAutoDim = (on: boolean) => {
    setAutoDim(on);
    sendCommand(encodeCommand({ type: 'AUTODIM', on }));
  };

  const handleBrightness = (level: number) => {
    setBrightness(level);
    setAutoDim(false); // SET_BRIGHT takes manual control on the firmware side
    sendCommand(encodeCommand({ type: 'SET_BRIGHT', level }));
  };

  const handleGlow = () => {
    const { r, g, b } = hexToRgb(ledHex);
    setLedsActive(true);
    sendCommand(encodeCommand({ type: 'SET_LED', index: -1, r, g, b }));
  };

  const handleGlowOff = () => {
    setLedsActive(false);
    sendCommand(encodeCommand({ type: 'LED_CLEAR' }));
  };

  const handleSelftest = () => {
    setSelftestPending(true);
    sendCommand(encodeCommand({ type: 'SELFTEST' }));
  };

  const lux = info.lux !== undefined && info.lux >= 0 ? info.lux : null;

  return (
    <div className="settings-card">
      <h2>Deck hardware</h2>
      <ul className="settings-list">
        <li>
          <span>Sensors</span>
          <span className="hw-badges">
            <span className={`badge ${info.imu ? 'ok' : 'off'}`}>IMU</span>
            <span className={`badge ${info.als ? 'ok' : 'off'}`}>
              Light{lux !== null ? ` · ${Math.round(lux)} lx` : ''}
            </span>
            <span className={`badge ${info.haptic ? 'ok' : 'off'}`}>Haptics</span>
          </span>
        </li>
        <li>
          <span>Auto-dim to room light</span>
          <input
            type="checkbox"
            className="custom-checkbox"
            checked={autoDim}
            onChange={(e) => handleAutoDim(e.target.checked)}
            aria-label="Auto-dim backlight"
          />
        </li>
        <li>
          <span>Backlight</span>
          <span className="hw-slider">
            <input
              type="range"
              min={8}
              max={255}
              value={brightness}
              disabled={autoDim}
              onChange={(e) => handleBrightness(parseInt(e.target.value, 10))}
              aria-label="Backlight brightness"
            />
            <span className={`muted hw-slider-value${autoDim ? ' dimmed' : ''}`}>
              {autoDim ? 'auto' : Math.round((brightness / 255) * 100) + '%'}
            </span>
          </span>
        </li>
        <li>
          <span>Glow LEDs</span>
          <span className="hw-badges">
            <input
              type="color"
              className="hw-color"
              value={ledHex}
              onChange={(e) => setLedHex(e.target.value)}
              aria-label="LED color"
            />
            <Button variant="ghost" onClick={handleGlow}>
              Glow
            </Button>
            <Button variant="ghost" onClick={handleGlowOff} disabled={!ledsActive}>
              Reset
            </Button>
          </span>
        </li>
        <li>
          <span>Beep on key press</span>
          <input
            type="checkbox"
            className="custom-checkbox"
            checked={clickBeep}
            onChange={(e) => {
              const on = e.target.checked;
              setClickBeep(on);
              sendCommand(encodeCommand({ type: 'CLICK_BEEP', on }));
            }}
            aria-label="Beep on key press"
          />
        </li>
        <li>
          <span>Feedback</span>
          <span className="hw-badges">
            <Button
              variant="ghost"
              disabled={!info.haptic}
              onClick={() => sendCommand(encodeCommand({ type: 'HAPTIC' }))}
            >
              Tick
            </Button>
            <Button
              variant="ghost"
              onClick={() => sendCommand(encodeCommand({ type: 'BEEP', freq: 2200, ms: 80 }))}
            >
              Beep
            </Button>
          </span>
        </li>
        <li>
          <span>Diagnostics</span>
          <Button variant="ghost" onClick={handleSelftest} disabled={selftestPending}>
            {selftestPending ? 'Running…' : 'Run self-test'}
          </Button>
        </li>
        {selftest && (
          <li>
            <span className="muted hw-selftest">
              {selftest.panels} panels · SD {selftest.sd ? 'ok' : '—'} · IMU{' '}
              {selftest.imu ? 'ok' : '—'} · light {selftest.als ? 'ok' : '—'}
              {selftest.als && selftest.lux >= 0 ? ` (${Math.round(selftest.lux)} lx)` : ''} ·
              haptics {selftest.haptic ? 'ok' : '—'} · PSRAM{' '}
              {Math.round(selftest.psram / (1024 * 1024))} MB
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
