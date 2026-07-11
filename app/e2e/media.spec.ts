import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  faceFingerprint,
  freshApp,
  isKeyAnimating,
  scrollInspectorToBottom,
  selectKey,
} from './helpers';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const CLIP = join(fixtures, 'clip.webm');

async function uploadImage(page: import('@playwright/test').Page, file: string) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('.upload-dashed', { hasText: 'Upload image' }).click(),
  ]);
  await chooser.setFiles(file);
  await page.locator('button', { hasText: 'Set as key image' }).click({ timeout: 5000 });
  await page.waitForTimeout(900);
}

test.describe('media pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('image upload via cropper lands on the key face', async ({ page }) => {
    await selectKey(page, 1);
    const before = await faceFingerprint(page, 1);
    await uploadImage(page, join(fixtures, 'wide.png'));
    expect(await faceFingerprint(page, 1)).not.toBe(before);
    await expect(page.locator('.media-status-text').first()).toContainText(
      'Custom image',
    );
  });

  test('label edits composite over media without re-upload', async ({ page }) => {
    await selectKey(page, 1);
    await uploadImage(page, join(fixtures, 'wide.png'));
    const uploads = await page
      .locator('.console-text', { hasText: 'SET_IMAGE' })
      .count();
    const before = await faceFingerprint(page, 1);
    await page.locator('.field-input').first().fill('OVERLAY');
    await page.waitForTimeout(900);
    expect(await faceFingerprint(page, 1)).not.toBe(before);
    expect(
      await page.locator('.console-text', { hasText: 'SET_IMAGE' }).count(),
    ).toBe(uploads);
  });

  test('transparent logo adopts background color changes live', async ({ page }) => {
    await selectKey(page, 1);
    await uploadImage(page, join(fixtures, 'translogo.png'));
    const cornerPixel = () =>
      page.evaluate(() => {
        const c = document.querySelectorAll<HTMLCanvasElement>('.key-cap canvas')[1];
        const d = c.getContext('2d')!.getImageData(10, 10, 1, 1).data;
        return `${d[0]},${d[1]},${d[2]}`;
      });
    const initial = await cornerPixel();
    await page.locator('.color-swatch').nth(2).click(); // red
    await page.waitForTimeout(700);
    const red = await cornerPixel();
    expect(red).not.toBe(initial);
    await page.locator('.color-swatch').nth(3).click(); // green
    await page.waitForTimeout(700);
    expect(await cornerPixel()).not.toBe(red);
  });

  test('remove image reverts the key to its label face', async ({ page }) => {
    await selectKey(page, 1);
    await uploadImage(page, join(fixtures, 'wide.png'));
    const withImage = await faceFingerprint(page, 1);
    await page.locator('.media-remove-btn').first().click();
    await page.waitForTimeout(900);
    expect(await faceFingerprint(page, 1)).not.toBe(withImage);
    await expect(page.locator('.media-status')).toHaveCount(0);
  });

  test('video upload auto-plays and remove stops it', async ({ page }) => {
    test.skip(!existsSync(CLIP), 'ffmpeg unavailable — no video fixture');
    await selectKey(page, 3);
    await scrollInspectorToBottom(page);
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('.upload-dashed', { hasText: 'Drop GIF or video' }).click(),
    ]);
    await chooser.setFiles(CLIP);
    await expect(page.locator('.anim-stats')).toContainText('playing', {
      timeout: 15_000,
    });
    expect(await isKeyAnimating(page, 3)).toBe(true);

    await page.locator('.media-remove-btn').last().click();
    await page.waitForTimeout(900);
    expect(await isKeyAnimating(page, 3)).toBe(false);
  });

  test('media survives a full reload (IndexedDB SD store)', async ({ page }) => {
    await selectKey(page, 1);
    await uploadImage(page, join(fixtures, 'wide.png'));
    const before = await faceFingerprint(page, 1);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    expect(await faceFingerprint(page, 1)).toBe(before);
  });
});
