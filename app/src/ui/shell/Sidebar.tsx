import type { ConnectionState } from '../../transport/types';
import type { AppView } from './types';

interface SidebarAction {
  label: string;
  kbd?: string;
  icon: 'save' | 'import' | 'reset';
  onClick: () => void;
}

interface SidebarProps {
  activeView: AppView;
  transportMode: 'simulator' | 'webserial';
  connectionState: ConnectionState;
  webSerialSupported: boolean;
  fwVersion: string | null;
  miniKeyColors: string[];
  profileCount: number;
  showTxFilter: boolean;
  showRxFilter: boolean;
  onTxFilterChange: (v: boolean) => void;
  onRxFilterChange: (v: boolean) => void;
  onModeChange: (mode: 'simulator' | 'webserial') => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSaveProfile: () => void;
  onLoadProfile: () => void;
  onResetDefaults: () => void;
  micMuted?: boolean;
  /** Present only in simulator mode — manual host-state toggle for testing */
  onSimToggleMic?: () => void;
  orientation: number;
  onOrientChange: (orient: number) => void;
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="side-title">
      <span>{children}</span>
      <span className="side-title-rule" />
    </div>
  );
}

function ActionIcon({ name }: { name: SidebarAction['icon'] }) {
  const paths: Record<SidebarAction['icon'], string> = {
    save: 'M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z M17 21v-8H7v8 M7 3v5h8',
    import: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M7 10l5 5 5-5 M12 15V3',
    reset: 'M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8 M3 4v4h4',
  };
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}

