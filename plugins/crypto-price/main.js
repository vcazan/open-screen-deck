/**
 * Crypto Price — a real ticker, not a label. Three views, cycled by
 * pressing the key:
 *   1. PRICE  — big price + symbol
 *   2. TREND  — 24h change, arrow, green/red
 *   3. GRAPH  — 7-day sparkline
 * Data: CoinGecko public API. Auto-refreshes every 2 minutes.
 */

const state = new Map(); // slot → { view, data, spark, fetchedAt, timer }
const VIEWS = ['price', 'trend', 'graph'];

function face() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, '#161c23');
  grad.addColorStop(1, '#0b0f13');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return [c, g];
}

function short(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}

function header(g, symbol, up) {
  g.fillStyle = up ? '#2fd47c' : '#e05252';
  g.fillRect(0, 0, 128, 3);
  g.fillStyle = '#7d8894';
  g.font = '700 12px system-ui';
  g.textAlign = 'center';
  g.fillText(symbol.toUpperCase().slice(0, 10), 64, 21);
}

function drawPrice(s) {
  const [c, g] = face();
  const up = s.data.change >= 0;
  header(g, s.data.symbol, up);
  g.fillStyle = '#f2f5f7';
  g.font = '700 34px system-ui';
  g.fillText(short(s.data.price), 64, 74);
  g.fillStyle = '#8d99a6';
  g.font = '600 13px system-ui';
  g.fillText(s.data.currency.toUpperCase(), 64, 96);
  dots(g, 0);
  return c;
}

function drawTrend(s) {
  const [c, g] = face();
  const up = s.data.change >= 0;
  header(g, s.data.symbol, up);
  g.fillStyle = up ? '#2fd47c' : '#e05252';
  // big arrow
  g.beginPath();
  if (up) {
    g.moveTo(64, 34); g.lineTo(80, 56); g.lineTo(48, 56);
  } else {
    g.moveTo(64, 60); g.lineTo(80, 38); g.lineTo(48, 38);
  }
  g.closePath();
  g.fill();
  g.font = '700 26px system-ui';
  g.fillText(`${up ? '+' : ''}${s.data.change.toFixed(1)}%`, 64, 90);
  g.fillStyle = '#7d8894';
  g.font = '600 11px system-ui';
  g.fillText('24 HOURS', 64, 108);
  dots(g, 1);
  return c;
}

function drawGraph(s) {
  const [c, g] = face();
  const up = s.spark.length > 1 && s.spark[s.spark.length - 1] >= s.spark[0];
  header(g, s.data.symbol, up);
  const min = Math.min(...s.spark);
  const max = Math.max(...s.spark);
  const span = max - min || 1;
  const x = (i) => 10 + (i / (s.spark.length - 1)) * 108;
  const y = (v) => 96 - ((v - min) / span) * 56;
  // area fill
  g.beginPath();
  g.moveTo(x(0), y(s.spark[0]));
  s.spark.forEach((v, i) => g.lineTo(x(i), y(v)));
  g.lineTo(x(s.spark.length - 1), 100);
  g.lineTo(x(0), 100);
  g.closePath();
  g.fillStyle = up ? 'rgba(47,212,124,0.18)' : 'rgba(224,82,82,0.18)';
  g.fill();
  // line
  g.beginPath();
  g.moveTo(x(0), y(s.spark[0]));
  s.spark.forEach((v, i) => g.lineTo(x(i), y(v)));
  g.strokeStyle = up ? '#2fd47c' : '#e05252';
  g.lineWidth = 2.5;
  g.lineJoin = 'round';
  g.stroke();
  g.fillStyle = '#7d8894';
  g.font = '600 10px system-ui';
  g.textAlign = 'center';
  g.fillText(`${s.data.days ?? 7}D · ${short(s.data.price)}`, 64, 114);
  dots(g, 2);
  return c;
}

// View indicator dots — which of the three views you're on
function dots(g, active) {
  for (let i = 0; i < 3; i++) {
    g.fillStyle = i === active ? '#2fd4c4' : '#3a4450';
    g.beginPath();
    g.arc(52 + i * 12, 122, 2.4, 0, Math.PI * 2);
    g.fill();
  }
}

