# Companion App

The desktop companion turns the deck from a HID macro pad into a Stream
Deck-class controller: keys launch apps, press full hotkey chords, run
shell commands, toggle the microphone with **live status on the key**, and
switch OBS scenes.

## How it works

```
key press ──USB CDC──▶ companion (Tauri/Rust) ──▶ action engine ──▶ macOS/Windows
key faces ◀──SET_KEY── state engine (mic mute, OBS scene, frontmost app) ◀── OS
```

- On connect the companion sends `MODE COMPANION`; the firmware stops
  typing F13–F24 itself and just reports key events. `PING` every 2 s is
  the heartbeat — if the companion dies or the cable is pulled, the
  firmware reverts to plain HID within 6 s. **The deck always works, with
  or without software.**
- Actions are stored per key (and inside profiles, schema v2). The `hid`
  action type doubles as the no-companion fallback binding.
- State providers poll the OS and push two-state key faces over the same
  serial protocol (`SET_KEY`), so status changes made anywhere — muting
  the mic in a meeting app, switching scenes in OBS itself — show up on
  the deck within a second.

## Pages

Decks start with one page and grow to **8 pages × 6 keys = 48 slots** — the
**+** / **−** buttons next to the page tabs add and remove pages (removing
resets that page's keys). The page count lives on the device (firmware
v0.11+, NVS-persisted) and **inside each profile**, so applying a 3-page
profile resizes the deck to 3 pages.

A key bound to *Next page* / *Previous page* / *Go to page* switches
on-device — even standalone, because page switching is firmware-owned
(reserved HID codes 230–239).

## Action types

| Action | Runs on | Notes |
|--------|---------|-------|
| Keystroke (F13–F24) | device | works without companion |
| Hotkey (`cmd+shift+m`) | host | needs macOS Accessibility permission |
| Launch app | host | app name or path |
| Open URL | host | default browser |
| Shell command | host | `sh -lc` / `cmd /C` |
| Mic mute toggle | host | live two-state face (configurable colors/labels) |
| OBS scene | webview | needs obs-websocket (Settings → OBS) |
| Next page / Go to page | device | firmware-owned, works standalone |
| Live tile | host | streams rendered faces via `SET_FACE` |
| Macro | host | steps with per-step delay |

## Live tiles

A key face can render live data, streamed as draw-only frames (`SET_FACE`) so
the SD card and stored icons are untouched:

- **Clock** — time + date, blinking colon
- **Timer** — stopwatch; press the key to start/stop
- **CPU / RAM** — system load meters
- **Volume** — system output level
- **Now playing** — Spotify / Apple Music track
- **OBS scene** — live program scene name

Tiles refresh at 0.3–2 fps each and pause automatically while their page is
hidden or media uploads are running.

## Editing

- **Drag & drop** — drag one key onto another to swap their full identity
  (config, action, icon/animation), on the app and the device at once
- **Copy/paste** — ⌘C / ⌘V on a selected key
- **Undo/redo** — ⌘Z / ⇧⌘Z, up to 50 steps; label typing coalesces into one step

## Firmware updates

Settings → Firmware shows the version on the deck vs. the version bundled
with the app. One click reboots the deck into its ROM bootloader, flashes the
bundled image over USB (espflash, ~30 s), and restarts it. No Arduino IDE, no
esptool, no drivers. If a flash is interrupted, hold **BOOT** while plugging
in and press the button again.

## Plugins

Plugins contribute new action types. **Settings → Plugins** is the whole
lifecycle:

- **Store** — browses the plugin registry (a JSON index in the repo's
  [`plugins/`](https://github.com/vcazan/open-screen-deck/tree/main/plugins)
  folder; URL configurable for community registries) and installs/updates
  plugins with one click. Home Assistant (webhooks) and Pomodoro (a timer
  on a key face) are in the registry today.
- **Installed** — versioned list with one-click uninstall.
- **Developer** — *Create* scaffolds a working plugin (manifest + a live
  Hello action) straight into the plugin folder and opens it; *Reload
  plugins* hot-reloads after every edit, no app restart. See
  `plugins/README.md` for the `activate(api)` API.

To publish a plugin, PR it into `plugins/` with an entry in
`plugins/registry.json` — every user's store picks it up on refresh.

## Profile gallery

Profiles export as self-contained `.osdprofile.json` files (**Share** on any
profile card) — configs, actions, and media in one file. Community layouts
live in the repo's
[`profiles/`](https://github.com/vcazan/open-screen-deck/tree/main/profiles)
folder; import them via **Profiles → Import**, contribute yours by PR.

## Roadmap (stretch)

- **Windows parity** — the backend compiles for Windows (WASAPI mic, app
  enumeration pending); tiles and the updater are OS-agnostic
- **Multi-deck** — the transport layer supports one deck today; per-port
  sessions are the planned extension
- **Linux** — untested; serial + HID paths should work on recent kernels

## Development

```bash
cd app
npm run dev          # browser build (simulator + Web Serial)
npx tauri dev        # desktop shell against the dev server
npx tauri build      # release bundles (.app / .dmg / .msi)
```

## Permissions (macOS)

- **Hotkey synthesis** requires Accessibility approval (System Settings →
  Privacy & Security → Accessibility). Launch/URL/shell/mic actions do not.
- Mic mute uses the system **input volume** (0 = muted); the poller sees
  changes made by any app.

## Releases

Tag `app-v*` (e.g. `app-v0.1.0`) to trigger `.github/workflows/release.yml`:
universal macOS + Windows bundles, uploaded to a draft GitHub Release.
Signing/notarization activates when these repo secrets are set:

| Secret | Purpose |
|--------|---------|
| `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` | Developer ID cert (base64 .p12) |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: …` |
| `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | notarization |
| `WINDOWS_CERTIFICATE` / `WINDOWS_CERTIFICATE_PASSWORD` | Authenticode (optional) |
| `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) | auto-update artifact signing |

Unsigned builds work for local use (right-click → Open on macOS).

### Auto-update

The app checks GitHub Releases (`latest.json`) via `tauri-plugin-updater`
— Settings → Companion → *Check for updates*. Updater artifacts are signed
with the keypair in `app/src-tauri/.updater-key.txt` (git-ignored — keep the
private key safe or regenerate with `npx tauri signer generate`; the public
key lives in `tauri.conf.json`).
