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
 *   leds.*          8× SK6812 status/glow LEDs (Rev E)
 *   sensors.*       LSM6DS3TR-C pickup + VEML7700 auto-dim (Rev E)
 *   haptics.*       DRV2605L LRA + piezo feedback (Rev E)
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
#include "boot_splash.h"
#include "media.h"
#include "input.h"
#include "leds.h"
#include "sensors.h"
#include "haptics.h"
#include "protocol.h"

USBHIDKeyboard Keyboard;

void setup() {
    // Screens first — USB, NVS and a missing SD card used to steal seconds
    // before a pixel appeared. Shared RST + batched SLPOUT means the logo
    // can paint as soon as the panels exist.
    displayInit();
    playBootSplash();

    // 48 SET_KEY lines arrive back-to-back during profile sync while NVS
    // writes block the loop — the default 256 B CDC RX buffer overflows
    // and corrupts commands. Must be set before begin().
    // Must hold a full 128x128 RGB565 frame (32768 B) plus headroom: the
    // host pushes frames at full USB speed and any blocking blit in loop()
    // would otherwise overflow the ring and drop the frame's tail.
    Serial.setRxBufferSize(40960);
    Serial.begin(115200);
    Keyboard.begin();
    USB.begin();

    // Slots beyond page 0 start as dark defaults; NVS then overlays
    // whatever the user has configured
    for (uint8_t s = KEY_COUNT; s < TOTAL_KEYS; s++) {
        defaultSlotConfig(s);
    }
    loadConfig();
    rebuildOrientationMaps();
    displayApplyOrientation();

    sensorsInit();        // owns Wire.begin — before hapticsInit()
    hapticsInit();
    ledsInit();
    scheduleBootReveal();

    for (int i = 0; i < KEY_COUNT; i++) {
        pinMode(KEY_PINS[i], INPUT_PULLUP);
    }

    delay(200);   // let the CDC port enumerate before announcing
    printDeviceInfo();
    ensureSdMounted();    // after the logo: a dead card blocks 1–2 s
}

void loop() {
    // Keys first — never let serial uploads or NVS block switch handling
    serviceKeys();
    serviceTapTimeouts();
    serviceHidRelease();
    servicePressFeedback();

    handleSerialInput();
    serviceFrameReceive();
    serviceConfigFlush();

    serviceAnimation();
    serviceDrawAll();
    serviceBacklightFade();
    serviceHostRevealFallback();

    serviceSensors();
    serviceLeds();
    serviceHaptics();

    if (companionMode && (millis() - lastCompanionMs) > COMPANION_TIMEOUT_MS) {
        companionMode = false;
        ledsSetLink(false);
    }
}
