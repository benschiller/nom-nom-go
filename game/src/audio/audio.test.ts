import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calloutClipIds, itemClipIds } from './audio';

describe('call-out grammar', () => {
  it('says a doubled item once, announced as double', () => {
    expect(calloutClipIds(['cheese', 'pickles', 'pickles'])).toEqual([
      'phrase.order_up',
      'ing.cheese',
      'phrase.and',
      'amount.double',
      'ing.pickles',
    ]);
    expect(calloutClipIds(['pickles', 'pickles', 'cheese'])).toEqual([
      'phrase.order_up',
      'amount.double',
      'ing.pickles',
      'phrase.and',
      'ing.cheese',
    ]);
  });

  it('speaks each window item only when its run first appears', () => {
    const ticket = ['cheese', 'pickles', 'pickles'];
    expect(itemClipIds(ticket, 0)).toEqual(['phrase.order_up', 'ing.cheese']);
    expect(itemClipIds(ticket, 1)).toEqual(['phrase.and', 'amount.double', 'ing.pickles']);
    expect(itemClipIds(ticket, 2)).toEqual([]);
  });
});

describe('recorded voice playback', () => {
  const recordings = [
    ['phrase.order_up', 'Order up!'],
    ['phrase.and', 'and'],
    ['amount.double', 'double'],
    ['ing.cheese', 'cheese'],
    ['ing.pickles', 'pickles'],
  ].map(([id, text]) => ({ id, text, category: 'order', file: `${id}.m4a` }));
  let instances: FakeAudio[];
  let spoken: FakeUtterance[];
  let speechCancel: ReturnType<typeof vi.fn>;

  class FakeAudio {
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play = vi.fn(async () => undefined);
    pause = vi.fn();
    constructor(readonly src: string) {
      instances.push(this);
    }
  }
  class FakeUtterance {
    rate = 1;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(readonly text: string) {}
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    instances = [];
    spoken = [];
    speechCancel = vi.fn();
    vi.stubGlobal('Audio', FakeAudio);
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('window', {
      speechSynthesis: { speak: (u: FakeUtterance) => spoken.push(u), cancel: speechCancel },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ clips: recordings }) })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for each actual recording to end before playing the next part of a doubled order', async () => {
    const { playCallout } = await import('./audio');
    const playback = playCallout(['cheese', 'pickles', 'pickles']);
    await vi.advanceTimersByTimeAsync(0);
    const expected = ['phrase.order_up', 'ing.cheese', 'phrase.and', 'amount.double', 'ing.pickles'];
    for (let i = 0; i < expected.length; i++) {
      expect(instances).toHaveLength(i + 1);
      expect(instances[i].src).toBe(`/audio/clips/${expected[i]}.m4a`);
      // Real multi-clip call-outs can be longer than the old 1.4 second HELP cap.
      await vi.advanceTimersByTimeAsync(1700);
      expect(instances).toHaveLength(i + 1);
      instances[i].onended?.();
      await vi.advanceTimersByTimeAsync(40);
    }
    await playback;
    expect(spoken).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors mute for direct tutorial clips as well as entire call-outs', async () => {
    const { playClipById, playCallout, setSoundOn } = await import('./audio');
    setSoundOn(false);
    await playClipById('ing.cheese');
    await playCallout(['cheese']);
    expect(instances).toEqual([]);
    expect(spoken).toEqual([]);
  });

  it('stops an active recording on mute and does not resume stale queued clips after unmuting', async () => {
    const { playCallout, setSoundOn } = await import('./audio');
    const playback = playCallout(['cheese', 'pickles']);
    await vi.advanceTimersByTimeAsync(0);
    setSoundOn(false);
    expect(instances[0].pause).toHaveBeenCalledOnce();
    setSoundOn(true);
    await vi.runAllTimersAsync();
    await playback;
    expect(instances).toHaveLength(1);
    expect(spoken).toEqual([]);
  });

  it('aborts a tutorial or HELP sequence immediately without speaking a fallback', async () => {
    const { playKioskItem } = await import('./audio');
    const controller = new AbortController();
    const playback = playKioskItem(['cheese'], 0, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.runAllTimersAsync();
    await playback;
    expect(instances).toHaveLength(1);
    expect(instances[0].pause).toHaveBeenCalledOnce();
    expect(spoken).toEqual([]);
  });

  it('does not start audio if the screen was left while the manifest was loading', async () => {
    const { playClipById } = await import('./audio');
    let finishFetch!: (response: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finishFetch = resolve;
          }),
      ),
    );
    const controller = new AbortController();
    const playback = playClipById('ing.cheese', controller.signal);
    controller.abort();
    finishFetch({ ok: true, json: async () => ({ clips: recordings }) });
    await playback;
    expect(instances).toEqual([]);
    expect(spoken).toEqual([]);
  });

  it('can leave immediately while the shared manifest request is still stalled', async () => {
    const { playClipById, loadClips } = await import('./audio');
    let finishFetch!: (response: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const playback = playClipById('ing.cheese', controller.signal);
    const anotherCaller = loadClips();
    controller.abort();
    await playback;
    expect(instances).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
    finishFetch({ ok: true, json: async () => ({ clips: recordings }) });
    expect(await anotherCaller).toEqual(recordings);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['request', 'body'])('bounds a stalled manifest %s and retries successfully afterward', async (stalled) => {
    const { playClipById } = await import('./audio');
    const never = new Promise(() => undefined);
    const fetchMock = vi.fn(async () => (stalled === 'request' ? never : { ok: true, json: () => never }));
    vi.stubGlobal('fetch', fetchMock);
    const playback = playClipById('ing.cheese');
    await vi.advanceTimersByTimeAsync(5000);
    await playback;
    expect(instances).toEqual([]);
    const options = vi.mocked(fetch).mock.calls[0][1];
    expect(options?.signal?.aborted).toBe(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ clips: recordings }) })),
    );
    const retry = playClipById('ing.cheese');
    await vi.advanceTimersByTimeAsync(0);
    expect(instances).toHaveLength(1);
    instances[0].onended?.();
    await retry;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back to speech when a recording fails, then clears its safety timer', async () => {
    const { playClipById } = await import('./audio');
    const playback = playClipById('ing.cheese');
    await vi.advanceTimersByTimeAsync(0);
    instances[0].onerror?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(spoken.map((u) => u.text)).toEqual(['cheese']);
    spoken[0].onend?.();
    await playback;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops stalled recordings before falling back, so HELP cannot wait forever', async () => {
    const { playClipById } = await import('./audio');
    const playback = playClipById('ing.cheese');
    await vi.advanceTimersByTimeAsync(10000);
    expect(instances[0].pause).toHaveBeenCalledOnce();
    expect(spoken.map((u) => u.text)).toEqual(['cheese']);
    await vi.runAllTimersAsync();
    await playback;
    expect(speechCancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
