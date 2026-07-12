# System Architecture

How the electronics, storage, and data paths fit together.

## Block diagram

```
USB-C (5 V) ──► Fuses/ESD ──► 3.3 V LDO ──► +3V3 rail
                    │              │
                    │              ├── ESP32-S3-WROOM-1 (16 MB flash, 8 MB PSRAM)
                    │              ├── 6× ScreenKey via PicoBlade (MX1.25) 9-pin
                    │              └── microSD (SPI, shared bus)
                    └── USB D+/D- ──► ESP32 native USB (HID keyboard + CDC serial)
```

One USB-C cable does everything: power, the HID keyboard the OS sees, and
the CDC serial channel the companion app configures the deck through.

## GPIO map (canonical)

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
| USB D− / D+ | 19 / 20 | Native USB |
| BOOT | 0 | Boot strap button |

This table is the single pinout truth — firmware, schematic, and PCB all
match it.

## Where key media lives

Icons and animations have three homes, each with a job:

| Tier | Holds | Why |
|------|-------|-----|
| **ESP32 flash (NVS)** | key configs: labels, colors, HID codes, page count, orientation | tiny, survives reboot, no SD needed |
| **microSD** | icons (`/osd/keys/n/icon.rgb565`) and animation frames (`/osd/keys/n/anim/0001.rgb565` …) | big, persistent — the deck plays media standalone |
| **USB stream** | live frames (`SET_FACE`) | tiles, plugin faces, previews — draw-only, zero flash/SD wear |

The companion app writes persistent media to SD over USB (`SET_IMAGE` /
`SET_ANIM`) and streams everything live-only via `SET_FACE`. Full wire
format: [serial protocol](../firmware/protocol.md).

## Bandwidth budget (why not six videos at once)

All six displays and the SD card share one SPI bus:

| Fact | Number |
|------|--------|
| One frame (128×128 RGB565) | 32 768 bytes |
| One key @ 15 fps | ~480 KB/s on SPI |
| Six keys @ 15 fps in parallel | ~2.9 MB/s — beyond one shared SPI bus |
| USB CDC (ESP32-S3 full-speed) | ~1 MB/s real-world |

So the design rules are:

- **Static icons** — any number, updated independently
- **Animations** — one key animates at a time from SD, 1–30 fps
- **Live tiles / plugin faces** — streamed over USB at 0.3–2 fps per key,
  which fits comfortably alongside everything else

## PCB summary

| Item | Value |
|------|-------|
| Outline | 55 × 112 mm, 2-layer, ENIG, 1.6 mm, matte black |
| MCU | ESP32-S3-WROOM-1-N16R8, soldered |
| Connectors | 6× PicoBlade (MX1.25) 9-pin — the modules' in-box cables plug straight in |
| USB | USB-C receptacle at the rear edge |
| SD | microSD push-push, service slot in the enclosure |

Generate the fab package with `./scripts/build_hardware.sh` → Gerbers in
`hardware/pcb/gerbers/`, BOM in `hardware/pcb/bom.csv`. Details:
[PCB design](pcb.md) · [mechanical](mechanical.md) ·
[fab checklist](../build/fab-checklist.md).
