/**
 * Live tile renderers — draw 128×128 key faces for streaming via SET_FACE.
 * Pure canvas code, shared by every tile kind.
 */

import { FRAME_HEIGHT, FRAME_WIDTH } from '../protocol/constants';
import { imageDataToRgb565 } from '../protocol/rgb565';
import type { TileKind } from '../actions/types';

export interface TileData {
  /** clock/timer share now; timer also gets elapsedMs + running */
  now: Date;
  timer?: { elapsedMs: number; running: boolean };
  cpu?: { cpuPct: number; memPct: number } | null;
  volumePct?: number | null;
  nowPlaying?: { title: string; artist: string } | null;
  obsScene?: string | null;
}

const W = FRAME_WIDTH;
const H = FRAME_HEIGHT;

let sharedCanvas: HTMLCanvasElement | null = null;

function getCtx(): CanvasRenderingContext2D {
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = W;
    sharedCanvas.height = H;
  }
  const ctx = sharedCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  return ctx;
}

function base(ctx: CanvasRenderingContext2D, accent = '#2fd4c4'): void {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141a20');
  g.addColorStop(1, '#0b0f13');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 3);
}

function caption(ctx: CanvasRenderingContext2D, text: string): void {
  ctx.fillStyle = '#7d8894';
  ctx.font = '600 11px "SF Pro Text", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text.toUpperCase(), W / 2, 22);
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  weight = 700,
): number {
  let px = startPx;
  do {
    ctx.font = `${weight} ${px}px "SF Pro Display", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 2;
  } while (px > 10);
  return px;
}

function renderClock(ctx: CanvasRenderingContext2D, data: TileData): void {
  base(ctx);
  caption(ctx, 'Clock');
  const hh = String(data.now.getHours()).padStart(2, '0');
  const mm = String(data.now.getMinutes()).padStart(2, '0');
  const colonOn = data.now.getSeconds() % 2 === 0;

  ctx.fillStyle = '#f2f5f7';
  ctx.font = '700 40px "SF Pro Display", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${hh}${colonOn ? ':' : ' '}${mm}`, W / 2, 74);

  ctx.fillStyle = '#8d99a6';
  ctx.font = '600 13px "SF Pro Text", system-ui, sans-serif';
  ctx.fillText(
    data.now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    W / 2,
    102,
  );
}

function renderTimer(ctx: CanvasRenderingContext2D, data: TileData): void {
  const t = data.timer ?? { elapsedMs: 0, running: false };
  base(ctx, t.running ? '#2fd4c4' : '#5a646e');
  caption(ctx, t.running ? 'Timer · Running' : 'Timer');

  const total = Math.floor(t.elapsedMs / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const text =
    mins >= 100
      ? `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  ctx.fillStyle = t.running ? '#f2f5f7' : '#9aa5b0';
  const px = fitText(ctx, text, 112, 42);
  ctx.font = `700 ${px}px "SF Pro Display", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, 78);

  ctx.fillStyle = '#7d8894';
  ctx.font = '600 11px "SF Pro Text", system-ui, sans-serif';
  ctx.fillText(t.running ? 'press to stop' : 'press to start', W / 2, 106);
}

function meterBar(
  ctx: CanvasRenderingContext2D,
  y: number,
  pct: number,
  label: string,
  color: string,
): void {
  ctx.fillStyle = '#7d8894';
  ctx.font = '600 11px "SF Pro Text", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 14, y - 6);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(pct)}%`, W - 14, y - 6);
  ctx.fillStyle = '#1d242c';
  ctx.fillRect(14, y, W - 28, 8);
  ctx.fillStyle = color;
  ctx.fillRect(14, y, (W - 28) * Math.min(1, pct / 100), 8);
}

