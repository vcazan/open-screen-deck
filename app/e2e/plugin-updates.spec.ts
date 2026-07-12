import { expect, test } from '@playwright/test';
import { freshApp } from './helpers';

const FIXTURE_UPDATES = [
  {
    entry: {
      id: 'crypto-price',
      name: 'Crypto Price',
      version: '2.1.0',
      description: '',
      base: 'https://example.com/crypto-price',
      files: ['manifest.json', 'main.js'],
      changelog: {
        '2.1.0': 'New store icon so you can spot the plugin at a glance.',
        '2.0.0': 'Fully drawn ticker faces: press to cycle Price, Trend, Graph.',
      },
    },
    installed: { id: 'crypto-price', name: 'Crypto Price', version: '1.0.0', description: '' },
    notes: [
      { version: '2.1.0', note: 'New store icon so you can spot the plugin at a glance.' },
      { version: '2.0.0', note: 'Fully drawn ticker faces: press to cycle Price, Trend, Graph.' },
    ],
  },
  {
    entry: {
      id: 'weather',
      name: 'Weather',
      version: '2.1.0',
      description: '',
      base: 'https://example.com/weather',
      files: ['manifest.json', 'main.js'],
      changelog: { '2.1.0': 'New store icon.' },
    },
    installed: { id: 'weather', name: 'Weather', version: '2.0.0', description: '' },
    notes: [{ version: '2.1.0', note: 'New store icon.' }],
  },
];

test.describe('plugin update prompt', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('shows updates with version jump and changelog, asks before installing', async ({
    page,
  }) => {
    await page.evaluate((updates) => {
      (window as unknown as Record<string, (u: unknown) => void>).__osdShowUpdates(updates);
    }, FIXTURE_UPDATES);

    const dialog = page.locator('.plugin-update-card');
    await expect(dialog).toBeVisible();
    await expect(page.locator('.plugin-update-head h2')).toHaveText(
      '2 plugin updates available',
    );

    // Version jump and release notes per plugin
    const crypto = page.locator('.plugin-update-row', { hasText: 'Crypto Price' });
    await expect(crypto.locator('.plugin-update-versions')).toContainText('v1.0.0');
    await expect(crypto.locator('.plugin-update-versions')).toContainText('v2.1.0');
    await expect(crypto.locator('.plugin-update-notes li')).toHaveCount(2);
    await expect(crypto).toContainText('Fully drawn ticker faces');

    // Consent: both choices offered, nothing has installed
    await expect(page.locator('.plugin-update-actions button', { hasText: 'Update all' })).toBeVisible();
    await expect(page.locator('.plugin-update-actions button', { hasText: 'Later' })).toBeVisible();
  });

  test('Later dismisses and snoozes exactly this version set', async ({ page }) => {
    await page.evaluate((updates) => {
      (window as unknown as Record<string, (u: unknown) => void>).__osdShowUpdates(updates);
    }, FIXTURE_UPDATES);

    await page.locator('.plugin-update-actions button', { hasText: 'Later' }).click();
    await expect(page.locator('.plugin-update-card')).toHaveCount(0);

    const sig = await page.evaluate(() => localStorage.getItem('osd-plugin-updates-dismissed'));
    expect(sig).toBe('crypto-price@2.1.0,weather@2.1.0');
  });

  test('close button also dismisses', async ({ page }) => {
    await page.evaluate((updates) => {
      (window as unknown as Record<string, (u: unknown) => void>).__osdShowUpdates(updates);
    }, FIXTURE_UPDATES);
    await page.locator('.plugin-update-close').click();
    await expect(page.locator('.plugin-update-card')).toHaveCount(0);
  });
});
