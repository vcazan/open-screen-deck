import type { ReactNode } from 'react';

interface InspectorCardProps {
  title: string;
  children: ReactNode;
}

export function InspectorCard({ title, children }: InspectorCardProps) {
  return (
    <section className="inspector-card">
      <h3 className="inspector-card-title">{title}</h3>
      <div className="inspector-card-body">{children}</div>
    </section>
  );
}
