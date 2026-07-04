#!/usr/bin/env python3
"""
Generate fab-ready 2-layer PCB for Open Screen Deck (Tier B).

- 55 x 112 mm outline, 4x corner M2 case-screw holes + 12x M2 standoff holes
- ESP32-S3-WROOM-1 (soldered), USB-C, microSD, AP2112K LDO
- 6x Molex PicoBlade 9P (mates the Waveshare in-box MX1.25 cable)
- Every pad net-assigned (full ratsnest); GND pours F+B; 5V/3V3 routed
- Signal routing is completed interactively in KiCad (ratsnest guides it)

Run: python3 scripts/generate_kicad_pcb.py
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "hardware/pcb/data_streamdeck.kicad_pcb"
FP_ROOT = Path("/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints")

BOARD_W = 55.0
BOARD_H = 112.0

# Module mounting: modules keep their FACTORY brass standoffs (threaded
# into the internal nuts, female tips). M2x5 screws from the carrier
# underside clamp the standoff tips to the carrier — Waveshare's intended
# mounting, zero extra parts. Standoffs whose position collides with the
# ESP32 / USB-C / microSD are simply unscrewed (2-3 fixing points per
# module is ample).
#
# Case fastening: the 4 outermost standoff positions (the deck corners)
# are the CASE screws — one long M2 per corner runs bottom-case → carrier
# → corner-module soldered nut → heat-set insert in the top shell,
# clamping the whole sandwich. See docs/mechanical_contract.md.
KEY_CENTRES = [(13.0, 17.6), (41.9, 17.6), (13.0, 55.9), (41.9, 55.9), (13.0, 94.2), (41.9, 94.2)]
CORNER_CASE_HOLES = [(2.0, 4.95), (52.9, 4.95), (2.0, 106.85), (52.9, 106.85)]
M2_SKIP = {
    (24.0, 30.25), (30.9, 30.25), (24.0, 43.25), (30.9, 43.25),  # under ESP32
    (24.0, 4.95), (30.9, 4.95),                                   # USB-C pad field
    (52.9, 68.55), (52.9, 81.55),                                 # microSD pads
    *CORNER_CASE_HOLES,                                           # corner case screws (H1-H4)
}


def m2_holes() -> list[tuple[float, float]]:
    out = []
    for kx, ky in KEY_CENTRES:
        for sx in (-11.0, 11.0):
            for sy in (-12.65, 12.65):
                p = (round(kx + sx, 2), round(ky + sy, 2))
                if p not in M2_SKIP:
                    out.append(p)
    return out

# ── Net list ─────────────────────────────────────────────────
NETS = [
    "",  # net 0 = unconnected
    "GND",
    "+3V3",
    "VBUS",
    "SCK",
    "MOSI",
    "MISO",
    "DC",
    "RST",
    "BL",
    "USB_D+",
    "USB_D-",
    "SD_CS",
    "BOOT",
    "EN",
    "CC1",
    "CC2",
]
for _i in range(1, 7):
    NETS.extend([f"CS{_i}", f"KEY{_i}"])
NC = {name: i for i, name in enumerate(NETS)}

# ── ESP32-S3-WROOM-1 pad -> net (per Espressif datasheet & firmware pinmap) ──
ESP32_PADS = {
    "1": "GND",
    "2": "+3V3",
    "3": "EN",
    "4": "CS5",      # IO4
    "5": "CS6",      # IO5
    "8": "MISO",     # IO15
    "9": "SD_CS",    # IO16
    "13": "USB_D-",  # IO19
    "14": "USB_D+",  # IO20
    "15": "CS4",     # IO3
    "18": "CS1",     # IO10
    "19": "MOSI",    # IO11
    "20": "SCK",     # IO12
    "21": "BL",      # IO13
    "22": "DC",      # IO14
    "23": "RST",     # IO21
    "24": "KEY6",    # IO47
    "27": "BOOT",    # IO0
    "31": "KEY1",    # IO38
    "32": "KEY2",    # IO39
    "33": "KEY3",    # IO40
    "34": "KEY4",    # IO41
    "35": "KEY5",    # IO42
    "40": "GND",
    "41": "GND",     # thermal pad
}

# USB-C GCT USB4105 (USB 2.0, top-mount horizontal — port exits board edge)
USBC_PADS = {
    "A1": "GND", "B1": "GND", "A12": "GND", "B12": "GND",
    "A4": "VBUS", "B4": "VBUS", "A9": "VBUS", "B9": "VBUS",
    "A5": "CC1", "B5": "CC2",
    "A6": "USB_D+", "B6": "USB_D+",
    "A7": "USB_D-", "B7": "USB_D-",
    "SH": "GND",
}

# microSD in SPI mode (Hirose DM3D-SF)
SD_PADS = {
    "2": "SD_CS",   # DAT3/CS
    "3": "MOSI",    # CMD/DI
    "4": "+3V3",    # VDD
    "5": "SCK",     # CLK
    "6": "GND",     # VSS
    "7": "MISO",    # DAT0/DO
    "9": "GND",     # detect switch A (to GND)
    "SH": "GND",
}

# AMS1117-3.3 (SOT-223): 1=GND, 2=VOUT(+tab), 3=VIN — 1A for display+SD headroom
LDO_PADS = {"1": "GND", "2": "+3V3", "3": "VBUS"}
BOOT_PADS = {"1": "BOOT", "2": "GND"}
RESET_PADS = {"1": "EN", "2": "GND"}
# USBLC6-2SC6 ESD array: 1=I/O1 2=GND 3=I/O2 4=I/O2 5=VBUS 6=I/O1
ESD_PADS = {"1": "USB_D+", "2": "GND", "3": "USB_D-", "4": "USB_D-", "5": "VBUS", "6": "USB_D+"}

JST_PIN_NETS = {  # Waveshare: 1=KEY 2=DC 3=CS 4=SCLK 5=DIN 6=GND 7=VCC 8=PWM 9=RST
    "1": "KEY?", "2": "DC", "3": "CS?", "4": "SCK", "5": "MOSI",
    "6": "GND", "7": "+3V3", "8": "BL", "9": "RST",
    "MP": "GND",
}

JST_PLACES = [
    ("J1", 13.0, 17.6, 90),
    ("J2", 41.9, 17.6, 270),
    ("J3", 13.0, 55.9, 90),
    ("J4", 41.9, 55.9, 270),
    ("J5", 13.0, 94.2, 90),
    ("J6", 41.9, 94.2, 270),
]


def uid() -> str:
    return str(uuid.uuid4())


def read_mod(lib: str, name: str) -> str:
    return (FP_ROOT / f"{lib}.pretty" / f"{name}.kicad_mod").read_text()


def find_balanced(text: str, start: int) -> int:
    """Return index just past the closing paren of the s-expr at `start`."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
    raise ValueError("unbalanced s-expression")


