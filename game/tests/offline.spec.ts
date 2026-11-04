import { expect, test } from '@playwright/test';

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
      clips.filter((clip) => clip.file).map(async (clip) => {
        const response = await fetch(`/audio/clips/${clip.file}`);
        if (!response.ok) throw new Error(`Offline recording unavailable: ${clip.file}`);
        return (await response.arrayBuffer()).byteLength;
      }),
    );
  });
  expect(recordings).toHaveLength(40);
  expect(recordings.every((bytes) => bytes > 0)).toBe(true);
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
});
