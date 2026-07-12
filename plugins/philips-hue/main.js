/**
 * Philips Hue — the key IS the bulb: lit with a warm glow when on, dim
 * outline when off. Press to toggle a light or a whole room via the
 * bridge's local REST API (bridge link-button setup gives the username).
 */

function face() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#161c23');
  grad.addColorStop(1, '#0b0f13');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return [c, g];
}

function drawBulb(name, on, unknown = false) {
  const [c, g] = face();
  const cx = 64, cy = 46;
  if (on) {
    // warm glow
    const glow = g.createRadialGradient(cx, cy, 6, cx, cy, 44);
    glow.addColorStop(0, 'rgba(255,214,110,0.55)');
    glow.addColorStop(1, 'rgba(255,214,110,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 128, 128);
  }
  // bulb glass
  g.beginPath();
  g.arc(cx, cy, 20, Math.PI * 0.85, Math.PI * 0.15);
  g.lineTo(cx + 11, cy + 26);
  g.lineTo(cx - 11, cy + 26);
  g.closePath();
  g.fillStyle = unknown ? '#2b3440' : on ? '#ffd66e' : '#222b36';
  g.fill();
  g.strokeStyle = on ? '#ffe9b8' : '#4a5666';
  g.lineWidth = 2.5;
  g.stroke();
  // base
  g.fillStyle = '#5a6774';
  g.beginPath();
  g.roundRect(cx - 9, cy + 28, 18, 10, 2);
  g.fill();

  g.fillStyle = '#f2f5f7';
  g.font = '700 13px system-ui';
  g.textAlign = 'center';
  g.fillText((name || 'HUE LIGHT').toUpperCase().slice(0, 14), 64, 104);
  g.fillStyle = unknown ? '#7d8894' : on ? '#ffd66e' : '#7d8894';
  g.font = '600 10px system-ui';
  g.fillText(unknown ? 'PRESS TO SYNC' : on ? 'ON' : 'OFF', 64, 118);
  return c;
}

export function activate(api) {
  api.registerAction({
    type: 'toggle',
    label: 'Toggle light',
    hint: 'The key is the bulb — glows when the light is on. Press to toggle.',
    fields: [
      { key: 'bridge', label: 'Bridge IP', placeholder: '192.168.1.42' },
      { key: 'username', label: 'API username', placeholder: 'from the bridge link-button setup' },
      { key: 'id', label: 'Light / group id', placeholder: '1' },
      { key: 'group', label: 'This id is a room / group', type: 'toggle', default: '' },
      { key: 'name', label: 'Name on the key', placeholder: 'DESK LAMP' },
    ],
    async onAssign(settings, ctx) {
      await ctx.setKeyImage(drawBulb(settings.name, false, true));
    },
    async execute(settings, ctx) {
      const { bridge, username, id } = settings;
      if (!bridge || !username || !id) {
        ctx.log('set bridge IP, username, and light id first');
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

      const name = settings.name || info.name || `${kind}/${id}`;
      await ctx.paintFace(drawBulb(name, !on));
      ctx.log(`${name} → ${!on ? 'on' : 'off'}`);
    },
  });

  api.log('Philips Hue plugin ready');
}
