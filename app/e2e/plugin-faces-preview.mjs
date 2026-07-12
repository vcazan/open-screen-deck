// Visual harness: loads every plugin, fires onAssign (and a couple of
// press-views) with a stub ctx, and composites the drawn faces into
// /tmp/plugin-faces.png for eyeballing. Run: node e2e/plugin-faces-preview.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugins');

const server = createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><body></body></html>');
    return;
  }
  try {
    const body = readFileSync(join(pluginsDir, req.url.slice(1)));
    res.setHeader('Content-Type', 'text/javascript');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);

const CASES = [
  { id: 'crypto-price', action: 'ticker', settings: { coin: 'bitcoin', currency: 'usd' }, presses: 2 },
  { id: 'weather', action: 'temperature', settings: { lat: '43.65', lon: '-79.38', unit: 'c' }, presses: 1 },
  { id: 'world-clock', action: 'clock', settings: { tz: 'Europe/London', city: 'London' }, presses: 1 },
  { id: 'pomodoro', action: 'timer', settings: { minutes: '25', breakMinutes: '5' }, presses: 0 },
  { id: 'soundboard', action: 'play', settings: { name: 'AIRHORN' }, presses: 0 },
  { id: 'web-request', action: 'request', settings: { url: 'https://httpbin.org/status/200', name: 'DEPLOY', method: 'GET' }, presses: 1 },
  { id: 'philips-hue', action: 'toggle', settings: { name: 'DESK LAMP' }, presses: 0 },
  { id: 'text-snippet', action: 'type', settings: { text: 'Thanks for watching!' }, presses: 0 },
  { id: 'zoom-control', action: 'mute', settings: {}, presses: 0 },
  { id: 'zoom-control', action: 'hand', settings: {}, presses: 0 },
  { id: 'screenshot', action: 'capture', settings: { mode: 'area' }, presses: 0 },
  { id: 'system-actions', action: 'lock', settings: {}, presses: 0 },
  { id: 'system-actions', action: 'dark-mode', settings: {}, presses: 0 },
  { id: 'home-assistant', action: 'webhook', settings: { name: 'LIGHTS' }, presses: 0 },
];

const dataUrl = await page.evaluate(
  async ({ port, cases }) => {
    const faces = []; // { title, url }

    for (const c of cases) {
      const mod = await import(`http://127.0.0.1:${port}/${c.id}/main.js`);
      const registered = new Map();
      mod.activate({
        registerAction: (spec) => registered.set(spec.type, spec),
        onDispose: () => {},
        log: () => {},
      });
      const spec = registered.get(c.action);
      let last = null;
      const ctx = {
        slot: 0,
        log: () => {},
        setKeyFace: () => {},
        shell: async () => {},
        hotkey: async () => {},
        fetch: async (url, init) => {
          const res = await fetch(url, init);
          const body = await res.text();
          return { status: res.status, ok: res.ok, body, json: () => JSON.parse(body) };
        },
        paintFace: async (canvas) => { last = canvas.toDataURL(); },
        setKeyImage: async (canvas) => { last = canvas.toDataURL(); },
      };
      try {
        if (spec.onAssign) await spec.onAssign.call(spec, c.settings, ctx);
        faces.push({ title: `${c.id}:${c.action} (assign)`, url: last });
        for (let p = 0; p < c.presses; p++) {
          await spec.execute.call(spec, c.settings, ctx);
          await new Promise((r) => setTimeout(r, 150));
          faces.push({ title: `${c.id}:${c.action} press ${p + 1}`, url: last });
        }
      } catch (err) {
        faces.push({ title: `${c.id}:${c.action} ERROR ${err}`, url: null });
      }
    }

    // composite grid
    const cols = 5;
    const cell = 140;
    const rows = Math.ceil(faces.length / cols);
    const out = document.createElement('canvas');
    out.width = cols * cell;
    out.height = rows * (cell + 16);
    const g = out.getContext('2d');
    g.fillStyle = '#22262b';
    g.fillRect(0, 0, out.width, out.height);
    for (let i = 0; i < faces.length; i++) {
      const x = (i % cols) * cell + 6;
      const y = Math.floor(i / cols) * (cell + 16) + 6;
      if (faces[i].url) {
        const img = new Image();
        img.src = faces[i].url;
        await new Promise((r) => (img.onload = r));
        g.drawImage(img, x, y, 128, 128);
      } else {
        g.fillStyle = '#802020';
        g.fillRect(x, y, 128, 128);
        g.fillStyle = '#fff';
      }
      g.fillStyle = '#9aa5b0';
      g.font = '9px system-ui';
      g.fillText(faces[i].title.slice(0, 30), x, y + 138);
    }
    return out.toDataURL('image/png');
  },
  { port, cases: CASES },
);

writeFileSync('/tmp/plugin-faces.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote /tmp/plugin-faces.png');
await browser.close();
server.close();
