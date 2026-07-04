#!/usr/bin/env bash
# Build fab-ready Open Screen Deck hardware outputs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KICAD_CLI="${KICAD_CLI:-/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli}"
PCB="${ROOT}/hardware/pcb/data_streamdeck.kicad_pcb"
GERBER_DIR="${ROOT}/hardware/pcb/gerbers"

echo "→ Generating schematic..."
python3 "${ROOT}/scripts/generate_kicad_schematic.py"

echo "→ Generating PCB layout..."
python3 "${ROOT}/scripts/generate_kicad_pcb.py"

echo "→ Upgrading PCB format..."
"$KICAD_CLI" pcb upgrade "$PCB"

echo "→ Running DRC..."
"$KICAD_CLI" pcb drc "$PCB" || true

echo "→ Exporting Gerbers → ${GERBER_DIR}"
mkdir -p "$GERBER_DIR"
"$KICAD_CLI" pcb export gerbers --output "$GERBER_DIR" "$PCB"
"$KICAD_CLI" pcb export drill --output "$GERBER_DIR" "$PCB"

echo "→ Rendering PCB preview..."
mkdir -p "${ROOT}/previews"
"$KICAD_CLI" pcb render --output "${ROOT}/previews/pcb-top.png" --side top "$PCB" 2>/dev/null || true

echo "✓ Done. Open ${ROOT}/hardware/pcb/data_streamdeck.kicad_pro in KiCad."
echo "  Gerbers: ${GERBER_DIR}"
echo "  BOM:     ${ROOT}/hardware/pcb/bom.csv"
echo "  Note:    Finish ESP32↔net fanout in PCB Editor, then re-run DRC before JLCPCB order."
