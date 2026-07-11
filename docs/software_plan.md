# Companion App — Project Plan

The desktop configurator for Open Screen Deck: a downloadable Windows/macOS
app to set up keys, push icons and animations, and manage the device — plus
a built-in simulator so all of it can be developed and demoed without
hardware.

**Repo home:** `app/` (web-first core, wrapped in Tauri for distribution)

---

## Architecture

One codebase, three run targets:

```
┌────────────────────────────────────────────────┐
│  UI (React + TypeScript)                       │
│  deck view · key inspector · media pipeline    │
├────────────────────────────────────────────────┤
│  Protocol layer (serial protocol v0.4+)        │
│  typed commands/events · RGB565 · framing      │
├────────────────────────────────────────────────┤
│  Transport interface                           │
│  ├─ SimulatorTransport  (virtual device)       │
│  ├─ WebSerialTransport  (browser dev)          │
│  └─ TauriSerialTransport (shipped app)         │
└────────────────────────────────────────────────┘
```

Rules that keep this sane:

1. **The protocol is the only contract.** The UI never talks to a device
   object directly — everything goes through protocol lines over a
   Transport. The simulator earns its keep by speaking the identical
   protocol; if it drifts from firmware, that is a bug.
2. **The simulator is a firmware twin, not a mock.** It implements the
   command set the way `firmware/main.cpp` does, including config
   persistence (localStorage standing in for NVS) and key-press events.
3. **Web-first, Tauri-wrapped.** Everything runs in a plain browser today
   (fast iteration, Web Serial for early hardware tests). Tauri packaging
   is a milestone, not a prerequisite.

---

## Feature list (full scope)

### Device setup
- Per-key label, sublabel, background color, HID keycode (F13–F24 or
  custom) with live preview
- Per-key static icons: drop any image → auto-resize → RGB565 → device
- Profiles: named sets of all six keys; export/import as JSON; later
  auto-switching hooks (active app detection — stretch)
- Device info panel: firmware version, SD card size/usage, connection state

### Media pipeline (the differentiator)
- Animations per key: drop a GIF or video → decoded in-app → downsampled
  to 128×128 at 5/10/15 fps → size estimate → streamed to the device SD
  card → loop playback via `ANIM`
- Frame budget guardrails (SD write speed and space) surfaced in UI
  before upload, not after failure
- Later: live streaming mode (host pushes frames continuously over USB
  for now-playing art, meters, timers)

### Development & debugging
- **Simulator**: pixel-accurate virtual deck; click keys to fire the same
  events hardware sends; shows which HID keystroke would fire; persists
  its "NVS" across reloads
- Protocol console: raw TX/RX lines, timestamped — doubles as the field
  debugging tool for user bug reports
- Fault injection (later): simulated disconnects, slow SD, full SD

### Distribution
- Tauri app for macOS (universal) and Windows x64; auto-update feed off
  GitHub Releases
- The same build deployed as a web app on the docs site (simulator-only
  mode) as a try-before-you-build demo

---

## Firmware alignment (v0.4 → v0.5)

The existing firmware + protocol already cover: `SET_KEY` with NVS
persistence (survives unplug — requirement met), `SET_IMAGE` full-frame
push, `ANIM` playback from SD, key events, `INFO`/`SD_INFO`.

v0.5 additions needed for the full app experience — to implement when
hardware is in hand:

| Gap | Addition |
|-----|----------|
| No way to write SD files over USB | `SD_WRITE {name,len}` + chunked transfer with per-chunk ack + CRC |
| Image push is all-or-nothing 32 KB | chunked `SET_IMAGE` (4 KB chunks + ack) so slow hosts don't overrun |
| App can't read full config back | `GET_CONFIG` → one JSON blob (labels, colors, hid, icon/anim refs) |
| No protocol versioning | `INFO` gains `"proto":5`; app negotiates features |
| `GET_KEYS` omits `bg`/`fg` colors | include full key state in each `key_state` line |
| No key release events | emit `"action":"release"` so the app can show hold state |
| Icons lost on reboot (RAM only) | persist pushed icons to SD (`/osd/icons/keyN.raw`), reload at boot |

---

## Milestones

| # | Deliverable | Definition of done |
|---|-------------|--------------------|
| **M0** | App shell + simulator | Virtual deck renders 6 live keys; click-to-press fires protocol events; config edits persist across reload. **Being built now.** |
| **M1** | Full key configuration UX | Labels, colors, HID picker, static icons, profiles import/export — all against the simulator |
| **M2** | Media pipeline | GIF/video → frames → simulated SD; playback in simulator; size guardrails |
| **M3** | Real device over Web Serial | Same UI drives hardware; bring-up tested against Rev B board; protocol console used for debugging |
| **M4** | Firmware v0.5 | Chunked transfers, GET_CONFIG, SD writes, icon persistence; app negotiates v4/v5 |
| **M5** | Tauri packaging | Signed .dmg + .msi, serial permissions, auto-update, CI release workflow |
| **M6** | Polish + docs | First-run experience, docs-site "web demo" deployment, user guide pages |

Sequencing notes:
- M0–M2 need zero hardware — that's the point of the simulator.
- M3 starts the day the Rev B boards arrive and work.
- M4 is the only firmware work; everything before it runs on v0.4.
- Tauri (M5) is deliberately late: packaging early buys nothing.

---

## Stack

| Piece | Choice | Why |
|-------|--------|-----|
| UI | React 18 + TypeScript + Vite | fast dev loop; huge ecosystem; team familiarity |
| Styling | hand-rolled CSS, product palette | no framework bloat; matches device aesthetic |
| Tests | Vitest | protocol codec + RGB565 conversions are unit-testable |
| Serial (dev) | Web Serial API | zero install; Chrome/Edge cover dev needs |
| Serial (ship) | tauri-plugin-serialplugin | native, cross-platform, no driver on modern OSes |
| Shell | Tauri v2 | ~5 MB installers vs Electron's ~100 MB |
| Video decode | HTMLVideoElement + canvas / WebCodecs | in-browser, no ffmpeg dependency for v1 |

---

## Risks

- **Web Serial is Chromium-only** — fine for dev; the shipped Tauri app
  does not depend on it.
- **SD write throughput** over CDC will limit animation length; guardrails
  in the UI + honest progress bars. Measure on real hardware in M3 and
  set the budget from data.
- **WebCodecs coverage** varies; canvas-sampling fallback is slower but
  universal.
- **Signing** (Apple notarization, Windows cert) costs money and setup
  time — schedule it inside M5, not at the end.
