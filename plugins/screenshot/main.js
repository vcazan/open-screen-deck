/**
 * Screenshot — wraps macOS `screencapture`. Modes: screen (whole display),
 * area (crosshair selection), window (click a window). Saves to the
 * clipboard or a timestamped file in the folder you choose.
 */

export function activate(api) {
  api.registerAction({
    type: 'capture',
    label: 'Take screenshot',
    hint: 'screen / area / window — clipboard by default, or a folder path. Needs macOS Screen Recording permission.',
    fields: [
      { key: 'mode', label: 'Mode (screen/area/window)', placeholder: 'area' },
      { key: 'dest', label: 'Folder (blank = clipboard)', placeholder: '~/Desktop' },
    ],
    async execute(settings, ctx) {
      const mode = (settings.mode || 'area').toLowerCase();
      const flags = ['-x']; // no shutter sound
      if (mode.startsWith('a')) flags.push('-i');       // interactive area
      else if (mode.startsWith('w')) flags.push('-i', '-o'); // window pick
      // screen mode: no extra flag = full display

      const dest = (settings.dest || '').trim();
      let target;
      if (dest) {
        const stamp = '$(date +%Y-%m-%d_%H.%M.%S)';
        target = `"${dest.replace(/\/+$/, '')}/deck-shot_${stamp}.png"`;
      } else {
        flags.push('-c'); // clipboard
        target = '';
      }

      await ctx.shell(`screencapture ${flags.join(' ')} ${target}`.trim());
      ctx.log(`screenshot: ${mode} → ${dest || 'clipboard'}`);
    },
  });

  api.log('Screenshot plugin ready');
}
