import { expect, test } from '@playwright/test';

test.describe('first-run onboarding', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'networkidle' });
  });

  test('wizard shows on first run and can be skipped', async ({ page }) => {
    await expect(page.locator('.onboarding-card')).toBeVisible();
    await expect(page.locator('.onboarding-card h2')).toContainText('Welcome');
    await page.locator('.onboarding-skip', { hasText: 'Skip setup' }).click();
    await expect(page.locator('.onboarding-card')).toHaveCount(0);
    // never shows again
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('.onboarding-card')).toHaveCount(0);
  });

  test('full walkthrough applies a starter profile with confetti', async ({ page }) => {
    await page.locator('.onboarding-next', { hasText: 'Get started' }).click();
    // browser build skips the permissions step
    await expect(page.locator('.onboarding-card h2')).toContainText('starting point');
    await page.locator('.onboarding-profile', { hasText: 'Streaming' }).click();
    await page.locator('.onboarding-next', { hasText: 'Apply profile' }).click();
    await expect(page.locator('.onboarding-done')).toBeVisible();
    await expect(page.locator('.confetti-canvas')).toBeVisible();
    await page.locator('.onboarding-next', { hasText: 'Open my deck' }).click();

    // deck got the starter layout and it became the active profile.
    // Key 1 is a mic_mute action — the live status face immediately takes
    // over its label ("LIVE" while unmuted), which is the intended behavior.
    await page.waitForTimeout(1200);
    const nvs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
    );
    expect(['MIC', 'LIVE']).toContain(nvs[0].label);
    expect(nvs[1].label).toBe('SCENE 1');
    const profiles = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-profiles') ?? '[]'),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].name).toBe('Streaming');
  });

  test('starter profile page-next key actually switches pages', async ({ page }) => {
    await page.locator('.onboarding-next', { hasText: 'Get started' }).click();
    await page.locator('.onboarding-profile', { hasText: 'Productivity' }).click();
    await page.locator('.onboarding-next', { hasText: 'Apply profile' }).click();
    await page.locator('.onboarding-next', { hasText: 'Open my deck' }).click();
    await page.waitForTimeout(1200);
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    await page.locator('.key-cap').nth(5).click(); // PAGE · Next
    await page.waitForTimeout(700);
    await expect(page.locator('.deck-page-btn').nth(1)).toHaveClass(/active/);
  });
});
