# Companion Plugins

Plugins add new **action types** to the companion app. Each plugin is a
folder with a `manifest.json` and an ES module:

```
plugins/
└── my-plugin/
    ├── manifest.json   {"id":"my-plugin","name":"My Plugin","version":"1.0.0","main":"main.js","icon":"icon.svg"}
    ├── icon.svg        shown in the store, installed list, and action editor
    └── main.js         export function activate(api) { … }
```

The icon should say what the plugin *does* at a glance — a bitcoin glyph
for a ticker, a bulb for lights. Any square SVG works; the bundled
plugins use [Material Design Icons](https://pictogrammers.com/library/mdi/)
paths on a rounded dark tile (see any `icon.svg` here for the template).

## Install — the store

**Settings → Plugins** in the companion app browses this repo's
[`registry.json`](registry.json) and installs plugins with one click.
Updates show up automatically when a registry entry's version is newer
than what's installed.

Manual install also works: copy a plugin folder into the plugin directory
(Settings → Plugins → Developer shows the path, with an *Open plugin
folder* button) and hit **Reload plugins**:

| OS | Path |
|----|------|
| macOS | `~/Library/Application Support/com.openscreendeck.companion/plugins/` |
| Windows | `%APPDATA%\com.openscreendeck.companion\plugins\` |

Installed actions appear in the key inspector's action picker under
**Plugins**.

## Develop

Settings → Plugins → **Developer → Create** scaffolds a working plugin
(manifest + a live Hello action) and opens its folder. Edit `main.js`,
hit **Reload plugins**, press your key — that's the whole loop.

## Publish

1. PR your plugin folder into `plugins/`
2. Add an entry to [`registry.json`](registry.json) (id, name, version,
   description, `base` raw URL, `files` list — include `icon.svg` in
   `files` and set `"icon": "icon.svg"` so the store shows your icon)
3. Once merged, every user's store lists it on refresh

### Shipping updates

Bump `version` in both `manifest.json` and the registry entry, and add a
line to the registry entry's `changelog`:

```json
"changelog": {
  "2.1.0": "New store icon so you can spot the plugin at a glance.",
  "2.0.0": "Fully drawn ticker faces: press to cycle Price, Trend, Graph."
}
```

Users with an older version get an in-app prompt showing your release
notes — nothing installs until they say yes. Write the note for the
person deciding whether to update: what changed, in one line per version.

Community registries are supported too — the registry URL is configurable
in the Developer section, so you can host your own index anywhere.

## API

```js
export function activate(api) {
  api.registerAction({
    type: 'my-action',            // unique within the plugin
    label: 'My action',           // shown in the picker
    hint: 'One-line description',
    fields: [                     // settings + customization UI, stored per key
      { key: 'url', label: 'URL', placeholder: 'https://…' },        // text (default)
      { key: 'view', label: 'Starting view', type: 'select',          // dropdown
        default: 'price',
        options: [
          { value: 'price', label: 'Price' },
          { value: 'graph', label: 'Graph' },
        ] },
      { key: 'accent', label: 'Accent color', type: 'color',          // swatch, "#rrggbb"
        default: '#2fd4c4' },
      { key: 'loud', label: 'Play loud', type: 'toggle', default: '' }, // "yes" / ""
    ],
    // Runs when the action is assigned to a key (and when its settings
    // change). Plugin keys OWN their look — paint a branded face here.
    async onAssign(settings, ctx) {
      const canvas = drawMyFace(settings);       // any 128×128 canvas
      await ctx.setKeyImage(canvas);             // persistent (survives reboot,
    },                                           //   shows standalone)
    async execute(settings, ctx) {
      ctx.log('pressed!');                       // protocol console
      await ctx.paintFace(drawLiveFace());       // stream a live frame
                                                 //   (fast, no SD wear)
      const res = await ctx.fetch(settings.url); // HTTP via Rust — reaches
                                                 //   plain-http/LAN targets
      await ctx.shell('say hello');              // run a shell command
      await ctx.hotkey('cmd+shift+4');           // press a hotkey chord
      ctx.setKeyFace(ctx.slot, {                 // simple text face (legacy)
        label: 'HI', sublabel: 'from plugin', bg: 0x1c73,
      });
    },
  });

  // Plugin-level settings (connections, API keys) — global, not per-key.
  // They appear on the plugin's detail page; `apply` runs with stored
  // values on load and whenever the user saves.
  api.registerSettings(
    [{ key: 'host', label: 'Server address', placeholder: '127.0.0.1' }],
    (values) => reconnect(values.host),
  );

  // Live plugins (clocks, tickers, audio) must clean up on hot reload:
  api.onDispose(() => clearInterval(myTimer));
}
```

OBS plugins get `ctx.obs(requestType, requestData?)` — a bridge to the
app's shared obs-websocket v5 connection (see `obs-control`, which also
manages that connection through its settings).

`ctx.slot` is the global key slot (page × 6 + position) that fired.
A plugin can call `registerAction` several times to contribute a family
of actions (see `zoom-control` and `system-actions`).

### Custom faces

Plugins draw their keys with regular canvas 2D, 128×128:

- **`ctx.setKeyImage(canvas)`** — persists the face to the device
  (`SET_IMAGE`). Use it in `onAssign` for your branded resting face; it
  survives reboots and shows even without the app running. When the key's
  action is later changed away from your plugin, the app removes it.
- **`ctx.paintFace(canvas)`** — streams a draw-only frame (`SET_FACE`).
  Use it for live data: prices, clocks, progress rings, status feedback.
  Never touches flash/SD, so it's safe at a few fps.
- Transparent pixels in either take on the key's background color.

While a plugin action is assigned, the inspector's appearance / icon /
animation editors step aside — the plugin owns the face. Press-cycled
views are a nice pattern: keep a per-slot view index and redraw on
`execute` (see `crypto-price` — price → trend → graph).

### Customization fields

Because your plugin owns the key's look, expose the choices users would
reach for: starting view, colors, units, capture modes. Declare them as
typed `fields` (`select` / `color` / `toggle` — see the API example) and
they render as native controls in the key inspector and on your plugin's
detail page. `onAssign` re-runs whenever settings change, so repaint from
`settings` and the face follows the user's choices live. Values are
always strings; `default` prefills new keys.

> **Trust model:** plugins run inside the app's webview with the same
> capabilities as the app itself — including shell access. Install only
> code you trust.

## Bundled plugins

| Plugin | Face | Press |
|--------|------|-------|
| [`obs-control/`](obs-control/) | OBS ring; scene keys track the live program scene | switch scene / toggle stream / record |
| [`crypto-price/`](crypto-price/) | drawn ticker: price / 24h trend / 7-day graph | cycles the three views |
| [`weather/`](weather/) | condition glyphs (sun/cloud/rain/snow/storm) + temp | flips Now ↔ Details |
| [`world-clock/`](world-clock/) | live analog dial or digital + date | flips analog ↔ digital |
| [`pomodoro/`](pomodoro/) | progress ring, teal focus → red break | start / cancel |
| [`soundboard/`](soundboard/) | speaker brand, animated equalizer while playing | play / stop |
| [`web-request/`](web-request/) | bolt brand → SENDING… → HTTP status (green/red) | fires the request |
| [`philips-hue/`](philips-hue/) | a bulb that glows when the light is on | toggles light/room |
| [`text-snippet/`](text-snippet/) | quote face with a snippet preview | types the text |
| [`zoom-control/`](zoom-control/) | mic / camera / raised-hand glyphs | Zoom global shortcuts |
| [`screenshot/`](screenshot/) | camera face, shutter flash on capture | takes the shot |
| [`system-actions/`](system-actions/) | lock / sleep / trash / moon glyphs | runs the action |
| [`home-assistant/`](home-assistant/) | HA house glyph, flashes with the result | fires the webhook |
