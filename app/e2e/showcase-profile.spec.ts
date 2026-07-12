import { expect, test, type Page } from '@playwright/test';
import { freshApp } from './helpers';

const pageTabs = (page: Page) => page.locator('.deck-page-btn[role="tab"]');

async function addShowcase(page: Page) {
  await page.locator('.nav-item[aria-label="Profiles"]').click();
  const card = page.locator('.profile-template-card', { hasText: 'Plugin Showcase' });
  await expect(card).toBeVisible();
  await card.locator('button', { hasText: 'Add' }).click();
  await page.waitForTimeout(800); // 24 SET_KEYs settle
}

/** The Plugin Showcase template: 4 pages, every plugin, nav corners. */
test.describe('plugin showcase template', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('template card lists 4 pages and applying saves an active profile', async ({ page }) => {
    await addShowcase(page);
    await expect(
      page.locator('.profile-template-card', { hasText: 'Plugin Showcase' }),
    ).toContainText('4 pages');

    const saved = page.locator('.profile-card', { hasText: 'Plugin Showcase' });
    await expect(saved).toBeVisible();
    await expect(saved).toContainText('4 pages');
    await expect(saved.locator('.profile-active-badge')).toBeVisible();
  });

  test('deck gets 4 pages with every plugin and nav corners on each page', async ({ page }) => {
    await addShowcase(page);
    await page.locator('.nav-item[aria-label="Deck"]').click();
    await expect(page.locator('.deck-grid')).toBeVisible();
    await expect(pageTabs(page)).toHaveCount(4);

    const state = await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('osd-key-actions-v2') ?? '{}') as {
        single?: ({ type: string; plugin?: string } | null)[];
      };
      return (store.single ?? []).slice(0, 24).map((a) => a?.plugin ?? a?.type ?? 'none');
    });

    // Nav corners on every page: slot 3 = prev, slot 5 = next
    for (let p = 0; p < 4; p++) {
      expect(state[p * 6 + 3]).toBe('page_prev');
      expect(state[p * 6 + 5]).toBe('page_next');
    }
    // Every bundled plugin appears somewhere on the deck
    const pluginIds = new Set(
      state.filter((t) => t.includes(':')).map((t) => t.split(':')[0]),
    );
    expect([...pluginIds].sort()).toEqual(
      [
        'crypto-price',
        'home-assistant',
        'philips-hue',
        'pomodoro',
        'screenshot',
        'soundboard',
        'system-actions',
        'text-snippet',
        'weather',
        'web-request',
        'world-clock',
        'zoom-control',
      ].sort(),
    );
  });

  test('nav corners cycle the pages in test mode', async ({ page }) => {
    await addShowcase(page);
    await page.locator('.nav-item[aria-label="Deck"]').click();
    await expect(pageTabs(page)).toHaveCount(4);
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();

    // NEXT (slot 5) walks forward
    for (let expected = 1; expected < 4; expected++) {
      await page.locator('.key-cap').nth(5).click();
      await page.waitForTimeout(600);
      await expect(pageTabs(page).nth(expected)).toHaveClass(/active/);
    }
    // PREV (slot 3) steps back
    await page.locator('.key-cap').nth(3).click();
    await page.waitForTimeout(600);
    await expect(pageTabs(page).nth(2)).toHaveClass(/active/);
  });
});
