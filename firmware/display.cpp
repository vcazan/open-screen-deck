#include "display.h"
#include "state.h"
#include "pages.h"
#include "orientation.h"
#include "protocol.h"
#include <SPI.h>
#include <SD.h>
#include <string.h>

Adafruit_ST7735* tfts[KEY_COUNT];
uint16_t*        frameBuf = nullptr;
bool             sdOK     = false;

// Last SET_IMAGE / SET_FACE per slot (PSRAM). Page switches blit these
// instead of falling back to NVS labels when the microSD card is missing.
static uint16_t* faceCache = nullptr;
static bool      faceHas[TOTAL_KEYS] = {};

static uint16_t* cachedFace(uint8_t idx) {
    return faceCache + ((size_t)idx * (FRAME_BYTES / 2));
}

// Rev E dual SPI: bus A (FSPI, the global `SPI`) drives J1-J3 + microSD;
// bus B (HSPI) drives J4-J6. Two buses halve the blit load per bus and
// let the SD share bus A without stalling the right column.
SPIClass spiB(HSPI);
static const uint32_t DISPLAY_HZ = 40000000;   // 40 MHz, per Rev E plan

#if DEBUG_DRAW
#define DBG(...) do { if (Serial) Serial.printf(__VA_ARGS__); } while (0)
#else
#define DBG(...)
#endif

const uint8_t CS_PINS[KEY_COUNT]  = {10, 1, 2, 3, 4, 5};
const uint8_t KEY_PINS[KEY_COUNT] = {38, 39, 40, 41, 42, 47};

// ── RGB565 helpers ──────────────────────────────────────────────────

static uint16_t shade565(uint16_t c, int8_t amt) {
    int r = ((c >> 11) & 0x1f) + amt;
    int g = ((c >> 5) & 0x3f) + (amt * 2);
    int b = (c & 0x1f) + amt;
    if (r < 0) r = 0; else if (r > 31) r = 31;
    if (g < 0) g = 0; else if (g > 63) g = 63;
    if (b < 0) b = 0; else if (b > 31) b = 31;
    return (uint16_t)((r << 11) | (g << 5) | b);
}

static void fillGradient(Adafruit_ST7735* tft, uint16_t bg) {
    for (int y = 0; y < 128; y++) {
        int8_t amt = (int8_t)(((y - 64) * 3) / 64);
        tft->drawFastHLine(0, y, 128, shade565(bg, amt));
    }
}

/**
 * Blit a 128×128 RGB565 frame from frameBuf.
 * Protocol bytes are big-endian [hi, lo] per pixel — on ESP32, Adafruit's
 * drawRGBBitmap endian-swaps native uint16 values and corrupts streamed
 * frames. writePixels(..., bigEndian=true) sends the wire order as-is.
 */
void blitFrame(Adafruit_ST7735* tft, uint16_t* buf) {
    tft->startWrite();
    tft->setAddrWindow(0, 0, 128, 128);
    tft->writePixels(buf, 128 * 128, true, true);
    tft->endWrite();
}

/** Waveshare 0.85" ScreenKey tuning after Adafruit initR(INITR_144GREENTAB). */
static void tuneWavesharePanel(Adafruit_ST7735* tft) {
    // Vendor init enables display inversion for the IPS panel (SKU 34168)
    tft->invertDisplay(true);
}

/**
 * Adafruit's initR(INITR_144GREENTAB) sleeps 150+500+10+100 ms PER panel
 * (~4.6 s for six keys) before a pixel can appear. The six modules share
 * one RST line, so SWRESET / SLPOUT / DISPON wait once for the whole deck.
 */
class ScreenKeyTFT : public Adafruit_ST7735 {
public:
    ScreenKeyTFT(SPIClass* spi, int8_t cs, int8_t dc)
        : Adafruit_ST7735(spi, cs, dc, -1) {}

    void bringUp(uint32_t hz) {
        begin(hz);
        setColRowStart(2, 3);
        _width  = 128;
        _height = 128;
    }

    void rotate144(uint8_t m) {
        rotation = m & 3;
        _rowstart = (rotation < 2) ? 3 : 1;
        uint8_t madctl;
        switch (rotation) {
        case 0:
            madctl = ST77XX_MADCTL_MX | ST77XX_MADCTL_MY | ST7735_MADCTL_BGR;
            _width = 128; _height = 128;
            _xstart = _colstart; _ystart = _rowstart;
            break;
        case 1:
            madctl = ST77XX_MADCTL_MY | ST77XX_MADCTL_MV | ST7735_MADCTL_BGR;
            _width = 128; _height = 128;
            _ystart = _colstart; _xstart = _rowstart;
            break;
        case 2:
            madctl = ST7735_MADCTL_BGR;
            _width = 128; _height = 128;
            _xstart = _colstart; _ystart = _rowstart;
            break;
        default:
            madctl = ST77XX_MADCTL_MX | ST77XX_MADCTL_MV | ST7735_MADCTL_BGR;
            _width = 128; _height = 128;
            _ystart = _colstart; _xstart = _rowstart;
            break;
        }
        sendCommand(ST77XX_MADCTL, &madctl, 1);
    }
};

