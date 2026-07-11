/**
 * SimulatedDevice — in-process virtual firmware mirroring main.cpp behavior.
 * No React dependencies.
 */

import {
  DEVICE_NAME,
  FIRMWARE_VERSION,
  FRAME_BYTES,
  HID_PAGE_BASE,
  HID_PAGE_NEXT,
  HID_PAGE_PREV,
  KEY_COUNT,
  MAX_PAGES,
  NVS_STORAGE_KEY,
  SD_STORAGE_KEY,
  SIM_SD_SIZE_MB,
  TAP_WINDOW_MS,
  TOTAL_KEYS,
  defaultKeyForSlot,
} from '../protocol/constants';
import {
  extractJsonInt,
  extractJsonString,
  serializeDeviceEvent,
} from '../protocol/codec';
import type { DeviceEvent } from '../protocol/types';
import {
  createKeyCanvas,
  drawKeyPressedEffect,
  drawKeyToCanvas,
  drawRgb565ToCanvas,
  getKeyContext,
} from './drawKey';
import { drawOverlay } from '../utils/overlay';
import { substituteTransparency } from '../protocol/rgb565';

export type LineCallback = (line: string) => void;
export type StateCallback = () => void;

interface StoredKeyConfig {
  label: string;
  sublabel: string;
  hidKey: number;
  /** Double/triple press HID bindings — 0/undefined = unbound (fw v0.12) */
  hid2?: number;
  hid3?: number;
  bgColor: number;
  fgColor: number;
  /** App-side glyph name; not part of the firmware NVS schema */
  icon?: string;
  /** Draw label/sublabel over SD media at render time (firmware "ov") */
  overlay?: boolean;
}

interface AnimMeta {
  fps: number;
  frames: number;
  loop: boolean;
}

interface SdStore {
  icons: Record<number, Uint8Array>;
  animations: Record<number, { frames: Uint8Array[]; meta: AnimMeta }>;
  usedBytes: number;
}

export interface KeyMediaState {
  hasIcon: boolean;
  animFrames: number;
}

export interface SimulatedDeviceState {
  /** All 24 global key slots (slot = page*6 + position) */
  keys: StoredKeyConfig[];
  /** 6 physical screens — canvas i shows the current page's position i */
  canvases: HTMLCanvasElement[];
  animKey: number;
  lastHidSent: { index: number; code: number; label: string } | null;
  sdMounted: boolean;
  media: KeyMediaState[];
  /** 0 portrait · 1 landscape CW · 2 flipped · 3 landscape CCW */
  orientation: number;
  /** Currently shown page */
  page: number;
  /** How many pages this deck has right now (user adds/removes them) */
  pages: number;
  maxPages: number;
}

export class SimulatedDevice {
  private keys: StoredKeyConfig[];
  private canvases: HTMLCanvasElement[];
  private contexts: CanvasRenderingContext2D[];
  private lineCb: LineCallback | null = null;
  private stateCb: StateCallback | null = null;
  /** Mirror mode: process commands without emitting responses. */
  private muted = false;

  private animKey = -1;
  private animFrame = 0;
  private animCount = 0;
  private animFps = 10;
  private animTimer: ReturnType<typeof setInterval> | null = null;

  private pendingBinary: {
    kind: 'image' | 'anim' | 'face';
    index: number;
    frame: number;
    len: number;
  } | null = null;
  private binaryBuffer: Uint8Array | null = null;
  private binaryReceived = 0;

  private sd: SdStore;
  private sdMounted = true;
  private lastHidSent: { index: number; code: number; label: string } | null = null;
  private orientation = 0;
  private page = 0;
  private pageCount = 1;

  // ── Page/slot helpers (mirrors firmware v0.10) ─────────────
  private posOfSlot(slot: number): number {
    return slot % KEY_COUNT;
  }
  private slotOfPos(pos: number): number {
    return this.page * KEY_COUNT + pos;
  }
  private slotVisible(slot: number): boolean {
    return Math.floor(slot / KEY_COUNT) === this.page;
  }

  constructor() {
    this.keys = Array.from({ length: TOTAL_KEYS }, (_, s) => {
      const d = defaultKeyForSlot(s);
      return {
        label: d.label,
        sublabel: d.sublabel,
        hidKey: d.hid,
        bgColor: d.bg,
        fgColor: d.fg,
        icon: d.icon,
      };
    });

    this.canvases = [];
    this.contexts = [];
    for (let i = 0; i < KEY_COUNT; i++) {
      const canvas = createKeyCanvas();
      this.canvases.push(canvas);
      this.contexts.push(getKeyContext(canvas));
    }

    this.sd = { icons: {}, animations: {}, usedBytes: 0 };
    this.loadNvs();
    this.loadSd();
    this.loadOrientation();
    this.loadPage();
    for (let p = 0; p < KEY_COUNT; p++) {
      this.drawKey(this.slotOfPos(p));
    }
  }

