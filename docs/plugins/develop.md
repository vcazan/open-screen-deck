# Plugin Developer Center

Plugins add new **action types** to the companion app: a key can fetch a
price, toggle a light, fire a webhook — and draw its own face while doing
it. A plugin is a folder with a manifest, one ES module, and an icon:

```
my-plugin/
├── manifest.json   {"id":"my-plugin","name":"My Plugin","version":"1.0.0",
│                    "main":"main.js","icon":"icon.svg"}
├── icon.svg        shown in the store, installed list, and action picker
└── main.js         export function activate(api) { … }
```

## Zero to working plugin

1. Companion app → **Plugins → Developer → Create** — scaffolds a working
   plugin (manifest + icon + a live Hello action) and opens its folder
2. Edit `main.js`
3. **Reload plugins** — no app restart
4. Assign your action to a key and press it

That's the whole loop.

## The API

```js
export function activate(api) {
  api.registerAction({
    type: 'my-action',            // unique within the plugin
    label: 'My action',           // shown in the action picker
    hint: 'One-line description',
    fields: [                     // settings + customization UI, per key
      { key: 'url', label: 'URL', placeholder: 'https://…' },       // text
      { key: 'view', label: 'Starting view', type: 'select',
        default: 'price',
        options: [
          { value: 'price', label: 'Price' },
          { value: 'graph', label: 'Graph' },
        ] },
      { key: 'accent', label: 'Accent color', type: 'color',
        default: '#2fd4c4' },                                        // "#rrggbb"
      { key: 'loud', label: 'Play loud', type: 'toggle', default: '' }, // "yes"/""
    ],

    // Runs when the action is assigned to a key AND whenever its settings
    // change. Plugin keys own their look — paint the branded face here.
    async onAssign(settings, ctx) {
      await ctx.setKeyImage(drawMyFace(settings));  // persistent face
    },

    async execute(settings, ctx) {
      ctx.log('pressed!');                          // protocol console
      await ctx.paintFace(drawLiveFace());          // stream a live frame
      const res = await ctx.fetch(settings.url);    // HTTP via Rust
      await ctx.shell('say hello');                 // shell command
      await ctx.hotkey('cmd+shift+4');              // hotkey chord
      await ctx.obs('SetCurrentProgramScene',       // obs-websocket bridge
        { sceneName: 'Scene 1' });
    },
  });

  // Plugin-level settings (connections, API keys) — global, not per-key.
  // They appear on your plugin's detail page.
  api.registerSettings(
    [{ key: 'host', label: 'Server address', placeholder: '127.0.0.1' }],
    (values) => reconnect(values.host),
  );

  // Live plugins (clocks, tickers, audio) must clean up on hot reload:
  api.onDispose(() => clearInterval(myTimer));
}
```

`ctx.slot` is the global key slot that fired. A plugin can call
`registerAction` several times to contribute a family of actions.

!!! warning "Trust model"
    Plugins run inside the app's webview with the same capabilities as
    the app itself — including shell access. Users should install only
    code they trust; you should ask for nothing you don't need.

## Custom faces

Draw with regular canvas 2D at 128×128:

- **`ctx.setKeyImage(canvas)`** — persists the face to the device
  (`SET_IMAGE`). Use it in `onAssign` for your branded resting face; it
  survives reboots and shows even without the app running. When the key's
  action changes away from your plugin, the app removes it.
- **`ctx.paintFace(canvas)`** — streams a draw-only frame (`SET_FACE`).
  Use it for live data: prices, clocks, progress rings, status feedback.
  Never touches flash/SD, so it's safe at a few fps.
- Transparent pixels in either take on the key's background color.

While your action is assigned, the inspector hides its manual appearance
controls — your plugin owns the face. Patterns that work well:

- **Press-cycled views** — keep a per-slot view index, redraw on
  `execute` (crypto-price: price → trend → graph)
- **Status feedback** — paint "SENDING…", then the result, then revert
  (web-request, home-assistant)
- **Ambient animation** — an interval streaming frames while active
  (soundboard's equalizer, pomodoro's ring)

## Customization fields

Because your plugin owns the key's look, expose the choices users would
reach for — starting view, colors, units, modes. Declare them as typed
`fields` (`select` / `color` / `toggle`) and they render as native
controls in the key inspector **and** on your plugin's detail page (as
defaults for new keys). `onAssign` re-runs whenever settings change, so
repaint from `settings` and the face follows the user's choices live.
Values are always strings; `default` prefills new keys.

## Face previews

The plugin detail page renders **live previews** of your actions by
running `onAssign` in a sandbox (face writes are captured; shell/hotkeys
are inert). Keep `onAssign` side-effect-free beyond painting and you get
previews for free.

## Publishing to the store

1. PR your plugin folder into
   [`plugins/`](https://github.com/vcazan/open-screen-deck/tree/main/plugins)
2. Add an entry to `plugins/registry.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "you",
  "description": "What it does, in one sentence.",
  "base": "https://raw.githubusercontent.com/vcazan/open-screen-deck/main/plugins/my-plugin",
  "files": ["manifest.json", "main.js", "icon.svg"],
  "icon": "icon.svg",
  "changelog": { "1.0.0": "First release." }
}
```

Once merged, every user's store lists it on refresh — and this site's
[directory](index.md) picks it up automatically.

### Shipping updates

Bump `version` in both `manifest.json` and the registry entry, and add a
line to the registry `changelog`. Users with an older version get an
in-app prompt showing your release notes — nothing installs until they
say yes. Write the note for the person deciding whether to update.

## Reference: bundled plugins

The [bundled plugins](https://github.com/vcazan/open-screen-deck/tree/main/plugins)
are the API's living documentation:

| Read this | To learn |
|-----------|----------|
| `crypto-price` | press-cycled views, sparkline drawing, data caching |
| `world-clock` | analog canvas drawing, style customization field |
| `pomodoro` | progress ring, interval lifecycle, color fields |
| `soundboard` | audio, ambient animation while playing |
| `web-request` | status-feedback faces, `ctx.fetch` |
| `philips-hue` | LAN devices via the Rust HTTP proxy, toggle fields |
| `obs-control` | `ctx.obs` bridge + plugin-level connection settings |
| `zoom-control` / `system-actions` | multi-action families, `ctx.shell` |