def process_pads(body: str, pad_nets: dict[str, str], rot: float) -> str:
    """Assign nets and fold footprint rotation into each pad's angle."""
    out: list[str] = []
    pos = 0
    pat = re.compile(r'\(pad "([^"]+)"')
    while True:
        m = pat.search(body, pos)
        if not m:
            out.append(body[pos:])
            break
        end = find_balanced(body, m.start())
        out.append(body[pos : m.start()])
        block = body[m.start() : end]

        if rot:
            def fix_at(am: re.Match[str]) -> str:
                x, y = am.group(1), am.group(2)
                a = float(am.group(3) or 0)
                return f"(at {x} {y} {(a + rot) % 360:g})"

            block = re.sub(
                r"\(at ([-\d.]+) ([-\d.]+)(?: ([-\d.]+))?\)", fix_at, block, count=1
            )

        net = pad_nets.get(m.group(1))
        if net:
            block = block[:-1].rstrip() + f'\n\t\t(net {NC[net]} "{net}")\n\t)'
        out.append(block)
        pos = end
    return "".join(out)


def embed_footprint(
    lib: str,
    name: str,
    ref: str,
    value: str,
    x: float,
    y: float,
    rot: float = 0,
    pad_nets: dict[str, str] | None = None,
) -> str:
    raw = read_mod(lib, name)
    raw = re.sub(r'^\(footprint "[^"]+"', f'(footprint "{lib}:{name}"', raw, count=1)
    raw = raw.replace('(property "Reference" "REF**"', f'(property "Reference" "{ref}"', 1)
    raw = re.sub(r'\(property "Value" "[^"]*"', f'(property "Value" "{value}"', raw, count=1)
    insert = f'\t(uuid "{uid()}")\n\t(at {x:.4f} {y:.4f} {rot:g})\n'
    raw = raw.replace('\t(layer "F.Cu")\n', f'\t(layer "F.Cu")\n{insert}', 1)
    raw = process_pads(raw, pad_nets or {}, rot)
    return raw