  onLine(cb: LineCallback): void {
    this.lineCb = cb;
  }

  onState(cb: StateCallback): void {
    this.stateCb = cb;
  }

  getState(): SimulatedDeviceState {
    return {
      keys: this.keys.map((k) => ({ ...k })),
      canvases: this.canvases,
      animKey: this.animKey,
      lastHidSent: this.lastHidSent,
      sdMounted: this.sdMounted,
      media: Array.from({ length: TOTAL_KEYS }, (_, i) => ({
        hasIcon: this.sd.icons[i] !== undefined,
        animFrames: this.sd.animations[i]?.frames.length ?? 0,
      })),
      orientation: this.orientation,
      page: this.page,
      pages: this.pageCount,
      maxPages: MAX_PAGES,
    };
  }

  getCanvas(index: number): HTMLCanvasElement {
    return this.canvases[index];
  }

  /** Deep copy of stored media — used when saving profiles. */
  getMediaSnapshot(): {
    icons: Record<number, Uint8Array>;
    animations: Record<number, { fps: number; frames: Uint8Array[] }>;
  } {
    const icons: Record<number, Uint8Array> = {};
    const animations: Record<number, { fps: number; frames: Uint8Array[] }> = {};
    for (const [k, v] of Object.entries(this.sd.icons)) {
      icons[Number(k)] = new Uint8Array(v);
    }
    for (const [k, v] of Object.entries(this.sd.animations)) {
      animations[Number(k)] = {
        fps: v.meta.fps,
        frames: v.frames.filter(Boolean).map((f) => new Uint8Array(f)),
      };
    }
    return { icons, animations };
  }

  /** Boot sequence — emit info event after delay (mirrors setup()). */
  boot(): void {
    setTimeout(() => this.emitInfo(), 500);
  }

  // ── Mirror mode (USB) ──────────────────────────────────────
  // When the app talks to real hardware, the same commands are replayed
  // here silently so the on-screen deck reflects the physical one.

  /** Apply a host command without emitting any device responses. */
  mirrorLine(line: string): void {
    this.muted = true;
    try {
      this.handleLine(line);
    } finally {
      this.muted = false;
    }
  }

  /** Apply a binary payload (SET_IMAGE / SET_ANIM data) silently. */
  mirrorBytes(bytes: Uint8Array): void {
    this.muted = true;
    try {
      this.handleBytes(bytes);
    } finally {
      this.muted = false;
    }
  }

  /** Sync one key's config from a device key_state line (GET_KEYS). */
  mirrorKeyState(
    index: number,
    label: string,
    sublabel: string,
    hid: number,
    bg?: number,
    ov?: number,
    h2?: number,
    h3?: number,
  ): void {
    const k = this.keys[index];
    if (!k) return;
    k.label = label;
    k.sublabel = sublabel;
    k.hidKey = hid;
    if (h2 !== undefined) k.hid2 = h2;
    if (h3 !== undefined) k.hid3 = h3;
    if (bg !== undefined) k.bgColor = bg;
    if (ov !== undefined) k.overlay = ov !== 0;
    this.drawKey(index);
  }

  /** Handle a newline-terminated command line from the host. */
  handleLine(line: string): void {
    const trimmed = line.trim();
    if (this.pendingBinary) {
      return;
    }

    if (trimmed === 'PING') {
      this.emit({ event: 'pong' });
    } else if (trimmed === 'INFO') {
      this.emitInfo();
    } else if (trimmed === 'GET_KEYS') {
      this.printKeyState();
    } else if (trimmed.startsWith('DRAW ')) {
      const idx = parseInt(trimmed.slice(5), 10);
      if (idx >= 0 && idx < TOTAL_KEYS) this.drawKey(idx);
    } else if (trimmed === 'DRAW_ALL') {
      this.stopAnimation();
      for (let p = 0; p < KEY_COUNT; p++) this.drawKey(this.slotOfPos(p));
    } else if (trimmed.startsWith('SET_KEY ')) {
      this.handleSetKey(trimmed);
    } else if (trimmed.startsWith('SET_IMAGE ')) {
      this.handleSetImageHeader(trimmed);
    } else if (trimmed.startsWith('SET_FACE ')) {
      this.handleSetFaceHeader(trimmed);
    } else if (trimmed.startsWith('SET_ANIM ')) {
      this.handleSetAnimHeader(trimmed);
    } else if (trimmed.startsWith('ANIM_CLEAR')) {
      this.handleAnimClear(trimmed);
    } else if (trimmed.startsWith('ANIM ')) {
      this.handleAnim(trimmed);
    } else if (trimmed === 'SD_INFO') {
      this.handleSdInfo();
    } else if (trimmed.startsWith('SET_ORIENT')) {
      const o = parseInt(trimmed.slice(10), 10);
      if (isNaN(o) || o < 0 || o > 3) {
        this.emit({ event: 'error', msg: 'bad_orientation' });
      } else {
        this.stopAnimation();
        this.orientation = o;
        this.saveOrientation();
        for (let p = 0; p < KEY_COUNT; p++) this.drawKey(this.slotOfPos(p));
        this.emit({ event: 'ok', cmd: 'SET_ORIENT' });
        this.notifyState();
      }
    } else if (trimmed.startsWith('SET_PAGES ')) {
      const n = parseInt(trimmed.slice(10), 10);
      if (isNaN(n) || n < 1 || n > MAX_PAGES) {
        this.emit({ event: 'error', msg: 'bad_page_count' });
      } else {
        this.setPageCount(n);
        this.emit({ event: 'ok', cmd: 'SET_PAGES' });
      }
    } else if (trimmed.startsWith('SET_PAGE ')) {
      const p = parseInt(trimmed.slice(9), 10);
      if (isNaN(p) || p < 0 || p >= this.pageCount) {
        this.emit({ event: 'error', msg: 'bad_page' });
      } else {
        this.switchPage(p);
        this.emit({ event: 'ok', cmd: 'SET_PAGE' });
      }
    } else if (trimmed.startsWith('SD_LS')) {
      this.handleSdLs(trimmed.slice(5).trim() || '/');
    } else if (trimmed.startsWith('SD_RM ')) {
      this.handleSdRm(trimmed.slice(6).trim());
    } else {
      this.emit({ event: 'error', msg: 'unknown_command' });
    }
  }

