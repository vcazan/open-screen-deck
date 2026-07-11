/**
 * World Clock — press a key to turn it into a ticking clock for any IANA
 * timezone (Europe/London, Asia/Tokyo, …). Press again to stop it.
 */

const timers = new Map(); // slot → interval

export function activate(api) {
  api.onDispose(() => {
    timers.forEach((t) => clearInterval(t));
    timers.clear();
  });

  api.registerAction({
    type: 'clock',
    label: 'City clock',
    hint: 'Press to start a live clock for the timezone; press again to stop.',
    fields: [
      { key: 'tz', label: 'Timezone (IANA)', placeholder: 'Europe/London' },
      { key: 'city', label: 'Label', placeholder: 'London' },
    ],
    execute(settings, ctx) {
      const tz = (settings.tz || 'UTC').trim();
      const city = (settings.city || tz.split('/').pop() || 'UTC').slice(0, 15);

      if (timers.has(ctx.slot)) {
        clearInterval(timers.get(ctx.slot));
        timers.delete(ctx.slot);
        ctx.log(`clock stopped: ${city}`);
        return;
      }

      let fmt;
      try {
        fmt = new Intl.DateTimeFormat('en-GB', {
          timeZone: tz,
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        ctx.log(`unknown timezone "${tz}" — use IANA names like America/New_York`);
        return;
      }

      const tick = () => {
        ctx.setKeyFace(ctx.slot, { label: fmt.format(new Date()), sublabel: city, bg: 0x2965 });
      };
      tick();
      timers.set(ctx.slot, setInterval(tick, 30_000));
      ctx.log(`clock started: ${city} (${tz})`);
    },
  });

  api.log('World Clock plugin ready');
}
