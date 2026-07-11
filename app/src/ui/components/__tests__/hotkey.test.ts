import { describe, expect, it } from 'vitest';
import { mainKeyName } from '../HotkeyInput';

const key = (code: string) => mainKeyName({ code });

describe('mainKeyName — KeyboardEvent → executor vocabulary', () => {
  it('maps letters and digits', () => {
    expect(key('KeyM')).toBe('m');
    expect(key('KeyA')).toBe('a');
    expect(key('Digit7')).toBe('7');
    expect(key('Numpad3')).toBe('3');
  });

  it('maps function keys', () => {
    expect(key('F1')).toBe('f1');
    expect(key('F13')).toBe('f13');
  });

  it('maps named keys', () => {
    expect(key('Space')).toBe('space');
    expect(key('Enter')).toBe('enter');
    expect(key('NumpadEnter')).toBe('enter');
    expect(key('ArrowLeft')).toBe('left');
    expect(key('Backquote')).toBe('`');
    expect(key('Slash')).toBe('/');
  });

  it('returns null for bare modifiers', () => {
    expect(key('ShiftLeft')).toBeNull();
    expect(key('MetaRight')).toBeNull();
    expect(key('ControlLeft')).toBeNull();
    expect(key('AltLeft')).toBeNull();
  });
});
