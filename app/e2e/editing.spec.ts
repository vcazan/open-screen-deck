import { expect, test, type Page } from '@playwright/test';
import { faceFingerprint, freshApp, selectKey } from './helpers';

/** HTML5 drag & drop with a real DataTransfer (mouse simulation can't). */
async function dragKey(page: Page, from: number, to: number) {
  await page.evaluate(
    ([f, t]) => {
      const caps = document.querySelectorAll('.key-cap');
      const dataTransfer = new DataTransfer();
      caps[f].dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer }));
      caps[t].dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer }));
      caps[t].dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
      caps[f].dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer }));
    },
    [from, to],
  );
}

async function nvsLabels(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]') as { label: string }[]).map(
      (k) => k?.label,
    ),
  );
}

test.describe('pro editing: swap, copy/paste, undo/redo', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('drag one key onto another swaps their full identity', async ({ page }) => {
    const face0 = await faceFingerprint(page, 0);
    await dragKey(page, 0, 1);
    await page.waitForTimeout(1200);
    expect(await faceFingerprint(page, 0)).not.toBe(face0);
    const labels = await nvsLabels(page);
    expect(labels[0]).toBe('SCENE 1');
    expect(labels[1]).toBe('MUTE');
  });

  test('cmd+z undoes a swap, shift+cmd+z redoes it', async ({ page }) => {
    await dragKey(page, 0, 1);
    await page.waitForTimeout(1200);
    expect((await nvsLabels(page))[0]).toBe('SCENE 1');

    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(1200);
    expect((await nvsLabels(page))[0]).toBe('MUTE');

    await page.keyboard.press('Meta+Shift+z');
    await page.waitForTimeout(1200);
    expect((await nvsLabels(page))[0]).toBe('SCENE 1');
  });

  test('undo reverts a label edit as one step', async ({ page }) => {
    await selectKey(page, 2);
    await page.locator('.field-input').first().fill('UNDOME');
    await page.waitForTimeout(2000); // well past the coalesce window (slow CI)
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+z');
    // Undo replays a full deck snapshot — poll instead of a fixed wait
    await expect
      .poll(
        async () =>
          (await page.evaluate(
            () => JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
          ))[2]?.label,
        { timeout: 5000 },
      )
      .toBe('SCENE 2');
  });

  test('copy a key and paste it onto another', async ({ page }) => {
    await selectKey(page, 0);
    await page.keyboard.press('Meta+c');
    await page.keyboard.press('Escape');
    await selectKey(page, 5);
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(1200);
    const labels = await nvsLabels(page);
    expect(labels[5]).toBe('MUTE');
    expect(labels[0]).toBe('MUTE'); // source untouched
  });

  test('undo restores a pasted-over key', async ({ page }) => {
    await selectKey(page, 0);
    await page.keyboard.press('Meta+c');
    await page.keyboard.press('Escape');
    await selectKey(page, 4);
    await page.keyboard.press('Meta+v');
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Meta+z');
    await page.waitForTimeout(1000);
    const nvs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
    );
    expect(nvs[4].label).toBe('BROWSER');
  });
});