def seg(x1: float, y1: float, x2: float, y2: float, w: float, net: str, layer: str = "F.Cu") -> str:
    return (
        f'\t(segment (start {x1:.4f} {y1:.4f}) (end {x2:.4f} {y2:.4f}) '
        f'(width {w}) (layer "{layer}") (net {NC[net]}) (uuid "{uid()}"))'
    )


def polyline(points: list[tuple[float, float]], w: float, net: str, layer: str = "F.Cu") -> list[str]:
    return [seg(a[0], a[1], b[0], b[1], w, net, layer) for a, b in zip(points, points[1:])]


def via(x: float, y: float, net: str) -> str:
    return (
        f'\t(via (at {x:.4f} {y:.4f}) (size 0.6) (drill 0.3) '
        f'(layers "F.Cu" "B.Cu") (net {NC[net]}) (uuid "{uid()}"))'
    )


def edge(x1: float, y1: float, x2: float, y2: float) -> str:
    return (
        f'\t(gr_line (start {x1} {y1}) (end {x2} {y2}) '
        f'(stroke (width 0.1) (type default)) (layer "Edge.Cuts") (uuid "{uid()}"))'
    )


def edge_arc(x1: float, y1: float, xm: float, ym: float, x2: float, y2: float) -> str:
    return (
        f'\t(gr_arc (start {x1} {y1}) (mid {xm} {ym}) (end {x2} {y2}) '
        f'(stroke (width 0.1) (type default)) (layer "Edge.Cuts") (uuid "{uid()}"))'
    )


def rounded_outline(w: float, h: float, r: float) -> list[str]:
    """Board outline with rounded corners (matches the rounded enclosure)."""
    k = r * (1 - 0.7071)  # arc midpoint inset
    return [
        edge(r, 0, w - r, 0),
        edge_arc(w - r, 0, w - k, k, w, r),
        edge(w, r, w, h - r),
        edge_arc(w, h - r, w - k, h - k, w - r, h),
        edge(w - r, h, r, h),
        edge_arc(r, h, k, h - k, 0, h - r),
        edge(0, h - r, 0, r),
        edge_arc(0, r, k, k, r, 0),
    ]


def gnd_zone(layer: str) -> str:
    return f"""\t(zone (net {NC['GND']}) (net_name "GND") (layer "{layer}") (uuid "{uid()}") (hatch edge 0.5)
\t\t(connect_pads (clearance 0.2))
\t\t(min_thickness 0.25)
\t\t(filled_areas_thickness no)
\t\t(fill yes (thermal_gap 0.3) (thermal_bridge_width 0.4))
\t\t(polygon (pts (xy 0.4 0.4) (xy {BOARD_W - 0.4} 0.4) (xy {BOARD_W - 0.4} {BOARD_H - 0.4}) (xy 0.4 {BOARD_H - 0.4})))
\t)"""


def jst_pad_xy(jx: float, jy: float, rot: int, pin: int) -> tuple[float, float]:
    """Pad centre of JST GH pin (local pin1 at (-5,-1.85), pitch 1.25 in +x)."""
    lx = -5 + 1.25 * (pin - 1)
    ly = -1.85
    if rot == 90:   # (px,py) -> (py,-px)
        return jx + ly, jy - lx
    if rot == 270:  # (px,py) -> (-py,px)
        return jx - ly, jy + lx
    return jx + lx, jy + ly


