/**
 * World Clock — a real clock face. Press to flip between an ANALOG dial
 * and a DIGITAL view with the date. Ticks every 20 seconds.
 */

const state = new Map(); // slot → { view, timer, tz, city }

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

function zoneParts(tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    h: parseInt(get('hour'), 10) % 24,
    m: parseInt(get('minute'), 10),
    date: `${get('weekday')} ${get('day')} ${get('month')}`,
  };
}

function drawAnalog(s) {
  const [c, g] = face();
  const { h, m } = zoneParts(s.tz);
  const cx = 64, cy = 56, r = 38;
  const night = h >= 19 || h < 7;

  // dial
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = night ? '#0e1420' : '#1d2733';
  g.fill();
  g.strokeStyle = night ? '#31405a' : '#3d4c5e';
  g.lineWidth = 2;
  g.stroke();
  // hour ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5));
    g.lineTo(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1));
    g.strokeStyle = '#5a6774';
    g.lineWidth = i % 3 === 0 ? 2.5 : 1;
    g.stroke();
  }
  // hands
  const ha = ((h % 12) + m / 60) / 12 * Math.PI * 2 - Math.PI / 2;
  const ma = (m / 60) * Math.PI * 2 - Math.PI / 2;
  g.lineCap = 'round';
  g.strokeStyle = '#f2f5f7';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(ha) * (r - 18), cy + Math.sin(ha) * (r - 18));
  g.stroke();
  g.strokeStyle = '#2fd4c4';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(ma) * (r - 8), cy + Math.sin(ma) * (r - 8));
  g.stroke();
  g.fillStyle = '#f2f5f7';
  g.beginPath();
  g.arc(cx, cy, 2.5, 0, Math.PI * 2);
  g.fill();

  g.font = '700 13px system-ui';
  g.textAlign = 'center';
  g.fillText(s.city.toUpperCase().slice(0, 14), 64, 113);
  return c;
}

function drawDigital(s) {
  const [c, g] = face();
  const { h, m, date } = zoneParts(s.tz);
  g.fillStyle = '#2fd4c4';
  g.fillRect(0, 0, 128, 3);
  g.textAlign = 'center';
  g.fillStyle = '#7d8894';
  g.font = '700 12px system-ui';
  g.fillText(s.city.toUpperCase().slice(0, 14), 64, 26);
  g.fillStyle = '#f2f5f7';
  g.font = '700 38px system-ui';
  g.fillText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, 64, 76);
  g.fillStyle = '#8d99a6';
  g.font = '600 13px system-ui';
  g.fillText(date, 64, 100);
  return c;
}

const DRAW = [drawAnalog, drawDigital];

export function activate(api) {
  api.onDispose(() => {
    state.forEach((s) => s.timer && clearInterval(s.timer));
    state.clear();
  });

  api.registerAction({
    type: 'clock',
    label: 'City clock',
    hint: 'A live clock face — press to flip analog ↔ digital.',
    fields: [
      { key: 'tz', label: 'Timezone (IANA)', placeholder: 'Europe/London' },
      { key: 'city', label: 'Label', placeholder: 'London' },
      {
        key: 'style', label: 'Clock style', type: 'select', default: 'analog',
        options: [
          { value: 'analog', label: 'Analog dial' },
          { value: 'digital', label: 'Digital + date' },
        ],
      },
    ],
    async onAssign(settings, ctx) {
      const tz = (settings.tz || 'UTC').trim();
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
      } catch {
        ctx.log(`unknown timezone "${tz}" — use IANA names like America/New_York`);
        return;
      }
      const s = state.get(ctx.slot) ?? { view: 0 };
      s.view = settings.style === 'digital' ? 1 : 0;
      s.tz = tz;
      s.city = (settings.city || tz.split('/').pop() || 'UTC').replace(/_/g, ' ');
      state.set(ctx.slot, s);
      await ctx.setKeyImage(DRAW[s.view](s)); // persistent — shows standalone
      if (s.timer) clearInterval(s.timer);
      s.timer = setInterval(() => {
        ctx.paintFace(DRAW[s.view](s)).catch(() => {});
      }, 20_000);
      ctx.log(`clock on key: ${s.city} (${tz})`);
    },
    async execute(settings, ctx) {
      let s = state.get(ctx.slot);
      if (!s || !s.tz) {
        // Not assigned through the inspector (e.g. profile import) — set up now
        await this.onAssign(settings, ctx);
        s = state.get(ctx.slot);
        if (!s) return;
      }
      s.view = (s.view + 1) % DRAW.length;
      await ctx.paintFace(DRAW[s.view](s));
      ctx.log(`view: ${s.view === 0 ? 'analog' : 'digital'}`);
    },
  });

  api.log('World Clock plugin ready');
}
