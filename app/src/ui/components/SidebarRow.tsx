import type { ReactNode } from 'react';

interface SidebarRowProps {
  icon?: ReactNode;
  title: string;
  meta?: string;
  selected?: boolean;
  disabled?: boolean;
  statusDot?: 'connected' | 'idle' | 'amber' | 'disabled';
  onClick?: () => void;
  tooltip?: string;
}

export function SidebarRow({
  icon,
  title,
  meta,
  selected = false,
  disabled = false,
  statusDot = 'idle',
  onClick,
  tooltip,
}: SidebarRowProps) {
  const row = (
    <button
      type="button"
      className={`sidebar-row ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={disabled ? tooltip : undefined}
    >
      {statusDot !== 'idle' && (
        <span className={`sidebar-row-dot ${statusDot}`} aria-hidden />
      )}
      {icon && <span className="sidebar-row-icon">{icon}</span>}
      <span className="sidebar-row-text">
        <span className="sidebar-row-title">{title}</span>
        {meta && <span className="sidebar-row-meta">{meta}</span>}
      </span>
    </button>
  );

  if (tooltip && disabled) {
    return (
      <span className="sidebar-row-wrap">
        {row}
        <span className="sidebar-row-tooltip">{tooltip}</span>
      </span>
    );
  }

  return row;
}
