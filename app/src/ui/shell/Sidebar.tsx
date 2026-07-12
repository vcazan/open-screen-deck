import { useEffect, useState } from 'react';
import type { ConnectionState } from '../../transport/types';
import { pluginHost } from '../../plugins/host';
import { isTauri } from '../../transport/TauriSerialTransport';
import type { AppView } from './types';

interface SidebarAction {
  label: string;
  kbd?: string;
  icon: 'save' | 'import' | 'reset' | 'export' | 'reload' | 'folder' | 'clear';
  onClick: () => void;
}

export interface SidebarActiveProfile {
  name: string;
  pages: number;
  updatedAt: string;
  hasMedia: boolean;
}

interface SidebarProps {
  activeView: AppView;
  transportMode: 'simulator' | 'webserial';
  connectionState: ConnectionState;
  webSerialSupported: boolean;
  fwVersion: string | null;
  miniKeyColors: string[];
  profileCount: number;
  /** The auto-saving profile, if one is active (Profiles sidebar) */
  activeProfile: SidebarActiveProfile | null;
  /** Media currently on the deck (Storage sidebar) */
  mediaStats: { icons: number; anims: number };
  showTxFilter: boolean;
  showRxFilter: boolean;
  onTxFilterChange: (v: boolean) => void;
  onRxFilterChange: (v: boolean) => void;
  onClearConsole: () => void;
  onModeChange: (mode: 'simulator' | 'webserial') => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSaveProfile: () => void;
  onLoadProfile: () => void;
  onImportProfiles: () => void;
  onExportAll: () => void;
  onResetDefaults: () => void;
  /** Check the registry and open the update prompt; resolves to update count */
  onCheckPluginUpdates: () => Promise<number>;
  micMuted?: boolean;
  /** Present only in simulator mode — manual host-state toggle for testing */
  onSimToggleMic?: () => void;
  orientation: number;
  onOrientChange: (orient: number) => void;
}

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function PluginsSidebar({
  onCheckPluginUpdates,
}: {
  onCheckPluginUpdates: () => Promise<number>;
}) {
  const [installed, setInstalled] = useState(pluginHost.listInstalled().length);
  const [actionCount, setActionCount] = useState(pluginHost.list().length);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);

  useEffect(
    () =>
      pluginHost.onChange(() => {
        setInstalled(pluginHost.listInstalled().length);
        setActionCount(pluginHost.list().length);
      }),
    [],
  );

  const checkUpdates = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const n = await onCheckPluginUpdates();
      setCheckResult(n === 0 ? 'Everything is up to date.' : null);
    } catch (err) {
      setCheckResult(`Registry unreachable — ${err instanceof Error ? err.message : err}`);
    } finally {
      setChecking(false);
    }
  };

  const openFolder = async () => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugins_open_dir').catch(() => {});
  };

  return (
    <aside className="sidebar">
      <div>
        <SectionTitle>INSTALLED</SectionTitle>
        <div className="side-card side-stat-grid">
          <div className="side-stat">
            <div className="lib-count">{installed}</div>
            <div className="lib-caption">plugins</div>
          </div>
          <div className="side-stat">
            <div className="lib-count">{actionCount}</div>
            <div className="lib-caption">key actions</div>
          </div>
        </div>
      </div>
      <div>
        <SectionTitle>ACTIONS</SectionTitle>
        <ActionList
          actions={
            isTauri()
              ? [
                  {
                    label: checking ? 'Checking updates…' : 'Check for updates',
                    icon: 'export',
                    onClick: () => void checkUpdates(),
                  },
                  {
                    label: 'Reload plugins',
                    icon: 'reload',
                    onClick: () => void pluginHost.reload(),
                  },
                  { label: 'Open plugin folder', icon: 'folder', onClick: () => void openFolder() },
                ]
              : []
          }
        />
        {checkResult && <p className="sidebar-note tight">{checkResult}</p>}
      </div>
      <div>
        <SectionTitle>PUBLISH</SectionTitle>
        <p className="sidebar-note">
          PR a plugin folder plus a registry entry into the GitHub repo and it appears in
          everyone's store on refresh. Click any plugin card for previews, defaults, and its
          changelog.
        </p>
      </div>
    </aside>
  );
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
    export: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
    reload: 'M21 12a9 9 0 11-2.6-6.4L21 8 M21 4v4h-4',
    folder: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
    clear: 'M3 6h18 M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2 M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6',
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
  activeProfile,
  mediaStats,
  showTxFilter,
  showRxFilter,
  onTxFilterChange,
  onRxFilterChange,
  onClearConsole,
  onModeChange,
  onConnect,
  onDisconnect,
  onSaveProfile,
  onLoadProfile,
  onImportProfiles,
  onExportAll,
  onResetDefaults,
  onCheckPluginUpdates,
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
        <div>
          <SectionTitle>ACTIONS</SectionTitle>
          <ActionList
            actions={[{ label: 'Clear console', icon: 'clear', onClick: onClearConsole }]}
          />
        </div>
      </aside>
    );
  }

  if (activeView === 'storage') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>ON THE DECK</SectionTitle>
          <div className="side-card side-stat-grid">
            <div className="side-stat">
              <div className="lib-count">{mediaStats.icons}</div>
              <div className="lib-caption">key icons</div>
            </div>
            <div className="side-stat">
              <div className="lib-count">{mediaStats.anims}</div>
              <div className="lib-caption">animated keys</div>
            </div>
          </div>
          <p className="sidebar-note">
            Media is written to the deck's microSD automatically when you drop images or
            animations on keys — it plays standalone, no app needed.
          </p>
        </div>
        <div>
          <SectionTitle>CARD LAYOUT</SectionTitle>
          <p className="sidebar-note mono-note">
            /osd/keys/N/icon.rgb565
            <br />
            /osd/keys/N/anim/0001.rgb565…
          </p>
        </div>
      </aside>
    );
  }

  if (activeView === 'plugins') {
    return <PluginsSidebar onCheckPluginUpdates={onCheckPluginUpdates} />;
  }

  if (activeView === 'settings') {
    return (
      <aside className="sidebar">
        <div>
          <SectionTitle>DEVICE</SectionTitle>
          <div className="side-card side-card-row">
            <span className="lib-badge">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                <rect x="7" y="3" width="10" height="18" rx="2" />
                <path d="M10 18h4" />
              </svg>
            </span>
            <div>
              <div className="lib-count">{fwVersion ?? '—'}</div>
              <div className="lib-caption">firmware on the deck</div>
            </div>
          </div>
          <p className="sidebar-note">
            Firmware updates, launch-at-login, and app updates live here. The OBS connection
            moved to the OBS Control plugin's settings on the Plugins page.
          </p>
        </div>
      </aside>
    );
  }

  if (activeView === 'profiles') {
    return (
      <aside className="sidebar">
        {activeProfile && (
          <div>
            <SectionTitle>ACTIVE</SectionTitle>
            <div className="side-card">
              <div className="side-active-name">
                <span className="profile-active-dot" aria-hidden />
                {activeProfile.name}
              </div>
              <div className="side-active-meta">
                {activeProfile.pages} {activeProfile.pages === 1 ? 'page' : 'pages'}
                {activeProfile.hasMedia ? ' · media' : ''} · saved {timeAgo(activeProfile.updatedAt)}
              </div>
              <p className="sidebar-note tight">
                Deck edits auto-save into this profile.
              </p>
            </div>
          </div>
        )}
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
          <ActionList
            actions={[
              { label: 'New from current deck', icon: 'save', onClick: onSaveProfile },
              { label: 'Import profile file', icon: 'import', onClick: onImportProfiles },
              { label: 'Export all', icon: 'export', onClick: onExportAll },
            ]}
          />
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
