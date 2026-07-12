#include "media.h"
#include "display.h"
#include "pages.h"
#include "state.h"
#include "orientation.h"
#include <SPI.h>
#include <SD.h>

int8_t animKey = -1;

static uint16_t animFrame  = 0;
static uint16_t animCount  = 0;
static uint8_t  animFps    = 10;
static uint32_t animLastMs = 0;

bool ensureSdMounted() {
    if (sdOK) return true;
    SD.end();
    sdOK = SD.begin(PIN_SD_CS, SPI, 20000000);
    return sdOK;
}

void ensureKeyDir(long idx) {
    char path[40];
    SD.mkdir("/osd");
    SD.mkdir("/osd/keys");
    snprintf(path, sizeof(path), "/osd/keys/%ld", idx);
    SD.mkdir(path);
}

uint16_t countAnimFrames(uint8_t idx) {
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
        drawKey(k);   // restore the stored icon / label card
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
