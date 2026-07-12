#include "orientation.h"

uint8_t deckOrientation = 0;
uint8_t PHYS_TO_LOGICAL[KEY_COUNT];

// logical index → physical module (wiring position) per orientation
static const uint8_t ORIENT_MAP[4][KEY_COUNT] = {
    {0, 1, 2, 3, 4, 5},   // portrait
    {4, 2, 0, 5, 3, 1},   // landscape (deck 90° CW)
    {5, 4, 3, 2, 1, 0},   // portrait flipped
    {1, 3, 5, 0, 2, 4},   // landscape (deck 90° CCW)
};

uint8_t physOf(uint8_t logical) {
    return ORIENT_MAP[deckOrientation][logical];
}

void rebuildOrientationMaps() {
    for (uint8_t l = 0; l < KEY_COUNT; l++) {
        PHYS_TO_LOGICAL[ORIENT_MAP[deckOrientation][l]] = l;
    }
}

uint8_t displayRotation() {
    return (uint8_t)((2 + 4 - deckOrientation) % 4);
}
