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

test('first-play tutorial: three steps, Go is the only control, then play starts', async ({ page }) => {
  await page.goto(`${TEST_URL}&tour=1`);
  await page.getByTestId('go-button').click();
  const tour = page.getByTestId('tour');
  await expect(tour).toHaveAttribute('data-step', '0');
  await expect(page.getByTestId('tour-order')).toHaveAttribute('data-shown', '2');
  await expect(page.getByTestId('tour-skip')).toHaveCount(0);
  await expect(page.getByTestId('tour-back')).toHaveCount(0);
  await expect(tour.locator('button')).toHaveCount(1);
  await expect(page.locator('[data-testid="tour-pips"] [data-lit="true"]')).toHaveCount(1);
  await page.getByTestId('tour-next').click();
  await expect(tour).toHaveAttribute('data-step', '1');
  await expect(page.getByTestId('tour-arrow')).toBeVisible();
  await expect(page.getByTestId('tour-drag')).toBeAttached();
  await page.getByTestId('tour-next').click();
  await expect(tour).toHaveAttribute('data-step', '2');
  await expect(page.locator('[data-testid="tour-bell"] img[data-art="tut.bell"]')).toBeVisible();
  await expect(page.getByTestId('tour-next')).toHaveAttribute('aria-label', 'Start playing');
  await expect(page.locator('[data-testid="tour-pips"] [data-lit="true"]')).toHaveCount(3);
  await page.getByTestId('tour-next').click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-phase', 'title');
});

test('leaving the app mid-tutorial still leads to the first order, not the title', async ({ page }) => {
  await page.goto(`${TEST_URL}&tour=1`);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('tour')).toBeVisible();
  await page.getByTestId('tour-next').click();
  // Background the tab (iPad lock, app switch), then come back.
  await page.evaluate(() => {
    const setHidden = (hidden: boolean): void => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    setHidden(true);
    setHidden(false);
  });
  await expect(page.getByTestId('resume-button')).toHaveCount(0);
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour-next').click();
  await expect(page.getByTestId('tour')).toHaveCount(0);
  await expect(page.getByTestId('title-screen')).toHaveCount(0);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', /ordering|goWipe|cooking/);
});

test('orders at the kitchen window: sill row in order, then Nom Nom', async ({ page }) => {
  await page.goto('/?test=1&seed=99&speed=2');
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'ordering', { timeout: 30_000 });
  await expect(page.getByTestId('kiosk-items')).toHaveCount(0);
  await expect(page.getByTestId('window-monster')).toHaveAttribute('data-position', 'centre');
  const expected = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  expect(expected.length).toBeGreaterThan(0);
  await expect.poll(async () => page.locator('[data-sill-item]').count(), { timeout: 30_000 }).toBe(expected.length);
  const sill = await page
    .locator('[data-sill-item]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-sill-item')));
  expect(sill).toEqual(expected);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  await expect(page.getByTestId('window-monster')).toHaveAttribute('data-position', 'side');
  for (const item of expected) {
    await page.locator(`[data-tray-item="${item}"]`).first().click();
  }
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'serveResult', { timeout: 30_000 });
  await expect(page.getByTestId('nom-nom')).toBeVisible();
});

test('no thumbs-up blocks the tray and confetti clears after a correct serve', async ({ page }) => {
  await page.goto(TEST_URL);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  await expect(page.getByTestId('tutorial-done')).toHaveCount(0);
  const expected = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  for (const item of expected) {
    const tray = page.locator(`[data-tray-item="${item}"]`);
    const base = page.locator(`[data-base-item="${item}"]`);
    if ((await tray.count()) > 0) await tray.first().click();
    else await base.first().click();
  }
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'serveResult', { timeout: 30_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = document.querySelector('canvas');
          if (!c) return 0;
          const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
          if (!d) return 0;
          let n = 0;
          for (let i = 3; i < d.length; i += 16) if (d[i] > 0) n++;
          return n;
        }),
      { timeout: 15_000 },
    )
    .toBe(0);
});

test('a wrong serve retries the same order and a corrected retry advances', async ({ page }) => {
  await page.goto(TEST_URL);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  const expected = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'serveResult', { timeout: 30_000 });
  await expect(page.getByTestId('wrong-feedback')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  await expect(page.getByTestId('ticket')).toHaveAttribute('data-expected', expected.join(' '));
  for (const item of expected) {
    const tray = page.locator(`[data-tray-item="${item}"]`);
    const base = page.locator(`[data-base-item="${item}"]`);
    if ((await tray.count()) > 0) await tray.first().click();
    else await base.first().click();
  }
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'serveResult', { timeout: 30_000 });
  await expect(page.getByTestId('wrong-feedback')).toHaveCount(0);
});

test('Level 2 uses one merged inventory and Head Chef help replays the order, unlimited', async ({ page }) => {
  await page.goto(TEST_URL);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  await expect(page.getByTestId('ticket-monitor')).toHaveCount(0);
  await expect(page.getByTestId('ticket-hidden')).toHaveCount(0);
  const ticket = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  // The replay highlight is brief in test mode, so record every highlight
  // as it happens instead of polling for one that may already be gone.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __helpSeen: string[] }).__helpSeen = seen;
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as HTMLElement;
        if (el.dataset.helpActive === 'true' && el.dataset.trayItem) seen.push(el.dataset.trayItem);
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-help-active'] });
  });
  // Help is unlimited: the Head Chef re-calls the whole order every time.
  for (let round = 1; round <= 3; round++) {
    await page.getByTestId('chef-help').click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __helpSeen: string[] }).__helpSeen), { timeout: 10_000 })
      .toEqual(Array.from({ length: round }, () => ticket).flat());
    await expect(page.getByTestId('chef-help')).not.toHaveAttribute('data-helping', 'true');
  }
  await expect(page.getByTestId('help-pips')).toHaveCount(0);
  for (let i = 0; i < 3; i++) await playCorrectOrder(page);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-level', '2');
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  await expect(page.getByTestId('base-shelf')).toHaveCount(0);
});

