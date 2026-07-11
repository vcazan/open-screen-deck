import { expect, test } from '@playwright/test';
import { faceFingerprint, freshApp, keyCanvas, selectKey } from './helpers';

test.describe('deck editing', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('clicking a key opens the inspector without firing its action', async ({ page }) => {
    await selectKey(page, 0);
    await expect(page.locator('.inspector-header h2')).toContainText('Key 1');
    // no action executed (edit mode)
    const logs = await page
      .locator('.console-text', { hasText: 'action' })
      .count();
    expect(logs).toBe(0);
  });

  test('label edit repaints the key face live', async ({ page }) => {
    await selectKey(page, 1);
    const before = await faceFingerprint(page, 1);
    await page.locator('.field-input').first().fill('E2E LABEL');
    await page.waitForTimeout(900); // debounce + redraw
    expect(await faceFingerprint(page, 1)).not.toBe(before);
  });

  test('clearing label and sublabel sticks (empty string clears)', async ({ page }) => {
    await selectKey(page, 4);
    // set text first, then clear — the regression was cleared text reappearing
    await page.locator('.field-input').first().fill('TEMP');
    await page.locator('.field-input').nth(1).fill('TMP2');
    await page.waitForTimeout(900);
    await page.locator('.field-input').first().fill('');
    await page.locator('.field-input').nth(1).fill('');
    await page.waitForTimeout(900);
    const nvs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
    );
    expect(nvs[4].label).toBe('');
    expect(nvs[4].sublabel).toBe('');
    // the inputs stay empty (no resurrection from a stale device echo)
    await page.waitForTimeout(600);
    await expect(page.locator('.field-input').first()).toHaveValue('');
  });

  test('background color change repaints the face', async ({ page }) => {
    await selectKey(page, 2);
    const before = await faceFingerprint(page, 2);
    await page.locator('.color-swatch').nth(2).click(); // red
    await page.waitForTimeout(600);
    expect(await faceFingerprint(page, 2)).not.toBe(before);
  });

  test('escape closes the inspector', async ({ page }) => {
    await selectKey(page, 0);
    await page.keyboard.press('Escape');
    await expect(page.locator('.inspector-panel')).toHaveCount(0);
  });

  test('arrow keys move the selection within the grid', async ({ page }) => {
    await selectKey(page, 0);
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.inspector-header h2')).toContainText('Key 2');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.inspector-header h2')).toContainText('Key 4');
  });

  test('reset deck restores default faces', async ({ page }) => {
    await selectKey(page, 0);
    await page.locator('.field-input').first().fill('CHANGED');
    await page.waitForTimeout(800);
    await page.locator('.qa-row', { hasText: 'Reset deck' }).click();
    await page.waitForTimeout(800);
    const nvs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
    );
    expect(nvs[0].label).toBe('MUTE');
  });

  test('key faces render non-blank content', async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      await expect(keyCanvas(page, i)).toBeVisible();
    }
    const blank = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      return canvas.toDataURL();
    });
    expect(await faceFingerprint(page, 0)).not.toBe(blank);
  });
});
