import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { currentOrder, initialState, step } from '../src/core/game';

const MONSTERS = ['og', 'gobbler', 'speedy', 'fussy', 'sneezer', 'doubleTrouble'];
const ROUND = 'celebration.round.m4a';
const LEVEL = 'celebration.level.m4a';
const firstSeeds = new Map<string, number>();
for (let seed = 1; seed <= 1000 && firstSeeds.size < MONSTERS.length; seed++) {
  const monster = currentOrder(step(initialState({ seed }), { type: 'go' }))?.monster;
  if (monster && !firstSeeds.has(monster)) firstSeeds.set(monster, seed);
}

interface SoundEvent {
  event: 'playing' | 'ended' | 'pause' | 'error';
  file: string;
  phase: string;
  phaseMs: number;
  currentTime: number;
  duration: number;
}

declare global {
  interface Window {
    __celebrationEvents: SoundEvent[];
    __readCelebrationState?: () => { phase: string; phaseMs: number };
  }
}

async function observeCelebrations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__celebrationEvents = [];
    const watched = new WeakSet<HTMLMediaElement>();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      const url = new URL(this.currentSrc || this.src);
      if (url.pathname.startsWith('/audio/sfx/') && !watched.has(this)) {
        watched.add(this);
        for (const event of ['playing', 'ended', 'pause', 'error'] as const) {
          this.addEventListener(event, () => {
            const state = window.__readCelebrationState?.();
            window.__celebrationEvents.push({
              event,
              file: url.pathname.split('/').at(-1) ?? '',
              phase: state?.phase ?? '',
              phaseMs: state?.phaseMs ?? -1,
              currentTime: this.currentTime,
              duration: this.duration,
            });
          });
        }
      }
      return play.call(this);
    };
  });
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const events = await page.evaluate(() => window.__celebrationEvents).catch(() => []);
  const path = testInfo.outputPath('celebration-playback-events.json');
  await writeFile(path, JSON.stringify(events, null, 2));
  await testInfo.attach('celebration-playback-events', {
    path,
    contentType: 'application/json',
  });
});

async function startGame(page: Page, query = 'seed=99'): Promise<void> {
  await page.goto(`/?test=1&speed=20&${query}`);
  await page.evaluate(async () => {
    const modulePath = '/src/ui/store.ts';
    const { getStore } = await import(modulePath);
    window.__readCelebrationState = () => getStore().getState();
  });
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 20_000 });
}

async function serveCorrect(page: Page): Promise<string> {
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 20_000 });
  const monster = await page.evaluate(async () => {
    const modulePath = '/src/ui/store.ts';
    const { getStore } = await import(modulePath);
    const state = getStore().getState();
    return state.orders[state.orderIndex].monster as string;
  });
  const ticket = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  expect(ticket.length).toBeGreaterThan(0);
  for (const id of ticket) await page.locator(`[data-tray-item="${id}"]`).click();
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('nom-nom')).toBeVisible();
  return monster;
}

const played = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__celebrationEvents.filter((e) => e.event === 'playing').map((e) => e.file));
const ended = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.__celebrationEvents.filter((e) => e.event === 'ended').map((e) => e.file));

test('all eight celebration assets load and decode', async ({ page }) => {
  await page.goto('/');
  const files = [...MONSTERS.map((id) => `monster.${id}.nom.m4a`), ROUND, LEVEL];
  const durations = await page.evaluate(async (names) => {
    const context = new AudioContext();
    try {
      return await Promise.all(
        names.map(async (file) => {
          const response = await fetch(`/audio/sfx/${file}`);
          if (!response.ok) throw new Error(`Missing celebration: ${file}`);
          const audio = await context.decodeAudioData(await response.arrayBuffer());
          return audio.duration;
        }),
      );
    } finally {
      await context.close();
    }
  }, files);
  expect(durations).toHaveLength(8);
  for (const duration of durations) {
    expect(duration).toBeGreaterThan(0.2);
    expect(duration).toBeLessThan(8);
  }
});

for (const monster of MONSTERS) {
  test(`${monster} munches once, followed by one delayed round celebration`, async ({ page }, testInfo) => {
    await observeCelebrations(page);
    const seed = firstSeeds.get(monster);
    expect(seed).toBeDefined();
    await startGame(page, `seed=${seed}`);
    expect(await serveCorrect(page)).toBe(monster);
    const expected = [`monster.${monster}.nom.m4a`, ROUND];
    if (monster === 'og') {
      await expect.poll(() => played(page), { intervals: [50] }).toEqual(expected);
      await expect(page.getByTestId('celebration-confetti')).toHaveAttribute('data-active', 'true');
      await page.screenshot({ path: testInfo.outputPath('celebration-round.png') });
    }
    await expect.poll(() => ended(page), { timeout: 10_000 }).toEqual(expected);
    expect(await played(page)).toEqual(expected);
    const events = await page.evaluate(() => window.__celebrationEvents);
    const starts = events.filter((e) => e.event === 'playing');
    expect(starts.every((e) => e.phase === 'serveResult')).toBe(true);
    expect(starts[0].phaseMs).toBeLessThan(1100);
    expect(starts[1].phaseMs).toBeGreaterThanOrEqual(1100);
    expect(events.findIndex((e) => e.event === 'ended' && e.file === expected[0])).toBeLessThan(
      events.findIndex((e) => e.event === 'playing' && e.file === ROUND),
    );
    expect(events.filter((e) => e.event === 'error')).toEqual([]);
  });
}

