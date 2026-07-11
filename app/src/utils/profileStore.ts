import type { ProfileData } from '../protocol/types';

export interface StoredProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  data: ProfileData;
  /** Auto-activate when the frontmost app name contains this (companion app) */
  autoApp?: string;
  /** Rendered key-face thumbnails (data URLs), one per key */
  thumbs?: string[];
  /** Whether media (icons/animations) exists in the IndexedDB media store */
  hasMedia?: boolean;
}

const STORAGE_KEY = 'osd-profiles';

function readAll(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(profiles: StoredProfile[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function newId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const ProfileStore = {
  list(): StoredProfile[] {
    return readAll().sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  },

  get(id: string): StoredProfile | null {
    return readAll().find((p) => p.id === id) ?? null;
  },

  save(
    name: string,
    data: ProfileData,
    extra?: { thumbs?: string[]; hasMedia?: boolean },
  ): StoredProfile {
    const now = new Date().toISOString();
    const profile: StoredProfile = {
      id: newId(),
      name: name.trim() || 'Untitled profile',
      createdAt: now,
      updatedAt: now,
      data,
      thumbs: extra?.thumbs,
      hasMedia: extra?.hasMedia,
    };
    const profiles = readAll();
    profiles.unshift(profile);
    writeAll(profiles);
    return profile;
  },

  update(
    id: string,
    data: ProfileData,
    name?: string,
    extra?: { thumbs?: string[]; hasMedia?: boolean },
  ): StoredProfile | null {
    const profiles = readAll();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    profiles[idx] = {
      ...profiles[idx],
      name: name?.trim() || profiles[idx].name,
      data,
      thumbs: extra?.thumbs ?? profiles[idx].thumbs,
      hasMedia: extra?.hasMedia ?? profiles[idx].hasMedia,
      updatedAt: new Date().toISOString(),
    };
    writeAll(profiles);
    return profiles[idx];
  },

  setAutoApp(id: string, autoApp: string): StoredProfile | null {
    const profiles = readAll();
    const idx = profiles.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    profiles[idx] = {
      ...profiles[idx],
      autoApp: autoApp.trim() || undefined,
      updatedAt: profiles[idx].updatedAt,
    };
    writeAll(profiles);
    return profiles[idx];
  },

  remove(id: string): void {
    writeAll(readAll().filter((p) => p.id !== id));
  },

  exportAll(): string {
    return JSON.stringify({ version: 1, profiles: readAll() }, null, 2);
  },

  importFromJson(json: string): number {
    const parsed = JSON.parse(json) as { profiles?: StoredProfile[]; version?: number; keys?: unknown };
    let imported = 0;

    if (Array.isArray(parsed.profiles)) {
      const existing = readAll();
      const ids = new Set(existing.map((p) => p.id));
      for (const p of parsed.profiles) {
        if (!p?.data?.keys) continue;
        const profile: StoredProfile = {
          id: ids.has(p.id) ? newId() : p.id || newId(),
          name: p.name || 'Imported profile',
          createdAt: p.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          data: p.data,
        };
        existing.unshift(profile);
        imported++;
      }
      writeAll(existing);
      return imported;
    }

    if ((parsed.version === 1 || parsed.version === 2) && Array.isArray(parsed.keys)) {
      ProfileStore.save('Imported profile', parsed as unknown as ProfileData);
      return 1;
    }

    return imported;
  },
};
