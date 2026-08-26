#include "protocol.h"
#include "config.h"
#include "state.h"
#include "pages.h"
#include "display.h"
#include "media.h"
#include "input.h"
#include "orientation.h"
#include "leds.h"
#include "sensors.h"
#include "haptics.h"
#include <SD.h>
#include <SPI.h>

static String serialLine;
static uint32_t lastSerialActivityMs = 0;

#if DEBUG_DRAW
#define PDBG(...) do { if (Serial) Serial.printf(__VA_ARGS__); } while (0)
#else
#define PDBG(...)
#endif

enum FrameKind : uint8_t { FK_NONE, FK_IMAGE, FK_FACE, FK_ANIM };

static bool     receivingFrame  = false;
static FrameKind frameKind      = FK_NONE;
static long     frameIdx        = -1;
static long     frameAnimNum    = 0;
static size_t   frameTarget     = 0;
static size_t   frameGot        = 0;
static uint32_t frameLastByteMs = 0;

static const uint32_t FRAME_RX_TIMEOUT_MS = 3000;

static void noteSerialActivity() {
    lastSerialActivityMs = millis();
}

static void yieldInteractive() {
    serviceKeys();
    serviceTapTimeouts();
    serviceHidRelease();
    servicePressFeedback();
}

static void finishFrameReceive();

static void startFrameReceive(FrameKind kind, long idx, size_t len, long animFrame = 0) {
    frameKind      = kind;
    frameIdx       = idx;
    frameAnimNum   = animFrame;
    frameTarget    = len;
    frameGot       = 0;
    frameLastByteMs = millis();
    receivingFrame = true;
    Serial.println("{\"event\":\"send_data\"}");
}

static void pumpFrameBytes() {
    if (!receivingFrame || !frameBuf) return;
    size_t budget = 2048;
    while (Serial.available() && frameGot < frameTarget && budget--) {
        ((uint8_t*)frameBuf)[frameGot++] = (uint8_t)Serial.read();
        noteSerialActivity();
        frameLastByteMs = millis();
        if ((frameGot & 0x07FF) == 0) yieldInteractive();
    }
    if (frameGot >= frameTarget) {
        finishFrameReceive();
        return;
    }
    // Host aborted mid-frame: without this, the NEXT command's bytes get
    // swallowed as frame data and the image lands on the wrong slot.
    if ((millis() - frameLastByteMs) > FRAME_RX_TIMEOUT_MS) {
        receivingFrame = false;
        frameKind      = FK_NONE;
        Serial.printf("{\"event\":\"error\",\"msg\":\"frame_timeout\",\"index\":%ld,\"got\":%u}\n",
                      frameIdx, (unsigned)frameGot);
    }
}

