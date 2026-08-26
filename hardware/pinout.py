#!/usr/bin/env python3
"""
pinout.py — THE single canonical pinout + geometry source for Open Screen Deck.

Rev E. Every consumer derives from this file:

  - scripts/generate_kicad_schematic.py   (net labels, title-block tables)
  - scripts/generate_kicad_pcb.py         (pad->net map, placement grid)
  - firmware/config.h                     (cross-checked by check_firmware_config())
  - docs/pcb_design_brief.md + AGENTS.md  (hand-synced; check_firmware_config
                                           catches the firmware side)

If you change a pin here, regenerate the schematic AND the PCB and update the
docs tables in the same commit. The generators hard-fail if firmware/config.h
disagrees with this file, so divergence cannot ship silently.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REV = "E"

# ── GPIO map (ESP32-S3-WROOM-1-N16R8) ───────────────────────────────
# Chosen to avoid IO35-37 (octal PSRAM on the R8 module) and to keep the
# strap pins (IO0, IO3, IO45, IO46) free of anything that could fight the
# boot voltage sampling. IO43/44 (UART0) are repurposed — debug goes over
# USB-CDC on this product.
GPIO = {
    # SPI bus A — displays J1-J3 + microSD (FSPI host, DMA)
    "MOSI_A": 11,
    "SCK_A": 12,
    "MISO": 15,      # SD read (displays are write-only)
    "DC_A": 14,
    "SD_CS": 16,
    # SPI bus B — displays J4-J6 (HSPI host, DMA)
    "MOSI_B": 17,
    "SCK_B": 18,
    "DC_B": 8,
    # Shared display lines
    "RST": 21,       # all six panels + both buses
    "BL": 13,        # backlight, LEDC PWM (ALS auto-dim)
    # I2C bus — IMU + ALS + haptic driver + Qwiic
    "SDA": 6,
    "SCL": 7,
    "IMU_INT": 9,    # LSM6DS3TR-C INT1: wake-on-pickup / tap
    # Outputs
    "LED_DATA": 48,  # SK6812 chain via 74AHCT1G125 level shifter
    "PIEZO": 43,     # LEDC tone output
    "HAPTIC_EN": 44, # DRV2605L EN
    # System
    "USB_DN": 19,
    "USB_DP": 20,
    "BOOT": 0,
}

# Per-module chip selects and key switch inputs, wiring order J1..J6.
CS = [10, 1, 2, 3, 4, 5]
KEY = [38, 39, 40, 41, 42, 47]

# Display bus split: panel index (0-based, J1..J6) -> SPI bus
PANEL_BUS = ["A", "A", "A", "B", "B", "B"]

# ── ESP32-S3-WROOM-1 module pad number for each GPIO ────────────────
# Per the Espressif ESP32-S3-WROOM-1 datasheet pin map.
WROOM_PAD = {
    0: "27", 1: "39", 2: "38", 3: "15", 4: "4", 5: "5", 6: "6", 7: "7",
    8: "12", 9: "17", 10: "18", 11: "19", 12: "20", 13: "21", 14: "22",
    15: "8", 16: "9", 17: "10", 18: "11", 19: "13", 20: "14", 21: "23",
    35: "28", 36: "29", 37: "30", 38: "31", 39: "32", 40: "33", 41: "34",
    42: "35", 43: "37", 44: "36", 45: "26", 46: "16", 47: "24", 48: "25",
}

# Net name used on schematic + PCB for each GPIO signal
SIGNAL_NET = {
    "MOSI_A": "MOSI_A", "SCK_A": "SCK_A", "MISO": "MISO", "DC_A": "DC_A",
    "MOSI_B": "MOSI_B", "SCK_B": "SCK_B", "DC_B": "DC_B",
    "RST": "RST", "BL": "BL", "SD_CS": "SD_CS",
    "SDA": "SDA", "SCL": "SCL", "IMU_INT": "IMU_INT",
    "LED_DATA": "LED_DATA_3V3", "PIEZO": "PIEZO", "HAPTIC_EN": "HAPTIC_EN",
    "USB_DN": "USB_D-", "USB_DP": "USB_D+", "BOOT": "BOOT",
}


def esp32_pad_nets() -> dict[str, str]:
    """WROOM pad number -> net name, derived from the tables above."""
    pads = {"1": "GND", "2": "+3V3", "3": "EN", "40": "GND", "41": "GND"}
    for sig, io in GPIO.items():
        pads[WROOM_PAD[io]] = SIGNAL_NET[sig]
    for i, io in enumerate(CS, start=1):
        pads[WROOM_PAD[io]] = f"CS{i}"
    for i, io in enumerate(KEY, start=1):
        pads[WROOM_PAD[io]] = f"KEY{i}"
    return pads


# ── Rev E board geometry (mm, origin = back-left corner) ────────────
BOARD_W = 59.5
BOARD_H = 108.5

COL_PITCH = 33.0   # was 28.9 — uniform 11 mm cap-to-cap gap
ROW_PITCH = 36.3   # was 38.3 — uniform 11 mm cap-to-cap gap

COL_X = [13.25, 46.25]                # (BOARD_W - COL_PITCH)/2, + COL_PITCH
ROW_Y = [17.95, 54.25, 90.55]         # (BOARD_H - 2*ROW_PITCH)/2, + n*ROW_PITCH

KEY_CENTRES = [(COL_X[c], ROW_Y[r]) for r in range(3) for c in range(2)]

# Module standoff pattern — OFFICIAL vendor drawing: 20.0 x 29.25 around
# each key centre. (22.0 x 25.3 is the KEYCAP outline from the marketing
# png — the v11/v12 misread. See docs/reference/screenkey-module/.)
STANDOFF_DX = 10.0
STANDOFF_DY = 14.625

# Corner case-screw holes = outermost standoff axes of the corner modules
CORNER_CASE_HOLES = [
    (COL_X[0] - STANDOFF_DX, ROW_Y[0] - STANDOFF_DY),
    (COL_X[1] + STANDOFF_DX, ROW_Y[0] - STANDOFF_DY),
    (COL_X[0] - STANDOFF_DX, ROW_Y[2] + STANDOFF_DY),
    (COL_X[1] + STANDOFF_DX, ROW_Y[2] + STANDOFF_DY),
]

USB_X = BOARD_W / 2  # USB-C stays centred on the rear edge

# LED chain: physical order along the data line — a clean loop with no
# crossings: rear-left → rear-right → down the right edge → up the left.
# Logical index (firmware view): 0-5 = keys J1..J6, 6 = rear link, 7 = rear SD.
LED_COUNT = 8
LED_CHAIN_REFS = ["D7", "D8", "D2", "D4", "D6", "D5", "D3", "D1"]
LED_LOGICAL = {"D1": 0, "D2": 1, "D3": 2, "D4": 3, "D5": 4, "D6": 5, "D7": 6, "D8": 7}
# firmware: chain position -> logical LED index
LED_CHAIN_TO_LOGICAL = [LED_LOGICAL[r] for r in LED_CHAIN_REFS]


# ── Firmware cross-check ─────────────────────────────────────────────
FIRMWARE_EXPECT = {
    "PIN_MOSI_A": GPIO["MOSI_A"], "PIN_SCK_A": GPIO["SCK_A"],
    "PIN_MISO": GPIO["MISO"], "PIN_DC_A": GPIO["DC_A"],
    "PIN_MOSI_B": GPIO["MOSI_B"], "PIN_SCK_B": GPIO["SCK_B"],
    "PIN_DC_B": GPIO["DC_B"],
    "PIN_RST": GPIO["RST"], "PIN_BL": GPIO["BL"], "PIN_SD_CS": GPIO["SD_CS"],
    "PIN_SDA": GPIO["SDA"], "PIN_SCL": GPIO["SCL"],
    "PIN_IMU_INT": GPIO["IMU_INT"], "PIN_LED_DATA": GPIO["LED_DATA"],
    "PIN_PIEZO": GPIO["PIEZO"], "PIN_HAPTIC_EN": GPIO["HAPTIC_EN"],
}


def check_firmware_config() -> None:
    """Hard-fail if firmware/config.h or display.cpp disagree with this file."""
    cfg = (ROOT / "firmware/config.h").read_text()
    errors: list[str] = []
    for name, want in FIRMWARE_EXPECT.items():
        m = re.search(rf"#define\s+{name}\s+(\d+)", cfg)
        if not m:
            errors.append(f"{name}: missing from firmware/config.h (want {want})")
        elif int(m.group(1)) != want:
            errors.append(f"{name}: firmware says {m.group(1)}, pinout says {want}")
    disp = (ROOT / "firmware/display.cpp").read_text()
    for arr, want in (("CS_PINS", CS), ("KEY_PINS", KEY)):
        m = re.search(rf"{arr}\[KEY_COUNT\]\s*=\s*\{{([^}}]*)\}}", disp)
        if not m:
            errors.append(f"{arr}: not found in firmware/display.cpp")
        else:
            got = [int(v) for v in m.group(1).split(",")]
            if got != want:
                errors.append(f"{arr}: firmware {got} != pinout {want}")
    if errors:
        raise SystemExit(
            "!! pinout divergence between hardware/pinout.py and firmware:\n  "
            + "\n  ".join(errors)
        )


if __name__ == "__main__":
    check_firmware_config()
    print(f"Rev {REV} pinout OK — firmware/config.h matches hardware/pinout.py")
    for pad, net in sorted(esp32_pad_nets().items(), key=lambda kv: int(kv[0])):
        print(f"  pad {pad:>2} -> {net}")
