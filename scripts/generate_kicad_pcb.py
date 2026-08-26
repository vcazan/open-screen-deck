#!/usr/bin/env python3
"""
Generate the fab-ready 2-layer PCB for Open Screen Deck Rev E.

- 59.5 x 108.5 mm outline, uniform key grid (33.0 / 36.3 mm pitch)
- ESP32-S3-WROOM-1, USB-C, microSD, AMS1117 1A LDO
- 6x Molex PicoBlade 9P (mates the Waveshare in-box MX1.25 cable)
- Dual SPI: bus A = J1-J3 + SD, bus B = J4-J6
- 8x SK6812MINI-E RGB LEDs, LSM6DS3TR-C IMU, VEML7700 ALS,
  DRV2605L haptics + LRA connector, piezo, Qwiic port
- Every pad net-assigned (full ratsnest); GND pours F+B
- Signal routing via Freerouting, then scripts/stitch_gnd.py

Pin/net truth: hardware/pinout.py (cross-checked against firmware at
generation time — divergence refuses to build).

Run: python3 scripts/generate_kicad_pcb.py
"""

from __future__ import annotations

import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hardware"))
import pinout  # noqa: E402

OUT = ROOT / "hardware/pcb/data_streamdeck.kicad_pcb"
FP_ROOT = Path("/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints")
FP_LOCAL = ROOT / "hardware/pcb/footprints"

BOARD_W = pinout.BOARD_W
BOARD_H = pinout.BOARD_H
KEY_CENTRES = pinout.KEY_CENTRES
CORNER_CASE_HOLES = pinout.CORNER_CASE_HOLES

# Module mounting: modules keep their FACTORY brass standoffs; M2x5 screws
# from the carrier underside clamp them. Standoffs colliding with the
# ESP32 / USB-C / microSD are simply unscrewed. The 4 corner positions are
# the M2x25 case screws (see docs/mechanical_contract.md).
M2_SKIP = {
    (23.25, 32.58), (36.25, 32.58), (23.25, 39.62), (36.25, 39.62),  # under ESP32
    (23.25, 3.32), (36.25, 3.32),                                     # USB-C / rear strip
    (56.25, 68.88), (56.25, 75.92),                                   # microSD pads
    *{(round(x, 2), round(y, 2)) for x, y in CORNER_CASE_HOLES},      # case screws H1-H4
}


def m2_holes() -> list[tuple[float, float]]:
    out = []
    for kx, ky in KEY_CENTRES:
        for sx in (-pinout.STANDOFF_DX, pinout.STANDOFF_DX):
            for sy in (-pinout.STANDOFF_DY, pinout.STANDOFF_DY):
                p = (round(kx + sx, 2), round(ky + sy, 2))
                if p not in M2_SKIP:
                    out.append(p)
    return out


# ── Net list ─────────────────────────────────────────────────
NETS = [
    "",  # net 0 = unconnected
    "GND", "+3V3", "VBUS",
    # SPI bus A (J1-J3 + SD)
    "SCK_A", "MOSI_A", "DC_A", "MISO", "SD_CS",
    # SPI bus B (J4-J6)
    "SCK_B", "MOSI_B", "DC_B",
    # shared display lines
    "RST", "BL",
    # USB / system
    "USB_D+", "USB_D-", "BOOT", "EN", "CC1", "CC2",
    # I2C + sensors
    "SDA", "SCL", "IMU_INT",
    # LEDs
    "LED_DATA_3V3", "LED_DATA_5V",
    # haptics + piezo
    "HAPTIC_EN", "HAP_P", "HAP_N", "DRV_REG", "PIEZO", "PIEZO_BZ",
]
for _i in range(1, 7):
    NETS.extend([f"CS{_i}", f"KEY{_i}"])
NETS.extend([f"LED_CH{_i}" for _i in range(1, pinout.LED_COUNT)])
NC = {name: i for i, name in enumerate(NETS)}

# ── ESP32-S3-WROOM-1 pad -> net: derived from the canonical pinout ──
ESP32_PADS = pinout.esp32_pad_nets()

