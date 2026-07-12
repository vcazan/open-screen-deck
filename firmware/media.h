/**
 * media.h — microSD media: stored icons and the animation player.
 *
 * Card layout:
 *   /osd/keys/N/icon.rgb565          key icon (drawn by display.cpp)
 *   /osd/keys/N/anim/0001.rgb565 …   animation frames, 1-based
 *
 * One key animates at a time — all six panels share one SPI bus, so
 * simultaneous video is physically off the table (see the architecture
 * doc for the bandwidth math). Frames stream from SD at 1–30 fps.
 */

#pragma once

#include <Arduino.h>
#include "config.h"

/** Currently animating slot, or -1 when idle. */
extern int8_t animKey;

/** Mount the card now if it wasn't present at boot (hot-insert support). */
bool ensureSdMounted();

/** Create /osd/keys/<idx> (parents included). */
void ensureKeyDir(long idx);

/** Frames on the card for a slot (0 when none / no card). */
uint16_t countAnimFrames(uint8_t idx);

void startAnimation(uint8_t idx, uint8_t fps);
void stopAnimation();

/** Called from loop(): advances the active animation at its fps. */
void serviceAnimation();