test('holding the Head Chef badge in play resets completely', async ({ page }) => {
  await page.goto(TEST_URL);
  await page.evaluate(() => {
    localStorage.setItem(
      'nom-nom-go-save-v1',
      JSON.stringify({
        v: 1,
        level: 4,
        paceStep: 5,
        bossBeaten: false,
        starsByLevel: { 1: 3, 2: 3, 3: 3 },
        tutorialsSeen: ['tour'],
        gagSeen: [],
        soundOn: true,
        lastHiddenAt: null,
        kitchenId: 'paired-kitchen',
        dadKitchenId: null,
        telemetry: [],
        power: 'on',
        freshStartPending: false,
      }),
    );
  });
  await page.reload();
  await expect(page.getByTestId('parent-gate')).toBeVisible();
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  await expect(page.getByTestId('parent-gate')).toHaveCount(0);
  const power = page.getByTestId('chef-help');
  await expect(power).toBeVisible();
  const box = await power.boundingBox();
  if (!box) throw new Error('no power box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // The test-mode hold lasts 300ms and then the page resets and reloads, so
  // record the ring in-page as it appears (sessionStorage survives the reload)
  // instead of polling for it afterwards.
  await page.evaluate(() => {
    new MutationObserver(() => {
      if (document.querySelector('[data-testid="power-reset-ring"]')) sessionStorage.setItem('ringSeen', '1');
    }).observe(document.body, { subtree: true, childList: true });
  });
  // Hold until the reset reloads the page, then let go: a fixed sleep would
  // race the hold timer when the page is busy.
  const reloaded = page.waitForEvent('load', { timeout: 15_000 });
  await page.mouse.down();
  await reloaded;
  await page.mouse.up();
  await expect(page.getByTestId('go-button')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => sessionStorage.getItem('ringSeen'))).toBe('1');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('nom-nom-go-save-v1') ?? '{}'));
  expect(save.level).toBe(1);
  expect(save.paceStep).toBe(0);
  expect(save.starsByLevel).toEqual({});
  expect(save.kitchenId).toBe('paired-kitchen');
  expect(save.bossBeaten).toBe(false);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-level', '1');
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
      const intersects =
        b.left < corner.right && b.right > corner.left && b.top < corner.bottom && b.bottom > corner.top;
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
  // The pairing link renders after mount: wait for it, do not read once.
  await expect(kid.locator('body')).toContainText(/#pair=[0-9a-f-]{36}/i);
  const href = await kid.evaluate(() => {
    const match = document.body.innerText.match(/#pair=([0-9a-f-]{36})/i);
    return match ? match[1] : null;
  });
  expect(href).toBeTruthy();
  // Wire both pages to the same kitchen over LocalTransport via the child's game.
  await kid.addInitScript((kitchenId) => {
    localStorage.setItem(
      'nom-nom-go-save-v1',
      JSON.stringify({
        v: 1,
        level: 1,
        paceStep: 0,
        bossBeaten: false,
        starsByLevel: {},
        tutorialsSeen: [],
        gagSeen: [],
        soundOn: true,
        lastHiddenAt: null,
        kitchenId,
        dadKitchenId: null,
        telemetry: [],
        power: 'on',
        freshStartPending: false,
      }),
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
    // Seed once only: the full reset reloads the page, and re-seeding on
    // that reload would boot straight back into the closed kitchen.
    if (sessionStorage.getItem('seeded-once')) return;
    sessionStorage.setItem('seeded-once', '1');
    localStorage.setItem(
      'nom-nom-go-save-v1',
      JSON.stringify({
        v: 1,
        level: 6,
        paceStep: 3,
        bossBeaten: true,
        starsByLevel: { 6: 3 },
        tutorialsSeen: ['boss'],
        gagSeen: [],
        soundOn: true,
        lastHiddenAt: null,
        kitchenId: 'paired-kitchen',
        dadKitchenId: null,
        telemetry: [],
        power: 'on',
        freshStartPending: false,
      }),
    );
  });
  await page.goto('/?test=1&seed=5');
  // Boots into the shutter scene, which hands over to the hold screen.
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'poweredOff', { timeout: 15_000 });
  const power = page.getByTestId('power-on');
  const box = await power.boundingBox();
  if (!box) throw new Error('power-on button has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('go-button')).toBeVisible({ timeout: 10_000 });
  await page.mouse.up();
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('nom-nom-go-save-v1') ?? '{}'));
  expect(save.kitchenId).toBe('paired-kitchen');
  expect(save.bossBeaten).toBe(false);
  expect(save.level).toBe(1);
});

test('dev preview: final boss round plays the whole closing sequence', async ({ page }) => {
  await page.goto('/?test=1&seed=99&speed=20&preview=ending');
  await page.getByTestId('go-button').click();
  await playCorrectOrder(page);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'bossEnding', { timeout: 30_000 });
  await expect(page.getByTestId('night-scene')).toBeVisible();
  await expect(page.getByTestId('night-scene').locator('img[data-art="chef.goodbye"]')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'poweredOff', { timeout: 15_000 });
  const power = page.getByTestId('power-on');
  const box = await power.boundingBox();
  if (!box) throw new Error('power-on button has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('go-button')).toBeVisible({ timeout: 10_000 });
  await page.mouse.up();
});
