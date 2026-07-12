/**
 * Zoom Control — branded mic / camera / hand keys that send Zoom's global
 * shortcuts to the zoom.us process, no need to focus Zoom first.
 * Needs Accessibility permission (same as hotkeys).
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

function micGlyph(g) {
  g.strokeStyle = g.fillStyle = '#4c9ed8';
  g.lineWidth = 4;
  g.lineCap = 'round';
  g.beginPath();
  g.roundRect(56, 26, 16, 30, 8);
  g.fill();
  g.beginPath();
  g.arc(64, 52, 15, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  g.beginPath();
  g.moveTo(64, 67);
  g.lineTo(64, 76);
  g.stroke();
}

function camGlyph(g) {
  g.fillStyle = '#4c9ed8';
  g.beginPath();
  g.roundRect(34, 34, 42, 32, 6);
  g.fill();
  g.beginPath();
  g.moveTo(80, 44);
  g.lineTo(96, 34);
  g.lineTo(96, 66);
  g.lineTo(80, 56);
  g.closePath();
  g.fill();
}

function handGlyph(g) {
  g.fillStyle = '#e0a52f';
  g.beginPath();
  // simple mitten hand
  g.roundRect(50, 30, 8, 32, 4);
  g.roundRect(60, 26, 8, 36, 4);
  g.roundRect(70, 30, 8, 32, 4);
  g.fill();
  g.beginPath();
  g.roundRect(46, 54, 36, 22, 10);
  g.fill();
}

function zoomKeystroke(key, modifiers) {
  const mods = modifiers.map((m) => `${m} down`).join(', ');
  return (
    `osascript -e "if application \\"zoom.us\\" is running then" ` +
    `-e "tell application \\"System Events\\" to tell process \\"zoom.us\\" to keystroke \\"${key}\\" using {${mods}}" ` +
    `-e "else" -e "error \\"Zoom is not running\\"" -e "end if"`
  );
}

export function activate(api) {
  const actions = [
    { type: 'mute', label: 'Toggle mute', key: 'a', mods: ['command', 'shift'], glyph: micGlyph, title: 'Zoom mic' },
    { type: 'video', label: 'Toggle video', key: 'v', mods: ['command', 'shift'], glyph: camGlyph, title: 'Zoom video' },
    { type: 'hand', label: 'Raise / lower hand', key: 'y', mods: ['option'], glyph: handGlyph, title: 'Raise hand' },
  ];

  for (const a of actions) {
    api.registerAction({
      type: a.type,
      label: `Zoom: ${a.label}`,
      hint: 'Sent straight to the Zoom app — no need to focus it first.',
      fields: [],
      async onAssign(_settings, ctx) {
        await ctx.setKeyImage(brandFace(a.glyph, a.title, a.label, '#4c9ed8'));
      },
      async execute(_settings, ctx) {
        await ctx.shell(zoomKeystroke(a.key, a.mods));
        ctx.log(`zoom: ${a.label.toLowerCase()}`);
      },
    });
  }

  api.log('Zoom Control plugin ready');
}
