# System Architecture

How the electronics, storage, and data paths fit together. Canonical
pinout: [`hardware/pinout.py`](https://github.com/vcazan/open-screen-deck/blob/main/hardware/pinout.py).

## Block diagram

```
USB-C (5 V) ──► Fuses/ESD ──► 3.3 V LDO ──► +3V3 rail
                    │              │
                    │              ├── ESP32-S3-WROOM-1 (16 MB flash, 8 MB PSRAM)
                    │              ├── 6× ScreenKey via PicoBlade (MX1.25) 9-pin
                    │              ├── microSD (SPI bus A)
                    │              ├── I2C: IMU + VEML7700 + DRV2605L + Qwiic
                    │              ├── 8× SK6812MINI-E (5 V, level-shifted)
                    │              └── piezo + LRA jack
                    └── USB D+/D- ──► ESP32 native USB (HID keyboard + CDC serial)
```

One USB-C cable does everything: power, the HID keyboard the OS sees, and
the CDC serial channel the companion app configures the deck through.

## GPIO map (canonical)

Displays use **two SPI buses** so a full-deck redraw does not serialize
six panels on one clock.

| Function | GPIO | Notes |
|----------|------|-------|
| MOSI_A / SCK_A / DC_A | 11 / 12 / 14 | SPI bus A: J1–J3 + microSD |
| MISO | 15 | SD read (displays are write-only) |
| SD_CS | 16 | microSD |
| MOSI_B / SCK_B / DC_B | 17 / 18 / 8 | SPI bus B: J4–J6 |
| RST | 21 | All six panels, both buses |
| BL (PWM) | 13 | All backlights; ALS auto-dim |
| CS1–CS6 | 10, 1, 2, 3, 4, 5 | Per ScreenKey |
| KEY1–KEY6 | 38, 39, 40, 41, 42, 47 | Pull-ups on PCB |
| SDA / SCL | 6 / 7 | I2C: IMU + ALS + haptic + Qwiic |
| IMU_INT | 9 | LSM6DS3TR-C INT1 (pickup / tap) |
| LED_DATA | 48 | SK6812 chain via 74AHCT1G125 |
| PIEZO | 43 | LEDC tone |
| HAPTIC_EN | 44 | DRV2605L enable |
| USB D− / D+ | 19 / 20 | Native USB |
| BOOT | 0 | Boot strap button |

This table is the single pinout truth — firmware, schematic, and PCB all
match `hardware/pinout.py`. The generators refuse to run if they disagree.

## On-board sensors & feedback (Rev E)

| Device | Bus | Job |
|--------|-----|-----|
| **LSM6DS3TR-C** | I2C + INT on GPIO9 | Pickup / tap — haptic tick when the deck is lifted |
| **VEML7700** | I2C | Lux → backlight PWM through a Ø3 light-pipe in the face plate |
| **DRV2605L** | I2C, EN=GPIO44 | LRA effect library; key-press click |
| **Piezo** | GPIO43 | Optional beep (`CLICKBEEP`) |
| **8× SK6812MINI-E** | GPIO48 @ 5 V | Logical 0–5 = keys J1–J6, 6 = USB link, 7 = SD |
| **Qwiic** | same I2C | Extra sensors out the rear wall next to USB-C |

The companion's **Settings → Deck hardware** card (protocol 14+) exposes
auto-dim, brightness, glow colour, click-beep, and a `SELFTEST` that
walks panels, LEDs, haptic, and piezo.

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

## Bandwidth budget

Two display buses plus DMA mean a full-deck static redraw is ~15–18 ms.
Animation and USB streaming still have to share those buses with the
microSD card on bus A:

| Fact | Number |
|------|--------|
| One frame (128×128 RGB565) | 32 768 bytes |
| One key @ 15 fps | ~480 KB/s on SPI |
| USB CDC (ESP32-S3 full-speed) | ~1 MB/s real-world |

So the design rules are:

- **Static icons** — any number, updated independently
- **Animations** — one key animates at a time from SD, 1–30 fps
- **Live tiles / plugin faces** — streamed over USB at 0.3–2 fps per key,
  which fits comfortably alongside everything else

## PCB summary

| Item | Value |
|------|-------|
| Outline | **59.5 × 108.5 mm**, 2-layer, ENIG, 1.6 mm, matte black |
| MCU | ESP32-S3-WROOM-1-N16R8, soldered |
| Connectors | 6× PicoBlade (MX1.25) 9-pin — the modules' in-box cables plug straight in |
| USB | USB-C receptacle at the rear edge (X=29.75, Y=0) |
| SD | microSD push-push, service slot in the enclosure side wall |
| Expansion | Qwiic on the rear wall; LRA on J10 |

Generate the fab package with `./scripts/build_hardware.sh` → Gerbers in
`hardware/pcb/gerbers/`, BOM in `hardware/pcb/bom.csv`. Details:
[PCB design](pcb.md) · [mechanical](mechanical.md) ·
[fab checklist](../build/fab-checklist.md).