  /** Handle raw binary payload following send_data (SET_IMAGE / SET_ANIM). */
  handleBytes(bytes: Uint8Array): void {
    if (!this.pendingBinary || !this.binaryBuffer) return;

    const remaining = this.pendingBinary.len - this.binaryReceived;
    const toCopy = Math.min(bytes.length, remaining);
    this.binaryBuffer.set(bytes.subarray(0, toCopy), this.binaryReceived);
    this.binaryReceived += toCopy;

    if (this.binaryReceived >= this.pendingBinary.len) {
      const { kind, index: idx, frame } = this.pendingBinary;
      const data = this.binaryBuffer.subarray(0, FRAME_BYTES);

      if (data.length !== FRAME_BYTES) {
        this.emit({ event: 'error', msg: kind === 'image' ? 'image_timeout' : 'anim_timeout' });
      } else if (kind === 'face') {
        // Live tile frame — drawn only, never persisted (mirrors SET_FACE)
        if (this.slotVisible(idx)) {
          if (this.animKey === idx) this.stopAnimation();
          drawRgb565ToCanvas(this.contexts[this.posOfSlot(idx)], data);
        }
        this.emit({ event: 'ok', cmd: 'SET_FACE', index: idx });
        this.notifyState();
      } else if (kind === 'image') {
        this.stopAnimation();
        if (this.sdMounted) {
          this.sd.icons[idx] = new Uint8Array(data);
          this.recalcSdUsage();
          this.saveSd();
          this.drawKey(idx); // from SD: applies transparency + overlay
        } else if (this.slotVisible(idx)) {
          drawRgb565ToCanvas(this.contexts[this.posOfSlot(idx)], data);
        }
        this.emit({ event: 'ok', cmd: 'SET_IMAGE', index: idx });
        this.notifyState();
      } else {
        // Anim frame → simulated SD (mirrors /osd/keys/N/anim/%04u.rgb565)
        if (this.sdMounted) {
          const anim = (this.sd.animations[idx] ??= {
            frames: [],
            meta: { fps: 10, frames: 0, loop: true },
          });
          anim.frames[frame - 1] = new Uint8Array(data);
          anim.meta.frames = anim.frames.length;
          this.recalcSdUsage();
          this.saveSd();
          this.emit({ event: 'ok', cmd: 'SET_ANIM', index: idx });
        } else {
          this.emit({ event: 'error', msg: 'sd_write_failed' });
        }
      }

      this.pendingBinary = null;
      this.binaryBuffer = null;
      this.binaryReceived = 0;
    }
  }

  // ── Multi-tap engine (mirrors firmware v0.12) ──────────────
  // Only keys with a double/triple binding wait for the tap window —
  // single-only keys resolve on the first press with zero latency.

  private tapCount: number[] = Array(KEY_COUNT).fill(0);
  private tapSlot: number[] = Array(KEY_COUNT).fill(0);
  private tapTimers: (ReturnType<typeof setTimeout> | null)[] = Array(KEY_COUNT).fill(null);

  private maxTapsFor(slot: number): number {
    const k = this.keys[slot];
    if (k?.hid3) return 3;
    if (k?.hid2) return 2;
    return 1;
  }

