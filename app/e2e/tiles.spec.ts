import { expect, test } from '@playwright/test';
import { faceFingerprint, freshApp, pickAction, selectKey } from './helpers';

test.describe('live tiles', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('clock tile paints the key face and keeps ticking', async ({ page }) => {
    await selectKey(page, 2);
    await pickAction(page, 'tile:clock');
    await page.waitForTimeout(1200); // first paint
    const first = await faceFingerprint(page, 2);
    // clock blinks its colon every second — the face must change
    await page.waitForTimeout(1600);
    const second = await faceFingerprint(page, 2);
    expect(second).not.toBe(first);
  });

  test('timer tile starts and stops on key press', async ({ page }) => {
    await selectKey(page, 3);
    await pickAction(page, 'tile:timer');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');

    // start the timer in test mode
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    await page.locator('.key-cap').nth(3).click();
    await page.waitForTimeout(700);
    const running1 = await faceFingerprint(page, 3);
    await page.waitForTimeout(1300);
    const running2 = await faceFingerprint(page, 3);
    expect(running2).not.toBe(running1); // counting up

    // stop it — face freezes
    await page.locator('.key-cap').nth(3).click();
    await page.waitForTimeout(1200);
    const stopped1 = await faceFingerprint(page, 3);
    await page.waitForTimeout(1300);
    expect(await faceFingerprint(page, 3)).toBe(stopped1);
  });

  test('tile stops painting when its page is hidden', async ({ page }) => {
    await selectKey(page, 0);
    await pickAction(page, 'tile:clock');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    // add a page and switch to it — position 0 now shows slot 6, not the clock
    await page.locator('.deck-page-btn[aria-label="Add page"]').click();
    await page.waitForTimeout(900);
    const face1 = await faceFingerprint(page, 0);
    await page.waitForTimeout(1600);
    expect(await faceFingerprint(page, 0)).toBe(face1);
  });

  test('tile does not overwrite the stored icon (SET_FACE, not SET_IMAGE)', async ({
    page,
  }) => {
    await selectKey(page, 1);
    await pickAction(page, 'tile:clock');
    await page.waitForTimeout(1500);
    // simulated SD still has no icon for this key
    const media = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('osd-simulator-sd', 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return new Promise((resolve) => {
        const tx = db.transaction('sd', 'readonly');
        const req = tx.objectStore('sd').get('store');
        req.onsuccess = () => {
          const store = req.result as { icons?: Record<number, unknown> } | undefined;
          resolve(store?.icons?.[1] !== undefined);
        };
        req.onerror = () => resolve('error');
      });
    });
    expect(media).toBe(false);
  });
});
