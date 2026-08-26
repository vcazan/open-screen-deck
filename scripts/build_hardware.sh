#!/usr/bin/env bash
# Build fab-ready Open Screen Deck hardware outputs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KICAD_CLI="${KICAD_CLI:-/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli}"
PCB="${ROOT}/hardware/pcb/data_streamdeck.kicad_pcb"
GERBER_DIR="${ROOT}/hardware/pcb/gerbers"

if [[ "${FORCE_REGEN:-0}" == "1" ]]; then
  echo "→ Generating schematic..."
  python3 "${ROOT}/scripts/generate_kicad_schematic.py"

  echo "→ Generating PCB layout (WIPES routing — reroute required!)..."
  python3 "${ROOT}/scripts/generate_kicad_pcb.py"

  echo "→ Upgrading PCB format..."
  "$KICAD_CLI" pcb upgrade "$PCB"
else
  echo "→ Skipping regeneration (routed board preserved). FORCE_REGEN=1 to regenerate."
fi

echo "→ Running DRC..."
"$KICAD_CLI" pcb drc "$PCB" || true

echo "→ Connectivity gate (netlist cross-check — DO NOT skip)..."
python3 "${ROOT}/scripts/check_connectivity.py"

echo "→ SD card orientation gate..."
python3 "${ROOT}/scripts/check_sd_orientation.py"

echo "→ Exporting Gerbers → ${GERBER_DIR}"
mkdir -p "$GERBER_DIR"
"$KICAD_CLI" pcb export gerbers --output "$GERBER_DIR" "$PCB"
"$KICAD_CLI" pcb export drill --output "$GERBER_DIR" "$PCB"
( cd "${ROOT}/hardware/pcb" && rm -f data_streamdeck_gerbers.zip && zip -q -j data_streamdeck_gerbers.zip gerbers/* )

echo "→ Exporting JLCPCB BOM + CPL..."
"${KICAD_PY:-/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3}" "${ROOT}/scripts/export_jlcpcb.py"

echo "→ Rendering PCB preview..."
mkdir -p "${ROOT}/previews"
"$KICAD_CLI" pcb render --output "${ROOT}/previews/pcb-top.png" --side top "$PCB" 2>/dev/null || true

echo "✓ Done. Open ${ROOT}/hardware/pcb/data_streamdeck.kicad_pro in KiCad."
echo "  Gerbers: ${GERBER_DIR}"
echo "  BOM:     ${ROOT}/hardware/pcb/bom.csv"
echo "  JLC:     hardware/pcb/jlcpcb/ (BOM+CPL) + data_streamdeck_gerbers.zip"