static ScreenKeyTFT* panel(uint8_t i) {
    return static_cast<ScreenKeyTFT*>(tfts[i]);
}

static void cmdAll(uint8_t cmd, const uint8_t* data = nullptr, uint8_t n = 0) {
    for (uint8_t i = 0; i < KEY_COUNT; i++) {
        tfts[i]->sendCommand(cmd, data, n);
    }
}

static void batchInitCommands() {
    cmdAll(ST77XX_SWRESET);
    delay(80);
    cmdAll(ST77XX_SLPOUT);
    delay(80);

    static const uint8_t frm[] = {0x01, 0x2C, 0x2D};
    cmdAll(ST7735_FRMCTR1, frm, 3);
    cmdAll(ST7735_FRMCTR2, frm, 3);
    static const uint8_t frm3[] = {0x01, 0x2C, 0x2D, 0x01, 0x2C, 0x2D};
    cmdAll(ST7735_FRMCTR3, frm3, 6);
    static const uint8_t invctr[] = {0x07};
    cmdAll(ST7735_INVCTR, invctr, 1);
    static const uint8_t pw1[] = {0xA2, 0x02, 0x84};
    cmdAll(ST7735_PWCTR1, pw1, 3);
    static const uint8_t pw2[] = {0xC5};
    cmdAll(ST7735_PWCTR2, pw2, 1);
    static const uint8_t pw3[] = {0x0A, 0x00};
    cmdAll(ST7735_PWCTR3, pw3, 2);
    static const uint8_t pw4[] = {0x8A, 0x2A};
    cmdAll(ST7735_PWCTR4, pw4, 2);
    static const uint8_t pw5[] = {0x8A, 0xEE};
    cmdAll(ST7735_PWCTR5, pw5, 2);
    static const uint8_t vm[] = {0x0E};
    cmdAll(ST7735_VMCTR1, vm, 1);
    cmdAll(ST77XX_INVOFF);
    static const uint8_t colmod[] = {0x05};
    cmdAll(ST77XX_COLMOD, colmod, 1);

    static const uint8_t caset[] = {0x00, 0x00, 0x00, 0x7F};
    cmdAll(ST77XX_CASET, caset, 4);
    cmdAll(ST77XX_RASET, caset, 4);

    static const uint8_t gpos[] = {
        0x02, 0x1c, 0x07, 0x12, 0x37, 0x32, 0x29, 0x2d,
        0x29, 0x25, 0x2B, 0x39, 0x00, 0x01, 0x03, 0x10};
    static const uint8_t gneg[] = {
        0x03, 0x1d, 0x07, 0x06, 0x2E, 0x2C, 0x29, 0x2D,
        0x2E, 0x2E, 0x37, 0x3F, 0x00, 0x00, 0x02, 0x10};
    cmdAll(ST7735_GMCTRP1, gpos, 16);
    cmdAll(ST7735_GMCTRN1, gneg, 16);

    cmdAll(ST77XX_NORON);
    delay(10);
    cmdAll(ST77XX_DISPON);
    delay(20);
}

void displayApplyOrientation() {
    uint8_t rot = displayRotation();
    for (uint8_t i = 0; i < KEY_COUNT; i++) panel(i)->rotate144(rot);
}

static void drawOutlinedText(Adafruit_ST7735* tft, int16_t x, int16_t y,
                             const char* text, uint8_t size, uint16_t fg) {
    tft->setTextSize(size);
    tft->setTextColor(ST77XX_BLACK);
    for (int8_t dx = -1; dx <= 1; dx++) {
        for (int8_t dy = -1; dy <= 1; dy++) {
            if (dx || dy) {
                tft->setCursor(x + dx, y + dy);
                tft->print(text);
            }
        }
    }
    tft->setTextColor(fg);
    tft->setCursor(x, y);
    tft->print(text);
}

