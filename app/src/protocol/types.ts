/** Serial protocol v0.4 — typed commands and events */

// ── Device → Host events ─────────────────────────────────────

export interface InfoEvent {
  event: 'info';
  name: string;
  fw: string;
  keys: number;
  /** Page support (v0.10+): number of pages and the currently shown page */
  pages?: number;
  page?: number;
  sd?: boolean | string;
  psram?: number;
  /** Deck orientation 0–3 (v0.9+): 0 portrait, 1 landscape CW, 2 flipped, 3 landscape CCW */
  orient?: number;
}

/** Emitted whenever the shown page changes (SET_PAGE or on-device key). */
export interface PageEvent {
  event: 'page';
  page: number;
}

/** Emitted when the deck's page count changes (SET_PAGES, v0.11+). */
export interface PagesEvent {
  event: 'pages';
  pages: number;
}

export interface KeyEvent {
  event: 'key';
  index: number;
  action: 'press' | 'release';
}

export interface KeyStateEvent {
  event: 'key_state';
  /** Global key slot (0..23 from v0.10; 0..5 on older firmware) */
  index: number;
  /** Page the slot belongs to — present from firmware v0.10 */
  page?: number;
  label: string;
  sublabel: string;
  hid: number;
  /** RGB565 background — present from firmware v0.7.1 */
  bg?: number;
  /** Overlay flag (text drawn over media) — present from firmware v0.8 */
  ov?: number;
}

export interface PongEvent {
  event: 'pong';
}

export interface OkEvent {
  event: 'ok';
  cmd: string;
  index?: number;
}

export interface ErrorEvent {
  event: 'error';
  msg: string;
  index?: number;
}

export interface SendDataEvent {
  event: 'send_data';
}

export interface AnimEvent {
  event: 'anim';
  index: number;
  frames: number;
  fps: number;
}

export interface SdMountedEvent {
  event: 'sd';
  size_mb: number;
  used_mb: number;
}

export interface SdUnmountedEvent {
  event: 'sd';
  mounted: false;
}

export interface SdEntryEvent {
  event: 'sd_entry';
  name: string;
  dir: boolean;
  size: number;
}

export interface SdLsDoneEvent {
  event: 'sd_ls_done';
  path: string;
  count: number;
}

export type DeviceEvent =
  | InfoEvent
  | PageEvent
  | PagesEvent
  | KeyEvent
  | KeyStateEvent
  | PongEvent
  | OkEvent
  | ErrorEvent
  | SendDataEvent
  | AnimEvent
  | SdMountedEvent
  | SdUnmountedEvent
  | SdEntryEvent
  | SdLsDoneEvent;

// ── Host → Device commands ───────────────────────────────────

export type HostCommand =
  | { type: 'PING' }
  | { type: 'INFO' }
  | { type: 'GET_KEYS' }
  | { type: 'DRAW'; index: number }
  | { type: 'DRAW_ALL' }
  | { type: 'SET_KEY'; payload: SetKeyPayload }
  | { type: 'SET_IMAGE'; payload: SetImagePayload }
  | { type: 'SET_FACE'; payload: SetImagePayload }
  | { type: 'SET_ANIM'; payload: SetAnimPayload }
  | { type: 'ANIM'; index: number; fps: number }
  | { type: 'ANIM_STOP' }
  | { type: 'ANIM_CLEAR'; index: number }
  | { type: 'SD_INFO' }
  | { type: 'SD_LS'; path: string }
  | { type: 'SD_RM'; path: string }
  | { type: 'SET_ORIENT'; orient: number }
  | { type: 'SET_PAGE'; page: number }
  | { type: 'SET_PAGES'; pages: number };

export interface SetKeyPayload {
  index: number;
  label?: string;
  sublabel?: string;
  hid?: number;
  bg?: number;
  /** Overlay flag: draw label/sublabel over SD media at render time (v0.8+) */
  ov?: number;
  /** App-side glyph name; firmware ignores unknown fields */
  icon?: string;
}

/** Shared by SET_IMAGE (persists to SD) and SET_FACE (draw-only, v0.10+). */
export interface SetImagePayload {
  index: number;
  len: number;
}

export interface SetAnimPayload {
  index: number;
  /** 1-based frame number → /osd/keys/N/anim/0001.rgb565 … */
  frame: number;
  len: number;
}

export interface KeyConfig {
  index: number;
  label: string;
  sublabel: string;
  hid: number;
  bg: number;
  fg: number;
  /** App-side glyph name (optional; older profiles omit it) */
  icon?: string;
}

/**
 * Profile schema:
 * v1 — device key configs only (6 keys).
 * v2 — adds host-side `actions` (launch app, hotkey, mic mute, …).
 * v4 — page-aware: up to 24 keys/actions (slot = page*6 + position).
 * Loaders accept all; v1 keys map to `{type:'hid'}` actions, and 6-key
 * profiles fill page 0 leaving other pages at defaults.
 */
export interface ProfileData {
  version: 1 | 2 | 4;
  keys: Omit<KeyConfig, 'index'>[];
  /** v2+: one host action per key slot (JSON shape from actions/types.ts) */
  actions?: unknown[];
}
