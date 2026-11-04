import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static instances: FakeAudio[] = [];
  static startImmediately = true;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  preload = '';
  currentTime = 0;
  load = vi.fn();
  pause = vi.fn();
  play = vi.fn(async () => {
    if (FakeAudio.startImmediately) this.onplaying?.();
  });
  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }
}

const played = (): FakeAudio[] => FakeAudio.instances.filter((audio) => audio.play.mock.calls.length > 0);

describe('recorded celebrations', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    FakeAudio.instances = [];
    FakeAudio.startImmediately = true;
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('preloads all six monsters and both celebrations once without playing anything', async () => {
    const { preloadCelebrationAudio } = await import('./celebrations');
    preloadCelebrationAudio();
    preloadCelebrationAudio();
    expect(FakeAudio.instances).toHaveLength(8);
    expect(FakeAudio.instances.map((audio) => audio.src)).toContain('/audio/sfx/monster.doubleTrouble.nom.m4a');
    for (const audio of FakeAudio.instances) {
      expect(audio.load).toHaveBeenCalledOnce();
      expect(audio.preload).toBe('auto');
      expect(audio.play).not.toHaveBeenCalled();
    }
  });

  it('plays the requested monster and coordinates one paired-cannon cheer on the same channel', async () => {
    const { createCelebrationPlayer, isCelebrationPlaying } = await import('./celebrations');
    const controller = new AbortController();
    const play = createCelebrationPlayer(controller.signal);
    play('monster.og.nom');
    const munch = played()[0];
    expect(munch.src).toBe('/audio/sfx/monster.og.nom.m4a');
    expect(isCelebrationPlaying()).toBe(true);
    play('celebration.round');
    expect(munch.pause).toHaveBeenCalledOnce();
    expect(played().map((audio) => audio.src)).toEqual([
      '/audio/sfx/monster.og.nom.m4a',
      '/audio/sfx/celebration.round.m4a',
    ]);
    const cheer = played()[1];
    expect(cheer.play).toHaveBeenCalledOnce();
    cheer.onended?.();
    expect(isCelebrationPlaying()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending result beat on pause or exit and never replays it', async () => {
    const { createCelebrationPlayer } = await import('./celebrations');
    const controller = new AbortController();
    const play = createCelebrationPlayer(controller.signal);
    play('monster.gobbler.nom');
    controller.abort();
    await vi.advanceTimersByTimeAsync(1100);
    play('celebration.round');
    expect(played()).toHaveLength(1);
    expect(played()[0].pause).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('mute cancels active and future beats even after sound is turned back on', async () => {
    const { createCelebrationPlayer, setCelebrationSoundOn } = await import('./celebrations');
    const play = createCelebrationPlayer(new AbortController().signal);
    play('monster.sneezer.nom');
    setCelebrationSoundOn(false);
    setCelebrationSoundOn(true);
    play('celebration.round');
    expect(played()).toHaveLength(1);
    expect(played()[0].pause).toHaveBeenCalledOnce();
    const nextResult = createCelebrationPlayer(new AbortController().signal);
    nextResult('celebration.level');
    expect(played()).toHaveLength(2);
    expect(played()[1].src).toBe('/audio/sfx/celebration.level.m4a');
  });

  it('does not revive a result that began muted when sound is enabled mid-result', async () => {
    const { createCelebrationPlayer, setCelebrationSoundOn } = await import('./celebrations');
    setCelebrationSoundOn(false);
    const play = createCelebrationPlayer(new AbortController().signal);
    play('monster.fussy.nom');
    setCelebrationSoundOn(true);
    play('celebration.round');
    expect(played()).toEqual([]);
  });

  it('skips unavailable effects instead of playing them after the cannon animation', async () => {
    const { createCelebrationPlayer, isCelebrationPlaying } = await import('./celebrations');
    FakeAudio.startImmediately = false;
    const play = createCelebrationPlayer(new AbortController().signal);
    play('celebration.round');
    await vi.advanceTimersByTimeAsync(200);
    expect(played()[0].pause).toHaveBeenCalledOnce();
    expect(played()[0].onplaying).toBeNull();
    expect(isCelebrationPlaying()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a valid clip to finish after native startup and device output latency', async () => {
    const { createCelebrationPlayer, isCelebrationPlaying } = await import('./celebrations');
    FakeAudio.startImmediately = false;
    createCelebrationPlayer(new AbortController().signal)('monster.gobbler.nom');
    await vi.advanceTimersByTimeAsync(120);
    played()[0].onplaying?.();
    // WebKit may announce playing before its output device starts rendering.
    await vi.advanceTimersByTimeAsync(1050);
    expect(isCelebrationPlaying()).toBe(true);
    expect(played()[0].pause).not.toHaveBeenCalled();
    played()[0].onended?.();
    expect(isCelebrationPlaying()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['monster.speedy.nom', 850],
    ['celebration.round', 1200],
    ['celebration.level', 1600],
  ] as const)('bounds %s even if the media never ends', async (cue, duration) => {
    const { createCelebrationPlayer, isCelebrationPlaying } = await import('./celebrations');
    createCelebrationPlayer(new AbortController().signal)(cue);
    await vi.advanceTimersByTimeAsync(duration + 349);
    expect(isCelebrationPlaying()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(isCelebrationPlaying()).toBe(false);
    expect(played()[0].pause).toHaveBeenCalledOnce();
  });

  it('does not stop celebrations when a Dad voice sequence is cancelled', async () => {
    const { createCelebrationPlayer, isCelebrationPlaying } = await import('./celebrations');
    const { stopVoice } = await import('./audio');
    createCelebrationPlayer(new AbortController().signal)('celebration.level');
    stopVoice();
    expect(isCelebrationPlaying()).toBe(true);
    expect(played()[0].pause).not.toHaveBeenCalled();
  });

  it('stops a failed media request without substituting electronic or spoken effects', async () => {
    const { createCelebrationPlayer, isCelebrationPlaying } = await import('./celebrations');
    createCelebrationPlayer(new AbortController().signal)('celebration.level');
    played()[0].onerror?.();
    expect(isCelebrationPlaying()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(played()).toHaveLength(1);
  });
});
