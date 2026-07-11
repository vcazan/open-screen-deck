import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  hasMedia,
  mediaSignature,
  mediaToPortable,
  portableToMedia,
  type ProfileMedia,
} from '../profileMedia';

function sampleMedia(): ProfileMedia {
  return {
    icons: { 1: new Uint8Array([10, 20, 30, 40]) },
    animations: { 3: { fps: 10, frames: [new Uint8Array([1, 2]), new Uint8Array([3, 4])] } },
  };
}

describe('base64 helpers', () => {
  it('round-trips binary data including large buffers', () => {
    const big = new Uint8Array(70_000).map((_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(big)))).toEqual(Array.from(big));
  });

  it('handles empty input', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0)))).toHaveLength(0);
  });
});

describe('portable media round-trip', () => {
  it('preserves icons, animations, and fps', () => {
    const media = sampleMedia();
    const restored = portableToMedia(mediaToPortable(media));
    expect(Array.from(restored.icons[1])).toEqual([10, 20, 30, 40]);
    expect(restored.animations[3].fps).toBe(10);
    expect(restored.animations[3].frames).toHaveLength(2);
    expect(Array.from(restored.animations[3].frames[1])).toEqual([3, 4]);
  });

  it('tolerates missing portable payload', () => {
    const empty = portableToMedia(undefined);
    expect(hasMedia(empty)).toBe(false);
  });
});

describe('mediaSignature', () => {
  it('is stable for identical media', () => {
    expect(mediaSignature(sampleMedia())).toBe(mediaSignature(sampleMedia()));
  });

  it('changes when pixels change', () => {
    const a = sampleMedia();
    const b = sampleMedia();
    b.icons[1] = new Uint8Array([99, 20, 30, 40]);
    expect(mediaSignature(a)).not.toBe(mediaSignature(b));
  });

  it('changes when fps changes', () => {
    const a = sampleMedia();
    const b = sampleMedia();
    b.animations[3].fps = 15;
    expect(mediaSignature(a)).not.toBe(mediaSignature(b));
  });
});

describe('hasMedia', () => {
  it('detects presence and absence', () => {
    expect(hasMedia(null)).toBe(false);
    expect(hasMedia({ icons: {}, animations: {} })).toBe(false);
    expect(hasMedia(sampleMedia())).toBe(true);
  });
});
