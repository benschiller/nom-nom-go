import { MONSTERS } from '../content/content';

/** One game-clock beat shared by the round cheer and its cannon animation. */
export const ROUND_CELEBRATION_DELAY_MS = 1100;
export type CelebrationCue = `monster.${string}.nom` | 'celebration.round' | 'celebration.level';

const durations = new Map<CelebrationCue, number>([
  ...MONSTERS.map((monster): [CelebrationCue, number] => [`monster.${monster.id}.nom`, 850]),
  ['celebration.round', 1200],
  ['celebration.level', 1600],
]);
const recordings = new Map<CelebrationCue, HTMLAudioElement>();
const activeStops = new Set<() => void>();
let soundOn = true;
let generation = 0;

export function stopCelebrations(): void {
  generation++;
  for (const stop of [...activeStops]) stop();
}

export function setCelebrationSoundOn(on: boolean): void {
  soundOn = on;
  if (!on) stopCelebrations();
}

/** Load the small effects before serving, without playing or priming any sound. */
export function preloadCelebrationAudio(): void {
  for (const cue of durations.keys()) {
    if (recordings.has(cue)) continue;
    const audio = new Audio(`/audio/sfx/${cue}.m4a`);
    audio.preload = 'auto';
    recordings.set(cue, audio);
    audio.load();
  }
}

export const isCelebrationPlaying = (): boolean => activeStops.size > 0;

function playCelebrationCue(cue: CelebrationCue, signal: AbortSignal): void {
  if (!soundOn || signal.aborted || !durations.has(cue)) return;
  preloadCelebrationAudio();
  const audio = recordings.get(cue)!;
  // A late load or malformed long asset must never overlap the next beat.
  for (const stop of [...activeStops]) stop();
  let settled = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    if (settled) return;
    settled = true;
    clearTimeout(startTimer);
    clearTimeout(endTimer);
    activeStops.delete(stop);
    signal.removeEventListener('abort', stop);
    audio.onended = audio.onerror = audio.onplaying = null;
    audio.pause();
  };
  activeStops.add(stop);
  signal.addEventListener('abort', stop, { once: true });
  audio.onended = audio.onerror = stop;
  audio.onplaying = () => {
    clearTimeout(startTimer);
    // WebKit can spend part of the beat starting its media pipeline even
    // for a preloaded file. Bound playback from its actual start, allowing
    // time for device output latency and the native ended event. The next
    // beat still stops this channel before starting another effect.
    endTimer ??= setTimeout(stop, durations.get(cue)! + 350);
  };
  // Skip an unavailable effect instead of sounding it after its animation.
  const startTimer = setTimeout(stop, 200);
  try {
    audio.currentTime = 0;
    void audio.play().catch(stop);
  } catch {
    stop();
  }
}

/** A result owns one player. Mute/pause/exit invalidates its future beats too. */
export function createCelebrationPlayer(signal: AbortSignal): (cue: CelebrationCue) => void {
  const startedGeneration = generation;
  const enabled = soundOn;
  return (cue) => {
    if (enabled && startedGeneration === generation && !signal.aborted) playCelebrationCue(cue, signal);
  };
}
