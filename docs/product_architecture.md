# Product Architecture — Fab-Ready Open Screen Deck

**Revision:** 2.0 (Tier B)  
**Status:** Target production design — no socketed dev kit, no “works on breadboard” shortcuts.

---

## What changed from Tier A

| Tier A (prototype) | Tier B (this design) |
|--------------------|----------------------|
| ESP32-S3 **DevKitC-1** in a side pocket | **ESP32-S3-WROOM-1-N16R8** soldered on carrier |
| USB via dev board pigtail | **USB-C receptacle on PCB** → rear enclosure slot |
| Static labels in firmware only | **microSD + USB streaming + NVS profiles** |
| Schematic-only carrier | **Routed 2-layer PCB**, Gerbers, JLCPCB BOM |
| “Companion app later” | **Storage model defined now** |

Tier A was for proving fit and HID. Tier B is what you fabricate.

---

## Where display content lives (your video question)

You asked where videos are saved and why we were cutting corners. Here is the honest answer.

### Three storage tiers (all supported in v2 firmware roadmap)

```
┌─────────────────────────────────────────────────────────────┐
│  Tier 1 — On-device flash (16 MB, inside ESP32 module)      │
│  • Factory bootloader, firmware, WiFi cal                   │
│  • NVS: key maps, brightness, last profile name           │
│  • Optional small built-in icon pack (~200 KB)              │
│  ✗ NOT for video — too small, wear-sensitive               │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Tier 2 — microSD on carrier PCB (primary local media)      │
│  /osd/                                                      │
│    profiles/streaming.json                                  │
│    keys/0/icon.png                                          │
│    keys/0/anim/0001.rgb565   ← animation frames           │
│    keys/0/anim/meta.json     ← fps, loop, frame count      │
│  • FAT32, hot-swappable before power-on                     │
│  • Ship a 1–32 GB card with starter pack                    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│  Tier 3 — Host via USB CDC (live / heavy content)           │
│  • Companion app pushes RGB565 frames or GIF decode on PC   │
│  • No SD write needed for one-off icons                     │
│  • Best for long GIFs or frequent updates while plugged in  │
└─────────────────────────────────────────────────────────────┘
```

**Videos on 6× 128×128 keys:** there is no magic internal RAM for six simultaneous 30 fps streams.

| Fact | Number |
|------|--------|
| One frame (RGB565) | 32 768 bytes |
| One key @ 15 fps | ~480 KB/s on SPI |
| Six keys @ 15 fps (parallel) | ~2.9 MB/s — **impossible** on one shared SPI bus |

**Product behavior (not a corner cut — physics):**

- **Static icons** — from SD or USB, all keys updated independently.
- **Short animations** — SD folder per key; firmware plays frames on **one key at a time** or low fps on **one active key**.
- **“Live video” look** — companion app streams frames over USB while plugged in (Tier 3).
- **Stream Deck parity** — Elgato also renders on the host; keys show bitmaps pushed over USB. We do the same, plus SD for standalone mode.

We were wrong to imply DevKit + hardcoded text was the end state. That was **Phase 1 bring-up only**.

---

## Hardware block diagram

```
USB-C (5 V) ──► Fuses/ESD ──► 3.3 V LDO ──► +3V3 rail
                    │              │
                    │              ├── ESP32-S3-WROOM-1 (16 MB flash, 8 MB PSRAM)
                    │              ├── 6× ScreenKey via JST GH / MX1.25
                    │              └── microSD (SPI, shared bus)
                    └── USB D+/D- ──► ESP32 native USB (HID + CDC)
```

### GPIO map (canonical)

| Function | GPIO | Notes |
|----------|------|-------|
| MOSI | 11 | Shared: displays + SD |
| MISO | 15 | SD read |
| SCK | 12 | Shared |
| DC | 14 | Displays |
| RST | 21 | Displays |
| BL (PWM) | 13 | All backlights tied |
| CS1–CS6 | 10,1,2,3,4,5 | Per ScreenKey |
| KEY1–KEY6 | 38,39,40,41,42,47 | Pull-ups on PCB |
| SD_CS | 16 | microSD |
| USB D- | 19 | Native USB |
| USB D+ | 20 | Native USB |
| BOOT | 0 | Boot strap button |

---

## PCB (fab package)

| Item | Value |
|------|-------|
| Outline | **55 × 112 mm** |
| Layers | 2 (F.Cu / B.Cu) |
| Mounting | **4× M3** @ (4,4), (51,4), (4,108), (51,108) |
| Connectors | 6× JST GH 9P 1.25 mm horizontal |
| USB | **USB-C receptacle** @ board rear center (X=27.5, Y=0 edge) |
| SD | microSD push-push @ bottom edge (service slot in enclosure) |
| Finish | ENIG, **1.6 mm**, matte black mask |

Generate layout:

```bash
./scripts/build_hardware.sh
```

Outputs: `hardware/pcb/data_streamdeck.kicad_pcb`, `hardware/pcb/gerbers/`, `hardware/pcb/bom.csv`

---

## Enclosure alignment

- USB slot in bottom shell aligns with **PCB-mounted USB-C**, not a dev kit.
- DevKit pocket **removed** — single flat carrier + modules in top shell.
- Optional **microSD access cutout** in bottom shell (left-rear).

---

## Firmware roadmap (storage-aware)

| Version | Capability |
|---------|------------|
| v0.2 (now) | HID + CDC + static labels |
| v0.3 | `SET_KEY`, RGB565 `SET_IMAGE` over USB |
| v0.4 | SD mount, `/osd/` profile load, animation player |
| v0.5 | Companion sync: USB pushes profile → optional SD write |

See `docs/protocol.md` for wire format extensions.

---

## BOM class

Full line-item BOM: `hardware/pcb/bom.csv`  
Assembly notes: `docs/fab_checklist.md`

**Estimated board cost (JLCPCB, qty 5, ENIG):** ~$18–25 PCB + ~$12 SMT (ESP32 module + passives) if you use assembly.