# USB-C GCT USB4105 (USB 2.0, top-mount horizontal — port exits board edge)
USBC_PADS = {
    "A1": "GND", "B1": "GND", "A12": "GND", "B12": "GND",
    "A4": "VBUS", "B4": "VBUS", "A9": "VBUS", "B9": "VBUS",
    "A5": "CC1", "B5": "CC2",
    "A6": "USB_D+", "B6": "USB_D+",
    "A7": "USB_D-", "B7": "USB_D-",
    "SH": "GND",
}

# microSD in SPI mode (Hirose DM3D-SF) — on SPI bus A
SD_PADS = {
    "2": "SD_CS", "3": "MOSI_A", "4": "+3V3", "5": "SCK_A",
    "6": "GND", "7": "MISO", "9": "GND", "SH": "GND",
}

LDO_PADS = {"1": "GND", "2": "+3V3", "3": "VBUS"}
BOOT_PADS = {"1": "BOOT", "2": "GND"}
RESET_PADS = {"1": "EN", "2": "GND"}
ESD_PADS = {"1": "USB_D+", "2": "GND", "3": "USB_D-", "4": "USB_D-", "5": "VBUS", "6": "USB_D+"}

# LSM6DS3TR-C (LGA-14): I2C mode — SDO/SA0 + CS strapped
IMU_PADS = {
    "1": "GND", "4": "IMU_INT", "5": "+3V3", "6": "GND", "7": "GND",
    "8": "+3V3", "12": "+3V3", "13": "SCL", "14": "SDA",
}
# VEML7700 (custom footprint): 1=SCL 2=VDD 3=GND 4=SDA
ALS_PADS = {"1": "SCL", "2": "+3V3", "3": "GND", "4": "SDA"}
# DRV2605L (MSOP-10)
DRV_PADS = {
    "1": "DRV_REG", "2": "SCL", "3": "SDA", "5": "HAPTIC_EN",
    "7": "HAP_P", "8": "GND", "9": "HAP_N", "10": "+3V3",
}
# 74AHCT1G125 (SOT-23-5): 1=OE(tied low) 2=A 3=GND 4=Y 5=VCC(5V)
LVL_PADS = {"1": "GND", "2": "LED_DATA_3V3", "3": "GND", "4": "LED_DATA_5V", "5": "VBUS"}
QWIIC_PADS = {"1": "GND", "2": "+3V3", "3": "SDA", "4": "SCL", "MP": "GND"}
LRA_PADS = {"1": "HAP_P", "2": "HAP_N", "MP": "GND"}
BUZZER_PADS = {"1": "PIEZO_BZ", "2": "GND"}

JST_PIN_NETS = {  # Waveshare: 1=KEY 2=DC 3=CS 4=SCLK 5=DIN 6=GND 7=VCC 8=PWM 9=RST
    "1": "KEY{n}", "2": "DC_{bus}", "3": "CS{n}", "4": "SCK_{bus}", "5": "MOSI_{bus}",
    "6": "GND", "7": "+3V3", "8": "BL", "9": "RST",
    "MP": "GND",
}

JST_PLACES = [
    (f"J{i+1}", KEY_CENTRES[i][0], KEY_CENTRES[i][1], 90 if i % 2 == 0 else 270)
    for i in range(6)
]

# LED placement: D1-D6 beside each key on the outer edges (glow escapes
# through enclosure side windows); D7/D8 flank the USB port on the rear.
LED_PLACES = {
    "D1": (3.0, KEY_CENTRES[0][1], 90),
    "D2": (56.5, KEY_CENTRES[1][1], 270),
    "D3": (3.0, KEY_CENTRES[2][1], 90),
    "D4": (56.5, KEY_CENTRES[3][1], 270),
    "D5": (3.0, KEY_CENTRES[4][1], 90),
    "D6": (56.5, KEY_CENTRES[5][1], 270),
    "D7": (20.5, 1.8, 0),
    "D8": (38.0, 1.8, 0),
}


