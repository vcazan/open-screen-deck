#include "state.h"
#include "pages.h"
#include "orientation.h"
#include <Adafruit_ST77xx.h>
#include <USBHIDKeyboard.h>   // KEY_F13.. codes

Preferences prefs;

// Global key slots. Page 0 ships with the classic defaults; the rest are
// initialized by defaultSlotConfig() in setup().
KeyConfig keys[TOTAL_KEYS] = {
    {"MUTE",    "Toggle", KEY_F13, 0, 0, 0x4A69, ST77XX_WHITE, 0},
    {"SCENE 1", "OBS",    KEY_F14, 0, 0, 0x000F, ST77XX_WHITE, 0},
    {"SCENE 2", "OBS",    KEY_F15, 0, 0, 0x000F, ST77XX_CYAN , 0},
    {"CLIP",    "Record", KEY_F16, 0, 0, 0x6000, ST77XX_WHITE, 0},
    {"BROWSER", "Win",    KEY_F17, 0, 0, 0x0003, ST77XX_WHITE, 0},
    {"MACRO",   "Custom", KEY_F18, 0, 0, 0x0300, ST77XX_WHITE, 0},
};

void defaultSlotConfig(uint8_t s) {
    snprintf(keys[s].label, sizeof(keys[s].label), "KEY %u", (unsigned)((s % KEY_COUNT) + 1));
    keys[s].sublabel[0] = '\0';
    keys[s].hidKey  = (uint8_t)(KEY_F13 + (s % 12));
    keys[s].hid2    = 0;
    keys[s].hid3    = 0;
    keys[s].bgColor = 0x2124;   // dark gray
    keys[s].fgColor = ST77XX_WHITE;
    keys[s].overlay = 0;
}

// NVS keys are tiny per-slot prefixes: l0/s0/h0/i0/j0/b0/o0 for slot 0.
// (Preferences keys are limited to 15 chars, hence the terse scheme.)

void loadConfig() {
    prefs.begin("osd", true);
    deckOrientation = prefs.getUChar("orient", 0) & 3;
    pageCount = prefs.getUChar("pages", 1);
    if (pageCount < 1 || pageCount > MAX_PAGES) pageCount = 1;
    currentPage = prefs.getUChar("page", 0);
    if (currentPage >= pageCount) currentPage = 0;
    for (uint8_t i = 0; i < TOTAL_KEYS; i++) {
        char k[8];
        snprintf(k, sizeof(k), "l%u", i);
        String lbl = prefs.getString(k, "");
        if (lbl.length()) strlcpy(keys[i].label, lbl.c_str(), sizeof(keys[i].label));
        snprintf(k, sizeof(k), "s%u", i);
        String sub = prefs.getString(k, "");
        if (sub.length()) strlcpy(keys[i].sublabel, sub.c_str(), sizeof(keys[i].sublabel));
        snprintf(k, sizeof(k), "h%u", i);
        keys[i].hidKey = prefs.getUChar(k, keys[i].hidKey);
        snprintf(k, sizeof(k), "i%u", i);
        keys[i].hid2 = prefs.getUChar(k, keys[i].hid2);
        snprintf(k, sizeof(k), "j%u", i);
        keys[i].hid3 = prefs.getUChar(k, keys[i].hid3);
        snprintf(k, sizeof(k), "b%u", i);
        keys[i].bgColor = prefs.getUShort(k, keys[i].bgColor);
        snprintf(k, sizeof(k), "o%u", i);
        keys[i].overlay = prefs.getUChar(k, keys[i].overlay);
    }
    prefs.end();
}

void saveConfig(uint8_t idx) {
    prefs.begin("osd", false);
    char k[8];
    snprintf(k, sizeof(k), "l%u", idx);
    prefs.putString(k, keys[idx].label);
    snprintf(k, sizeof(k), "s%u", idx);
    prefs.putString(k, keys[idx].sublabel);
    snprintf(k, sizeof(k), "h%u", idx);
    prefs.putUChar(k, keys[idx].hidKey);
    snprintf(k, sizeof(k), "i%u", idx);
    prefs.putUChar(k, keys[idx].hid2);
    snprintf(k, sizeof(k), "j%u", idx);
    prefs.putUChar(k, keys[idx].hid3);
    snprintf(k, sizeof(k), "b%u", idx);
    prefs.putUShort(k, keys[idx].bgColor);
    snprintf(k, sizeof(k), "o%u", idx);
    prefs.putUChar(k, keys[idx].overlay);
    prefs.end();
}