function ActionList({ actions }: { actions: SidebarAction[] }) {
  return (
    <div className="side-actions">
      {actions.map((a) => (
        <button key={a.label} type="button" className="qa-row" onClick={a.onClick}>
          <span className="qa-icon">
            <ActionIcon name={a.icon} />
          </span>
          <span className="qa-label">{a.label}</span>
          {a.kbd && <span className="qa-kbd">{a.kbd}</span>}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({
  activeView,
  transportMode,
  connectionState,
  webSerialSupported,
  fwVersion,
  miniKeyColors,
  profileCount,
  showTxFilter,
  showRxFilter,
  onTxFilterChange,
  onRxFilterChange,
  onModeChange,
  onConnect,
  onDisconnect,
  onSaveProfile,
  onLoadProfile,
  onResetDefaults,
  micMuted = false,
  onSimToggleMic,
  orientation,
  onOrientChange,
}: SidebarProps) {
  const connected = connectionState === 'connected';
  const isSim = transportMode === 'simulator';

  const actions: SidebarAction[] = [
    { label: 'New profile', icon: 'save', onClick: onSaveProfile },
    { label: 'Load from file', icon: 'import', onClick: onLoadProfile },
    { label: 'Reset deck', icon: 'reset', onClick: onResetDefaults },
  ];

  if (activeView === 'console') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>FILTERS</SectionTitle>
          <label className="sidebar-toggle">
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={showTxFilter}
              onChange={(e) => onTxFilterChange(e.target.checked)}
            />
            <span>TX (host → device)</span>
          </label>
          <label className="sidebar-toggle">
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={showRxFilter}
              onChange={(e) => onRxFilterChange(e.target.checked)}
            />
            <span>RX (device → host)</span>
          </label>
          <p className="sidebar-note">
            Filter protocol traffic in the console view and status bar drawer.
          </p>
        </div>
      </aside>
    );
  }

  if (activeView === 'storage') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>SD CARD</SectionTitle>
          <p className="sidebar-note">
            Browse what the deck has stored — key icons and animation frames. Files are written
            automatically when you upload media to a key.
          </p>
        </div>
        <div>
          <SectionTitle>LAYOUT</SectionTitle>
          <p className="sidebar-note">
            /osd/keys/N/icon.rgb565 — key icon
            <br />
            /osd/keys/N/anim/*.rgb565 — animation frames
          </p>
        </div>
      </aside>
    );
  }

  if (activeView === 'plugins') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>PLUGINS</SectionTitle>
          <p className="sidebar-note">
            Plugins contribute new action types to your keys — install from the store, or
            scaffold your own in the Developer section and iterate with hot reload.
          </p>
        </div>
        <div>
          <SectionTitle>PUBLISH</SectionTitle>
          <p className="sidebar-note">
            PR a plugin folder plus a registry entry into the GitHub repo and it appears in
            everyone's store on refresh.
          </p>
        </div>
      </aside>
    );
  }

  if (activeView === 'settings') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>SETTINGS</SectionTitle>
          <p className="sidebar-note">
            Application preferences. Firmware update, auto-launch and theme are coming soon.
          </p>
        </div>
      </aside>
    );
  }

  if (activeView === 'profiles') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>LIBRARY</SectionTitle>
          <div className="side-card side-card-row">
            <span className="lib-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
                <path d="M4 12l8 4.5L20 12" />
              </svg>
            </span>
            <div>
              <div className="lib-count">{profileCount}</div>
              <div className="lib-caption">profiles saved locally</div>
            </div>
          </div>
        </div>
        <div>
          <SectionTitle>ACTIONS</SectionTitle>
          <ActionList actions={actions} />
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div>
        <SectionTitle>DEVICE</SectionTitle>
        <div className="side-card device-card">
          <div className="device-card-head">
            <div className="device-mini">
              <div className="device-mini-grid">
                {miniKeyColors.map((c, i) => (
                  <span key={i} style={{ background: c }} />
                ))}
              </div>
            </div>
            <div className="device-card-id">
              <div className="device-card-name">Open Screen Deck</div>
              <div className="device-card-meta">
                6 keys{fwVersion ? ` · fw ${fwVersion}` : ''}
              </div>
            </div>
          </div>
          <div className="device-card-status">
            <div className="device-status-left">
              <span className="signal-bars" aria-hidden>
                <span className={connected ? 'on' : ''} style={{ height: 5 }} />
                <span className={connected ? 'on' : ''} style={{ height: 8 }} />
                <span className={connected ? 'on' : ''} style={{ height: 11 }} />
                <span className={connected ? 'on' : ''} style={{ height: 13 }} />
              </span>
              <span className={`device-status-label ${connected ? 'ok' : 'warn'}`}>
                {connected ? 'Connected' : isSim ? 'Connecting…' : 'Awaiting device'}
              </span>
            </div>
            <span className="device-latency">{connected ? (isSim ? '2 ms' : 'USB') : '—'}</span>
          </div>
          <div className="device-seg">
            <button
              type="button"
              className={`device-seg-btn ${isSim ? 'active' : ''}`}
              onClick={() => onModeChange('simulator')}
            >
              Simulator
            </button>
            <button
              type="button"
              className={`device-seg-btn ${!isSim ? 'active' : ''}`}
              onClick={() => webSerialSupported && onModeChange('webserial')}
              disabled={!webSerialSupported}
              title={webSerialSupported ? undefined : 'Web Serial requires Chrome or Edge'}
            >
              USB
            </button>
          </div>
          {!isSim && webSerialSupported && (
            <button
              type="button"
              className="device-connect-btn"
              onClick={connected ? onDisconnect : onConnect}
              disabled={connectionState === 'connecting'}
            >
              {connected ? 'Disconnect' : 'Connect USB'}
            </button>
          )}
          <div className="orient-row">
            <span className="orient-label">Orientation</span>
            <div className="orient-btns">
              {[
                { o: 0, title: 'Portrait', rotate: 0 },
                { o: 1, title: 'Landscape (rotated right)', rotate: 90 },
                { o: 2, title: 'Portrait, upside down', rotate: 180 },
                { o: 3, title: 'Landscape (rotated left)', rotate: 270 },
              ].map(({ o, title, rotate }) => (
                <button
                  key={o}
                  type="button"
                  className={`orient-btn ${orientation === o ? 'active' : ''}`}
                  title={title}
                  aria-label={title}
                  onClick={() => onOrientChange(o)}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    style={{ transform: `rotate(${rotate}deg)` }}
                    aria-hidden
                  >
                    <rect x="7" y="3" width="10" height="18" rx="2" />
                    <path d="M10 18h4" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>ACTIONS</SectionTitle>
        <ActionList actions={actions} />
      </div>

      {onSimToggleMic && (
        <div>
          <SectionTitle>HOST STATE (SIM)</SectionTitle>
          <label className="sidebar-toggle">
            <input
              type="checkbox"
              className="custom-checkbox"
              checked={micMuted}
              onChange={onSimToggleMic}
            />
            <span>Mic muted</span>
          </label>
          <p className="sidebar-note">
            Simulates the system microphone so mic-status keys can be tested without the
            companion app.
          </p>
        </div>
      )}
    </aside>
  );
}
