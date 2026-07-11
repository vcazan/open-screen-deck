/**
 * Overlay baking — composites the key's label, sublabel and icon glyph onto
 * RGB565 frames. Baked frames are what get streamed to the device, so the
 * overlay works identically on real hardware (which just plays raw frames).
 */

import { FRAME_HEIGHT, FRAME_WIDTH } from '../protocol/constants';
import { imageDataToRgb565, rgb565ToImageData } from '../protocol/rgb565';
import { KEY_ICONS } from '../ui/icons';

export interface OverlaySpec {
  label: string;
  sublabel: string;
  icon?: string;
}

export function hasOverlayContent(overlay: OverlaySpec): boolean {
  return Boolean(overlay.label || overlay.sublabel || (overlay.icon && KEY_ICONS[overlay.icon]));
}

/** Draw the overlay (scrim, icon, label, sublabel) onto a 128×128 context. */
export function drawOverlay(ctx: CanvasRenderingContext2D, overlay: OverlaySpec): void {
  const w = FRAME_WIDTH;
  const h = FRAME_HEIGHT;
  const { label, sublabel, icon } = overlay;

  // Bottom scrim so text stays readable over any footage
  if (label || sublabel) {
    const scrim = ctx.createLinearGradient(0, h - 52, 0, h);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h - 52, w, 52);
  }

  // Icon glyph — small, top-left, out of the way of the footage
  const iconPath = icon ? KEY_ICONS[icon] : undefined;
  if (iconPath) {
    ctx.save();
    const size = 20;
    ctx.translate(8, 8);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 3;
    ctx.stroke(new Path2D(iconPath));
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 3;
    let size = 14;
    do {
      ctx.font = `800 ${size}px "Manrope", sans-serif`;
      size -= 1;
    } while (ctx.measureText(label).width > w - 14 && size > 8);
    ctx.fillText(label, w / 2, sublabel ? h - 20 : h - 10);
    ctx.shadowColor = 'transparent';
  }

  if (sublabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '600 8px "Manrope", sans-serif';
    ctx.fillText(sublabel.toUpperCase().split('').join('\u200a\u200a'), w / 2, h - 7);
  }

  ctx.textAlign = 'start';
}

/** Composite the overlay onto a batch of RGB565 frames, returning new frames. */
export function bakeOverlayFrames(frames: Uint8Array[], overlay: OverlaySpec): Uint8Array[] {
  if (!hasOverlayContent(overlay)) return frames;

  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return frames;

  return frames.map((frame) => {
    ctx.putImageData(rgb565ToImageData(frame), 0, 0);
    drawOverlay(ctx, overlay);
    return imageDataToRgb565(ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT));
  });
}