def generate() -> str:
    fps: list[str] = []
    tracks: list[str] = []

    # ── Mounting holes ───────────────────────────────────────
    for i, (hx, hy) in enumerate(CORNER_CASE_HOLES, start=1):
        fps.append(embed_footprint("MountingHole", "MountingHole_2.2mm_M2", f"H{i}", "M2-corner-case-screw", hx, hy))
    for i, (hx, hy) in enumerate(m2_holes(), start=5):
        fps.append(embed_footprint("MountingHole", "MountingHole_2.2mm_M2", f"H{i}", "M2-module-standoff", hx, hy))

    # ── Rear cluster: USB-C, CC pulldowns, LDO, BOOT ──────────
    # USB4105 horizontal: rot 180 points the port out the rear (Y=0) edge;
    # footprint's "PCB Edge" marker (local y=3.1) lands exactly on the edge.
    fps.append(
        embed_footprint(
            "Connector_USB", "USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
            "J7", "USB4105-GF-A", 27.5, 3.1, 180, USBC_PADS,
        )
    )
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R7", "5.1k", 20.5, 9.5, 90, {"1": "CC1", "2": "GND"}))
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R8", "5.1k", 34.5, 9.5, 90, {"1": "CC2", "2": "GND"}))
    # Left rear: power chain spread along the edge (C8 | U2 | C7),
    # clear of the H1 ring (ends x/y=7.2) and J1 courtyard (starts 9.75)
    fps.append(embed_footprint("Capacitor_SMD", "C_0805_2012Metric", "C8", "10uF", 6.5, 9.8, 90, {"1": "VBUS", "2": "GND"}))
    fps.append(embed_footprint("Package_TO_SOT_SMD", "SOT-223-3_TabPin2", "U2", "AMS1117-3.3", 14.0, 5.5, 90, LDO_PADS))
    fps.append(embed_footprint("Capacitor_SMD", "C_0805_2012Metric", "C7", "10uF", 19.0, 6.5, 90, {"1": "+3V3", "2": "GND"}))
    # USB ESD directly behind the connector, inline with D+/D-
    fps.append(
        embed_footprint(
            "Package_TO_SOT_SMD", "SOT-23-6",
            "U3", "USBLC6-2SC6", 27.5, 8.6, 0, ESD_PADS,
        )
    )
    # BOOT + RESET: small C&K KMR2 (4.2x2.8) side by side, clear of H2
    fps.append(
        embed_footprint(
            "Button_Switch_SMD", "SW_Push_1P1T_NO_CK_KMR2",
            "SW1", "BOOT", 37.5, 4.0, 0, BOOT_PADS,
        )
    )
    fps.append(
        embed_footprint(
            "Button_Switch_SMD", "SW_Push_1P1T_NO_CK_KMR2",
            "SW2", "RESET", 43.5, 4.0, 0, RESET_PADS,
        )
    )

    # ── microSD on right edge between J4 and J6; card ejects right ─
    # Kept clear of the ESP32 module (≥6 mm) for hand assembly / rework
    fps.append(
        embed_footprint(
            "Connector_Card", "microSD_HC_Hirose_DM3D-SF",
            "J8", "microSD", 47.5, 75.0, 270, SD_PADS,
        )
    )

    # ── ESP32-S3 module, rotated 90 to fit between JST columns ─
    # NOTE: antenna faces rear-left over pour; WiFi unused in v1 (USB product)
    # Centred in the J1/J2 ↔ J3/J4 corridor (pads end y=22.6, start y=50.9)
    fps.append(
        embed_footprint(
            "RF_Module", "ESP32-S3-WROOM-1",
            "U1", "ESP32-S3-WROOM-1-N16R8", 27.5, 36.7, 90, ESP32_PADS,
        )
    )
    # Support parts in the row gap below the module (body ends y=49.45)
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C9", "100nF", 23.5, 51.5, 0, {"1": "+3V3", "2": "GND"}))
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R9", "10k", 27.0, 51.5, 0, {"1": "+3V3", "2": "EN"}))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C11", "1uF", 30.0, 51.5, 0, {"1": "EN", "2": "GND"}))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C10", "100nF", 33.0, 51.5, 0, {"1": "+3V3", "2": "GND"}))

    # ── ScreenKey connectors + per-module decoupling + KEY pull-ups ─
    # Left column: 3V3 trunk x=7, parts x=9, pin pads x=11.15
    # Right column: 3V3 trunk x=48, parts x=46, pin pads x=43.75
    for ref, jx, jy, rot in JST_PLACES:
        idx = int(ref[1])
        pads = {k: v.replace("?", str(idx)) for k, v in JST_PIN_NETS.items()}
        # Molex PicoBlade = the "MX1.25" on the Waveshare module itself, so the
        # 200 mm cable included in every module box plugs straight in.
        fps.append(embed_footprint("Connector_Molex", "Molex_PicoBlade_53261-0971_1x09-1MP_P1.25mm_Horizontal", ref, f"ScreenKey {idx}", jx, jy, rot, pads))
        if rot == 90:  # left
            fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", f"C{idx}", "100nF", 9.0, jy - 4.0, 90, {"1": "+3V3", "2": "GND"}))
            fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", f"R{idx}", "10k", 9.0, jy + 4.0, 270, {"1": "+3V3", "2": f"KEY{idx}"}))
        else:  # right
            # C6 sits +0.3 lower than the pattern: routing needs its GND pad
            # clear of the MOSI run on B.Cu (see routed board)
            cy = jy + 0.3 if idx == 6 else jy - 3.0
            fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", f"C{idx}", "100nF", 46.0, cy, 90, {"1": "+3V3", "2": "GND"}))
            fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", f"R{idx}", "10k", 46.0, jy - 7.0, 270, {"1": "+3V3", "2": f"KEY{idx}"}))

    # ── Board outline ────────────────────────────────────────
    # rounded corners (r=4) so the board clears the rounded enclosure corners
    tracks += rounded_outline(BOARD_W, BOARD_H, 4.0)

    # ── Seed routing ─────────────────────────────────────────
    # USB4105 merges A/B VBUS+GND pads physically; D+/D- pair bridges are
    # interleaved and left to Freerouting (it uses vias where needed).

    zones = [gnd_zone("F.Cu"), gnd_zone("B.Cu")]
    # stitch vias kept clear of the module M2 hole pattern
    stitch = [via(x, y, "GND") for x, y in [(4.5, 32), (3, 74), (50, 32), (52, 74), (27.5, 60), (27.5, 90)]]

    net_decls = "\n".join(f'\t(net {i} "{n}")' for i, n in enumerate(NETS))
    body = "\n".join(fps + tracks + stitch + zones)

    return f"""(kicad_pcb
\t(version 20241229)
\t(generator "generate_kicad_pcb.py")
\t(generator_version "9.0")
\t(general (thickness 1.6) (legacy_teardrops no))
\t(paper "A4")
\t(layers
\t\t(0 "F.Cu" signal)
\t\t(2 "B.Cu" signal)
\t\t(5 "F.SilkS" user "F.Silkscreen")
\t\t(7 "B.SilkS" user "B.Silkscreen")
\t\t(1 "F.Mask" user)
\t\t(3 "B.Mask" user)
\t\t(13 "F.Paste" user)
\t\t(15 "B.Paste" user)
\t\t(25 "Edge.Cuts" user)
\t\t(31 "F.CrtYd" user "F.Courtyard")
\t\t(29 "B.CrtYd" user "B.Courtyard")
\t\t(35 "F.Fab" user)
\t\t(33 "B.Fab" user)
\t)
\t(setup
\t\t(pad_to_mask_clearance 0)
\t\t(pcbplotparams
\t\t\t(layerselection 0x00000000_00000000_55555555_5755f5ff)
\t\t\t(plot_on_all_layers_selection 0x00000000_00000000_00000000_00000000)
\t\t\t(usegerberextensions no)
\t\t\t(usegerberattributes yes)
\t\t\t(usegerberadvancedattributes yes)
\t\t\t(creategerberjobfile yes)
\t\t\t(outputdirectory "gerbers")
\t\t)
\t)
{net_decls}
{body}
\t(embedded_fonts no)
)
"""


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(generate())
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
