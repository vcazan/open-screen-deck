#include "protocol.h"
#include "config.h"
#include "state.h"
#include "pages.h"
#include "display.h"
#include "media.h"
#include "input.h"
#include "orientation.h"
#include <SD.h>

static String serialLine;

// ── Tiny JSON field readers ─────────────────────────────────────────
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

/** Announce send_data, then block until <len> raw bytes land in frameBuf. */
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
        // SET_IMAGE {"index":0,"len":32768} + <len> raw RGB565 bytes.
        // Drawn immediately and persisted to SD as the key's icon.
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
        // persistence. Live tiles and plugin faces stream through here so
        // they never wear the SD card or overwrite the stored icon.
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
        // SET_ANIM {"index":0,"frame":1,"len":32768} + <len> raw RGB565
        // bytes. Writes /osd/keys/N/anim/0001.rgb565 …; frames 1-based.
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
            if (serialLine.length() > 200) serialLine = "";   // runaway guard
        }
    }
}
