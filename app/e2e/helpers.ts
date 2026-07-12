import { expect, type Page } from '@playwright/test';

/** Fresh app state: cleared storage, deck view, simulator connected. */
export async function freshApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    // The wizard has its own spec — regular tests start past it
    localStorage.setItem('osd-onboarding-done', '1');
    for (const db of ['osd-profile-media', 'osd-simulator-sd']) {
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(db);
        req.onsuccess = req.onerror = req.onblocked = () => resolve(null);
      });
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('.status-conn')).toContainText('Simulator connected', {
    timeout: 10_000,
  });
  await page.waitForTimeout(400); // key faces render
}

export function keyCanvas(page: Page, index: number) {
  return page.locator('.key-cap canvas').nth(index);
}

/** Stable fingerprint of a key's visible face. */
export async function faceFingerprint(page: Page, index: number): Promise<string> {
  return page.evaluate(
    (i) => document.querySelectorAll<HTMLCanvasElement>('.key-cap canvas')[i].toDataURL(),
    index,
  );
}

export async function selectKey(page: Page, index: number): Promise<void> {
  await keyCanvas(page, index).click();
  await expect(page.locator('.inspector-panel')).toBeVisible();
}

/**
 * Choose an action in the visual picker. Values: action types ('hotkey',
 * 'open_url'…), 'tile:kind', 'plugin:actionId', or 'none'.
 */
export async function pickAction(page: Page, value: string): Promise<void> {
  await page.locator('.action-picker-trigger').first().click();
  await page.locator(`.action-option[data-value="${value}"]`).click();
  await expect(page.locator('.action-picker-panel')).toHaveCount(0);
}

export async function scrollInspectorToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.querySelector('.inspector-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

/** Count console lines matching a substring (opens nothing; reads DOM). */
export async function consoleLines(page: Page, includes: string): Promise<number> {
  return page.evaluate(
    (needle) =>
      Array.from(document.querySelectorAll('.console-text')).filter((e) =>
        e.textContent?.includes(needle),
      ).length,
    includes,
  );
}

export async function isKeyAnimating(page: Page, index: number): Promise<boolean> {
  return page.evaluate(async (i) => {
    const canvas = document.querySelectorAll<HTMLCanvasElement>('.key-cap canvas')[i];
    const before = canvas.toDataURL();
    await new Promise((r) => setTimeout(r, 400));
    return before !== canvas.toDataURL();
  }, index);
}