  private fireTap(slot: number, taps: number): void {
    const k = this.keys[slot];
    const hid = taps >= 3 ? (k.hid3 ?? 0) : taps === 2 ? (k.hid2 ?? 0) : k.hidKey;

    // Page switching is firmware-owned — reserved HID codes never type
    if (hid === HID_PAGE_NEXT) {
      setTimeout(() => this.switchPage((this.page + 1) % this.pageCount), 90);
    } else if (hid === HID_PAGE_PREV) {
      setTimeout(
        () => this.switchPage((this.page + this.pageCount - 1) % this.pageCount),
        90,
      );
    } else if (hid >= HID_PAGE_BASE && hid < HID_PAGE_BASE + MAX_PAGES) {
      setTimeout(() => this.switchPage(hid - HID_PAGE_BASE), 90);
    } else if (hid !== 0 && !(hid >= 224 && hid <= 239)) {
      this.lastHidSent = {
        index: slot % KEY_COUNT,
        code: hid,
        label: this.hidLabel(hid),
      };
      this.notifyState();
    }

    this.emit({ event: 'key', index: slot, action: 'press', taps });
  }

  private resolveTaps(position: number): void {
    const taps = this.tapCount[position];
    const slot = this.tapSlot[position];
    this.tapCount[position] = 0;
    if (this.tapTimers[position]) {
      clearTimeout(this.tapTimers[position]!);
      this.tapTimers[position] = null;
    }
    if (taps === 0) return;
    this.fireTap(slot, Math.min(taps, this.maxTapsFor(slot)));
  }

  /** Simulate a physical key press at a visible position (0..5). */
  press(position: number): void {
    if (position < 0 || position >= KEY_COUNT) return;
    const slot = this.slotOfPos(position);
    drawKeyPressedEffect(this.contexts[position]);
    this.notifyState();
    setTimeout(() => {
      this.drawKey(slot);
      this.notifyState();
    }, 80);

    if (this.tapCount[position] === 0) {
      // First press: single-only keys fire immediately, no tap window
      if (this.maxTapsFor(slot) === 1) {
        this.fireTap(slot, 1);
        return;
      }
      this.tapSlot[position] = slot;
    }
    this.tapCount[position]++;
    if (this.tapTimers[position]) clearTimeout(this.tapTimers[position]!);

    // Highest bound level reached — resolve now instead of waiting
    if (this.tapCount[position] >= this.maxTapsFor(this.tapSlot[position])) {
      this.resolveTaps(position);
      return;
    }
    this.tapTimers[position] = setTimeout(() => this.resolveTaps(position), TAP_WINDOW_MS);
  }

  /** Show a page on the six screens — persists like firmware NVS. */
  private switchPage(page: number): void {
    if (page < 0 || page >= this.pageCount || page === this.page) {
      if (page === this.page) this.emit({ event: 'page', page: this.page });
      return;
    }
    this.stopAnimation();
    this.page = page;
    for (let p = 0; p < KEY_COUNT; p++) this.drawKey(this.slotOfPos(p));
    this.savePage();
    this.emit({ event: 'page', page: this.page });
    this.notifyState();
  }

  /**
   * Resize the page list (mirrors firmware setPageCount). Slots dropped by
   * a shrink reset to defaults so a re-added page starts fresh.
   */
  private setPageCount(n: number): void {
    if (n < 1 || n > MAX_PAGES || n === this.pageCount) return;
    if (n < this.pageCount) {
      for (let s = n * KEY_COUNT; s < this.pageCount * KEY_COUNT; s++) {
        const d = defaultKeyForSlot(s);
        this.keys[s] = {
          label: d.label,
          sublabel: d.sublabel,
          hidKey: d.hid,
          bgColor: d.bg,
          fgColor: d.fg,
          icon: d.icon,
        };
        // Dropped pages lose their media too — the firmware equivalent is
        // the app cleaning SD paths on remove
        delete this.sd.icons[s];
        delete this.sd.animations[s];
      }
      this.recalcSdUsage();
      this.saveSd();
      this.saveNvs();
    }
    this.pageCount = n;
    if (this.page >= this.pageCount) {
      this.page = this.pageCount - 1;
      for (let p = 0; p < KEY_COUNT; p++) this.drawKey(this.slotOfPos(p));
      this.emit({ event: 'page', page: this.page });
    }
    this.savePage();
    this.emit({ event: 'pages', pages: this.pageCount });
    this.notifyState();
  }

  /** USB mirror: adopt the physical deck's page (INFO / page events). */
  mirrorPage(page: number): void {
    if (page >= 0 && page < this.pageCount && page !== this.page) {
      this.stopAnimation();
      this.page = page;
      for (let p = 0; p < KEY_COUNT; p++) this.drawKey(this.slotOfPos(p));
      this.notifyState();
    }
  }

  /** USB mirror: adopt the physical deck's page count (INFO / pages events). */
  mirrorPages(pages: number): void {
    if (pages >= 1 && pages <= MAX_PAGES && pages !== this.pageCount) {
      this.pageCount = pages;
      if (this.page >= pages) this.page = pages - 1;
      this.notifyState();
    }
  }

