#include "leds.h"
#include <Adafruit_NeoPixel.h>

// Physical chain order (data line routing) is D7→D8→D2→D4→D6→D5→D3→D1;
// logical order is D1..D6 = keys J1..J6, D7 = link, D8 = SD.
// This table maps logical index → chain position and mirrors
// LED_CHAIN_REFS in hardware/pinout.py — change them together.
static const uint8_t CHAIN_OF_LOGICAL[LED_COUNT] = {7, 2, 6, 3, 5, 4, 0, 1};

static Adafruit_NeoPixel strip(LED_COUNT, PIN_LED_DATA, NEO_GRB + NEO_KHZ800);

struct LedState {
    uint8_t r = 0, g = 0, b = 0;      // base color (status / host override)
    bool    overridden = false;       // host owns this LED via SET_LED
    uint8_t pr = 0, pg = 0, pb = 0;   // pulse color
    uint8_t pulse = 0;                // pulse intensity 0..255, decays
};

static LedState leds[LED_COUNT];
static bool     dirty        = false;
static uint32_t lastShowMs   = 0;
static uint32_t sdFlashUntil = 0;

void ledsInit() {
    strip.begin();
    strip.clear();
    strip.show();
}

static void apply(uint8_t logical) {
    LedState& L = leds[logical];
    // pulse layered over base: simple additive with saturation
    uint16_t r = L.r + ((uint16_t)L.pr * L.pulse) / 255;
    uint16_t g = L.g + ((uint16_t)L.pg * L.pulse) / 255;
    uint16_t b = L.b + ((uint16_t)L.pb * L.pulse) / 255;
    strip.setPixelColor(CHAIN_OF_LOGICAL[logical],
                        r > 255 ? 255 : r, g > 255 ? 255 : g, b > 255 ? 255 : b);
    dirty = true;
}

void ledsSet(int8_t logical, uint8_t r, uint8_t g, uint8_t b) {
    if (logical < 0) {
        for (uint8_t i = 0; i < LED_COUNT; i++) ledsSet(i, r, g, b);
        return;
    }
    if (logical >= LED_COUNT) return;
    LedState& L = leds[logical];
    L.r = r; L.g = g; L.b = b;
    L.overridden = true;
    apply(logical);
}

void ledsClearOverride() {
    for (uint8_t i = 0; i < LED_COUNT; i++) {
        leds[i].overridden = false;
        leds[i].r = leds[i].g = leds[i].b = 0;
        apply(i);
    }
}

void ledsPulse(uint8_t logical, uint8_t r, uint8_t g, uint8_t b) {
    if (logical >= LED_COUNT) return;
    LedState& L = leds[logical];
    L.pr = r; L.pg = g; L.pb = b;
    L.pulse = 255;
    apply(logical);
}

void ledsSetLink(bool connected) {
    LedState& L = leds[LED_REAR_LINK];
    if (L.overridden) return;
    L.r = 0; L.g = connected ? 24 : 0; L.b = connected ? 8 : 0;
    apply(LED_REAR_LINK);
}

void ledsFlashSd() {
    sdFlashUntil = millis() + 60;
    LedState& L = leds[LED_REAR_SD];
    if (L.overridden) return;
    L.r = 16; L.g = 10; L.b = 0;
    apply(LED_REAR_SD);
}

void serviceLeds() {
    uint32_t now = millis();

    // SD activity flash off
    if (sdFlashUntil && (int32_t)(now - sdFlashUntil) >= 0) {
        sdFlashUntil = 0;
        LedState& L = leds[LED_REAR_SD];
        if (!L.overridden) { L.r = L.g = L.b = 0; apply(LED_REAR_SD); }
    }

    // ~60 fps pulse decay
    if (now - lastShowMs < 16) return;
    for (uint8_t i = 0; i < LED_COUNT; i++) {
        if (leds[i].pulse) {
            leds[i].pulse = leds[i].pulse > 18 ? leds[i].pulse - 18 : 0;
            apply(i);
        }
    }
    if (dirty) {
        strip.show();
        dirty      = false;
        lastShowMs = now;
    }
}

void ledsTestChase() {
    const uint32_t colors[3] = {0x200000, 0x002000, 0x000020};
    for (uint8_t c = 0; c < 3; c++) {
        for (uint8_t i = 0; i < LED_COUNT; i++) {
            strip.clear();
            strip.setPixelColor(i, colors[c]);
            strip.show();
            delay(15);
        }
    }
    strip.clear();
    strip.show();
    for (uint8_t i = 0; i < LED_COUNT; i++) apply(i);
}
