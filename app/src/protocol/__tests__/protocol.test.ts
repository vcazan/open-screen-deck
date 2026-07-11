import { describe, it, expect } from 'vitest';
import {
  encodeCommand,
  extractJsonString,
  parseCommandLine,
  parseDeviceLine,
  serializeDeviceEvent,
} from '../codec';
import {
  imageDataToRgb565,
  rgb565ToImageData,
  rgb565ToRgb888,
  rgb888ToRgb565,
  packRgb565,
  unpackRgb565,
  fillRgb565,
} from '../rgb565';
import { FRAME_BYTES } from '../constants';

describe('codec', () => {
  it('round-trips PING command', () => {
    const line = encodeCommand({ type: 'PING' });
    expect(line).toBe('PING');
    expect(parseCommandLine(line)).toEqual({ type: 'PING' });
  });

  it('round-trips SET_KEY command', () => {
    const payload = { index: 0, label: 'MUTE', sublabel: 'Mic', hid: 183, bg: 19017 };
    const line = encodeCommand({ type: 'SET_KEY', payload });
    expect(line).toBe('SET_KEY {"index":0,"label":"MUTE","sublabel":"Mic","hid":183,"bg":19017}');
    const parsed = parseCommandLine(line);
    expect(parsed).toEqual({ type: 'SET_KEY', payload });
  });

  it('round-trips SET_IMAGE command', () => {
    const payload = { index: 2, len: 32768 };
    const line = encodeCommand({ type: 'SET_IMAGE', payload });
    expect(parseCommandLine(line)).toEqual({ type: 'SET_IMAGE', payload });
  });

  it('round-trips ANIM commands', () => {
    expect(parseCommandLine('ANIM 0 10')).toEqual({ type: 'ANIM', index: 0, fps: 10 });
    expect(parseCommandLine('ANIM STOP')).toEqual({ type: 'ANIM_STOP' });
  });

  it('round-trips SET_ANIM command', () => {
    const payload = { index: 3, frame: 12, len: 32768 };
    const line = encodeCommand({ type: 'SET_ANIM', payload });
    expect(line).toBe('SET_ANIM {"index":3,"frame":12,"len":32768}');
    expect(parseCommandLine(line)).toEqual({ type: 'SET_ANIM', payload });
  });

  it('round-trips ANIM_CLEAR command', () => {
    const line = encodeCommand({ type: 'ANIM_CLEAR', index: 2 });
    expect(line).toBe('ANIM_CLEAR 2');
    expect(parseCommandLine(line)).toEqual({ type: 'ANIM_CLEAR', index: 2 });
  });

  it('round-trips SD_LS and SD_RM commands', () => {
    expect(encodeCommand({ type: 'SD_LS', path: '/osd/keys' })).toBe('SD_LS /osd/keys');
    expect(parseCommandLine('SD_LS /osd/keys')).toEqual({ type: 'SD_LS', path: '/osd/keys' });
    expect(parseCommandLine('SD_LS')).toEqual({ type: 'SD_LS', path: '/' });
    expect(encodeCommand({ type: 'SD_RM', path: '/osd/keys/0/icon.rgb565' })).toBe(
      'SD_RM /osd/keys/0/icon.rgb565',
    );
    expect(parseCommandLine('SD_RM /osd/keys/0/icon.rgb565')).toEqual({
      type: 'SD_RM',
      path: '/osd/keys/0/icon.rgb565',
    });
  });

  it('parses device events', () => {
    const line = '{"event":"key","index":0,"action":"press"}';
    expect(parseDeviceLine(line)).toEqual({ event: 'key', index: 0, action: 'press' });
  });

  it('serializes device events', () => {
    const event = { event: 'pong' as const };
    expect(serializeDeviceEvent(event)).toBe('{"event":"pong"}');
  });

  it('parses info event with sd and psram', () => {
    const line =
      '{"event":"info","name":"Open Screen Deck","fw":"0.4.0","keys":6,"sd":true,"psram":8388608}';
    const ev = parseDeviceLine(line);
    expect(ev).toMatchObject({ event: 'info', keys: 6, sd: true });
  });

  it('distinguishes empty string fields from missing ones', () => {
    const line = 'SET_KEY {"index":0,"label":"","sublabel":"OBS","hid":183,"bg":0}';
    // Present but empty — an explicit clear
    expect(extractJsonString(line, 'label')).toBe('');
    // Present with value
    expect(extractJsonString(line, 'sublabel')).toBe('OBS');
    // Absent entirely
    expect(extractJsonString(line, 'icon')).toBeNull();
  });
});

describe('rgb565', () => {
  it('packs and unpacks known values', () => {
    // Pure red: 0xF800
    expect(packRgb565(0xf800)).toEqual([0xf8, 0x00]);
    expect(unpackRgb565(0xf8, 0x00)).toBe(0xf800);

    // Pure green: 0x07E0
    expect(packRgb565(0x07e0)).toEqual([0x07, 0xe0]);
    expect(unpackRgb565(0x07, 0xe0)).toBe(0x07e0);

    // Pure blue: 0x001F
    expect(packRgb565(0x001f)).toEqual([0x00, 0x1f]);
    expect(unpackRgb565(0x00, 0x1f)).toBe(0x001f);

    // White: 0xFFFF
    expect(packRgb565(0xffff)).toEqual([0xff, 0xff]);
  });

  it('converts rgb888 to rgb565 and back', () => {
    const color = rgb888ToRgb565(255, 0, 0);
    expect(color).toBe(0xf800);
    const back = rgb565ToRgb888(color);
    expect(back.r).toBe(248);
    expect(back.g).toBe(0);
    expect(back.b).toBe(0);
  });

  it('converts ImageData to rgb565 and back', () => {
    const imageData = new ImageData(2, 2);
    // Top-left: red
    imageData.data.set([255, 0, 0, 255], 0);
    // Top-right: green
    imageData.data.set([0, 255, 0, 255], 4);
    // Bottom-left: blue
    imageData.data.set([0, 0, 255, 255], 8);
    // Bottom-right: white
    imageData.data.set([255, 255, 255, 255], 12);

    const bytes = imageDataToRgb565(imageData);
    expect(bytes.length).toBe(8);
    expect(bytes[0]).toBe(0xf8);
    expect(bytes[1]).toBe(0x00);
    expect(bytes[2]).toBe(0x07);
    expect(bytes[3]).toBe(0xe0);

    const restored = rgb565ToImageData(bytes, 2, 2);
    expect(restored.data[0]).toBe(248); // red channel
    expect(restored.data[5]).toBeGreaterThan(200); // green
    expect(restored.data[10]).toBeGreaterThan(200); // blue
  });

  it('fills buffer with solid color', () => {
    const buf = new Uint8Array(4);
    fillRgb565(buf, 0xf800);
    expect(buf).toEqual(new Uint8Array([0xf8, 0x00, 0xf8, 0x00]));
  });

  it('produces correct frame size', () => {
    const buf = new Uint8Array(FRAME_BYTES);
    fillRgb565(buf, 0x4a69);
    expect(buf.length).toBe(32768);
    expect(buf[0]).toBe(0x4a);
    expect(buf[1]).toBe(0x69);
  });
});
