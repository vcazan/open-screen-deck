#!/usr/bin/env python3
"""
Generate the KiCad 9 schematic for Open Screen Deck Rev E.

All pins/nets derive from hardware/pinout.py (the single pinout truth);
this script refuses to run if firmware/config.h disagrees with it.

Style: every component pin gets a short wire + global label, so the
exported netlist fully documents connectivity (the pre-Gerber gate diffs
it against the PCB pads).
"""

from __future__ import annotations

import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hardware"))
import pinout  # noqa: E402

OUT = ROOT / "hardware/pcb/data_streamdeck.kicad_sch"
KICAD_SYM = Path("/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols")

PROJECT = "data_streamdeck"
SHEET_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"

# Waveshare module connector: pin -> (signal, net template).
# {bus} -> A for J1-J3 / B for J4-J6; {n} -> module index.
KEY_PIN_NETS = [
    ("KEY", "KEY{n}"),
    ("DC", "DC_{bus}"),
    ("CS", "CS{n}"),
    ("SCLK", "SCK_{bus}"),
    ("DIN", "MOSI_{bus}"),
    ("GND", "GND"),
    ("VCC", "+3.3V"),
    ("PWM", "BL"),
    ("RST", "RST"),
]


def uid() -> str:
    return str(uuid.uuid4())


# ── Symbol library handling ──────────────────────────────────────────

_sym_cache: dict[tuple[str, str], str] = {}


def extract_symbol(lib: str, name: str) -> str:
    key = (lib, name)
    if key in _sym_cache:
        return _sym_cache[key]
    data = (KICAD_SYM / f"{lib}.kicad_sym").read_text()
    idx = data.find(f'(symbol "{name}"')
    if idx == -1:
        raise ValueError(f"Symbol {name!r} not found in {lib}")
    depth = 0
    for i in range(idx, len(data)):
        if data[i] == "(":
            depth += 1
        elif data[i] == ")":
            depth -= 1
            if depth == 0:
                _sym_cache[key] = data[idx : i + 1]
                return _sym_cache[key]
    raise ValueError(f"Unbalanced s-expression for {name}")


def geometry_source(lib: str, name: str) -> str:
    """Resolve `extends` so derived symbols expose their parent's pins."""
    body = extract_symbol(lib, name)
    m = re.search(r'\(extends "([^"]+)"\)', body)
    return extract_symbol(lib, m.group(1)) if m else body


def symbol_pins(lib: str, name: str) -> dict[str, tuple[float, float, int]]:
    """pin number -> (x, y, rot) in symbol coordinates (y-up)."""
    body = geometry_source(lib, name)
    pins: dict[str, tuple[float, float, int]] = {}
    for m in re.finditer(
        r'\(pin\s+\S+\s+\S+\s*\(at ([-\d.]+) ([-\d.]+) (\d+)\)'
        r'[\s\S]{0,400}?\(number "([^"]+)"',
        body,
    ):
        num = m.group(4)
        if num not in pins:
            pins[num] = (float(m.group(1)), float(m.group(2)), int(m.group(3)))
    return pins


def lib_symbol(lib: str, name: str) -> str:
    """Embed a symbol, flattening `extends` (kicad-cli does not resolve
    derived symbols inside a schematic's lib_symbols section)."""
    body = extract_symbol(lib, name)
    m = re.search(r'\(extends "([^"]+)"\)', body)
    if m:
        parent = m.group(1)
        body = extract_symbol(lib, parent)
        body = body.replace(f'(symbol "{parent}_', f'(symbol "{name}_')
        body = body.replace(f'(symbol "{parent}"', f'(symbol "{name}"', 1)
    return body.replace(f'(symbol "{name}"', f'(symbol "{lib}:{name}"', 1)


# ── Schematic primitives ─────────────────────────────────────────────

def wire(x1: float, y1: float, x2: float, y2: float) -> str:
    return (
        f"\t(wire (pts (xy {x1:.3f} {y1:.3f}) (xy {x2:.3f} {y2:.3f}))\n"
        f"\t\t(stroke (width 0) (type default))\n"
        f'\t\t(uuid "{uid()}"))'
    )


def global_label(name: str, x: float, y: float, justify: str = "right") -> str:
    rot = 180 if justify == "right" else 0
    return (
        f'\t(global_label "{name}"\n'
        f"\t\t(at {x:.3f} {y:.3f} {rot})\n"
        f"\t\t(fields_autoplaced yes)\n"
        f"\t\t(effects (font (size 1.27 1.27)) (justify {justify}))\n"
        f'\t\t(uuid "{uid()}")\n'
        f'\t\t(property "Intersheets References" ""\n'
        f"\t\t\t(at {x:.3f} {y:.3f} {rot})\n"
        f"\t\t\t(effects (font (size 1.27 1.27)) (justify {justify}) hide))\n"
        f"\t)"
    )


