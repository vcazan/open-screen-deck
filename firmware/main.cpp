/*
 * Open Screen Deck — ESP32-S3 firmware v0.10
 * 6× Waveshare 0.85" ScreenKey (ST7735, 128×128), Tier B carrier PCB
 * USB composite: HID keyboard + CDC serial (companion app)
 * microSD: offline icons + animations   (see docs/product_architecture.md)
 * Pages: 4 pages × 6 keys = 24 global key slots; the screens show the
 * current page. Slot = page*6 + position. SET_PAGE switches; reserved
 * HID codes 231 (next) / 232–235 (page 1–4) switch standalone.
 *
 * Arduino IDE board settings:
 *   Board ............... ESP32S3 Dev Module
 *   USB Mode ............ USB-OTG (TinyUSB)
 *   USB CDC On Boot ..... Enabled
 *   PSRAM ............... OPI PSRAM  (WROOM-1-N16R8)
 *
 * Layout (2 cols × 3 rows):
 *   [1][2]
 *   [3][4]
 *   [5][6]
 */

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <Preferences.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <USB.h>
#include <USBHIDKeyboard.h>

#define PIN_MOSI  11
#define PIN_MISO  15
#define PIN_SCK   12
#define PIN_DC    14
#define PIN_RST   21
#define PIN_BL    13
#define PIN_SD_CS 16

#define FIRMWARE_VERSION "0.12.0"
#define PROTOCOL_VERSION 12

// Transparency sentinel (big-endian bytes 0x08,0x21): icon pixels with this
// value adopt the key's background color at draw time, so recoloring a key
// never requires re-uploading its image.
#define TRANSPARENT_HI 0x08
#define TRANSPARENT_LO 0x21
#define COMPANION_TIMEOUT_MS 6000
#define KEY_COUNT 6                    // physical screens/switches
#define MAX_PAGES 8                    // slot storage ceiling
#define TOTAL_KEYS (KEY_COUNT * MAX_PAGES)   // global key slots (48)
#define FRAME_BYTES (128 * 128 * 2)   // RGB565

// Reserved HID codes (in the 224–239 gap of the Arduino keymap — clear of
// F13–F24 at 240+ and named keys below 0xDA): pressing a key configured
// with one of these switches pages on-device, standalone AND under the
// companion — the firmware owns page switching so the two never fight.
// 224..229 are silent sentinels: never typed, they exist so the companion
// can arm multi-tap detection for host-only actions.
#define HID_INTERNAL_MIN 224
#define HID_INTERNAL_MAX 239
#define HID_PAGE_PREV 230
#define HID_PAGE_NEXT 231
#define HID_PAGE_BASE 232              // 232..239 → go to page 0..7

// Multi-tap: max ms between taps of one sequence. Only keys with a double
// or triple binding ever wait — single-only keys fire with zero latency.
#define TAP_WINDOW_MS 300

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

void drawKey(uint8_t idx);
void drawKeyPressed(uint8_t idx);
void handleSerialInput();
void handleCommand(String& line);
void emitKeyEvent(uint8_t idx, const char* action);
void printDeviceInfo();
void loadConfig();
void saveConfig(uint8_t idx);
void serviceAnimation();

static const uint8_t CS_PINS[KEY_COUNT]  = {10, 1, 2, 3, 4, 5};
static const uint8_t KEY_PINS[KEY_COUNT] = {38, 39, 40, 41, 42, 47};

// ── Deck orientation ─────────────────────────────────────────
// 0 = portrait (2×3, USB at rear) · 1 = landscape, deck rotated 90° CW
// 2 = portrait upside down       · 3 = landscape, deck rotated 90° CCW
// Logical key index = row-major position in the CURRENT orientation, so
// "key 1" is always top-left however the deck sits on the desk.
static uint8_t deckOrientation = 0;

// logical index → physical module (wiring position) per orientation
static const uint8_t ORIENT_MAP[4][KEY_COUNT] = {
    {0, 1, 2, 3, 4, 5},   // portrait
    {4, 2, 0, 5, 3, 1},   // landscape (deck 90° CW)
    {5, 4, 3, 2, 1, 0},   // portrait flipped
    {1, 3, 5, 0, 2, 4},   // landscape (deck 90° CCW)
};

// physical module → logical index (inverse of ORIENT_MAP, filled at runtime)
static uint8_t PHYS_TO_LOGICAL[KEY_COUNT];

static void rebuildOrientationMaps() {
    for (uint8_t l = 0; l < KEY_COUNT; l++) {
        PHYS_TO_LOGICAL[ORIENT_MAP[deckOrientation][l]] = l;
    }
}

