/**
 * protocol.h — the USB CDC serial protocol (v0.12).
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

/** Execute one protocol command line. */
void handleCommand(String& line);

/** Emit the boot/INFO identity line. */
void printDeviceInfo();

/** Emit one key_state line per configured slot (GET_KEYS). */
void printKeyState();
