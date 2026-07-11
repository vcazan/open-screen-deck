/**
 * Bundled starter profiles for onboarding — full v4 profiles (24 slots)
 * built from key configs + actions. No binary media, so they stay tiny
 * and apply instantly on first run.
 */

import type { KeyAction } from '../actions/types';
import type { ProfileData } from '../protocol/types';
import { HID_PAGE_NEXT, ST77XX_WHITE, defaultKeyForSlot } from '../protocol/constants';

interface StarterKey {
  label: string;
  sublabel?: string;
  bg: number;
  icon?: string;
  action: KeyAction;
  /** HID typed by the device standalone (defaults to the slot default) */
  hid?: number;
}

export interface StarterProfile {
  id: string;
  name: string;
  description: string;
  /** Page 0 keys — the rest of the deck keeps per-slot defaults */
  keys: (StarterKey | null)[];
}

const teal = 0x1c73;
const navy = 0x194b;
const red = 0xc186;
const green = 0x1ce9;
const purple = 0x815c;
const slate = 0x2965;

export const STARTER_PROFILES: StarterProfile[] = [
  {
    id: 'streaming',
    name: 'Streaming',
    description: 'OBS scenes, mic mute, and a live on-air tile.',
    keys: [
      { label: 'MIC', sublabel: 'Toggle', bg: green, icon: 'mute', action: { type: 'mic_mute' } },
      { label: 'SCENE 1', sublabel: 'OBS', bg: navy, icon: 'camera', action: { type: 'obs_scene', scene: 'Scene 1' } },
      { label: 'SCENE 2', sublabel: 'OBS', bg: navy, icon: 'camera', action: { type: 'obs_scene', scene: 'Scene 2' } },
      { label: 'ON AIR', sublabel: 'Live', bg: red, icon: 'record', action: { type: 'tile', kind: 'obs_scene' } },
      { label: 'CLOCK', sublabel: '', bg: slate, icon: 'bolt', action: { type: 'tile', kind: 'clock' } },
      { label: 'PAGE', sublabel: 'Next', bg: slate, icon: 'bolt', action: { type: 'page_next' }, hid: HID_PAGE_NEXT },
    ],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    description: 'Launch your tools, jump to sites, keep an eye on the clock.',
    keys: [
      { label: 'MAIL', sublabel: 'Open', bg: teal, icon: 'globe', action: { type: 'launch', target: 'Mail' } },
      { label: 'BROWSER', sublabel: 'Open', bg: navy, icon: 'globe', action: { type: 'launch', target: 'Safari' } },
      { label: 'GITHUB', sublabel: 'Web', bg: slate, icon: 'globe', action: { type: 'open_url', url: 'https://github.com' } },
      { label: 'TIMER', sublabel: 'Focus', bg: purple, icon: 'bolt', action: { type: 'tile', kind: 'timer' } },
      { label: 'CLOCK', sublabel: '', bg: slate, icon: 'bolt', action: { type: 'tile', kind: 'clock' } },
      { label: 'PAGE', sublabel: 'Next', bg: slate, icon: 'bolt', action: { type: 'page_next' }, hid: HID_PAGE_NEXT },
    ],
  },
  {
    id: 'media',
    name: 'Media',
    description: 'Playback keys plus live volume and now-playing tiles.',
    keys: [
      { label: 'PLAY', sublabel: 'Pause', bg: green, icon: 'bolt', action: { type: 'hotkey', keys: 'playpause' } },
      { label: 'NEXT', sublabel: 'Track', bg: teal, icon: 'bolt', action: { type: 'hotkey', keys: 'nexttrack' } },
      { label: 'PREV', sublabel: 'Track', bg: teal, icon: 'bolt', action: { type: 'hotkey', keys: 'prevtrack' } },
      { label: 'TRACK', sublabel: 'Live', bg: purple, icon: 'bolt', action: { type: 'tile', kind: 'now_playing' } },
      { label: 'VOLUME', sublabel: 'Live', bg: slate, icon: 'bolt', action: { type: 'tile', kind: 'volume' } },
      { label: 'PAGE', sublabel: 'Next', bg: slate, icon: 'bolt', action: { type: 'page_next' }, hid: HID_PAGE_NEXT },
    ],
  },
];

/**
 * Expand a starter profile into v4 ProfileData + actions. Starters ship
 * with two pages — a configured page 1 (their PAGE key makes sense) and a
 * blank page 2 to grow into.
 */
export function starterToProfileData(starter: StarterProfile): {
  data: ProfileData;
  actions: KeyAction[];
} {
  const STARTER_PAGES = 2;
  const keys: ProfileData['keys'] = [];
  const actions: KeyAction[] = [];
  for (let s = 0; s < STARTER_PAGES * 6; s++) {
    const d = defaultKeyForSlot(s);
    const sk = s < 6 ? starter.keys[s] : null;
    keys.push({
      label: sk?.label ?? d.label,
      sublabel: sk?.sublabel ?? d.sublabel,
      hid: sk?.hid ?? d.hid,
      bg: sk?.bg ?? d.bg,
      fg: ST77XX_WHITE,
      icon: sk?.icon ?? d.icon,
    });
    actions.push(sk?.action ?? { type: 'hid', code: sk?.hid ?? d.hid });
  }
  return { data: { version: 4, keys, actions }, actions };
}
