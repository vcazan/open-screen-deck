import { describe, expect, it } from 'vitest';
import type { ProfileData } from '../../protocol/types';
import {
  parsePortableProfile,
  profilePageCount,
  profileToActions,
  profileToKeyConfigs,
} from '../profiles';

const V1: ProfileData = {
  version: 1,
  keys: [
    { label: 'A', sublabel: '', hid: 240, bg: 0, fg: 0xffff },
    { label: 'B', sublabel: '', hid: 241, bg: 0, fg: 0xffff },
    { label: 'C', sublabel: '', hid: 242, bg: 0, fg: 0xffff },
    { label: 'D', sublabel: '', hid: 243, bg: 0, fg: 0xffff },
    { label: 'E', sublabel: '', hid: 244, bg: 0, fg: 0xffff },
    { label: 'F', sublabel: '', hid: 245, bg: 0, fg: 0xffff },
  ],
};

describe('profileToActions migration', () => {
  it('synthesizes HID actions from v1 profiles, padded to the slot ceiling', () => {
    const actions = profileToActions(V1);
    expect(actions).toHaveLength(48); // TOTAL_KEYS = 6 keys × 8 max pages
    expect(actions[0]).toEqual({ type: 'hid', code: 240 });
    expect(actions[5]).toEqual({ type: 'hid', code: 245 });
    // slots beyond the profile fall back to per-slot defaults
    expect(actions[6].type).toBe('hid');
  });

  it('derives page count from the key list', () => {
    expect(profilePageCount(V1)).toBe(1); // 6 keys = 1 page
    expect(profilePageCount({ ...V1, keys: [...V1.keys, ...V1.keys] })).toBe(2);
    expect(
      profilePageCount({ ...V1, keys: Array(60).fill(V1.keys[0]) }),
    ).toBe(8); // clamped to MAX_PAGES
  });

  it('passes through explicit v2 actions', () => {
    const v2: ProfileData = {
      ...V1,
      version: 2,
      actions: [
        { type: 'url', url: 'https://example.com' },
        ...Array(5).fill({ type: 'hid', code: 240 }),
      ],
    };
    const actions = profileToActions(v2);
    expect(actions[0]).toEqual({ type: 'url', url: 'https://example.com' });
  });
});

describe('profileToKeyConfigs', () => {
  it('fills missing fields from defaults', () => {
    const sparse: ProfileData = {
      version: 1,
      keys: [{ label: 'X' } as ProfileData['keys'][number]],
    };
    const configs = profileToKeyConfigs(sparse);
    expect(configs[0].label).toBe('X');
    expect(typeof configs[0].hidKey).toBe('number');
    expect(typeof configs[0].bgColor).toBe('number');
  });
});

describe('parsePortableProfile', () => {
  it('rejects garbage and wrong formats', () => {
    expect(parsePortableProfile('not json')).toBeNull();
    expect(parsePortableProfile('{"format":"other"}')).toBeNull();
    expect(parsePortableProfile('{"format":"osd-profile"}')).toBeNull();
  });

  it('parses a valid portable profile with media', () => {
    const portable = {
      format: 'osd-profile',
      version: 3,
      name: 'Test',
      data: V1,
      media: {
        icons: { 0: btoa('\x01\x02\x03') },
        animations: { 2: { fps: 10, frames: [btoa('\x04\x05')] } },
      },
    };
    const parsed = parsePortableProfile(JSON.stringify(portable));
    expect(parsed).not.toBeNull();
    expect(parsed!.name).toBe('Test');
    expect(Array.from(parsed!.media.icons[0])).toEqual([1, 2, 3]);
    expect(parsed!.media.animations[2].fps).toBe(10);
    expect(Array.from(parsed!.media.animations[2].frames[0])).toEqual([4, 5]);
  });
});
