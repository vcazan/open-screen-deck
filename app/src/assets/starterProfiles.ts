/**
 * Bundled starter profiles for onboarding — full v4 profiles (24 slots)
 * built from key configs + actions. No binary media, so they stay tiny
 * and apply instantly on first run.
 */

import type { KeyAction } from '../actions/types';
import type { ProfileData } from '../protocol/types';
import {
  HID_PAGE_NEXT,
  HID_PAGE_PREV,
  ST77XX_WHITE,
  defaultKeyForSlot,
} from '../protocol/constants';

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
  /** Multi-page starters: full page list (overrides `keys` + blank page 2) */
  pages?: (StarterKey | null)[][];
}

const teal = 0x1c73;
const navy = 0x194b;
const red = 0xc186;
const green = 0x1ce9;
const purple = 0x815c;
const slate = 0x2965;

/** Every showcase page shares the same nav corners: 3 = prev, 5 = next. */
const PREV: StarterKey = {
  label: 'PREV',
  sublabel: 'Page',
  bg: slate,
  action: { type: 'page_prev' },
  hid: HID_PAGE_PREV,
};
const NEXT: StarterKey = {
  label: 'NEXT',
  sublabel: 'Page',
  bg: slate,
  action: { type: 'page_next' },
  hid: HID_PAGE_NEXT,
};

const plugin = (id: string, settings: Record<string, string> = {}): KeyAction => ({
  type: 'plugin',
  plugin: id,
  settings,
});

export const STARTER_PROFILES: StarterProfile[] = [
  {
    id: 'plugin-showcase',
    name: 'Plugin Showcase',
    description:
      'Every bundled plugin across four pages — live tickers, meetings, system keys — with prev/next page corners.',
    keys: [],
    pages: [
      // Page 1 — live data
      [
        { label: 'BTC', sublabel: 'Ticker', bg: 0xfc60, action: plugin('crypto-price:ticker', { coin: 'bitcoin', currency: 'usd' }) },
        { label: 'WEATHER', sublabel: 'Toronto', bg: navy, action: plugin('weather:temperature', { lat: '43.65', lon: '-79.38', unit: 'c' }) },
        { label: 'LONDON', sublabel: 'Clock', bg: teal, action: plugin('world-clock:clock', { tz: 'Europe/London', city: 'London' }) },
        PREV,
        { label: 'FOCUS', sublabel: 'Pomodoro', bg: red, action: plugin('pomodoro:timer', { minutes: '25', breakMinutes: '5' }) },
        NEXT,
      ],
      // Page 2 — web & media
      [
        { label: 'AIRHORN', sublabel: 'Sound', bg: purple, action: plugin('soundboard:play', { name: 'AIRHORN' }) },
        { label: 'PING', sublabel: 'Webhook', bg: navy, action: plugin('web-request:request', { url: 'https://httpbin.org/status/200', name: 'PING', method: 'GET' }) },
        { label: 'SNAP', sublabel: 'Area shot', bg: green, action: plugin('screenshot:capture', { mode: 'area' }) },
        PREV,
        { label: 'THANKS', sublabel: 'Snippet', bg: slate, action: plugin('text-snippet:type', { text: 'Thanks for watching!' }) },
        NEXT,
      ],
      // Page 3 — meetings & lights
      [
        { label: 'ZOOM MIC', sublabel: 'Mute', bg: navy, action: plugin('zoom-control:mute') },
        { label: 'ZOOM CAM', sublabel: 'Video', bg: navy, action: plugin('zoom-control:video') },
        { label: 'HAND', sublabel: 'Raise', bg: teal, action: plugin('zoom-control:hand') },
        PREV,
        { label: 'DESK LAMP', sublabel: 'Hue', bg: purple, action: plugin('philips-hue:toggle', { name: 'DESK LAMP' }) },
        NEXT,
      ],
      // Page 4 — system & home
      [
        { label: 'LOCK', sublabel: 'Screen', bg: red, action: plugin('system-actions:lock') },
        { label: 'SLEEP', sublabel: 'Displays', bg: slate, action: plugin('system-actions:sleep-displays') },
        { label: 'DARK', sublabel: 'Mode', bg: purple, action: plugin('system-actions:dark-mode') },
        PREV,
        { label: 'LIGHTS', sublabel: 'Home', bg: teal, action: plugin('home-assistant:webhook', { name: 'LIGHTS' }) },
        NEXT,
      ],
    ],
  },
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
 * Expand a starter profile into v4 ProfileData + actions. Single-page
 * starters ship with two pages — the configured page 1 (their PAGE key
 * makes sense) and a blank page 2 to grow into. Multi-page starters
 * (`pages`) use their full page list as-is.
 */
export function starterToProfileData(starter: StarterProfile): {
  data: ProfileData;
  actions: KeyAction[];
} {
  const pages = starter.pages ?? [starter.keys, []];
  const keys: ProfileData['keys'] = [];
  const actions: KeyAction[] = [];
  for (let s = 0; s < pages.length * 6; s++) {
    const d = defaultKeyForSlot(s);
    const sk = pages[Math.floor(s / 6)][s % 6] ?? null;
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
