#include "input.h"
#include "state.h"
#include "pages.h"
#include "display.h"
#include "orientation.h"
#include "leds.h"
#include "haptics.h"
#include <USBHIDKeyboard.h>

extern USBHIDKeyboard Keyboard;   // owned by the sketch

bool     companionMode   = false;
uint32_t lastCompanionMs = 0;

// Debounce state, per physical switch
static bool     lastReading[KEY_COUNT] = {HIGH, HIGH, HIGH, HIGH, HIGH, HIGH};
static bool     lastState[KEY_COUNT]    = {HIGH, HIGH, HIGH, HIGH, HIGH, HIGH};
static uint32_t lastDebounce[KEY_COUNT] = {0};

// Tap sequence state, per physical switch. tapSlot pins the slot captured
// at the first tap so a page switch mid-sequence can't retarget it.
static uint8_t  tapCount[KEY_COUNT]  = {0};
static uint32_t tapLastMs[KEY_COUNT] = {0};
static uint8_t  tapSlot[KEY_COUNT]   = {0};

// Non-blocking HID press — never delay() the main loop for keyboard output
static bool     hidHeld      = false;
static uint8_t  hidHeldKey   = 0;
static uint32_t hidReleaseAt = 0;

void emitKeyEvent(uint8_t idx, const char* action) {
    if (!Serial) return;
    Serial.printf("{\"event\":\"key\",\"index\":%u,\"action\":\"%s\"}\n", idx, action);
}

static uint8_t maxTapsFor(uint8_t slot) {
    if (keys[slot].hid3) return 3;
    if (keys[slot].hid2) return 2;
    return 1;
}

static void pressHid(uint8_t hid) {
    Keyboard.press(hid);
    hidHeldKey   = hid;
    hidHeld      = true;
    hidReleaseAt = millis() + 20;
}

void serviceHidRelease() {
    if (!hidHeld) return;
    if ((int32_t)(millis() - hidReleaseAt) < 0) return;
    Keyboard.release(hidHeldKey);
    hidHeld = false;
}

/** Perform the action bound to a resolved tap level, tell the companion. */
static void fireTap(uint8_t slot, uint8_t taps) {
    uint8_t hid = taps >= 3 ? keys[slot].hid3
                : taps == 2 ? keys[slot].hid2
                            : keys[slot].hidKey;

    if (hid == HID_PAGE_NEXT) {
        switchPage((currentPage + 1) % pageCount);
    } else if (hid == HID_PAGE_PREV) {
        switchPage((currentPage + pageCount - 1) % pageCount);
    } else if (hid >= HID_PAGE_BASE && hid < HID_PAGE_BASE + MAX_PAGES) {
        switchPage(hid - HID_PAGE_BASE);
    } else if (!companionMode && hid != 0 &&
               !(hid >= HID_INTERNAL_MIN && hid <= HID_INTERNAL_MAX)) {
        pressHid(hid);
    }

    if (Serial) {
        Serial.printf("{\"event\":\"key\",\"index\":%u,\"action\":\"press\",\"taps\":%u}\n",
                      slot, taps);
    }
}

static void resolveTaps(uint8_t pos) {
    uint8_t taps = tapCount[pos];
    uint8_t slot = tapSlot[pos];
    tapCount[pos] = 0;
    if (taps == 0) return;
    uint8_t maxTaps = maxTapsFor(slot);
    fireTap(slot, taps > maxTaps ? maxTaps : taps);
}

static void registerTap(uint8_t pos, uint8_t slot, uint32_t now) {
    if (tapCount[pos] == 0) {
        if (maxTapsFor(slot) == 1) {
            fireTap(slot, 1);
            return;
        }
        tapSlot[pos] = slot;
    }
    tapCount[pos]++;
    tapLastMs[pos] = now;
    if (tapCount[pos] >= maxTapsFor(tapSlot[pos])) {
        resolveTaps(pos);
    }
}

void serviceKeys() {
    uint32_t now = millis();
    for (int i = 0; i < KEY_COUNT; i++) {
        bool reading = digitalRead(KEY_PINS[i]);

        if (reading != lastReading[i]) {
            lastDebounce[i] = now;
            lastReading[i]  = reading;
        }

        if ((now - lastDebounce[i]) > DEBOUNCE_MS && reading != lastState[i]) {
            uint8_t slot = slotOfPos(PHYS_TO_LOGICAL[i]);
            lastState[i] = reading;
            if (reading == LOW) {
                drawKeyPressed(slot);
                hapticClick();
                if (clickBeepEnabled()) piezoBeep(2400, 35);
                // press glow in the key's own color (565 → 8-bit channels)
                uint16_t c = keys[slot].bgColor;
                ledsPulse(i, ((c >> 11) & 0x1F) << 3,
                             ((c >> 5) & 0x3F) << 2,
                             (c & 0x1F) << 3);
                registerTap(i, slot, now);
            } else {
                emitKeyEvent(slot, "release");
            }
        }
    }
}

void serviceTapTimeouts() {
    uint32_t now = millis();
    for (int i = 0; i < KEY_COUNT; i++) {
        if (tapCount[i] > 0 && (now - tapLastMs[i]) > TAP_WINDOW_MS) {
            resolveTaps(i);
        }
    }
}
