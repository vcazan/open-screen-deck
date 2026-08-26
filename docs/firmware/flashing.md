# Flash the Firmware

The carrier PCB does not come with firmware pre-loaded. Flash once after
assembly over the on-board USB-C port.

!!! tip "Companion app"
    After the first flash, [the app](../app/index.md) can put the board in
    bootloader mode and write the bundled firmware (Settings → Firmware).
    The Arduino steps below are for a blank board or if you're changing
    the sketch yourself.

## Requirements

- **Arduino IDE** (or `arduino-cli`) with the [ESP32 board package](https://docs.espressif.com/projects/arduino-esp32/en/latest/)
- Libraries: **Adafruit ST7735 and ST7789**, **Adafruit GFX**, **Adafruit NeoPixel**
- USB-C data cable

## Board settings

In Arduino IDE, select:

| Setting | Value |
|---------|-------|
| Board | **ESP32S3 Dev Module** |
| USB CDC On Boot | **Enabled** |
| USB Mode | **USB-OTG (TinyUSB)** |
| PSRAM | **OPI PSRAM** (WROOM-1-N16R8) |
| Flash Size | **16MB** (partition `app3M_fat9M_16MB`) |

## Upload

1. Open `firmware/firmware.ino` in the Arduino IDE (the sketch pulls in
   the rest of the `firmware/` modules automatically) — or skip the IDE
   entirely with `./scripts/build_firmware.sh --flash`.
2. Hold **BOOT**, tap **RESET**, release **BOOT** — the board enters download mode.
3. Upload the sketch.

## Verify

After upload, the deck enumerates as:

- A **USB keyboard** — keys send F13–F24 by default (F13–F18 on page 1)
- A **CDC serial port** — for runtime config over the [Serial Protocol](protocol.md)

Key labels, colors, and HID codes are configurable at runtime over the
serial protocol — no reflash needed. On a Rev E board, `INFO` also reports
IMU / ALS / haptic presence, lux, and LED count. Settings → Deck hardware
in the companion drives auto-dim, glow, and a `SELFTEST`.

!!! tip "First test"
    Open a serial monitor at 115200 baud and send `PING`. You should receive
    `{"event":"pong"}`. Press a key and watch for `{"event":"key",...}` JSON.
