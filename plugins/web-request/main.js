/**
 * Web Request — the swiss-army plugin: fire any HTTP request from a key.
 * Works with IFTTT, n8n, Zapier webhooks, and any REST API.
 */

export function activate(api) {
  api.registerAction({
    type: 'request',
    label: 'HTTP request',
    hint: 'Sends the request and logs the response status to the console.',
    fields: [
      { key: 'url', label: 'URL', placeholder: 'https://example.com/hook' },
      { key: 'method', label: 'Method', placeholder: 'POST' },
      { key: 'body', label: 'Body (optional)', placeholder: '{"pressed":true}' },
      { key: 'headers', label: 'Headers JSON (optional)', placeholder: '{"Authorization":"Bearer …"}' },
    ],
    async execute(settings, ctx) {
      if (!settings.url) {
        ctx.log('web request: set a URL first');
        return;
      }
      const method = (settings.method || 'POST').toUpperCase();
      let headers = { 'Content-Type': 'application/json' };
      if (settings.headers) {
        try {
          headers = { ...headers, ...JSON.parse(settings.headers) };
        } catch {
          ctx.log('web request: headers are not valid JSON — sending without them');
        }
      }
      const res = await ctx.fetch(settings.url, {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' ? undefined : settings.body || undefined,
      });
      ctx.log(`${method} ${settings.url} → HTTP ${res.status}`);
    },
  });

  api.log('Web Request plugin ready');
}
