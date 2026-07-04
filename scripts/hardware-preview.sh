#!/usr/bin/env bash
# Open Screen Deck — hardware preview workflow
# Run after ANY enclosure or PCB change:
#   ./scripts/hardware-preview.sh
#
# Renders PNG/SVG previews into previews/ and opens OpenSCAD + KiCad GUIs.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREVIEWS="${ROOT}/previews"
SCAD="${ROOT}/hardware/enclosure/data_streamdeck_enclosure.scad"
KICAD_PRO="${ROOT}/hardware/pcb/data_streamdeck.kicad_pro"
KICAD_SCH="${ROOT}/hardware/pcb/data_streamdeck.kicad_sch"

OPENSCAD="${OPENSCAD:-openscad}"
KICAD_CLI="${KICAD_CLI:-/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli}"
KICAD_APP="${KICAD_APP:-/Applications/KiCad/KiCad.app}"
OPENSCAD_APP="${OPENSCAD_APP:-/Applications/OpenSCAD.app}"

OPEN_GUI=true
RENDER=true

usage() {
    cat <<EOF
Usage: $(basename "$0") [options]

  (no args)       Render previews + open OpenSCAD & KiCad
  --render-only   Write previews/ only, do not open GUIs
  --open-only     Open GUIs only, skip rendering
  --help          Show this help

Outputs:
  previews/enclosure-ghost.png      Full assembly (PCB + modules)
  previews/enclosure-assembled.png  Both shells
  previews/enclosure-side.png       Side profile (wedge tilt)
  previews/enclosure-top.png        Top shell export mesh view
  previews/schematic.svg            KiCad schematic (if export succeeds)
  previews/index.html               Gallery — open in browser

EOF
}

log()  { printf '\033[1;34m→\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

for arg in "$@"; do
    case "$arg" in
        --render-only) OPEN_GUI=false ;;
        --open-only)   RENDER=false ;;
        --help|-h)     usage; exit 0 ;;
        *) err "Unknown option: $arg"; usage; exit 1 ;;
    esac
done

mkdir -p "${PREVIEWS}"

render_openscad() {
    if ! command -v "${OPENSCAD}" >/dev/null 2>&1; then
        err "OpenSCAD not found. Install: brew install openscad"
        exit 1
    fi

    log "Rendering enclosure previews (OpenSCAD)..."

    "${OPENSCAD}" -o "${PREVIEWS}/enclosure-ghost.png" \
        --imgsize=1600,1200 --viewall --autocenter \
        -D 'RENDER="ghost"' "${SCAD}" 2>&1 | grep -E '^ECHO:' || true

    "${OPENSCAD}" -o "${PREVIEWS}/enclosure-assembled.png" \
        --imgsize=1600,1200 --viewall --autocenter \
        -D 'RENDER="both"' "${SCAD}" 2>&1 | grep -E '^ECHO:' || true

    "${OPENSCAD}" -o "${PREVIEWS}/enclosure-keys.png" \
        --imgsize=1600,1200 --viewall --autocenter \
        -D 'RENDER="keys"' "${SCAD}" 2>&1 | grep -E '^ECHO:' || true

    "${OPENSCAD}" -o "${PREVIEWS}/enclosure-side.png" \
        --imgsize=1400,900 --viewall --autocenter \
        -D 'RENDER="both"' "${SCAD}" 2>&1 | grep -E '^ECHO:' || true

    "${OPENSCAD}" -o "${PREVIEWS}/enclosure-front.png" \
        --imgsize=1400,900 --viewall --autocenter \
        -D 'RENDER="keys"' "${SCAD}" 2>&1 | grep -E '^ECHO:' || true

    # STL sanity (top shell) — confirms manifold export
    "${OPENSCAD}" -o "${PREVIEWS}/enclosure-top-shell.stl" \
        -D 'RENDER="top"' "${SCAD}" 2>&1 | tail -3 || true

    log "OpenSCAD previews written to previews/"
}

