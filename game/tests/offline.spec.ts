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
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 30_000 });
});