def no_connect(x: float, y: float) -> str:
    return f'\t(no_connect (at {x:.3f} {y:.3f}) (uuid "{uid()}"))'


def symbol_instance(
    lib_id: str, ref: str, value: str, at_x: float, at_y: float,
    footprint: str, pin_numbers: list[str],
) -> str:
    lines = [
        "\t(symbol",
        f'\t\t(lib_id "{lib_id}")',
        f"\t\t(at {at_x:.3f} {at_y:.3f} 0)",
        "\t\t(unit 1)",
        "\t\t(exclude_from_sim no)",
        "\t\t(in_bom yes)",
        "\t\t(on_board yes)",
        "\t\t(dnp no)",
        f'\t\t(uuid "{uid()}")',
        f'\t\t(property "Reference" "{ref}"',
        f"\t\t\t(at {at_x:.3f} {at_y - 12.7:.3f} 0)",
        "\t\t\t(effects (font (size 1.27 1.27))))",
        f'\t\t(property "Value" "{value}"',
        f"\t\t\t(at {at_x:.3f} {at_y + 12.7:.3f} 0)",
        "\t\t\t(effects (font (size 1.27 1.27))))",
        f'\t\t(property "Footprint" "{footprint}"',
        f"\t\t\t(at {at_x:.3f} {at_y:.3f} 0)",
        "\t\t\t(effects (font (size 1.27 1.27)) hide))",
    ]
    for n in pin_numbers:
        lines.append(f'\t\t(pin "{n}" (uuid "{uid()}"))')
    lines.extend([
        "\t\t(instances",
        f'\t\t\t(project "{PROJECT}"',
        f'\t\t\t\t(path "/{SHEET_UUID}"',
        f'\t\t\t\t\t(reference "{ref}")',
        "\t\t\t\t\t(unit 1)",
        "\t\t\t\t)",
        "\t\t\t)",
        "\t\t)",
        "\t)",
    ])
    return "\n".join(lines)


def power_symbol(lib_id: str, ref: str, at_x: float, at_y: float) -> str:
    value = lib_id.split(":")[1]
    return "\n".join([
        "\t(symbol",
        f'\t\t(lib_id "{lib_id}")',
        f"\t\t(at {at_x:.3f} {at_y:.3f} 0)",
        "\t\t(unit 1)",
        "\t\t(exclude_from_sim no)",
        "\t\t(in_bom yes)",
        "\t\t(on_board yes)",
        "\t\t(dnp no)",
        f'\t\t(uuid "{uid()}")',
        f'\t\t(property "Reference" "{ref}"',
        f"\t\t\t(at {at_x:.3f} {at_y + 6.35:.3f} 0)",
        "\t\t\t(effects (font (size 1.27 1.27)) hide))",
        f'\t\t(property "Value" "{value}"',
        f"\t\t\t(at {at_x:.3f} {at_y + 3.81:.3f} 0)",
        "\t\t\t(effects (font (size 1.27 1.27))))",
        f'\t\t(property "Footprint" "" (at {at_x:.3f} {at_y:.3f} 0)',
        "\t\t\t(effects (font (size 1.27 1.27)) hide))",
        f'\t\t(pin "1" (uuid "{uid()}"))',
        "\t\t(instances",
        f'\t\t\t(project "{PROJECT}"',
        f'\t\t\t\t(path "/{SHEET_UUID}"',
        f'\t\t\t\t\t(reference "{ref}")',
        "\t\t\t\t\t(unit 1)",
        "\t\t\t\t)",
        "\t\t\t)",
        "\t\t)",
        "\t)",
    ])


def indent_block(text: str, prefix: str) -> str:
    return "\n".join(prefix + line if line else prefix.rstrip() for line in text.splitlines())


# ── Component placement (symbol geometry aware) ──────────────────────

STUB = 5.08  # wire stub length from pin to label

used_libs: set[tuple[str, str]] = set()


