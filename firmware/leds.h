/**
 * leds.h — the 8× SK6812MINI-E status/glow LEDs (Rev E).
 *
 * Logical order: 0-5 = per-key status (J1..J6), 6 = rear-left (link),
 * 7 = rear-right (SD). The physical chain order differs (routing loop);
 * CHAIN_OF_LOGICAL[] in leds.cpp maps logical → chain position and must
 * match LED_CHAIN_REFS in hardware/pinout.py.
 */

#pragma once

#include <Arduino.h>
#include "config.h"

/** Init the chain, all dark. */
void ledsInit();

/**
 * Host override for one logical LED (index 0..7, or -1 = all).
 * Overridden LEDs hold their color until ledsClearOverride().
 */
void ledsSet(int8_t logical, uint8_t r, uint8_t g, uint8_t b);

/** Drop host overrides — LEDs return to reactive/status behavior. */
void ledsClearOverride();

/** Fire a decaying pulse on a key LED (press feedback). */
void ledsPulse(uint8_t logical, uint8_t r, uint8_t g, uint8_t b);

/** Status setters for the rear pair (link = companion, SD = card activity). */
void ledsSetLink(bool connected);
void ledsFlashSd();

/** Pump pulses/decay and push dirty frames — call every loop(). */
void serviceLeds();

/** SELFTEST helper: run a quick R→G→B chase (blocking ~360 ms). */
void ledsTestChase();
