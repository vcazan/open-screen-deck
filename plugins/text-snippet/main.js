/**
 * Text Snippets — types canned text into the focused app (macOS System
 * Events keystroke). The key wears a quote face with a preview of its
 * snippet. Needs Accessibility permission (same as hotkeys).
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

function quoteGlyph(g) {
  g.fillStyle = '#e0a52f';
  g.font = '700 64px Georgia, serif';
  g.textAlign = 'center';
  g.fillText('\u201C', 48, 72);
  g.fillText('\u201D', 84, 72);
}

export function activate(api) {
  api.registerAction({
    type: 'type',
    label: 'Type text',
    hint: 'Types the text into whichever app has keyboard focus.',
    fields: [{ key: 'text', label: 'Text', placeholder: 'Thanks for watching!' }],
    async onAssign(settings, ctx) {
      const preview = (settings.text || 'snippet').slice(0, 14);
      await ctx.setKeyImage(brandFace(quoteGlyph, preview, 'press to type', '#e0a52f'));
    },
    async execute(settings, ctx) {
      const text = settings.text ?? '';
      if (!text) {
        ctx.log('nothing to type — set the text first');
        return;
      }
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await ctx.shell(
        `osascript -e "tell application \\"System Events\\" to keystroke \\"${escaped}\\""`,
      );
      ctx.log(`typed ${text.length} characters`);
    },
  });

  api.log('Text Snippets plugin ready');
}
