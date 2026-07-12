/**
 * pages.h — multi-page deck state and slot arithmetic.
 *
 * The six physical screens show one PAGE of the deck at a time. Slots are
 * global: slot = page*KEY_COUNT + position. Both the visible page and the
 * page count are user-controlled and NVS-persisted; profiles carry their
 * own page count and resize the deck when applied.
 */

#pragma once

#include <Arduino.h>
#include "config.h"

extern uint8_t currentPage;   // which page the screens show right now
extern uint8_t pageCount;     // how many pages this deck currently has

inline uint8_t pageOfSlot(uint8_t slot) { return slot / KEY_COUNT; }
inline uint8_t posOfSlot(uint8_t slot)  { return slot % KEY_COUNT; }
inline uint8_t slotOfPos(uint8_t pos)   { return currentPage * KEY_COUNT + pos; }
inline bool    slotVisible(uint8_t slot){ return pageOfSlot(slot) == currentPage; }

/** Show a page on the physical screens (stops animation, redraws, persists). */
void switchPage(uint8_t page);

/**
 * Grow or shrink the deck's page list (1..MAX_PAGES). Slots dropped by a
 * shrink reset to defaults (config + NVS) so a re-added page starts fresh.
 */
void setPageCount(uint8_t n);

/** Persist currentPage + pageCount to NVS. */
void savePagePref();
