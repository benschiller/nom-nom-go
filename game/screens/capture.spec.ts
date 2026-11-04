import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Screen-QA capture recipes (art-integration skill). For each requested
 * screen and viewport: a screenshot plus DOM metrics (bleed coverage,
 * call-corner clearance, touch-target sizes) for tools/art/screen.py.
 *
 * SCREENS=S1,S2  SCREEN_QA_OUT=<dir>  npx playwright test -c playwright.screens.config.ts
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const register = JSON.parse(readFileSync(join(ROOT, 'tools/art/screens.json'), 'utf8')) as {
  viewports: Record<string, [number, number]>;
  screens: { id: string; capture: string | null }[];
};
const OUT = process.env.SCREEN_QA_OUT ?? join(ROOT, 'generated_images/screen-qa/adhoc');
const WANT = (process.env.SCREENS ?? '').split(',').filter(Boolean);

const atPhase = async (page: Page, phase: string): Promise<void> => {
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', phase, { timeout: 30_000 });
};

const RECIPES: Record<string, (page: Page) => Promise<void>> = {
  title: async (page) => {
    await page.goto('/?test=1&seed=99');
    await expect(page.getByTestId('go-button')).toBeVisible();
  },
  tour1: async (page) => {
    await page.goto('/?test=1&seed=99&tour=1');
    await page.getByTestId('go-button').click();
    await expect(page.getByTestId('tour-order')).toHaveAttribute('data-shown', '2');
  },
  tour2: async (page) => {
    await RECIPES.tour1(page);
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour')).toHaveAttribute('data-step', '1');
  },
  tour3: async (page) => {
    await RECIPES.tour2(page);
    await page.getByTestId('tour-next').click();
    await expect(page.getByTestId('tour')).toHaveAttribute('data-step', '2');
  },
  levelResult: async (page) => {
    await RECIPES.title(page);
    await page.getByTestId('go-button').click();
    for (let i = 0; i < 3; i++) {
      await atPhase(page, 'cooking');
      const expected = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
      for (const item of expected) await page.locator(`[data-tray-item="${item}"]`).first().click();
      await page.getByTestId('bell').click();
      await atPhase(page, i < 2 ? 'serveResult' : 'levelResult');
    }
    await page.waitForTimeout(1800); // stars finish popping in
  },
  ordering: async (page) => {
    await RECIPES.title(page);
    await page.getByTestId('go-button').click();
    await atPhase(page, 'ordering');
  },
  goWipe: async (page) => {
    await RECIPES.title(page);
    await page.getByTestId('go-button').click();
    await atPhase(page, 'goWipe');
  },
  cooking: async (page) => {
    await RECIPES.title(page);
    await page.getByTestId('go-button').click();
    await atPhase(page, 'cooking');
  },
  bossEnding: async (page) => {
    await page.goto('/?test=1&seed=99&speed=20&preview=ending');
    await page.getByTestId('go-button').click();
    await atPhase(page, 'cooking');
    const expected = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
    for (const item of expected) await page.locator(`[data-tray-item="${item}"]`).first().click();
    await page.getByTestId('bell').click();
    await atPhase(page, 'bossEnding');
  },
};

async function metrics(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const stage = document.querySelector('[data-testid="stage"]')!.getBoundingClientRect();
    const s = stage.width / 1600;
    const corner = {
      left: stage.left + 1280 * s,
      top: stage.top,
      right: stage.left + 1600 * s,
      bottom: stage.top + 360 * s,
    };
    const backdrops = [...document.querySelectorAll<HTMLImageElement>('img[data-art^="env."]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        id: el.dataset.art,
        covers: r.left <= 0.5 && r.top <= 0.5 && r.right >= vw - 0.5 && r.bottom >= vh - 0.5,
      };
    });
    const controls = [...document.querySelectorAll<HTMLElement>('button, [role="button"], [data-tray-item]')]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.dataset.testid ?? el.getAttribute('aria-label') ?? el.tagName.toLowerCase(),
          w: Math.round(r.width),
          h: Math.round(r.height),
          inCallCorner:
            r.right > corner.left && r.left < corner.right && r.bottom > corner.top && r.top < corner.bottom,
        };
      });
    return { viewport: [vw, vh], stageScale: s, backdrops, controls };
  });
}

for (const screen of register.screens) {
  if (!screen.capture || (WANT.length && !WANT.includes(screen.id))) continue;
  for (const [name, [w, h]] of Object.entries(register.viewports)) {
    test(`${screen.id} ${name}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await RECIPES[screen.capture!](page);
      await page.evaluate(() => document.fonts.ready);
      // complete is not enough: decoding="async" images may not be painted yet.
      await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => undefined))));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const dir = join(OUT, screen.id);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: join(dir, `${name}.png`) });
      writeFileSync(join(dir, `${name}.json`), JSON.stringify(await metrics(page), null, 2) + '\n');
    });
  }
}
