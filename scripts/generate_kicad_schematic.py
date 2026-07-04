#!/usr/bin/env python3
"""Generate a valid KiCad 9 schematic for Open Screen Deck carrier PCB."""

from __future__ import annotations

import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "hardware/pcb/data_streamdeck.kicad_sch"
KICAD_SYM = Path("/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols")

PROJECT = "data_streamdeck"
SHEET_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
PIN_SPACING = 2.54
CONN_PIN_X = -5.08

KEY_PINS = [
    ("KEY", None),
    ("DC", None),
    ("CS", None),
    ("SCLK", "SCK"),
    ("DIN", "MOSI"),
    ("GND", "GND"),
    ("VCC", "+3.3V"),
    ("PWM", "BL"),
    ("RST", "RST"),
]

J_CONNECTORS = [
    ("J1", "KEY1 Top-Left", 50, 45, "CS1", "KEY1"),
    ("J2", "KEY2 Top-Right", 50, 95, "CS2", "KEY2"),
    ("J3", "KEY3 Mid-Left", 50, 145, "CS3", "KEY3"),
    ("J4", "KEY4 Mid-Right", 50, 195, "CS4", "KEY4"),
    ("J5", "KEY5 Bot-Left", 50, 245, "CS5", "KEY5"),
    ("J6", "KEY6 Bot-Right", 50, 295, "CS6", "KEY6"),
]

CS_NETS = [f"CS{i}" for i in range(1, 7)]
KEY_NETS = [f"KEY{i}" for i in range(1, 7)]


def uid() -> str:
    return str(uuid.uuid4())


def extract_symbol(lib_path: Path, symbol_name: str) -> str:
    data = lib_path.read_text()
    needle = f'(symbol "{symbol_name}"'
    idx = data.find(needle)
    if idx == -1:
        raise ValueError(f"Symbol {symbol_name!r} not found in {lib_path}")
    depth = 0
    for i in range(idx, len(data)):
        if data[i] == "(":
            depth += 1
        elif data[i] == ")":
            depth -= 1
            if depth == 0:
                return data[idx : i + 1]
    raise ValueError(f"Unbalanced s-expression for {symbol_name}")


def lib_symbol(lib: str, symbol_name: str) -> str:
    body = extract_symbol(KICAD_SYM / f"{lib}.kicad_sym", symbol_name)
    return body.replace(f'(symbol "{symbol_name}"', f'(symbol "{lib}:{symbol_name}"', 1)


def pin_y(pin_num: int) -> float:
    return 10.16 - (pin_num - 1) * PIN_SPACING


def conn_pin_xy(at_x: float, at_y: float, pin_num: int) -> tuple[float, float]:
    return at_x + CONN_PIN_X, at_y + pin_y(pin_num)


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
        f'\t\t(effects (font (size 1.27 1.27)) (justify {justify}))\n'
        f'\t\t(uuid "{uid()}")\n'
        f'\t\t(property "Intersheets References" ""\n'
        f"\t\t\t(at {x:.3f} {y:.3f} {rot})\n"
        f"\t\t\t(effects (font (size 1.27 1.27)) (justify {justify}) hide))\n"
        f"\t)"
    )


