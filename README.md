# Open Screen Deck

Six Waveshare ScreenKey modules (128×128 IPS + switch in each cap) on an
ESP32-S3 carrier you have fabricated, in a case you print. This repo is
the KiCad, Gerbers, OpenSCAD, STLs, firmware, and an optional desktop
companion — not a store.

**Build notes:** [vcazan.github.io/open-screen-deck](https://vcazan.github.io/open-screen-deck/)
(parts, print, assembly, flashing, protocol).

![Open Screen Deck](docs/images/hero.png)

## Build one

1. Order **6× Waveshare 34168** (~$66, longest lead time) and send
   `hardware/pcb/data_streamdeck_gerbers.zip` to JLCPCB (~$15 for five
   boards). Full list: [`hardware/bom_assembly.csv`](hardware/bom_assembly.csv)
2. Print the four STLs in `hardware/enclosure/stl/` (PETG/PLA+, no supports)
   while those ship
3. Assemble — [guide](https://vcazan.github.io/open-screen-deck/build/assembly/),
   about 45 minutes
4. Flash over USB-C —
   [Arduino or the companion](https://vcazan.github.io/open-screen-deck/firmware/flashing/)

Parts land around **$100**. The six modules are most of that.

| | |
|--|--|
| **Keys** | 6× Waveshare 0.85″ ScreenKey (SKU 34168) |
| **Board** | ESP32-S3-WROOM-1 on a **59.5 × 108.5 mm** Rev E carrier |
| **On board** | IMU, ambient light, haptics, 8× SK6812, Qwiic |
| **Case** | 64.9 × 113.9 × 28.2 mm printed deck + optional 25° stand |

## Firmware

USB HID keyboard (F13–F24 by default) plus a JSON serial protocol for
labels, colours, images, microSD animations, up to 8 pages, and Rev E
hardware. Sources in `firmware/`.

## Companion app

Optional. The deck keeps working as a keyboard if you never install it.
The app (macOS/Windows, `app/`) is how you draw faces, bind host actions,
and flash updates. Plugins are folders; **Plugins → Developer → Create**
scaffolds one. Directory:
[site](https://vcazan.github.io/open-screen-deck/plugins/) ·
[`plugins/registry.json`](plugins/registry.json).

[Releases](https://github.com/vcazan/open-screen-deck/releases) ·
[App notes](https://vcazan.github.io/open-screen-deck/app/)

## Repo map

```
hardware/
  pinout.py          Canonical GPIO + Rev E geometry
  pcb/               KiCad, Gerbers, board BOM
  enclosure/         OpenSCAD v14 + printable STLs
  3d/                Fastener / assembly STEP
firmware/            ESP32-S3 Arduino
app/                 Tauri companion (Rust + React)
plugins/             Bundled plugins + registry.json
profiles/            Shared layouts (.osdprofile.json)
docs/                MkDocs site
scripts/             PCB/schematic generators
```

## Contributing

- **Plugins** — folder in `plugins/` + a registry line
  ([how](https://vcazan.github.io/open-screen-deck/plugins/develop/))
- **Profiles** — export from the app, PR into `profiles/`
- **Hardware** — OpenSCAD is parametric; keep the
  [mechanical contract](docs/mechanical_contract.md) if the PCB should still fit
- **App / firmware** — `cd app && npm test && npm run test:e2e`

## Related projects

Same neighbourhood: [FreeTouchDeck](https://github.com/DustinWatts/FreeTouchDeck)
(one touchscreen), [open-deck](https://github.com/joshr120/open-deck) (one TFT
behind keys), [MacroPad](https://github.com/yuvasaro/MacroPad) (per-key OLED).
This one is six discrete ScreenKey modules on a carrier you can order.

## License

- **Firmware, app, scripts, docs:** [MIT](LICENSE)
- **Hardware (PCB + enclosure):** [CERN-OHL-P v2](hardware/LICENSE)

ScreenKey modules are a [Waveshare](https://www.waveshare.com) product; this
project is not affiliated with or endorsed by Waveshare or Elgato.
