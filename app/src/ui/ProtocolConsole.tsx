import { useState } from 'react';
import type { ConsoleEntry } from '../hooks/useDevice';

interface ProtocolConsoleProps {
  entries: ConsoleEntry[];
  onClear: () => void;
}

export function ProtocolConsole({ entries, onClear }: ProtocolConsoleProps) {
  const [open, setOpen] = useState(false);

  const formatTime = (d: Date) => {
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className={`console-drawer ${open ? 'open' : ''}`}>
      <div className="console-header" onClick={() => setOpen(!open)}>
        <h3>Protocol console ({entries.length})</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {open && (
            <button
              className="btn btn-ghost"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
            >
              Clear
            </button>
          )}
          <span className="console-toggle">▼</span>
        </div>
      </div>
      <div className="console-body">
        <div className="console-log">
          {entries.map((entry) => (
            <div key={entry.id} className="console-line">
              <span className="console-time">{formatTime(entry.timestamp)}</span>
              <span className={entry.direction === 'tx' ? 'console-dir-tx' : 'console-dir-rx'}>
                {entry.direction === 'tx' ? 'TX' : 'RX'}
              </span>
              <span className="console-text">{entry.line}</span>
            </div>
          ))}
          {entries.length === 0 && (
            <div style={{ color: 'var(--text-muted)', padding: '8px 0' }}>
              No protocol traffic yet. Connect and configure a key to see lines here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
