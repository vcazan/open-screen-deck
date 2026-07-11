/**
 * Zoom Control — sends Zoom's global shortcuts to the zoom.us process via
 * System Events, so they work even when Zoom isn't the focused app.
 * Needs Accessibility permission (same as hotkeys).
 */

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
    { type: 'mute', label: 'Toggle mute', key: 'a', mods: ['command', 'shift'] },
    { type: 'video', label: 'Toggle video', key: 'v', mods: ['command', 'shift'] },
    { type: 'hand', label: 'Raise / lower hand', key: 'y', mods: ['option'] },
  ];

  for (const a of actions) {
    api.registerAction({
      type: a.type,
      label: `Zoom: ${a.label}`,
      hint: 'Sent straight to the Zoom app — no need to focus it first.',
      fields: [],
      async execute(_settings, ctx) {
        await ctx.shell(zoomKeystroke(a.key, a.mods));
        ctx.log(`zoom: ${a.label.toLowerCase()}`);
      },
    });
  }

  api.log('Zoom Control plugin ready');
}
