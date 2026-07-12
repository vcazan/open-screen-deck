import { expect, test } from '@playwright/test';
import { freshApp, pickAction, selectKey } from './helpers';

test.describe('actions and deck modes', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('mode toggle switches between edit and test and persists', async ({ page }) => {
    const testTab = page.locator('.deck-mode-btn', { hasText: 'Test' });
    await testTab.click();
    await expect(testTab).toHaveClass(/active/);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.deck-mode-btn', { hasText: 'Test' })).toHaveClass(
      /active/,
    );
  });

  test('test mode fires the key action instead of selecting', async ({ page }) => {
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    await page.locator('.key-cap').first().click();
    await expect(page.locator('.inspector-panel')).toHaveCount(0);
    await expect(page.locator('.key-hid-chip').first()).toBeVisible();
  });

  test('action type change persists per key', async ({ page }) => {
    await selectKey(page, 0);
    await pickAction(page, 'open_url');
    await page.locator('.action-editor .field-input').first().fill('https://example.com');
    await page.waitForTimeout(600);
    const actions = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-key-actions-v2') ?? '{}').single ?? [],
    );
    expect(actions[0].type).toBe('open_url');
    expect(actions[0].url).toBe('https://example.com');
  });

  test('dry-run logs the action in browser mode', async ({ page }) => {
    await selectKey(page, 0);
    await page.locator('.action-test-btn').click();
    await page.waitForTimeout(400);
    // browser mode dry-runs native actions and logs the outcome
    const logged = await page.evaluate(() => {
      const entries = document.querySelectorAll('.console-text');
      return Array.from(entries).some((e) => e.textContent?.includes('action'));
    });
    expect(logged).toBe(true);
  });

  test('hotkey editor records a chord from the keyboard', async ({ page }) => {
    await selectKey(page, 2);
    await pickAction(page, 'hotkey');
    await page.locator('.hotkey-record-btn').first().click();
    await page.keyboard.press('Meta+Shift+KeyM');
    await page.waitForTimeout(300);
    const actions = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-key-actions-v2') ?? '{}').single ?? [],
    );
    expect(actions[2].type).toBe('hotkey');
    // chord is a "+"-joined string, e.g. "cmd+shift+m"
    expect(actions[2].keys.toLowerCase()).toContain('m');
    expect(actions[2].keys.toLowerCase()).toContain('shift');
  });

  test('orientation change reflows the grid and moves the USB marker', async ({
    page,
  }) => {
    await expect(page.locator('.deck-usb.usb-top')).toBeVisible();
    await page.locator('.orient-btn').nth(1).click(); // landscape CW
    await page.waitForTimeout(600);
    await expect(page.locator('.deck-grid.landscape')).toBeVisible();
    await expect(page.locator('.deck-usb.usb-right')).toBeVisible();
    await page.locator('.orient-btn').nth(0).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.deck-usb.usb-top')).toBeVisible();
  });
});
