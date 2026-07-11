import type { ReactNode } from 'react';

interface SidebarSectionProps {
  title: string;
  children: ReactNode;
}

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">{title}</div>
      <div className="sidebar-section-body">{children}</div>
    </div>
  );
}
