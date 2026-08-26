# Mechanical Contract — Enclosure ↔ PCB (v14 / Rev E)

Single source of truth for physical interfaces.  
**Module reference:** [ScreenKey Module](screenkey-module.md) (Waveshare SKU **34168**)  
**Pinout / grid:** [`hardware/pinout.py`](https://github.com/vcazan/open-screen-deck/blob/main/hardware/pinout.py)

---

## Outer envelope (v14 — Rev E pitch + glow)

The deck body is a flat slab; a separate printed stand provides the desk angle.
v14 follows the Rev E key pitch (uniform 11 mm cap-to-cap) and adds LED
wall windows, an ALS light-pipe, and a Qwiic opening next to USB-C.

| Parameter | Value |
|-----------|-------|
| Deck width (X) | **64.9 mm** |
| Deck depth (Y) | **113.9 mm** |
| Deck height | **28.2 mm** body (+ keycap protrusion) |
| Parting plane | **Z = 12 mm** (bottom tray / top shell) |
| Stand angle | **25°** (separate print, cradle style) |
| Glow | 8 wall windows (3 left, 3 right, 2 rear) for SK6812MINI-E |
| ALS | Ø3 mm light-pipe through the face plate to the VEML7700 |
| Qwiic | JST-SH opening in the rear wall next to USB-C |
| Stack | floor 3.0 → posts 3.0 → PCB 1.6 → standoff/spacer 8.0 → module body 7.4 → gap 0.2 → face plate 5.0 |

---

## Carrier PCB (Rev E)

| Parameter | Value |
|-----------|-------|
| Board outline | **59.5 × 108.5 mm** |
| Key grid | Col pitch **33.0 mm**, row pitch **36.3 mm** |
| Orientation | Flat in bottom shell, centred under key grid |
| MCU | **ESP32-S3-WROOM-1-N16R8** soldered on board |
| USB | **USB-C receptacle** on PCB @ **X=29.75 mm, Y=0** (rear edge) |
| Storage | **microSD** @ **X=52.0 mm, Y=72.4 mm** (side access slot) |
| ScreenKey | 6× PicoBlade 9P @ J1–J6 |

### Corner case-screw holes H1–H4 (Ø2.2, board origin = back-left)

These sit on the **corner modules' outermost standoff axes** — the case
screws thread through the modules' soldered nuts (see Fasteners below).

| Hole | X | Y |
|------|---|---|
| H1 | 3.25 | 3.32 |
| H2 | 56.25 | 3.32 |
| H3 | 3.25 | 105.17 |
| H4 | 56.25 | 105.17 |

Plus 12× Ø2.2 module-standoff holes (H5–H16) at the remaining usable
standoff positions.

### J1–J6 connector centres

| Ref | X | Y |
|-----|---|---|
| J1 | 13.25 | 17.95 |
| J2 | 46.25 | 17.95 |
| J3 | 13.25 | 54.25 |
| J4 | 46.25 | 54.25 |
| J5 | 13.25 | 90.55 |
| J6 | 46.25 | 90.55 |

**Pin order (Waveshare):** 1=KEY, 2=DC, 3=CS, 4=SCLK, 5=DIN, 6=GND, 7=VCC, 8=PWM, 9=RST  
**Receptacle:** Molex **PicoBlade 53261-0971** (= "MX1.25") — the in-box Waveshare cable mates directly.  
**SPI:** J1–J3 on bus A (shared with microSD), J4–J6 on bus B.

---

## USB-C (PCB-mounted)

| Parameter | Value |
|-----------|-------|
| Connector | GCT USB4105 class (rear-facing) |
| PCB position | Centre **X = 29.75 mm**, flush **Y = 0** rear edge |
| Enclosure slot | Rear wall, next to the Qwiic opening |
| Power | USB 5 V → on-board 3.3 V LDO |

One USB-C cable plugs directly into the deck — power, HID, and config.

---

## microSD (media storage)

| Parameter | Value |
|-----------|-------|
| Connector | Hirose DM3D-SF class push-push |
| PCB position | **X = 52.0 mm, Y = 72.4 mm**, card mouth toward the x=59.5 edge |
| Enclosure | Side-wall slot in the bottom shell |
| Filesystem | FAT32, `/osd/` tree (see [Architecture](architecture.md)) |

---

## Fasteners (one-screw corner stack)

The ScreenKey module is a **dual-PCB sandwich**: front PCB (switch/LCD) and
rear PCB (9P connector) joined by **soldered M2 nuts** at the 20.0 × 29.25
pattern. The factory brass standoffs **unscrew from those nuts** — the nuts
are the mounting threads, and they are **through-threads**: a long screw can
pass through and keep going. The module is off-the-shelf and is never
modified — only its removable standoffs are swapped where needed.

**The 4 case screws ARE the corner-module screws.** At each deck corner one
long M2 runs the entire stack:

```
M2×25 countersunk head (DIN 965, flush in the rubber-foot recess)
  → tray floor (3.0)
  → PCB perch post (3.0)
  → carrier corner hole H1–H4 (Ø2.2)
  → printed spacer sleeve Ø4×8.0 (replaces the factory standoff,
    open Ø2.4 bore)
  → corner module's soldered M2 nut (threads through)
  → RX-M2x4 insert in the top-shell face plate (4 mm engagement)
```

One screw per corner marries **bottom tray + carrier + module + top shell**.

**Assembly order:**

```
1. Modules → carrier:  M2×5 from the carrier underside into the factory
                       standoff tips (12 non-corner positions). At the
                       4 deck corners swap the factory standoff for the
                       printed spacer sleeve.
2. Cables:             6× in-box PicoBlade cables, module → carrier.
3. Carrier → tray:     drop onto the 4 corner posts.
4. Close:              snap top shell on (tongue + snaps), then 4× M2×25
                       from below, straight through the corner modules'
                       nuts into the top-plate inserts.
```

| Joint | Hardware | Receives |
|-------|----------|----------|
| Whole stack (tray + carrier + module + top) | 4× **M2×25 countersunk flat head** (DIN 965) from below, hidden under the rubber feet | Corner module's **soldered M2 nut** (pass-through), then **Ruthex RX-M2x4** insert in the top-shell plate |
| Module → carrier | 12× **M2×5 hex socket cap** (ISO 4762) from carrier underside | Module's **factory brass standoffs** (female M2 tips) |
| Corner spacing | 4× **printed spacer sleeve** Ø4 × 8.0, Ø2.4 bore (`stl/corner_spacers_x4_v14.stl`) | sits between carrier and corner-module nut |
| Feet | 8× Ø10 self-adhesive rubber (deck + stand); the 4 deck feet cover the corner screw heads | — |

The factory standoffs (and corner sleeves) are 8.0 mm — exactly clearing the
mated PicoBlade cable under each module. Standoffs at the skipped positions
(over ESP32 / USB-C / microSD) are simply unscrewed.

Real CAD models (in the Fusion assembly + `hardware/3d/fasteners/`):
official **Ruthex** STEP files and **ISO-standard screws** from step.parts.

Install the 4 RX-M2x4 inserts in the top-plate holes with a soldering iron
@ ~220 °C before assembly.
Full parts list: `hardware/bom_assembly.csv` (PCB-only: `hardware/pcb/bom.csv`).

---

## Assembly stack

```
Top shell → 6× ScreenKey modules (24 mm bays)
         → MX1.25/JST cables
Bottom   → Carrier PCB (ESP32 + USB-C + SD + sensors + J1–J6)
         → enclosure posts
```

---

## Verification

- [ ] Gerbers ordered from `hardware/pcb/gerbers/` (Rev E, 59.5 × 108.5 mm)
- [ ] USB-C aligns with rear slot when PCB on posts
- [ ] Qwiic opening lines up with J9
- [ ] microSD accessible without opening top shell
- [ ] LED wall windows sit over D1–D8
- [ ] ALS light-pipe hole sits over the VEML7700
- [x] **Corner nut is a through-thread** — confirmed from module photos
- [x] **Keycap aperture:** official vendor drawing — cap is 21.89 × 25.13 mm, apertures at +0.6 mm clearance
- [ ] Deck seats in stand cradle; USB cable clears stand rear
