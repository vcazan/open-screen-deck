import { beforeEach, describe, expect, it } from 'vitest';
import { FRAME_BYTES } from '../../protocol/constants';
import { clearKeyMediaImage, loadKeyMedia, saveKeyMediaImage } from '../keyMedia';

const frame = () => new Uint8Array(FRAME_BYTES).fill(7);

describe('keyMedia source tracking', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to the upload source', () => {
    saveKeyMediaImage(3, frame());
    expect(loadKeyMedia(3).source).toBe('upload');
  });

  it('remembers app and library sources', () => {
    saveKeyMediaImage(1, frame(), 'app');
    expect(loadKeyMedia(1).source).toBe('app');
    saveKeyMediaImage(1, frame(), 'library');
    expect(loadKeyMedia(1).source).toBe('library');
  });

  it('a re-upload overwrites an app source — the image is now deliberate', () => {
    saveKeyMediaImage(2, frame(), 'app');
    saveKeyMediaImage(2, frame(), 'upload');
    expect(loadKeyMedia(2).source).toBe('upload');
  });

  it('clearing drops both image and source', () => {
    saveKeyMediaImage(4, frame(), 'app');
    clearKeyMediaImage(4);
    const media = loadKeyMedia(4);
    expect(media.image).toBeNull();
    expect(media.source).toBeUndefined();
  });
});
