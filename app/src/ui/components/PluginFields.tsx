/**
 * Native controls for plugin-declared fields — text, select, color, and
 * toggle. Used by the key inspector (per-key settings) and the plugin
 * detail page (defaults), so plugin developers describe a field once and
 * get real UI everywhere.
 */

import type { PluginField } from '../../plugins/host';
import { Input } from './Input';

interface PluginFieldsProps {
  fields: PluginField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Fired when a value is "settled" — select/color/toggle immediately, text on blur */
  onCommit?: () => void;
}

export function PluginFields({ fields, values, onChange, onCommit }: PluginFieldsProps) {
  return (
    <>
      {fields.map((f) => {
        const value = values[f.key] ?? f.default ?? '';
        switch (f.type) {
          case 'select':
            return (
              <label key={f.key} className="field">
                <span className="field-label">{f.label}</span>
                <select
                  className="plugin-field-select"
                  value={value}
                  onChange={(e) => {
                    onChange(f.key, e.target.value);
                    onCommit?.();
                  }}
                  aria-label={f.label}
                >
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          case 'color':
            return (
              <div key={f.key} className="field plugin-field-color-row">
                <span className="field-label">{f.label}</span>
                <label
                  className="plugin-field-color"
                  style={{ background: value || '#888888' }}
                  title={f.label}
                >
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#888888'}
                    onChange={(e) => {
                      onChange(f.key, e.target.value);
                      onCommit?.();
                    }}
                    aria-label={f.label}
                  />
                </label>
              </div>
            );
          case 'toggle':
            return (
              <label key={f.key} className="plugin-field-toggle">
                <input
                  type="checkbox"
                  className="custom-checkbox"
                  checked={value.toLowerCase().startsWith('y')}
                  onChange={(e) => {
                    onChange(f.key, e.target.checked ? 'yes' : '');
                    onCommit?.();
                  }}
                />
                <span>{f.label}</span>
              </label>
            );
          default:
            return (
              <Input
                key={f.key}
                label={f.label}
                placeholder={f.placeholder}
                type={f.key.toLowerCase().includes('password') ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                onChange={(e) => onChange(f.key, e.target.value)}
                onBlur={() => onCommit?.()}
              />
            );
        }
      })}
    </>
  );
}
