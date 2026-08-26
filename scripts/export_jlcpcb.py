#!/usr/bin/env python3
"""
export_jlcpcb.py — generate JLCPCB assembly files (BOM + CPL) from the routed
board, so they can never drift from the layout.

Run with KiCad's bundled python:
  /Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3 scripts/export_jlcpcb.py
"""

import csv
import sys
from pathlib import Path

sys.path.insert(
    0,
    "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/"
    "Versions/Current/lib/python3.11/site-packages",
)
import pcbnew  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PCB = ROOT / "hardware/pcb/data_streamdeck.kicad_pcb"
OUT = ROOT / "hardware/pcb/jlcpcb"

# value -> LCSC part number. Keys match footprint Value fields.
LCSC = {
    "100nF": "C1525",
    "1uF": "C52923",
    "10uF": "C15850",
    "10k": "C25744",
    "5.1k": "C25905",
    "100R": "C25076",
    "ESP32-S3-WROOM-1-N16R8": "C2913202",
    "AMS1117-3.3": "C6186",
    "USBLC6-2SC6": "C7519",
    "USB4105-GF-A": "C3020560",
    "microSD": "C719027",             # Hirose DM3D-SF
    "BOOT": "C72443",                 # C&K KMR221GLFS
    "RESET": "C72443",
    # Plain pads-under-body variant; the -E (C5149201) has outward legs that
    # barely touch the PLCC4 footprint pads — flagged as weak joints by JLC DFM.
    "SK6812MINI-C": "C7423117",
    "LSM6DS3TR-C": "C967633",
    "DRV2605L": "C527464",            # DRV2605LDGSR
    "VEML7700": "C1850416",           # VEML7700-TT (alt: VEML7700-TR C504893)
    "74AHCT1G125": "C7484",           # SN74AHCT1G125DBVR
    "Qwiic": "C160404",               # JST SM04B-SRSS-TB
    "LRA motor": "C160402",           # JST SM02B-SRSS-TB
    "CPT-9019S": "C95163",            # CUI CPT-9019S-SMT-TR
    # PicoBlade-compatible 9P right-angle SMT (HDGC clone of Molex 53261-0971).
    # Confirmed via JLC BOM matcher on the Rev E order (2026-08-08).
    "HDGC1251WR-S-9P": "C5175293",
}

# Per-footprint values that should be merged into one BOM line under a real MPN.
BOM_COMMENT = {
    "ScreenKey 1": "HDGC1251WR-S-9P", "ScreenKey 2": "HDGC1251WR-S-9P",
    "ScreenKey 3": "HDGC1251WR-S-9P", "ScreenKey 4": "HDGC1251WR-S-9P",
    "ScreenKey 5": "HDGC1251WR-S-9P", "ScreenKey 6": "HDGC1251WR-S-9P",
    # Live board footprints may still carry the old -E value.
    "SK6812MINI-E": "SK6812MINI-C",
}


def main() -> None:
    board = pcbnew.LoadBoard(str(PCB))
    mm = pcbnew.ToMM
    OUT.mkdir(parents=True, exist_ok=True)

    rows = []
    for fp in board.GetFootprints():
        ref = fp.GetReference()
        if ref.startswith("H"):  # mounting holes
            continue
        pos = fp.GetPosition()
        rows.append({
            "ref": ref,
            "value": fp.GetValue(),
            "footprint": str(fp.GetFPID().GetLibItemName()),
            "x": round(mm(pos.x), 3),
            # JLC expects Y increasing upward; KiCad page Y grows downward
            "y": round(-mm(pos.y), 3),
            "rot": round(fp.GetOrientationDegrees(), 1) % 360,
            "layer": "Top" if fp.GetLayer() == pcbnew.F_Cu else "Bottom",
        })
    rows.sort(key=lambda r: (r["ref"][0], r["ref"]))

    # BOM: group by (value, footprint)
    groups: dict[tuple[str, str], list[str]] = {}
    for r in rows:
        comment = BOM_COMMENT.get(r["value"], r["value"])
        key = (comment, r["footprint"])
        # BOOT/RESET share one part; J1-J6 merge under the connector MPN
        groups.setdefault(key, []).append(r["ref"])
    with open(OUT / "bom_jlcpcb.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for (value, footprint), refs in sorted(groups.items(), key=lambda kv: kv[1][0]):
            w.writerow([value, ",".join(sorted(refs)), footprint,
                        LCSC.get(value, "")])

    with open(OUT / "cpl_jlcpcb.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        for r in rows:
            w.writerow([r["ref"], f"{r['x']}mm", f"{r['y']}mm",
                        r["layer"], r["rot"]])

    missing = sorted(
        {BOM_COMMENT.get(r["value"], r["value"]) for r in rows} - set(LCSC)
    )
    if missing:
        print(f"WARNING: no LCSC mapping for values: {missing}")
    print(f"Wrote {OUT / 'bom_jlcpcb.csv'} ({len(groups)} lines) and "
          f"{OUT / 'cpl_jlcpcb.csv'} ({len(rows)} parts)")


if __name__ == "__main__":
    main()
