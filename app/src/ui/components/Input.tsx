import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function Input({ label, className = '', id, ...props }: InputProps) {
  const inputId = id || (label ? `input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);

  return (
    <label className={`field ${className}`.trim()} htmlFor={inputId}>
      {label && <span className="field-label">{label}</span>}
      <input className="field-input" id={inputId} {...props} />
    </label>
  );
}
