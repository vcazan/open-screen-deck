# Carrier PCB Design Brief (Tier B, routed)

Reference: [ScreenKey Module](screenkey-module.md) (Waveshare **SKU 34168**)  
**Status: routed + DRC-clean.** Regenerate placement with
`python3 scripts/generate_kicad_pcb.py`, then route with Freerouting.
Fab outputs live in `hardware/pcb/gerbers/`.

---

## Board specification

| Parameter | Value |
|-----------|-------|
| PCB size | **55 × 112 mm** |
| Shape | Rectangular (r=4 corners), 4× Ø2.2 corner case-screw holes on the corner-module standoff axes |
| Mounting | **Flat** in bottom shell (centred under key grid) |
| Layers | 2-layer |
| Min trace | 0.2 mm signal / 0.5 mm power |
| Min via | 0.3 mm drill / 0.6 mm pad |
| Finish | ENIG, matte black solder mask |

---

## Layout

```
┌──────────────────────────────────────┐  ← 55 mm
│ SW2·[U2][U3]·[USB-C J7]·[SW1]  rear │
│                                      │
│  [J1]        [J2]     row 0 (back)   │
│     [U1 ESP32-S3, between rows]      │  112 mm
│  [J3]        [J4]     row 1          │
│                          [J8 microSD]│
│  [J5]        [J6]     row 2 (front)  │
└──────────────────────────────────────┘
   modules 25.94 × 35.29 mm, 3 mm gap
```

### J1–J6 centres (board origin 0,0 = back-left)

| Ref | Col | Row | X | Y |
|-----|-----|-----|---|---|
| J1 | 0 | 0 | 13.0 | 17.6 |
| J2 | 1 | 0 | 41.9 | 17.6 |
| J3 | 0 | 1 | 13.0 | 55.9 |
| J4 | 1 | 1 | 41.9 | 55.9 |
| J5 | 0 | 2 | 13.0 | 94.2 |
| J6 | 1 | 2 | 41.9 | 94.2 |

Grid: 2×3, module **25.94 × 35.29 mm**, **3 mm** gap.

### Key placements (board origin = back-left)

| Ref | Part | Position | Notes |
|-----|------|----------|-------|
| U1 | ESP32-S3-WROOM-1-N16R8 | (27.5, 35.2) rot 90 | Between J1/J2 and J3/J4; antenna keep-out overlaps accepted (WiFi unused) |
| J7 | USB-C GCT USB4105 (horizontal) | (27.5, 3.1) rot 180 | Port exits rear edge Y=0; "PCB Edge" marker on outline |
| J8 | microSD Hirose DM3D-SF | (47.5, 75.0) rot 270 | Card ejects right wall; ≥6 mm from U1 |
| U2 | AP2112K-3.3 LDO | (8.5, 7.5) | VBUS→3V3 |
| U3 | USBLC6-2SC6 ESD | (21.0, 6.8) | USB D+/D−/VBUS protection |
| SW1 | BOOT button | (40.0, 5.8) | GPIO0 strap |
| SW2 | RESET button | (11.5, 3.4) | EN → GND; BOOT+RESET = USB download mode |

---

## Connectors J1–J6

**Molex PicoBlade 53261-0971** — 9-pin 1.25 mm right-angle SMD.

"MX1.25" (the Waveshare marking) **is** the PicoBlade family: the module's own
connector and our receptacle are the same series, so the **200 mm cable
included in every module box** plugs straight into the carrier. No custom
cables. Spares: any "PicoBlade / MX1.25 9-pin double-ended, same-direction"
cable (Molex 15134 series, or AliExpress "MX1.25 9P" assemblies).

**Pin 1 = KEY** per the table below — verify cable is straight-through
(pin 1 → pin 1) against the in-box cable before buying spares.

### Pin order (Waveshare SPI module — pin 1 = KEY)

| Pin | Signal | Connection |
|-----|--------|------------|
| 1 | KEY | GPIO per table below |
| 2 | DC | GPIO 14 (shared) |
| 3 | CS | GPIO per table below |
| 4 | SCLK | GPIO 12 (shared) |
| 5 | DIN | GPIO 11 (shared, MOSI) |
| 6 | GND | GND |
| 7 | VCC | +3V3 |
| 8 | PWM | GPIO 13 (backlight) |
| 9 | RST | GPIO 21 (shared) |

### Per-module GPIO

| Module | CS | KEY |
|--------|-----|-----|
| J1 | 10 | 38 |
| J2 | 1 | 39 |
| J3 | 2 | 40 |
| J4 | 3 | 41 |
| J5 | 4 | 42 |
| J6 | 5 | 47 |

---

## Decoupling

- **C1–C6:** 100 nF 0402 on each Jx pin 7 (VCC), ≤2 mm from connector  
- **C7:** 10 µF 0805 bulk at U1 3.3V  

---

## Mounting holes

All Ø2.2 (M2 free fit):

- **H1–H4 corner case screws** @ **(2, 4.95), (52.9, 4.95), (2, 106.85), (52.9, 106.85)** —
  on the corner modules' outermost soldered-nut axes; the M2×25 case screws
  pass through into the module nuts (see [Mechanical](mechanical.md))
- **H5–H16 module standoffs** @ the 12 usable positions of the 22.0 × 25.3
  per-module pattern (8 skipped over ESP32 / USB-C / microSD)

---

## BOM

| Qty | Ref | Part |
|-----|-----|------|
| 1 | U1 | ESP32-S3-WROOM-1-N16R8 (soldered) |
| 6 | J1–J6 | Molex PicoBlade 53261-0971 — 9-pin 1.25 mm right-angle |
| 1 | J7 | USB-C receptacle, GCT USB4105 |
| 1 | J8 | microSD, Hirose DM3D-SF push-push |
| 1 | U2 | AP2112K-3.3 LDO |
| 1 | U3 | USBLC6-2SC6 USB ESD protection |
| 2 | SW1, SW2 | BOOT / RESET tactile switches |
| 6 | C1–C6 | 100 nF 0402 |
| 1 | C7 | 10 µF 0805 |
| 6 | — | Waveshare MX1.25 9P cable (included with each module) |

Full line-item board BOM: `hardware/pcb/bom.csv`. Case fasteners and feet
are in the [parts list](../getting-started/parts.md).

---

## Fabrication

- **~55 × 112 mm** 2-layer FR4 1.6 mm, ENIG  
- JLCPCB / PCBWay: ~$15 / 5 pcs  

See the [Fab Checklist](../build/fab-checklist.md) for ordering and bring-up.
