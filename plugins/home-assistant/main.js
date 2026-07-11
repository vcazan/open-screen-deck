/**
 * Home Assistant webhook plugin for Open Screen Deck.
 *
 * Install: copy this folder into <app data>/plugins/home-assistant/
 * (Settings → Plugins shows the exact path), then restart the companion.
 *
 * In Home Assistant, create an automation with a Webhook trigger and use
 * its ID here. The key POSTs to /api/webhook/<id> — no token required.
 */

export function activate(api) {
  api.registerAction({
    type: 'webhook',
    label: 'HA webhook',
    hint: 'POSTs to your Home Assistant webhook — pair it with a webhook-triggered automation.',
    fields: [
      { key: 'base', label: 'Home Assistant URL', placeholder: 'http://homeassistant.local:8123' },
      { key: 'id', label: 'Webhook ID', placeholder: 'deck_lights_toggle' },
      { key: 'payload', label: 'JSON payload (optional)', placeholder: '{"room":"office"}' },
    ],
    async execute(settings, ctx) {
      const base = (settings.base || '').replace(/\/+$/, '');
      if (!base || !settings.id) {
        ctx.log('webhook: set the Home Assistant URL and webhook ID first');
        return;
      }
      const res = await fetch(`${base}/api/webhook/${settings.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: settings.payload || '{}',
      });
      ctx.log(`webhook ${settings.id} → HTTP ${res.status}`);
    },
  });

  api.log('Home Assistant plugin ready');
}
