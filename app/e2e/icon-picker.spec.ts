import { expect, test } from '@playwright/test';
import { faceFingerprint, freshApp, selectKey } from './helpers';

test.describe('icon library picker', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('search finds thousands of icons and applies one to the key face', async ({ page }) => {
    await selectKey(page, 2);
    const before = await faceFingerprint(page, 2);

    const search = page.locator('.icon-picker input');
    await search.click();
    // the library loads lazily — placeholder reports the count when ready
    await expect(search).toHaveAttribute('placeholder', /7,\d{3} icons/, { timeout: 15_000 });

    await search.fill('rocket');
    await expect(page.locator('.icon-picker-btn[aria-label="rocket"]')).toBeVisible();
    await page.locator('.icon-picker-btn[aria-label="rocket"]').click();
    await page.waitForTimeout(1000); // upload + redraw

    expect(await faceFingerprint(page, 2)).not.toBe(before);
    await expect(page.locator('.media-status-text').first()).toContainText('Custom image');
  });

  test('library icons adopt the key background color (transparency sentinel)', async ({
    page,
  }) => {
    await selectKey(page, 3);
    const search = page.locator('.icon-picker input');
    await search.click();
    await expect(search).toHaveAttribute('placeholder', /icons…/, { timeout: 15_000 });
    await search.fill('heart');
    await page.locator('.icon-picker-btn[aria-label="heart"]').click();
    await page.waitForTimeout(1000);

    const cornerPixel = () =>
      page.evaluate(() => {
        const c = document.querySelectorAll<HTMLCanvasElement>('.key-cap canvas')[3];
        const d = c.getContext('2d')!.getImageData(6, 6, 1, 1).data;
        return `${d[0]},${d[1]},${d[2]}`;
      });
    const initial = await cornerPixel();
    await page.locator('.color-swatch').nth(3).click(); // green (key 4 starts red)
    await page.waitForTimeout(800);
    expect(await cornerPixel()).not.toBe(initial); // background recolored under the icon
  });

  test('unhelpful queries explain themselves', async ({ page }) => {
    await selectKey(page, 0);
    const search = page.locator('.icon-picker input');
    await search.click();
    await expect(search).toHaveAttribute('placeholder', /icons…/, { timeout: 15_000 });
    await search.fill('zzzzqqqq');
    await expect(page.locator('.icon-picker-hint')).toContainText('No matches');
  });
});