def place(
    parts: list[str],
    lib: str, sym: str,
    ref: str, value: str,
    x: float, y: float,
    footprint: str,
    nets: dict[str, str],
    nc: set[str] = frozenset(),
) -> None:
    """Place a symbol; wire every mapped pin to a global label."""
    used_libs.add((lib, sym))
    pins = symbol_pins(lib, sym)
    parts.append(symbol_instance(f"{lib}:{sym}", ref, value, x, y, footprint, sorted(pins, key=_pinkey)))
    for num, (px, py, rot) in pins.items():
        sx, sy = x + px, y - py  # schematic y-axis is inverted
        if num in nc:
            parts.append(no_connect(sx, sy))
            continue
        net = nets.get(num)
        if not net:
            continue
        dx, dy = {0: (-1, 0), 180: (1, 0), 90: (0, 1), 270: (0, -1)}[rot]
        lx, ly = sx + dx * STUB, sy + dy * STUB
        parts.append(wire(sx, sy, lx, ly))
        justify = "right" if dx < 0 else "left"
        parts.append(global_label(net, lx, ly, justify))


def _pinkey(n: str):
    return (0, int(n)) if n.isdigit() else (1, n)


# ── Sheet ────────────────────────────────────────────────────────────

def generate() -> str:
    pinout.check_firmware_config()

    parts: list[str] = []

    # PWR_FLAG anchors: tell ERC these rails are driven (+3.3V already has
    # the LDO's power-output pin, so it needs no flag)
    for i, (net, x, y) in enumerate(
        [("GND", 20, 285), ("VBUS", 40, 20)], start=1
    ):
        parts.append(power_symbol("power:PWR_FLAG", f"#FLG0{i}", x, y))
        parts.append(wire(x, y, x + STUB, y))
        parts.append(global_label(net, x + STUB, y, "left"))

    # ── ScreenKey connectors J1-J6, bus-aware nets ──
    for i in range(1, 7):
        bus = pinout.PANEL_BUS[i - 1]
        nets = {
            str(p + 1): net.format(bus=bus, n=i)
            for p, (_, net) in enumerate(KEY_PIN_NETS)
        }
        row_names = ["Top-Left", "Top-Right", "Mid-Left", "Mid-Right", "Bot-Left", "Bot-Right"]
        place(
            parts, "Connector", "Conn_01x09_Pin",
            f"J{i}", f"KEY{i} {row_names[i-1]} (bus {bus})",
            45, 40 + (i - 1) * 42,
            "Connector_Molex:Molex_PicoBlade_53261-0971_1x09-1MP_P1.25mm_Horizontal",
            nets,
        )

    # ── ESP32-S3-WROOM-1: real symbol, nets from the canonical pad map ──
    pad_nets = pinout.esp32_pad_nets()
    esp_nets = {}
    esp_nc = set()
    for num, (px, py, rot) in symbol_pins("RF_Module", "ESP32-S3-WROOM-1").items():
        net = pad_nets.get(num)
        if net:
            esp_nets[num] = {"+3V3": "+3.3V"}.get(net, net)
        else:
            esp_nc.add(num)
    place(
        parts, "RF_Module", "ESP32-S3-WROOM-1",
        "U1", "ESP32-S3-WROOM-1-N16R8",
        150, 150,
        "RF_Module:ESP32-S3-WROOM-1",
        esp_nets, esp_nc,
    )

    # ── Power: USB-C, LDO, ESD ──
    place(
        parts, "Connector", "USB_C_Receptacle_USB2.0_16P",
        "J7", "USB4105-GF-A",
        235, 45,
        "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
        {
            "A1": "GND", "B1": "GND", "A12": "GND", "B12": "GND",
            "A4": "VBUS", "B4": "VBUS", "A9": "VBUS", "B9": "VBUS",
            "A5": "CC1", "B5": "CC2",
            "A6": "USB_D+", "B6": "USB_D+",
            "A7": "USB_D-", "B7": "USB_D-",
            "SH": "GND",
        },
        nc={"A8", "B8"},
    )
    place(parts, "Regulator_Linear", "AMS1117-3.3", "U2", "AMS1117-3.3",
          235, 95, "Package_TO_SOT_SMD:SOT-223-3_TabPin2",
          {"1": "GND", "2": "+3.3V", "3": "VBUS"})
    place(parts, "Power_Protection", "USBLC6-2SC6", "U3", "USBLC6-2SC6",
          235, 130, "Package_TO_SOT_SMD:SOT-23-6",
          {"1": "USB_D+", "2": "GND", "3": "USB_D-", "4": "USB_D-", "5": "VBUS", "6": "USB_D+"})

    # ── microSD (SPI mode, bus A) ──
    place(parts, "Connector", "Micro_SD_Card", "J8", "microSD DM3D-SF",
          235, 175, "Connector_Card:microSD_HC_Hirose_DM3D-SF",
          {"2": "SD_CS", "3": "MOSI_A", "4": "+3.3V", "5": "SCK_A",
           "6": "GND", "7": "MISO", "SH": "GND"},
          nc={"1", "8"})

    # ── Buttons ──
    place(parts, "Switch", "SW_Push", "SW1", "BOOT", 235, 215,
          "Button_Switch_SMD:SW_Push_1P1T_NO_CK_KMR2", {"1": "BOOT", "2": "GND"})
    place(parts, "Switch", "SW_Push", "SW2", "RESET", 235, 240,
          "Button_Switch_SMD:SW_Push_1P1T_NO_CK_KMR2", {"1": "EN", "2": "GND"})

    # ── Sensors / haptics / expansion (I2C) ──
    place(parts, "Sensor_Motion", "LSM6DS3", "U4", "LSM6DS3TR-C",
          310, 50, "Package_LGA:LGA-14_3x2.5mm_P0.5mm_LayoutBorder3x4y",
          {"1": "GND", "4": "IMU_INT", "5": "+3.3V", "6": "GND", "7": "GND",
           "8": "+3.3V", "12": "+3.3V", "13": "SCL", "14": "SDA"},
          nc={"2", "3", "9", "10", "11"})
    # VEML7700 has no stock symbol; a generic 4-pin documents its nets
    # (datasheet pinning: 1=SCL 2=VDD 3=GND 4=SDA).
    place(parts, "Connector_Generic", "Conn_01x04", "U5", "VEML7700",
          310, 105, "OpenScreenDeck:VEML7700-TT",
          {"1": "SCL", "2": "+3.3V", "3": "GND", "4": "SDA"})
    place(parts, "Driver", "DRV2605LDGS", "U6", "DRV2605L",
          310, 150, "Package_SO:MSOP-10_3x3mm_P0.5mm",
          {"1": "DRV_REG", "2": "SCL", "3": "SDA", "5": "HAPTIC_EN",
           "7": "HAP_P", "8": "GND", "9": "HAP_N", "10": "+3.3V"},
          nc={"4", "6"})
    place(parts, "74xGxx", "74AHCT1G125", "U7", "74AHCT1G125",
          310, 195, "Package_TO_SOT_SMD:SOT-23-5",
          {"1": "GND", "2": "LED_DATA_3V3", "3": "GND", "4": "LED_DATA_5V", "5": "VBUS"})
    place(parts, "Connector_Generic", "Conn_01x04", "J9", "Qwiic (JST-SH)",
          310, 235, "Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal",
          {"1": "GND", "2": "+3.3V", "3": "SDA", "4": "SCL"})
    place(parts, "Connector_Generic", "Conn_01x02", "J10", "LRA motor",
          310, 265, "Connector_JST:JST_SH_SM02B-SRSS-TB_1x02-1MP_P1.00mm_Horizontal",
          {"1": "HAP_P", "2": "HAP_N"})

    # ── Piezo (series R) ──
    place(parts, "Device", "Buzzer", "BZ1", "CPT-9019S", 395, 285,
          "Buzzer_Beeper:Buzzer_CUI_CPT-9019S-SMT", {"1": "PIEZO_BZ", "2": "GND"})
    place(parts, "Device", "R", "R10", "100R", 420, 285,
          "Resistor_SMD:R_0402_1005Metric", {"1": "PIEZO", "2": "PIEZO_BZ"})

    # ── SK6812 LED chain, physical order from pinout ──
    chain_nets = ["LED_DATA_5V"] + [f"LED_CH{i}" for i in range(1, pinout.LED_COUNT)]
    led_roles = {
        "D1": "key J1", "D2": "key J2", "D3": "key J3", "D4": "key J4",
        "D5": "key J5", "D6": "key J6", "D7": "rear link", "D8": "rear SD",
    }
    for pos, ref in enumerate(pinout.LED_CHAIN_REFS):
        din = chain_nets[pos]
        dout = chain_nets[pos + 1] if pos + 1 < pinout.LED_COUNT else None
        nets = {"1": "GND", "2": dout, "3": "VBUS", "4": din}  # 1=VSS 3=VDD
        nc = set() if dout else {"2"}
        nets = {k: v for k, v in nets.items() if v}
        place(parts, "LED", "SK6812", ref, f"SK6812MINI-E ({led_roles[ref]})",
              370, 35 + pos * 32, "LED_SMD:LED_SK6812MINI_PLCC4_3.5x3.5mm_P1.75mm",
              nets, nc)

    # ── Passives ──
    two_pin = [
        # ref, value, footprint, net1, net2, x, y
        ("R7", "5.1k", "R_0402_1005Metric", "CC1", "GND", 415, 35),
        ("R8", "5.1k", "R_0402_1005Metric", "CC2", "GND", 415, 55),
        ("R9", "10k", "R_0402_1005Metric", "+3.3V", "EN", 415, 75),
        ("C7", "10uF", "C_0805_2012Metric", "+3.3V", "GND", 415, 95),
        ("C8", "10uF", "C_0805_2012Metric", "VBUS", "GND", 415, 115),
        ("C9", "100nF", "C_0402_1005Metric", "+3.3V", "GND", 415, 135),
        ("C10", "100nF", "C_0402_1005Metric", "+3.3V", "GND", 415, 155),
        ("C11", "1uF", "C_0402_1005Metric", "EN", "GND", 415, 175),
        ("C12", "1uF", "C_0402_1005Metric", "DRV_REG", "GND", 415, 195),
        ("C13", "100nF", "C_0402_1005Metric", "+3.3V", "GND", 415, 215),  # U4
        ("C14", "100nF", "C_0402_1005Metric", "+3.3V", "GND", 415, 235),  # U5
        ("C15", "100nF", "C_0402_1005Metric", "+3.3V", "GND", 415, 255),  # U6
        ("C16", "100nF", "C_0402_1005Metric", "VBUS", "GND", 415, 275),   # U7
        ("C17", "10uF", "C_0805_2012Metric", "VBUS", "GND", 448, 35),     # LED rail
    ]
    # Per-module decoupling + KEY pull-ups
    for i in range(1, 7):
        two_pin.append((f"C{i}", "100nF", "C_0402_1005Metric", "+3.3V", "GND", 448, 35 + i * 20))
        two_pin.append((f"R{i}", "10k", "R_0402_1005Metric", "+3.3V", f"KEY{i}", 448, 155 + i * 20))
    for ref, val, fp, n1, n2, x, y in two_pin:
        sym = "C" if ref.startswith("C") else "R"
        lib_fp = ("Capacitor_SMD:" if sym == "C" else "Resistor_SMD:") + fp
        place(parts, "Device", sym, ref, val, x, y, lib_fp, {"1": n1, "2": n2})

    parts.append(
        f'\t(text "Rev E — canonical pinout: hardware/pinout.py\\n'
        f'Regenerate: python3 scripts/generate_kicad_schematic.py"\n'
        f"\t\t(at 20 292 0)\n"
        f"\t\t(effects (font (size 1.27 1.27)) (justify left))\n"
        f'\t\t(uuid "{uid()}")\n'
        f"\t)"
    )

    # lib_symbols from every symbol actually used
    lib_syms = [lib_symbol("power", "PWR_FLAG")]
    for lib, sym in sorted(used_libs):
        lib_syms.append(lib_symbol(lib, sym))
    lib_symbols_body = "\n".join(indent_block(s, "\t\t") for s in lib_syms)

    header = [
        "(kicad_sch",
        "\t(version 20250114)",
        '\t(generator "generate_kicad_schematic.py")',
        '\t(generator_version "9.0")',
        f'\t(uuid "{SHEET_UUID}")',
        '\t(paper "A3")',
        "\t(title_block",
        '\t\t(title "Open Screen Deck — Rev E Carrier PCB")',
        '\t\t(date "2026-07-21")',
        '\t\t(rev "E")',
        '\t\t(company "LiteHawk Labs")',
        '\t\t(comment 1 "Board 59.5x108.5mm | Waveshare SKU 34168 | MX1.25 9-pin | pinout: hardware/pinout.py")',
        '\t\t(comment 2 "Dual SPI: bus A (J1-J3+SD) MOSI=11 SCK=12 DC=14 | bus B (J4-J6) MOSI=17 SCK=18 DC=8")',
        '\t\t(comment 3 "CS: K1=IO10 K2=IO1 K3=IO2 K4=IO3 K5=IO4 K6=IO5 | KEY: 38,39,40,41,42,47")',
        '\t\t(comment 4 "I2C SDA=6 SCL=7: LSM6DS3(INT=9) VEML7700 DRV2605(EN=44) Qwiic | LED=48 PIEZO=43")',
        "\t)",
        "\t(lib_symbols",
        lib_symbols_body,
        "\t)",
    ]
    return "\n".join(header + parts) + "\n)\n"


def main() -> None:
    OUT.write_text(generate())
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
