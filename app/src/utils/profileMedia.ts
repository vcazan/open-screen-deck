/**
 * Profile media store — icons and animation frames are too big for
 * localStorage, so they live in IndexedDB keyed by profile id.
 */

export interface ProfileMedia {
  icons: Record<number, Uint8Array>;
  animations: Record<number, { fps: number; frames: Uint8Array[] }>;
}

const DB_NAME = 'osd-profile-media';
const STORE = 'media';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
  });
}

export async function saveProfileMedia(profileId: string, media: ProfileMedia): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(media, profileId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('media save failed'));
  });
  db.close();
}

export async function loadProfileMedia(profileId: string): Promise<ProfileMedia | null> {
  const db = await openDb();
  const media = await new Promise<ProfileMedia | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(profileId);
    req.onsuccess = () => resolve((req.result as ProfileMedia) ?? null);
    req.onerror = () => reject(req.error ?? new Error('media load failed'));
  });
  db.close();
  return media;
}

export async function deleteProfileMedia(profileId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(profileId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  db.close();
}

/** Cheap change signature so autosave doesn't rewrite megabytes every tick. */
export function mediaSignature(media: ProfileMedia): string {
  const parts: string[] = [];
  for (const [k, icon] of Object.entries(media.icons)) {
    let sum = 0;
    for (let i = 0; i < Math.min(icon.length, 256); i += 8) sum = (sum + icon[i] * (i + 1)) | 0;
    parts.push(`i${k}:${icon.length}:${sum}`);
  }
  for (const [k, anim] of Object.entries(media.animations)) {
    const first = anim.frames[0];
    let sum = 0;
    if (first) for (let i = 0; i < Math.min(first.length, 256); i += 8) sum = (sum + first[i]) | 0;
    parts.push(`a${k}:${anim.frames.length}:${anim.fps}:${sum}`);
  }
  return parts.sort().join('|');
}

// ── base64 (for shareable export files) ─────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export interface PortableMedia {
  icons?: Record<string, string>;
  animations?: Record<string, { fps: number; frames: string[] }>;
}

export function mediaToPortable(media: ProfileMedia): PortableMedia {
  return {
    icons: Object.fromEntries(
      Object.entries(media.icons).map(([k, v]) => [k, bytesToBase64(v)]),
    ),
    animations: Object.fromEntries(
      Object.entries(media.animations).map(([k, v]) => [
        k,
        { fps: v.fps, frames: v.frames.map(bytesToBase64) },
      ]),
    ),
  };
}

export function portableToMedia(portable: PortableMedia | undefined): ProfileMedia {
  return {
    icons: Object.fromEntries(
      Object.entries(portable?.icons ?? {}).map(([k, v]) => [Number(k), base64ToBytes(v)]),
    ),
    animations: Object.fromEntries(
      Object.entries(portable?.animations ?? {}).map(([k, v]) => [
        Number(k),
        { fps: v.fps, frames: v.frames.map(base64ToBytes) },
      ]),
    ),
  };
}

export function hasMedia(media: ProfileMedia | null): boolean {
  return (
    !!media &&
    (Object.keys(media.icons).length > 0 || Object.keys(media.animations).length > 0)
  );
}
