/**
 * config.h — every pin, constant, and tunable in one place.
 *
 * The canonical pinout lives in hardware/pinout.py: the PCB/schematic
 * generators cross-check this file against it at generation time and
 * hard-fail on divergence. If you change a pin here, change pinout.py
 * and regenerate the hardware in the same commit.
 */

#pragma once

#include <Arduino.h>

// ── Identity ────────────────────────────────────────────────────────
#define FIRMWARE_VERSION "0.14.5"
#define PROTOCOL_VERSION 14

// ── Debug ───────────────────────────────────────────────────────────
// 1 → emit {"event":"dbg",...} lines for every draw/blit/batch change so
// the companion console shows exactly which slot hits which display.
#define DEBUG_DRAW 1

// ── Pins (ESP32-S3-WROOM-1 on the Rev E carrier PCB) ────────────────
// SPI bus A (FSPI): panels J1-J3 + microSD
#define PIN_MOSI_A 11
#define PIN_SCK_A  12
#define PIN_MISO   15   // SD read (displays are write-only)
#define PIN_DC_A   14
#define PIN_SD_CS  16   // microSD chip select
// SPI bus B (HSPI): panels J4-J6
#define PIN_MOSI_B 17
#define PIN_SCK_B  18
#define PIN_DC_B   8
// Shared display lines
#define PIN_RST 21      // reset, all panels on both buses
#define PIN_BL  13      // backlight (LEDC PWM — ALS auto-dim)
// I2C: IMU + ambient light + haptic driver + Qwiic port
#define PIN_SDA     6
#define PIN_SCL     7
#define PIN_IMU_INT 9   // LSM6DS3TR-C INT1 (pickup / tap)
// Outputs
#define PIN_LED_DATA  48  // SK6812 chain (via level shifter)
#define PIN_PIEZO     43  // LEDC tone
#define PIN_HAPTIC_EN 44  // DRV2605L enable

// Legacy aliases (pre-Rev E single-bus names)
#define PIN_MOSI PIN_MOSI_A
#define PIN_SCK  PIN_SCK_A
#define PIN_DC   PIN_DC_A

// ── LEDs ────────────────────────────────────────────────────────────
// Logical order: 0-5 = per-key status (J1..J6), 6 = rear-left (link),
// 7 = rear-right (SD). LED_CHAIN[] in leds.cpp maps chain position →
// logical index (physical routing order differs).
#define LED_COUNT 8
#define LED_REAR_LINK 6
#define LED_REAR_SD   7

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
