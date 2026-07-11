/** Key renderer — draws the key face composition on a 128×128 canvas */

import { FRAME_HEIGHT, FRAME_WIDTH } from '../protocol/constants';
import { rgb565ToRgb888, rgb565ToImageData } from '../protocol/rgb565';
import { KEY_ICONS } from '../ui/icons';

export interface KeyDrawConfig {
  label: string;
  sublabel: string;
  bgColor: number;
  fgColor: number;
  index: number;
  icon?: string;
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function shade(rgb: { r: number; g: number; b: number }, amt: number): string {
  return `rgb(${clamp255(rgb.r + amt)},${clamp255(rgb.g + amt)},${clamp255(rgb.b + amt)})`;
}

/**
 * Draw the default key face: diagonal gradient, top gloss, corner index,
 * centered icon glyph, bold label, uppercase sublabel.
 */
export function drawKeyToCanvas(ctx: CanvasRenderingContext2D, config: KeyDrawConfig): void {
  const { label, sublabel, bgColor, index, icon } = config;
  const w = FRAME_WIDTH;
  const h = FRAME_HEIGHT;

  const bg = rgb565ToRgb888(bgColor);

  // 157° diagonal gradient: lighter top-left → base → darker bottom-right
  const grad = ctx.createLinearGradient(0, 0, w * 0.45, h);
  grad.addColorStop(0, shade(bg, 34));
  grad.addColorStop(0.52, shade(bg, 0));
  grad.addColorStop(1, shade(bg, -30));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Top gloss wash
  const gloss = ctx.createLinearGradient(0, 0, 0, h * 0.42);
  gloss.addColorStop(0, 'rgba(255,255,255,0.16)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, w, h * 0.42);

  // Index tag — top-right, mono, quiet
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '600 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(String(index + 1), w - 9, 7);

  // Icon glyph — centered upper area, white stroke with drop shadow
  const iconPath = KEY_ICONS[icon ?? ''] ?? null;
  if (iconPath) {
    ctx.save();
    const size = 46;
    ctx.translate((w - size) / 2, 20);
    ctx.scale(size / 24, size / 24);
    ctx.strokeStyle = 'rgba(255,255,255,0.96)';
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowOffsetY = 1;
    ctx.shadowBlur = 2;
    ctx.stroke(new Path2D(iconPath));
    ctx.restore();
  }

  // Label — bold, centered, shrink-to-fit
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowOffsetY = 1;
  ctx.shadowBlur = 3;
  let size = 14;
  do {
    ctx.font = `800 ${size}px "Manrope", sans-serif`;
    size -= 1;
  } while (ctx.measureText(label).width > w - 14 && size > 8);
  ctx.fillText(label, w / 2, iconPath ? h - 24 : h / 2 + 5);

  // Sublabel — tiny uppercase, letterspaced
  ctx.shadowColor = 'transparent';
  if (sublabel) {
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 8px "Manrope", sans-serif';
    const spaced = sublabel.toUpperCase().split('').join('\u200a\u200a');
    ctx.fillText(spaced, w / 2, h - 9);
  }

  ctx.textAlign = 'start';
}

/** Apply pressed visual — invert display briefly (firmware drawKeyPressed). */
export function drawKeyPressedEffect(ctx: CanvasRenderingContext2D): void {
  const imageData = ctx.getImageData(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);
}

/** Draw RGB565 framebuffer bytes onto canvas. */
export function drawRgb565ToCanvas(
  ctx: CanvasRenderingContext2D,
  bytes: Uint8Array,
): void {
  const imageData = rgb565ToImageData(bytes, FRAME_WIDTH, FRAME_HEIGHT);
  ctx.putImageData(imageData, 0, 0);
}

/** Create an offscreen 128×128 canvas for a key framebuffer. */
export function createKeyCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  return canvas;
}

export function getKeyContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  return ctx;
}
