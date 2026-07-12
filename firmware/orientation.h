/**
 * orientation.h — deck rotation and the logical↔physical key mapping.
 *
 * The deck can sit on the desk four ways:
 *   0 = portrait (2×3, USB at rear)   1 = landscape, deck rotated 90° CW
 *   2 = portrait upside down          3 = landscape, deck rotated 90° CCW
 *
 * A LOGICAL key index is the row-major position in the CURRENT
 * orientation, so "key 1" is always top-left however the deck sits.
 * A PHYSICAL index is the wiring position (J1..J6 on the PCB).
 */

#pragma once

#include <Arduino.h>
#include "config.h"

extern uint8_t deckOrientation;

/** physical module → logical index (rebuilt whenever orientation changes) */
extern uint8_t PHYS_TO_LOGICAL[KEY_COUNT];

/** logical index → physical module for the current orientation */
uint8_t physOf(uint8_t logical);

/** Recompute PHYS_TO_LOGICAL after deckOrientation changes. */
void rebuildOrientationMaps();

/**
 * Rotation value for Adafruit_ST7735::setRotation — content counter-rotates
 * the deck's physical rotation. Base rotation is 2 (current enclosure); if
 * the direction reads inverted on real modules, flip the sign here —
 * single point of truth.
 */
uint8_t displayRotation();
