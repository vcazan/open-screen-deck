# Open Screen Deck Configurator

Browser-based companion app for configuring the [Open Screen Deck](https://github.com/vcazan/open-screen-deck) — a 6-key macro pad with per-key 128×128 IPS LCD displays, driven by an ESP32-S3 over USB.

Configure key labels, colors, HID bindings, icons, and SD animations. Test everything in the built-in device simulator before connecting real hardware via Web Serial.

## Quick start

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm run test     # protocol unit tests
npm run build    # production bundle
```

## Architecture

```
app/src/
├── protocol/       # Serial protocol v0.4 — types, codec, RGB565 helpers
├── transport/      # Transport abstraction (simulator loopback + Web Serial)
├── simulator/      # Virtual firmware mirroring main.cpp behavior
├── ui/             # React components (deck, inspector, console)
├── hooks/          # Device connection state management
└── utils/          # Profile import/export, animation decoding
```

### Protocol layer (`protocol/`)

Implements the newline-delimited JSON protocol defined in `docs/protocol.md` v0.4:

- **Commands**: `PING`, `INFO`, `GET_KEYS`, `DRAW`, `DRAW_ALL`, `SET_KEY`, `SET_IMAGE`, `ANIM`, `SD_INFO`
- **Events**: `info`, `key`, `key_state`, `pong`, `ok`, `error`, `send_data`, `anim`, `sd`
- **Binary framing**: `SET_IMAGE` sends a JSON header, device replies `send_data`, host streams 32 768 bytes RGB565

RGB565 conversion uses big-endian byte order matching Adafruit GFX / ST7735.

### Transport layer (`transport/`)

All device I/O goes through a `Transport` interface so the app can later be wrapped in Tauri without changing UI code:

| Implementation | Purpose |
|----------------|---------|
| `SimulatorTransport` | In-process loopback to `SimulatedDevice` (default) |
| `WebSerialTransport` | Real hardware via `navigator.serial` at 115200 baud |

### Simulator (`simulator/`)

`SimulatedDevice` is a faithful virtual firmware:

- 6 keys with label view renderer matching `drawKey()` in `firmware/main.cpp`
- Handles every protocol command identically to the ESP32 firmware
- Key presses emit `{"event":"key",...}` and simulate HID keystrokes
- NVS persistence via `localStorage` (survives page reload)
- In-memory SD card for icons and animation frame sequences

### UI (`ui/`)

Dark-themed single-page layout:

- **Left**: CSS device rendering with live 128×128 key canvases
- **Right**: Progressive-disclosure inspector for the selected key
- **Bottom**: Collapsible protocol console (TX/RX log)

## Simulator vs real hardware

| Feature | Simulator | Real device |
|---------|-----------|-------------|
| Key press events | Click on deck | Physical switch |
| HID output | Shown as floating chip | Sent over USB HID |
| NVS config | `localStorage` | ESP32 Preferences |
| SD storage | `localStorage` (base64 frames) | microSD card |
| SET_IMAGE | Draws to canvas + saves icon | ST7735 + SD write |
| ANIM | Plays from in-memory frames | Reads `/osd/keys/n/anim/*.rgb565` |

The same `encodeCommand()` / `Transport.sendLine()` code drives both paths.

## Profiles

Save/load the full 6-key configuration as JSON:

```json
{
  "version": 1,
  "keys": [
    { "label": "MUTE", "sublabel": "Toggle", "hid": 183, "bg": 19049, "fg": 65535 }
  ]
}
```

Use **Save profile** / **Load profile** in the header, or **Reset defaults** to restore firmware factory labels.

## Future: Tauri wrapper

The transport abstraction is designed for a future Tauri shell:

1. Replace `WebSerialTransport` with a Tauri IPC bridge calling `serialport` crate
2. Keep `SimulatorTransport` for offline development
3. No changes needed to protocol, simulator, or UI layers

## License

Same as the parent Open Screen Deck project (MIT firmware, CERN-OHL-P hardware).
