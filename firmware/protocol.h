/**
 * protocol.h — the USB CDC serial protocol (v14).
 *
 * Newline-terminated commands, JSON event lines back. This is the single
 * channel the companion app uses for everything: key config, images,
 * animations, pages, orientation, SD browsing, and the companion-mode
 * heartbeat. Wire format reference: docs/firmware/protocol.md — keep the
 * two in sync.
 */

#pragma once

#include <Arduino.h>

/** Accumulate serial bytes into lines and dispatch them. Call every loop(). */
void handleSerialInput();

/** Pump an in-progress binary frame upload without blocking keys. */
void serviceFrameReceive();

/** True while a binary frame upload is in flight (defer long blits). */
bool frameRxActive();

/** Flush deferred NVS writes when the host goes quiet. Call every loop(). */
void serviceConfigFlush();

/** Execute one protocol command line. */
void handleCommand(String& line);

/** Emit the boot/INFO identity line. */
void printDeviceInfo();

/** Emit one key_state line per configured slot (GET_KEYS). */
void printKeyState();