function renderCpu(ctx: CanvasRenderingContext2D, data: TileData): void {
  base(ctx, '#e0a52f');
  caption(ctx, 'System');
  if (!data.cpu) {
    ctx.fillStyle = '#8d99a6';
    ctx.font = '600 12px "SF Pro Text", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('needs companion', W / 2, 70);
    return;
  }
  meterBar(ctx, 52, data.cpu.cpuPct, 'CPU', data.cpu.cpuPct > 85 ? '#d84c4c' : '#e0a52f');
  meterBar(ctx, 92, data.cpu.memPct, 'RAM', data.cpu.memPct > 85 ? '#d84c4c' : '#2fd4c4');
}

function renderVolume(ctx: CanvasRenderingContext2D, data: TileData): void {
  base(ctx);
  caption(ctx, 'Volume');
  if (data.volumePct === null || data.volumePct === undefined) {
    ctx.fillStyle = '#8d99a6';
    ctx.font = '600 12px "SF Pro Text", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('needs companion', W / 2, 70);
    return;
  }
  ctx.fillStyle = '#f2f5f7';
  ctx.font = '700 38px "SF Pro Display", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(data.volumePct)}`, W / 2, 74);
  meterBar(ctx, 96, data.volumePct, '', '#2fd4c4');
}

function renderNowPlaying(ctx: CanvasRenderingContext2D, data: TileData): void {
  base(ctx, '#a06ee0');
  caption(ctx, 'Now Playing');
  ctx.textAlign = 'center';
  if (!data.nowPlaying) {
    ctx.fillStyle = '#8d99a6';
    ctx.font = '600 12px "SF Pro Text", system-ui, sans-serif';
    ctx.fillText('nothing playing', W / 2, 70);
    return;
  }
  const title = data.nowPlaying.title;
  ctx.fillStyle = '#f2f5f7';
  const px = fitText(ctx, title, 112, 18);
  ctx.font = `700 ${px}px "SF Pro Display", system-ui, sans-serif`;
  ctx.fillText(title.length > 24 ? `${title.slice(0, 23)}…` : title, W / 2, 66);
  ctx.fillStyle = '#9aa5b0';
  const artist = data.nowPlaying.artist;
  const apx = fitText(ctx, artist, 108, 13, 600);
  ctx.font = `600 ${apx}px "SF Pro Text", system-ui, sans-serif`;
  ctx.fillText(artist.length > 26 ? `${artist.slice(0, 25)}…` : artist, W / 2, 92);
}

function renderObsScene(ctx: CanvasRenderingContext2D, data: TileData): void {
  const live = !!data.obsScene;
  base(ctx, live ? '#d84c4c' : '#5a646e');
  caption(ctx, live ? 'On Air' : 'OBS');
  ctx.textAlign = 'center';
  if (!data.obsScene) {
    ctx.fillStyle = '#8d99a6';
    ctx.font = '600 12px "SF Pro Text", system-ui, sans-serif';
    ctx.fillText('not connected', W / 2, 70);
    return;
  }
  ctx.fillStyle = '#f2f5f7';
  const px = fitText(ctx, data.obsScene, 112, 22);
  ctx.font = `700 ${px}px "SF Pro Display", system-ui, sans-serif`;
  ctx.fillText(data.obsScene, W / 2, 74);
}

const RENDERERS: Record<TileKind, (ctx: CanvasRenderingContext2D, data: TileData) => void> = {
  clock: renderClock,
  timer: renderTimer,
  cpu: renderCpu,
  volume: renderVolume,
  now_playing: renderNowPlaying,
  obs_scene: renderObsScene,
};

/** How often each tile kind wants a repaint (ms). */
export const TILE_REFRESH_MS: Record<TileKind, number> = {
  clock: 1000,
  timer: 500,
  cpu: 2000,
  volume: 1500,
  now_playing: 3000,
  obs_scene: 2000,
};

/** Render a tile face and return RGB565 bytes ready for SET_FACE. */
export function renderTile(kind: TileKind, data: TileData): Uint8Array {
  const ctx = getCtx();
  RENDERERS[kind](ctx, data);
  return imageDataToRgb565(ctx.getImageData(0, 0, W, H));
}
