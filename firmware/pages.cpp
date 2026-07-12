#include "pages.h"
#include "state.h"
#include "display.h"
#include "media.h"

uint8_t currentPage = 0;
uint8_t pageCount   = 1;

void savePagePref() {
    prefs.begin("osd", false);
    prefs.putUChar("page", currentPage);
    prefs.putUChar("pages", pageCount);
    prefs.end();
}

void switchPage(uint8_t page) {
    if (page >= pageCount) return;
    stopAnimation();
    currentPage = page;
    for (uint8_t p = 0; p < KEY_COUNT; p++) drawKey(slotOfPos(p));
    savePagePref();
    if (Serial) Serial.printf("{\"event\":\"page\",\"page\":%u}\n", currentPage);
}

void setPageCount(uint8_t n) {
    if (n < 1 || n > MAX_PAGES || n == pageCount) return;
    if (n < pageCount) {
        // Dropped slots reset so a re-added page starts fresh
        for (uint8_t s = n * KEY_COUNT; s < pageCount * KEY_COUNT; s++) {
            defaultSlotConfig(s);
            saveConfig(s);
        }
    }
    pageCount = n;
    if (currentPage >= pageCount) {
        switchPage(pageCount - 1);   // also persists both prefs
    } else {
        savePagePref();
    }
    if (Serial) Serial.printf("{\"event\":\"pages\",\"pages\":%u}\n", pageCount);
}
