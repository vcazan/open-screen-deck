import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadIconLibrary,
  renderIconCanvas,
  searchIcons,
  type LibraryIcon,
} from '../icons/iconLibrary';

interface IconPickerProps {
  /** Called with a rendered 128×128 canvas (transparent bg) + icon name */
  onPick: (canvas: HTMLCanvasElement, name: string) => void;
}

/**
 * Searchable icon browser — 7,400+ Material Design Icons (Apache-2.0).
 * The library loads lazily on first focus so it never weighs down startup.
 */
export function IconPicker({ onPick }: IconPickerProps) {
  const [library, setLibrary] = useState<LibraryIcon[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const loadStarted = useRef(false);

  const ensureLibrary = () => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    setLoading(true);
    loadIconLibrary()
      .then(setLibrary)
      .finally(() => setLoading(false));
  };

  // Debounce typing a touch — the search scans 7k haystacks
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 120);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo(
    () => (library ? searchIcons(library, debounced, 60) : []),
    [library, debounced],
  );

  return (
    <div className="icon-picker">
      <input
        className="field-input"
        placeholder={library ? `Search ${library.length.toLocaleString()} icons…` : 'Search icons…'}
        value={query}
        onFocus={ensureLibrary}
        onChange={(e) => {
          ensureLibrary();
          setQuery(e.target.value);
        }}
        aria-label="Search icons"
      />
      {loading && <p className="icon-picker-hint">Loading the icon library…</p>}
      {library && (
        <>
          <div className="icon-picker-grid" role="listbox" aria-label="Icon results">
            {results.map((icon) => (
              <button
                key={icon.name}
                type="button"
                className={`icon-picker-btn ${picked === icon.name ? 'picked' : ''}`}
                title={icon.name}
                aria-label={icon.name}
                onClick={() => {
                  setPicked(icon.name);
                  onPick(renderIconCanvas(icon.path), icon.name);
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                  <path d={icon.path} fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
          <p className="icon-picker-hint">
            {results.length === 0
              ? 'No matches — try different words (icons are tagged in English).'
              : 'Icons take the key\u2019s background color — recolor any time.'}
            {' '}
            <a
              href="https://pictogrammers.com/library/mdi/"
              target="_blank"
              rel="noreferrer"
            >
              Material Design Icons
            </a>
            , Apache-2.0.
          </p>
        </>
      )}
    </div>
  );
}
