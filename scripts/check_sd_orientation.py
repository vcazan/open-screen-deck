#!/usr/bin/env python3
"""Gate: the microSD card mouth must face the nearest board edge.

The Hirose DM3D-SF footprint draws the inserted card protruding toward
LOCAL +y (F.Fab outline). For the card to pass through the enclosure
side-wall slot, that direction must point at the board edge the
connector sits against — not into the board interior (the Rev B/E bug).

Runs on the .kicad_pcb text directly so it needs no pcbnew import.
"""

import math
import re
import sys
from pathlib import Path

BOARD = Path(__file__).resolve().parent.parent / "hardware/pcb/data_streamdeck.kicad_pcb"

BOARD_W = 59.5   # mm — keep in sync with hardware/pinout.py
BOARD_H = 108.5


def main() -> int:
    txt = BOARD.read_text()

    # Find the J8 footprint block's (at x y rot)
    m = re.search(
        r'"Connector_Card:microSD_HC_Hirose_DM3D-SF".*?\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)',
        txt, re.S,
    )
    if not m:
        print("SD gate FAIL — microSD footprint not found on board")
        return 1

    x, y = float(m.group(1)), float(m.group(2))
    rot = float(m.group(3) or 0)

    # Card mouth direction = local +y rotated by footprint orientation.
    # KiCad rotates footprints CCW in board coords (y-down), so local
    # (0,1) maps to (sin θ, cos θ) — verified against the routed board:
    # rot=90 puts the pad row at x≈57.4 and the mouth at the x=59.5 edge.
    th = math.radians(rot)
    mouth = (math.sin(th), math.cos(th))

    # Direction from connector centre to the nearest board edge
    edges = {
        "+x": BOARD_W - x,
        "-x": x,
        "+y": BOARD_H - y,
        "-y": y,
    }
    nearest = min(edges, key=edges.get)
    expected = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}[nearest]

    dot = mouth[0] * expected[0] + mouth[1] * expected[1]
    if dot < 0.9:
        print(
            f"SD gate FAIL — card mouth points ({mouth[0]:.0f},{mouth[1]:.0f}) "
            f"but nearest edge is {nearest} (J8 at {x},{y} rot {rot})"
        )
        return 1

    print(f"SD gate PASS — card mouth faces {nearest} edge (J8 at {x},{y} rot {rot})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
