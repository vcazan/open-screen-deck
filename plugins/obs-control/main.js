/**
 * OBS Control — scenes, streaming, and recording over obs-websocket v5.
 * The connection (address / password / auto-connect) is managed here, in
 * the plugin's settings on the Plugins page. Keys wear drawn OBS faces
 * and repaint with the live state when pressed.
 */

const pollers = new Map(); // slot → interval (scene keys poll program scene)

function face() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#171d2b');
  grad.addColorStop(1, '#0b0e15');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return [c, g];
}

// Simplified OBS mark: three overlapping circles in a ring
function obsGlyph(g, cx, cy, color, r = 22) {
  g.strokeStyle = color;
  g.lineWidth = 3.5;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
    g.beginPath();
    g.arc(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10), 5.5, 0, Math.PI * 2);
    g.fill();
  }
}

function drawScene(name, live) {
  const [c, g] = face();
  obsGlyph(g, 64, 42, live ? '#2fd4c4' : '#5a6774');
  if (live) {
    g.fillStyle = '#2fd4c4';
    g.fillRect(0, 0, 128, 3);
  }
  g.fillStyle = '#f2f5f7';
  g.font = '700 14px system-ui';
  g.textAlign = 'center';
  g.fillText((name || 'SCENE').toUpperCase().slice(0, 13), 64, 96);
  g.fillStyle = live ? '#2fd4c4' : '#7d8894';
  g.font = '600 10px system-ui';
  g.fillText(live ? 'PROGRAM' : 'PRESS TO SWITCH', 64, 112);
  return c;
}

function drawToggle(kind, on, unknown = false) {
  const [c, g] = face();
  const color = unknown ? '#5a6774' : on ? '#e05252' : '#5a6774';
  if (kind === 'stream') {
    // broadcast dot + waves
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 46, 7, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 1; i <= 2; i++) {
      g.beginPath();
      g.arc(64, 46, 7 + i * 9, -0.75 * Math.PI, -0.25 * Math.PI);
      g.stroke();
      g.beginPath();
      g.arc(64, 46, 7 + i * 9, 0.25 * Math.PI, 0.75 * Math.PI);
      g.stroke();
    }
  } else {
    // record: ring + solid dot
    g.strokeStyle = color;
    g.lineWidth = 4;
    g.beginPath();
    g.arc(64, 46, 20, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = color;
    g.beginPath();
    g.arc(64, 46, on && !unknown ? 12 : 8, 0, Math.PI * 2);
    g.fill();
  }
  if (on && !unknown) {
    g.fillStyle = '#e05252';
    g.fillRect(0, 0, 128, 3);
  }
  g.fillStyle = '#f2f5f7';
  g.font = '700 14px system-ui';
  g.textAlign = 'center';
  g.fillText(kind === 'stream' ? 'STREAM' : 'RECORD', 64, 96);
  g.fillStyle = on && !unknown ? '#e05252' : '#7d8894';
  g.font = '600 10px system-ui';
  g.fillText(unknown ? 'PRESS TO SYNC' : on ? '● LIVE' : 'OFF', 64, 112);
  return c;
}

export function activate(api) {
  api.registerSettings(
    [
      { key: 'url', label: 'obs-websocket address', placeholder: 'ws://127.0.0.1:4455' },
      { key: 'password', label: 'Password (Tools → WebSocket Server Settings)', placeholder: '' },
      { key: 'autoConnect', label: 'Auto-connect on launch', type: 'toggle', default: '' },
    ],
    (values) => {
      const url = (values.url || '').trim();
      const auto = (values.autoConnect || '').toLowerCase().startsWith('y');
      // Empty address = disconnect; otherwise the app lazy-connects on
      // first use, or right away when auto-connect is on.
      return api.obsConnection(url, values.password || '', auto).catch((err) => {
        api.log(`OBS connection failed — ${err}`);
      });
    },
  );

  api.onDispose(() => {
    pollers.forEach((t) => clearInterval(t));
    pollers.clear();
  });

  api.registerAction({
    type: 'scene',
    label: 'OBS: Switch scene',
    hint: 'Switches the program scene. The key lights teal while its scene is live.',
    fields: [{ key: 'scene', label: 'Scene name', placeholder: 'Scene 1' }],
    async onAssign(settings, ctx) {
      await ctx.setKeyImage(drawScene(settings.scene, false));
      // Poll the program scene so the face tracks OBS even for manual
      // switches. Quiet when OBS is away; picks back up when it returns.
      if (pollers.has(ctx.slot)) clearInterval(pollers.get(ctx.slot));
      let last = null;
      pollers.set(
        ctx.slot,
        setInterval(async () => {
          try {
            const res = await ctx.obs('GetCurrentProgramScene');
            const live = res.currentProgramSceneName === settings.scene;
            if (live !== last) {
              last = live;
              await ctx.paintFace(drawScene(settings.scene, live));
            }
          } catch {
            /* OBS not reachable — leave the face as-is */
          }
        }, 3000),
      );
    },
    async execute(settings, ctx) {
      if (!settings.scene) {
        ctx.log('set a scene name first');
        return;
      }
      await ctx.obs('SetCurrentProgramScene', { sceneName: settings.scene });
      await ctx.paintFace(drawScene(settings.scene, true));
      ctx.log(`scene → ${settings.scene}`);
    },
  });

  const toggles = [
    {
      type: 'stream', label: 'OBS: Toggle stream', kind: 'stream',
      request: 'ToggleStream', status: 'GetStreamStatus',
    },
    {
      type: 'record', label: 'OBS: Toggle record', kind: 'record',
      request: 'ToggleRecord', status: 'GetRecordStatus',
    },
  ];
  for (const t of toggles) {
    api.registerAction({
      type: t.type,
      label: t.label,
      hint: 'The key turns red while live. Requires obs-websocket 5.x.',
      fields: [],
      async onAssign(_settings, ctx) {
        await ctx.setKeyImage(drawToggle(t.kind, false, true));
      },
      async execute(_settings, ctx) {
        const res = await ctx.obs(t.request);
        const on = res.outputActive ?? false;
        await ctx.paintFace(drawToggle(t.kind, on));
        ctx.log(`${t.kind} → ${on ? 'started' : 'stopped'}`);
      },
    });
  }

  api.log('OBS Control plugin ready');
}
