import { expect, test, type Page } from '@playwright/test';

interface AudioAudit {
  started: string[];
  ended: string[];
  errors: string[];
  overlaps: string[][];
  spoken: string[];
  phases: { phase: string; active: string[]; ended: number }[];
}

declare global {
  interface Window {
    __voiceAudit: AudioAudit;
  }
}

/** Observe real media playback; do not replace it with a resolved test stub. */
async function observeAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__voiceAudit = { started: [], ended: [], errors: [], overlaps: [], spoken: [], phases: [] };
    const active = new Set<HTMLMediaElement>();
    const watched = new WeakSet<HTMLMediaElement>();
    const name = (media: HTMLMediaElement): string =>
      new URL(media.currentSrc || media.src).pathname.split('/').at(-1) ?? '';
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      // Celebration sounds have their own audit; this suite checks Dad's voice.
      if (!new URL(this.currentSrc || this.src).pathname.startsWith('/audio/clips/')) return play.call(this);
      if (!watched.has(this)) {
        watched.add(this);
        this.addEventListener('playing', () => {
          active.add(this);
          window.__voiceAudit.started.push(name(this));
          if (active.size > 1) window.__voiceAudit.overlaps.push([...active].map(name));
        });
        this.addEventListener('ended', () => {
          active.delete(this);
          window.__voiceAudit.ended.push(name(this));
        });
        this.addEventListener('pause', () => active.delete(this));
        this.addEventListener('error', () => {
          active.delete(this);
          window.__voiceAudit.errors.push(name(this));
        });
      }
      return play.call(this);
    };
    const speak = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = (utterance) => {
      if (utterance.text.trim()) window.__voiceAudit.spoken.push(utterance.text);
      speak(utterance);
    };
    document.addEventListener('DOMContentLoaded', () => {
      new MutationObserver((records) => {
        for (const record of records) {
          const phase = (record.target as HTMLElement).getAttribute('data-phase');
          if (phase)
            window.__voiceAudit.phases.push({
              phase,
              active: [...active].map(name),
              ended: window.__voiceAudit.ended.length,
            });
        }
      }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-phase'] });
    });
  });
}

test('every current order and ingredient recording loads and decodes', async ({ page }) => {
  await page.goto('/');
  const decoded = await page.evaluate(async () => {
    const { clips } = (await (await fetch('/audio/clips.json')).json()) as {
      clips: { id: string; file?: string; category: string }[];
    };
    const current = clips.filter((clip) => clip.category === 'order' || clip.category === 'ingredients');
    const context = new AudioContext();
    try {
      return await Promise.all(
        current.map(async (clip) => {
          if (!clip.file) throw new Error(`Missing recording for ${clip.id}`);
          const response = await fetch(`/audio/clips/${clip.file}`);
          if (!response.ok) throw new Error(`Cannot load ${clip.id}: ${response.status}`);
          const buffer = await context.decodeAudioData(await response.arrayBuffer());
          return { id: clip.id, duration: buffer.duration, channels: buffer.numberOfChannels };
        }),
      );
    } finally {
      await context.close();
    }
  });
  expect(decoded).toHaveLength(40);
  for (const clip of decoded) {
    expect(clip.duration, clip.id).toBeGreaterThan(0.2);
    expect(clip.duration, clip.id).toBeLessThan(3);
    expect(clip.channels, clip.id).toBe(1);
  }
});

