/**
 * config.h — every pin, constant, and tunable in one place.
 *
 * This file is the firmware side of the project's "single pinout truth":
 * it must agree with hardware/pcb (schematic + layout) and
 * docs/hardware (architecture page). If you change a pin here, change it
 * everywhere in the same commit.
 */

#pragma once

#include <Arduino.h>

// ── Identity ────────────────────────────────────────────────────────
#define FIRMWARE_VERSION "0.12.0"
#define PROTOCOL_VERSION 12

// ── Pins (ESP32-S3-WROOM-1 on the Tier B carrier PCB) ───────────────
#define PIN_MOSI  11   // shared SPI: displays + SD
#define PIN_MISO  15   // SD read
#define PIN_SCK   12   // shared SPI clock
#define PIN_DC    14   // display data/command (shared)
#define PIN_RST   21   // display reset (shared)
#define PIN_BL    13   // backlight, all modules tied
#define PIN_SD_CS 16   // microSD chip select

// Per-module chip selects and key switch inputs, in wiring order J1..J6.
extern const uint8_t CS_PINS[];
extern const uint8_t KEY_PINS[];

// ── Geometry ────────────────────────────────────────────────────────
#define KEY_COUNT 6                          // physical screens/switches
#define MAX_PAGES 8                          // slot storage ceiling
#define TOTAL_KEYS (KEY_COUNT * MAX_PAGES)   // global key slots (48)
#define FRAME_BYTES (128 * 128 * 2)          // one RGB565 key frame

// ── Media ───────────────────────────────────────────────────────────
// Transparency sentinel (big-endian bytes 0x08,0x21): icon pixels with
// this value adopt the key's background color at draw time, so recoloring
// a key never requires re-uploading its image.
#define TRANSPARENT_HI 0x08
#define TRANSPARENT_LO 0x21

// ── Reserved HID codes ──────────────────────────────────────────────
// These sit in the 224–239 gap of the Arduino keymap — clear of F13–F24
// at 240+ and named keys below 0xDA. A key bound to a page code switches
// pages on-device, standalone AND under the companion, so the firmware
// and the app never fight over page state.
// 224..229 are silent sentinels: never typed; they exist so the companion
// can arm multi-tap detection for host-only actions.
#define HID_INTERNAL_MIN 224
#define HID_INTERNAL_MAX 239
#define HID_PAGE_PREV 230
#define HID_PAGE_NEXT 231
#define HID_PAGE_BASE 232   // 232..239 → go to page 0..7

// ── Timing ──────────────────────────────────────────────────────────
#define DEBOUNCE_MS 50
// Multi-tap: max ms between taps of one sequence. Only keys with a double
// or triple binding ever wait — single-only keys fire with zero latency.
#define TAP_WINDOW_MS 300
// Companion heartbeat: no PING for this long → fall back to plain HID.
#define COMPANION_TIMEOUT_MS 6000
