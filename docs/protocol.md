# Serial Protocol (v0.9)

USB **CDC serial** at **115200 baud**, newline-terminated lines.  
No custom kernel driver — companion app opens the CDC port (Web Serial or Tauri).

## Device → Host (unsolicited)

Boot:

```json
{"event":"info","name":"Open Screen Deck","fw":"0.9.0","proto":9,"keys":6,"mode":"hid"}
```

Key press / release:

```json
{"event":"key","index":0,"action":"press"}
{"event":"key","index":0,"action":"release"}
```

## Host → Device

| Command | Response |
|---------|----------|
| `PING` | `{"event":"pong"}` (doubles as companion heartbeat) |
| `MODE COMPANION` | suppress on-device HID; companion routes key events (v0.7+) |
| `MODE HID` | restore on-device HID typing (v0.7+) |
| `INFO` | info object (includes `sd` + `psram`) |
| `GET_KEYS` | one `key_state` line per key |
| `DRAW 0` | redraw key 0 |
| `DRAW_ALL` | stop animation, redraw all keys |
| `SET_KEY {...}` | update label/sublabel/hid/bg/ov; persists to NVS. `ov:1` draws text over SD media at render time (v0.8+) |
| `SET_IMAGE {...}` + raw bytes | push 128×128 RGB565 frame to a key |
| `SET_ANIM {...}` + raw bytes | write one animation frame to SD (v0.5+) |
| `ANIM 0 10` | play SD animation on key 0 at 10 fps |
| `ANIM STOP` | stop animation, restore icon |
| `ANIM_CLEAR 0` | delete all animation frames for key 0 (v0.5+) |
| `SD_INFO` | SD card size/usage |
| `SET_ORIENT 0..3` | deck orientation: 0 portrait, 1 landscape CW, 2 flipped, 3 landscape CCW (v0.9+). Rotates all displays, remaps key positions row-major, persists to NVS |
| `SD_LS /osd/keys` | list a directory (v0.6+) |
| `SD_RM /osd/keys/0/icon.rgb565` | delete a file or empty dir (v0.6+) |

### Companion mode (v0.7+)

While the desktop companion app is connected it sends `MODE COMPANION`
followed by `PING` every 2 s. In this mode the firmware **does not type
HID keys** — it only emits `key` events, and the companion executes the
configured action (launch app, hotkey, mic mute, …). If no heartbeat
arrives for 6 s (app quit, cable pulled), the firmware falls back to
plain HID F13–F24 automatically. The deck always works standalone.

### `SET_KEY`

```json
SET_KEY {"index":0,"label":"MUTE","sublabel":"Mic","hid":104,"bg":19049}
```

`hid` = Arduino HID code (KEY_F13 = 240 on the ESP32 core; use value from `GET_KEYS`).
`bg` = RGB565 as decimal. Persisted to NVS — survives reboot.

String fields are optional: omit `label`/`sublabel` to keep the current value,
send an explicit empty string (`"label":""`) to clear it.

### `SET_IMAGE`

```json
SET_IMAGE {"index":0,"len":32768}
```

Device replies `{"event":"send_data"}`; host then sends exactly 32 768 raw
RGB565 bytes (big-endian per Adafruit GFX). Frame is drawn immediately and
saved to SD as `/osd/keys/0/icon.rgb565` when a card is mounted.

**Transparency (v0.9.1+):** icon pixels with the sentinel value `0x0821`
(bytes `08 21`) are replaced by the key's current `bg` color at draw time —
recoloring a key never requires re-uploading its image. The companion app
writes this sentinel for transparent regions of logos and PNGs.

### `SET_ANIM` (v0.5+)

```json
SET_ANIM {"index":0,"frame":1,"len":32768}
```

Same handshake as `SET_IMAGE`: device replies `{"event":"send_data"}`, host
sends 32 768 raw RGB565 bytes. The frame is written to
`/osd/keys/0/anim/0001.rgb565` (frame numbers are **1-based**, max 999).
Requires a mounted SD card — errors with `bad_anim_header` otherwise.

Typical upload sequence from the companion app:

```
ANIM_CLEAR 0                              → ok
SET_ANIM {"index":0,"frame":1,...} + data → ok
SET_ANIM {"index":0,"frame":2,...} + data → ok
…
ANIM 0 10                                 → anim event, playback starts
```

USB CDC on the ESP32-S3 is full-speed (~1 MB/s real-world), so a typical
20-frame clip (640 KB) uploads in about a second.

### `ANIM_CLEAR` (v0.5+)

```
ANIM_CLEAR 0
```

Stops playback if key 0 is animating and deletes
`/osd/keys/0/anim/*.rgb565`. Responds
`{"event":"ok","cmd":"ANIM_CLEAR","index":0,"removed":20}`.

### `SD_LS` (v0.6+)

```
SD_LS /osd/keys/0/anim
```

One `sd_entry` line per item, then a terminator:

```json
{"event":"sd_entry","name":"0001.rgb565","dir":false,"size":32768}
{"event":"sd_ls_done","path":"/osd/keys/0/anim","count":1}
```

`SD_LS` with no path lists the card root. Retries the SD mount if a card was
inserted after boot.

### `SD_RM` (v0.6+)

```
SD_RM /osd/keys/0/anim/0001.rgb565
```

Removes a file (or an empty directory). Responds
`{"event":"ok","cmd":"SD_RM","path":"..."}` or `rm_failed`.

### `GET_KEYS` response lines

```json
{"event":"key_state","index":0,"label":"MUTE","sublabel":"Toggle","hid":240}
```

(`hid` is Arduino `KEY_F13` etc.)

## Storage & media

On-board **microSD** holds offline icons and animation frames:

```
/osd/keys/0/icon.rgb565
/osd/keys/0/anim/0001.rgb565
/osd/profiles/streaming.json
```

Animations survive reboot — replay with `ANIM n fps` any time.

See `docs/product_architecture.md` for video limits on shared SPI.

## Animation rules (physics of a shared SPI bus)

- **One key animates at a time** (`ANIM n fps`); 1–30 fps
- Frames stream from SD: `/osd/keys/n/anim/0001.rgb565`, `0002` …
- All six keys **cannot** run video simultaneously — see
  `docs/product_architecture.md` for the bandwidth math

## Quick test (Chrome console via Web Serial)

1. Connect device with USB CDC enabled  
2. Open serial monitor or Web Serial  
3. Send `PING` → expect `pong`  
4. Press a key → expect `key` event JSON  
