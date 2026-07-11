/**
 * Soundboard — plays an audio file (URL) through the companion app.
 * Press to play, press again to stop. One sound per key, as many keys as
 * you like.
 */

const playing = new Map(); // slot → HTMLAudioElement

export function activate(api) {
  api.onDispose(() => {
    playing.forEach((a) => a.pause());
    playing.clear();
  });

  api.registerAction({
    type: 'play',
    label: 'Play sound',
    hint: 'Press to play, press again to stop. MP3/WAV/OGG by URL.',
    fields: [
      { key: 'url', label: 'Audio URL', placeholder: 'https://…/airhorn.mp3' },
      { key: 'volume', label: 'Volume 0–100', placeholder: '80' },
    ],
    execute(settings, ctx) {
      const current = playing.get(ctx.slot);
      if (current) {
        current.pause();
        playing.delete(ctx.slot);
        ctx.log('soundboard: stopped');
        return;
      }
      if (!settings.url) {
        ctx.log('soundboard: set an audio URL first');
        return;
      }
      const audio = new Audio(settings.url);
      const vol = parseInt(settings.volume, 10);
      audio.volume = isNaN(vol) ? 0.8 : Math.max(0, Math.min(100, vol)) / 100;
      audio.addEventListener('ended', () => playing.delete(ctx.slot));
      audio.addEventListener('error', () => {
        playing.delete(ctx.slot);
        ctx.log(`soundboard: could not load ${settings.url}`);
      });
      playing.set(ctx.slot, audio);
      void audio.play().then(
        () => ctx.log(`soundboard: playing (volume ${Math.round(audio.volume * 100)}%)`),
        (err) => {
          playing.delete(ctx.slot);
          ctx.log(`soundboard: playback failed — ${err}`);
        },
      );
    },
  });

  api.log('Soundboard plugin ready');
}
