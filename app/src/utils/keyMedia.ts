/**
 * Per-key media store — keeps the raw (pre-overlay) 128×128 image for each
 * key so label/icon overlays can be re-baked and re-uploaded at any time,
 * not just in the session the image was dropped.
 */

import { FRAME_BYTES } from '../protocol/constants';
import { rgb565ToImageData, substituteTransparency } from '../protocol/rgb565';

const STORAGE_KEY = 'osd-key-media-v1';

interface StoredKeyMedia {
  /** base64 of raw RGB565 frame, before overlay baking */
  image?: string;
  overlayOn?: boolean;
}

type MediaMap = Record<number, StoredKeyMedia>;

function readAll(): MediaMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as MediaMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: MediaMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full — media persistence is best-effort
  }
}

function toBase64(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

function fromBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.length === FRAME_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

export function loadKeyMedia(index: number): { image: Uint8Array | null; overlayOn: boolean } {
  const entry = readAll()[index];
  return {
    image: entry?.image ? fromBase64(entry.image) : null,
    overlayOn: entry?.overlayOn ?? true,
  };
}

export function saveKeyMediaImage(index: number, bytes: Uint8Array): void {
  const map = readAll();
  map[index] = { ...map[index], image: toBase64(bytes) };
  writeAll(map);
}

export function setKeyMediaOverlay(index: number, overlayOn: boolean): void {
  const map = readAll();
  map[index] = { ...map[index], overlayOn };
  writeAll(map);
}

export function clearKeyMediaImage(index: number): void {
  const map = readAll();
  if (map[index]) {
    delete map[index].image;
    writeAll(map);
  }
}

/** Small preview data-URL for the inspector's media row. */
export function rgb565ToDataUrl(bytes: Uint8Array, substituteBg?: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const source = substituteBg !== undefined ? substituteTransparency(bytes, substituteBg) : bytes;
  ctx.putImageData(rgb565ToImageData(source), 0, 0);
  return canvas.toDataURL('image/png');
}