static inline uint8_t physOf(uint8_t logical) {
    return ORIENT_MAP[deckOrientation][logical];
}

// Content counter-rotates the deck's physical rotation. Base rotation is 2
// (current enclosure). If the direction reads inverted on real modules,
// flip the sign here — single point of truth.
static inline uint8_t displayRotation() {
    return (uint8_t)((2 + 4 - deckOrientation) % 4);
}

// Global key slots: slot = page*KEY_COUNT + position. Page 0 ships with the
// classic defaults; added pages start blank-ish and are filled by the app.
static KeyConfig keys[TOTAL_KEYS] = {
    {"MUTE",    "Toggle", KEY_F13, 0, 0, 0x4A69, ST77XX_WHITE, 0},
    {"SCENE 1", "OBS",    KEY_F14, 0, 0, 0x000F, ST77XX_WHITE, 0},
    {"SCENE 2", "OBS",    KEY_F15, 0, 0, 0x000F, ST77XX_CYAN , 0},
    {"CLIP",    "Record", KEY_F16, 0, 0, 0x6000, ST77XX_WHITE, 0},
    {"BROWSER", "Win",    KEY_F17, 0, 0, 0x0003, ST77XX_WHITE, 0},
    {"MACRO",   "Custom", KEY_F18, 0, 0, 0x0300, ST77XX_WHITE, 0},
    // slots 6.. initialized in setup() (dark defaults)
};

// Which page the physical screens currently show, and how many pages this
// deck has right now — both user-controlled, both persisted in NVS.
static uint8_t currentPage = 0;
static uint8_t pageCount   = 1;

static void defaultSlotConfig(uint8_t s) {
    snprintf(keys[s].label, sizeof(keys[s].label), "KEY %u", (unsigned)((s % KEY_COUNT) + 1));
    keys[s].sublabel[0] = '\0';
    keys[s].hidKey  = (uint8_t)(KEY_F13 + (s % 12));
    keys[s].hid2    = 0;
    keys[s].hid3    = 0;
    keys[s].bgColor = 0x2124;   // dark gray
    keys[s].fgColor = ST77XX_WHITE;
    keys[s].overlay = 0;
}

static inline uint8_t pageOfSlot(uint8_t slot)  { return slot / KEY_COUNT; }
static inline uint8_t posOfSlot(uint8_t slot)   { return slot % KEY_COUNT; }
static inline uint8_t slotOfPos(uint8_t pos)    { return currentPage * KEY_COUNT + pos; }
static inline bool slotVisible(uint8_t slot)    { return pageOfSlot(slot) == currentPage; }

Adafruit_ST7735* tfts[KEY_COUNT];
USBHIDKeyboard   Keyboard;
Preferences      prefs;

static bool     sdOK = false;
static bool     lastState[KEY_COUNT]    = {HIGH, HIGH, HIGH, HIGH, HIGH, HIGH};
static uint32_t lastDebounce[KEY_COUNT] = {0};
static const uint32_t DEBOUNCE_MS = 50;

static String    serialLine;
static uint16_t* frameBuf = nullptr;   // one shared PSRAM frame buffer

// ── Companion mode ───────────────────────────────────────────
// While the desktop companion app is alive (heartbeat via PING), the
// device stops typing HID keys — the companion routes key events to
// richer actions instead. On timeout we fall back to plain HID.
static bool     companionMode   = false;
static uint32_t lastCompanionMs = 0;

// ── Animation player (one key at a time; SPI bus is shared) ──
static int8_t   animKey     = -1;
static uint16_t animFrame   = 0;
static uint16_t animCount   = 0;
static uint8_t  animFps     = 10;
static uint32_t animLastMs  = 0;

// ── Drawing ─────────────────────────────────────────────────

// Text drawn live over media — outlined for readability on any footage.
static void drawOverlayText(uint8_t idx) {
    Adafruit_ST7735* tft = tfts[physOf(posOfSlot(idx))];
    KeyConfig&       k   = keys[idx];
    if (!k.label[0] && !k.sublabel[0]) return;

    int16_t x1, y1;
    uint16_t w, h;

    if (k.label[0]) {
        tft->setTextSize(2);
        tft->getTextBounds(k.label, 0, 0, &x1, &y1, &w, &h);
        int16_t lx = (128 - (int16_t)w) / 2;
        int16_t ly = k.sublabel[0] ? 96 : 104;
        tft->setTextColor(ST77XX_BLACK);
        for (int8_t dx = -1; dx <= 1; dx++) {
            for (int8_t dy = -1; dy <= 1; dy++) {
                if (dx || dy) {
                    tft->setCursor(lx + dx, ly + dy);
                    tft->print(k.label);
                }
            }
        }
        tft->setTextColor(ST77XX_WHITE);
        tft->setCursor(lx, ly);
        tft->print(k.label);
    }

    if (k.sublabel[0]) {
        tft->setTextSize(1);
        tft->getTextBounds(k.sublabel, 0, 0, &x1, &y1, &w, &h);
        int16_t sx = (128 - (int16_t)w) / 2;
        int16_t sy = 116;
        tft->setTextColor(ST77XX_BLACK);
        tft->setCursor(sx + 1, sy + 1);
        tft->print(k.sublabel);
        tft->setTextColor(ST77XX_WHITE);
        tft->setCursor(sx, sy);
        tft->print(k.sublabel);
    }
}

