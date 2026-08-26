#include "haptics.h"
#include "state.h"
#include <Wire.h>

static const uint8_t DRV_ADDR = 0x5A;

// DRV2605L registers
static const uint8_t REG_STATUS   = 0x00;
static const uint8_t REG_MODE     = 0x01;
static const uint8_t REG_LIBRARY  = 0x03;
static const uint8_t REG_WAVESEQ1 = 0x04;
static const uint8_t REG_WAVESEQ2 = 0x05;
static const uint8_t REG_GO       = 0x0C;
static const uint8_t REG_FEEDBACK = 0x1A;
static const uint8_t REG_CONTROL3 = 0x1D;

static bool     present     = false;
static uint32_t beepOffAtMs = 0;
static bool     beeping     = false;
static bool     clickBeep   = false;

static void drvWrite(uint8_t reg, uint8_t val) {
    Wire.beginTransmission(DRV_ADDR);
    Wire.write(reg);
    Wire.write(val);
    Wire.endTransmission();
}

static int drvRead(uint8_t reg) {
    Wire.beginTransmission(DRV_ADDR);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return -1;
    if (Wire.requestFrom(DRV_ADDR, (uint8_t)1) != 1) return -1;
    return Wire.read();
}

bool hapticsInit() {
    ledcAttach(PIN_PIEZO, 4000, 10);   // LEDC channel for tone output
    ledcWriteTone(PIN_PIEZO, 0);

    prefs.begin("osd", true);
    clickBeep = prefs.getBool("clickbeep", false);
    prefs.end();

    pinMode(PIN_HAPTIC_EN, OUTPUT);
    digitalWrite(PIN_HAPTIC_EN, HIGH);
    delay(2);   // t_EN startup

    int status = drvRead(REG_STATUS);
    // DEVICE_ID bits [7:5] = 7 for DRV2605L
    present = status >= 0 && ((status >> 5) & 0x07) == 7;
    if (!present) {
        digitalWrite(PIN_HAPTIC_EN, LOW);
        return false;
    }

    drvWrite(REG_MODE, 0x00);       // internal trigger, out of standby
    drvWrite(REG_FEEDBACK, 0xB6);   // LRA mode + sensible defaults
    drvWrite(REG_LIBRARY, 6);       // LRA effect library
    drvWrite(REG_CONTROL3, 0xA0);   // closed loop, LRA auto-resonance
    return true;
}

bool hapticsPresent() { return present; }

void hapticPlay(uint8_t effect) {
    if (!present) return;
    drvWrite(REG_WAVESEQ1, effect);
    drvWrite(REG_WAVESEQ2, 0);
    drvWrite(REG_GO, 1);
}

void hapticClick() {
    hapticPlay(1);   // strong click, 100%
}

void piezoBeep(uint16_t freqHz, uint16_t ms) {
    ledcWriteTone(PIN_PIEZO, freqHz);
    beepOffAtMs = millis() + ms;
    beeping     = true;
}

bool clickBeepEnabled() { return clickBeep; }

void setClickBeep(bool on) {
    clickBeep = on;
    prefs.begin("osd", false);
    prefs.putBool("clickbeep", on);
    prefs.end();
}

void serviceHaptics() {
    if (beeping && (int32_t)(millis() - beepOffAtMs) >= 0) {
        ledcWriteTone(PIN_PIEZO, 0);
        beeping = false;
    }
}
