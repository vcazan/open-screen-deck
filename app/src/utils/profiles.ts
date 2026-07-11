import type { ProfileData } from '../protocol/types';
import { KEY_COUNT, MAX_PAGES, TOTAL_KEYS, defaultKeyForSlot } from '../protocol/constants';
import type { KeyAction } from '../actions/types';

/**
 * How many pages a profile describes — derived from its key list, so
 * legacy 6-key profiles are one page and v4 24-key profiles are four.
 */
export function profilePageCount(profile: ProfileData): number {
  return Math.max(1, Math.min(MAX_PAGES, Math.ceil(profile.keys.length / KEY_COUNT)));
}

/** Snapshot the deck's configured pages into a v4 profile. */
export function buildProfile(
  keys: {
    label: string;
    sublabel: string;
    hidKey: number;
    bgColor: number;
    fgColor: number;
    icon?: string;
  }[],
  actions?: KeyAction[],
  pages = 1,
  multi?: { double: (KeyAction | null)[]; triple: (KeyAction | null)[] },
): ProfileData {
  const slots = Math.max(1, Math.min(MAX_PAGES, pages)) * KEY_COUNT;
  const hasAny = (list?: (KeyAction | null)[]) => list?.some((a) => a !== null) ?? false;
  return {
    version: 4,
    keys: keys.slice(0, slots).map((k) => ({
      label: k.label,
      sublabel: k.sublabel,
      hid: k.hidKey,
      bg: k.bgColor,
      fg: k.fgColor,
      icon: k.icon,
    })),
    actions: actions?.slice(0, slots),
    actionsDouble: hasAny(multi?.double) ? multi!.double.slice(0, slots) : undefined,
    actionsTriple: hasAny(multi?.triple) ? multi!.triple.slice(0, slots) : undefined,
  };
}

/** Double/triple actions from a profile, padded to the slot ceiling. */
export function profileToMultiActions(profile: ProfileData): {
  double: (KeyAction | null)[];
  triple: (KeyAction | null)[];
} {
  const pad = (list?: unknown[]): (KeyAction | null)[] =>
    Array.from({ length: TOTAL_KEYS }, (_, s) => (list?.[s] as KeyAction) ?? null);
  return {
    double: pad(profile.actionsDouble),
    triple: pad(profile.actionsTriple),
  };
}

/**
 * One action per key slot, padded to the slot ceiling. v1 profiles carry no
 * actions — synthesize HID actions from key configs.
 */
export function profileToActions(profile: ProfileData): KeyAction[] {
  const out: KeyAction[] = Array.from({ length: TOTAL_KEYS }, (_, s) => ({
    type: 'hid',
    code: defaultKeyForSlot(s).hid,
  }));
  if (profile.version >= 2 && Array.isArray(profile.actions) && profile.actions.length) {
    (profile.actions.slice(0, TOTAL_KEYS) as KeyAction[]).forEach((a, i) => {
      if (a) out[i] = a;
    });
    return out;
  }
  profile.keys.slice(0, TOTAL_KEYS).forEach((k, i) => {
    out[i] = { type: 'hid', code: k.hid ?? defaultKeyForSlot(i).hid };
  });
  return out;
}

export function downloadProfile(profile: ProfileData, filename = 'osd-profile.json'): void {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shareable profile files (v3: config + actions + media) ──

import {
  mediaToPortable,
  portableToMedia,
  type PortableMedia,
  type ProfileMedia,
} from './profileMedia';

export interface PortableProfile {
  format: 'osd-profile';
  version: 3;
  name: string;
  data: ProfileData;
  thumbs?: string[];
  media?: PortableMedia;
}

export function exportProfileFile(
  name: string,
  data: ProfileData,
  media: ProfileMedia | null,
  thumbs?: string[],
): void {
  const portable: PortableProfile = {
    format: 'osd-profile',
    version: 3,
    name,
    data,
    thumbs,
    media: media ? mediaToPortable(media) : undefined,
  };
  const blob = new Blob([JSON.stringify(portable)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w-]+/g, '_') || 'profile'}.osdprofile.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parsePortableProfile(
  json: string,
): { name: string; data: ProfileData; thumbs?: string[]; media: ProfileMedia } | null {
  try {
    const parsed = JSON.parse(json) as PortableProfile;
    if (parsed.format !== 'osd-profile' || !Array.isArray(parsed.data?.keys)) return null;
    return {
      name: parsed.name || 'Imported profile',
      data: parsed.data,
      thumbs: parsed.thumbs,
      media: portableToMedia(parsed.media),
    };
  } catch {
    return null;
  }
}

export async function loadProfileFromFile(file: File): Promise<ProfileData> {
  const text = await file.text();
  const data = JSON.parse(text) as ProfileData;
  if (![1, 2, 4].includes(data.version) || !Array.isArray(data.keys)) {
    throw new Error('Invalid profile format');
  }
  return data;
}

/** Config list for every slot the profile's pages cover. */
export function profileToKeyConfigs(profile: ProfileData) {
  const slots = profilePageCount(profile) * KEY_COUNT;
  return Array.from({ length: slots }, (_, i) => {
    const k = profile.keys[i];
    const d = defaultKeyForSlot(i);
    return {
      label: k?.label ?? d.label,
      sublabel: k?.sublabel ?? d.sublabel,
      hidKey: k?.hid ?? d.hid,
      bgColor: k?.bg ?? d.bg,
      fgColor: k?.fg ?? d.fg,
      icon: k?.icon ?? d.icon,
    };
  });
}
