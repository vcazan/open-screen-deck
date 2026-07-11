# Companion Plugins

Plugins add new **action types** to the companion app. Each plugin is a
folder with a `manifest.json` and an ES module:

```
plugins/
└── my-plugin/
    ├── manifest.json   {"id":"my-plugin","name":"My Plugin","version":"1.0.0","main":"main.js"}
    └── main.js         export function activate(api) { … }
```

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
   description, `base` raw URL, `files` list)
3. Once merged, every user's store lists it on refresh

Community registries are supported too — the registry URL is configurable
in the Developer section, so you can host your own index anywhere.

## API

```js
export function activate(api) {
  api.registerAction({
    type: 'my-action',            // unique within the plugin
    label: 'My action',           // shown in the picker
    hint: 'One-line description',
    fields: [                     // settings UI, stored per key
      { key: 'url', label: 'URL', placeholder: 'https://…' },
    ],
    async execute(settings, ctx) {
      ctx.log('pressed!');                       // protocol console
      ctx.setKeyFace(ctx.slot, {                 // paint the key
        label: 'HI', sublabel: 'from plugin', bg: 0x1c73,
      });
      await fetch(settings.url);                 // full webview reach
    },
  });
}
```

`ctx.slot` is the global key slot (page × 6 + position) that fired.

> **Trust model:** plugins run inside the app's webview with the same
> capabilities as the app itself. Install only code you trust.

## Reference plugins

- [`home-assistant/`](home-assistant/) — fire HA webhooks from keys
- [`pomodoro/`](pomodoro/) — a pomodoro timer that lives on a key face
