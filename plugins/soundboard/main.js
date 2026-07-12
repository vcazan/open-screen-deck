/**
 * Soundboard — a branded speaker key that comes alive while playing:
 * animated equalizer bars at ~5 fps. Press to play, press again to stop.
 */

const playing = new Map(); // slot → { audio, animTimer }

function face() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#1d1626');
  grad.addColorStop(1, '#0d0b12');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return [c, g];
}

function speaker(g, cx, cy, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx - 18, cy - 8);
  g.lineTo(cx - 8, cy - 8);
  g.lineTo(cx + 4, cy - 18);
  g.lineTo(cx + 4, cy + 18);
  g.lineTo(cx - 8, cy + 8);
  g.lineTo(cx - 18, cy + 8);
  g.closePath();
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    g.beginPath();
    g.arc(cx + 6, cy, 10 + i * 8, -0.9, 0.9);
    g.stroke();
  }
}

function drawIdle(name, accent) {
  const [c, g] = face();
  speaker(g, 60, 52, accent || '#b48ce8');
  g.fillStyle = '#f2f5f7';
  g.font = '700 14px system-ui';
  g.textAlign = 'center';
  g.fillText((name || 'SOUND').toUpperCase().slice(0, 13), 64, 100);
  g.fillStyle = '#7d8894';
  g.font = '600 10px system-ui';
  g.fillText('PRESS TO PLAY', 64, 115);
  return c;
}

function drawPlaying(name, accent) {
  const [c, g] = face();
  // equalizer bars — random heights each frame = alive
  const bars = 7;
  for (let i = 0; i < bars; i++) {
    const h = 14 + Math.random() * 42;
    g.fillStyle = i % 2 ? (accent || '#b48ce8') : '#2fd4c4';
    g.beginPath();
    g.roundRect(20 + i * 13, 72 - h, 9, h, 3);
    g.fill();
  }
  g.fillStyle = '#f2f5f7';
  g.font = '700 14px system-ui';
  g.textAlign = 'center';
  g.fillText((name || 'SOUND').toUpperCase().slice(0, 13), 64, 100);
  g.fillStyle = '#2fd4c4';
  g.font = '600 10px system-ui';
  g.fillText('▶ PLAYING — PRESS TO STOP', 64, 115);
  return c;
}

function stop(slot, ctx, name, accent) {
  const p = playing.get(slot);
  if (!p) return;
  p.audio.pause();
  clearInterval(p.animTimer);
  playing.delete(slot);
  ctx.paintFace(drawIdle(name, accent)).catch(() => {});
}

export function activate(api) {
  api.onDispose(() => {
    playing.forEach((p) => {
      p.audio.pause();
      clearInterval(p.animTimer);
    });
    playing.clear();
  });

  api.registerAction({
    type: 'play',
    label: 'Play sound',
    hint: 'Branded speaker key — animated equalizer while playing. MP3/WAV/OGG by URL.',
    fields: [
      { key: 'url', label: 'Audio URL', placeholder: 'https://…/airhorn.mp3' },
      { key: 'name', label: 'Name on the key', placeholder: 'AIRHORN' },
      { key: 'volume', label: 'Volume 0–100', placeholder: '80' },
      { key: 'accent', label: 'Key accent color', type: 'color', default: '#b48ce8' },
    ],
    async onAssign(settings, ctx) {
      await ctx.setKeyImage(drawIdle(settings.name, settings.accent));
    },
    execute(settings, ctx) {
      if (playing.has(ctx.slot)) {
        stop(ctx.slot, ctx, settings.name, settings.accent);
        ctx.log('stopped');
        return;
      }
      if (!settings.url) {
        ctx.log('set an audio URL first');
        return;
      }
      const audio = new Audio(settings.url);
      const vol = parseInt(settings.volume, 10);
      audio.volume = isNaN(vol) ? 0.8 : Math.max(0, Math.min(100, vol)) / 100;
      audio.addEventListener('ended', () => stop(ctx.slot, ctx, settings.name, settings.accent));
      audio.addEventListener('error', () => {
        stop(ctx.slot, ctx, settings.name, settings.accent);
        ctx.log(`could not load ${settings.url}`);
      });
      void audio.play().then(
        () => {
          const animTimer = setInterval(() => {
            ctx.paintFace(drawPlaying(settings.name, settings.accent)).catch(() => {});
          }, 200);
          playing.set(ctx.slot, { audio, animTimer });
          ctx.log(`playing (volume ${Math.round(audio.volume * 100)}%)`);
        },
        (err) => ctx.log(`playback failed — ${err}`),
      );
    },
  });

  api.log('Soundboard plugin ready');
}