void drawKey(uint8_t idx) {
    if (!slotVisible(idx)) return;   // slot lives on another page
    Adafruit_ST7735* tft = tfts[physOf(posOfSlot(idx))];
    KeyConfig&       k   = keys[idx];

    // Prefer SD icon when present — raw background + live text overlay
    if (sdOK && frameBuf) {
        char path[40];
        snprintf(path, sizeof(path), "/osd/keys/%u/icon.rgb565", idx);
        File f = SD.open(path, FILE_READ);
        if (f && f.size() == FRAME_BYTES) {
            f.read((uint8_t*)frameBuf, FRAME_BYTES);
            f.close();
            // Transparent pixels adopt the key's current background color
            uint8_t* b = (uint8_t*)frameBuf;
            uint8_t bgHi = (uint8_t)(k.bgColor >> 8), bgLo = (uint8_t)(k.bgColor & 0xFF);
            for (uint32_t i = 0; i < FRAME_BYTES; i += 2) {
                if (b[i] == TRANSPARENT_HI && b[i + 1] == TRANSPARENT_LO) {
                    b[i] = bgHi;
                    b[i + 1] = bgLo;
                }
            }
            tft->drawRGBBitmap(0, 0, frameBuf, 128, 128);
            if (k.overlay) drawOverlayText(idx);
            return;
        }
        if (f) f.close();
    }

    tft->fillScreen(k.bgColor);
    tft->setTextColor(ST77XX_WHITE);
    tft->setTextSize(1);
    tft->setCursor(112, 4);
    tft->print(posOfSlot(idx) + 1);

    tft->setTextColor(k.fgColor);
    tft->setTextSize(2);
    int16_t x1, y1;
    uint16_t w, h;
    tft->getTextBounds(k.label, 0, 0, &x1, &y1, &w, &h);
    tft->setCursor((128 - w) / 2, 44);
    tft->print(k.label);

    tft->drawFastHLine(10, 80, 108, ST77XX_WHITE);

    tft->setTextSize(1);
    tft->setTextColor(ST77XX_WHITE);
    tft->getTextBounds(k.sublabel, 0, 0, &x1, &y1, &w, &h);
    tft->setCursor((128 - w) / 2, 90);
    tft->print(k.sublabel);
}

void drawKeyPressed(uint8_t idx) {
    if (!slotVisible(idx)) return;
    uint8_t phys = physOf(posOfSlot(idx));
    tfts[phys]->invertDisplay(true);
    delay(80);
    tfts[phys]->invertDisplay(false);
}

// ── Animation from SD: /osd/keys/N/anim/0001.rgb565 … ───────

static uint16_t countAnimFrames(uint8_t idx) {
    char path[48];
    uint16_t n = 0;
    while (n < 999) {
        snprintf(path, sizeof(path), "/osd/keys/%u/anim/%04u.rgb565", idx, n + 1);
        if (!SD.exists(path)) break;
        n++;
    }
    return n;
}

void startAnimation(uint8_t idx, uint8_t fps) {
    if (!sdOK || !frameBuf) return;
    animCount = countAnimFrames(idx);
    if (animCount == 0) {
        Serial.printf("{\"event\":\"error\",\"msg\":\"no_frames\",\"index\":%u}\n", idx);
        return;
    }
    animKey   = idx;
    animFrame = 0;
    animFps   = constrain(fps, 1, 30);
    Serial.printf("{\"event\":\"anim\",\"index\":%u,\"frames\":%u,\"fps\":%u}\n",
                  idx, animCount, animFps);
}

void stopAnimation() {
    if (animKey >= 0) {
        uint8_t k = animKey;
        animKey = -1;
        drawKey(k);
    }
}

