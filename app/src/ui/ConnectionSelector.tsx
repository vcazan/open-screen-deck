import { useState } from 'react';
import type { ConnectionState } from '../transport/types';

interface ConnectionSelectorProps {
  mode: 'simulator' | 'webserial';
  onModeChange: (mode: 'simulator' | 'webserial') => void;
  connectionState: ConnectionState;
  onConnect: () => void;
  onDisconnect: () => void;
  webSerialSupported: boolean;
}

export function ConnectionSelector({
  mode,
  onModeChange,
  connectionState,
  onConnect,
  onDisconnect,
  webSerialSupported,
}: ConnectionSelectorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const stateLabel =
    connectionState === 'connected'
      ? 'Connected'
      : connectionState === 'connecting'
        ? 'Connecting'
        : connectionState === 'error'
          ? 'Error'
          : 'Disconnected';

  return (
    <div className="connection-bar">
      <div className="connection-tabs">
        <button
          className={`connection-tab ${mode === 'simulator' ? 'active' : ''}`}
          onClick={() => onModeChange('simulator')}
        >
          Simulator
        </button>
        <span
          className="tooltip-wrap"
          onMouseEnter={() => !webSerialSupported && setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <button
            className={`connection-tab ${mode === 'webserial' ? 'active' : ''}`}
            onClick={() => webSerialSupported && onModeChange('webserial')}
            disabled={!webSerialSupported}
          >
            USB device
          </button>
          {!webSerialSupported && showTooltip && (
            <span className="tooltip">Web Serial requires Chrome or Edge</span>
          )}
        </span>
      </div>

      <span className={`status-pill ${connectionState}`}>
        <span className="status-dot" />
        {stateLabel}
      </span>

      {mode === 'webserial' && (
        connectionState === 'connected' ? (
          <button className="btn btn-ghost" onClick={onDisconnect}>
            Disconnect
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={onConnect}
            disabled={connectionState === 'connecting' || !webSerialSupported}
          >
            Connect
          </button>
        )
      )}
    </div>
  );
}
