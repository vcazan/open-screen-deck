/** Line-based protocol codec — encode commands, parse device JSON events */

import type {
  DeviceEvent,
  HostCommand,
  SetAnimPayload,
  SetImagePayload,
  SetKeyPayload,
} from './types';

export function encodeCommand(cmd: HostCommand): string {
  switch (cmd.type) {
    case 'PING':
      return 'PING';
    case 'INFO':
      return 'INFO';
    case 'GET_KEYS':
      return 'GET_KEYS';
    case 'DRAW':
      return `DRAW ${cmd.index}`;
    case 'DRAW_ALL':
      return 'DRAW_ALL';
    case 'SET_KEY':
      return `SET_KEY ${JSON.stringify(cmd.payload)}`;
    case 'SET_IMAGE':
      return `SET_IMAGE ${JSON.stringify(cmd.payload)}`;
    case 'SET_FACE':
      return `SET_FACE ${JSON.stringify(cmd.payload)}`;
    case 'SET_ANIM':
      return `SET_ANIM ${JSON.stringify(cmd.payload)}`;
    case 'ANIM':
      return `ANIM ${cmd.index} ${cmd.fps}`;
    case 'ANIM_STOP':
      return 'ANIM STOP';
    case 'ANIM_CLEAR':
      return `ANIM_CLEAR ${cmd.index}`;
    case 'SD_INFO':
      return 'SD_INFO';
    case 'SD_LS':
      return `SD_LS ${cmd.path}`;
    case 'SD_RM':
      return `SD_RM ${cmd.path}`;
    case 'SET_ORIENT':
      return `SET_ORIENT ${cmd.orient}`;
    case 'SET_PAGE':
      return `SET_PAGE ${cmd.page}`;
    case 'SET_PAGES':
      return `SET_PAGES ${cmd.pages}`;
  }
}

/** Parse a raw command line (host→device direction) for logging / replay. */
export function parseCommandLine(line: string): HostCommand | null {
  const trimmed = line.trim();
  if (trimmed === 'PING') return { type: 'PING' };
  if (trimmed === 'INFO') return { type: 'INFO' };
  if (trimmed === 'GET_KEYS') return { type: 'GET_KEYS' };
  if (trimmed === 'DRAW_ALL') return { type: 'DRAW_ALL' };
  if (trimmed === 'SD_INFO') return { type: 'SD_INFO' };
  if (trimmed.startsWith('SD_LS')) {
    return { type: 'SD_LS', path: trimmed.slice(5).trim() || '/' };
  }
  if (trimmed.startsWith('SD_RM ')) {
    return { type: 'SD_RM', path: trimmed.slice(6).trim() };
  }
  if (trimmed.startsWith('SET_ORIENT')) {
    const orient = parseInt(trimmed.slice(10), 10);
    if (!isNaN(orient)) return { type: 'SET_ORIENT', orient };
    return null;
  }
  if (trimmed.startsWith('SET_PAGES')) {
    const pages = parseInt(trimmed.slice(9), 10);
    if (!isNaN(pages)) return { type: 'SET_PAGES', pages };
    return null;
  }
  if (trimmed.startsWith('SET_PAGE')) {
    const page = parseInt(trimmed.slice(8), 10);
    if (!isNaN(page)) return { type: 'SET_PAGE', page };
    return null;
  }

  if (trimmed.startsWith('DRAW ')) {
    const index = parseInt(trimmed.slice(5), 10);
    if (!isNaN(index)) return { type: 'DRAW', index };
  }

  if (trimmed.startsWith('SET_KEY ')) {
    try {
      const payload = JSON.parse(trimmed.slice(8)) as SetKeyPayload;
      return { type: 'SET_KEY', payload };
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('SET_IMAGE ')) {
    try {
      const payload = JSON.parse(trimmed.slice(10)) as SetImagePayload;
      return { type: 'SET_IMAGE', payload };
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('SET_FACE ')) {
    try {
      const payload = JSON.parse(trimmed.slice(9)) as SetImagePayload;
      return { type: 'SET_FACE', payload };
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('SET_ANIM ')) {
    try {
      const payload = JSON.parse(trimmed.slice(9)) as SetAnimPayload;
      return { type: 'SET_ANIM', payload };
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('ANIM_CLEAR')) {
    const index = parseInt(trimmed.slice(10), 10);
    if (!isNaN(index)) return { type: 'ANIM_CLEAR', index };
    return null;
  }

  if (trimmed.startsWith('ANIM ')) {
    const rest = trimmed.slice(5);
    if (rest === 'STOP') return { type: 'ANIM_STOP' };
    const sp = rest.indexOf(' ');
    const index = parseInt(rest, 10);
    const fps = sp > 0 ? parseInt(rest.slice(sp + 1), 10) : 10;
    if (!isNaN(index)) return { type: 'ANIM', index, fps: isNaN(fps) ? 10 : fps };
  }

  return null;
}

/** Parse a single newline-delimited JSON line from the device. */
export function parseDeviceLine(line: string): DeviceEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof obj.event !== 'string') return null;
    return obj as unknown as DeviceEvent;
  } catch {
    return null;
  }
}

/** Serialize a device event back to a JSON line (for simulator output). */
export function serializeDeviceEvent(event: DeviceEvent): string {
  return JSON.stringify(event);
}

/**
 * Extract JSON string fields the way firmware does (substring parsing).
 * Returns null when the field is absent; '' when present but empty —
 * an explicit empty string clears the field on the device.
 */
export function extractJsonString(src: string, keyName: string): string | null {
  const pat = `"${keyName}":"`;
  const a = src.indexOf(pat);
  if (a < 0) return null;
  const start = a + pat.length;
  const b = src.indexOf('"', start);
  return b >= start ? src.slice(start, b) : null;
}

export function extractJsonInt(src: string, keyName: string, dflt: number): number {
  const pat = `"${keyName}":`;
  const a = src.indexOf(pat);
  if (a < 0) return dflt;
  const start = a + pat.length;
  const rest = src.slice(start);
  const match = rest.match(/^-?\d+/);
  return match ? parseInt(match[0], 10) : dflt;
}

export interface PendingBinaryPayload {
  command: 'SET_IMAGE';
  index: number;
  expectedBytes: number;
}

export function parseSetImageHeader(line: string): PendingBinaryPayload | null {
  if (!line.startsWith('SET_IMAGE ')) return null;
  const index = extractJsonInt(line, 'index', -1);
  const len = extractJsonInt(line, 'len', 0);
  if (index < 0 || len <= 0) return null;
  return { command: 'SET_IMAGE', index, expectedBytes: len };
}
