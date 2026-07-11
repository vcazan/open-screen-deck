import { describe, expect, it } from 'vitest';
import { TRANSPARENT_565 } from '../constants';
import {
  packRgb565,
  rgb565ToRgb888,
  rgb888ToRgb565,
  substituteTransparency,
  unpackRgb565,
} from '../rgb565';

describe('rgb565 packing', () => {
  it('round-trips pure colors', () => {
    for (const [r, g, b] of [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 255],
      [0, 0, 0],
    ]) {
      const packed = rgb888ToRgb565(r, g, b);
      const { r: r2, g: g2, b: b2 } = rgb565ToRgb888(packed);
      // 5/6/5 quantization loses at most the low bits
      expect(Math.abs(r - r2)).toBeLessThanOrEqual(7);
      expect(Math.abs(g - g2)).toBeLessThanOrEqual(3);
      expect(Math.abs(b - b2)).toBeLessThanOrEqual(7);
    }
  });

  it('byte pack/unpack is big-endian symmetric', () => {
    for (const color of [0x0000, 0xffff, 0xf800, 0x07e0, 0x001f, TRANSPARENT_565]) {
      const [hi, lo] = packRgb565(color);
      expect(unpackRgb565(hi, lo)).toBe(color);
    }
  });
});

describe('substituteTransparency', () => {
  const hi = (TRANSPARENT_565 >> 8) & 0xff;
  const lo = TRANSPARENT_565 & 0xff;

  it('replaces sentinel pixels with the background color', () => {
    const bytes = new Uint8Array([hi, lo, 0xf8, 0x00, hi, lo]);
    const out = substituteTransparency(bytes, 0x07e0);
    expect(Array.from(out)).toEqual([0x07, 0xe0, 0xf8, 0x00, 0x07, 0xe0]);
    // original untouched
    expect(bytes[0]).toBe(hi);
  });

  it('returns the same buffer when nothing is transparent', () => {
    const bytes = new Uint8Array([0xf8, 0x00, 0x07, 0xe0]);
    expect(substituteTransparency(bytes, 0x001f)).toBe(bytes);
  });
});
