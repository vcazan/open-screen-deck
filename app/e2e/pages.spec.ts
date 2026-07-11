import { expect, test, type Page } from '@playwright/test';
import { faceFingerprint, freshApp, selectKey } from './helpers';

const addPageBtn = (page: Page) => page.locator('.deck-page-btn[aria-label="Add page"]');
const removePageBtn = (page: Page) =>
  page.locator('.deck-page-btn[aria-label="Remove last page"]');
const pageTabs = (page: Page) => page.locator('.deck-page-btn[role="tab"]');

test.describe('dynamic multi-page decks', () => {
  test.beforeEach(async ({ page }) => {
    await freshApp(page);
  });

  test('decks start with one page; + adds pages up to the ceiling', async ({ page }) => {
    await expect(pageTabs(page)).toHaveCount(1);
    await addPageBtn(page).click();
    await page.waitForTimeout(500);
    await expect(pageTabs(page)).toHaveCount(2);
    // adding jumps to the fresh page
    await expect(pageTabs(page).nth(1)).toHaveClass(/active/);
    // ceiling is 8 — the + button disappears there
    for (let i = 2; i < 8; i++) {
      await addPageBtn(page).click();
      await page.waitForTimeout(250);
    }
    await expect(pageTabs(page)).toHaveCount(8);
    await expect(addPageBtn(page)).toHaveCount(0);
  });

  test('page count and current page survive a reload', async ({ page }) => {
    await addPageBtn(page).click();
    await addPageBtn(page).click();
    await page.waitForTimeout(500);
    await expect(pageTabs(page)).toHaveCount(3);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await expect(pageTabs(page)).toHaveCount(3);
    await expect(pageTabs(page).nth(2)).toHaveClass(/active/);
  });

  test('edits land on the current page only', async ({ page }) => {
    await addPageBtn(page).click();
    await page.waitForTimeout(500);
    await selectKey(page, 0);
    await expect(page.locator('.inspector-page-chip')).toContainText('Page 2');
    await page.locator('.field-input').first().fill('PAGE2KEY');
    await page.waitForTimeout(900);
    const page2Face = await faceFingerprint(page, 0);
    await pageTabs(page).nth(0).click();
    await page.waitForTimeout(600);
    expect(await faceFingerprint(page, 0)).not.toBe(page2Face);
    const nvs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
    );
    expect(nvs[6].label).toBe('PAGE2KEY'); // slot 6 = page 2, position 1
  });

  test('removing a page resets its keys — re-adding starts fresh', async ({ page }) => {
    await addPageBtn(page).click();
    await page.waitForTimeout(500);
    await selectKey(page, 0);
    await page.locator('.field-input').first().fill('DOOMED');
    await page.waitForTimeout(900);
    await page.keyboard.press('Escape');
    await removePageBtn(page).click();
    await page.waitForTimeout(600);
    await expect(pageTabs(page)).toHaveCount(1);
    // re-add: the page comes back with defaults, not "DOOMED"
    await addPageBtn(page).click();
    await page.waitForTimeout(600);
    const nvs = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-simulator-nvs-v2') ?? '[]'),
    );
    expect(nvs[6].label).toBe('KEY 1');
  });

  test('a page-next key cycles pages in test mode', async ({ page }) => {
    await addPageBtn(page).click();
    await page.waitForTimeout(500);
    await pageTabs(page).nth(0).click();
    await page.waitForTimeout(400);
    await selectKey(page, 5);
    await page.locator('.action-type-select').first().selectOption('page_next');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.locator('.deck-mode-btn', { hasText: 'Test' }).click();
    await page.locator('.key-cap').nth(5).click();
    await page.waitForTimeout(700);
    await expect(pageTabs(page).nth(1)).toHaveClass(/active/);
  });

  test('per-page actions: same position, different action per page', async ({ page }) => {
    await selectKey(page, 0);
    await page.locator('.action-type-select').first().selectOption('open_url');
    await page.locator('.action-editor .field-input').first().fill('https://page1.example');
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await addPageBtn(page).click();
    await page.waitForTimeout(600);
    await selectKey(page, 0);
    await page.locator('.action-type-select').first().selectOption('shell');
    await page.waitForTimeout(600);
    const actions = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('osd-key-actions-v1') ?? '[]'),
    );
    expect(actions[0].type).toBe('open_url');
    expect(actions[6].type).toBe('shell');
  });

  test('profiles carry their page count', async ({ page }) => {
    await addPageBtn(page).click();
    await page.waitForTimeout(500);
    // save a 2-page profile
    await page.locator('.nav-item[aria-label="Profiles"]').click();
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await expect(page.locator('.profile-card-meta').first()).toContainText('2 pages');
    // shrink the deck to 1 page
    await page.locator('.nav-item[aria-label="Deck"]').click();
    await removePageBtn(page).click();
    await page.waitForTimeout(600);
    await expect(pageTabs(page)).toHaveCount(1);
    // create a second (1-page) profile, then re-apply the 2-page one
    await page.locator('.nav-item[aria-label="Profiles"]').click();
    await page.locator('.profiles-toolbar button', { hasText: 'New profile' }).click();
    await page.locator('.profile-apply-btn').first().click();
    await page.waitForTimeout(1200);
    await page.locator('.nav-item[aria-label="Deck"]').click();
    await expect(pageTabs(page)).toHaveCount(2);
  });
});