test('Dad recordings play through the tutorial, an order, HELP, and a correct serve', async ({ page }, testInfo) => {
  await observeAudio(page);
  // Deliberately omit ?test=1: that mode skips all gameplay voice playback.
  await page.goto('/');
  await page.getByTestId('go-button').click();
  await expect(page.getByTestId('tour')).toHaveAttribute('data-step', '0');
  await expect
    .poll(() => page.evaluate(() => window.__voiceAudit.ended))
    .toEqual(['ing.lettuce.m4a', 'ing.tomato.m4a']);
  for (let i = 0; i < 3; i++) await page.getByTestId('tour-next').click();

  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'ordering');
  await expect(page.locator('[data-sill-item]')).toHaveCount(2, { timeout: 20_000 });
  const ticket = await page
    .locator('[data-sill-item]')
    .evaluateAll((items) => items.map((item) => item.getAttribute('data-sill-item') ?? ''));
  const callout = ['phrase.order_up.m4a', `ing.${ticket[0]}.m4a`, 'phrase.and.m4a', `ing.${ticket[1]}.m4a`];
  const initial = ['ing.lettuce.m4a', 'ing.tomato.m4a', ...callout];
  await expect.poll(() => page.evaluate(() => window.__voiceAudit.ended), { timeout: 20_000 }).toEqual(initial);
  await expect(page.getByTestId('stage')).toHaveAttribute('data-phase', 'cooking', { timeout: 20_000 });

  await page.getByTestId('chef-help').click();
  await expect(page.getByTestId('chef-help')).toHaveAttribute('data-helping', 'true');
  await expect
    .poll(() => page.evaluate(() => window.__voiceAudit.ended), { timeout: 20_000 })
    .toEqual([...initial, ...callout]);
  await expect(page.getByTestId('chef-help')).not.toHaveAttribute('data-helping', 'true', { timeout: 20_000 });
  for (const id of ticket) await page.locator(`[data-tray-item="${id}"]`).click();
  await page.getByTestId('bell').click();
  await expect(page.getByTestId('nom-nom')).toBeVisible();

  const audit = await page.evaluate(() => window.__voiceAudit);
  expect(audit.started).toEqual([...initial, ...callout]);
  expect(audit.errors).toEqual([]);
  expect(audit.overlaps).toEqual([]);
  expect(audit.spoken).toEqual([]);
  expect(audit.phases.find((change) => change.phase === 'cooking')).toEqual({
    phase: 'cooking',
    active: [],
    ended: initial.length,
  });
  await page.screenshot({ path: testInfo.outputPath('dad-voice-correct-serve.png') });
  await testInfo.attach('native-audio-playback', {
    body: JSON.stringify(audit, null, 2),
    contentType: 'application/json',
  });
});

test('a doubled ingredient plays once and mute interrupts recorded playback', async ({ page }) => {
  await observeAudio(page);
  await page.goto('/');
  // A real user gesture unlocks media before exercising the composed call-out.
  await page.getByTestId('go-button').click();
  await expect.poll(() => page.evaluate(() => window.__voiceAudit.ended)).toHaveLength(2);
  await page.evaluate(async () => {
    const modulePath = '/src/audio/audio.ts';
    const audio = await import(modulePath);
    await audio.playCallout(['cheese', 'pickles', 'pickles']);
  });
  const expected = [
    'ing.lettuce.m4a',
    'ing.tomato.m4a',
    'phrase.order_up.m4a',
    'ing.cheese.m4a',
    'phrase.and.m4a',
    'amount.double.m4a',
    'ing.pickles.m4a',
  ];
  expect(await page.evaluate(() => window.__voiceAudit.ended)).toEqual(expected);
  await page.evaluate(async () => {
    const modulePath = '/src/audio/audio.ts';
    const audio = await import(modulePath);
    const before = window.__voiceAudit.started.length;
    const playback = audio.playCallout(['sauce.redChunky', 'scoop.strawberry']);
    const deadline = Date.now() + 5000;
    while (window.__voiceAudit.started.length === before) {
      if (Date.now() > deadline) throw new Error('Recorded call-out did not start');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    audio.setSoundOn(false);
    await playback;
    await audio.playClipById('ing.cheese');
  });
  const audit = await page.evaluate(() => window.__voiceAudit);
  expect(audit.started).toEqual([...expected, 'phrase.order_up.m4a']);
  expect(audit.ended).toEqual(expected);
  expect(audit.errors).toEqual([]);
  expect(audit.overlaps).toEqual([]);
  expect(audit.spoken).toEqual([]);
});
