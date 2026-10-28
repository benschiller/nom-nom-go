import { expect, test, type Page } from '@playwright/test';

const TEST_URL = '/?test=1&seed=99&speed=20';

async function playCorrectOrder(page: Page): Promise<void> {
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  const expected = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  expect(expected.length).toBeGreaterThan(0);
  for (const item of expected) {
    const tray = page.locator(`[data-tray-item="${item}"]`);
    const base = page.locator(`[data-base-item="${item}"]`);
    if ((await tray.count()) > 0) await tray.first().click();
    else await base.first().click();
  }
  await page.getByTestId('bell').click();
}

test('boots and Go! starts the game', async ({ page }) => {
  await page.goto(TEST_URL);
  await expect(page.getByTestId('go-button')).toBeVisible();
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-phase', 'title');
});

test('completes Level 1 and levels up', async ({ page }) => {
  await page.goto(TEST_URL);
  await page.getByTestId('go-button').click();
  for (let i = 0; i < 3; i++) await playCorrectOrder(page);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'levelResult', { timeout: 30_000 });
  await expect(page.getByTestId('result-stars')).toBeVisible();
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-level', '2');
});

test('portrait shows the rotate overlay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto(TEST_URL);
  await expect(page.getByTestId('rotate-overlay')).toBeVisible();
});

test('call corner: no interactive element intersects the top-right corner', async ({ page }) => {
  await page.goto(TEST_URL);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  const violations = await page.evaluate(() => {
    const stage = document.querySelector('[data-testid="stage"]');
    if (!stage) return ['no stage'];
    const r = stage.getBoundingClientRect();
    const corner = { left: r.left + r.width * 0.8, top: r.top, right: r.right, bottom: r.top + r.height * 0.4 };
    const out: string[] = [];
    stage.querySelectorAll('button').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      const intersects = b.left < corner.right && b.right > corner.left && b.top < corner.bottom && b.bottom > corner.top;
      if (intersects) out.push(el.getAttribute('data-testid') ?? el.getAttribute('aria-label') ?? el.tagName);
    });
    return out;
  });
  expect(violations).toEqual([]);
});

test('mirror: Dad sees the same order and a cheer reaches the child', async ({ browser }) => {
  const context = await browser.newContext();
  const kid = await context.newPage();
  const dad = await context.newPage();
  await kid.goto('/#dad');
  const href = await kid.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/#pair=([0-9a-f-]{36})/i);
    return match ? match[1] : null;
  });
  expect(href).toBeTruthy();
  // Wire both pages to the same kitchen over LocalTransport via the child's game.
  await kid.addInitScript((kitchenId) => {
    localStorage.setItem(
      'nom-nom-go-save-v1',
      JSON.stringify({ v: 1, level: 1, paceStep: 0, bossBeaten: false, starsByLevel: {}, tutorialsSeen: [], gagSeen: [], soundOn: true, lastHiddenAt: null, kitchenId, dadKitchenId: null, telemetry: [], power: 'on', freshStartPending: false }),
    );
  }, href);
  await kid.goto(`/?test=1&seed=99&speed=20`);
  await dad.goto(`/#watch=${href}`);
  await kid.getByTestId('go-button').click();
  await expect(dad.getByTestId('dad-waiting')).toBeHidden({ timeout: 30_000 });
  await expect(dad.locator('[data-testid="dad-mirror"] [data-item]').first()).toBeVisible();
  await dad.getByTestId('cheer-thumbs').click();
  await expect(kid.getByTestId('dad-cheer')).toBeVisible({ timeout: 15_000 });
  await context.close();
});

test('power cycle: closed kitchen resets to a fresh title on next power on', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nom-nom-go-save-v1',
      JSON.stringify({ v: 1, level: 6, paceStep: 3, bossBeaten: true, starsByLevel: { 6: 3 }, tutorialsSeen: ['boss'], gagSeen: [], soundOn: true, lastHiddenAt: null, kitchenId: 'paired-kitchen', dadKitchenId: null, telemetry: [], power: 'on', freshStartPending: false }),
    );
  });
  await page.goto('/?test=1&seed=5');
  await expect(page.getByTestId('power-off')).toBeVisible();
  await page.getByTestId('power-off').click();
  await expect(page.getByTestId('power-on')).toBeVisible();
  await page.getByTestId('power-on').click();
  await expect(page.getByTestId('go-button')).toBeVisible();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('nom-nom-go-save-v1') ?? '{}'));
  expect(save.kitchenId).toBe('paired-kitchen');
  expect(save.bossBeaten).toBe(false);
});
