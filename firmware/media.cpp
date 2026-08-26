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
    // A dead card makes SD.begin() block the loop for 1-2 s per probe.
    // Never probe while the host is streaming (frames would overflow and
    // corrupt the displays), and back off exponentially between attempts.
    static uint32_t lastAttemptMs = 0;
    static uint32_t backoffMs     = 5000;
    if (Serial && Serial.available()) return false;
    if (lastAttemptMs != 0 && (millis() - lastAttemptMs) < backoffMs) return false;
    lastAttemptMs = millis();
    if (backoffMs < 60000) backoffMs *= 2;
    SD.end();
    // A card wedged mid-write holds DAT0 busy and ignores init. Clock it
    // with CS high until it releases before re-probing (fast: ~1 ms).
    digitalWrite(PIN_SD_CS, HIGH);
    SPI.beginTransaction(SPISettings(400000, MSBFIRST, SPI_MODE0));
    for (int i = 0; i < 64; i++) SPI.transfer(0xFF);
    SPI.endTransaction();
    sdOK = SD.begin(PIN_SD_CS, SPI, 10000000);
    if (sdOK) backoffMs = 5000;
    if (Serial) {
        Serial.printf("{\"event\":\"sd_mount\",\"ok\":%s}\n", sdOK ? "true" : "false");
    }
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
        blitFrame(tfts[physOf(posOfSlot((uint8_t)animKey))], frameBuf);
        if (keys[animKey].overlay) drawOverlayText((uint8_t)animKey);
    } else if (f) {
        f.close();
    }
    animFrame = (animFrame + 1) % animCount;
}
