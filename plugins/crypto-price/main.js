/**
 * Crypto price ticker — CoinGecko public API. Press once to start a live
 * ticker (refreshes every 2 minutes); press again to refresh immediately.
 * The face turns green/red with the 24 h trend.
 */

const timers = new Map();

function short(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 100) return n.toFixed(0);
  if (n >= 1) return n.toFixed(2);
  return n.toPrecision(3);
}

export function activate(api) {
  api.onDispose(() => {
    timers.forEach((t) => clearInterval(t));
    timers.clear();
  });

  api.registerAction({
    type: 'ticker',
    label: 'Price ticker',
    hint: 'Live price with 24h trend color. Press to refresh; auto-updates every 2 min.',
    fields: [
      { key: 'coin', label: 'CoinGecko id', placeholder: 'bitcoin' },
      { key: 'currency', label: 'Currency', placeholder: 'usd' },
    ],
    async execute(settings, ctx) {
      const coin = (settings.coin || 'bitcoin').trim().toLowerCase();
      const cur = (settings.currency || 'usd').trim().toLowerCase();

      const refresh = async () => {
        const url =
          `https://api.coingecko.com/api/v3/simple/price?ids=${coin}` +
          `&vs_currencies=${cur}&include_24hr_change=true`;
        const res = await ctx.fetch(url);
        if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
        const data = res.json();
        const entry = data[coin];
        if (!entry) throw new Error(`unknown coin id "${coin}"`);
        const price = entry[cur];
        const change = entry[`${cur}_24h_change`] ?? 0;
        ctx.setKeyFace(ctx.slot, {
          label: short(price),
          sublabel: `${coin.slice(0, 9).toUpperCase()} ${change >= 0 ? '▲' : '▼'}${Math.abs(change).toFixed(1)}%`,
          bg: change >= 0 ? 0x1ce9 : 0xc186, // green up, red down
        });
        ctx.log(`${coin}: ${price} ${cur} (${change.toFixed(2)}% 24h)`);
      };

      await refresh();
      if (!timers.has(ctx.slot)) {
        timers.set(ctx.slot, setInterval(() => refresh().catch(() => {}), 2 * 60_000));
      }
    },
  });

  api.log('Crypto Price plugin ready');
}