void serviceAnimation() {
    if (animKey < 0) return;
    if (!slotVisible((uint8_t)animKey)) { stopAnimation(); return; }
    uint32_t now = millis();
    if (now - animLastMs < (1000UL / animFps)) return;
    animLastMs = now;

    char path[48];
    snprintf(path, sizeof(path), "/osd/keys/%d/anim/%04u.rgb565", animKey, animFrame + 1);
    File f = SD.open(path, FILE_READ);
    if (f && f.size() == FRAME_BYTES) {
        f.read((uint8_t*)frameBuf, FRAME_BYTES);
        f.close();
        tfts[physOf(posOfSlot((uint8_t)animKey))]->drawRGBBitmap(0, 0, frameBuf, 128, 128);
        if (keys[animKey].overlay) drawOverlayText((uint8_t)animKey);
    } else if (f) {
        f.close();
    }
    animFrame = (animFrame + 1) % animCount;
}

// ── Serial protocol ─────────────────────────────────────────

// Returns true when the string field exists; out may be empty ("" clears the field).
static bool jsonStrField(const String& src, const char* keyName, String& out) {
    String pat = String("\"") + keyName + "\":\"";
    int a = src.indexOf(pat);
    if (a < 0) return false;
    a += pat.length();
    int b = src.indexOf('"', a);
    if (b < a) return false;
    out = src.substring(a, b);
    return true;
}

static long jsonInt(const String& src, const char* keyName, long dflt) {
    String pat = String("\"") + keyName + "\":";
    int a = src.indexOf(pat);
    if (a < 0) return dflt;
    a += pat.length();
    return src.substring(a).toInt();
}

// Cards inserted after boot: retry the mount on demand.
static bool ensureSdMounted() {
    if (sdOK) return true;
    SD.end();
    sdOK = SD.begin(PIN_SD_CS, SPI, 20000000);
    return sdOK;
}

// Announce send_data, then block until <len> raw bytes land in frameBuf.
static bool receiveFrame(long len) {
    Serial.println("{\"event\":\"send_data\"}");
    size_t got = 0;
    uint32_t t0 = millis();
    while (got < (size_t)len && millis() - t0 < 5000) {
        if (Serial.available()) {
            got += Serial.read((uint8_t*)frameBuf + got, len - got);
        }
    }
    return got == (size_t)len;
}

static void ensureKeyDir(long idx) {
    char path[40];
    SD.mkdir("/osd");
    SD.mkdir("/osd/keys");
    snprintf(path, sizeof(path), "/osd/keys/%ld", idx);
    SD.mkdir(path);
}

void emitKeyEvent(uint8_t idx, const char* action) {
    if (!Serial) return;
    Serial.printf("{\"event\":\"key\",\"index\":%u,\"action\":\"%s\"}\n", idx, action);
}

// ── Multi-tap engine ─────────────────────────────────────────
// Per PHYSICAL key: taps accumulated in the current sequence. A key whose
// slot has no hid2/hid3 binding resolves on the first press — zero latency.

static void switchPage(uint8_t page);   // defined with the page helpers below

static uint8_t  tapCount[KEY_COUNT] = {0};
static uint32_t tapLastMs[KEY_COUNT] = {0};
static uint8_t  tapSlot[KEY_COUNT] = {0};   // slot captured at the first tap

static uint8_t maxTapsFor(uint8_t slot) {
    if (keys[slot].hid3) return 3;
    if (keys[slot].hid2) return 2;
    return 1;
}

// Perform the action bound to a resolved tap level and tell the companion.
static void fireTap(uint8_t slot, uint8_t taps) {
    uint8_t hid = taps >= 3 ? keys[slot].hid3
                : taps == 2 ? keys[slot].hid2
                            : keys[slot].hidKey;

    if (hid == HID_PAGE_NEXT) {
        // Page switching is firmware-owned: works standalone and under the
        // companion identically
        switchPage((currentPage + 1) % pageCount);
    } else if (hid == HID_PAGE_PREV) {
        switchPage((currentPage + pageCount - 1) % pageCount);
    } else if (hid >= HID_PAGE_BASE && hid < HID_PAGE_BASE + MAX_PAGES) {
        switchPage(hid - HID_PAGE_BASE);  // no-op beyond pageCount
    } else if (!companionMode && hid != 0 &&
               !(hid >= HID_INTERNAL_MIN && hid <= HID_INTERNAL_MAX)) {
        Keyboard.press(hid);
        delay(20);
        Keyboard.release(hid);
    }

    if (Serial) {
        Serial.printf("{\"event\":\"key\",\"index\":%u,\"action\":\"press\",\"taps\":%u}\n",
                      slot, taps);
    }
}

static void resolveTaps(uint8_t pos) {
    uint8_t taps = tapCount[pos];
    uint8_t slot = tapSlot[pos];
    tapCount[pos] = 0;
    if (taps == 0) return;
    uint8_t maxTaps = maxTapsFor(slot);
    fireTap(slot, taps > maxTaps ? maxTaps : taps);
}