  private savePage(): void {
    try {
      localStorage.setItem('osd-simulator-page', String(this.page));
      localStorage.setItem('osd-simulator-pages', String(this.pageCount));
    } catch {
      // Storage unavailable
    }
  }

  private loadPage(): void {
    const rawCount = localStorage.getItem('osd-simulator-pages');
    const n = rawCount ? parseInt(rawCount, 10) : 1;
    if (n >= 1 && n <= MAX_PAGES) this.pageCount = n;
    const raw = localStorage.getItem('osd-simulator-page');
    const p = raw ? parseInt(raw, 10) : 0;
    if (p >= 0 && p < this.pageCount) this.page = p;
  }

  release(_index: number): void {
    // Firmware only emits press events
  }

  resetToDefaults(): void {
    this.stopAnimation();
    this.pageCount = 1;
    this.page = 0;
    this.savePage();
    this.keys = Array.from({ length: TOTAL_KEYS }, (_, s) => {
      const d = defaultKeyForSlot(s);
      return {
        label: d.label,
        sublabel: d.sublabel,
        hidKey: d.hid,
        bgColor: d.bg,
        fgColor: d.fg,
        icon: d.icon,
      };
    });
    this.sd = { icons: {}, animations: {}, usedBytes: 0 };
    localStorage.removeItem(NVS_STORAGE_KEY);
    localStorage.removeItem(SD_STORAGE_KEY);
    for (let p = 0; p < KEY_COUNT; p++) {
      this.drawKey(this.slotOfPos(p));
    }
    this.saveNvs();
    this.saveSd();
    this.notifyState();
  }

  // ── Private ────────────────────────────────────────────────

  private emit(event: DeviceEvent): void {
    if (this.muted) return;
    const line = serializeDeviceEvent(event);
    this.lineCb?.(line);
  }

  private emitInfo(): void {
    this.emit({
      event: 'info',
      name: DEVICE_NAME,
      fw: FIRMWARE_VERSION,
      keys: KEY_COUNT,
      pages: this.pageCount,
      page: this.page,
      sd: this.sdMounted,
      psram: 8 * 1024 * 1024,
      orient: this.orientation,
    });
  }

  /** USB mirror: adopt the physical deck's orientation from its INFO line. */
  mirrorOrientation(orient: number): void {
    if (orient >= 0 && orient <= 3 && orient !== this.orientation) {
      this.orientation = orient;
      this.notifyState();
    }
  }

  private saveOrientation(): void {
    try {
      localStorage.setItem('osd-simulator-orient', String(this.orientation));
    } catch {
      // Storage unavailable
    }
  }

  private loadOrientation(): void {
    const raw = localStorage.getItem('osd-simulator-orient');
    const o = raw ? parseInt(raw, 10) : 0;
    if (o >= 0 && o <= 3) this.orientation = o;
  }

  private printKeyState(): void {
    for (let i = 0; i < this.pageCount * KEY_COUNT; i++) {
      this.emit({
        event: 'key_state',
        index: i,
        page: Math.floor(i / KEY_COUNT),
        label: this.keys[i].label,
        sublabel: this.keys[i].sublabel,
        hid: this.keys[i].hidKey,
        h2: this.keys[i].hid2 ?? 0,
        h3: this.keys[i].hid3 ?? 0,
        bg: this.keys[i].bgColor,
        ov: this.keys[i].overlay ? 1 : 0,
      });
    }
  }

  private handleSetKey(line: string): void {
    const idx = extractJsonInt(line, 'index', -1);
    if (idx < 0 || idx >= TOTAL_KEYS) {
      this.emit({ event: 'error', msg: 'bad_index' });
      return;
    }
    const lbl = extractJsonString(line, 'label');
    const sub = extractJsonString(line, 'sublabel');
    const icon = extractJsonString(line, 'icon');
    const hid = extractJsonInt(line, 'hid', this.keys[idx].hidKey);
    const h2 = extractJsonInt(line, 'h2', this.keys[idx].hid2 ?? 0);
    const h3 = extractJsonInt(line, 'h3', this.keys[idx].hid3 ?? 0);
    const bg = extractJsonInt(line, 'bg', this.keys[idx].bgColor);
    const ov = extractJsonInt(line, 'ov', this.keys[idx].overlay ? 1 : 0);

    // null = field absent (keep current); '' = explicit clear
    if (lbl !== null) this.keys[idx].label = lbl.slice(0, 15);
    if (sub !== null) this.keys[idx].sublabel = sub.slice(0, 15);
    if (icon !== null && icon.length) this.keys[idx].icon = icon;
    this.keys[idx].hidKey = hid;
    this.keys[idx].hid2 = h2;
    this.keys[idx].hid3 = h3;
    this.keys[idx].bgColor = bg;
    this.keys[idx].overlay = ov !== 0;

    this.saveConfig(idx);
    this.drawKey(idx);
    this.emit({ event: 'ok', cmd: 'SET_KEY', index: idx });
    this.notifyState();
  }

