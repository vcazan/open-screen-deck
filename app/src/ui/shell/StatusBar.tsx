import { useEffect, useRef, useState } from 'react';
import type { ConsoleEntry } from '../../hooks/useDevice';

interface ProtocolLogProps {
  entries: ConsoleEntry[];
  showTx: boolean;
  showRx: boolean;
  onClear: () => void;
  fullHeight?: boolean;
  className?: string;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

export function ProtocolLog({
  entries,
  showTx,
  showRx,
  onClear,
  fullHeight = false,
  className = '',
}: ProtocolLogProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [scrolledUp, setScrolledUp] = useState(false);

  const filtered = entries.filter(
    (e) => (e.direction === 'tx' && showTx) || (e.direction === 'rx' && showRx),
  );

  useEffect(() => {
    if (!scrolledUp && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [filtered.length, scrolledUp]);

  const handleScroll = () => {
    const el = logRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setScrolledUp(!atBottom);
  };

  const jumpToLatest = () => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
      setScrolledUp(false);
    }
  };

  return (
    <div className={`protocol-log ${fullHeight ? 'full' : ''} ${className}`.trim()}>
      <div className="protocol-log-toolbar">
        <div className="filter-chips">
          <span className={`filter-chip ${showTx ? 'on tx' : ''}`}>TX</span>
          <span className={`filter-chip ${showRx ? 'on rx' : ''}`}>RX</span>
        </div>
        <button type="button" className="log-clear-btn" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="protocol-log-scroll" ref={logRef} onScroll={handleScroll}>
        {filtered.map((entry) => (
          <div key={entry.id} className="console-line">
            <span className="console-time">{formatTime(entry.timestamp)}</span>
            <span className={entry.direction === 'tx' ? 'console-dir-tx' : 'console-dir-rx'}>
              {entry.direction === 'tx' ? 'TX' : 'RX'}
            </span>
            <span className="console-text">{entry.line}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="console-empty">No protocol traffic yet. Connect and configure a key.</p>
        )}
      </div>
      {scrolledUp && (
        <button type="button" className="jump-latest" onClick={jumpToLatest}>
          Jump to latest
        </button>
      )}
    </div>
  );
}

function TerminalIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  );
}

interface ConsoleDrawerProps {
  open: boolean;
  entries: ConsoleEntry[];
  showTx: boolean;
  showRx: boolean;
  onClear: () => void;
  onCollapse: () => void;
}

export function ConsoleDrawer({
  open,
  entries,
  showTx,
  showRx,
  onClear,
  onCollapse,
}: ConsoleDrawerProps) {
  const logRef = useRef<HTMLDivElement>(null);

  const filtered = entries.filter(
    (e) => (e.direction === 'tx' && showTx) || (e.direction === 'rx' && showRx),
  );
  const txCount = entries.filter((e) => e.direction === 'tx').length;
  const rxCount = entries.filter((e) => e.direction === 'rx').length;

  useEffect(() => {
    if (open && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [filtered.length, open]);

  return (
    <div className={`console-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="console-drawer-head">
        <div className="console-drawer-title">
          <TerminalIcon color="var(--accent)" />
          <span>Protocol Console</span>
          <span className="dir-chip tx">TX</span>
          <span className="dir-chip rx">RX</span>
        </div>
        <div className="console-drawer-tools">
          <span className="console-counts">
            TX {txCount} · RX {rxCount}
          </span>
          <button type="button" className="log-clear-btn" onClick={onClear}>
            Clear
          </button>
          <button
            type="button"
            className="console-collapse"
            onClick={onCollapse}
            aria-label="Collapse console"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>
      <div className="console-drawer-body" ref={logRef}>
        {filtered.map((entry) => (
          <div key={entry.id} className="console-line">
            <span className="console-time">{formatTime(entry.timestamp)}</span>
            <span className={entry.direction === 'tx' ? 'console-dir-tx' : 'console-dir-rx'}>
              {entry.direction === 'tx' ? 'TX' : 'RX'}
            </span>
            <span className="console-text">{entry.line}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="console-empty">No protocol traffic yet. Connect and configure a key.</div>
        )}
      </div>
    </div>
  );
}

interface StatusBarProps {
  connectionLabel: string;
  connected: boolean;
  deviceLabel: string;
  txCount: number;
  rxCount: number;
  consoleOpen: boolean;
  onToggleConsole: () => void;
}

export function StatusBar({
  connectionLabel,
  connected,
  deviceLabel,
  txCount,
  rxCount,
  consoleOpen,
  onToggleConsole,
}: StatusBarProps) {
  return (
    <footer className="status-bar">
      <div className="status-left">
        <span className={`status-dot ${connected ? 'connected' : ''}`} aria-hidden />
        <span className={`status-conn ${connected ? 'connected' : ''}`}>{connectionLabel}</span>
        <span className="status-sep">·</span>
        <span className="status-device">{deviceLabel}</span>
      </div>
      <div className="status-right">
        <span>
          TX {txCount} · RX {rxCount}
        </span>
        <button
          type="button"
          className={`status-console-toggle ${consoleOpen ? 'open' : ''}`}
          onClick={onToggleConsole}
          aria-expanded={consoleOpen}
        >
          <TerminalIcon size={13} />
          <span>Console</span>
          <span className="toggle-caret" aria-hidden>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </span>
        </button>
      </div>
    </footer>
  );
}
