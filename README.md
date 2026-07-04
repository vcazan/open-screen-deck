# Open Screen Deck

**A per-key LCD macro pad — open hardware, open firmware, no subscription.**

**Full documentation: [vcazan.github.io/open-screen-deck](https://vcazan.github.io/open-screen-deck/)** — parts list, print settings, illustrated assembly, flashing, protocol reference.

Six Waveshare ScreenKey modules (128×128 IPS screen inside every key), an
ESP32-S3 carrier PCB, and a 3D-printed case. Plugs in as a standard USB
keyboard (F13–F18), streams icons and animations over USB or plays them from
a microSD card. Build it yourself from the files in this repo.

![Open Screen Deck](docs/images/hero.png)

## Why this exists

Stream Decks are great. Subscriptions, closed firmware, and $150 price tags
are not. Open Screen Deck is the open reference build for multi-ScreenKey
macro decks: every file you need — KiCad sources, Gerbers, OpenSCAD +
STLs, firmware, docs — lives here, and the whole thing costs **about $100
in parts** ($66 of which is the six key modules).

|  |  |
|--|--|
| **Keys** | 6× Waveshare 0.85″ ScreenKey (SKU 34168) — LCD + mechanical switch in one module |
| **Screens** | 128×128 IPS per key, ST7735, shared SPI |
| **Brain** | ESP32-S3-WROOM-1 (16 MB flash, 8 MB PSRAM) on a custom 55×112 mm carrier |
| **Host link** | USB-C → standard HID keyboard (F13–F18) + CDC serial for config |
| **Media** | microSD for on-device icons/animations, or stream frames over USB |
| **Case** | 59.7 × 116.7 × 28.2 mm printed deck + optional 25° stand |
| **Fasteners** | 4 corner screws close the whole thing — they thread through the key modules' own mounting nuts |

## Build it

1. **Order the key modules** — 6× Waveshare 34168 (~$66)
2. **Order the PCB** — upload `hardware/pcb/data_streamdeck_gerbers.zip` to
   JLCPCB (~$15 for five boards); component list in `hardware/pcb/bom.csv`
3. **Print the case** — 4 STLs in `hardware/enclosure/stl/`, no supports
4. **Screw it together** — full illustrated guide in
   [`docs/assembly.md`](docs/assembly.md), ~45 minutes
5. **Flash the firmware** — see below

Complete shopping list with links and prices:
[`hardware/bom_assembly.csv`](hardware/bom_assembly.csv)

## Flash the firmware

Arduino IDE (or arduino-cli) with the ESP32 board package:

1. Board: **ESP32S3 Dev Module** — enable **USB CDC On Boot**, USB Mode: **USB-OTG (TinyUSB)**
2. Libraries: `Adafruit ST7735 and ST7789`, `Adafruit GFX`
3. Open `firmware/main.cpp`, hold **BOOT**, tap **RESET**, upload
4. The deck enumerates as a keyboard (F13–F18) + a serial port

Key labels, colors, and HID codes are configurable at runtime over the
serial protocol — no reflash needed. See [`docs/protocol.md`](docs/protocol.md).

## Repo map

```
firmware/            ESP32-S3 Arduino firmware (HID + CDC + SD + animations)
hardware/pcb/        KiCad project, Gerbers, PCB BOM
hardware/enclosure/  OpenSCAD sources + printable STLs
hardware/3d/         Fastener STEP models used in the CAD assembly
docs/                Assembly guide, protocol, design docs, project site
scripts/             PCB/schematic generators and build tooling
```

## Design docs

- [`docs/assembly.md`](docs/assembly.md) — illustrated build guide
- [`docs/mechanical_contract.md`](docs/mechanical_contract.md) — how the PCB, modules, and case fit together
- [`docs/pcb_design_brief.md`](docs/pcb_design_brief.md) — board layout and pinout truth
- [`docs/protocol.md`](docs/protocol.md) — USB serial protocol (v0.4)
- [`docs/product_architecture.md`](docs/product_architecture.md) — media storage and streaming design

## Related projects

Cousins worth knowing about: [FreeTouchDeck](https://github.com/DustinWatts/FreeTouchDeck)
(one touchscreen), [open-deck](https://github.com/joshr120/open-deck) (one TFT
behind keys), [MacroPad](https://github.com/yuvasaro/MacroPad) (per-key OLED).
Open Screen Deck differs in using **six discrete LCD key modules** with a
fabricated carrier PCB and a fully documented mechanical stack.

## License

- **Firmware, scripts, docs:** [MIT](LICENSE)
- **Hardware (PCB + enclosure):** [CERN-OHL-P v2](hardware/LICENSE)

ScreenKey modules are a [Waveshare](https://www.waveshare.com) product; this
project is not affiliated with or endorsed by Waveshare or Elgato.
