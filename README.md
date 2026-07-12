# Open Screen Deck

**A per-key LCD macro pad — open hardware, open firmware, open software.**

Six Waveshare ScreenKey modules (128×128 IPS screen inside every key), an
ESP32-S3 carrier PCB, a 3D-printed case, and a desktop companion app with
a plugin store. Plugs in as a standard USB keyboard, streams icons and
animations over USB or plays them from microSD — and keeps working when
the software isn't running.

**Docs: [vcazan.github.io/open-screen-deck](https://vcazan.github.io/open-screen-deck/)** —
parts list, illustrated assembly, flashing, app tour, plugin directory,
protocol reference.

![Open Screen Deck](docs/images/hero.png)

## Why this exists

Stream Decks are great. Subscriptions, closed firmware, and $150 price
tags are not. Open Screen Deck is the open reference build for
multi-ScreenKey macro decks: every file you need — KiCad sources, Gerbers,
OpenSCAD + STLs, firmware, companion app, plugins, docs — lives here, and
the whole thing costs **about $100 in parts** ($66 of which is the six key
modules).

## The three pieces

### 1 · Hardware — build it

| | |
|--|--|
| **Keys** | 6× Waveshare 0.85″ ScreenKey (SKU 34168) — LCD + mechanical switch in one |
| **Brain** | ESP32-S3-WROOM-1 (16 MB flash, 8 MB PSRAM) on a custom 55×112 mm carrier |
| **Case** | 59.7 × 116.7 × 28.2 mm printed deck + optional 25° stand, 4 corner screws |

1. Order 6× Waveshare 34168 (~$66) and the PCB
   (`hardware/pcb/data_streamdeck_gerbers.zip` → JLCPCB, ~$15 for five)
2. Print the case — 4 STLs in `hardware/enclosure/stl/`, no supports
3. Assemble — [illustrated guide](https://vcazan.github.io/open-screen-deck/build/assembly/),
   ~45 minutes
4. Shopping list with links: [`hardware/bom_assembly.csv`](hardware/bom_assembly.csv)

### 2 · Firmware — flash it

USB HID keyboard (F13–F24) + a JSON serial protocol for everything else:
per-key labels/colors/images, GIF/video animations from microSD, up to
**8 pages** (48 keys) switched on-device, and single/double/triple-press
actions with smart latency. Flash from the Arduino IDE
([guide](https://vcazan.github.io/open-screen-deck/firmware/flashing/)) —
or let the companion app flash the bundled firmware in one click.

### 3 · App — drive it

<p>
  <img src="docs/images/app/deck.png" alt="Companion app" width="700">
</p>

A Tauri (Rust + React) companion for macOS/Windows:

- **Visual key editor** — click a key; pick an action from a searchable,
  icon-based gallery; drop an image, icon (7,400 built in), or GIF on it
- **Actions** — launch apps (grabs the logo), hotkey chords, shell, URLs,
  mic mute with live status, OBS, macros, page switching
- **Profiles** — auto-saving layouts with pages and media, shareable as
  one file, auto-activated per app, plus ready-made templates
- **Live tiles** — clock, timer, CPU/RAM, volume, now playing
- **Plugin store** — install, update (with changelogs, ask-first), and
  build plugins that draw fully custom key faces:

<p>
  <img src="docs/images/app/plugin-faces.png" alt="Plugin faces" width="700">
</p>

- **In-app firmware updates** — flash the bundled firmware over USB, with
  bootloader recovery

[Full app tour](https://vcazan.github.io/open-screen-deck/app/) ·
[Releases](https://github.com/vcazan/open-screen-deck/releases)

## Plugins

The [plugin directory](https://vcazan.github.io/open-screen-deck/plugins/)
loads live from [`plugins/registry.json`](plugins/registry.json) — crypto
ticker, weather, world clock, pomodoro, soundboard, OBS control, Philips
Hue, Home Assistant, Zoom, screenshots, system actions, and more. Each
plugin owns its keys' faces (sparkline graphs, analog clocks, progress
rings) and exposes native customization controls.

Building one takes minutes: **Plugins → Developer → Create** scaffolds a
working plugin with hot reload. See the
[developer center](https://vcazan.github.io/open-screen-deck/plugins/develop/)
and [`plugins/README.md`](plugins/README.md).

## Repo map

```
hardware/
  pcb/               KiCad project, Gerbers, PCB BOM
  enclosure/         OpenSCAD sources + printable STLs
  3d/                Fastener STEP models used in the CAD assembly
firmware/            ESP32-S3 Arduino firmware (HID + CDC + SD + pages + animations)
app/                 Tauri companion app (Rust backend, React front end)
plugins/             Bundled plugins + registry.json (the store's index)
profiles/            Community profile gallery (.osdprofile.json)
docs/                Project site (MkDocs) — guides, protocol, design docs
scripts/             PCB/schematic generators and build tooling
```

## Contributing

- **Plugins** — PR a folder into `plugins/` + a registry entry
  ([how](https://vcazan.github.io/open-screen-deck/plugins/develop/))
- **Profiles** — export from the app, PR into `profiles/`
- **Hardware remixes** — OpenSCAD sources are parametric; keep the
  [mechanical contract](docs/mechanical_contract.md) if you want the PCB to fit
- **App / firmware** — `cd app && npm test && npm run test:e2e` must pass

## Related projects

Cousins worth knowing about: [FreeTouchDeck](https://github.com/DustinWatts/FreeTouchDeck)
(one touchscreen), [open-deck](https://github.com/joshr120/open-deck) (one TFT
behind keys), [MacroPad](https://github.com/yuvasaro/MacroPad) (per-key OLED).
Open Screen Deck differs in using **six discrete LCD key modules** with a
fabricated carrier PCB, a documented mechanical stack, and a full
companion-app + plugin ecosystem.

## License

- **Firmware, app, scripts, docs:** [MIT](LICENSE)
- **Hardware (PCB + enclosure):** [CERN-OHL-P v2](hardware/LICENSE)

ScreenKey modules are a [Waveshare](https://www.waveshare.com) product; this
project is not affiliated with or endorsed by Waveshare or Elgato.