def symbol_instance(
    lib_id: str,
    ref: str,
    value: str,
    at_x: float,
    at_y: float,
    footprint: str,
    pin_count: int,
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
    for n in range(1, pin_count + 1):
        lines.append(f'\t\t(pin "{n}" (uuid "{uid()}"))')
    lines.extend(
        [
            "\t\t(instances",
            f'\t\t\t(project "{PROJECT}"',
            f'\t\t\t\t(path "/{SHEET_UUID}"',
            f'\t\t\t\t\t(reference "{ref}")',
            "\t\t\t\t\t(unit 1)",
            "\t\t\t\t)",
            "\t\t\t)",
            "\t\t)",
            "\t)",
        ]
    )
    return "\n".join(lines)


def power_symbol(lib_id: str, ref: str, at_x: float, at_y: float) -> str:
    value = lib_id.split(":")[1]
    return "\n".join(
        [
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
        ]
    )


def resolve_net(pin_idx: int, cs_net: str, key_net: str) -> str:
    sig, shared = KEY_PINS[pin_idx]
    if shared:
        return shared
    if sig == "CS":
        return cs_net
    if sig == "KEY":
        return key_net
    return sig


def indent_block(text: str, prefix: str) -> str:
    return "\n".join(prefix + line if line else prefix.rstrip() for line in text.splitlines())


def generate() -> str:
    symbols = [
        lib_symbol("power", "+3.3V"),
        lib_symbol("power", "GND"),
        lib_symbol("Connector", "Conn_01x09_Pin"),
        lib_symbol("Connector_Generic", "Conn_01x20"),
        lib_symbol("Device", "C"),
        lib_symbol("Device", "R"),
    ]
    lib_symbols_body = "\n".join(indent_block(s, "\t\t") for s in symbols)

    parts: list[str] = [
        "(kicad_sch",
        "\t(version 20250114)",
        '\t(generator "generate_kicad_schematic.py")',
        '\t(generator_version "9.0")',
        f'\t(uuid "{SHEET_UUID}")',
        '\t(paper "A3")',
        "\t(title_block",
        '\t\t(title "Open Screen Deck — 6-Key Carrier PCB")',
        '\t\t(date "2026-07-03")',
        '\t\t(rev "1.2")',
        '\t\t(company "Open Screen Deck")',
        '\t\t(comment 1 "Board 55x112mm | Waveshare SKU 34168 | MX1.25 9-pin")',
        '\t\t(comment 2 "Conn: 1=KEY 2=DC 3=CS 4=SCLK 5=DIN 6=GND 7=VCC 8=PWM 9=RST")',
        '\t\t(comment 3 "CS: K1=IO10 K2=IO1 K3=IO2 K4=IO3 K5=IO4 K6=IO5")',
        '\t\t(comment 4 "KEY: K1=IO38 K2=IO39 K3=IO40 K4=IO41 K5=IO42 K6=IO47")',
        "\t)",
        "\t(lib_symbols",
        lib_symbols_body,
        "\t)",
        power_symbol("power:+3.3V", "#PWR01", 25, 25),
        power_symbol("power:GND", "#PWR02", 25, 340),
    ]

    for ref, value, x, y, cs_net, key_net in J_CONNECTORS:
        parts.append(
            symbol_instance(
                "Connector:Conn_01x09_Pin",
                ref,
                value,
                x,
                y,
                "Connector_JST:JST_GH_SM09B-GHS-TB_1x09-1MP_P1.25mm_Horizontal",
                9,
            )
        )
        for pin in range(1, 10):
            px, py = conn_pin_xy(x, y, pin)
            net = resolve_net(pin - 1, cs_net, key_net)
            lx = px - 12
            parts.append(wire(px, py, lx, py))
            parts.append(global_label(net, lx, py, "right"))

    parts.append(
        symbol_instance(
            "Connector_Generic:Conn_01x20",
            "U1",
            "ESP32-S3-DevKitC-1",
            170,
            170,
            "Module:ESP32-S3-DevKitC-1",
            20,
        )
    )

    for i in range(1, 7):
        cy = 45 + (i - 1) * 50
        parts.append(
            symbol_instance(
                "Device:C",
                f"C{i}",
                "100nF",
                220,
                cy,
                "Capacitor_SMD:C_0402_1005Metric",
                2,
            )
        )
        parts.append(wire(220, cy - 1.016, 210, cy - 1.016))
        parts.append(global_label("+3.3V", 210, cy - 1.016, "right"))
        parts.append(wire(220, cy + 1.016, 210, cy + 1.016))
        parts.append(global_label("GND", 210, cy + 1.016, "right"))

    for i, key_net in enumerate(KEY_NETS, start=1):
        ry = 45 + (i - 1) * 50
        parts.append(
            symbol_instance(
                "Device:R",
                f"R{i}",
                "10k",
                260,
                ry,
                "Resistor_SMD:R_0402_1005Metric",
                2,
            )
        )
        parts.append(wire(260, ry - 1.016, 250, ry - 1.016))
        parts.append(global_label("+3.3V", 250, ry - 1.016, "right"))
        parts.append(wire(260, ry + 1.016, 250, ry + 1.016))
        parts.append(global_label(key_net, 250, ry + 1.016, "right"))

    for i, cs in enumerate(CS_NETS):
        parts.append(global_label(cs, 280, 150 + i * 5, "left"))
    for i, kn in enumerate(KEY_NETS):
        parts.append(global_label(kn, 300, 150 + i * 5, "left"))
    for i, (name, yoff) in enumerate(
        [("MOSI", 120), ("SCK", 125), ("DC", 130), ("RST", 135), ("BL", 140)], start=0
    ):
        parts.append(global_label(name, 280, yoff, "left"))

    parts.append(
        f'\t(text "Regenerate: python3 scripts/generate_kicad_schematic.py"\n'
        f"\t\t(at 25 380 0)\n"
        f"\t\t(effects (font (size 1.27 1.27)) (justify left))\n"
        f'\t\t(uuid "{uid()}")\n'
        f"\t)"
    )
    parts.append(")")
    return "\n".join(parts) + "\n"


def main() -> None:
    OUT.write_text(generate())
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
