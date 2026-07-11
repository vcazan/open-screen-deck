import type { ReactNode } from 'react';
import type { AppView } from './types';
import { VIEW_META } from './types';

interface StageTopbarProps {
  activeView: AppView;
  fwVersion: string | null;
  connected: boolean;
  connectionLabel: string;
  actions?: ReactNode;
}

export function StageTopbar({
  activeView,
  fwVersion,
  connected,
  connectionLabel,
  actions,
}: StageTopbarProps) {
  const meta = VIEW_META[activeView];

  return (
    <header className="stage-topbar">
      <div className="stage-topbar-left">
        <h1 className="stage-title">{meta.title}</h1>
        <p className="stage-subtitle">{meta.subtitle}</p>
      </div>
      <div className="stage-topbar-right">
        <div className={`conn-pill ${connected ? '' : 'offline'}`}>
          <span className="conn-pill-dot" aria-hidden />
          <span className="conn-pill-label">{connectionLabel}</span>
        </div>
        {fwVersion && <span className="fw-chip">fw {fwVersion}</span>}
        {actions}
      </div>
    </header>
  );
}
