# Open Screen Deck

<p class="hero-tagline">
A per-key LCD macro pad you can actually own — <strong>open hardware,
open firmware, open software</strong>. Six mechanical keys, each with its
own 128×128 screen. Build it for about $100, drive it with a first-class
desktop app, extend it with plugins. No account, no subscription, no
cloud.
</p>

<p class="hero-actions">
  <a id="dl-mac" class="md-button md-button--primary"
     href="https://github.com/vcazan/open-screen-deck/releases/latest">
    Download for macOS
  </a>
  <a id="dl-win" class="md-button"
     href="https://github.com/vcazan/open-screen-deck/releases/latest">
    Download for Windows
  </a>
  <a class="md-button" href="getting-started/parts/">
    Build the deck →
  </a>
</p>
<p id="dl-version" class="hero-version"></p>

![Open Screen Deck render](images/hero.png){ .hero-image }

## The app is half the product

The companion app is a Stream Deck-class editor — and the deck keeps
working when it's closed, because everything important also lives on the
device.

![Companion app](images/app/deck.png){ .app-shot }

- **Visual everything** — click a key, pick from an icon-based action
  gallery, drop images/GIFs/videos straight onto keys, crop in place
- **Real actions** — launch apps (grabs the logo automatically), hotkey
  chords, shell commands, URLs, mic mute with live on-key status, OBS,
  macros, single/double/triple-press per key
- **Profiles** — auto-saving layouts with up to 8 pages, shareable as one
  file, auto-switching per app, one-click templates
- **A plugin store** — crypto tickers, weather, clocks, Hue, Home
  Assistant, OBS… each drawing its own key face, with ask-first updates
  and release notes
- **In-app firmware updates** — flash the deck over USB in one click

Plugins don't just set labels — they own their keys:

![Plugin faces](images/app/plugin-faces.png){ .app-shot }

[Take the full app tour →](app/index.md){ .md-button }
[Browse the plugin directory →](plugins/index.md){ .md-button }

## Three open pieces, one repo

<div class="grid cards" markdown>

-   :material-chip:{ .lg .middle } __Hardware__

    ---

    KiCad PCB + Gerbers, OpenSCAD case + STLs, a complete BOM, and an
    illustrated 45-minute assembly. ~$100 in parts, no special tools.

    [:octicons-arrow-right-24: Parts list](getting-started/parts.md) ·
    [Assembly](build/assembly.md) ·
    [Design docs](hardware/index.md)

-   :material-flash:{ .lg .middle } __Firmware__

    ---

    ESP32-S3 Arduino firmware: USB HID + serial protocol, per-key LCDs,
    microSD animations, 8 pages, multi-tap — fully standalone.

    [:octicons-arrow-right-24: Flashing](firmware/flashing.md) ·
    [Serial protocol](firmware/protocol.md)

-   :material-puzzle:{ .lg .middle } __App & plugins__

    ---

    Tauri companion for macOS/Windows with a plugin store. Scaffold a
    plugin, hot-reload it, publish it to every user with a PR.

    [:octicons-arrow-right-24: App tour](app/index.md) ·
    [Developer center](plugins/develop.md)

</div>

## Key specs

| | |
|--|--|
| **Keys** | 6× Waveshare 0.85″ ScreenKey — 128×128 IPS + mechanical switch per key |
| **Pages** | up to 8 pages × 6 keys = 48 slots, switchable on-device |
| **Brain** | ESP32-S3 (16 MB flash, 8 MB PSRAM) on a custom 55×112 mm carrier PCB |
| **Host link** | USB-C → standard HID keyboard + serial config channel |
| **Media** | microSD icons/animations on-device, live faces streamed over USB |
| **Case** | 3D-printed deck + optional 25° stand, closed by 4 screws |
| **Cost** | ~$100 in parts ($66 = the six key modules) |

## Start here

- **I want to build one** → [Parts list](getting-started/parts.md) →
  [3D printing](getting-started/printing.md) → [Assembly](build/assembly.md)
- **I built one** → [Flash the firmware](firmware/flashing.md) → download
  the app above → plug in
- **I want to extend it** → [Write a plugin](plugins/develop.md) or talk
  [raw protocol](firmware/protocol.md)

!!! note "About the images"
    Hardware renders are from CAD; app images are real screenshots.
    Dimensions may shift once the first physical build is documented.

<script>
(function () {
  // Wire the download buttons to the newest release assets
  fetch('https://api.github.com/repos/vcazan/open-screen-deck/releases/latest')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.assets) return;
      function wire(id, test) {
        var asset = rel.assets.find(test);
        var a = document.getElementById(id);
        if (asset && a) a.href = asset.browser_download_url;
      }
      wire('dl-mac', function (a) { return /\.dmg$/i.test(a.name); });
      wire('dl-win', function (a) { return /\.(msi|exe)$/i.test(a.name); });
      var v = document.getElementById('dl-version');
      if (v && rel.tag_name) {
        v.textContent = rel.tag_name + ' · free & open source · deck works without the app too';
      }
    })
    .catch(function () {});
})();
</script>
