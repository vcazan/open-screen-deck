import { useEffect, useMemo, useRef, useState } from 'react';
import { isTauri } from '../../transport/TauriSerialTransport';

interface AppInfo {
  name: string;
  path: string;
}

interface AppPickerProps {
  value: string;
  onSelect: (path: string, name: string, iconDataUrl: string | null) => void;
  onChangeText: (value: string) => void;
}

const iconCache = new Map<string, string | null>();

async function fetchIcon(path: string): Promise<string | null> {
  if (iconCache.has(path)) return iconCache.get(path) ?? null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const dataUrl = (await invoke('app_icon', { path })) as string;
    iconCache.set(path, dataUrl);
    return dataUrl;
  } catch {
    iconCache.set(path, null);
    return null;
  }
}

/**
 * Searchable installed-application picker (desktop app only).
 * The field stays free-text so arbitrary paths still work.
 */
export function AppPicker({ value, onSelect, onChangeText }: AppPickerProps) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [icons, setIcons] = useState<Record<string, string | null>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauri()) return;
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke('list_apps'))
      .then((list) => setApps(list as AppInfo[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const matches = q
      ? apps.filter((a) => a.name.toLowerCase().includes(q))
      : apps;
    return matches.slice(0, 8);
  }, [apps, value]);

  // Lazily fetch icons for the visible rows
  useEffect(() => {
    if (!open) return;
    filtered.forEach((app) => {
      if (icons[app.path] !== undefined) return;
      fetchIcon(app.path).then((icon) => {
        setIcons((prev) => ({ ...prev, [app.path]: icon }));
      });
    });
  }, [open, filtered, icons]);

  return (
    <div className="app-picker" ref={rootRef}>
      <input
        className="field-input"
        value={value}
        placeholder="Search your apps — or paste any path"
        onChange={(e) => {
          onChangeText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        aria-label="Application"
      />
      {open && filtered.length > 0 && (
        <div className="app-picker-list" role="listbox">
          {filtered.map((app) => (
            <button
              key={app.path}
              type="button"
              role="option"
              className="app-picker-row"
              onClick={async () => {
                setOpen(false);
                const icon = icons[app.path] ?? (await fetchIcon(app.path));
                onSelect(app.path, app.name, icon);
              }}
            >
              {icons[app.path] ? (
                <img src={icons[app.path]!} alt="" className="app-picker-icon" />
              ) : (
                <span className="app-picker-icon placeholder" aria-hidden />
              )}
              <span className="app-picker-name">{app.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