void displayInit() {
    frameBuf = (uint16_t*)ps_malloc(FRAME_BYTES);
    if (!frameBuf) frameBuf = (uint16_t*)malloc(FRAME_BYTES);

    faceCache = (uint16_t*)ps_malloc((size_t)TOTAL_KEYS * FRAME_BYTES);
    if (faceCache) memset(faceHas, 0, sizeof(faceHas));

    ledcAttach(PIN_BL, 5000, 8);
    ledcWrite(PIN_BL, 0);

    pinMode(PIN_RST, OUTPUT);
    digitalWrite(PIN_RST, LOW);
    delay(5);
    digitalWrite(PIN_RST, HIGH);
    delay(50);

    for (int i = 0; i < KEY_COUNT; i++) {
        pinMode(CS_PINS[i], OUTPUT);
        digitalWrite(CS_PINS[i], HIGH);
    }
    pinMode(PIN_SD_CS, OUTPUT);
    digitalWrite(PIN_SD_CS, HIGH);

    SPI.begin(PIN_SCK_A, PIN_MISO, PIN_MOSI_A);
    SPI.setFrequency(DISPLAY_HZ);
    spiB.begin(PIN_SCK_B, -1, PIN_MOSI_B);
    spiB.setFrequency(DISPLAY_HZ);

    rebuildOrientationMaps();
    for (int i = 0; i < KEY_COUNT; i++) {
        bool busA = i < 3;
        auto* p = new ScreenKeyTFT(busA ? &SPI : &spiB, CS_PINS[i],
                                   busA ? PIN_DC_A : PIN_DC_B);
        tfts[i] = p;
        p->bringUp(DISPLAY_HZ);
        p->setSPISpeed(DISPLAY_HZ);
    }
    batchInitCommands();
    for (int i = 0; i < KEY_COUNT; i++) {
        tuneWavesharePanel(tfts[i]);
        panel(i)->rotate144(displayRotation());
    }
}

void displayReinitPanels() {
    DBG("{\"event\":\"dbg\",\"op\":\"reinit_panels\"}\n");
    displayBacklight(false);

    digitalWrite(PIN_RST, LOW);
    delay(5);
    digitalWrite(PIN_RST, HIGH);
    delay(50);

    batchInitCommands();
    for (int i = 0; i < KEY_COUNT; i++) {
        tuneWavesharePanel(tfts[i]);
        panel(i)->rotate144(displayRotation());
    }
    drawAllVisible();
}

// 0..255 target brightness; sensors.cpp drives this from the VEML7700.
static uint8_t  blLevel        = 255;
static bool     blOn           = false;
static uint32_t fadeInStartMs  = 0;
static bool     fadingIn       = false;
static uint32_t holdFacesUntil = 0;
static const uint32_t FADE_IN_MS = 160;

static bool     drawAllPending      = false;
static uint32_t drawAllReadyAtMs    = 0;
static bool     hostOwnsReveal      = false;
static bool     hostBatch           = false;
static uint32_t hostBatchSinceMs    = 0;

void displayBacklight(bool on) {
    if (!on) fadingIn = false;
    blOn = on;
    ledcWrite(PIN_BL, on ? blLevel : 0);
}

void displaySetBrightness(uint8_t level) {
    blLevel = level < 8 ? 8 : level;   // never fully dark while "on"
    if (blOn && !fadingIn) ledcWrite(PIN_BL, blLevel);
}

uint8_t displayBrightness() {
    return blLevel;
}

void drawAllVisible() {
    DBG("{\"event\":\"dbg\",\"op\":\"draw_all\",\"page\":%u,\"pages\":%u}\n", currentPage, pageCount);
    fadingIn = false;
    displayBacklight(false);
    for (uint8_t p = 0; p < KEY_COUNT; p++) {
        drawKey(slotOfPos(p));
    }
    // Reveal together: PWM ramps up so the six panels appear as one.
    holdFacesUntil = millis() + 280;
    fadeInStartMs  = millis();
    fadingIn       = true;
    blOn           = true;
}

void serviceBacklightFade() {
    if (!fadingIn) return;
    uint32_t t = millis() - fadeInStartMs;
    if (t >= FADE_IN_MS) {
        ledcWrite(PIN_BL, blLevel);
        fadingIn = false;
        return;
    }
    // ease-out cubic — fast start, gentle settle (matches the app curve)
    float p = (float)t / (float)FADE_IN_MS;
    float e = 1.f - (1.f - p) * (1.f - p) * (1.f - p);
    ledcWrite(PIN_BL, (uint8_t)(blLevel * e + 0.5f));
}

bool deferFaceBlit() {
    if (hostBatch) return true;
    if (drawAllPending) return true;
    return (int32_t)(millis() - holdFacesUntil) < 0;
}