test('wrong serves and timeouts do not trigger a celebration', async ({ page }) => {
  await observeCelebrations(page);
  await startGame(page);
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('wrong-feedback')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 10_000 });
  expect(await played(page)).toEqual([]);
  // Advance the real core clock with activity between ticks so idle freezing
  // cannot suppress the timeout. Media playback itself is never stubbed.
  await page.evaluate(async () => {
    const modulePath = '/src/ui/store.ts';
    const { getStore } = await import(modulePath);
    const store = getStore();
    for (let i = 0; i < 100 && store.getState().phase === 'cooking'; i++) {
      store.dispatch({ type: 'addItem', item: 'cheese' });
      store.dispatch({ type: 'tick', ms: Math.min(5000, store.getState().patienceLeftMs) });
    }
    if (store.getState().result?.kind !== 'timeout') throw new Error('Timeout did not occur');
  });
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'serveResult');
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-phase', 'serveResult', { timeout: 10_000 });
  expect(await played(page)).toEqual([]);
});

test('a level completion adds one fanfare after its round celebrations', async ({ page }, testInfo) => {
  await observeCelebrations(page);
  await startGame(page);
  const expected: string[] = [];
  for (let i = 0; i < 3; i++) {
    const monster = await serveCorrect(page);
    expected.push(`monster.${monster}.nom.m4a`, ROUND);
    await expect.poll(() => ended(page), { timeout: 10_000 }).toEqual(expected);
    if (i < 2) await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 20_000 });
  }
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'levelResult', { timeout: 10_000 });
  await expect.poll(() => played(page)).toEqual([...expected, LEVEL]);
  await page.screenshot({ path: testInfo.outputPath('celebration-level-result.png') });
  await expect.poll(() => ended(page), { timeout: 10_000 }).toEqual([...expected, LEVEL]);
  await page.getByTestId('continue-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 20_000 });
  expect(await played(page)).toEqual([...expected, LEVEL]);
  const fanfare = await page.evaluate(() =>
    window.__celebrationEvents.find((e) => e.event === 'playing' && e.file === 'celebration.level.m4a'),
  );
  expect(fanfare?.phase).toBe('levelResult');
});

test('the final boss gets one fanfare before the kitchen closes', async ({ page }) => {
  await observeCelebrations(page);
  await startGame(page, 'seed=99&preview=ending');
  const monster = await serveCorrect(page);
  const expected = [`monster.${monster}.nom.m4a`, ROUND, LEVEL];
  await expect.poll(() => ended(page), { timeout: 15_000 }).toEqual(expected);
  const fanfare = await page.evaluate(() =>
    window.__celebrationEvents.find((e) => e.event === 'playing' && e.file === 'celebration.level.m4a'),
  );
  expect(fanfare?.phase).toBe('bossEnding');
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', /closed|poweredOff/, { timeout: 10_000 });
  expect(await played(page)).toEqual(expected);
});

for (const action of ['mute', 'pause', 'exit'] as const) {
  test(`${action} cancels the pending round cheer without replaying it`, async ({ page }) => {
    await observeCelebrations(page);
    await startGame(page);
    const monster = await serveCorrect(page);
    await expect.poll(() => played(page)).toEqual([`monster.${monster}.nom.m4a`]);
    await page.evaluate(async (kind) => {
      const storePath = '/src/ui/store.ts';
      const audioPath = '/src/audio/audio.ts';
      const [{ getStore }, audio] = await Promise.all([import(storePath), import(audioPath)]);
      if (kind === 'mute') audio.setSoundOn(false);
      else getStore().dispatch({ type: kind === 'pause' ? 'pause' : 'powerReset' });
    }, action);
    await page.waitForTimeout(1200);
    if (action === 'pause') await page.getByTestId('resume-button').click();
    if (action === 'mute')
      await page.evaluate(async () => {
        const modulePath = '/src/audio/audio.ts';
        (await import(modulePath)).setSoundOn(true);
      });
    await page.waitForTimeout(1600);
    expect(await played(page)).toEqual([`monster.${monster}.nom.m4a`]);
    expect(await ended(page)).toEqual([]);
  });
}

test('reduced motion keeps the munch and round audio celebration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await observeCelebrations(page);
  await startGame(page);
  const monster = await serveCorrect(page);
  await expect.poll(() => ended(page), { timeout: 10_000 }).toEqual([`monster.${monster}.nom.m4a`, ROUND]);
});
