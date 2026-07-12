/**
 * input.h — key switches, debouncing, and the multi-tap engine.
 *
 * Each key can bind single / double / triple press to different HID codes
 * (hid / hid2 / hid3 in KeyConfig). The latency rule: a key with no
 * multi-tap bindings resolves on the FIRST press — zero added latency. A
 * key with bindings waits up to TAP_WINDOW_MS between taps and resolves
 * early the moment its highest bound level is reached.
 *
 * Page-switch HID codes are handled here in firmware, so page keys work
 * identically standalone and under the companion app.
 */

#pragma once

#include <Arduino.h>
#include "config.h"

/** True while the companion app heartbeat is alive (HID typing paused). */
extern bool     companionMode;
extern uint32_t lastCompanionMs;

/** Scan switches, debounce, feed the tap engine. Call every loop(). */
void serviceKeys();

/** Resolve tap sequences whose window expired. Call every loop(). */
void serviceTapTimeouts();

/** Emit a key event line to the companion ("press" carries taps). */
void emitKeyEvent(uint8_t idx, const char* action);