static const uint32_t BOOT_REVEAL_MS       = 800;
static const uint32_t DRAW_ALL_COALESCE_MS = 350;
static const uint32_t HOST_REVEAL_FALLBACK_MS = 2500;

void setHostBatchMode(bool on) {
    if (hostBatch != on) {
        DBG("{\"event\":\"dbg\",\"op\":\"batch\",\"on\":%d}\n", on ? 1 : 0);
    }
    hostBatch = on;
    if (on) hostBatchSinceMs = millis();
}

bool hostBatchMode() {
    return hostBatch;
}

void clearHostReveal() {
    hostOwnsReveal = false;
    hostBatch      = false;
}

/** If the host never sends DRAW_ALL, show NVS labels anyway. */
void serviceHostRevealFallback() {
    if (!hostOwnsReveal || !hostBatch) return;
    if (drawAllPending) return;
    if ((int32_t)(millis() - hostBatchSinceMs) < (int32_t)HOST_REVEAL_FALLBACK_MS) return;
    hostBatch      = false;
    hostOwnsReveal = false;
    DBG("{\"event\":\"dbg\",\"op\":\"reveal_fallback\"}\n");
    drawAllVisible();
}

void scheduleBootReveal() {
    if (hostOwnsReveal) return;
    drawAllPending   = true;
    drawAllReadyAtMs = millis() + BOOT_REVEAL_MS;
}

void deferBootDrawToHost() {
    if (hostOwnsReveal) return;
    hostOwnsReveal   = true;
    drawAllPending   = false;
    displayBacklight(false);
}

void scheduleDrawAll() {
    drawAllPending   = true;
    drawAllReadyAtMs = millis() + DRAW_ALL_COALESCE_MS;
}

void serviceDrawAll() {
    if (!drawAllPending) return;
    if ((int32_t)(millis() - drawAllReadyAtMs) < 0) return;
    // A full redraw blocks the loop for ~200 ms; if the host is mid-way
    // through streaming a 32 KB frame, the CDC ring overflows and the
    // frame's tail is silently dropped (lost plugin faces at startup).
    if (frameRxActive()) {
        drawAllReadyAtMs = millis() + 50;
        return;
    }
    drawAllPending = false;
    hostBatch      = false;
    drawAllVisible();
}

void cacheIncomingFace(uint8_t idx) {
    if (!faceCache || idx >= TOTAL_KEYS || !frameBuf) return;
    memcpy(cachedFace(idx), frameBuf, FRAME_BYTES);
    faceHas[idx] = true;
}

void clearCachedFace(uint8_t idx) {
    if (idx < TOTAL_KEYS) faceHas[idx] = false;
}

static void blitCachedOrBuf(Adafruit_ST7735* tft, uint16_t* src, const KeyConfig& k, uint8_t idx) {
    if (src != frameBuf && frameBuf) memcpy(frameBuf, src, FRAME_BYTES);
    uint8_t* b = (uint8_t*)frameBuf;
    uint8_t bgHi = (uint8_t)(k.bgColor >> 8), bgLo = (uint8_t)(k.bgColor & 0xFF);
    for (uint32_t i = 0; i < FRAME_BYTES; i += 2) {
        if (b[i] == TRANSPARENT_HI && b[i + 1] == TRANSPARENT_LO) {
            b[i] = bgHi;
            b[i + 1] = bgLo;
        }
    }
    blitFrame(tft, frameBuf);
    if (k.overlay) drawOverlayText(idx);
}

void drawOverlayText(uint8_t idx) {
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
        drawOutlinedText(tft, lx, ly, k.label, 2, ST77XX_WHITE);
    }

    if (k.sublabel[0]) {
        tft->setTextSize(1);
        tft->getTextBounds(k.sublabel, 0, 0, &x1, &y1, &w, &h);
        int16_t sx = (128 - (int16_t)w) / 2;
        drawOutlinedText(tft, sx, 116, k.sublabel, 1, ST77XX_WHITE);
    }
}

