/**
 * sensors.h — LSM6DS3TR-C IMU (pickup detection) + VEML7700 ambient
 * light sensor (backlight auto-dim), both on the shared I2C bus.
 *
 * Owns Wire.begin(PIN_SDA, PIN_SCL) — call sensorsInit() before
 * hapticsInit(). The Qwiic port shares the same bus.
 */

#pragma once

#include <Arduino.h>
#include "config.h"

/** Wire.begin + probe/configure both sensors. */
void sensorsInit();

bool imuPresent();
bool alsPresent();

/** Latest ambient light reading in lux (−1 while unavailable). */
float alsLux();

/** Enable/disable ALS-driven backlight dimming (default on). */
void setAutoDim(bool on);
bool autoDimEnabled();

/**
 * Poll the IMU wake interrupt and the ALS; smooth-dim the backlight and
 * emit {"event":"pickup"} on motion. Call every loop().
 */
void serviceSensors();