static void registerTap(uint8_t pos, uint8_t slot, uint32_t now) {
    if (tapCount[pos] == 0) {
        // First press: single-only keys fire immediately (no tap window)
        if (maxTapsFor(slot) == 1) {
            fireTap(slot, 1);
            return;
        }
        tapSlot[pos] = slot;
    }
    tapCount[pos]++;
    tapLastMs[pos] = now;
    // Reached the highest bound level — resolve now instead of waiting
    if (tapCount[pos] >= maxTapsFor(tapSlot[pos])) {
        resolveTaps(pos);
    }
}

void printDeviceInfo() {
    Serial.printf("{\"event\":\"info\",\"name\":\"Open Screen Deck\",\"fw\":\"%s\",\"proto\":%d,\"keys\":%d,\"pages\":%d,\"page\":%u,\"sd\":%s,\"psram\":%u,\"mode\":\"%s\",\"orient\":%u}\n",
                  FIRMWARE_VERSION, PROTOCOL_VERSION, KEY_COUNT, pageCount, currentPage,
                  sdOK ? "true" : "false",
                  ESP.getPsramSize(), companionMode ? "companion" : "hid", deckOrientation);
}

void printKeyState() {
    // Every configured slot — index is the slot; page = index/6
    for (uint8_t i = 0; i < pageCount * KEY_COUNT; i++) {
        Serial.printf("{\"event\":\"key_state\",\"index\":%u,\"page\":%u,\"label\":\"%s\",\"sublabel\":\"%s\",\"hid\":%u,\"h2\":%u,\"h3\":%u,\"bg\":%u,\"ov\":%u}\n",
                      i, pageOfSlot(i), keys[i].label, keys[i].sublabel,
                      keys[i].hidKey, keys[i].hid2, keys[i].hid3,
                      keys[i].bgColor, keys[i].overlay);
    }
}

static void savePagePref() {
    prefs.begin("osd", false);
    prefs.putUChar("page", currentPage);
    prefs.putUChar("pages", pageCount);
    prefs.end();
}

static void switchPage(uint8_t page) {
    if (page >= pageCount) return;
    stopAnimation();
    currentPage = page;
    for (uint8_t p = 0; p < KEY_COUNT; p++) drawKey(slotOfPos(p));
    savePagePref();
    if (Serial) Serial.printf("{\"event\":\"page\",\"page\":%u}\n", currentPage);
}

// Grow or shrink the deck's page list. Slots dropped by a shrink reset to
// defaults (config + NVS) so a re-added page starts fresh.
static void setPageCount(uint8_t n) {
    if (n < 1 || n > MAX_PAGES || n == pageCount) return;
    if (n < pageCount) {
        for (uint8_t s = n * KEY_COUNT; s < pageCount * KEY_COUNT; s++) {
            defaultSlotConfig(s);
            saveConfig(s);
        }
    }
    pageCount = n;
    if (currentPage >= pageCount) {
        switchPage(pageCount - 1);   // also persists both prefs
    } else {
        savePagePref();
    }
    if (Serial) Serial.printf("{\"event\":\"pages\",\"pages\":%u}\n", pageCount);
}

