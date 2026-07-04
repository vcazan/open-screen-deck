# Serial Protocol (v0.4)

USB **CDC serial** at **115200 baud**, newline-terminated lines.  
No custom kernel driver — companion app opens the CDC port (Web Serial or Tauri).

## Device → Host (unsolicited)

Boot:

```json
{"event":"info","name":"Open Screen Deck","fw":"0.2.0","keys":6}
```

Key press:

```json
{"event":"key","index":0,"action":"press"}
```

## Host → Device

| Command | Response |
|---------|----------|
| `PING` | `{"event":"pong"}` |
| `INFO` | info object (includes `sd` + `psram`) |
| `GET_KEYS` | one `key_state` line per key |
| `DRAW 0` | redraw key 0 |
| `DRAW_ALL` | stop animation, redraw all keys |
| `SET_KEY {...}` | update label/sublabel/hid/bg; persists to NVS |
| `SET_IMAGE {...}` + raw bytes | push 128×128 RGB565 frame to a key |
| `ANIM 0 10` | play SD animation on key 0 at 10 fps |
| `ANIM STOP` | stop animation, restore icon |
| `SD_INFO` | SD card size/usage |

### `SET_KEY`

```json
SET_KEY {"index":0,"label":"MUTE","sublabel":"Mic","hid":104,"bg":19017}
```

`hid` = Arduino HID code (F13 = 104 + 240 offset per core; use value from `GET_KEYS`).
`bg` = RGB565 as decimal. Persisted to NVS — survives reboot.

### `SET_IMAGE`

```json
SET_IMAGE {"index":0,"len":32768}
```

Device replies `{"event":"send_data"}`; host then sends exactly 32 768 raw
RGB565 bytes (big-endian per Adafruit GFX). Frame is drawn immediately and
saved to SD as `/osd/keys/0/icon.rgb565` when a card is mounted.

### `GET_KEYS` response lines

```json
{"event":"key_state","index":0,"label":"MUTE","sublabel":"Toggle","hid":183}
```

(`hid` is Arduino `KEY_F13` etc.)

## Storage & media (v0.4+)

On-board **microSD** holds offline icons and animation frames:

```
/osd/keys/0/icon.rgb565
/osd/keys/0/anim/0001.rgb565
/osd/keys/0/anim/meta.json   → { "fps": 10, "frames": 24, "loop": true }
/osd/profiles/streaming.json
```

While USB connected, the companion may **stream** frames without writing SD (live mode).

See [Architecture](../hardware/architecture.md) for video limits on shared SPI.

## Animation rules (physics of a shared SPI bus)

- **One key animates at a time** (`ANIM n fps`); 1–30 fps
- Frames stream from SD: `/osd/keys/n/anim/0001.rgb565`, `0002` …
- All six keys **cannot** run video simultaneously — see
  [Architecture](../hardware/architecture.md) for the bandwidth math

## Quick test (Chrome console via Web Serial)

1. Connect device with USB CDC enabled  
2. Open serial monitor or Web Serial  
3. Send `PING` → expect `pong`  
4. Press a key → expect `key` event JSON  
