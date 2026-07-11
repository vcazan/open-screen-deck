import { FRAME_BYTES, FRAME_HEIGHT, FRAME_WIDTH } from '../protocol/constants';
import { canvasToRgb565, rgb565ToImageData } from '../protocol/rgb565';

export interface DecodedFrame {
  rgb565: Uint8Array;
  preview: string;
}

export interface AnimationDecodeResult {
  frames: Uint8Array[];
  frameCount: number;
  estimatedBytes: number;
  previews: string[];
}

const MAX_FRAMES = 120;
const MAX_DURATION_SEC = 10;

/** Resize and sample a canvas frame to 128×128 RGB565. */
export function sampleFrame(source: CanvasImageSource): Uint8Array {
  return canvasToRgb565(source, FRAME_WIDTH, FRAME_HEIGHT);
}

/** Decode a GIF file into RGB565 frames (all frames via ImageDecoder when available). */
export async function decodeGifFrames(
  file: File,
  _targetFps: number,
): Promise<AnimationDecodeResult> {
  if ('ImageDecoder' in window) {
    try {
      return await decodeWithImageDecoder(file);
    } catch {
      // Fall through to single-frame <img> decoding
    }
  }
  return decodeSingleImageFrame(file);
}

interface VideoFrameLike {
  duration: number | null;
  close(): void;
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode(opts: { frameIndex: number }): Promise<{ image: VideoFrameLike }>;
}

async function decodeWithImageDecoder(file: File): Promise<AnimationDecodeResult> {
  const Decoder = (window as unknown as {
    ImageDecoder: new (init: { data: ArrayBuffer; type: string }) => ImageDecoderLike;
  }).ImageDecoder;

  const decoder = new Decoder({ data: await file.arrayBuffer(), type: file.type });
  await decoder.tracks.ready;
  const frameCount = Math.min(decoder.tracks.selectedTrack?.frameCount ?? 1, MAX_FRAMES);

  const frames: Uint8Array[] = [];
  const previews: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const rgb565 = sampleFrame(image as unknown as CanvasImageSource);
    image.close();
    frames.push(rgb565);
    if (i === 0 || i === frameCount - 1) previews.push(frameToPreview(rgb565));
  }

  if (frames.length === 0) throw new Error('No frames decoded');

  return {
    frames,
    frameCount: frames.length,
    estimatedBytes: frames.length * FRAME_BYTES,
    previews,
  };
}

function decodeSingleImageFrame(file: File): Promise<AnimationDecodeResult> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const rgb565 = sampleFrame(img);
      resolve({
        frames: [rgb565],
        frameCount: 1,
        estimatedBytes: FRAME_BYTES,
        previews: [frameToPreview(rgb565)],
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode GIF'));
    };
    img.src = url;
  });
}

/** Decode a video file into RGB565 frames at target fps. */
export async function decodeVideoFrames(
  file: File,
  targetFps: number,
): Promise<AnimationDecodeResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
      }),
      8000,
      'Video metadata never loaded (unsupported codec?)',
    );

    if (!video.videoWidth || !video.videoHeight || !isFinite(video.duration)) {
      throw new Error('Video has no decodable frames (unsupported codec?)');
    }

    const duration = Math.min(video.duration, MAX_DURATION_SEC);
    const interval = 1 / targetFps;
    const maxFrames = Math.min(Math.ceil(duration * targetFps), MAX_FRAMES);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    const frames: Uint8Array[] = [];
    const previews: string[] = [];

    for (let i = 0; i < maxFrames; i++) {
      const time = i * interval;
      if (time >= duration) break;

      await withTimeout(seekVideo(video, time), 5000, 'Video seek timed out');
      ctx.drawImage(video, 0, 0);
      const rgb565 = sampleFrame(canvas);
      frames.push(rgb565);
      if (i === 0 || i === maxFrames - 1) {
        previews.push(frameToPreview(rgb565));
      }
    }

    return {
      frames,
      frameCount: frames.length,
      estimatedBytes: frames.length * FRAME_BYTES,
      previews,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    // Seeking to the current position never fires 'seeked'
    if (Math.abs(video.currentTime - time) < 0.001 && video.readyState >= 2) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

function frameToPreview(rgb565: Uint8Array): string {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const imageData = rgb565ToImageData(rgb565);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