static void finishFrameReceive() {
    receivingFrame = false;
    const long idx = frameIdx;
    const long len = (long)frameTarget;

    if (frameKind == FK_IMAGE) {
        stopAnimation();
        cacheIncomingFace((uint8_t)idx);
        bool saved = false;
        if (ensureSdMounted()) {
            char path[40];
            ensureKeyDir(idx);
            snprintf(path, sizeof(path), "/osd/keys/%ld/icon.rgb565", idx);
            File f = SD.open(path, FILE_WRITE);
            if (f) {
                f.write((uint8_t*)frameBuf, len);
                f.close();
                saved = true;
                ledsFlashSd();
            } else {
                // Card dropped off the bus mid-session — force a remount
                // attempt instead of silently failing every write after.
                sdOK = false;
            }
        }
        // SET_IMAGE is a user/plugin persist — paint now unless a bulk
        // host batch is still coalescing. Page-switch hold is SET_FACE only.
        if (!hostBatchMode() && slotVisible((uint8_t)idx)) {
            PDBG("{\"event\":\"dbg\",\"op\":\"image_draw\",\"slot\":%ld,\"saved\":%s}\n",
                 idx, saved ? "true" : "false");
            drawKey((uint8_t)idx);
        } else {
            PDBG("{\"event\":\"dbg\",\"op\":\"image_defer\",\"slot\":%ld}\n", idx);
        }
        yieldInteractive();
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_IMAGE\",\"index\":%ld,\"saved\":%s}\n",
                      idx, saved ? "true" : "false");
    } else if (frameKind == FK_FACE) {
        cacheIncomingFace((uint8_t)idx);
        if (!deferFaceBlit() && slotVisible((uint8_t)idx)) {
            if (animKey == idx) stopAnimation();
            PDBG("{\"event\":\"dbg\",\"op\":\"face_blit\",\"slot\":%ld,\"pos\":%u,\"phys\":%u}\n",
                 idx, posOfSlot((uint8_t)idx), physOf(posOfSlot((uint8_t)idx)));
            blitFrame(tfts[physOf(posOfSlot((uint8_t)idx))], frameBuf);
        } else {
            PDBG("{\"event\":\"dbg\",\"op\":\"face_skip\",\"slot\":%ld,\"batch\":%d,\"vis\":%d}\n",
                 idx, deferFaceBlit() ? 1 : 0, slotVisible((uint8_t)idx) ? 1 : 0);
        }
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_FACE\",\"index\":%ld}\n", idx);
    } else if (frameKind == FK_ANIM) {
        char path[48];
        ensureKeyDir(idx);
        snprintf(path, sizeof(path), "/osd/keys/%ld/anim", idx);
        SD.mkdir(path);
        snprintf(path, sizeof(path), "/osd/keys/%ld/anim/%04ld.rgb565", idx, frameAnimNum);
        File f = SD.open(path, FILE_WRITE);
        bool written = false;
        if (f) {
            written = f.write((uint8_t*)frameBuf, len) == (size_t)len;
            f.close();
        }
        if (written) {
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_ANIM\",\"index\":%ld,\"frame\":%ld}\n",
                          idx, frameAnimNum);
        } else {
            Serial.println("{\"event\":\"error\",\"msg\":\"sd_write_failed\"}");
        }
    }
    frameKind = FK_NONE;
}

void serviceFrameReceive() {
    pumpFrameBytes();
}

bool frameRxActive() {
    return receivingFrame;
}

void serviceConfigFlush() {
    if (!configIsDirty()) return;
    // Host burst finished — coalesce dozens of SET_KEY writes into one pass
    if (millis() - lastSerialActivityMs < 200) return;
    if (receivingFrame) return;
    flushOneConfigDirty();
}
// The protocol's payloads are flat, single-line JSON with known keys, so
// a full parser would be dead weight. These two helpers are the contract.

/** True when the string field exists; out may be "" — an explicit empty
 *  string CLEARS the field, absence keeps the current value. */
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

void printDeviceInfo() {
    Serial.printf("{\"event\":\"info\",\"name\":\"Open Screen Deck\",\"fw\":\"%s\",\"proto\":%d,\"keys\":%d,\"pages\":%d,\"page\":%u,\"sd\":%s,\"psram\":%u,\"mode\":\"%s\",\"orient\":%u,"
                  "\"leds\":%d,\"imu\":%s,\"als\":%s,\"haptic\":%s,\"lux\":%.1f,\"autodim\":%s,\"bright\":%u,\"clickbeep\":%s}\n",
                  FIRMWARE_VERSION, PROTOCOL_VERSION, KEY_COUNT, pageCount, currentPage,
                  sdOK ? "true" : "false",
                  ESP.getPsramSize(), companionMode ? "companion" : "hid", deckOrientation,
                  LED_COUNT, imuPresent() ? "true" : "false",
                  alsPresent() ? "true" : "false", hapticsPresent() ? "true" : "false",
                  alsLux(), autoDimEnabled() ? "true" : "false", displayBrightness(),
                  clickBeepEnabled() ? "true" : "false");
}

void printKeyState() {
    for (uint8_t i = 0; i < pageCount * KEY_COUNT; i++) {
        Serial.printf("{\"event\":\"key_state\",\"index\":%u,\"page\":%u,\"label\":\"%s\",\"sublabel\":\"%s\",\"hid\":%u,\"h2\":%u,\"h3\":%u,\"bg\":%u,\"ov\":%u}\n",
                      i, pageOfSlot(i), keys[i].label, keys[i].sublabel,
                      keys[i].hidKey, keys[i].hid2, keys[i].hid3,
                      keys[i].bgColor, keys[i].overlay);
        if ((i & 7) == 7) yieldInteractive();
    }
}

