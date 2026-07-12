/**
 * System Actions — branded keys for the desk-automation greatest hits:
 * lock screen, sleep displays, empty trash, toggle dark mode.
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

function lockGlyph(g) {
  g.fillStyle = '#e0a52f';
  g.beginPath();
  g.roundRect(44, 48, 40, 30, 6);
  g.fill();
  g.strokeStyle = '#e0a52f';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(64, 48, 13, Math.PI, 0);
  g.stroke();
}

function displayGlyph(g) {
  g.strokeStyle = '#7d8894';
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(34, 34, 60, 38, 5);
  g.stroke();
  g.beginPath();
  g.moveTo(54, 80);
  g.lineTo(74, 80);
  g.stroke();
  g.fillStyle = '#7d8894';
  g.font = '700 20px system-ui';
  g.textAlign = 'center';
  g.fillText('zZ', 64, 60);
}

function trashGlyph(g) {
  g.fillStyle = '#e05252';
  g.beginPath();
  g.moveTo(44, 44); g.lineTo(84, 44); g.lineTo(80, 80); g.lineTo(48, 80);
  g.closePath();
  g.fill();
  g.fillRect(40, 36, 48, 6);
  g.fillRect(56, 30, 16, 6);
}

function moonGlyph(g) {
  g.fillStyle = '#b48ce8';
  g.beginPath();
  g.arc(64, 54, 22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#12161c';
  g.beginPath();
  g.arc(74, 46, 20, 0, Math.PI * 2);
  g.fill();
}

export function activate(api) {
  const actions = [
    { type: 'lock', label: 'Lock screen', glyph: lockGlyph, accent: '#e0a52f',
      command: `osascript -e "tell application \\"System Events\\" to keystroke \\"q\\" using {control down, command down}"` },
    { type: 'sleep-displays', label: 'Sleep displays', glyph: displayGlyph, accent: '#7d8894',
      command: 'pmset displaysleepnow' },
    { type: 'empty-trash', label: 'Empty trash', glyph: trashGlyph, accent: '#e05252',
      command: `osascript -e "tell application \\"Finder\\" to empty trash"` },
    { type: 'dark-mode', label: 'Toggle dark mode', face: 'Dark mode', glyph: moonGlyph, accent: '#b48ce8',
      command: `osascript -e "tell application \\"System Events\\" to tell appearance preferences to set dark mode to not dark mode"` },
  ];

  for (const a of actions) {
    api.registerAction({
      type: a.type,
      label: a.label,
      hint: 'One press, no confirmation — the key face shows what it does.',
      fields: [],
      async onAssign(_settings, ctx) {
        await ctx.setKeyImage(brandFace(a.glyph, a.face || a.label, 'system', a.accent));
      },
      async execute(_settings, ctx) {
        await ctx.shell(a.command);
        ctx.log(a.label.toLowerCase());
      },
    });
  }

  api.log('System Actions plugin ready');
}
