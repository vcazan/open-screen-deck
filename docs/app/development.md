# App Development

The companion is a Tauri 2 app: Rust backend (serial, actions, OS state,
flashing, plugin services), React front end (deck editor, simulator).
Source lives in [`app/`](https://github.com/vcazan/open-screen-deck/tree/main/app).

## Run it

```bash
cd app
npm install
npm run dev          # browser build — full simulator, Web Serial
npx tauri dev        # desktop shell against the dev server
npx tauri build      # release bundles (.app / .dmg / .msi)
```

The browser build runs the complete UI against an in-browser simulated
deck — most development never needs hardware. Native-only features
(hotkey synthesis, mic control, plugin execution) dry-run to the console.

## Tests

```bash
cd app
npm test             # unit (vitest)
npm run test:e2e     # UI + protocol against the simulator (Playwright)
```

## Architecture notes

- **Protocol** — one JSON-over-CDC serial protocol for everything
  (`SET_KEY`, `SET_IMAGE`, `SET_FACE`, `SET_ANIM`, pages, mode/heartbeat).
  Reference: [Serial protocol](../firmware/protocol.md).
- **Simulator mirror** — in USB mode a local simulated deck mirrors every
  command sent to hardware, so the UI always reflects device state.
- **Actions** — host-side actions execute in Rust (launch, hotkey via
  `enigo`, shell, mic via CoreAudio/WASAPI); device-side actions (HID
  keystrokes, page switching) run in firmware.
- **Plugins** — ES modules evaluated in the webview with a narrow API;
  installs/HTTP proxied through Rust. See the
  [developer center](../plugins/develop.md).

## Permissions (macOS)

- **Hotkey synthesis** requires Accessibility approval (System Settings →
  Privacy & Security → Accessibility). Launch/URL/shell/mic actions do not.
- The **screenshot plugin** needs Screen Recording permission.

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
with the keypair in `app/src-tauri/.updater-key.txt` (git-ignored; the
public key lives in `tauri.conf.json`).

## Roadmap (stretch)

- **Windows parity** — the backend compiles for Windows (WASAPI mic, app
  enumeration pending); tiles and the updater are OS-agnostic
- **Multi-deck** — the transport layer supports one deck today; per-port
  sessions are the planned extension
- **Linux** — untested; serial + HID paths should work on recent kernels
