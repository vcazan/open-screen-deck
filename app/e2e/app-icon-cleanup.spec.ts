import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { faceFingerprint, freshApp, pickAction, selectKey } from './helpers';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function uploadImage(page: Page, file: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.upload-dashed', { hasText: 'Upload image' }).click(),
  ]);
  await chooser.setFiles(file);
  await page.locator('button', { hasText: 'Set as key image' }).click({ timeout: 5000 });
  await page.waitForTimeout(900);
}

/** Rewrite the stored media source, emulating an auto-applied app logo. */
async function tagMediaAsAppLogo(page: Page, slot: number) {
  await page.evaluate((s) => {
    const map = JSON.parse(localStorage.getItem('osd-key-media-v1') ?? '{}');
    if (map[s]) map[s].source = 'app';
    localStorage.setItem('osd-key-media-v1', JSON.stringify(map));
  }, slot);
}

test.describe('app-icon lifecycle follows the launch action', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('changing away from a Launch action removes its auto-applied logo', async ({
    page,
  }) => {
    await selectKey(page, 1);
    await pickAction(page, 'launch');
    await uploadImage(page, join(fixtures, 'wide.png'));
    await tagMediaAsAppLogo(page, 1); // emulate: this image came from the app picker
    const withLogo = await faceFingerprint(page, 1);

    // re-open the inspector so it reads the tagged media state
    await page.keyboard.press('Escape');
    await selectKey(page, 1);
    await pickAction(page, 'open_url');
    await page.waitForTimeout(1200);

    expect(await faceFingerprint(page, 1)).not.toBe(withLogo); // logo gone
    await expect(page.locator('.media-status')).toHaveCount(0);
  });

  test('deliberately uploaded images survive an action change', async ({ page }) => {
    await selectKey(page, 2);
    await pickAction(page, 'launch');
    await uploadImage(page, join(fixtures, 'wide.png')); // source stays 'upload'
    const withImage = await faceFingerprint(page, 2);

    await pickAction(page, 'hotkey');
    await page.waitForTimeout(1000);

    expect(await faceFingerprint(page, 2)).toBe(withImage); // image untouched
    await expect(page.locator('.media-status-text').first()).toContainText('Custom image');
  });
});
