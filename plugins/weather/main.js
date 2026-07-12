/**
 * Weather — a drawn weather face, not a text label. Two views, cycled by
 * pressing the key:
 *   1. NOW     — temperature + drawn condition glyph (sun/cloud/rain/snow/storm)
 *   2. DETAILS — feels-like, wind, humidity
 * Data: Open-Meteo (keyless). Auto-refreshes every 10 minutes.
 */

const state = new Map(); // slot → { view, data, fetchedAt, timer }
const VIEWS = ['now', 'details'];

function face() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#17202b');
  grad.addColorStop(1, '#0b0f13');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return [c, g];
}

// wmo code → kind
function kindOf(code) {
  if (code === 0 || code === 1) return 'sun';
  if (code === 2 || code === 3 || code === 45 || code === 48) return 'cloud';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

function drawGlyph(g, kind, cx, cy) {
  g.save();
  g.translate(cx, cy);
  g.lineWidth = 3;
  g.lineCap = 'round';
  if (kind === 'sun') {
    g.strokeStyle = g.fillStyle = '#f2c94c';
    g.beginPath();
    g.arc(0, 0, 12, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * 17, Math.sin(a) * 17);
      g.lineTo(Math.cos(a) * 23, Math.sin(a) * 23);
      g.stroke();
    }
  } else {
    // cloud body (shared by cloud/rain/snow/storm)
    g.fillStyle = '#aeb9c5';
    g.beginPath();
    g.arc(-10, 2, 11, 0, Math.PI * 2);
    g.arc(4, -4, 13, 0, Math.PI * 2);
    g.arc(14, 4, 9, 0, Math.PI * 2);
    g.rect(-16, 2, 36, 11);
    g.fill();
    if (kind === 'rain') {
      g.strokeStyle = '#5aa7e0';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-8 + i * 10, 18);
        g.lineTo(-11 + i * 10, 26);
        g.stroke();
      }
    } else if (kind === 'snow') {
      g.fillStyle = '#e8f2fa';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(-8 + i * 10, 22, 2.4, 0, Math.PI * 2);
        g.fill();
      }
    } else if (kind === 'storm') {
      g.fillStyle = '#f2c94c';
      g.beginPath();
      g.moveTo(0, 14); g.lineTo(-7, 26); g.lineTo(-1, 26); g.lineTo(-4, 35);
      g.lineTo(6, 23); g.lineTo(0, 23);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
}

function dots(g, active) {
  for (let i = 0; i < 2; i++) {
    g.fillStyle = i === active ? '#2fd4c4' : '#3a4450';
    g.beginPath();
    g.arc(58 + i * 12, 122, 2.4, 0, Math.PI * 2);
    g.fill();
  }
}

function drawNow(s) {
  const [c, g] = face();
  drawGlyph(g, kindOf(s.data.code), 64, 38);
  g.fillStyle = '#f2f5f7';
  g.font = '700 32px system-ui';
  g.textAlign = 'center';
  g.fillText(`${Math.round(s.data.temp)}°${s.data.unit}`, 64, 94);
  g.fillStyle = '#8d99a6';
  g.font = '600 11px system-ui';
  g.fillText(s.data.sky.toUpperCase(), 64, 111);
  dots(g, 0);
  return c;
}

function drawDetails(s) {
  const [c, g] = face();
  g.textAlign = 'left';
  const rows = [
    ['FEELS', `${Math.round(s.data.feels)}°${s.data.unit}`],
    ['WIND', `${Math.round(s.data.wind)} km/h`],
    ['HUMID', `${Math.round(s.data.humidity)}%`],
  ];
  rows.forEach(([k, v], i) => {
    const y = 34 + i * 28;
    g.fillStyle = '#7d8894';
    g.font = '700 11px system-ui';
    g.fillText(k, 14, y);
    g.fillStyle = '#f2f5f7';
    g.font = '700 17px system-ui';
    g.textAlign = 'right';
    g.fillText(v, 114, y);
    g.textAlign = 'left';
  });
  g.fillStyle = '#3a4450';
  g.fillRect(14, 100, 100, 1);
  dots(g, 1);
  return c;
}

const WMO = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog',
  48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain',
  65: 'Heavy rain', 71: 'Snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers',
  81: 'Showers', 82: 'Showers', 95: 'Storm', 96: 'Storm', 99: 'Storm',
};
const DRAW = { now: drawNow, details: drawDetails };

async function refresh(slot, settings, ctx, persist = false) {
  const lat = parseFloat(settings.lat);
  const lon = parseFloat(settings.lon);
  if (isNaN(lat) || isNaN(lon)) throw new Error('set latitude and longitude first');
  const f = (settings.unit || 'c').toLowerCase().startsWith('f');
  const res = await ctx.fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
      (f ? '&temperature_unit=fahrenheit' : ''),
  );
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const cur = res.json().current;
  const s = state.get(slot) ?? { view: settings.view === 'details' ? 1 : 0 };
  s.data = {
    temp: cur.temperature_2m,
    feels: cur.apparent_temperature,
    humidity: cur.relative_humidity_2m,
    wind: cur.wind_speed_10m,
    code: cur.weather_code,
    sky: WMO[cur.weather_code] ?? '',
    unit: f ? 'F' : 'C',
  };
  s.fetchedAt = Date.now();
  state.set(slot, s);
  const canvas = DRAW[VIEWS[s.view]](s);
  if (persist) await ctx.setKeyImage(canvas);
  else await ctx.paintFace(canvas);
  return s;
}

export function activate(api) {
  api.onDispose(() => {
    state.forEach((s) => s.timer && clearInterval(s.timer));
    state.clear();
  });

  api.registerAction({
    type: 'temperature',
    label: 'Weather',
    hint: 'Drawn weather face. Press to flip Now ↔ Details; refreshes every 10 min.',
    fields: [
      { key: 'lat', label: 'Latitude', placeholder: '43.65' },
      { key: 'lon', label: 'Longitude', placeholder: '-79.38' },
      {
        key: 'unit', label: 'Unit', type: 'select', default: 'c',
        options: [
          { value: 'c', label: 'Celsius' },
          { value: 'f', label: 'Fahrenheit' },
        ],
      },
      {
        key: 'view', label: 'Starting view', type: 'select', default: 'now',
        options: [
          { value: 'now', label: 'Now (temp + sky)' },
          { value: 'details', label: 'Details (wind, humidity)' },
        ],
      },
    ],
    async onAssign(settings, ctx) {
      const existing = state.get(ctx.slot);
      if (existing) existing.view = settings.view === 'details' ? 1 : 0;
      const s = await refresh(ctx.slot, settings, ctx, true);
      ctx.log(`weather on key: ${Math.round(s.data.temp)}°${s.data.unit} ${s.data.sky}`);
      if (!s.timer) {
        s.timer = setInterval(
          () => refresh(ctx.slot, settings, ctx).catch(() => {}),
          10 * 60_000,
        );
      }
    },
    async execute(settings, ctx) {
      const s = state.get(ctx.slot);
      if (!s || !s.data) {
        await refresh(ctx.slot, settings, ctx, true);
        return;
      }
      s.view = (s.view + 1) % VIEWS.length;
      await ctx.paintFace(DRAW[VIEWS[s.view]](s));
      if (Date.now() - s.fetchedAt > 10 * 60_000) {
        refresh(ctx.slot, settings, ctx).catch(() => {});
      }
    },
  });

  api.log('Weather plugin ready');
}
