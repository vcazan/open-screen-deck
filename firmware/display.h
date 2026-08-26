/**
 * display.h — the six ST7735 panels and key-face rendering.
 *
 * All six displays share one SPI bus with per-module chip selects. A key
 * face is a PSRAM-cached RGB565 frame (SET_IMAGE / SET_FACE), an SD-stored
 * icon, or a drawn label card. One shared frame buffer holds the upload
 * currently in flight; a per-slot cache survives page switches even when
 * the microSD card is missing.
 */

#pragma once

#include <Arduino.h>
#include <Adafruit_ST7735.h>
#include "config.h"

extern Adafruit_ST7735* tfts[KEY_COUNT];
extern uint16_t*        frameBuf;   // one shared frame buffer (PSRAM)
extern bool             sdOK;

/** Init backlight, reset line, panels, and the shared frame buffer.
 *  Does not mount the SD card — that blocks for seconds when the card
 *  is missing. Call ensureSdMounted() after the splash is on screen.
 */
void displayInit();

/** Apply MADCTL for the current deck orientation (144×144 green-tab). */
void displayApplyOrientation();

/**
 * Hardware-reset and re-init all six panels, then redraw the page.
 * Recovery path for panels knocked into sleep/off by bus noise — a
 * plain redraw can't wake a panel that swallowed a garbage command.
 */
void displayReinitPanels();

/** Shared backlight — all six modules tie to PIN_BL (LEDC PWM). */
void displayBacklight(bool on);

/** Set the backlight PWM level (8..255); ALS auto-dim calls this. */
void displaySetBrightness(uint8_t level);
uint8_t displayBrightness();

/**
 * Redraw every key on the current page, then reveal together (immediate).
 * Used at boot; prefer scheduleDrawAll() for host-driven refreshes.
 */
void drawAllVisible();

/** Coalesce rapid DRAW_ALL / page switches into one reveal. */
void scheduleDrawAll();

/**
 * Companion sync batch — suppress per-key blits until the next DRAW_ALL.
 * Prevents label/plugin uploads from flashing keys one at a time on connect.
 */
void setHostBatchMode(bool on);
bool hostBatchMode();

/** Drop companion batch state (e.g. on MODE HID). */
void clearHostReveal();

/**
 * Companion connected — cancel the standalone boot reveal and stay dark
 * until the host sends a single orchestrated DRAW_ALL.
 */
void deferBootDrawToHost();

/** Schedule the standalone boot reveal (used when no host takes over). */
void scheduleBootReveal();

/** Pump a pending coalesced full-page draw — call every loop(). */
void serviceDrawAll();

/** Ease the backlight back in after an atomic page reveal. Call every loop(). */
void serviceBacklightFade();

/**
 * True while a page reveal / companion batch is in flight — cache incoming
 * faces but don't blit them one-by-one (that staggers the six keys).
 */
bool deferFaceBlit();

/** Safety net when companion batch never finishes with DRAW_ALL. */
void serviceHostRevealFallback();

/**
 * Render a slot's face on its screen (no-op if the slot's page is hidden).
 * Prefers the RAM cache (last SET_IMAGE/SET_FACE), then the SD icon, then
 * the drawn label card.
 */
void drawKey(uint8_t idx);

/** Keep the just-received frameBuf as this slot's face (page-switch cache). */
void cacheIncomingFace(uint8_t idx);

/** Drop a cached face (icon delete / key reset). */
void clearCachedFace(uint8_t idx);

/** Blit a 128×128 RGB565 buffer (protocol big-endian wire order). */
void blitFrame(Adafruit_ST7735* tft, uint16_t* buf);

/** Press visual hook — LCD invert was retired; LED/haptic own feedback. */
void drawKeyPressed(uint8_t idx);

/** Kept so loop() still has a place for any future press animation. */
void servicePressFeedback();

/** Label/sublabel outlined over media — readable on any footage. */
void drawOverlayText(uint8_t idx);

/**
 * Freeze a "bootloader / don't unplug" face on every panel.
 * Call before the 1200-bps reset into the ROM bootloader — the LCDs keep
 * the last frame after the app firmware stops running.
 */
void drawFlashingBanner();
