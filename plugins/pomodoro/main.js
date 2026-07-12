/**
 * Pomodoro — a progress ring that lives on the key. The arc empties as
 * focus time runs down (teal), flips to the break (red), then rests.
 * Press to start, press again to cancel.
 */

const sessions = new Map(); // slot → interval

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

function drawRing(mmss, phase, fraction, color) {
  const [c, g] = face();
  const cx = 64, cy = 58, r = 40;
  // track
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.strokeStyle = '#252d38';
  g.lineWidth = 8;
  g.stroke();
  // remaining arc
  if (fraction > 0) {
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + fraction * Math.PI * 2);
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.stroke();
  }
  g.fillStyle = '#f2f5f7';
  g.font = '700 24px system-ui';
  g.textAlign = 'center';
  g.fillText(mmss, cx, cy + 8);
  g.fillStyle = '#7d8894';
  g.font = '700 11px system-ui';
  g.fillText(phase.toUpperCase(), 64, 116);
  return c;
}

function drawIdle() {
  return drawRing('25:00', 'press to focus', 1, '#3a4450');
}

function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function activate(api) {
  api.onDispose(() => {
    sessions.forEach((t) => clearInterval(t));
    sessions.clear();
  });

  api.registerAction({
    type: 'timer',
    label: 'Pomodoro',
    hint: 'A progress ring on the key. Press to start a session; press again to cancel.',
    fields: [
      { key: 'minutes', label: 'Focus minutes', placeholder: '25' },
      { key: 'breakMinutes', label: 'Break minutes', placeholder: '5' },
      { key: 'focusColor', label: 'Focus ring color', type: 'color', default: '#2fd4c4' },
      { key: 'breakColor', label: 'Break ring color', type: 'color', default: '#e05252' },
    ],
    async onAssign(settings, ctx) {
      const min = parseInt(settings.minutes, 10) || 25;
      await ctx.setKeyImage(drawRing(`${min}:00`, 'press to focus', 1, '#3a4450'));
    },
    execute(settings, ctx) {
      if (sessions.has(ctx.slot)) {
        clearInterval(sessions.get(ctx.slot));
        sessions.delete(ctx.slot);
        ctx.paintFace(drawIdle()).catch(() => {});
        ctx.log('pomodoro cancelled');
        return;
      }
      const focusMs = (parseInt(settings.minutes, 10) || 25) * 60_000;
      const breakMs = (parseInt(settings.breakMinutes, 10) || 5) * 60_000;
      const focusColor = settings.focusColor || '#2fd4c4';
      const breakColor = settings.breakColor || '#e05252';
      const start = Date.now();
      ctx.log(`pomodoro started: ${Math.round(focusMs / 60000)}m focus`);

      const tick = () => {
        const elapsed = Date.now() - start;
        if (elapsed < focusMs) {
          const left = focusMs - elapsed;
          ctx.paintFace(drawRing(mmss(left), 'focus', left / focusMs, focusColor)).catch(() => {});
        } else if (elapsed < focusMs + breakMs) {
          const left = focusMs + breakMs - elapsed;
          ctx.paintFace(drawRing(mmss(left), 'break', left / breakMs, breakColor)).catch(() => {});
        } else {
          clearInterval(sessions.get(ctx.slot));
          sessions.delete(ctx.slot);
          ctx.paintFace(drawRing('DONE', 'nice work', 1, '#2fd47c')).catch(() => {});
          ctx.log('pomodoro complete');
        }
      };
      tick();
      sessions.set(ctx.slot, setInterval(tick, 1000));
    },
  });

  api.log('Pomodoro plugin ready');
}
