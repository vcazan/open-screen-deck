import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: 'right' | 'top';
  disabled?: boolean;
}

export function Tooltip({ label, children, side = 'right', disabled = false }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const show = () => {
    if (disabled) return;
    timerRef.current = setTimeout(() => setVisible(true), 400);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  return (
    <span
      className="tooltip-host"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      <span className={`tooltip-bubble tooltip-${side} ${visible ? 'visible' : ''}`} role="tooltip">
        {label}
      </span>
    </span>
  );
}
