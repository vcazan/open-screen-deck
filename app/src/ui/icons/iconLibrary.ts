/**
 * Icon library — Material Design Icons (Apache-2.0, ~7,400 icons).
 * Loaded lazily: the metadata (names/aliases/tags) and path data are only
 * imported when the picker first opens, keeping them out of the app bundle.
 */

export interface LibraryIcon {
  /** kebab-case MDI name, e.g. "account-circle" */
  name: string;
  /** 24×24 SVG path data */
  path: string;
  /** lowercase haystack: name + aliases + tags */
  search: string;
}

let libraryPromise: Promise<LibraryIcon[]> | null = null;

function exportNameFor(kebab: string): string {
  return `mdi${kebab.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}`;
}

/** Load and index the full icon set (one-time, ~4 MB lazy chunk). */
export function loadIconLibrary(): Promise<LibraryIcon[]> {
  libraryPromise ??= (async () => {
    const [paths, meta] = await Promise.all([
      import('@mdi/js'),
      import('@mdi/svg/meta.json'),
    ]);
    const entries = (meta.default ?? meta) as {
      name: string;
      aliases: string[];
      tags: string[];
      deprecated?: boolean;
    }[];
    const icons: LibraryIcon[] = [];
    for (const m of entries) {
      if (m.deprecated) continue;
      const path = (paths as Record<string, unknown>)[exportNameFor(m.name)];
      if (typeof path !== 'string') continue;
      icons.push({
        name: m.name,
        path,
        search: [m.name.replace(/-/g, ' '), ...m.aliases, ...m.tags]
          .join(' ')
          .toLowerCase(),
      });
    }
    return icons;
  })();
  return libraryPromise;
}

/**
 * Token search: every query word must match; results ranked so exact and
 * prefix name matches surface first.
 */
export function searchIcons(icons: LibraryIcon[], query: string, limit = 60): LibraryIcon[] {
  const q = query.trim().toLowerCase();
  if (!q) return icons.slice(0, limit);
  const tokens = q.split(/\s+/);

  const scored: { icon: LibraryIcon; score: number }[] = [];
  for (const icon of icons) {
    let ok = true;
    for (const t of tokens) {
      if (!icon.search.includes(t)) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const name = icon.name.replace(/-/g, ' ');
    const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : 3;
    scored.push({ icon, score });
    if (scored.length > 400) break; // plenty for ranking within the limit
  }
  scored.sort((a, b) => a.score - b.score || a.icon.name.localeCompare(b.icon.name));
  return scored.slice(0, limit).map((s) => s.icon);
}

/**
 * Render an icon to a 128×128 key-face canvas. The background stays
 * transparent, so after canvasToRgb565Alpha() it becomes sentinel pixels —
 * the icon adopts the key's background color and follows recolors forever.
 */
export function renderIconCanvas(path: string, color = '#ffffff'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.translate(16, 8); // horizontal center; biased up so label text fits below
  ctx.scale(4, 4); // 24 → 96 px
  ctx.fillStyle = color;
  ctx.fill(new Path2D(path));
  return canvas;
}
