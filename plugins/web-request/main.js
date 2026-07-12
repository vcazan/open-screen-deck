/**
 * Web Request — the key face gives real feedback: SENDING… while in
 * flight, a green HTTP 200 (or red error) flash, then back to the
 * branded face. Works with IFTTT, n8n, Zapier, and any REST API.
 */

const reverts = new Map(); // slot → timeout

function face(top = '#1a2430') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, top);
  grad.addColorStop(1, '#0b0f13');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return [c, g];
}

function bolt(g, cx, cy, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx + 4, cy - 22);
  g.lineTo(cx - 14, cy + 4);
  g.lineTo(cx - 2, cy + 4);
  g.lineTo(cx - 4, cy + 22);
  g.lineTo(cx + 14, cy - 4);
  g.lineTo(cx + 2, cy - 4);
  g.closePath();
  g.fill();
}

function drawIdle(name, accent) {
  const [c, g] = face();
  bolt(g, 64, 48, accent || '#4c9ed8');
  g.fillStyle = '#f2f5f7';
  g.font = '700 14px system-ui';
  g.textAlign = 'center';
  g.fillText((name || 'WEBHOOK').toUpperCase().slice(0, 13), 64, 98);
  g.fillStyle = '#7d8894';
  g.font = '600 10px system-ui';
  g.fillText('PRESS TO SEND', 64, 113);
  return c;
}

function drawStatus(name, text, color) {
  const [c, g] = face();
  bolt(g, 64, 44, color);
  g.fillStyle = color;
  g.font = '700 22px system-ui';
  g.textAlign = 'center';
  g.fillText(text, 64, 92);
  g.fillStyle = '#8d99a6';
  g.font = '600 10px system-ui';
  g.fillText((name || 'WEBHOOK').toUpperCase().slice(0, 13), 64, 111);
  return c;
}

export function activate(api) {
  api.onDispose(() => {
    reverts.forEach((t) => clearTimeout(t));
    reverts.clear();
  });

  api.registerAction({
    type: 'request',
    label: 'HTTP request',
    hint: 'The face shows sending → status. Green = 2xx, red = anything else.',
    fields: [
      { key: 'url', label: 'URL', placeholder: 'https://example.com/hook' },
      { key: 'name', label: 'Name on the key', placeholder: 'DEPLOY' },
      {
        key: 'method', label: 'Method', type: 'select', default: 'POST',
        options: [
          { value: 'GET', label: 'GET' },
          { value: 'POST', label: 'POST' },
          { value: 'PUT', label: 'PUT' },
          { value: 'DELETE', label: 'DELETE' },
        ],
      },
      { key: 'accent', label: 'Key accent color', type: 'color', default: '#4c9ed8' },
      { key: 'body', label: 'Body (optional)', placeholder: '{"pressed":true}' },
      { key: 'headers', label: 'Headers JSON (optional)', placeholder: '{"Authorization":"Bearer …"}' },
    ],
    async onAssign(settings, ctx) {
      await ctx.setKeyImage(drawIdle(settings.name, settings.accent));
    },
    async execute(settings, ctx) {
      if (!settings.url) {
        ctx.log('set a URL first');
        return;
      }
      if (reverts.has(ctx.slot)) clearTimeout(reverts.get(ctx.slot));
      await ctx.paintFace(drawStatus(settings.name, 'SENDING…', '#e0a52f'));

      const method = (settings.method || 'POST').toUpperCase();
      let headers = { 'Content-Type': 'application/json' };
      if (settings.headers) {
        try {
          headers = { ...headers, ...JSON.parse(settings.headers) };
        } catch {
          ctx.log('headers are not valid JSON — sending without them');
        }
      }

      let text, color;
      try {
        const res = await ctx.fetch(settings.url, {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' ? undefined : settings.body || undefined,
        });
        text = `HTTP ${res.status}`;
        color = res.ok ? '#2fd47c' : '#e05252';
        ctx.log(`${method} ${settings.url} → HTTP ${res.status}`);
      } catch (err) {
        text = 'FAILED';
        color = '#e05252';
        ctx.log(`${method} ${settings.url} failed: ${err}`);
      }

      await ctx.paintFace(drawStatus(settings.name, text, color));
      reverts.set(
        ctx.slot,
        setTimeout(() => {
          reverts.delete(ctx.slot);
          ctx.paintFace(drawIdle(settings.name, settings.accent)).catch(() => {});
        }, 2500),
      );
    },
  });

  api.log('Web Request plugin ready');
}
