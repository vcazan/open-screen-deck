# Related Projects

Other DIY macro pads and deck-like builds worth knowing about.

## FreeTouchDeck

**[github.com/DustinWatts/FreeTouchDeck](https://github.com/DustinWatts/FreeTouchDeck)**

ESP32 macro deck with web config and printable cases. Uses a single
touchscreen rather than per-key LCD modules.

## open-deck

**[github.com/joshr120/open-deck](https://github.com/joshr120/open-deck)**

Open macro keyboard with custom PCB and images per key. One TFT behind
mechanical keys on an ESP8266.

## MacroPad

**[github.com/yuvasaro/MacroPad](https://github.com/yuvasaro/MacroPad)**

Per-key 64×64 OLED macro pad with custom PCB and desktop profiles. Nine
keys, not ScreenKey modules.

## How this project differs

| | Open Screen Deck | Projects above |
|--|------------------|----------------|
| Display | 6× 128×128 IPS (one per key) | Single touchscreen, one TFT, or small OLED |
| Keys | Waveshare ScreenKey (LCD + switch module) | Separate switch + display, or touch-only |
| PCB / case | 55×112 mm carrier + OpenSCAD enclosure | Varies |
| Host link | USB HID + CDC serial | Varies (web UI, BLE, etc.) |

This repo documents a 2×3 ScreenKey deck: carrier PCB, enclosure, and
firmware together. Waveshare's own ScreenKey tooling targets single modules
and is not part of this project.
