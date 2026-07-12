/**
 * Home Assistant — fires a webhook automation. The key wears the HA
 * house-hexagon and flashes green/red with the webhook result.
 */

function brandFace(drawGlyph, title, caption, accent) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#161c23');
  grad.addColorStop(1, '#0b0f13');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = accent;
  g.fillRect(0, 0, 128, 3);
  drawGlyph(g);
  g.fillStyle = '#f2f5f7';
  g.font = '700 13px system-ui';
  g.textAlign = 'center';
  g.fillText(title.toUpperCase().slice(0, 14), 64, 100);
  g.fillStyle = '#7d8894';
  g.font = '600 10px system-ui';
  g.fillText(caption.toUpperCase(), 64, 115);
  return c;
}

function houseGlyph(g, color = '#41bdf5') {
  g.strokeStyle = g.fillStyle = color;
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(64, 26);
  g.lineTo(94, 52);
  g.lineTo(94, 78);
  g.lineTo(34, 78);
  g.lineTo(34, 52);
  g.closePath();
  g.stroke();
  g.beginPath();
  g.arc(64, 58, 8, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(64, 58);
  g.lineTo(64, 78);
  g.stroke();
}

export function activate(api) {
  api.registerAction({
    type: 'webhook',
    label: 'HA webhook',
    hint: 'POSTs to your Home Assistant webhook — pair it with a webhook-triggered automation.',
    fields: [
      { key: 'base', label: 'Home Assistant URL', placeholder: 'http://homeassistant.local:8123' },
      { key: 'id', label: 'Webhook ID', placeholder: 'deck_lights_toggle' },
      { key: 'name', label: 'Name on the key', placeholder: 'LIGHTS' },
      { key: 'payload', label: 'JSON payload (optional)', placeholder: '{"room":"office"}' },
    ],
    async onAssign(settings, ctx) {
      await ctx.setKeyImage(
        brandFace(houseGlyph, settings.name || settings.id || 'webhook', 'home assistant', '#41bdf5'),
      );
    },
    async execute(settings, ctx) {
      const base = (settings.base || '').replace(/\/+$/, '');
      if (!base || !settings.id) {
        ctx.log('set the Home Assistant URL and webhook ID first');
        return;
      }
      const res = await ctx.fetch(`${base}/api/webhook/${settings.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: settings.payload || '{}',
      });
      const ok = res.ok;
      await ctx.paintFace(
        brandFace((g) => houseGlyph(g, ok ? '#2fd47c' : '#e05252'),
          settings.name || settings.id, ok ? 'sent' : `http ${res.status}`, ok ? '#2fd47c' : '#e05252'),
      );
      setTimeout(() => {
        ctx.paintFace(
          brandFace(houseGlyph, settings.name || settings.id, 'home assistant', '#41bdf5'),
        ).catch(() => {});
      }, 2000);
      ctx.log(`webhook ${settings.id} → HTTP ${res.status}`);
    },
  });

  api.log('Home Assistant plugin ready');
}
