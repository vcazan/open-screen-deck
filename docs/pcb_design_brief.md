# Open Screen Deck — Carrier PCB Design Brief (Rev E)

Reference: `docs/reference/screenkey-module/` (Waveshare **SKU 34168**)
**Canonical pinout: `hardware/pinout.py`** — both generators consume it and
cross-check `firmware/config.h` at generation time. Regenerate with
`python3 scripts/generate_kicad_pcb.py`, route with Freerouting, then run
`scripts/stitch_gnd.py` and DRC. Fab outputs live in `hardware/pcb/gerbers/`.

---

## Board specification

| Parameter | Value |
|-----------|-------|
| PCB size | **59.5 × 108.5 mm** (Rev E — grew for uniform key spacing) |
| Shape | Rectangular (r=4 corners), 4× Ø2.2 corner case-screw holes on the corner-module standoff axes |
| Mounting | **Flat** in bottom shell (centred under key grid) |
| Layers | 2-layer |
| Min trace | 0.2 mm signal / 0.5 mm power |
| Min via | 0.3 mm drill / 0.6 mm pad |
| Finish | ENIG, matte black solder mask |

---

## Layout

### Key grid (the Rev E spacing fix)

Uniform **11 mm cap-to-cap gaps** both axes: column pitch **33.0 mm**, row
pitch **36.3 mm** (was 28.9 / 38.3 → 6.9 mm H / 13.0 mm V gaps).

| Ref | Col | Row | X | Y |
|-----|-----|-----|---|---|
| J1 | 0 | 0 | 13.25 | 17.95 |
| J2 | 1 | 0 | 46.25 | 17.95 |
| J3 | 0 | 1 | 13.25 | 54.25 |
| J4 | 1 | 1 | 46.25 | 54.25 |
| J5 | 0 | 2 | 13.25 | 90.55 |
| J6 | 1 | 2 | 46.25 | 90.55 |

### Major placements (board origin = back-left)

| Ref | Part | Position | Notes |
|-----|------|----------|-------|
| U1 | ESP32-S3-WROOM-1-N16R8 | (29.75, 36.1) rot 90 | Centre corridor between rows 0 and 1 |
| J7 | USB-C GCT USB4105 (horizontal) | (29.75, 3.1) rot 180 | Port exits rear edge Y=0 |
| J8 | microSD Hirose DM3D-SF | (52.0, 72.4) rot 90 | Card mouth faces x=59.5 edge (side-wall slot); gated by `check_sd_orientation.py` |
| U2 | AMS1117-3.3 1 A LDO | (11.4, 4.7) rear-left strip | VBUS→3V3; ≥3.0 mm clear of H1 screw hardware |
| U3 | USBLC6-2SC6 ESD | behind J7 | USB D+/D−/VBUS protection |
| U4 | LSM6DS3TR-C IMU | rear strip | I2C, INT1→GPIO9 (pickup/tap) |
| U5 | VEML7700 ambient light | rear strip | I2C, drives BL auto-dim |
| U6 | DRV2605L haptic driver | rear strip | I2C + EN=GPIO44, LRA on J10 |
| U7 | 74AHCT1G125 | near U1 | 3V3→5V level shift for LED data |
| J9 | Qwiic / StemmaQT (JST-SH 4P) | (49.0, 3.1) right rear edge | 3V3 I2C expansion; ≥3.0 mm clear of H2 screw hardware |
| J10 | LRA motor (JST-SH 2P) | rear strip | haptic actuator |
| BZ1 | Piezo buzzer | rear strip | GPIO43 LEDC |
| D1–D6 | SK6812MINI-E | beside each key, outer edge | per-key status color |
| D7–D8 | SK6812MINI-E | rear corners | link / SD status |
| SW1/SW2 | BOOT / RESET | front strip (42.5, 105.2) / (49.0, 105.2) | GPIO0 strap / EN; next to ALS, clear of rear-strip congestion |

---

## Connectors J1–J6

**Molex PicoBlade 53261-0971** — 9-pin 1.25 mm right-angle SMD.
The 200 mm cable included in every Waveshare module box plugs straight in
(pin 1 → pin 1; verify straight-through before buying spares).

### Pin order (Waveshare SPI module — pin 1 = KEY)

| Pin | Signal | Bus A modules (J1–J3) | Bus B modules (J4–J6) |
|-----|--------|----------------------|----------------------|
| 1 | KEY | GPIO per table below | GPIO per table below |
| 2 | DC | GPIO 14 (DC_A) | GPIO 8 (DC_B) |
| 3 | CS | GPIO per table below | GPIO per table below |
| 4 | SCLK | GPIO 12 (SCK_A) | GPIO 18 (SCK_B) |
| 5 | DIN | GPIO 11 (MOSI_A) | GPIO 17 (MOSI_B) |
| 6 | GND | GND | GND |
| 7 | VCC | +3V3 | +3V3 |
| 8 | PWM | GPIO 13 (BL, LEDC) | GPIO 13 (BL, LEDC) |
| 9 | RST | GPIO 21 (shared) | GPIO 21 (shared) |

