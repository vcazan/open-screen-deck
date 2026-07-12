/**
 * state.h — per-key configuration and its NVS persistence.
 *
 * The deck stores TOTAL_KEYS (48) key slots: slot = page*6 + position.
 * Page 0 ships with the classic defaults; added pages start dark and are
 * filled in by the companion app. Every field the user can set survives
 * reboot via ESP32 NVS (Preferences), keyed per slot.
 */

#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "config.h"

struct KeyConfig {
    char     label[16];
    char     sublabel[16];
    uint8_t  hidKey;
    // Double / triple press bindings (0 = unbound). When both are 0 the key
    // resolves on the first press — no tap-window latency.
    uint8_t  hid2;
    uint8_t  hid3;
    uint16_t bgColor;
    uint16_t fgColor;
    // Draw label/sublabel over SD media at render time (images stay raw —
    // text changes never require re-uploading pixels)
    uint8_t  overlay;
};

extern KeyConfig   keys[TOTAL_KEYS];
extern Preferences prefs;

/** Reset one slot to the "new page" default (dark key, cycling F-key). */
void defaultSlotConfig(uint8_t slot);

/** Load every slot (plus page/orientation prefs) from NVS at boot. */
void loadConfig();

/** Persist one slot to NVS — called after every SET_KEY. */
void saveConfig(uint8_t idx);