def uid() -> str:
    return str(uuid.uuid4())


def read_mod(lib: str, name: str) -> str:
    local = FP_LOCAL / f"{lib}.pretty" / f"{name}.kicad_mod"
    if local.exists():
        return local.read_text()
    return (FP_ROOT / f"{lib}.pretty" / f"{name}.kicad_mod").read_text()


def find_balanced(text: str, start: int) -> int:
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
    lib: str, name: str, ref: str, value: str,
    x: float, y: float, rot: float = 0,
    pad_nets: dict[str, str] | None = None,
    ref_at: tuple[float, float] | None = None,
    ref_size: float | None = None,
) -> str:
    raw = read_mod(lib, name)
    raw = re.sub(r'^\(footprint "[^"]+"', f'(footprint "{lib}:{name}"', raw, count=1)
    raw = raw.replace('(property "Reference" "REF**"', f'(property "Reference" "{ref}"', 1)
    raw = re.sub(r'\(property "Value" "[^"]*"', f'(property "Value" "{value}"', raw, count=1)
    if ref_at is not None:
        # Reposition the REF silk text (footprint-relative coords) so it
        # never renders off the board edge — values copied from a KiCad save.
        rx, ry = ref_at
        raw = re.sub(
            r'(\(property "Reference" "[^"]+"\s*\n\s*)\(at [^)]*\)',
            lambda m: m.group(1) + f"(at {rx:g} {ry:g} 0)",
            raw, count=1,
        )
    if ref_size is not None:
        i = raw.find('(property "Reference"')
        j = raw.find("(font", i)
        seg = raw[j : j + 160]
        seg = re.sub(r"\(size [\d.]+ [\d.]+\)", f"(size {ref_size:g} {ref_size:g})", seg, count=1)
        seg = re.sub(r"\(thickness [\d.]+\)", f"(thickness {ref_size * 0.15:g})", seg, count=1)
        raw = raw[:j] + seg + raw[j + 160 :]
    insert = f'\t(uuid "{uid()}")\n\t(at {x:.4f} {y:.4f} {rot:g})\n'
    raw = raw.replace('\t(layer "F.Cu")\n', f'\t(layer "F.Cu")\n{insert}', 1)
    raw = process_pads(raw, pad_nets or {}, rot)
    return raw


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
    k = r * (1 - 0.7071)
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


def gr_text(text: str, x: float, y: float, layer: str = "F.SilkS", size: float = 1.0, rot: float = 0) -> str:
    # Back-silk text must carry the mirror flag or it reads reversed
    # when the board is viewed from the bottom.
    justify = " (justify mirror)" if layer.startswith("B.") else ""
    return (
        f'\t(gr_text "{text}" (at {x} {y} {rot:g}) (layer "{layer}") (uuid "{uid()}")\n'
        f"\t\t(effects (font (size {size} {size}) (thickness {size * 0.15:.3f})){justify})\n"
        f"\t)"
    )


def via(x: float, y: float, net: str) -> str:
    return (
        f'\t(via (at {x:.4f} {y:.4f}) (size 0.6) (drill 0.3) '
        f'(layers "F.Cu" "B.Cu") (net {NC[net]}) (uuid "{uid()}"))'
    )


def gnd_zone(layer: str) -> str:
    return f"""\t(zone (net {NC['GND']}) (net_name "GND") (layer "{layer}") (uuid "{uid()}") (hatch edge 0.5)
\t\t(connect_pads (clearance 0.2))
\t\t(min_thickness 0.25)
\t\t(filled_areas_thickness no)
\t\t(fill yes (thermal_gap 0.3) (thermal_bridge_width 0.4))
\t\t(polygon (pts (xy 0.4 0.4) (xy {BOARD_W - 0.4} 0.4) (xy {BOARD_W - 0.4} {BOARD_H - 0.4}) (xy 0.4 {BOARD_H - 0.4})))
\t)"""


