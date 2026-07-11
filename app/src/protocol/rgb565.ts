/** RGB565 helpers — big-endian byte order matching ST7735 / Adafruit GFX */

import { FRAME_BYTES, FRAME_HEIGHT, FRAME_WIDTH, TRANSPARENT_565 } from './constants';

/** Pack RGB888 into RGB565 (16-bit value). */
export function rgb888ToRgb565(r: number, g: number, b: number): number {
  const r5 = (r >> 3) & 0x1f;
  const g6 = (g >> 2) & 0x3f;
  const b5 = (b >> 3) & 0x1f;
  return (r5 << 11) | (g6 << 5) | b5;
}

/** Unpack RGB565 to RGB888. */
export function rgb565ToRgb888(color: number): { r: number; g: number; b: number } {
  const r = ((color >> 11) & 0x1f) << 3;
  const g = ((color >> 5) & 0x3f) << 2;
  const b = (color & 0x1f) << 3;
  return { r, g, b };
}

/** Pack a 16-bit RGB565 value to big-endian bytes [hi, lo]. */
export function packRgb565(color: number): [number, number] {
  return [(color >> 8) & 0xff, color & 0xff];
}

/** Unpack big-endian bytes to 16-bit RGB565. */
export function unpackRgb565(hi: number, lo: number): number {
  return ((hi & 0xff) << 8) | (lo & 0xff);
}

/** Convert ImageData to RGB565 Uint8Array (big-endian, row-major). */
export function imageDataToRgb565(imageData: ImageData): Uint8Array {
  const { width, height, data } = imageData;
  const out = new Uint8Array(width * height * 2);
  let o = 0;
  for (let i = 0; i < data.length; i += 4) {
    const color = rgb888ToRgb565(data[i], data[i + 1], data[i + 2]);
    const [hi, lo] = packRgb565(color);
    out[o++] = hi;
    out[o++] = lo;
  }
  return out;
}

/** Convert RGB565 Uint8Array to ImageData. */
export function rgb565ToImageData(
  bytes: Uint8Array,
  width = FRAME_WIDTH,
  height = FRAME_HEIGHT,
): ImageData {
  const imageData = new ImageData(width, height);
  const { data } = imageData;
  let di = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    const color = unpackRgb565(bytes[i], bytes[i + 1]);
    const { r, g, b } = rgb565ToRgb888(color);
    data[di++] = r;
    data[di++] = g;
    data[di++] = b;
    data[di++] = 255;
  }
  return imageData;
}

/** Fill a Uint8Array with a solid RGB565 color. */
export function fillRgb565(bytes: Uint8Array, color: number): void {
  const [hi, lo] = packRgb565(color);
  for (let i = 0; i < bytes.length; i += 2) {
    bytes[i] = hi;
    bytes[i + 1] = lo;
  }
}

/** Resize a source canvas/image to 128×128 and return RGB565 bytes. */
export function canvasToRgb565(
  source: CanvasImageSource,
  width = FRAME_WIDTH,
  height = FRAME_HEIGHT,
): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const imageData = ctx.getImageData(0, 0, width, height);
  return imageDataToRgb565(imageData);
}

export function assertFrameSize(bytes: Uint8Array): void {
  if (bytes.length !== FRAME_BYTES) {
    throw new Error(`Expected ${FRAME_BYTES} bytes, got ${bytes.length}`);
  }
}

/**
 * Like canvasToRgb565, but transparent pixels (alpha < 128) become the
 * TRANSPARENT_565 sentinel so the key's background color shows through at
 * draw time. Opaque pixels that naturally collide with the sentinel are
 * nudged one green step so they stay opaque.
 */
export function canvasToRgb565Alpha(
  source: CanvasImageSource,
  width = FRAME_WIDTH,
  height = FRAME_HEIGHT,
): Uint8Array {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const out = new Uint8Array(width * height * 2);
  let o = 0;
  for (let i = 0; i < data.length; i += 4) {
    let color: number;
    if (data[i + 3] < 128) {
      color = TRANSPARENT_565;
    } else {
      color = rgb888ToRgb565(data[i], data[i + 1], data[i + 2]);
      if (color === TRANSPARENT_565) color = TRANSPARENT_565 + 0x20; // stay opaque
    }
    out[o++] = (color >> 8) & 0xff;
    out[o++] = color & 0xff;
  }
  return out;
}

/** Replace sentinel pixels with a background color (returns a copy when needed). */
export function substituteTransparency(bytes: Uint8Array, bg565: number): Uint8Array {
  const hi = (TRANSPARENT_565 >> 8) & 0xff;
  const lo = TRANSPARENT_565 & 0xff;
  let hasSentinel = false;
  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] === hi && bytes[i + 1] === lo) {
      hasSentinel = true;
      break;
    }
  }
  if (!hasSentinel) return bytes;

  const out = new Uint8Array(bytes);
  const bgHi = (bg565 >> 8) & 0xff;
  const bgLo = bg565 & 0xff;
  for (let i = 0; i < out.length; i += 2) {
    if (out[i] === hi && out[i + 1] === lo) {
      out[i] = bgHi;
      out[i + 1] = bgLo;
    }
  }
  return out;
}
