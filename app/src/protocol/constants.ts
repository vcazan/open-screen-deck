/** Canonical device constants — mirrors firmware/main.cpp */

export const KEY_COUNT = 6; // physical screens/switches
/** Storage ceiling — decks have 1..MAX_PAGES pages, user-controlled */
export const MAX_PAGES = 8;
/** Global key slot ceiling — slot = page*KEY_COUNT + position */
export const TOTAL_KEYS = KEY_COUNT * MAX_PAGES;
export const FRAME_WIDTH = 128;
export const FRAME_HEIGHT = 128;
export const FRAME_BYTES = FRAME_WIDTH * FRAME_HEIGHT * 2; // 32768 RGB565

export const FIRMWARE_VERSION = '0.11.0';
export const DEVICE_NAME = 'Open Screen Deck';

/**
 * Reserved HID codes — a key configured with one of these switches pages
 * on-device (firmware-owned, works standalone and under the companion).
 * They live in the 219–239 gap of the Arduino keymap, clear of F13–F24.
 */
export const HID_PAGE_PREV = 230;
export const HID_PAGE_NEXT = 231;
export const HID_PAGE_BASE = 232; // 232..239 → go to page 0..7

/**
 * Arduino USBHIDKeyboard codes for F13–F24 (ESP32 core: KEY_F13 = 0xF0).
 * Verified against real firmware via GET_KEYS on hardware.
 */
export const HID_F13 = 240;
export const HID_F14 = 241;
export const HID_F15 = 242;
export const HID_F16 = 243;
export const HID_F17 = 244;
export const HID_F18 = 245;
export const HID_F19 = 246;
export const HID_F20 = 247;
export const HID_F21 = 248;
export const HID_F22 = 249;
export const HID_F23 = 250;
export const HID_F24 = 251;

export const HID_F_KEYS: { label: string; code: number }[] = [
  { label: 'F13', code: HID_F13 },
  { label: 'F14', code: HID_F14 },
  { label: 'F15', code: HID_F15 },
  { label: 'F16', code: HID_F16 },
  { label: 'F17', code: HID_F17 },
  { label: 'F18', code: HID_F18 },
  { label: 'F19', code: HID_F19 },
  { label: 'F20', code: HID_F20 },
  { label: 'F21', code: HID_F21 },
  { label: 'F22', code: HID_F22 },
  { label: 'F23', code: HID_F23 },
  { label: 'F24', code: HID_F24 },
];

export function hidCodeToLabel(code: number): string {
  const match = HID_F_KEYS.find((k) => k.code === code);
  if (match) return match.label;
  return `0x${code.toString(16).toUpperCase()}`;
}

/** ST77XX color constants used by firmware */
export const ST77XX_WHITE = 0xffff;
export const ST77XX_CYAN = 0x07ff;

/**
 * Transparency sentinel (near-black, visually indistinguishable): pixels
 * with this exact value are replaced by the key's background color at draw
 * time — on the device and in the simulator. Lets logos sit on any key
 * color without re-uploading pixels.
 */
export const TRANSPARENT_565 = 0x0821;

export interface DefaultKeyConfig {
  label: string;
  sublabel: string;
  hid: number;
  bg: number;
  fg: number;
  /** Glyph name from ui/icons.ts — app-side only, firmware ignores it */
  icon: string;
}

/** Default key configs — labels/HID mirror keys[] in firmware/main.cpp */
export const DEFAULT_KEYS: DefaultKeyConfig[] = [
  { label: 'MUTE', sublabel: 'Toggle', hid: HID_F13, bg: 0x1ce9, fg: ST77XX_WHITE, icon: 'mute' },
  { label: 'SCENE 1', sublabel: 'OBS', hid: HID_F14, bg: 0x2a7c, fg: ST77XX_WHITE, icon: 'camera' },
  { label: 'SCENE 2', sublabel: 'OBS', hid: HID_F15, bg: 0x2a7c, fg: ST77XX_CYAN, icon: 'camera' },
  { label: 'CLIP', sublabel: 'Record', hid: HID_F16, bg: 0xc186, fg: ST77XX_WHITE, icon: 'record' },
  { label: 'BROWSER', sublabel: 'Win', hid: HID_F17, bg: 0x194b, fg: ST77XX_WHITE, icon: 'globe' },
  { label: 'MACRO', sublabel: 'Custom', hid: HID_F18, bg: 0x1ce9, fg: ST77XX_WHITE, icon: 'bolt' },
];

/** Default config for any global slot — page 0 uses DEFAULT_KEYS, pages 1–3 blanks. */
export function defaultKeyForSlot(slot: number): DefaultKeyConfig {
  if (slot < KEY_COUNT) return DEFAULT_KEYS[slot];
  return {
    label: `KEY ${(slot % KEY_COUNT) + 1}`,
    sublabel: '',
    hid: HID_F13 + (slot % 12),
    bg: 0x2124, // dark gray — mirrors firmware page 1–3 defaults
    fg: ST77XX_WHITE,
    icon: 'bolt',
  };
}

export const NVS_STORAGE_KEY = 'osd-simulator-nvs-v2';
export const SD_STORAGE_KEY = 'osd-simulator-sd';

/** Simulated SD card capacity (matches typical 8 GB card reporting) */
export const SIM_SD_SIZE_MB = 8192;
