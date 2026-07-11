/** Host-side key actions — what a key press does beyond the device itself. */

export interface StateFace {
  label: string;
  sublabel: string;
  bg: number; // RGB565
}

export type TileKind = 'clock' | 'timer' | 'cpu' | 'volume' | 'now_playing' | 'obs_scene';

export type KeyAction =
  | { type: 'hid'; code: number }
  | { type: 'hotkey'; keys: string }
  | { type: 'launch'; target: string }
  | { type: 'open_url'; url: string }
  | { type: 'shell'; command: string }
  | { type: 'mic_mute'; faces?: { live: StateFace; muted: StateFace } }
  | { type: 'obs_scene'; scene: string }
  | { type: 'page_next' }
  | { type: 'page_prev' }
  | { type: 'page'; page: number }
  | { type: 'tile'; kind: TileKind }
  /** Contributed by a plugin — `plugin` is "<pluginId>:<actionType>" */
  | { type: 'plugin'; plugin: string; settings: Record<string, string> }
  | { type: 'multi'; steps: KeyAction[]; delay_ms?: number };

export type KeyActionType = KeyAction['type'];

export const ACTION_TYPE_META: Record<
  KeyActionType,
  { label: string; needsCompanion: boolean; hint: string }
> = {
  hid: {
    label: 'Keystroke (F13–F24)',
    needsCompanion: false,
    hint: 'Typed by the device itself — works without the companion app.',
  },
  hotkey: {
    label: 'Hotkey',
    needsCompanion: true,
    hint: 'Full chord like cmd+shift+m, pressed on this computer.',
  },
  launch: {
    label: 'Launch app',
    needsCompanion: true,
    hint: 'App name (Slack), .app bundle, .exe, or any file path.',
  },
  open_url: {
    label: 'Open URL',
    needsCompanion: true,
    hint: 'Opens in your default browser.',
  },
  shell: {
    label: 'Shell command',
    needsCompanion: true,
    hint: 'Runs in sh (macOS) or cmd (Windows).',
  },
  mic_mute: {
    label: 'Mic mute toggle',
    needsCompanion: true,
    hint: 'Toggles the system microphone. The key face shows live status.',
  },
  obs_scene: {
    label: 'OBS scene',
    needsCompanion: false,
    hint: 'Switches scenes via obs-websocket (configure in Settings).',
  },
  page_next: {
    label: 'Next page',
    needsCompanion: false,
    hint: 'Cycles the deck to its next page — handled by the device itself.',
  },
  page_prev: {
    label: 'Previous page',
    needsCompanion: false,
    hint: 'Cycles the deck to its previous page — handled by the device itself.',
  },
  page: {
    label: 'Go to page',
    needsCompanion: false,
    hint: 'Jumps the deck to a specific page — handled by the device itself.',
  },
  tile: {
    label: 'Live tile',
    needsCompanion: false,
    hint: 'The key face renders live data — clock, timer, CPU, volume, now playing.',
  },
  plugin: {
    label: 'Plugin action',
    needsCompanion: true,
    hint: 'Provided by an installed plugin.',
  },
  multi: {
    label: 'Macro (multiple steps)',
    needsCompanion: true,
    hint: 'Runs several actions in order.',
  },
};

export const DEFAULT_MIC_FACES = {
  live: { label: 'LIVE', sublabel: 'Mic on', bg: 0x1ce9 }, // green
  muted: { label: 'MUTED', sublabel: 'Mic off', bg: 0xc186 }, // red
};

export function defaultActionForType(type: KeyActionType, hid: number): KeyAction {
  switch (type) {
    case 'hid':
      return { type: 'hid', code: hid };
    case 'hotkey':
      return { type: 'hotkey', keys: '' };
    case 'launch':
      return { type: 'launch', target: '' };
    case 'open_url':
      return { type: 'open_url', url: '' };
    case 'shell':
      return { type: 'shell', command: '' };
    case 'mic_mute':
      return { type: 'mic_mute', faces: DEFAULT_MIC_FACES };
    case 'obs_scene':
      return { type: 'obs_scene', scene: '' };
    case 'page_next':
      return { type: 'page_next' };
    case 'page_prev':
      return { type: 'page_prev' };
    case 'page':
      return { type: 'page', page: 0 };
    case 'tile':
      return { type: 'tile', kind: 'clock' };
    case 'plugin':
      return { type: 'plugin', plugin: '', settings: {} };
    case 'multi':
      return { type: 'multi', steps: [], delay_ms: 150 };
  }
}

export const TILE_KIND_META: Record<TileKind, { label: string; hint: string }> = {
  clock: { label: 'Clock', hint: 'Time and date, updated every second.' },
  timer: { label: 'Timer', hint: 'Stopwatch — press the key to start/stop, long values keep counting.' },
  cpu: { label: 'CPU / RAM', hint: 'Live system load (desktop companion only).' },
  volume: { label: 'Volume', hint: 'System output volume (desktop companion only).' },
  now_playing: { label: 'Now playing', hint: 'Current Spotify / Apple Music track (desktop companion only).' },
  obs_scene: { label: 'OBS scene', hint: 'Shows the live program scene name.' },
};

/** Human-readable one-liner for logs and the simulator console. */
export function describeAction(action: KeyAction): string {
  switch (action.type) {
    case 'hid':
      return `send HID ${action.code}`;
    case 'hotkey':
      return `press ${action.keys || '(unset)'}`;
    case 'launch':
      return `launch ${action.target || '(unset)'}`;
    case 'open_url':
      return `open ${action.url || '(unset)'}`;
    case 'shell':
      return `run: ${action.command || '(unset)'}`;
    case 'mic_mute':
      return 'toggle mic mute';
    case 'obs_scene':
      return `OBS scene → ${action.scene || '(unset)'}`;
    case 'page_next':
      return 'next deck page';
    case 'page_prev':
      return 'previous deck page';
    case 'page':
      return `deck page ${action.page + 1}`;
    case 'tile':
      return `live tile: ${TILE_KIND_META[action.kind].label}`;
    case 'plugin':
      return `plugin: ${action.plugin || '(unset)'}`;
    case 'multi':
      return `macro (${action.steps.length} steps)`;
  }
}