void handleCommand(String& line) {
    // Any traffic from the companion counts as a heartbeat — long uploads
    // (SET_ANIM streams) must not starve companion mode back to HID.
    if (companionMode) lastCompanionMs = millis();

    if (line == "PING") {
        Serial.println("{\"event\":\"pong\"}");

    } else if (line == "MODE COMPANION") {
        companionMode   = true;
        lastCompanionMs = millis();
        Serial.println("{\"event\":\"ok\",\"cmd\":\"MODE\",\"mode\":\"companion\"}");

    } else if (line == "MODE HID") {
        companionMode = false;
        Serial.println("{\"event\":\"ok\",\"cmd\":\"MODE\",\"mode\":\"hid\"}");

    } else if (line == "INFO") {
        printDeviceInfo();

    } else if (line == "GET_KEYS") {
        printKeyState();

    } else if (line.startsWith("SET_PAGES ")) {
        // SET_PAGES 1..8 — resize the deck's page list (v0.11+)
        long n = line.substring(10).toInt();
        if (n < 1 || n > MAX_PAGES) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_page_count\"}");
            return;
        }
        setPageCount((uint8_t)n);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_PAGES\",\"pages\":%u}\n", pageCount);

    } else if (line.startsWith("SET_PAGE ")) {
        // SET_PAGE 0..pageCount-1 — show that page on the physical screens
        long p = line.substring(9).toInt();
        if (p < 0 || p >= pageCount) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_page\"}");
            return;
        }
        switchPage((uint8_t)p);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_PAGE\",\"page\":%u}\n", currentPage);

    } else if (line.startsWith("DRAW ")) {
        int idx = line.substring(5).toInt();
        if (idx >= 0 && idx < TOTAL_KEYS) drawKey((uint8_t)idx);

    } else if (line == "DRAW_ALL") {
        stopAnimation();
        for (uint8_t p = 0; p < KEY_COUNT; p++) drawKey(slotOfPos(p));

    } else if (line.startsWith("SET_KEY ")) {
        // SET_KEY {"index":0,"label":"MUTE","sublabel":"x","hid":104,"bg":21609}
        // index is a global slot (0..23); slots on other pages update config
        // and NVS but draw nothing until their page is shown
        long idx = jsonInt(line, "index", -1);
        if (idx < 0 || idx >= TOTAL_KEYS) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_index\"}");
            return;
        }
        String lbl, sub;
        long hid = jsonInt(line, "hid", keys[idx].hidKey);
        long h2  = jsonInt(line, "h2", keys[idx].hid2);
        long h3  = jsonInt(line, "h3", keys[idx].hid3);
        long bg  = jsonInt(line, "bg", keys[idx].bgColor);
        long ov  = jsonInt(line, "ov", keys[idx].overlay);
        if (jsonStrField(line, "label", lbl))    strlcpy(keys[idx].label, lbl.c_str(), sizeof(keys[idx].label));
        if (jsonStrField(line, "sublabel", sub)) strlcpy(keys[idx].sublabel, sub.c_str(), sizeof(keys[idx].sublabel));
        keys[idx].hidKey  = (uint8_t)hid;
        keys[idx].hid2    = (uint8_t)h2;
        keys[idx].hid3    = (uint8_t)h3;
        keys[idx].bgColor = (uint16_t)bg;
        keys[idx].overlay = ov ? 1 : 0;
        saveConfig((uint8_t)idx);
        drawKey((uint8_t)idx);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_KEY\",\"index\":%ld}\n", idx);

    } else if (line.startsWith("SET_IMAGE ")) {
        // SET_IMAGE {"index":0,"len":32768} + <len> raw RGB565 bytes
        long idx = jsonInt(line, "index", -1);
        long len = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= TOTAL_KEYS || len != FRAME_BYTES || !frameBuf) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_image_header\"}");
            return;
        }
        if (receiveFrame(len)) {
            stopAnimation();
            if (slotVisible((uint8_t)idx)) {
                tfts[physOf(posOfSlot((uint8_t)idx))]->drawRGBBitmap(0, 0, frameBuf, 128, 128);
            }
            if (ensureSdMounted()) {   // persist as the key icon
                char path[40];
                ensureKeyDir(idx);
                snprintf(path, sizeof(path), "/osd/keys/%ld/icon.rgb565", idx);
                File f = SD.open(path, FILE_WRITE);
                if (f) { f.write((uint8_t*)frameBuf, len); f.close(); }
                // Redraw from SD: applies transparency + overlay text
                drawKey((uint8_t)idx);
            }
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_IMAGE\",\"index\":%ld}\n", idx);
        } else {
            Serial.println("{\"event\":\"error\",\"msg\":\"image_timeout\"}");
        }

    } else if (line.startsWith("SET_FACE ")) {
        // SET_FACE {"index":0,"len":32768} + raw bytes — draw WITHOUT SD
        // persistence. Live tiles (clock, CPU meter, …) stream through here
        // so they never wear the SD card or overwrite the stored icon.
        long idx = jsonInt(line, "index", -1);
        long len = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= TOTAL_KEYS || len != FRAME_BYTES || !frameBuf) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_face_header\"}");
            return;
        }
        if (receiveFrame(len)) {
            if (slotVisible((uint8_t)idx)) {
                if (animKey == idx) stopAnimation();
                tfts[physOf(posOfSlot((uint8_t)idx))]->drawRGBBitmap(0, 0, frameBuf, 128, 128);
            }
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_FACE\",\"index\":%ld}\n", idx);
        } else {
            Serial.println("{\"event\":\"error\",\"msg\":\"face_timeout\"}");
        }

    } else if (line.startsWith("SET_ANIM ")) {
        // SET_ANIM {"index":0,"frame":1,"len":32768} + <len> raw RGB565 bytes
        // Writes /osd/keys/N/anim/0001.rgb565 …; frames are 1-based
        long idx   = jsonInt(line, "index", -1);
        long frame = jsonInt(line, "frame", 0);
        long len   = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= TOTAL_KEYS || frame < 1 || frame > 999 ||
            len != FRAME_BYTES || !frameBuf || !ensureSdMounted()) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_anim_header\"}");
            return;
        }
        if (!receiveFrame(len)) {
            Serial.println("{\"event\":\"error\",\"msg\":\"anim_timeout\"}");
            return;
        }
        char path[48];
        ensureKeyDir(idx);
        snprintf(path, sizeof(path), "/osd/keys/%ld/anim", idx);
        SD.mkdir(path);
        snprintf(path, sizeof(path), "/osd/keys/%ld/anim/%04ld.rgb565", idx, frame);
        File f = SD.open(path, FILE_WRITE);
        bool written = false;
        if (f) {
            written = f.write((uint8_t*)frameBuf, len) == (size_t)len;
            f.close();
        }
        if (written) {
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_ANIM\",\"index\":%ld,\"frame\":%ld}\n", idx, frame);
        } else {
            Serial.println("{\"event\":\"error\",\"msg\":\"sd_write_failed\"}");
        }

    } else if (line.startsWith("ANIM_CLEAR")) {
        // ANIM_CLEAR 0 → delete all animation frames for key 0
        long idx = line.substring(10).toInt();
        if (idx < 0 || idx >= TOTAL_KEYS) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_index\"}");
            return;
        }
        if (animKey == idx) stopAnimation();
        uint16_t removed = 0;
        if (sdOK) {
            char path[48];
            while (removed < 999) {
                snprintf(path, sizeof(path), "/osd/keys/%ld/anim/%04u.rgb565", idx, removed + 1);
                if (!SD.exists(path)) break;
                SD.remove(path);
                removed++;
            }
        }
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"ANIM_CLEAR\",\"index\":%ld,\"removed\":%u}\n", idx, removed);

    } else if (line.startsWith("ANIM ")) {
        // ANIM 0 10   → play key 0 at 10 fps;  ANIM STOP
        String rest = line.substring(5);
        if (rest == "STOP") {
            stopAnimation();
            Serial.println("{\"event\":\"ok\",\"cmd\":\"ANIM_STOP\"}");
        } else {
            int sp  = rest.indexOf(' ');
            int idx = rest.toInt();
            int fps = (sp > 0) ? rest.substring(sp + 1).toInt() : 10;
            if (idx >= 0 && idx < TOTAL_KEYS) startAnimation((uint8_t)idx, (uint8_t)fps);
        }

    } else if (line.startsWith("SD_LS")) {
        // SD_LS /osd/keys → one sd_entry line per item + sd_ls_done
        String path = line.substring(5);
        path.trim();
        if (path.length() == 0) path = "/";
        if (!ensureSdMounted()) {
            Serial.println("{\"event\":\"error\",\"msg\":\"sd_unmounted\"}");
            return;
        }
        File dir = SD.open(path);
        if (!dir || !dir.isDirectory()) {
            if (dir) dir.close();
            Serial.println("{\"event\":\"error\",\"msg\":\"not_a_directory\"}");
            return;
        }
        uint16_t count = 0;
        File entry = dir.openNextFile();
        while (entry && count < 500) {
            Serial.printf("{\"event\":\"sd_entry\",\"name\":\"%s\",\"dir\":%s,\"size\":%u}\n",
                          entry.name(),
                          entry.isDirectory() ? "true" : "false",
                          (unsigned)entry.size());
            count++;
            entry.close();
            entry = dir.openNextFile();
        }
        dir.close();
        Serial.printf("{\"event\":\"sd_ls_done\",\"path\":\"%s\",\"count\":%u}\n", path.c_str(), count);

    } else if (line.startsWith("SD_RM ")) {
        // SD_RM /osd/keys/0/icon.rgb565 → remove file (or empty dir)
        String path = line.substring(6);
        path.trim();
        if (path.length() < 2 || !ensureSdMounted()) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_path\"}");
            return;
        }
        bool ok;
        File target = SD.open(path);
        bool isDir = target && target.isDirectory();
        if (target) target.close();
        ok = isDir ? SD.rmdir(path) : SD.remove(path);
        if (ok) {
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SD_RM\",\"path\":\"%s\"}\n", path.c_str());
        } else {
            Serial.println("{\"event\":\"error\",\"msg\":\"rm_failed\"}");
        }

    } else if (line.startsWith("SET_ORIENT")) {
        // SET_ORIENT 0..3 — rotate every display + remap key positions
        long o = line.substring(10).toInt();
        if (o < 0 || o > 3) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_orientation\"}");
            return;
        }
        stopAnimation();
        deckOrientation = (uint8_t)o;
        rebuildOrientationMaps();
        for (uint8_t i = 0; i < KEY_COUNT; i++) {
            tfts[i]->setRotation(displayRotation());
        }
        for (uint8_t p = 0; p < KEY_COUNT; p++) {
            drawKey(slotOfPos(p));
        }
        prefs.begin("osd", false);
        prefs.putUChar("orient", deckOrientation);
        prefs.end();
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_ORIENT\",\"orient\":%u}\n", deckOrientation);

    } else if (line == "SD_INFO") {
        if (ensureSdMounted()) {
            Serial.printf("{\"event\":\"sd\",\"size_mb\":%llu,\"used_mb\":%llu}\n",
                          SD.totalBytes() / (1024ULL * 1024ULL),
                          SD.usedBytes() / (1024ULL * 1024ULL));
        } else {
            Serial.println("{\"event\":\"sd\",\"mounted\":false}");
        }

    } else {
        Serial.println("{\"event\":\"error\",\"msg\":\"unknown_command\"}");
    }
}

