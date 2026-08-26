#include "sensors.h"
#include "display.h"
#include "haptics.h"
#include <Wire.h>

// ── LSM6DS3TR-C ──────────────────────────────────────────────────────
static const uint8_t IMU_ADDR        = 0x6A;   // SA0 strapped low
static const uint8_t IMU_WHO_AM_I    = 0x0F;   // reads 0x6A
static const uint8_t IMU_CTRL1_XL    = 0x10;
static const uint8_t IMU_TAP_CFG     = 0x58;
static const uint8_t IMU_WAKE_UP_THS = 0x5B;
static const uint8_t IMU_WAKE_UP_DUR = 0x5C;
static const uint8_t IMU_MD1_CFG     = 0x5E;

// ── VEML7700 ────────────────────────────────────────────────────────
static const uint8_t ALS_ADDR     = 0x10;
static const uint8_t ALS_CONF     = 0x00;
static const uint8_t ALS_DATA     = 0x04;
// gain 1, integration 100 ms → 0.0576 lux/count
static const float   ALS_LUX_PER_COUNT = 0.0576f;

static bool  imuOk = false;
static bool  alsOk = false;
static float lux   = -1.0f;
static bool  autoDim = true;

static uint32_t lastAlsMs    = 0;
static uint32_t lastPickupMs = 0;

static bool i2cWrite8(uint8_t addr, uint8_t reg, uint8_t val) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(val);
    return Wire.endTransmission() == 0;
}

static int i2cRead8(uint8_t addr, uint8_t reg) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return -1;
    if (Wire.requestFrom(addr, (uint8_t)1) != 1) return -1;
    return Wire.read();
}

static bool i2cWrite16LE(uint8_t addr, uint8_t reg, uint16_t val) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write((uint8_t)(val & 0xFF));
    Wire.write((uint8_t)(val >> 8));
    return Wire.endTransmission() == 0;
}

static int32_t i2cRead16LE(uint8_t addr, uint8_t reg) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) return -1;
    if (Wire.requestFrom(addr, (uint8_t)2) != 2) return -1;
    uint16_t lo = Wire.read(), hi = Wire.read();
    return (int32_t)((hi << 8) | lo);
}

void sensorsInit() {
    Wire.begin(PIN_SDA, PIN_SCL, 400000);

    // IMU: accel 104 Hz / ±2 g, wake-up interrupt routed to INT1
    imuOk = i2cRead8(IMU_ADDR, IMU_WHO_AM_I) == 0x6A;
    if (imuOk) {
        i2cWrite8(IMU_ADDR, IMU_CTRL1_XL, 0x40);      // 104 Hz, 2 g
        i2cWrite8(IMU_ADDR, IMU_TAP_CFG, 0x80);       // enable interrupts
        i2cWrite8(IMU_ADDR, IMU_WAKE_UP_DUR, 0x00);
        i2cWrite8(IMU_ADDR, IMU_WAKE_UP_THS, 0x02);   // ~62.5 mg threshold
        i2cWrite8(IMU_ADDR, IMU_MD1_CFG, 0x20);       // wake-up → INT1
        pinMode(PIN_IMU_INT, INPUT);
    }

    // ALS: gain 1, 100 ms integration, power on
    alsOk = i2cWrite16LE(ALS_ADDR, ALS_CONF, 0x0000);
    if (alsOk) {
        delay(3);
        alsOk = i2cRead16LE(ALS_ADDR, ALS_DATA) >= 0;
    }
}

bool imuPresent() { return imuOk; }
bool alsPresent() { return alsOk; }
float alsLux()    { return lux; }

void setAutoDim(bool on) { autoDim = on; }
bool autoDimEnabled()    { return autoDim; }

/** Map lux → backlight level: dim room ≈ 60, office ≈ 180, sunlit ≈ 255. */
static uint8_t targetLevelForLux(float lx) {
    if (lx < 5)    return 60;
    if (lx > 1000) return 255;
    // log ramp between 5 and 1000 lux
    float t = (logf(lx) - logf(5.0f)) / (logf(1000.0f) - logf(5.0f));
    return (uint8_t)(60 + t * 195);
}

void serviceSensors() {
    uint32_t now = millis();

    // IMU pickup: INT1 latches high on wake-up motion
    if (imuOk && digitalRead(PIN_IMU_INT) == HIGH &&
        (now - lastPickupMs) > 1500) {
        lastPickupMs = now;
        if (Serial) Serial.println("{\"event\":\"pickup\"}");
        hapticPlay(24);   // sharp tick — the deck acknowledges being lifted
    }

    // ALS poll @ 2 Hz with a smooth one-step-per-poll dim so brightness
    // changes glide instead of snapping
    if (alsOk && (now - lastAlsMs) >= 500) {
        lastAlsMs = now;
        int32_t raw = i2cRead16LE(ALS_ADDR, ALS_DATA);
        if (raw >= 0) {
            lux = raw * ALS_LUX_PER_COUNT;
            if (autoDim) {
                uint8_t cur = displayBrightness();
                uint8_t tgt = targetLevelForLux(lux);
                if (tgt != cur) {
                    int step = ((int)tgt - (int)cur) / 4;
                    if (step == 0) step = tgt > cur ? 1 : -1;
                    displaySetBrightness((uint8_t)((int)cur + step));
                }
            }
        }
    }
}
