#include "display.h"
#include "state.h"
#include "pages.h"
#include "orientation.h"
#include <SPI.h>
#include <SD.h>

Adafruit_ST7735* tfts[KEY_COUNT];
uint16_t*        frameBuf = nullptr;
bool             sdOK     = false;

const uint8_t CS_PINS[KEY_COUNT]  = {10, 1, 2, 3, 4, 5};
const uint8_t KEY_PINS[KEY_COUNT] = {38, 39, 40, 41, 42, 47};

void displayInit() {
    // One big frame buffer, ideally in PSRAM (the WROOM-1-N16R8 has 8 MB)
    frameBuf = (uint16_t*)ps_malloc(FRAME_BYTES);
    if (!frameBuf) frameBuf = (uint16_t*)malloc(FRAME_BYTES);

    pinMode(PIN_BL, OUTPUT);
    digitalWrite(PIN_BL, HIGH);

    // Hardware reset is shared by all six panels
    pinMode(PIN_RST, OUTPUT);
    digitalWrite(PIN_RST, LOW);
    delay(20);
    digitalWrite(PIN_RST, HIGH);
    delay(150);

    // Deselect everything before SPI starts
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
        // 1px black outline in all 8 directions keeps text readable on
        // any background
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

    // Prefer the SD icon when present — raw pixels + live text overlay
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

    // No media: the drawn label card
    tft->fillScreen(k.bgColor);
    tft->setTextColor(ST77XX_WHITE);
    tft->setTextSize(1);
    tft->setCursor(112, 4);
    tft->print(posOfSlot(idx) + 1);   // position badge, top-right

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