void handleSerialInput() {
    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n' || c == '\r') {
            if (serialLine.length() == 0) continue;
            serialLine.trim();
            handleCommand(serialLine);
            serialLine = "";
        } else {
            serialLine += c;
            if (serialLine.length() > 200) serialLine = "";
        }
    }
}

// ── Config persistence (NVS) ────────────────────────────────

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

// ── Setup / loop ────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    Keyboard.begin();
    USB.begin();

    frameBuf = (uint16_t*)ps_malloc(FRAME_BYTES);
    if (!frameBuf) frameBuf = (uint16_t*)malloc(FRAME_BYTES);

    // Added pages default to dark keys (cycling F-key HID), no sublabel
    for (uint8_t s = KEY_COUNT; s < TOTAL_KEYS; s++) {
        defaultSlotConfig(s);
    }

    loadConfig();

    pinMode(PIN_BL, OUTPUT);
    digitalWrite(PIN_BL, HIGH);

    pinMode(PIN_RST, OUTPUT);
    digitalWrite(PIN_RST, LOW);
    delay(20);
    digitalWrite(PIN_RST, HIGH);
    delay(150);

    for (int i = 0; i < KEY_COUNT; i++) {
        pinMode(CS_PINS[i], OUTPUT);
        digitalWrite(CS_PINS[i], HIGH);
    }
    pinMode(PIN_SD_CS, OUTPUT);
    digitalWrite(PIN_SD_CS, HIGH);

    SPI.begin(PIN_SCK, PIN_MISO, PIN_MOSI);

    sdOK = SD.begin(PIN_SD_CS, SPI, 20000000);

    rebuildOrientationMaps();
    for (int i = 0; i < KEY_COUNT; i++) {
        tfts[i] = new Adafruit_ST7735(&SPI, CS_PINS[i], PIN_DC, -1);
        tfts[i]->initR(INITR_144GREENTAB);
        tfts[i]->setRotation(displayRotation());
    }
    for (uint8_t p = 0; p < KEY_COUNT; p++) {
        drawKey(slotOfPos(p));
    }

    for (int i = 0; i < KEY_COUNT; i++) {
        pinMode(KEY_PINS[i], INPUT_PULLUP);
    }

    delay(500);
    printDeviceInfo();
}

