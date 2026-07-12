/**
 * Open Screen Deck — ESP32-S3 firmware
 * 6× Waveshare 0.85" ScreenKey (ST7735, 128×128) on the Tier B carrier PCB.
 * USB composite: HID keyboard + CDC serial (companion app protocol).
 *
 * Module map:
 *   config.h        pins, constants, reserved HID codes, timing
 *   state.*         per-key config + NVS persistence
 *   orientation.*   deck rotation, logical↔physical key mapping
 *   pages.*         multi-page deck state and slot arithmetic
 *   display.*       ST7735 panels, key-face rendering, overlays
 *   media.*         microSD icons + animation player
 *   input.*         switches, debouncing, multi-tap engine
 *   protocol.*      USB CDC serial protocol (docs/firmware/protocol.md)
 *
 * Arduino IDE board settings (or use scripts/build_firmware.sh):
 *   Board ............... ESP32S3 Dev Module
 *   USB Mode ............ USB-OTG (TinyUSB)
 *   USB CDC On Boot ..... Enabled
 *   PSRAM ............... OPI PSRAM  (WROOM-1-N16R8)
 *   Flash Size .......... 16MB, partition app3M_fat9M_16MB
 */

#include <Arduino.h>
#include <USB.h>
#include <USBHIDKeyboard.h>

#include "config.h"
#include "state.h"
#include "orientation.h"
#include "pages.h"
#include "display.h"
#include "media.h"
#include "input.h"
#include "protocol.h"

USBHIDKeyboard Keyboard;

void setup() {
    Serial.begin(115200);
    Keyboard.begin();
    USB.begin();

    // Slots beyond page 0 start as dark defaults; NVS then overlays
    // whatever the user has configured
    for (uint8_t s = KEY_COUNT; s < TOTAL_KEYS; s++) {
        defaultSlotConfig(s);
    }
    loadConfig();

    displayInit();

    for (uint8_t p = 0; p < KEY_COUNT; p++) {
        drawKey(slotOfPos(p));
    }

    for (int i = 0; i < KEY_COUNT; i++) {
        pinMode(KEY_PINS[i], INPUT_PULLUP);
    }

    delay(500);   // let the CDC port enumerate before announcing
    printDeviceInfo();
}

void loop() {
    handleSerialInput();
    serviceAnimation();

    // Companion heartbeat lapsed → fall back to plain HID macro pad
    if (companionMode && (millis() - lastCompanionMs) > COMPANION_TIMEOUT_MS) {
        companionMode = false;
    }

    serviceKeys();
    serviceTapTimeouts();
}