const DRAW = { price: drawPrice, trend: drawTrend, graph: drawGraph };

async function loadData(coin, cur, days, ctx) {
  const priceRes = await ctx.fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=${cur}&include_24hr_change=true`,
  );
  if (!priceRes.ok) throw new Error(`CoinGecko HTTP ${priceRes.status}`);
  const entry = priceRes.json()[coin];
  if (!entry) throw new Error(`unknown coin id "${coin}"`);

  const chartRes = await ctx.fetch(
    `https://api.coingecko.com/api/v3/coins/${coin}/market_chart?vs_currency=${cur}&days=${days}`,
  );
  const spark = chartRes.ok
    ? chartRes.json().prices.filter((_, i) => i % 4 === 0).map((p) => p[1])
    : [];

  return {
    data: { symbol: coin, currency: cur, price: entry[cur], change: entry[`${cur}_24h_change`] ?? 0, days },
    spark,
  };
}

async function refresh(slot, settings, ctx, persist = false) {
  const coin = (settings.coin || 'bitcoin').trim().toLowerCase();
  const cur = (settings.currency || 'usd').trim().toLowerCase();
  const days = ['1', '7', '30'].includes(settings.days) ? settings.days : '7';
  const s = state.get(slot) ?? { view: Math.max(0, VIEWS.indexOf(settings.view || 'price')) };
  const fresh = await loadData(coin, cur, days, ctx);
  Object.assign(s, fresh, { fetchedAt: Date.now() });
  state.set(slot, s);
  const canvas = DRAW[VIEWS[s.view]](s);
  if (persist) await ctx.setKeyImage(canvas);
  else await ctx.paintFace(canvas);
  return s;
}

export function activate(api) {
  api.onDispose(() => {
    state.forEach((s) => s.timer && clearInterval(s.timer));
    state.clear();
  });

  api.registerAction({
    type: 'ticker',
    label: 'Price ticker',
    hint: 'Press to cycle Price → Trend → Graph. Live data, refreshed every 2 min.',
    fields: [
      { key: 'coin', label: 'CoinGecko id', placeholder: 'bitcoin' },
      { key: 'currency', label: 'Currency', placeholder: 'usd' },
      {
        key: 'view', label: 'Starting view', type: 'select', default: 'price',
        options: [
          { value: 'price', label: 'Price' },
          { value: 'trend', label: '24h trend' },
          { value: 'graph', label: 'Graph' },
        ],
      },
      {
        key: 'days', label: 'Graph period', type: 'select', default: '7',
        options: [
          { value: '1', label: '24 hours' },
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
        ],
      },
    ],
    async onAssign(settings, ctx) {
      // Settings changed (or first assignment) — restart from the chosen view
      const existing = state.get(ctx.slot);
      if (existing) existing.view = Math.max(0, VIEWS.indexOf(settings.view || 'price'));
      // Take ownership of the face immediately — persisted, so it shows
      // standalone too
      const s = await refresh(ctx.slot, settings, ctx, true);
      ctx.log(`ticker on key: ${s.data.symbol} ${short(s.data.price)} ${s.data.currency}`);
      if (!s.timer) {
        s.timer = setInterval(
          () => refresh(ctx.slot, settings, ctx).catch(() => {}),
          2 * 60_000,
        );
      }
    },
    async execute(settings, ctx) {
      const s = state.get(ctx.slot);
      if (!s || !s.data) {
        await refresh(ctx.slot, settings, ctx, true);
        return;
      }
      // Press cycles the view; stale data refreshes in the background
      s.view = (s.view + 1) % VIEWS.length;
      await ctx.paintFace(DRAW[VIEWS[s.view]](s));
      ctx.log(`view: ${VIEWS[s.view]}`);
      if (Date.now() - s.fetchedAt > 2 * 60_000) {
        refresh(ctx.slot, settings, ctx).catch(() => {});
      }
    },
  });

  api.log('Crypto Price plugin ready');
}