void loop() {
    handleSerialInput();
    serviceAnimation();

    uint32_t now = millis();

    // Companion heartbeat lapsed → fall back to plain HID macro pad
    if (companionMode && (now - lastCompanionMs) > COMPANION_TIMEOUT_MS) {
        companionMode = false;
    }

    for (int i = 0; i < KEY_COUNT; i++) {
        bool state = digitalRead(KEY_PINS[i]);

        if (state != lastState[i]) {
            lastDebounce[i] = now;
        }

        if ((now - lastDebounce[i]) > DEBOUNCE_MS) {
            // Buttons are wired to physical modules — report the LOGICAL key
            // on the CURRENT page (global slot index)
            uint8_t slot = slotOfPos(PHYS_TO_LOGICAL[i]);
            if (state == LOW && lastState[i] == HIGH) {
                drawKeyPressed(slot);
                registerTap(i, slot, now);
            } else if (state == HIGH && lastState[i] == LOW) {
                emitKeyEvent(slot, "release");
            }
        }

        lastState[i] = state;
    }

    // Pending tap sequences whose window expired resolve at their count
    for (int i = 0; i < KEY_COUNT; i++) {
        if (tapCount[i] > 0 && (now - tapLastMs[i]) > TAP_WINDOW_MS) {
            resolveTaps(i);
        }
    }
}
