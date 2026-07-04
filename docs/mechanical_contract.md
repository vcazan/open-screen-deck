# Mechanical Contract — Enclosure ↔ PCB (v11 / Tier B)

Single source of truth for physical interfaces.  
**Module reference:** `docs/reference/screenkey-module/` (Waveshare SKU **34168**)

---

## Outer envelope (v11 — flat deck + separate stand)

Architecture follows the Elgato Stream Deck Module reference: the deck body is
a **flat slab**; a **separate printed stand** provides the desk angle.

| Parameter | Value |
|-----------|-------|
| Deck width (X) | **59.7 mm** |
| Deck depth (Y) | **116.7 mm** |
| Deck height | **28.2 mm** (+3.4 mm keycap protrusion) |
| Parting plane | **Z = 12 mm** (bottom tray / top shell) |
| Stand angle | **25°** (separate print, cradle style) |
| Stack | floor 3.0 → posts 3.0 → PCB 1.6 → standoff/spacer 9.7 → module body 5.7 → gap 0.2 → face plate 5.0 |

---

## Carrier PCB (Tier B — fab-ready)

| Parameter | Value |
|-----------|-------|
| Board outline | **55 × 112 mm** |
| Orientation | Flat in bottom shell, centred under key grid |
| MCU | **ESP32-S3-WROOM-1-N16R8** soldered on board |
| USB | **USB-C receptacle** on PCB @ **X=27.5 mm, Y=0** (rear edge) |
| Storage | **microSD** @ **X=47.5 mm, Y=75 mm** (right-wall access slot, between J4/J6) |
| ScreenKey | 6× JST GH 9P @ J1–J6 (see below) |

### Corner case-screw holes H1–H4 (Ø2.2, board origin = back-left)

These sit on the **corner modules' outermost standoff axes** — the case
screws thread through the modules' soldered nuts (see Fasteners below).

| Hole | X | Y |
|------|---|---|
| H1 | 2.0 | 4.95 |
| H2 | 52.9 | 4.95 |
| H3 | 2.0 | 106.85 |
| H4 | 52.9 | 106.85 |

Plus 12× Ø2.2 module-standoff holes (H5–H16) at the remaining usable
standoff positions.

### J1–J6 connector centres

| Ref | X | Y |
|-----|---|---|
| J1 | 13.0 | 17.6 |
| J2 | 41.9 | 17.6 |
| J3 | 13.0 | 55.9 |
| J4 | 41.9 | 55.9 |
| J5 | 13.0 | 94.2 |
| J6 | 41.9 | 94.2 |

**Pin order (Waveshare):** 1=KEY, 2=DC, 3=CS, 4=SCLK, 5=DIN, 6=GND, 7=VCC, 8=PWM, 9=RST  
**Receptacle:** Molex **PicoBlade 53261-0971** (= "MX1.25") — the in-box Waveshare cable mates directly.

---

## USB-C (PCB-mounted)

| Parameter | Value |
|-----------|-------|
| Connector | GCT USB4115-03-C class (rear-facing) |
| PCB position | Centre **X = 27.5 mm**, flush **Y = 0** rear edge |
| Enclosure slot | 10.5 × 4.8 mm @ rear wall (unchanged) |
| Power | USB 5 V → on-board 3.3 V LDO |

**No DevKit pocket.** One USB-C cable plugs directly into the deck.

---

## microSD (media storage)

| Parameter | Value |
|-----------|-------|
| Connector | Hirose DM3D-SF class push-push |
| PCB position | **X = 47.5 mm, Y = 75 mm** (card ejects through right wall) |
| Enclosure | Right-wall slot in bottom shell @ PCB Y=75 |
| Filesystem | FAT32, `/osd/` tree (see `docs/product_architecture.md`) |

---

## Fasteners (v11 — one-screw corner stack)

The ScreenKey module is a **dual-PCB sandwich**: front PCB (switch/LCD) and
rear PCB (9P connector) joined by **soldered M2 nuts** at the 22.0 × 25.3
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
  → carrier corner hole H1–H4 (Ø2.2 @ kicad 2/52.9, 4.95/106.85)
  → printed spacer sleeve Ø4×9.7 (replaces the factory standoff,
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
| Corner spacing | 4× **printed spacer sleeve** Ø4 × 9.7, Ø2.4 bore (`stl/corner_spacers_x4_v11.stl`) | sits between carrier and corner-module nut |
| Feet | 8× Ø10 self-adhesive rubber (deck + stand); the 4 deck feet cover the corner screw heads | — |

The factory standoffs (and corner sleeves) are 9.7 mm — exactly clearing the
mated PicoBlade cable under each module. Standoffs at the 8 skipped positions
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
Bottom   → Carrier PCB (ESP32 + USB-C + SD + J1–J6)
         → M3 standoffs → enclosure bosses
```

---

## Verification

- [ ] Gerbers ordered from `hardware/pcb/gerbers/`
- [ ] USB-C aligns with rear slot when PCB on standoffs
- [ ] microSD accessible without opening top shell
- [x] **Corner nut is a through-thread** — confirmed from module photos
  (open corner holes on the front face); M2×25 passes through and exits
  toward the top-plate insert
- [ ] Real 34168 module fits top bays
- [ ] **Keycap aperture:** `CAP_W = 19.4` in the SCAD is an estimate — measure a
  real cap and adjust before final print
- [ ] Deck seats in stand cradle; USB cable clears stand rear
