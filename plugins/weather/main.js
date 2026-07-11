/**
 * Weather plugin — shows the current temperature on the key face using the
 * free Open-Meteo API (no key required). Press once to start live updates
 * (every 10 minutes); press again to refresh immediately.
 */

const WMO = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
  61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 73: 'Snow',
  75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Showers',
  95: 'Storm', 96: 'Storm', 99: 'Storm',
};

const timers = new Map(); // slot → interval

export function activate(api) {
  api.onDispose(() => {
    timers.forEach((t) => clearInterval(t));
    timers.clear();
  });

  api.registerAction({
    type: 'temperature',
    label: 'Temperature',
    hint: 'Current temperature on the key face. Press to refresh; auto-updates every 10 min.',
    fields: [
      { key: 'lat', label: 'Latitude', placeholder: '43.65' },
      { key: 'lon', label: 'Longitude', placeholder: '-79.38' },
      { key: 'unit', label: 'Unit (c or f)', placeholder: 'c' },
    ],
    async execute(settings, ctx) {
      const lat = parseFloat(settings.lat);
      const lon = parseFloat(settings.lon);
      if (isNaN(lat) || isNaN(lon)) {
        ctx.log('weather: set latitude and longitude first');
        return;
      }
      const fahrenheit = (settings.unit || 'c').toLowerCase().startsWith('f');

      const refresh = async () => {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current_weather=true${fahrenheit ? '&temperature_unit=fahrenheit' : ''}`;
        const res = await ctx.fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
        const data = res.json();
        const cw = data.current_weather;
        const temp = Math.round(cw.temperature);
        const sky = WMO[cw.weathercode] ?? '';
        ctx.setKeyFace(ctx.slot, {
          label: `${temp}°${fahrenheit ? 'F' : 'C'}`,
          sublabel: sky,
          bg: temp >= (fahrenheit ? 77 : 25) ? 0xc2e0 : temp <= (fahrenheit ? 32 : 0) ? 0x2bda : 0x1c73,
        });
        ctx.log(`weather: ${temp}°${fahrenheit ? 'F' : 'C'} ${sky}`);
      };

      await refresh();
      if (!timers.has(ctx.slot)) {
        timers.set(ctx.slot, setInterval(() => refresh().catch(() => {}), 10 * 60_000));
      }
    },
  });

  api.log('Weather plugin ready');
}