void handleCommand(String& line) {
    noteSerialActivity();
    // Any traffic from the companion counts as a heartbeat — long uploads
    // (SET_ANIM streams) must not starve companion mode back to HID.
    if (companionMode) lastCompanionMs = millis();

    // Companion takes over the reveal — only MODE COMPANION defers boot draw.
    if (line == "MODE COMPANION") {
        deferBootDrawToHost();
    }

    if (line == "PING") {
        Serial.println("{\"event\":\"pong\"}");

    } else if (line == "MODE COMPANION") {
        companionMode   = true;
        lastCompanionMs = millis();
        setHostBatchMode(true);
        deferBootDrawToHost();
        ledsSetLink(true);
        Serial.println("{\"event\":\"ok\",\"cmd\":\"MODE\",\"mode\":\"companion\"}");

    } else if (line == "MODE HID") {
        companionMode = false;
        clearHostReveal();
        ledsSetLink(false);
        drawAllVisible();
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
        setHostBatchMode(false);
        scheduleDrawAll();

    } else if (line == "REINIT") {
        // Hardware-reset the panels — recovery from bus-noise lockups
        stopAnimation();
        setHostBatchMode(false);
        clearHostReveal();
        displayReinitPanels();
        Serial.println("{\"event\":\"ok\",\"cmd\":\"REINIT\"}");

    } else if (line.startsWith("SET_KEY ")) {
        // SET_KEY {"index":0,"label":"MUTE","sublabel":"x","hid":104,"bg":21609}
        // index is a global slot; slots on other pages update config and
        // NVS but draw nothing until their page is shown
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
        long draw = jsonInt(line, "draw", companionMode ? 0 : 1);
        if (jsonStrField(line, "label", lbl))    strlcpy(keys[idx].label, lbl.c_str(), sizeof(keys[idx].label));
        if (jsonStrField(line, "sublabel", sub)) strlcpy(keys[idx].sublabel, sub.c_str(), sizeof(keys[idx].sublabel));
        keys[idx].hidKey  = (uint8_t)hid;
        keys[idx].hid2    = (uint8_t)h2;
        keys[idx].hid3    = (uint8_t)h3;
        keys[idx].bgColor = (uint16_t)bg;
        keys[idx].overlay = ov ? 1 : 0;
        markConfigDirty((uint8_t)idx);
        PDBG("{\"event\":\"dbg\",\"op\":\"set_key\",\"slot\":%ld,\"label\":\"%s\",\"hid\":%ld,\"draw\":%ld,\"batch\":%d}\n",
             idx, keys[idx].label, hid, draw, hostBatchMode() ? 1 : 0);
        // Inspector edits send draw:1 — always paint, even during the
        // post-page-switch SET_FACE hold. Bulk profile sync uses draw:0.
        if (draw) drawKey((uint8_t)idx);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_KEY\",\"index\":%ld}\n", idx);

    } else if (line.startsWith("SET_IMAGE ")) {
        long idx = jsonInt(line, "index", -1);
        long len = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= TOTAL_KEYS || len != FRAME_BYTES || !frameBuf || receivingFrame) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_image_header\"}");
            return;
        }
        startFrameReceive(FK_IMAGE, idx, (size_t)len);

    } else if (line.startsWith("SET_FACE ")) {
        long idx = jsonInt(line, "index", -1);
        long len = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= TOTAL_KEYS || len != FRAME_BYTES || !frameBuf || receivingFrame) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_face_header\"}");
            return;
        }
        startFrameReceive(FK_FACE, idx, (size_t)len);

    } else if (line.startsWith("SET_ANIM ")) {
        long idx   = jsonInt(line, "index", -1);
        long frame = jsonInt(line, "frame", 0);
        long len   = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= TOTAL_KEYS || frame < 1 || frame > 999 ||
            len != FRAME_BYTES || !frameBuf || !ensureSdMounted() || receivingFrame) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_anim_header\"}");
            return;
        }
        startFrameReceive(FK_ANIM, idx, (size_t)len, frame);

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
        // ANIM 0 10 → play key 0 at 10 fps;  ANIM STOP
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
        if (path.startsWith("/osd/keys/") && path.endsWith("/icon.rgb565")) {
            long slot = path.substring(10).toInt();
            if (slot >= 0 && slot < TOTAL_KEYS) clearCachedFace((uint8_t)slot);
        }
        if (path.length() < 2) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_path\"}");
            return;
        }
        if (!ensureSdMounted()) {
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SD_RM\",\"path\":\"%s\",\"removed\":0}\n",
                          path.c_str());
            return;
        }
        bool ok;
        File target = SD.open(path);
        bool isDir = target && target.isDirectory();
        if (target) target.close();
        ok = isDir ? SD.rmdir(path) : SD.remove(path);
        // Idempotent: "already gone" is success — the host retries deletes
        // for slots it never uploaded to and must not stall on timeouts.
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SD_RM\",\"path\":\"%s\",\"removed\":%d}\n",
                      path.c_str(), ok ? 1 : 0);

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
        displayApplyOrientation();
        scheduleDrawAll();
        prefs.begin("osd", false);
        prefs.putUChar("orient", deckOrientation);
        prefs.end();
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_ORIENT\",\"orient\":%u}\n", deckOrientation);

    } else if (line.startsWith("SET_LED ")) {
        // SET_LED {"index":0,"r":255,"g":64,"b":0} — index -1 = all LEDs.
        // Host-set colors persist until LED_CLEAR (or reboot).
        long idx = jsonInt(line, "index", -2);
        long r = jsonInt(line, "r", 0), g = jsonInt(line, "g", 0), b = jsonInt(line, "b", 0);
        if (idx < -1 || idx >= LED_COUNT) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_led_index\"}");
            return;
        }
        ledsSet((int8_t)idx, (uint8_t)r, (uint8_t)g, (uint8_t)b);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_LED\",\"index\":%ld}\n", idx);

    } else if (line == "LED_CLEAR") {
        ledsClearOverride();
        ledsSetLink(companionMode);
        Serial.println("{\"event\":\"ok\",\"cmd\":\"LED_CLEAR\"}");

    } else if (line.startsWith("SET_BRIGHT ")) {
        // SET_BRIGHT 0..255 — manual backlight level; disables auto-dim
        long v = line.substring(11).toInt();
        if (v < 0 || v > 255) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_brightness\"}");
            return;
        }
        setAutoDim(false);
        displaySetBrightness((uint8_t)v);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_BRIGHT\",\"bright\":%u}\n", displayBrightness());

    } else if (line.startsWith("AUTODIM ")) {
        setAutoDim(line.substring(8).toInt() != 0);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"AUTODIM\",\"on\":%s}\n",
                      autoDimEnabled() ? "true" : "false");

    } else if (line == "HAPTIC") {
        hapticClick();
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"HAPTIC\",\"present\":%s}\n",
                      hapticsPresent() ? "true" : "false");

    } else if (line.startsWith("BEEP")) {
        // BEEP [freq] [ms] — defaults 2000 Hz / 80 ms
        long freq = 2000, ms = 80;
        int sp = line.indexOf(' ');
        if (sp > 0) {
            String rest = line.substring(sp + 1);
            freq = rest.toInt();
            int sp2 = rest.indexOf(' ');
            if (sp2 > 0) ms = rest.substring(sp2 + 1).toInt();
        }
        if (freq < 100 || freq > 12000 || ms < 5 || ms > 2000) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_beep\"}");
            return;
        }
        piezoBeep((uint16_t)freq, (uint16_t)ms);
        Serial.println("{\"event\":\"ok\",\"cmd\":\"BEEP\"}");

    } else if (line.startsWith("CLICK_BEEP ")) {
        setClickBeep(line.substring(11).toInt() != 0);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"CLICK_BEEP\",\"on\":%s}\n",
                      clickBeepEnabled() ? "true" : "false");

    } else if (line == "FLASHING") {
        // Companion is about to reboot us into the ROM bootloader.
        // Paint every panel now — after the 1200-bps touch, firmware is gone
        // and the LCDs can only hold whatever was last written.
        stopAnimation();
        setHostBatchMode(false);
        drawFlashingBanner();
        ledsSet(-1, 48, 28, 0);
        hapticClick();
        piezoBeep(880, 90);
        Serial.println("{\"event\":\"ok\",\"cmd\":\"FLASHING\"}");

    } else if (line == "SELFTEST") {
        // Bench check: exercises panels, LEDs, haptic, piezo and reports
        // every subsystem in one line. Blocks ~1 s; faces redraw after.
        stopAnimation();
        setHostBatchMode(false);
        static const uint16_t testColors[KEY_COUNT] =
            {0xF800, 0x07E0, 0x001F, 0xFFE0, 0xF81F, 0x07FF};
        for (uint8_t i = 0; i < KEY_COUNT; i++) {
            tfts[i]->fillScreen(testColors[i]);
            tfts[i]->setTextColor(ST77XX_BLACK);
            tfts[i]->setTextSize(6);
            tfts[i]->setCursor(48, 40);
            tfts[i]->print(i + 1);
        }
        displayBacklight(true);
        ledsTestChase();
        hapticClick();
        piezoBeep(2000, 120);
        Serial.printf("{\"event\":\"selftest\",\"panels\":%d,\"sd\":%s,\"imu\":%s,\"als\":%s,\"lux\":%.1f,\"haptic\":%s,\"psram\":%u}\n",
                      KEY_COUNT, sdOK ? "true" : "false",
                      imuPresent() ? "true" : "false",
                      alsPresent() ? "true" : "false", alsLux(),
                      hapticsPresent() ? "true" : "false", ESP.getPsramSize());
        scheduleDrawAll();

    } else if (line == "SD_PROBE") {
        // Raw SPI-mode init probe for bench diagnosis: bypasses the SD
        // library and reports the card's actual wire responses.
        // CMD0 R1: 0x01 = card alive+idle, 0xFF = no response (MISO high:
        // open joint / no card), 0x00 = MISO stuck low (short).
        SD.end();
        sdOK = false;
        digitalWrite(PIN_SD_CS, HIGH);
        // MISO line electrical test: with internal pull-up then pull-down,
        // a floating (undriven) line follows the pull; a short reads fixed.
        gpio_pulldown_dis((gpio_num_t)PIN_MISO);
        gpio_pullup_en((gpio_num_t)PIN_MISO);
        delay(2);
        int misoPU = digitalRead(PIN_MISO);
        gpio_pullup_dis((gpio_num_t)PIN_MISO);
        gpio_pulldown_en((gpio_num_t)PIN_MISO);
        delay(2);
        int misoPD = digitalRead(PIN_MISO);
        gpio_pulldown_dis((gpio_num_t)PIN_MISO);
        gpio_pullup_en((gpio_num_t)PIN_MISO);   // keep pulled up for the probe
        SPI.beginTransaction(SPISettings(400000, MSBFIRST, SPI_MODE0));
        for (int i = 0; i < 10; i++) SPI.transfer(0xFF);   // 80 dummy clocks
        auto sdCmd = [](uint8_t cmd, uint32_t arg, uint8_t crc) -> uint8_t {
            digitalWrite(PIN_SD_CS, LOW);
            SPI.transfer(0xFF);
            SPI.transfer(0x40 | cmd);
            SPI.transfer(arg >> 24); SPI.transfer(arg >> 16);
            SPI.transfer(arg >> 8);  SPI.transfer(arg);
            SPI.transfer(crc);
            uint8_t r = 0xFF;
            for (int i = 0; i < 16 && (r & 0x80); i++) r = SPI.transfer(0xFF);
            return r;   // caller reads extra bytes / raises CS
        };
        uint8_t r1cmd0 = sdCmd(0, 0, 0x95);
        digitalWrite(PIN_SD_CS, HIGH); SPI.transfer(0xFF);
        uint8_t r1cmd8 = sdCmd(8, 0x1AA, 0x87);
        uint8_t r7[4] = {0, 0, 0, 0};
        if (!(r1cmd8 & 0x80)) for (int i = 0; i < 4; i++) r7[i] = SPI.transfer(0xFF);
        digitalWrite(PIN_SD_CS, HIGH); SPI.transfer(0xFF);
        SPI.endTransaction();
        Serial.printf("{\"event\":\"sd_probe\",\"miso_pu\":%d,\"miso_pd\":%d,"
                      "\"cmd0\":\"0x%02X\",\"cmd8\":\"0x%02X\",\"r7\":\"%02X%02X%02X%02X\"}\n",
                      misoPU, misoPD, r1cmd0, r1cmd8, r7[0], r7[1], r7[2], r7[3]);

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
    if (receivingFrame) return;
    while (Serial.available()) {
        char c = Serial.read();
        noteSerialActivity();
        if (c == '\n' || c == '\r') {
            if (serialLine.length() == 0) continue;
            serialLine.trim();
            handleCommand(serialLine);
            serialLine = "";
            yieldInteractive();
        } else {
            serialLine += c;
            if (serialLine.length() > 200) serialLine = "";   // runaway guard
        }
    }
}