render_kicad() {
    if [[ ! -x "${KICAD_CLI}" ]]; then
        warn "kicad-cli not found at ${KICAD_CLI} — skipping schematic export"
        return 0
    fi

    log "Exporting KiCad schematic..."

    if "${KICAD_CLI}" sch export svg -o "${PREVIEWS}" "${KICAD_SCH}" 2>/dev/null; then
        # KiCad names output from sheet title; normalize to schematic.svg
        shopt -s nullglob
        svgs=("${PREVIEWS}"/*.svg)
        shopt -u nullglob
        if [[ ${#svgs[@]} -gt 0 ]]; then
            cp "${svgs[0]}" "${PREVIEWS}/schematic.svg"
            log "Schematic SVG → previews/schematic.svg"
        fi
    else
        warn "KiCad CLI could not export schematic (open KiCad GUI to fix/load)"
        echo "Schematic export pending — open KiCad to validate ${KICAD_SCH}" \
            > "${PREVIEWS}/schematic-export-note.txt"
    fi

    if "${KICAD_CLI}" sch export pdf -o "${PREVIEWS}/schematic.pdf" "${KICAD_SCH}" 2>/dev/null; then
        log "Schematic PDF → previews/schematic.pdf"
    fi
}

write_gallery() {
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"

    cat > "${PREVIEWS}/index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Open Screen Deck — Hardware Preview</title>
  <style>
    :root { color-scheme: dark; --bg:#0d0d0f; --fg:#e8e8ec; --muted:#888; --accent:#4a9eff; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: var(--bg); color: var(--fg); margin: 0; padding: 2rem; }
    h1 { font-size: 1.4rem; font-weight: 600; margin: 0 0 .25rem; }
    .meta { color: var(--muted); font-size: .85rem; margin-bottom: 2rem; }
    .meta code { color: var(--accent); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem; }
    figure { margin: 0; background: #16161a; border-radius: 12px; overflow: hidden; border: 1px solid #2a2a30; }
    figcaption { padding: .75rem 1rem; font-size: .8rem; color: var(--muted); }
    img { width: 100%; display: block; background: #1a1a1f; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <h1>Open Screen Deck — Hardware Preview</h1>
  <p class="meta">Generated <strong>${ts}</strong> · Run <code>./scripts/hardware-preview.sh</code> to refresh</p>
  <div class="grid">
    <figure><img src="enclosure-ghost.png" alt="Ghost assembly"/><figcaption>Ghost — internal fit (PCB + modules)</figcaption></figure>
    <figure><img src="enclosure-keys.png" alt="Key face"/><figcaption>User view — 6 key face (what you see on desk)</figcaption></figure>
    <figure><img src="enclosure-assembled.png" alt="Assembled shells"/><figcaption>Assembled — matte shell, closed</figcaption></figure>
    <figure><img src="enclosure-side.png" alt="Side profile"/><figcaption>Side — wedge tilt (~29° face)</figcaption></figure>
    <figure><img src="enclosure-front.png" alt="Front perspective"/><figcaption>Front — user-facing angle</figcaption></figure>
HTML

    if [[ -f "${PREVIEWS}/schematic.svg" ]]; then
        cat >> "${PREVIEWS}/index.html" <<HTML
    <figure><img src="schematic.svg" alt="Schematic"/><figcaption>KiCad schematic</figcaption></figure>
HTML
    fi

    cat >> "${PREVIEWS}/index.html" <<'HTML'
  </div>
</body>
</html>
HTML

    log "Gallery → previews/index.html"
}

open_guis() {
    log "Opening OpenSCAD..."
    if [[ -d "${OPENSCAD_APP}" ]]; then
        open -a "${OPENSCAD_APP}" "${SCAD}"
    else
        warn "OpenSCAD.app not found — open ${SCAD} manually"
    fi

    log "Opening KiCad project..."
    if [[ -d "${KICAD_APP}" ]]; then
        open -a KiCad "${KICAD_PRO}"
    else
        warn "KiCad.app not found — open ${KICAD_PRO} manually"
    fi

    log "Opening preview gallery in browser..."
    open "${PREVIEWS}/index.html" 2>/dev/null || true
}

# ── Main ──────────────────────────────────────────────────────
if $RENDER; then
    render_openscad
    render_kicad
    write_gallery
fi

if $OPEN_GUI; then
    open_guis
fi

log "Done."
