import { expect, test, type Page } from '@playwright/test';
import { freshApp, pickAction, selectKey } from './helpers';

const addPageBtn = (page: Page) => page.locator('.deck-page-btn[aria-label="Add page"]');
const pageTabs = (page: Page) => page.locator('.deck-page-btn[role="tab"]');

async function setDoubleAction(page: Page, keyPos: number, type: string) {
  await selectKey(page, keyPos);
  await page.locator('.segmented-option', { hasText: 'Double' }).click();
  await pickAction(page, type);
  await page.waitForTimeout(500); // tap-arm effect pushes h2 to the device
  await page.keyboard.press('Escape');
}

test.describe('multi-tap actions', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('single-only keys fire instantly — no tap-window latency', async ({ page }) => {
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    await page.locator('.key-cap').nth(0).click();
    // The HID chip appears synchronously for keys without multi-tap bindings
    await expect(page.locator('.key-hid-chip')).toBeVisible({ timeout: 150 });
  });

  test('keys with a double binding wait, then resolve the single', async ({ page }) => {
    await addPageBtn(page).click();
    await page.waitForTimeout(400);
    await pageTabs(page).nth(0).click();
    await page.waitForTimeout(400);
    await setDoubleAction(page, 0, 'page_next');

    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    await page.locator('.key-cap').nth(0).click();
    // Not yet — the deck is waiting out the tap window
    await page.waitForTimeout(120);
    await expect(page.locator('.key-hid-chip')).toHaveCount(0);
    // After the window the single-press HID fires
    await expect(page.locator('.key-hid-chip')).toBeVisible({ timeout: 800 });
    // and the page did NOT switch
    await expect(pageTabs(page).nth(0)).toHaveClass(/active/);
  });

  test('double press runs the double action, not the single', async ({ page }) => {
    await addPageBtn(page).click();
    await page.waitForTimeout(400);
    await pageTabs(page).nth(0).click();
    await page.waitForTimeout(400);
    await setDoubleAction(page, 0, 'page_next');

    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    const key = page.locator('.key-cap').nth(0);
    await key.click();
    await key.click(); // within the tap window
    await page.waitForTimeout(600);
    await expect(pageTabs(page).nth(1)).toHaveClass(/active/); // page switched
    await expect(page.locator('.key-hid-chip')).toHaveCount(0); // single suppressed
  });

  test('host-only double actions dry-run through the tap router', async ({ page }) => {
    await setDoubleAction(page, 2, 'shell');
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    const key = page.locator('.key-cap').nth(2);
    await key.click();
    await key.click();
    await page.waitForTimeout(600);
    const logged = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.console-text')).some((e) =>
        e.textContent?.includes('dry-run'),
      ),
    );
    expect(logged).toBe(true);
  });

  test('multi-tap bindings survive in profiles', async ({ page }) => {
    await setDoubleAction(page, 1, 'page_next');
    await page.locator('.nav-item[aria-label="Profiles"]').click();
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await page.waitForTimeout(600);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-profiles') ?? '[]'),
    );
    expect(stored[0].data.actionsDouble[1].type).toBe('page_next');
  });
});
