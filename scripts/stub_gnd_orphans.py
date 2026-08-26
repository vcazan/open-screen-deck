#!/usr/bin/env python3
"""
Connect GND pads the zone pour cannot reach (fine-pitch pads, pads walled
in by signal traces) with short collision-checked F.Cu stubs to the nearest
GND via or GND pad. Run after stitch_gnd.py; iterate with DRC until clean.
"""

import json
import math
import re
import subprocess
import sys
import tempfile

sys.path.insert(
    0,
    "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/"
    "Versions/Current/lib/python3.11/site-packages",
)
import pcbnew  # noqa: E402

BOARD = "/Users/vcazan/Projects/open-screen-deck/hardware/pcb/data_streamdeck.kicad_pcb"
KICAD_CLI = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"


def pt_seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def seg_seg_dist(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2):
    return min(
        pt_seg_dist(ax1, ay1, bx1, by1, bx2, by2),
        pt_seg_dist(ax2, ay2, bx1, by1, bx2, by2),
        pt_seg_dist(bx1, by1, ax1, ay1, ax2, ay2),
        pt_seg_dist(bx2, by2, ax1, ay1, ax2, ay2),
    )


def unconnected_gnd_pads():
    with tempfile.NamedTemporaryFile(suffix=".json") as tf:
        subprocess.run(
            [KICAD_CLI, "pcb", "drc", BOARD, "-o", tf.name, "--format", "json",
             "--severity-error"],
            capture_output=True,
        )
        rep = json.load(open(tf.name))
    pads = set()
    for u in rep.get("unconnected_items", []):
        for item in u.get("items", []):
            m = re.match(r"Pad (\S+) \[GND\] of (\S+) on", item.get("description", ""))
            if m:
                pads.add((m.group(2), m.group(1)))
    return pads, len(rep.get("violations", []))


def main() -> None:
    board = pcbnew.LoadBoard(BOARD)
    mm, FromMM = pcbnew.ToMM, pcbnew.FromMM
    gnd = board.FindNet("GND").GetNetCode()

    copper = []  # (layer, x1,y1,x2,y2, halfwidth, net)
    gnd_targets = []  # (x, y) of GND vias
    for t in board.GetTracks():
        if t.GetClass() == "PCB_TRACK":
            copper.append((t.GetLayerName(), mm(t.GetStart().x), mm(t.GetStart().y),
                           mm(t.GetEnd().x), mm(t.GetEnd().y), mm(t.GetWidth()) / 2,
                           t.GetNetname()))
        else:
            x, y = mm(t.GetStart().x), mm(t.GetStart().y)
            copper.append(("F.Cu", x, y, x, y, 0.3, t.GetNetname()))
            copper.append(("B.Cu", x, y, x, y, 0.3, t.GetNetname()))
            if t.GetNetname() == "GND":
                gnd_targets.append((x, y))

    pads_geo = {}
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            x, y = mm(pad.GetPosition().x), mm(pad.GetPosition().y)
            sz = pad.GetSize(pcbnew.PADSTACK.ALL_LAYERS)
            r = max(mm(sz.x), mm(sz.y)) / 2
            key = (fp.GetReference(), str(pad.GetNumber()))
            pads_geo[key] = (x, y, r, pad.GetNetname())
            copper.append(("F.Cu", x, y, x, y, r, pad.GetNetname()))
            if pad.HasHole():
                copper.append(("B.Cu", x, y, x, y, r, pad.GetNetname()))

    def path_clear(x1, y1, x2, y2, skip_keys):
        skip_pts = {(round(pads_geo[k][0], 2), round(pads_geo[k][1], 2))
                    for k in skip_keys if k in pads_geo}
        for lay, cx1, cy1, cx2, cy2, hw, net in copper:
            if net == "GND" or lay != "F.Cu":
                continue
            if seg_seg_dist(x1, y1, x2, y2, cx1, cy1, cx2, cy2) < hw + 0.125 + 0.14:
                return False
        # non-target GND pads are fine to touch; other endpoints checked above
        return True

    orphans, _ = unconnected_gnd_pads()
    print("orphan GND pads:", sorted(orphans))
    added = 0
    for ref, num in sorted(orphans):
        key = (ref, num)
        if key not in pads_geo:
            print("  ?? unknown pad", key)
            continue
        x, y, r, _ = pads_geo[key]
        # candidate targets: GND vias and other GND pads, nearest first
        cands = [(math.hypot(x - tx, y - ty), tx, ty) for tx, ty in gnd_targets]
        for (oref, onum), (ox, oy, orr, onet) in pads_geo.items():
            if onet == "GND" and (oref, onum) != key:
                cands.append((math.hypot(x - ox, y - oy), ox, oy))
        cands.sort()
        done = False
        for dist, tx, ty in cands[:40]:
            if dist > 8.0:
                break
            if path_clear(x, y, tx, ty, [key]):
                tr = pcbnew.PCB_TRACK(board)
                tr.SetStart(pcbnew.VECTOR2I(FromMM(x), FromMM(y)))
                tr.SetEnd(pcbnew.VECTOR2I(FromMM(tx), FromMM(ty)))
                tr.SetWidth(FromMM(0.25))
                tr.SetLayer(pcbnew.F_Cu)
                tr.SetNetCode(gnd)
                board.Add(tr)
                copper.append(("F.Cu", x, y, tx, ty, 0.125, "GND"))
                print(f"  {ref}.{num} -> stub to ({tx:.2f},{ty:.2f})")
                added += 1
                done = True
                break
        if not done:
            print(f"  !! no clear stub for {ref}.{num} ({x:.2f},{y:.2f})")

    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())
    pcbnew.SaveBoard(BOARD, board)
    print(f"added {added} stubs, saved")


if __name__ == "__main__":
    main()