def generate() -> str:
    fps: list[str] = []
    tracks: list[str] = []

    # ── Mounting holes ───────────────────────────────────────
    # H1/H2 sit on the rear edge: their REF text defaults above the circle,
    # which lands off-board — tuck it inboard instead.
    H_REF_AT = {1: (-0.65, 4.28), 2: (0.75, 4.28)}
    for i, (hx, hy) in enumerate(CORNER_CASE_HOLES, start=1):
        fps.append(embed_footprint("MountingHole", "MountingHole_2.2mm_M2", f"H{i}", "M2-corner-case-screw", hx, hy, ref_at=H_REF_AT.get(i)))
    for i, (hx, hy) in enumerate(m2_holes(), start=5):
        fps.append(embed_footprint("MountingHole", "MountingHole_2.2mm_M2", f"H{i}", "M2-module-standoff", hx, hy))

    # ── Rear service strip: USB-C, power, ESD, level shifter, buttons, Qwiic ──
    usb_x = pinout.USB_X
    fps.append(
        embed_footprint(
            "Connector_USB", "USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
            "J7", "USB4105-GF-A", usb_x, 3.1, 180, USBC_PADS,
        )
    )
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R7", "5.1k", 25.5, 9.5, 90, {"1": "CC1", "2": "GND"}))
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R8", "5.1k", 34.0, 9.5, 90, {"1": "CC2", "2": "GND"}))
    # Left rear: power chain spread along the edge (C8 | U2 | C7).
    # U2 sits at x=11.4 so its courtyard clears the H1 corner-screw
    # hardware keepout (3.0 mm radius for the M2 spacer/nut) while
    # staying off J1's housing overhang; C7 follows at x=17.4.
    fps.append(embed_footprint("Capacitor_SMD", "C_0805_2012Metric", "C8", "10uF", 3.6, 10.8, 90, {"1": "VBUS", "2": "GND"}))
    fps.append(embed_footprint("Package_TO_SOT_SMD", "SOT-223-3_TabPin2", "U2", "AMS1117-3.3", 11.4, 4.7, 0, LDO_PADS))
    fps.append(embed_footprint("Capacitor_SMD", "C_0805_2012Metric", "C7", "10uF", 17.4, 6.5, 90, {"1": "+3V3", "2": "GND"}))
    # USB ESD behind the connector (USB pad row ends y≈7.3)
    fps.append(embed_footprint("Package_TO_SOT_SMD", "SOT-23-6", "U3", "USBLC6-2SC6", usb_x, 9.8, 0, ESD_PADS))
    # LED level shifter + rail caps near the rear LED pair
    fps.append(embed_footprint("Package_TO_SOT_SMD", "SOT-23-5", "U7", "74AHCT1G125", 21.4, 8.8, 0, LVL_PADS))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C16", "100nF", 18.6, 9.6, 90, {"1": "VBUS", "2": "GND"}))
    fps.append(embed_footprint("Capacitor_SMD", "C_0805_2012Metric", "C17", "10uF", 23.6, 5.6, 90, {"1": "VBUS", "2": "GND"}))
    # BOOT + RESET side by side, then Qwiic exiting the rear wall
    # Buttons live on the FRONT strip (y=105.2) between standoffs H16 and
    # H4 — the rear strip has no room: the y=4.5 wall line is owned by D8
    # (rear LED) + J9 (Qwiic), and at y=9.5 the KMR2 bodies hit the J2
    # PicoBlade housing, which overhangs its mounting ears down to y≈8.8.
    fps.append(embed_footprint("Button_Switch_SMD", "SW_Push_1P1T_NO_CK_KMR2", "SW1", "BOOT", 42.5, 105.2, 0, BOOT_PADS))
    fps.append(embed_footprint("Button_Switch_SMD", "SW_Push_1P1T_NO_CK_KMR2", "SW2", "RESET", 49.0, 105.2, 0, RESET_PADS))
    fps.append(
        embed_footprint(
            "Connector_JST", "JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal",
            # x=49.0 keeps the housing 3.0 mm clear of the H2 corner-screw
            # hardware (M2 spacer/nut keepout)
            "J9", "Qwiic", 49.0, 3.1, 180, QWIIC_PADS,
        )
    )

    # ── microSD on right edge between J4 and J6 ────────────────────
    # Card mouth MUST face the x=59.5 board edge so the card passes
    # through the enclosure side-wall slot. In this footprint the card
    # protrudes toward local +y (F.Fab card outline); at rot=90 local +y
    # maps to board +x. rot=270 points the mouth INTO the board — that
    # was the Rev B/E bug. Guarded by check_sd_orientation.py.
    fps.append(
        embed_footprint(
            "Connector_Card", "microSD_HC_Hirose_DM3D-SF",
            "J8", "microSD", 52.0, 72.4, 90, SD_PADS,
        )
    )

    # ── ESP32-S3 module, rotated 90 in the row-0/row-1 corridor ─
    fps.append(
        embed_footprint(
            "RF_Module", "ESP32-S3-WROOM-1",
            "U1", "ESP32-S3-WROOM-1-N16R8", usb_x, 36.1, 90, ESP32_PADS,
        )
    )
    # Support parts below the module
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C9", "100nF", 25.5, 47.5, 0, {"1": "+3V3", "2": "GND"}))
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R9", "10k", 28.5, 47.5, 0, {"1": "+3V3", "2": "EN"}))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C11", "1uF", 31.5, 47.5, 0, {"1": "EN", "2": "GND"}))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C10", "100nF", 34.5, 47.5, 0, {"1": "+3V3", "2": "GND"}))

    # ── Sensor cluster in the row-1/row-2 corridor (under module overhang,
    #    9.7 mm standoff clearance) ──
    fps.append(embed_footprint("Package_LGA", "LGA-14_3x2.5mm_P0.5mm_LayoutBorder3x4y", "U4", "LSM6DS3TR-C", 20.5, 72.4, 0, IMU_PADS, ref_at=(-3.6, -2.6), ref_size=0.8))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C13", "100nF", 17.0, 72.4, 90, {"1": "+3V3", "2": "GND"}))
    fps.append(embed_footprint("Package_SO", "MSOP-10_3x3mm_P0.5mm", "U6", "DRV2605L", 31.5, 72.4, 0, DRV_PADS, ref_at=(-3.9, -2.6), ref_size=0.8))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C15", "100nF", 28.0, 72.4, 90, {"1": "+3V3", "2": "GND"}))
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C12", "1uF", 35.2, 72.4, 90, {"1": "DRV_REG", "2": "GND"}))
    fps.append(
        embed_footprint(
            "Connector_JST", "JST_SH_SM02B-SRSS-TB_1x02-1MP_P1.00mm_Horizontal",
            "J10", "LRA motor", 41.5, 72.4, 270, LRA_PADS,
        )
    )
    # Piezo + series resistor, centre column under row-2 module
    fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", "R10", "100R", usb_x, 78.3, 0, {"1": "PIEZO", "2": "PIEZO_BZ"}))
    # KiCad ships no .step for the CPT-9019S — swap in the same-size Murata
    # 9x9 piezo body so BZ1 is visible in 3D renders.
    bz = embed_footprint("Buzzer_Beeper", "Buzzer_CUI_CPT-9019S-SMT", "BZ1", "CPT-9019S", usb_x, 84.5, 0, BUZZER_PADS)
    bz = bz.replace(
        "Buzzer_Beeper.3dshapes/Buzzer_CUI_CPT-9019S-SMT.step",
        "Buzzer_Beeper.3dshapes/Buzzer_Murata_PKMCS0909E.step",
    )
    fps.append(bz)

    # ── Ambient light sensor: side-view package looks out the front wall ──
    fps.append(embed_footprint("OpenScreenDeck", "VEML7700-TT", "U5", "VEML7700", usb_x, 106.6, 180, ALS_PADS, ref_at=(0.0, 2.5)))
    # x=19.8 keeps C14 out of the H14 module-standoff foot keepout (2.5 mm)
    fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C14", "100nF", 19.8, 107.2, 0, {"1": "+3V3", "2": "GND"}))

    # ── SK6812 LED chain (order = pinout.LED_CHAIN_REFS) ──
    chain_nets = ["LED_DATA_5V"] + [f"LED_CH{i}" for i in range(1, pinout.LED_COUNT)]
    for pos, ref in enumerate(pinout.LED_CHAIN_REFS):
        din = chain_nets[pos]
        dout = chain_nets[pos + 1] if pos + 1 < pinout.LED_COUNT else None
        pads = {"1": "GND", "3": "VBUS", "4": din}
        if dout:
            pads["2"] = dout
        x, y, rot = LED_PLACES[ref]
        # Edge LEDs: default REF position lands off the board outline, so
        # push it inboard (footprint-relative; matches KiCad-saved values).
        led_ref_at = {90: (4.05, 0.0), 270: (-4.05, 0.0), 0: (0.0, 3.5)}[rot]
        # SK6812MINI-C (pads under body) — the -E variant's outward legs
        # mismatch this footprint (JLC DFM flagged weak joints on Rev E).
        led = embed_footprint(
            "LED_SMD", "LED_SK6812MINI_PLCC4_3.5x3.5mm_P1.75mm",
            ref, "SK6812MINI-C", x, y, rot, pads, ref_at=led_ref_at,
        )
        # KiCad ships no .step for this footprint, so swap in the same-size
        # WS2812B-Mini body — otherwise the LEDs are invisible in 3D renders.
        led = led.replace(
            "LED_SMD.3dshapes/LED_SK6812MINI_PLCC4_3.5x3.5mm_P1.75mm.step",
            "LED_SMD.3dshapes/LED_WS2812B-Mini_PLCC4_3.5x3.5mm.step",
        )
        fps.append(led)

    # ── ScreenKey connectors + per-module decoupling + KEY pull-ups ─
    for ref, jx, jy, rot in JST_PLACES:
        idx = int(ref[1])
        bus = pinout.PANEL_BUS[idx - 1]
        pads = {k: v.format(n=idx, bus=bus) for k, v in JST_PIN_NETS.items()}
        fps.append(embed_footprint("Connector_Molex", "Molex_PicoBlade_53261-0971_1x09-1MP_P1.25mm_Horizontal", ref, f"ScreenKey {idx}", jx, jy, rot, pads))
        if rot == 90:  # left column
            fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", f"C{idx}", "100nF", 9.25, jy - 4.0, 90, {"1": "+3V3", "2": "GND"}))
            fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", f"R{idx}", "10k", 9.25, jy + 4.0, 270, {"1": "+3V3", "2": f"KEY{idx}"}))
        else:  # right column
            if idx == 4:
                # J4's default cap spot is walled in by the microSD/USB routing
                # canyon (KEY4/RST verticals) with no GND access, and the old
                # fallback collided with J4's housing (JLC DFM, Rev E). C4 sits
                # west of the connector, tapping the B.Cu 3V3 feed at y=56.49.
                fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", "C4", "100nF", 39.9, 56.49, 180, {"1": "+3V3", "2": "GND"}))
            else:
                fps.append(embed_footprint("Capacitor_SMD", "C_0402_1005Metric", f"C{idx}", "100nF", 50.25, jy - 4.0, 90, {"1": "+3V3", "2": "GND"}))
            fps.append(embed_footprint("Resistor_SMD", "R_0402_1005Metric", f"R{idx}", "10k", 50.25, jy + 4.0, 270, {"1": "+3V3", "2": f"KEY{idx}"}))

    # ── Board outline ────────────────────────────────────────
    tracks += rounded_outline(BOARD_W, BOARD_H, 4.0)

    # ── Silkscreen markings ──────────────────────────────────
    tracks.append(gr_text("OPEN SCREEN DECK", usb_x, 51.5, "F.SilkS", 1.4))
    tracks.append(gr_text("LITEHAWK LABS  ·  REV E  ·  2026", usb_x, 54.2, "F.SilkS", 0.9))
    tracks.append(gr_text("OPEN SCREEN DECK · REV E", usb_x, 54.25, "B.SilkS", 1.6))
    tracks.append(gr_text("vcazan.github.io/open-screen-deck", usb_x, 57.4, "B.SilkS", 1.0))

    # Functional labels — key numbers in the clear outer columns, plus
    # every human-facing connector/control named on the front silk.
    for idx, (lx, ly) in enumerate(
        [(6.8, 17.95), (52.8, 17.95), (6.8, 54.25), (52.8, 54.25), (6.8, 90.55), (52.8, 90.55)], 1
    ):
        tracks.append(gr_text(f"KEY {idx}", lx, ly, "F.SilkS", 1.0, 90))
    tracks.append(gr_text("BOOT", 42.5, 101.6, "F.SilkS", 0.8))
    tracks.append(gr_text("RESET", 49.0, 101.6, "F.SilkS", 0.8))
    tracks.append(gr_text("QWIIC I2C", 49.0, 8.8, "F.SilkS", 0.8))
    tracks.append(gr_text("LRA", 41.5, 77.0, "F.SilkS", 0.8))
    tracks.append(gr_text("microSD", 53.5, 63.8, "F.SilkS", 0.8))
    tracks.append(gr_text("BUZZER", usb_x, 91.0, "F.SilkS", 0.8))
    # IC role labels — reads together with the (repositioned) REF text,
    # e.g. "U4 IMU" / "U6 HAPTIC" on one line.
    tracks.append(gr_text("LDO", 6.8, 9.9, "F.SilkS", 0.8))
    tracks.append(gr_text("ESD", usb_x, 12.6, "F.SilkS", 0.8))
    tracks.append(gr_text("LED BUF", 21.4, 11.6, "F.SilkS", 0.8))
    tracks.append(gr_text("IMU", 19.5, 69.8, "F.SilkS", 0.8))
    tracks.append(gr_text("HAPTIC", 31.5, 69.8, "F.SilkS", 0.8))
    tracks.append(gr_text("LIGHT", usb_x, 102.5, "F.SilkS", 0.8))
    # NOTE after FORCE_REGEN: re-import the back-silk LiteHawk logo —
    #   magick assets/litehawk-logo.png -background white -alpha remove \
    #     -alpha off -colorspace Gray -threshold 60% -flop /tmp/logo.pbm
    #   potrace -s -o /tmp/litehawk-logo.svg /tmp/logo.pbm
    #   then MCP import_svg_logo onto B.SilkS at (17.75, 26), width 24.

    zones = [gnd_zone("F.Cu"), gnd_zone("B.Cu")]
    # stitch vias kept clear of the module M2 hole pattern
    stitch = [via(x, y, "GND") for x, y in [(4.7, 33), (4.7, 60), (54.8, 33), (44, 60), (usb_x, 62), (usb_x, 97)]]

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


def check_dangling_nets(board: str) -> None:
    """Every signal net must land on ≥2 pads, or the board can pass DRC
    while a connector pin floats (Rev B–D shipped with CS2/CS3 dangling:
    KiCad reports "0 unconnected pads" for a single-pad net)."""
    counts: dict[str, int] = {}
    for m in re.finditer(r'\(pad\s+"[^"]+"', board):
        pad = board[m.start() : find_balanced(board, m.start())]
        nm = re.search(r'\(net\s+(?:\d+\s+)?"([^"]+)"\)', pad)
        if nm:
            counts[nm.group(1)] = counts.get(nm.group(1), 0) + 1
    # every declared signal net must exist AND have >=2 pads
    expected = {n for n in NETS if n} | set(counts)
    dangling = sorted(
        n for n in expected if counts.get(n, 0) < 2 and n not in ("GND", "+3V3", "VBUS")
    )
    if dangling:
        raise SystemExit(f"!! dangling nets (single pad, invisible to DRC): {dangling}")


def main() -> None:
    pinout.check_firmware_config()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    board = generate()
    check_dangling_nets(board)
    OUT.write_text(board)
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
