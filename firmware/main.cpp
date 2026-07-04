/*
 * Open Screen Deck — ESP32-S3 firmware v0.4
 * 6× Waveshare 0.85" ScreenKey (ST7735, 128×128), Tier B carrier PCB
 * USB composite: HID keyboard + CDC serial (companion app)
 * microSD: offline icons + animations   (see docs/product_architecture.md)
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

#define FIRMWARE_VERSION "0.4.0"
#define KEY_COUNT 6
#define FRAME_BYTES (128 * 128 * 2)   // RGB565

struct KeyConfig {
    char     label[16];
    char     sublabel[16];
    uint8_t  hidKey;
    uint16_t bgColor;
    uint16_t fgColor;
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

static KeyConfig keys[KEY_COUNT] = {
    {"MUTE",    "Toggle", KEY_F13, 0x4A69, ST77XX_WHITE},
    {"SCENE 1", "OBS",    KEY_F14, 0x000F, ST77XX_WHITE},
    {"SCENE 2", "OBS",    KEY_F15, 0x000F, ST77XX_CYAN },
    {"CLIP",    "Record", KEY_F16, 0x6000, ST77XX_WHITE},
    {"BROWSER", "Win",    KEY_F17, 0x0003, ST77XX_WHITE},
    {"MACRO",   "Custom", KEY_F18, 0x0300, ST77XX_WHITE},
};

Adafruit_ST7735* tfts[KEY_COUNT];
USBHIDKeyboard   Keyboard;
Preferences      prefs;

static bool     sdOK = false;
static bool     lastState[KEY_COUNT]    = {HIGH, HIGH, HIGH, HIGH, HIGH, HIGH};
static uint32_t lastDebounce[KEY_COUNT] = {0};
static const uint32_t DEBOUNCE_MS = 50;

static String    serialLine;
static uint16_t* frameBuf = nullptr;   // one shared PSRAM frame buffer

// ── Animation player (one key at a time; SPI bus is shared) ──
static int8_t   animKey     = -1;
static uint16_t animFrame   = 0;
static uint16_t animCount   = 0;
static uint8_t  animFps     = 10;
static uint32_t animLastMs  = 0;

// ── Drawing ─────────────────────────────────────────────────

void drawKey(uint8_t idx) {
    Adafruit_ST7735* tft = tfts[idx];
    KeyConfig&       k   = keys[idx];

    // Prefer SD icon when present
    if (sdOK && frameBuf) {
        char path[40];
        snprintf(path, sizeof(path), "/osd/keys/%u/icon.rgb565", idx);
        File f = SD.open(path, FILE_READ);
        if (f && f.size() == FRAME_BYTES) {
            f.read((uint8_t*)frameBuf, FRAME_BYTES);
            f.close();
            tft->drawRGBBitmap(0, 0, frameBuf, 128, 128);
            return;
        }
        if (f) f.close();
    }

    tft->fillScreen(k.bgColor);
    tft->setTextColor(ST77XX_WHITE);
    tft->setTextSize(1);
    tft->setCursor(112, 4);
    tft->print(idx + 1);

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
    tfts[idx]->invertDisplay(true);
    delay(80);
    tfts[idx]->invertDisplay(false);
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
    uint32_t now = millis();
    if (now - animLastMs < (1000UL / animFps)) return;
    animLastMs = now;

    char path[48];
    snprintf(path, sizeof(path), "/osd/keys/%d/anim/%04u.rgb565", animKey, animFrame + 1);
    File f = SD.open(path, FILE_READ);
    if (f && f.size() == FRAME_BYTES) {
        f.read((uint8_t*)frameBuf, FRAME_BYTES);
        f.close();
        tfts[animKey]->drawRGBBitmap(0, 0, frameBuf, 128, 128);
    } else if (f) {
        f.close();
    }
    animFrame = (animFrame + 1) % animCount;
}

// ── Serial protocol ─────────────────────────────────────────

static String jsonStr(const String& src, const char* keyName) {
    String pat = String("\"") + keyName + "\":\"";
    int a = src.indexOf(pat);
    if (a < 0) return "";
    a += pat.length();
    int b = src.indexOf('"', a);
    return (b > a) ? src.substring(a, b) : "";
}

static long jsonInt(const String& src, const char* keyName, long dflt) {
    String pat = String("\"") + keyName + "\":";
    int a = src.indexOf(pat);
    if (a < 0) return dflt;
    a += pat.length();
    return src.substring(a).toInt();
}

void emitKeyEvent(uint8_t idx, const char* action) {
    if (!Serial) return;
    Serial.printf("{\"event\":\"key\",\"index\":%u,\"action\":\"%s\"}\n", idx, action);
}

void printDeviceInfo() {
    Serial.printf("{\"event\":\"info\",\"name\":\"Open Screen Deck\",\"fw\":\"%s\",\"keys\":%d,\"sd\":%s,\"psram\":%u}\n",
                  FIRMWARE_VERSION, KEY_COUNT, sdOK ? "true" : "false", ESP.getPsramSize());
}

void printKeyState() {
    for (uint8_t i = 0; i < KEY_COUNT; i++) {
        Serial.printf("{\"event\":\"key_state\",\"index\":%u,\"label\":\"%s\",\"sublabel\":\"%s\",\"hid\":%u}\n",
                      i, keys[i].label, keys[i].sublabel, keys[i].hidKey);
    }
}

void handleCommand(String& line) {
    if (line == "PING") {
        Serial.println("{\"event\":\"pong\"}");

    } else if (line == "INFO") {
        printDeviceInfo();

    } else if (line == "GET_KEYS") {
        printKeyState();

    } else if (line.startsWith("DRAW ")) {
        int idx = line.substring(5).toInt();
        if (idx >= 0 && idx < KEY_COUNT) drawKey((uint8_t)idx);

    } else if (line == "DRAW_ALL") {
        stopAnimation();
        for (uint8_t i = 0; i < KEY_COUNT; i++) drawKey(i);

    } else if (line.startsWith("SET_KEY ")) {
        // SET_KEY {"index":0,"label":"MUTE","sublabel":"x","hid":104,"bg":21609}
        long idx = jsonInt(line, "index", -1);
        if (idx < 0 || idx >= KEY_COUNT) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_index\"}");
            return;
        }
        String lbl = jsonStr(line, "label");
        String sub = jsonStr(line, "sublabel");
        long hid   = jsonInt(line, "hid", keys[idx].hidKey);
        long bg    = jsonInt(line, "bg", keys[idx].bgColor);
        if (lbl.length()) strlcpy(keys[idx].label, lbl.c_str(), sizeof(keys[idx].label));
        if (sub.length()) strlcpy(keys[idx].sublabel, sub.c_str(), sizeof(keys[idx].sublabel));
        keys[idx].hidKey  = (uint8_t)hid;
        keys[idx].bgColor = (uint16_t)bg;
        saveConfig((uint8_t)idx);
        drawKey((uint8_t)idx);
        Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_KEY\",\"index\":%ld}\n", idx);

    } else if (line.startsWith("SET_IMAGE ")) {
        // SET_IMAGE {"index":0,"len":32768} + <len> raw RGB565 bytes
        long idx = jsonInt(line, "index", -1);
        long len = jsonInt(line, "len", 0);
        if (idx < 0 || idx >= KEY_COUNT || len != FRAME_BYTES || !frameBuf) {
            Serial.println("{\"event\":\"error\",\"msg\":\"bad_image_header\"}");
            return;
        }
        Serial.println("{\"event\":\"send_data\"}");
        size_t got = 0;
        uint32_t t0 = millis();
        while (got < (size_t)len && millis() - t0 < 5000) {
            if (Serial.available()) {
                got += Serial.read((uint8_t*)frameBuf + got, len - got);
            }
        }
        if (got == (size_t)len) {
            stopAnimation();
            tfts[idx]->drawRGBBitmap(0, 0, frameBuf, 128, 128);
            if (sdOK) {   // persist as the key icon
                char path[40];
                snprintf(path, sizeof(path), "/osd/keys/%ld", idx);
                SD.mkdir("/osd"); SD.mkdir("/osd/keys"); SD.mkdir(path);
                snprintf(path, sizeof(path), "/osd/keys/%ld/icon.rgb565", idx);
                File f = SD.open(path, FILE_WRITE);
                if (f) { f.write((uint8_t*)frameBuf, len); f.close(); }
            }
            Serial.printf("{\"event\":\"ok\",\"cmd\":\"SET_IMAGE\",\"index\":%ld}\n", idx);
        } else {
            Serial.println("{\"event\":\"error\",\"msg\":\"image_timeout\"}");
        }

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
            if (idx >= 0 && idx < KEY_COUNT) startAnimation((uint8_t)idx, (uint8_t)fps);
        }

    } else if (line == "SD_INFO") {
        if (sdOK) {
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
    for (uint8_t i = 0; i < KEY_COUNT; i++) {
        char k[8];
        snprintf(k, sizeof(k), "l%u", i);
        String lbl = prefs.getString(k, "");
        if (lbl.length()) strlcpy(keys[i].label, lbl.c_str(), sizeof(keys[i].label));
        snprintf(k, sizeof(k), "s%u", i);
        String sub = prefs.getString(k, "");
        if (sub.length()) strlcpy(keys[i].sublabel, sub.c_str(), sizeof(keys[i].sublabel));
        snprintf(k, sizeof(k), "h%u", i);
        keys[i].hidKey = prefs.getUChar(k, keys[i].hidKey);
        snprintf(k, sizeof(k), "b%u", i);
        keys[i].bgColor = prefs.getUShort(k, keys[i].bgColor);
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
    snprintf(k, sizeof(k), "b%u", idx);
    prefs.putUShort(k, keys[idx].bgColor);
    prefs.end();
}

// ── Setup / loop ────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    Keyboard.begin();
    USB.begin();

    frameBuf = (uint16_t*)ps_malloc(FRAME_BYTES);
    if (!frameBuf) frameBuf = (uint16_t*)malloc(FRAME_BYTES);

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

    for (int i = 0; i < KEY_COUNT; i++) {
        tfts[i] = new Adafruit_ST7735(&SPI, CS_PINS[i], PIN_DC, -1);
        tfts[i]->initR(INITR_144GREENTAB);
        tfts[i]->setRotation(2);
        drawKey(i);
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

    for (int i = 0; i < KEY_COUNT; i++) {
        bool state = digitalRead(KEY_PINS[i]);

        if (state != lastState[i]) {
            lastDebounce[i] = now;
        }

        if ((now - lastDebounce[i]) > DEBOUNCE_MS) {
            if (state == LOW && lastState[i] == HIGH) {
                drawKeyPressed(i);
                Keyboard.press(keys[i].hidKey);
                delay(20);
                Keyboard.release(keys[i].hidKey);
                emitKeyEvent(i, "press");
            }
        }

        lastState[i] = state;
    }
}
