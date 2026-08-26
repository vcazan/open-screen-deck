/**
 * boot_splash.h — LiteHawk Labs startup animation.
 *
 * Plays once at power-on while the device finishes initializing: the
 * rocket mark launches from the deck's bottom-left corner, flies
 * diagonally across all six panels, and settles as one large emblem
 * spanning the whole deck. The panels are treated as windows onto a
 * single virtual canvas that includes the physical bezel gaps, so the
 * motion tracks real geometry.
 */

#pragma once

#include <Arduino.h>

/** Paints the emblem on every key and turns the backlight on. Instant. */
void playBootSplash();
