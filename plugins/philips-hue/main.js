/**
 * Philips Hue — toggles a light or a room (group) via the bridge's local
 * REST API. Create an API user first: press the bridge's link button, then
 * POST {"devicetype":"osd"} to http://<bridge-ip>/api and copy the username.
 * The key face mirrors the light state (warm yellow = on).
 */

export function activate(api) {
  api.registerAction({
    type: 'toggle',
    label: 'Toggle light',
    hint: 'Flips a light (or a whole room) and mirrors its state on the key.',
    fields: [
      { key: 'bridge', label: 'Bridge IP', placeholder: '192.168.1.42' },
      { key: 'username', label: 'API username', placeholder: 'from the bridge link-button setup' },
      { key: 'id', label: 'Light / group id', placeholder: '1' },
      { key: 'group', label: 'Is a room? (yes/no)', placeholder: 'no' },
    ],
    async execute(settings, ctx) {
      const { bridge, username, id } = settings;
      if (!bridge || !username || !id) {
        ctx.log('hue: set bridge IP, username, and light id first');
        return;
      }
      const isGroup = (settings.group || '').toLowerCase().startsWith('y');
      const kind = isGroup ? 'groups' : 'lights';
      const base = `http://${bridge}/api/${username}/${kind}/${id}`;

      const stateRes = await ctx.fetch(base);
      if (!stateRes.ok) throw new Error(`bridge HTTP ${stateRes.status}`);
      const info = stateRes.json();
      if (Array.isArray(info) && info[0]?.error) {
        throw new Error(info[0].error.description);
      }
      const on = isGroup ? info.action?.on : info.state?.on;

      const putRes = await ctx.fetch(`${base}/${isGroup ? 'action' : 'state'}`, {
        method: 'PUT',
        body: JSON.stringify({ on: !on }),
      });
      if (!putRes.ok) throw new Error(`bridge HTTP ${putRes.status}`);

      const name = info.name || `${kind}/${id}`;
      ctx.setKeyFace(ctx.slot, {
        label: !on ? 'ON' : 'OFF',
        sublabel: String(name).slice(0, 15),
        bg: !on ? 0xe58c : 0x2965, // warm yellow when lit
      });
      ctx.log(`hue: ${name} → ${!on ? 'on' : 'off'}`);
    },
  });

  api.log('Philips Hue plugin ready');
}
