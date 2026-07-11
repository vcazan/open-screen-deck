/**
 * Pomodoro plugin for Open Screen Deck — press the key to start a focus
 * session; the key face counts down and flips red on break time.
 *
 * Install: copy this folder into <app data>/plugins/pomodoro/ and restart
 * the companion.
 */

const GREEN = 0x1ce9;
const RED = 0xc186;
const GRAY = 0x2965;

// One timer per key slot
const sessions = new Map();

export function activate(api) {
  api.registerAction({
    type: 'timer',
    label: 'Pomodoro',
    hint: 'Press to start a focus session on this key; press again to cancel.',
    fields: [
      { key: 'minutes', label: 'Focus minutes', placeholder: '25' },
      { key: 'breakMinutes', label: 'Break minutes', placeholder: '5' },
    ],
    execute(settings, ctx) {
      const slot = ctx.slot;
      const existing = sessions.get(slot);
      if (existing) {
        clearInterval(existing);
        sessions.delete(slot);
        ctx.setKeyFace(slot, { label: 'FOCUS', sublabel: 'Pomodoro', bg: GRAY });
        ctx.log('pomodoro cancelled');
        return;
      }

      const focusMs = (parseInt(settings.minutes, 10) || 25) * 60_000;
      const breakMs = (parseInt(settings.breakMinutes, 10) || 5) * 60_000;
      const start = Date.now();
      ctx.log(`pomodoro started: ${Math.round(focusMs / 60000)}m focus`);

      const tick = () => {
        const elapsed = Date.now() - start;
        if (elapsed < focusMs) {
          const left = focusMs - elapsed;
          const mm = Math.floor(left / 60000);
          const ss = Math.floor((left % 60000) / 1000);
          ctx.setKeyFace(slot, {
            label: `${mm}:${String(ss).padStart(2, '0')}`,
            sublabel: 'Focus',
            bg: GREEN,
          });
        } else if (elapsed < focusMs + breakMs) {
          const left = focusMs + breakMs - elapsed;
          const mm = Math.floor(left / 60000);
          const ss = Math.floor((left % 60000) / 1000);
          ctx.setKeyFace(slot, {
            label: `${mm}:${String(ss).padStart(2, '0')}`,
            sublabel: 'Break',
            bg: RED,
          });
        } else {
          clearInterval(sessions.get(slot));
          sessions.delete(slot);
          ctx.setKeyFace(slot, { label: 'DONE', sublabel: 'Pomodoro', bg: GRAY });
          ctx.log('pomodoro complete');
        }
      };

      tick();
      sessions.set(slot, setInterval(tick, 1000));
    },
  });

  api.log('Pomodoro plugin ready');
}