  private handleSetImageHeader(line: string): void {
    const idx = extractJsonInt(line, 'index', -1);
    const len = extractJsonInt(line, 'len', 0);
    if (idx < 0 || idx >= TOTAL_KEYS || len !== FRAME_BYTES) {
      this.emit({ event: 'error', msg: 'bad_image_header' });
      return;
    }
    this.pendingBinary = { kind: 'image', index: idx, frame: 0, len };
    this.binaryBuffer = new Uint8Array(len);
    this.binaryReceived = 0;
    this.emit({ event: 'send_data' });
  }

  private handleSetFaceHeader(line: string): void {
    const idx = extractJsonInt(line, 'index', -1);
    const len = extractJsonInt(line, 'len', 0);
    if (idx < 0 || idx >= TOTAL_KEYS || len !== FRAME_BYTES) {
      this.emit({ event: 'error', msg: 'bad_face_header' });
      return;
    }
    this.pendingBinary = { kind: 'face', index: idx, frame: 0, len };
    this.binaryBuffer = new Uint8Array(len);
    this.binaryReceived = 0;
    this.emit({ event: 'send_data' });
  }

  private handleSetAnimHeader(line: string): void {
    const idx = extractJsonInt(line, 'index', -1);
    const frame = extractJsonInt(line, 'frame', 0);
    const len = extractJsonInt(line, 'len', 0);
    if (idx < 0 || idx >= TOTAL_KEYS || frame < 1 || frame > 999 || len !== FRAME_BYTES || !this.sdMounted) {
      this.emit({ event: 'error', msg: 'bad_anim_header' });
      return;
    }
    this.pendingBinary = { kind: 'anim', index: idx, frame, len };
    this.binaryBuffer = new Uint8Array(len);
    this.binaryReceived = 0;
    this.emit({ event: 'send_data' });
  }

  private handleAnimClear(line: string): void {
    const idx = parseInt(line.slice(10), 10);
    if (isNaN(idx) || idx < 0 || idx >= TOTAL_KEYS) {
      this.emit({ event: 'error', msg: 'bad_index' });
      return;
    }
    if (this.animKey === idx) this.stopAnimation();
    delete this.sd.animations[idx];
    this.recalcSdUsage();
    this.saveSd();
    this.emit({ event: 'ok', cmd: 'ANIM_CLEAR', index: idx });
    this.notifyState();
  }

  private handleAnim(line: string): void {
    const rest = line.slice(5);
    if (rest === 'STOP') {
      this.stopAnimation();
      this.emit({ event: 'ok', cmd: 'ANIM_STOP' });
      return;
    }
    const sp = rest.indexOf(' ');
    const idx = parseInt(rest, 10);
    const fps = sp > 0 ? parseInt(rest.slice(sp + 1), 10) : 10;
    if (idx >= 0 && idx < TOTAL_KEYS) {
      this.startAnimation(idx, fps);
    }
  }

  /**
   * Present the flat icon/animation store as the firmware's SD layout:
   * /osd/keys/N/icon.rgb565 and /osd/keys/N/anim/0001.rgb565 …
   */
  private handleSdLs(path: string): void {
    if (!this.sdMounted) {
      this.emit({ event: 'error', msg: 'sd_unmounted' });
      return;
    }
    const norm = path.replace(/\/+$/, '') || '/';
    const emitEntry = (name: string, dir: boolean, size: number) => {
      this.emit({ event: 'sd_entry', name, dir, size });
    };
    const done = (count: number) => {
      this.emit({ event: 'sd_ls_done', path: norm, count });
    };

    const keyHasContent = (i: number) =>
      this.sd.icons[i] !== undefined || this.sd.animations[i] !== undefined;

    if (norm === '/') {
      emitEntry('osd', true, 0);
      done(1);
      return;
    }
    if (norm === '/osd') {
      emitEntry('keys', true, 0);
      done(1);
      return;
    }
    if (norm === '/osd/keys') {
      let n = 0;
      for (let i = 0; i < TOTAL_KEYS; i++) {
        if (keyHasContent(i)) {
          emitEntry(String(i), true, 0);
          n++;
        }
      }
      done(n);
      return;
    }

    const keyMatch = norm.match(/^\/osd\/keys\/(\d+)$/);
    if (keyMatch) {
      const i = Number(keyMatch[1]);
      let n = 0;
      if (this.sd.icons[i]) {
        emitEntry('icon.rgb565', false, this.sd.icons[i].length);
        n++;
      }
      if (this.sd.animations[i]) {
        emitEntry('anim', true, 0);
        n++;
      }
      done(n);
      return;
    }

    const animMatch = norm.match(/^\/osd\/keys\/(\d+)\/anim$/);
    if (animMatch) {
      const anim = this.sd.animations[Number(animMatch[1])];
      const frames = anim?.frames ?? [];
      frames.forEach((f, fi) => {
        if (f) emitEntry(`${String(fi + 1).padStart(4, '0')}.rgb565`, false, f.length);
      });
      done(frames.filter(Boolean).length);
      return;
    }

    this.emit({ event: 'error', msg: 'not_a_directory' });
  }

