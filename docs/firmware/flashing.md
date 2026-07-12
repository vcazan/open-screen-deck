# Flash the Firmware

The carrier PCB does not come with firmware pre-loaded. Flash once after
assembly over the on-board USB-C port.

!!! tip "The easy way: let the app do it"
    The [companion app](../app/index.md) bundles the current firmware and
    flashes it in one click (Settings → Firmware) — bootloader entry,
    flashing, and reboot handled for you, updates included. The steps
    below are only needed for the *first* flash of a factory-fresh board,
    or if you're hacking on the firmware itself.

## Requirements

- **Arduino IDE** (or `arduino-cli`) with the [ESP32 board package](https://docs.espressif.com/projects/arduino-esp32/en/latest/)
- Libraries: **Adafruit ST7735 and ST7789**, **Adafruit GFX**
- USB-C data cable

## Board settings

In Arduino IDE, select:

| Setting | Value |
|---------|-------|
| Board | **ESP32S3 Dev Module** |
| USB CDC On Boot | **Enabled** |
| USB Mode | **USB-OTG (TinyUSB)** |

## Upload

1. Open `firmware/main.cpp` in the Arduino IDE.
2. Hold **BOOT**, tap **RESET**, release **BOOT** — the board enters download mode.
3. Upload the sketch.

## Verify

After upload, the deck enumerates as:

- A **USB keyboard** — keys send F13–F24 by default (F13–F18 on page 1)
- A **CDC serial port** — for runtime config over the [Serial Protocol](protocol.md)

Key labels, colors, and HID codes are configurable at runtime over the
serial protocol — no reflash needed.

!!! tip "First test"
    Open a serial monitor at 115200 baud and send `PING`. You should receive
    `{"event":"pong"}`. Press a key and watch for `{"event":"key",...}` JSON.
