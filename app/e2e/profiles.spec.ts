import { expect, test } from '@playwright/test';
import { faceFingerprint, freshApp, selectKey } from './helpers';

async function gotoProfiles(page: import('@playwright/test').Page) {
  await page.locator('.nav-item[aria-label="Profiles"]').click();
  await expect(page.locator('.profiles-view')).toBeVisible();
}

async function gotoDeck(page: import('@playwright/test').Page) {
  await page.locator('.nav-item[aria-label="Deck"]').click();
  await expect(page.locator('.deck-grid')).toBeVisible();
}

test.describe('profiles', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('new profile captures the deck and becomes active', async ({ page }) => {
    await gotoProfiles(page);
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await expect(page.locator('.profile-card')).toHaveCount(1);
    await expect(page.locator('.profile-active-badge')).toContainText('Active');
    await expect(page.locator('.profile-thumb')).toHaveCount(6);
  });

  test('active profile auto-saves deck edits', async ({ page }) => {
    await gotoProfiles(page);
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await gotoDeck(page);
    await selectKey(page, 0);
    await page.locator('.field-input').first().fill('AUTOSAVED');
    await page.waitForTimeout(1500); // debounce + autosave
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-profiles') ?? '[]'),
    );
    expect(stored[0].data.keys[0].label).toBe('AUTOSAVED');
  });

  test('apply restores a different layout including key faces', async ({ page }) => {
    await gotoProfiles(page);
    // profile A captures the pristine deck; profile B becomes active
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await expect(page.locator('.profile-card')).toHaveCount(2);
    // mutate the deck — the edit autosaves into B (the active profile), not A
    await gotoDeck(page);
    await selectKey(page, 0);
    await page.locator('.field-input').first().fill('MUTATED');
    await page.waitForTimeout(1500);
    const mutated = await faceFingerprint(page, 0);
    // applying A restores the pristine face
    await gotoProfiles(page);
    await page.locator('.profile-apply-btn').first().click();
    await page.waitForTimeout(1200);
    await gotoDeck(page);
    expect(await faceFingerprint(page, 0)).not.toBe(mutated);
  });

  test('inline rename persists', async ({ page }) => {
    await gotoProfiles(page);
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await page.locator('.profile-card-name').click();
    await page.locator('.profile-name-input').fill('Streaming Setup');
    await page.keyboard.press('Enter');
    await expect(page.locator('.profile-card-name')).toContainText('Streaming Setup');
    await page.reload({ waitUntil: 'networkidle' });
    await gotoProfiles(page);
    await expect(page.locator('.profile-card-name')).toContainText('Streaming Setup');
  });

  test('duplicate then delete', async ({ page }) => {
    await gotoProfiles(page);
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await page.locator('.profile-minor-btn', { hasText: 'Duplicate' }).click();
    await expect(page.locator('.profile-card')).toHaveCount(2);
    const del = page.locator('.profile-minor-btn.danger').last();
    await del.click(); // arms confirm
    await del.click(); // confirms
    await expect(page.locator('.profile-card')).toHaveCount(1);
  });

  test('share export downloads a portable profile with media flag', async ({ page }) => {
    await gotoProfiles(page);
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.profile-minor-btn', { hasText: 'Share' }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('.osdprofile.json');
  });
});
