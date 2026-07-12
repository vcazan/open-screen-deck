/**
 * display.h — the six ST7735 panels and key-face rendering.
 *
 * All six displays share one SPI bus with per-module chip selects. A key
 * face is either an SD-stored icon (with live text overlay and
 * transparency substitution) or a drawn label card. One shared PSRAM
 * frame buffer holds whichever 128×128 RGB565 frame is in flight.
 */

#pragma once

#include <Arduino.h>
#include <Adafruit_ST7735.h>
#include "config.h"

extern Adafruit_ST7735* tfts[KEY_COUNT];
extern uint16_t*        frameBuf;   // one shared frame buffer (PSRAM)
extern bool             sdOK;

/** Init backlight, reset line, panels, and the shared frame buffer. */
void displayInit();

/**
 * Render a slot's face on its screen (no-op if the slot's page is hidden).
 * Prefers the SD icon (transparent pixels adopt the key's bg color, text
 * overlay drawn on top when enabled); falls back to the drawn label card.
 */
void drawKey(uint8_t idx);

/** Brief invert flash as press feedback. */
void drawKeyPressed(uint8_t idx);

/** Label/sublabel outlined over media — readable on any footage. */
void drawOverlayText(uint8_t idx);
