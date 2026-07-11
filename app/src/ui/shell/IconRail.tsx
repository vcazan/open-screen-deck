import { useRef } from 'react';
import { Tooltip } from '../components/Tooltip';
import type { AppView } from './types';
import { VIEW_ORDER } from './types';

interface IconRailProps {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
  connected: boolean;
  fwVersion: string | null;
  /** Fires after 7 quick logo clicks — the resident easter egg */
  onSecret?: () => void;
}

function NavIcon({ name }: { name: AppView }) {
  switch (name) {
    case 'deck':
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'profiles':
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <path d="M12 3l8 4.5-8 4.5-8-4.5L12 3z" />
          <path d="M4 12l8 4.5L20 12" />
          <path d="M4 16.5L12 21l8-4.5" />
        </svg>
      );
    case 'storage':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <path d="M8 3h9a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6l3-3z" />
          <path d="M9 7v3M12 7v3M15 7v3" />
        </svg>
      );
    case 'console':
      return (
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9l3 3-3 3" />
          <path d="M13 15h4" />
        </svg>
      );
    case 'settings':
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z" />
        </svg>
      );
  }
}

const NAV_LABELS: Record<AppView, string> = {
  deck: 'Deck',
  profiles: 'Profiles',
  storage: 'Storage',
  console: 'Console',
  settings: 'Settings',
};

const MAIN_VIEWS: AppView[] = VIEW_ORDER.filter((v) => v !== 'settings');

export function IconRail({ activeView, onViewChange, connected, fwVersion, onSecret }: IconRailProps) {
  const clicksRef = useRef<number[]>([]);
  const handleLogoClick = () => {
    const now = Date.now();
    clicksRef.current = [...clicksRef.current.filter((t) => now - t < 3000), now];
    if (clicksRef.current.length >= 7) {
      clicksRef.current = [];
      onSecret?.();
    }
  };

  return (
    <nav className="icon-rail" aria-label="Main navigation">
      <div
        className="icon-rail-logo"
        title={fwVersion ? `fw ${fwVersion}` : undefined}
        onClick={handleLogoClick}
      >
        <div className="logo-chip" />
      </div>

      <div className="icon-rail-nav">
        {MAIN_VIEWS.map((view) => (
          <Tooltip key={view} label={NAV_LABELS[view]} side="right">
            <button
              type="button"
              className={`nav-item ${activeView === view ? 'active' : ''}`}
              aria-label={NAV_LABELS[view]}
              aria-current={activeView === view ? 'page' : undefined}
              onClick={() => onViewChange(view)}
            >
              <NavIcon name={view} />
            </button>
          </Tooltip>
        ))}
      </div>

      <div className="icon-rail-footer">
        <span className={`conn-dot ${connected ? 'connected' : ''}`} aria-hidden />
        <Tooltip label={NAV_LABELS.settings} side="right">
          <button
            type="button"
            className={`nav-item ${activeView === 'settings' ? 'active' : ''}`}
            aria-label={NAV_LABELS.settings}
            aria-current={activeView === 'settings' ? 'page' : undefined}
            onClick={() => onViewChange('settings')}
          >
            <NavIcon name="settings" />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
