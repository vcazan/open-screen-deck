import { expect, test, type Page } from '@playwright/test';
import { freshApp, selectKey } from './helpers';

const SIZES = [
  { w: 1440, h: 860 },
  { w: 1280, h: 780 },
  { w: 1100, h: 700 },
  { w: 940, h: 640 },
] as const;

/** No visible element may overflow the viewport horizontally. */
async function assertNoClipping(page: Page) {
  const offenders = await page.evaluate(() => {
    const bad: string[] = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll<HTMLElement>(
      '.deck-container, .deck-controls, .inspector-panel, .sidebar, .status-bar',
    )) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.left < -4 || r.right > vw + 4) bad.push(`${el.className}: ${r.left}..${r.right} vs ${vw}`);
    }
    return bad;
  });
  expect(offenders).toEqual([]);
}

test.describe('responsive layout', () => {
  test('deck and controls fit at every window size', async ({ page }) => {
    await freshApp(page);
    for (const { w, h } of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      await assertNoClipping(page);
    }
  });

  test('deck and inspector coexist without overlap-clipping', async ({ page }) => {
    await freshApp(page);
    await selectKey(page, 0);
    for (const { w, h } of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      await assertNoClipping(page);
      // deck keys must remain clickable (not fully hidden by the inspector)
      const deckVisible = await page.evaluate(() => {
        const deck = document.querySelector('.deck-grid')!.getBoundingClientRect();
        const panel = document.querySelector('.inspector-panel')?.getBoundingClientRect();
        if (!panel) return true;
        return deck.left < panel.left; // some deck area stays exposed
      });
      expect(deckVisible).toBe(true);
    }
  });

  test('landscape orientation also fits at narrow sizes', async ({ page }) => {
    await freshApp(page);
    await page.locator('.orient-btn').nth(1).click();
    await page.waitForTimeout(500);
    for (const { w, h } of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(500);
      await assertNoClipping(page);
    }
  });
});