void drawKey(uint8_t idx) {
    if (!slotVisible(idx)) {
        DBG("{\"event\":\"dbg\",\"op\":\"draw_skip\",\"slot\":%u,\"page\":%u,\"cur\":%u}\n",
            idx, pageOfSlot(idx), currentPage);
        return;
    }
    Adafruit_ST7735* tft = tfts[physOf(posOfSlot(idx))];
    KeyConfig&       k   = keys[idx];
    DBG("{\"event\":\"dbg\",\"op\":\"draw\",\"slot\":%u,\"pos\":%u,\"phys\":%u,\"label\":\"%s\"}\n",
        idx, posOfSlot(idx), physOf(posOfSlot(idx)), k.label);

    if (faceCache && faceHas[idx]) {
        DBG("{\"event\":\"dbg\",\"op\":\"draw_cache\",\"slot\":%u,\"phys\":%u}\n",
            idx, physOf(posOfSlot(idx)));
        blitCachedOrBuf(tft, cachedFace(idx), k, idx);
        return;
    }

    if (sdOK && frameBuf) {
        char path[40];
        snprintf(path, sizeof(path), "/osd/keys/%u/icon.rgb565", idx);
        File f = SD.open(path, FILE_READ);
        if (f && f.size() == FRAME_BYTES) {
            f.read((uint8_t*)frameBuf, FRAME_BYTES);
            f.close();
            uint8_t* b = (uint8_t*)frameBuf;
            uint8_t bgHi = (uint8_t)(k.bgColor >> 8), bgLo = (uint8_t)(k.bgColor & 0xFF);
            uint32_t sum = 0;
            for (uint32_t i = 0; i < FRAME_BYTES; i += 2) {
                if (b[i] == TRANSPARENT_HI && b[i + 1] == TRANSPARENT_LO) {
                    b[i] = bgHi;
                    b[i + 1] = bgLo;
                }
                sum += (uint32_t)(b[i] * 31u) + b[i + 1];
            }
            DBG("{\"event\":\"dbg\",\"op\":\"draw_sd\",\"slot\":%u,\"phys\":%u,\"sum\":%u}\n",
                idx, physOf(posOfSlot(idx)), sum);
            blitFrame(tft, frameBuf);
            if (k.overlay) drawOverlayText(idx);
            return;
        }
        if (f) f.close();
    }

    // Fallback label card — gradient + accent bar (matches companion app style)
    fillGradient(tft, k.bgColor);
    tft->fillRect(0, 0, 128, 3, shade565(k.fgColor, 4));

    tft->setTextColor(ST77XX_WHITE);
    tft->setTextSize(1);
    tft->setCursor(112, 4);
    tft->print(posOfSlot(idx) + 1);

    int16_t x1, y1;
    uint16_t w, h;
    tft->setTextSize(2);
    tft->getTextBounds(k.label, 0, 0, &x1, &y1, &w, &h);
    drawOutlinedText(tft, (128 - (int16_t)w) / 2, 44, k.label, 2, k.fgColor);

    if (k.sublabel[0]) {
        tft->setTextSize(1);
        tft->getTextBounds(k.sublabel, 0, 0, &x1, &y1, &w, &h);
        drawOutlinedText(tft, (128 - (int16_t)w) / 2, 96, k.sublabel, 1, ST77XX_WHITE);
    }
}

void drawFlashingBanner() {
    // Panels keep this frame in GRAM after the MCU reboots into the ROM
    // bootloader — that's the only way the keys can say what's happening.
    fadingIn = false;
    displayBacklight(true);
    displaySetBrightness(220);

    struct Face { const char* title; const char* sub; uint16_t bg; };
    static const Face faces[KEY_COUNT] = {
        { "BOOT",     "mode",     0x1928 },
        { "LOADER",   "USB",      0x1928 },
        { "DO NOT",   "wait",     0xBAA0 },
        { "UNPLUG",   "USB in",   0xBAA0 },
        { "FLASH",    "writing",  0x0328 },
        { "WAIT",     "~30 sec",  0x0328 },
    };
    const uint16_t bar = 0xFE60; // amber — matches the app overlay

    for (uint8_t pos = 0; pos < KEY_COUNT; pos++) {
        Adafruit_ST7735* tft = tfts[physOf(pos)];
        const Face& f = faces[pos];
        fillGradient(tft, f.bg);
        tft->fillRect(0, 0, 128, 4, bar);

        int16_t x1, y1;
        uint16_t w, h;
        tft->setTextSize(2);
        tft->getTextBounds(f.title, 0, 0, &x1, &y1, &w, &h);
        drawOutlinedText(tft, (128 - (int16_t)w) / 2, 44, f.title, 2, ST77XX_WHITE);

        tft->setTextSize(1);
        tft->getTextBounds(f.sub, 0, 0, &x1, &y1, &w, &h);
        drawOutlinedText(tft, (128 - (int16_t)w) / 2, 96, f.sub, 1, ST77XX_WHITE);
    }
}

void drawKeyPressed(uint8_t idx) {
    // Press feedback is the per-key LED pulse + haptic (and optional
    // piezo — see CLICK_BEEP). We used to invertDisplay() here, but the
    // IPS panels already run inverted (tuneWavesharePanel); flipping it
    // swapped every color on the face and looked like a bug.
    (void)idx;
}

void servicePressFeedback() {}
