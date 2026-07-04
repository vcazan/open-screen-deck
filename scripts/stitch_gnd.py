#!/usr/bin/env python3
"""
Post-route GND stitching: find GND pads the zones can't reach and drop a
stitch via (with a short stub if needed) at a spot verified clear of all
non-GND copper on both layers. Run AFTER autoroute + zone refill:

  /Applications/KiCad/.../python3 scripts/stitch_gnd.py

Then re-run DRC. Idempotent-ish: skips pads already touching a GND via.
"""

import math
import sys

sys.path.insert(
    0,
    "/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/"
    "Versions/Current/lib/python3.11/site-packages",
)
import pcbnew  # noqa: E402

BOARD = "/Users/vcazan/Projects/open-screen-deck/hardware/pcb/data_streamdeck.kicad_pcb"


def pt_seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def main() -> None:
    board = pcbnew.LoadBoard(BOARD)
    mm = pcbnew.ToMM

    gnd_code = None
    copper = []          # (layer, x1,y1,x2,y2, width, netname)
    gnd_vias = []
    for t in board.GetTracks():
        cls = t.GetClass()
        if t.GetNetname() == "GND" and gnd_code is None:
            gnd_code = t.GetNetCode()
        if cls == "PCB_TRACK":
            copper.append((t.GetLayerName(), mm(t.GetStart().x), mm(t.GetStart().y),
                           mm(t.GetEnd().x), mm(t.GetEnd().y), mm(t.GetWidth()), t.GetNetname()))
        elif cls == "PCB_VIA":
            x, y = mm(t.GetStart().x), mm(t.GetStart().y)
            copper.append(("VIA", x, y, x, y, mm(t.GetWidth()), t.GetNetname()))
            if t.GetNetname() == "GND":
                gnd_vias.append((x, y))

    pads_all = []        # every pad, for clearance checks
    gnd_smd_pads = []    # candidates to stitch (front SMD GND pads)
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            x, y = mm(pad.GetPosition().x), mm(pad.GetPosition().y)
            sz = max(mm(pad.GetSize().x), mm(pad.GetSize().y))
            pads_all.append((x, y, sz, pad.GetNetname()))
            if (pad.GetNetname() == "GND"
                    and pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD
                    and pad.IsOnLayer(pcbnew.F_Cu)):
                gnd_smd_pads.append((x, y, fp.GetReference(), pad.GetNumber()))

    def clear_at(x, y, need):
        for lay, x1, y1, x2, y2, w, net in copper:
            if net == "GND":
                continue
            if pt_seg_dist(x, y, x1, y1, x2, y2) < need + w / 2:
                return False
        for px, py, sz, net in pads_all:
            if net == "GND":
                continue
            if math.hypot(x - px, y - py) < need + sz / 2:
                return False
        return True

    def stub_clear(pad_x, pad_y, vx, vy):
        for f in (0.25, 0.5, 0.75, 1.0):
            sx, sy = pad_x + f * (vx - pad_x), pad_y + f * (vy - pad_y)
            for lay, x1, y1, x2, y2, w, net in copper:
                if net == "GND" or lay != "F.Cu":
                    continue
                if pt_seg_dist(sx, sy, x1, y1, x2, y2) < 0.33 + w / 2:
                    return False
            for px, py, sz, net in pads_all:
                if net == "GND":
                    continue
                if math.hypot(sx - px, sy - py) < 0.33 + sz / 2:
                    return False
        return True

    added = 0
    for x, y, ref, num in gnd_smd_pads:
        if any(math.hypot(x - vx, y - vy) < 2.5 for vx, vy in gnd_vias):
            continue
        spot = None
        for r in (0.9, 1.2, 1.5, 1.9, 2.4, 3.0):
            for ang in range(0, 360, 15):
                vx = x + r * math.cos(math.radians(ang))
                vy = y + r * math.sin(math.radians(ang))
                if 1.0 < vx < 54.0 and 1.0 < vy < 111.0 and clear_at(vx, vy, 0.55) and stub_clear(x, y, vx, vy):
                    spot = (vx, vy)
                    break
            if spot:
                break
        if not spot:
            print(f"!! no clear spot near {ref}.{num} ({x:.2f},{y:.2f})")
            continue
        vx, vy = spot
        tr = pcbnew.PCB_TRACK(board)
        tr.SetStart(pcbnew.VECTOR2I_MM(x, y))
        tr.SetEnd(pcbnew.VECTOR2I_MM(vx, vy))
        tr.SetWidth(pcbnew.FromMM(0.25))
        tr.SetLayer(pcbnew.F_Cu)
        tr.SetNetCode(gnd_code)
        board.Add(tr)
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I_MM(vx, vy))
        v.SetWidth(pcbnew.FromMM(0.5))
        v.SetDrill(pcbnew.FromMM(0.3))
        v.SetNetCode(gnd_code)
        board.Add(v)
        gnd_vias.append((vx, vy))
        copper.append(("VIA", vx, vy, vx, vy, 0.5, "GND"))
        added += 1
        print(f"{ref}.{num}: stitch via at ({vx:.2f},{vy:.2f})")

    filler = pcbnew.ZONE_FILLER(board)
    filler.Fill(board.Zones())
    pcbnew.SaveBoard(BOARD, board)
    print(f"added {added} stitch vias, zones refilled, saved")


if __name__ == "__main__":
    main()
