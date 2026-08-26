#include "boot_splash.h"
#include "boot_logo.h"
#include "config.h"
#include "display.h"
#include "orientation.h"

/*
 * Virtual deck canvas — the six 128x128 panels plus the physical bezel
 * gaps between their active areas, in panel pixels (~8.42 px/mm):
 *
 *   module pitch  28.9 x 38.3 mm   →  243 x 323 px
 *   active area   ~15.2 mm         →  128 px
 *
 * Panel at grid (col,row) is a window at (col*243, row*323) onto a
 * 371 x 774 canvas. Animating on this canvas makes motion track the
 * real board geometry, so the rocket "flies over" the bezels.
 */
static const int16_t PITCH_X = 243;
static const int16_t PITCH_Y = 323;

/** Ink level 0..15 → RGB565 gray ramp on black. */
static inline uint16_t inkColor(uint8_t ink) {
    uint8_t v = ink * 17;   // 0..255
    return ((v & 0xF8) << 8) | ((v & 0xFC) << 3) | (v >> 3);
}

/** Logo ink at texel (u,v), 0 when outside. */
static inline uint8_t logoInk(int32_t u, int32_t v) {
    if (u < 0 || v < 0 || u >= BOOT_LOGO_SIZE || v >= BOOT_LOGO_SIZE) return 0;
    uint8_t b = pgm_read_byte(&BOOT_LOGO[(v * BOOT_LOGO_SIZE + u) >> 1]);
    return (u & 1) ? (b & 0x0F) : (b >> 4);
}

// A sparse starfield on the virtual canvas (x, y, twinkle phase)
struct Star { int16_t x, y; uint8_t phase; };
static const Star STARS[] = {
    {40, 60, 0},   {300, 90, 3},  {180, 160, 6}, {90, 290, 2},
    {330, 340, 5}, {30, 430, 1},  {250, 480, 7}, {150, 590, 4},
    {320, 650, 0}, {60, 720, 6},  {210, 40, 2},  {110, 500, 5},
};
static const uint8_t STAR_COUNT = sizeof(STARS) / sizeof(STARS[0]);

/**
 * Render one panel's window of the canvas into frameBuf and blit it.
 * Logo: centered at (cx,cy), rendered side `size` (canvas px), 16.16
 * fixed-point sampling. Stars twinkle with the frame counter.
 */
static void renderPanel(uint8_t pos, int32_t cx, int32_t cy, int32_t size,
                        uint8_t frame, uint8_t logoAlpha /*0..16*/) {
    int16_t ox = (pos % 2) * PITCH_X;
    int16_t oy = (pos / 2) * PITCH_Y;

    memset(frameBuf, 0, FRAME_BYTES);

    // Stars behind the artwork
    for (uint8_t s = 0; s < STAR_COUNT; s++) {
        int16_t sx = STARS[s].x - ox, sy = STARS[s].y - oy;
        if (sx < 0 || sy < 0 || sx >= 128 || sy >= 128) continue;
        uint8_t tw = (uint8_t)(8 + 7 * sinf(frame * 0.45f + STARS[s].phase));
        frameBuf[sy * 128 + sx] = inkColor(tw);
    }

    if (size > 0 && logoAlpha > 0) {
        // texel step per canvas pixel, and texel of this window's origin
        int32_t step = ((int32_t)BOOT_LOGO_SIZE << 16) / size;
        int32_t u0 = (int32_t)(ox - (cx - size / 2)) * step;
        int32_t v  = (int32_t)(oy - (cy - size / 2)) * step;
        for (int16_t py = 0; py < 128; py++, v += step) {
            if (v < 0 || v >= ((int32_t)BOOT_LOGO_SIZE << 16)) continue;
            int32_t u = u0;
            uint16_t* row = &frameBuf[py * 128];
            for (int16_t px = 0; px < 128; px++, u += step) {
                uint8_t ink = logoInk(u >> 16, v >> 16);
                if (ink) {
                    uint8_t a = (uint8_t)((ink * logoAlpha) >> 4);
                    if (a > row[px] >> 12) row[px] = inkColor(a);
                }
            }
        }
    }

    Adafruit_ST7735* tft = tfts[physOf(pos)];
    tft->startWrite();
    tft->setAddrWindow(0, 0, 128, 128);
    tft->writePixels(frameBuf, 128 * 128, true, false);   // native-endian buf
    tft->endWrite();
}

void playBootSplash() {
    if (!frameBuf || !tfts[0]) return;

    // One centered emblem, same on every key. The old fly-by rendered
    // 14×6 full frames before the logo was readable.
    renderPanel(0, 64, 64, 148, 8, 16);
    for (uint8_t p = 1; p < KEY_COUNT; p++) {
        Adafruit_ST7735* tft = tfts[physOf(p)];
        tft->startWrite();
        tft->setAddrWindow(0, 0, 128, 128);
        tft->writePixels(frameBuf, 128 * 128, true, false);
        tft->endWrite();
    }
    displayBacklight(true);
}
