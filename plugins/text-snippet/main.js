/**
 * Text Snippets — types a canned string into the focused app (macOS,
 * via System Events keystroke). Great for canned replies, emotes, and
 * email sign-offs. Needs Accessibility permission (same as hotkeys).
 */

export function activate(api) {
  api.registerAction({
    type: 'type',
    label: 'Type text',
    hint: 'Types the text into whichever app has keyboard focus.',
    fields: [{ key: 'text', label: 'Text', placeholder: 'Thanks for watching! 🎉' }],
    async execute(settings, ctx) {
      const text = settings.text ?? '';
      if (!text) {
        ctx.log('text snippet: nothing to type — set the text first');
        return;
      }
      // Escape for a double-quoted AppleScript string
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await ctx.shell(
        `osascript -e "tell application \\"System Events\\" to keystroke \\"${escaped}\\""`,
      );
      ctx.log(`typed ${text.length} characters`);
    },
  });

  api.log('Text Snippets plugin ready');
}