  private handleSdRm(path: string): void {
    if (!this.sdMounted || path.length < 2) {
      this.emit({ event: 'error', msg: 'bad_path' });
      return;
    }

    const iconMatch = path.match(/^\/osd\/keys\/(\d+)\/icon\.rgb565$/);
    const frameMatch = path.match(/^\/osd\/keys\/(\d+)\/anim\/(\d{4})\.rgb565$/);
    const animDirMatch = path.match(/^\/osd\/keys\/(\d+)\/anim$/);

    // Media removes are idempotent: as a USB mirror this device may not
    // have seen the original upload — deleting must still land it in the
    // "no media" state and redraw, never error out.
    if (iconMatch) {
      const i = Number(iconMatch[1]);
      delete this.sd.icons[i];
      this.drawKey(i);
    } else if (frameMatch) {
      const anim = this.sd.animations[Number(frameMatch[1])];
      const fi = Number(frameMatch[2]) - 1;
      if (anim?.frames[fi]) {
        anim.frames.splice(fi, 1);
        anim.meta.frames = anim.frames.length;
        if (anim.frames.length === 0) delete this.sd.animations[Number(frameMatch[1])];
      }
    } else if (animDirMatch) {
      const i = Number(animDirMatch[1]);
      if (this.animKey === i) this.stopAnimation();
      delete this.sd.animations[i];
    } else {
      this.emit({ event: 'error', msg: 'rm_failed' });
      return;
    }

    this.recalcSdUsage();
    this.saveSd();
    this.emit({ event: 'ok', cmd: 'SD_RM' });
    this.notifyState();
  }

  private handleSdInfo(): void {
    if (this.sdMounted) {
      const usedMb = Math.ceil(this.sd.usedBytes / (1024 * 1024));
      this.emit({ event: 'sd', size_mb: SIM_SD_SIZE_MB, used_mb: usedMb });
    } else {
      this.emit({ event: 'sd', mounted: false });
    }
  }

  private drawKey(idx: number): void {
    if (!this.slotVisible(idx)) return; // slot lives on another page
    const ctx = this.contexts[this.posOfSlot(idx)];
    const k = this.keys[idx];
    if (this.sdMounted && this.sd.icons[idx]) {
      // Raw background + live text overlay — mirrors firmware drawKey().
      // Transparent (sentinel) pixels adopt the key's background color.
      drawRgb565ToCanvas(ctx, substituteTransparency(this.sd.icons[idx], k.bgColor));
      if (k.overlay) {
        // Text only — firmware can't render glyph paths over media
        drawOverlay(ctx, { label: k.label, sublabel: k.sublabel });
      }
      this.notifyState();
      return;
    }
    drawKeyToCanvas(ctx, {
      label: k.label,
      sublabel: k.sublabel,
      bgColor: k.bgColor,
      fgColor: k.fgColor,
      index: this.posOfSlot(idx),
      icon: k.icon,
    });
    this.notifyState();
  }

  private startAnimation(idx: number, fps: number): void {
    if (!this.sdMounted) return;
    const anim = this.sd.animations[idx];
    if (!anim || anim.frames.length === 0) {
      this.emit({ event: 'error', msg: 'no_frames', index: idx });
      return;
    }
    this.animCount = anim.frames.length;
    this.animKey = idx;
    this.animFrame = 0;
    this.animFps = Math.max(1, Math.min(30, fps));
    anim.meta.fps = this.animFps; // remember playback rate for profile saves

    if (this.animTimer) clearInterval(this.animTimer);
    const interval = 1000 / this.animFps;
    this.animTimer = setInterval(() => this.serviceAnimation(), interval);

    this.emit({
      event: 'anim',
      index: idx,
      frames: this.animCount,
      fps: this.animFps,
    });
    this.notifyState();
  }

  private stopAnimation(): void {
    if (this.animTimer) {
      clearInterval(this.animTimer);
      this.animTimer = null;
    }
    if (this.animKey >= 0) {
      const k = this.animKey;
      this.animKey = -1;
      this.drawKey(k);
    }
    this.notifyState();
  }

  private serviceAnimation(): void {
    if (this.animKey < 0) return;
    if (!this.slotVisible(this.animKey)) {
      this.stopAnimation();
      return;
    }
    const anim = this.sd.animations[this.animKey];
    if (!anim) return;
    const ctx = this.contexts[this.posOfSlot(this.animKey)];
    const frame = anim.frames[this.animFrame % anim.frames.length];
    if (frame) {
      drawRgb565ToCanvas(ctx, frame);
      const k = this.keys[this.animKey];
      if (k.overlay) {
        drawOverlay(ctx, { label: k.label, sublabel: k.sublabel });
      }
      this.notifyState();
    }
    this.animFrame = (this.animFrame + 1) % this.animCount;
  }

