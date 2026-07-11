// Generates binary test fixtures (git-ignored) used by the e2e suite.
// Runs via the `test:e2e` npm script before Playwright starts.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(dir, { recursive: true });

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Minimal RGBA PNG encoder — zero dependencies. */
function makePng(width, height, pixelFn) {
  const raw = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter: none
    for (let x = 0; x < width; x++) raw.push(...pixelFn(x, y));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Wide 640×360 color bars — exercises the crop-to-fit path
writeFileSync(
  join(dir, 'wide.png'),
  makePng(640, 360, (x) => {
    const bars = [
      [255, 0, 255, 255],
      [0, 0, 255, 255],
      [0, 255, 255, 255],
      [0, 255, 0, 255],
      [255, 255, 0, 255],
      [255, 0, 0, 255],
    ];
    return bars[Math.min(bars.length - 1, Math.floor((x / 640) * bars.length))];
  }),
);

// 128×128 orange square with transparent surround — transparency sentinel path
writeFileSync(
  join(dir, 'translogo.png'),
  makePng(128, 128, (x, y) =>
    x >= 30 && x < 98 && y >= 30 && y < 98 ? [255, 140, 0, 255] : [0, 0, 0, 0],
  ),
);

// Short webm clip for animation specs (requires ffmpeg; skipped when absent)
const webm = join(dir, 'clip.webm');
if (!existsSync(webm)) {
  try {
    execSync(
      `ffmpeg -y -f lavfi -i testsrc=duration=2:size=320x240:rate=15 -c:v libvpx -b:v 200k "${webm}"`,
      { stdio: 'ignore' },
    );
  } catch {
    console.warn('ffmpeg not found — video specs will self-skip');
  }
}

console.log('fixtures ready');
