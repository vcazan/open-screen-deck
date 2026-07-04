# Waveshare 0.85″ ScreenKey Module — Reference

Canonical mechanical + electrical reference for **Open Screen Deck**.  
Sources: [Waveshare product page (SKU 34168)](https://www.waveshare.com/0.85inch-screenkey.htm?sku=34168), [Waveshare docs](https://docs.waveshare.com/0.85inch-ScreenKey-Module-W), outline drawing (see `outline-dimensions.png`).

**Our build SKU:** 34168 — **0.85inch ScreenKey Module B** (black keycap + switch + PCB)

---

## Product variants

| SKU | Product |
|-----|---------|
| 34086 | ScreenKey LCD W (display + cap only) |
| 34087 | ScreenKey LCD B |
| 34167 | ScreenKey Module W (cap + switch + PCB) |
| **34168** | **ScreenKey Module B** ← use this |

**In the box (34168):**

1. ScreenKey Module B host ×1  
2. **MX1.25 9-pin 200 mm** cable ×1  

Weight: ~0.017 kg per module

---

## Display & logic

| Parameter | Value |
|-----------|-------|
| Panel | 0.85″ IPS |
| Resolution | 128 × 128 |
| Color | 65K (RGB565) |
| Driver IC | **ST7735** |
| Interface | 4-wire SPI |
| Operating voltage | **3.3 V** (5 V tolerant per docs — run at 3.3 V) |
| Visible display area | **15.21 × 15.21 mm** |
| Pixel pitch | 118.8 × 118.8 µm |

---

## Mechanical switch (Module W/B only)

| Parameter | Value |
|-----------|-------|
| Actuation force | 50 ± 10 gf |
| Bottom-out force | 55 ± 10 gf |
| Actuation travel | 1.20 ± 0.30 mm |
| Total travel | 2.80 ± 0.25 mm |
| Spring length | 15.50 mm |
| Lifespan | 50 million cycles |

---

## Outline dimensions (from Waveshare drawing)

See **`outline-dimensions.png`** in this folder.

### Front (face toward user)

| Dimension | mm |
|-----------|-----|
| Mounting hole centres (horizontal) | **22.00** |
| Mounting hole centres (vertical) | **25.30** |
| Visible LCD (square) | **15.21 × 15.21** |

Four corner mounting holes on this 22.00 × 25.30 mm pattern.

### Back (PCB + connector)

| Dimension | mm |
|-----------|-----|
| PCB width | **25.94** |
| PCB height | **35.29** |

9-pin header on PCB edge ( mates with included cable ).

### Side (profile)

| Dimension | mm |
|-----------|-----|
| **Total stack height** (cap tip → standoff bottom) | **24.00** |
| Keycap depth (cap only) | **8.60** |

Module includes rear **brass standoffs** — total height is **not** just the 8.6 mm cap; plan enclosure depth for **~24 mm** or confirm standoffs are removed/shortened for our carrier design.

---

## 9-pin cable — SPI module interface

Connector on module: **9-pin 1.25 mm pitch** (product cable: MX1.25).  
Pin order per Waveshare docs (SPI control interface):

| Pin | Signal | Notes |
|-----|--------|-------|
| 1 | **KEY** | Button, active level per firmware |
| 2 | **DC** | Data/command (Lo = cmd, Hi = data) |
| 3 | **CS** | Chip select, active low |
| 4 | **SCLK** | SPI clock |
| 5 | **DIN** | SPI MOSI |
| 6 | **GND** | |
| 7 | **VCC** | 3.3 V |
| 8 | **PWM** | Backlight (BL) |
| 9 | **RST** | Reset, active low |

### Open Screen Deck GPIO map (carrier PCB)

| Module | CS | KEY |
|--------|-----|-----|
| J1 | GPIO 10 | GPIO 38 |
| J2 | GPIO 1 | GPIO 39 |
| J3 | GPIO 2 | GPIO 40 |
| J4 | GPIO 3 | GPIO 41 |
| J5 | GPIO 4 | GPIO 42 |
| J6 | GPIO 5 | GPIO 47 |

Shared: MOSI=11, SCK=12, DC=14, RST=21, BL(PWM)=13

---

## ⚠️ CAD status

Enclosure v4 + PCB brief aligned to this reference (2026-07-03).

---

## Links

- Product: https://www.waveshare.com/0.85inch-screenkey.htm?sku=34168  
- Wiki: https://docs.waveshare.com/0.85inch-ScreenKey-Module-W  
- Resources: https://docs.waveshare.com/0.85inch-ScreenKey-Module-W/Resources-And-Documents  
- Demo code: Waveshare GitHub / example packages linked from wiki  

---

## Files in this folder

| File | Description |
|------|-------------|
| `README.md` | This document |
| `outline-dimensions.png` | Official-style outline (front / back / side) |
| `product-spec.json` | Machine-readable spec snapshot |
