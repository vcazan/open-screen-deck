import { describe, expect, it } from 'vitest';
import { notesSince, versionNewer } from '../host';

describe('versionNewer', () => {
  it('compares semver triples', () => {
    expect(versionNewer('2.1.0', '2.0.0')).toBe(true);
    expect(versionNewer('2.0.0', '2.1.0')).toBe(false);
    expect(versionNewer('2.0.0', '2.0.0')).toBe(false);
    expect(versionNewer('10.0.0', '9.9.9')).toBe(true);
    expect(versionNewer('1.0.10', '1.0.9')).toBe(true);
  });

  it('treats missing segments as zero', () => {
    expect(versionNewer('1.1', '1.0.5')).toBe(true);
    expect(versionNewer('1.0', '1.0.0')).toBe(false);
  });
});

describe('notesSince', () => {
  const changelog = {
    '2.1.0': 'icons',
    '2.0.0': 'custom faces',
    '1.5.0': 'older stuff',
  };

  it('returns only notes newer than the installed version, newest first', () => {
    expect(notesSince(changelog, '1.5.0')).toEqual([
      { version: '2.1.0', note: 'icons' },
      { version: '2.0.0', note: 'custom faces' },
    ]);
  });

  it('returns nothing when up to date', () => {
    expect(notesSince(changelog, '2.1.0')).toEqual([]);
  });

  it('handles a missing changelog', () => {
    expect(notesSince(undefined, '1.0.0')).toEqual([]);
  });
});