### Per-module GPIO

| Module | Bus | CS | KEY |
|--------|-----|-----|-----|
| J1 | A | 10 | 38 |
| J2 | A | 1 | 39 |
| J3 | A | 2 | 40 |
| J4 | B | 3 | 41 |
| J5 | B | 4 | 42 |
| J6 | B | 5 | 47 |

**Dual SPI**: bus A (FSPI) also carries the microSD (CS=16, MISO=15) at
10 MHz; panels run 40 MHz with DMA on both buses simultaneously —
full-deck redraw drops ~60 ms → ~15-18 ms.

### Other subsystem GPIO

| Signal | GPIO | Notes |
|--------|------|-------|
| SDA / SCL | 6 / 7 | I2C: IMU + ALS + haptics + Qwiic |
| IMU_INT | 9 | LSM6DS3TR-C INT1, wake-on-pickup |
| LED_DATA | 48 | SK6812 chain, 5 V via 74AHCT1G125 |
| PIEZO | 43 | LEDC tone |
| HAPTIC_EN | 44 | DRV2605L EN |

All chosen pins avoid IO35–37 (octal PSRAM) and leave the strap pins clean.

---

## Decoupling

- **C1–C6:** 100 nF 0402 on each Jx pin 7 (VCC), ≤2 mm from connector
- **C7/C8:** 10 µF 0805 bulk at LDO in/out
- **C9/C10:** 100 nF at U1; **C11** 1 µF on EN
- 100 nF at U4, U5, U6, U7 + 10 µF near the LED chain 5 V feed

---

## Mounting holes

All Ø2.2 (M2 free fit):

- **H1–H4 corner case screws** @ **(3.25, 3.32), (56.25, 3.32), (3.25, 105.17), (56.25, 105.17)** —
  on the corner modules' outermost soldered-nut axes (M2×25 case screws,
  see `docs/mechanical_contract.md`)
- **H5–H16 module standoffs** @ the usable positions of the **20.0 × 29.25**
  per-module pattern from the official vendor drawing (positions colliding
  with ESP32 / USB-C / microSD skipped)

**Hardware keepouts** (component courtyards, measured from hole centre):
≥ **3.0 mm** at H1–H4 (M2 spacer/nut seats on the board face) and
≥ **2.0 mm** at H5–H16 (Ø3.5 mm brass standoff foot; ≥2.5 mm preferred).
Violations at H1/H2/H14 (U2, J9, C14) were found and fixed in Rev E.

---

## Never-again gates (CS2/CS3 class defects)

1. `hardware/pinout.py` is the only pin source; generators fail if
   `firmware/config.h` diverges.
2. `check_dangling_nets` — every signal net must land on ≥2 pads
   (single-pad nets are invisible to DRC; this exact defect shipped Rev B–D).
3. Pre-Gerber connectivity gate: schematic netlist vs PCB pad diff for
   every connector pin.
4. Firmware `SELFTEST` draws each panel's index + cycles LEDs at bring-up.

---

## BOM (deltas vs Rev D marked ★)

| Qty | Ref | Part |
|-----|-----|------|
| 6 | J1–J6 | Molex PicoBlade 53261-0971 (MX1.25 9P) |
| 1 | U1 | ESP32-S3-WROOM-1-N16R8 |
| 1 | J7 | GCT USB4105-GF-A USB-C |
| 1 | J8 | Hirose DM3D-SF microSD |
| 1 | U2 | ★ AMS1117-3.3 (1 A) |
| 1 | U3 | USBLC6-2SC6 |
| 1 | U4 | ★ LSM6DS3TR-C IMU |
| 1 | U5 | ★ VEML7700 ambient light |
| 1 | U6 | ★ DRV2605L haptic driver |
| 1 | U7 | ★ 74AHCT1G125 level shifter |
| 8 | D1–D8 | ★ SK6812MINI-E RGB LED |
| 1 | BZ1 | ★ SMT piezo buzzer (CUI CPT-9019S) |
| 1 | J9 | ★ JST-SH 4P (Qwiic) |
| 1 | J10 | ★ JST-SH 2P (LRA motor) |
| 1 | — | ★ LRA coin motor (8 mm) |
| — | C/R | 0402/0805 passives per schematic |
| 4 | — | M2×25 case screws + RX-M2x4 inserts |

Added BOM cost ≈ **$4–6/board**.

---

## Fabrication

- **59.5 × 108.5 mm** 2-layer FR4 1.6 mm, ENIG
- JLCPCB / PCBWay: ~$15 / 5 pcs
