/**
 * Screenshot — a camera key that flashes when it fires. Wraps macOS
 * `screencapture`: screen / area / window, to clipboard or a folder.
 * Needs macOS Screen Recording permission.
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

function cameraGlyph(g, flash = false) {
  if (flash) {
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(0, 0, 128, 128);
    return;
  }
  g.fillStyle = '#8fd4a8';
  g.beginPath();
  g.roundRect(32, 36, 64, 42, 8);
  g.fill();
  g.fillStyle = '#0f141a';
  g.beginPath();
  g.arc(64, 57, 13, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8fd4a8';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(64, 57, 6, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#8fd4a8';
  g.beginPath();
  g.roundRect(50, 28, 28, 10, 3);
  g.fill();
}

export function activate(api) {
  api.registerAction({
    type: 'capture',
    label: 'Take screenshot',
    hint: 'screen / area / window — clipboard by default, or a folder path. Needs macOS Screen Recording permission.',
    fields: [
      {
        key: 'mode', label: 'Capture', type: 'select', default: 'area',
        options: [
          { value: 'area', label: 'Select an area' },
          { value: 'window', label: 'Pick a window' },
          { value: 'screen', label: 'Whole screen' },
        ],
      },
      { key: 'dest', label: 'Folder (blank = clipboard)', placeholder: '~/Desktop' },
    ],
    async onAssign(settings, ctx) {
      const mode = (settings.mode || 'area').toLowerCase();
      await ctx.setKeyImage(brandFace((g) => cameraGlyph(g), 'screenshot', mode, '#8fd4a8'));
    },
    async execute(settings, ctx) {
      const mode = (settings.mode || 'area').toLowerCase();
      const flags = ['-x'];
      if (mode.startsWith('a')) flags.push('-i');
      else if (mode.startsWith('w')) flags.push('-i', '-o');

      const dest = (settings.dest || '').trim();
      let target = '';
      if (dest) {
        const stamp = '$(date +%Y-%m-%d_%H.%M.%S)';
        target = `"${dest.replace(/\/+$/, '')}/deck-shot_${stamp}.png"`;
      } else {
        flags.push('-c');
      }

      // shutter flash
      await ctx.paintFace(brandFace((g) => cameraGlyph(g, true), '', '', '#8fd4a8'));
      await ctx.shell(`screencapture ${flags.join(' ')} ${target}`.trim());
      setTimeout(() => {
        ctx.paintFace(brandFace((g) => cameraGlyph(g), 'screenshot', mode, '#8fd4a8')).catch(() => {});
      }, 350);
      ctx.log(`screenshot: ${mode} → ${dest || 'clipboard'}`);
    },
  });

  api.log('Screenshot plugin ready');
}