  private saveConfig(_idx: number): void {
    this.saveNvs();
  }

  private saveNvs(): void {
    const data = this.keys.map((k) => ({
      label: k.label,
      sublabel: k.sublabel,
      hidKey: k.hidKey,
      hid2: k.hid2,
      hid3: k.hid3,
      bgColor: k.bgColor,
      fgColor: k.fgColor,
      icon: k.icon,
      overlay: k.overlay,
    }));
    try {
      localStorage.setItem(NVS_STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable
    }
  }

  private loadNvs(): void {
    try {
      const raw = localStorage.getItem(NVS_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as StoredKeyConfig[];
      // Pre-pages stores held 6 entries — they fill page 0, rest stay default
      for (let i = 0; i < TOTAL_KEYS && i < data.length; i++) {
        if (data[i]) {
          this.keys[i] = { ...this.keys[i], ...data[i] };
        }
      }
    } catch {
      // Corrupt storage — keep defaults
    }
  }

  // Simulated SD persistence lives in IndexedDB: media is megabytes and
  // localStorage's ~5 MB JSON quota silently dropped icons/animations,
  // making reloads lie about device state.
  private openSdDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('osd-simulator-sd', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('sd')) {
          req.result.createObjectStore('sd');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB unavailable'));
    });
  }

  private saveSd(): void {
    const snapshot: SdStore = {
      icons: Object.fromEntries(
        Object.entries(this.sd.icons).map(([k, v]) => [Number(k), new Uint8Array(v)]),
      ),
      animations: Object.fromEntries(
        Object.entries(this.sd.animations).map(([k, v]) => [
          Number(k),
          { frames: v.frames.map((f) => new Uint8Array(f)), meta: { ...v.meta } },
        ]),
      ),
      usedBytes: this.sd.usedBytes,
    };
    void this.openSdDb()
      .then(
        (db) =>
          new Promise<void>((resolve) => {
            const tx = db.transaction('sd', 'readwrite');
            tx.objectStore('sd').put(snapshot, 'store');
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              db.close();
              resolve();
            };
          }),
      )
      .catch(() => {});
  }

  private loadSd(): void {
    // Async by nature — redraw once media arrives so reloads show the truth
    void this.openSdDb()
      .then(
        (db) =>
          new Promise<SdStore | null>((resolve) => {
            const tx = db.transaction('sd', 'readonly');
            const req = tx.objectStore('sd').get('store');
            req.onsuccess = () => {
              db.close();
              resolve((req.result as SdStore) ?? null);
            };
            req.onerror = () => {
              db.close();
              resolve(null);
            };
          }),
      )
      .then((stored) => {
        if (stored) {
          this.sd.icons = stored.icons ?? {};
          this.sd.animations = stored.animations ?? {};
          this.sd.usedBytes = stored.usedBytes ?? 0;
        } else {
          this.migrateLegacySd();
        }
        for (let i = 0; i < KEY_COUNT; i++) this.drawKey(i);
        this.notifyState();
      })
      .catch(() => {});
  }

  /** One-time import from the old localStorage store (small setups only). */
  private migrateLegacySd(): void {
    try {
      const raw = localStorage.getItem(SD_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        icons: Record<string, number[]>;
        animations: Record<string, { frames: number[][]; meta: AnimMeta }>;
        usedBytes: number;
      };
      this.sd.icons = Object.fromEntries(
        Object.entries(data.icons || {}).map(([k, v]) => [Number(k), new Uint8Array(v)]),
      );
      this.sd.animations = Object.fromEntries(
        Object.entries(data.animations || {}).map(([k, v]) => [
          Number(k),
          { frames: v.frames.map((f) => new Uint8Array(f)), meta: v.meta },
        ]),
      );
      this.sd.usedBytes = data.usedBytes || 0;
      localStorage.removeItem(SD_STORAGE_KEY);
      this.saveSd();
    } catch {
      // Corrupt legacy store — start clean
    }
  }

  private recalcSdUsage(): void {
    let used = 0;
    for (const icon of Object.values(this.sd.icons)) used += icon.length;
    for (const anim of Object.values(this.sd.animations)) {
      for (const frame of anim.frames) used += frame.length;
    }
    this.sd.usedBytes = used;
  }

  private notifyState(): void {
    this.stateCb?.();
  }

  private hidLabel(code: number): string {
    const labels: Record<number, string> = {
      240: 'F13', 241: 'F14', 242: 'F15', 243: 'F16',
      244: 'F17', 245: 'F18', 246: 'F19', 247: 'F20',
      248: 'F21', 249: 'F22', 250: 'F23', 251: 'F24',
    };
    return labels[code] ?? `HID ${code}`;
  }

  destroy(): void {
    this.stopAnimation();
    this.tapTimers.forEach((t) => t && clearTimeout(t));
  }
}
