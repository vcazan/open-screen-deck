/**
 * System Actions — the greatest hits of desk automation on macOS:
 * lock screen, sleep displays, empty trash, toggle dark mode.
 */

export function activate(api) {
  const actions = [
    {
      type: 'lock',
      label: 'Lock screen',
      hint: 'Locks the Mac immediately (⌃⌘Q).',
      command:
        `osascript -e "tell application \\"System Events\\" to keystroke \\"q\\" using {control down, command down}"`,
    },
    {
      type: 'sleep-displays',
      label: 'Sleep displays',
      hint: 'Turns the displays off; the Mac keeps running.',
      command: 'pmset displaysleepnow',
    },
    {
      type: 'empty-trash',
      label: 'Empty trash',
      hint: 'Empties the Finder trash without the confirmation dialog.',
      command: `osascript -e "tell application \\"Finder\\" to empty trash"`,
    },
    {
      type: 'dark-mode',
      label: 'Toggle dark mode',
      hint: 'Flips macOS between light and dark appearance.',
      command:
        `osascript -e "tell application \\"System Events\\" to tell appearance preferences to set dark mode to not dark mode"`,
    },
  ];

  for (const a of actions) {
    api.registerAction({
      type: a.type,
      label: a.label,
      hint: a.hint,
      fields: [],
      async execute(_settings, ctx) {
        await ctx.shell(a.command);
        ctx.log(a.label.toLowerCase());
      },
    });
  }

  api.log('System Actions plugin ready');
}
