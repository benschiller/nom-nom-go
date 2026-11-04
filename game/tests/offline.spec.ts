import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    offlineCelebrations: string[];
  }
}

// Run against the production preview server: OFFLINE=1 npx playwright test tests/offline.spec.ts
test.skip(process.env.OFFLINE !== '1', 'offline test runs against vite preview only');

test('works offline after the service worker installs', async ({ page, context }) => {
  await page.goto('/?test=1&seed=99&speed=20');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('go-button')).toBeVisible();
  // Recorded Dad cues must be available from the service worker as well as
  // the game shell; otherwise an installed game silently falls back to TTS.
  const recordings = await page.evaluate(async () => {
    const { clips } = (await (await fetch('/audio/clips.json')).json()) as {
      clips: { file?: string }[];
    };
    return Promise.all(
      clips
        .filter((clip) => clip.file)
        .map(async (clip) => {
          const response = await fetch(`/audio/clips/${clip.file}`);
          if (!response.ok) throw new Error(`Offline recording unavailable: ${clip.file}`);
          return (await response.arrayBuffer()).byteLength;
        }),
    );
  });
  expect(recordings).toHaveLength(40);
  expect(recordings.every((bytes) => bytes > 0)).toBe(true);
  const celebrations = await page.evaluate(async () => {
    const files = [
      ...['og', 'gobbler', 'speedy', 'fussy', 'sneezer', 'doubleTrouble'].map((id) => `monster.${id}.nom.m4a`),
      'celebration.round.m4a',
      'celebration.level.m4a',
    ];
    return Promise.all(
      files.map(async (file) => {
        const response = await fetch(`/audio/sfx/${file}`);
        if (!response.ok) throw new Error(`Offline celebration unavailable: ${file}`);
        return (await response.arrayBuffer()).byteLength;
      }),
    );
  });
  expect(celebrations).toHaveLength(8);
  expect(celebrations.every((bytes) => bytes > 0)).toBe(true);
  await page.evaluate(() => {
    const ended: string[] = [];
    window.offlineCelebrations = ended;
    const watched = new WeakSet<HTMLMediaElement>();
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this.src.includes('/audio/sfx/') && !watched.has(this)) {
        watched.add(this);
        this.addEventListener('ended', () => ended.push(new URL(this.src).pathname.split('/').at(-1) ?? ''));
      }
      return play.call(this);
    };
  });
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
  const ticket = (await page.getByTestId('ticket').getAttribute('data-expected'))?.trim().split(/\s+/) ?? [];
  expect(ticket.length).toBeGreaterThan(0);
  for (const item of ticket) await page.locator(`[data-tray-item="${item}"]`).click();
  await page.getByTestId('bell').click();
  await expect
    .poll(() => page.evaluate(() => window.offlineCelebrations))
    .toEqual([expect.stringMatching(/^monster\..+\.nom\.m4a$/), 'celebration.round.m4a']);
});
