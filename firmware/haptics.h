/**
 * haptics.h — DRV2605L + LRA motor and the piezo buzzer (Rev E).
 *
 * The DRV2605L sits on the shared I2C bus (sensors.cpp owns Wire.begin);
 * PIN_HAPTIC_EN gates it. The piezo is a bare LEDC tone on PIN_PIEZO.
 */

#pragma once

#include <Arduino.h>
#include "config.h"

/** Probe + configure the DRV2605L (LRA mode). Returns true if present. */
bool hapticsInit();

bool hapticsPresent();

/** Fire a ROM waveform effect (1..123, DRV2605 LRA library 6). */
void hapticPlay(uint8_t effect);

/** Crisp key-press tick (effect 1: strong click). */
void hapticClick();

/** Non-blocking piezo beep. */
void piezoBeep(uint16_t freqHz, uint16_t ms);

/** Key-press piezo (persisted). Off by default — plugins still BEEP. */
bool clickBeepEnabled();
void setClickBeep(bool on);

/** Silence the piezo when its beep expires — call every loop(). */
void serviceHaptics();
