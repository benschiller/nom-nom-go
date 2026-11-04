/** Web Audio SFX, gibberish, and Dad clip playback with speech stand-in. */

let ctx: AudioContext | null = null;
let soundOn = true;
let voiceGeneration = 0;
const activeVoiceStops = new Set<() => void>();

/** Stop active speech and invalidate the remaining clips in its call-out. */
export function stopVoice(): void {
  voiceGeneration++;
  for (const stop of [...activeVoiceStops]) stop();
}

export const setSoundOn = (on: boolean): void => {
  soundOn = on;
  if (!on) stopVoice();
};

export function unlockAudio(): void {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state !== 'running') void ctx.resume();
  // Prime speechSynthesis inside the user gesture (iOS).
  try {
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}

export function ensureAudioOnVisible(): void {
  if (ctx && ctx.state !== 'running') {
    void ctx.close().catch(() => undefined);
    ctx = new AudioContext();
  }
}

function tone(freq: number, ms: number, type: OscillatorType = 'sine', gain = 0.08, when = 0): void {
  if (!ctx || !soundOn) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000);
}

export type Sfx =
  | 'nom'
  | 'ding'
  | 'print'
  | 'tap'
  | 'pop'
  | 'sizzle'
  | 'bell'
  | 'oops'
  | 'gobble'
  | 'confetti'
  | 'static'
  | 'snow'
  | 'sputter'
  | 'tinkle';
export function playSfx(name: Sfx): void {
  if (!ctx || !soundOn) return;
  switch (name) {
    case 'ding':
      tone(880, 200);
      tone(1320, 300, 'sine', 0.06, 0.08);
      break;
    case 'bell':
      tone(1046, 350, 'triangle', 0.1);
      tone(1568, 400, 'triangle', 0.05, 0.05);
      break;
    case 'tap':
      tone(500, 60, 'square', 0.04);
      break;
    case 'pop':
      tone(700, 90, 'sine', 0.09);
      tone(950, 80, 'sine', 0.07, 0.05);
      break;
    case 'oops':
      tone(300, 150, 'sine', 0.06);
      tone(240, 200, 'sine', 0.06, 0.12);
      break;
    case 'nom':
      // Distinctive two-syllable "Nom Nom" for a correct serve.
      tone(220, 110, 'sawtooth', 0.06);
      tone(170, 110, 'sawtooth', 0.06, 0.13);
      tone(220, 110, 'sawtooth', 0.06, 0.3);
      tone(170, 140, 'sawtooth', 0.06, 0.43);
      break;
    case 'gobble':
      tone(180, 100, 'sawtooth', 0.05);
      tone(150, 100, 'sawtooth', 0.05, 0.1);
      tone(190, 120, 'sawtooth', 0.05, 0.2);
      break;
    case 'confetti':
      [660, 780, 990, 1180].forEach((f, i) => tone(f, 120, 'triangle', 0.06, i * 0.06));
      break;
    case 'print':
      [0, 1, 2, 3].forEach((i) => tone(1200, 40, 'square', 0.02, i * 0.07));
      break;
    case 'sizzle':
      tone(3000, 250, 'sawtooth', 0.015);
      break;
    case 'static':
    case 'snow':
      tone(4000, 200, 'sawtooth', 0.02);
      tone(2500, 200, 'sawtooth', 0.015, 0.05);
      break;
    case 'tinkle':
      // A small, bright bell shimmer (tutorial bell button).
      [2093, 2637, 3136, 2637, 3136].forEach((f, i) => tone(f, 280, 'sine', 0.035, i * 0.07));
      break;
    case 'sputter':
      tone(140, 80, 'square', 0.05);
      tone(110, 120, 'square', 0.05, 0.1);
      break;
  }
}

export function playGibberish(pitch: number): void {
  if (!ctx || !soundOn) return;
  const syllables = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < syllables; i++) {
    tone(300 * pitch * (0.9 + Math.random() * 0.4), 110, 'triangle', 0.07, i * 0.13);
  }
}

export interface Clip {
  id: string;
  text: string;
  category: string;
  file?: string;
}
let clipsCache: Clip[] | null = null;
let clipsLoading: Promise<Clip[]> | null = null;
export async function loadClips(): Promise<Clip[]> {
  if (clipsCache) return clipsCache;
  if (!clipsLoading) {
    clipsLoading = (async () => {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const request = (async () => {
          const res = await fetch('/audio/clips.json', { signal: controller.signal });
          if (!res.ok) throw new Error('clip manifest failed');
          const data = (await res.json()) as { clips: Clip[] };
          if (!Array.isArray(data.clips)) throw new Error('invalid clip manifest');
          return data.clips;
        })();
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error('clip manifest timed out'));
          }, 5000);
        });
        // Bound the response body too; stalled manifest loading must not
        // hold the ordering gate or HELP forever.
        const clips = await Promise.race([request, timeout]);
        clipsCache = clips;
        return clips;
      } catch {
        // Retry on the next request after a transient network failure.
        return [];
      } finally {
        clearTimeout(timer);
        clipsLoading = null;
      }
    })();
  }
  return clipsLoading;
}

function loadVoiceClips(signal?: AbortSignal): Promise<Clip[]> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve([]);
      return;
    }
    const finish = (clips: Clip[]): void => {
      activeVoiceStops.delete(stop);
      signal?.removeEventListener('abort', stop);
      resolve(clips);
    };
    const stop = (): void => finish([]);
    activeVoiceStops.add(stop);
    signal?.addEventListener('abort', stop, { once: true });
    // A caller can leave immediately without aborting another caller's
    // shared manifest request.
    void loadClips().then(finish);
  });
}

const voiceIsActive = (generation: number, signal?: AbortSignal): boolean =>
  soundOn && generation === voiceGeneration && !signal?.aborted;

function speak(text: string, generation: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (!voiceIsActive(generation, signal)) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let utterance: SpeechSynthesisUtterance | undefined;
    const finish = (): void => {
      clearTimeout(timer);
      activeVoiceStops.delete(stop);
      signal?.removeEventListener('abort', stop);
      if (utterance) utterance.onend = utterance.onerror = null;
      resolve();
    };
    const stop = (): void => {
      finish();
      window.speechSynthesis?.cancel();
    };
    try {
      utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.onend = finish;
      utterance.onerror = finish;
      activeVoiceStops.add(stop);
      signal?.addEventListener('abort', stop, { once: true });
      // A stuck fallback must neither block the game nor overlap the next cue.
      timer = setTimeout(stop, Math.max(1500, text.length * 150));
      window.speechSynthesis.speak(utterance);
    } catch {
      finish();
    }
  });
}

function playRecording(file: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio(`/audio/clips/${file}`);
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeVoiceStops.delete(stop);
      signal?.removeEventListener('abort', stop);
      audio.onended = audio.onerror = null;
      audio.pause();
      if (error) reject(error);
      else resolve();
    };
    const stop = (): void => finish();
    activeVoiceStops.add(stop);
    signal?.addEventListener('abort', stop, { once: true });
    audio.onended = () => finish();
    audio.onerror = () => finish(new Error('clip failed'));
    // Current recordings are short, but allow slow loads without leaving HELP stuck.
    const timer = setTimeout(() => finish(new Error('clip timed out')), 10000);
    void audio.play().catch(() => finish(new Error('clip failed')));
  });
}

async function playClip(id: string, generation: number, signal?: AbortSignal): Promise<void> {
  if (!voiceIsActive(generation, signal)) return;
  const clips = await loadVoiceClips(signal);
  if (!voiceIsActive(generation, signal)) return;
  const clip = clips.find((c) => c.id === id);
  if (!clip) return;
  if (clip.file) {
    try {
      await playRecording(clip.file, signal);
      return;
    } catch {
      /* fall through to speech stand-in */
    }
  }
  await speak(clip.text, generation, signal);
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Run {
  id: string;
  count: number;
  start: number;
}
const runsOf = (ticket: readonly string[]): Run[] => {
  const runs: Run[] = [];
  ticket.forEach((id, i) => {
    const last = runs[runs.length - 1];
    if (last && last.id === id) last.count++;
    else runs.push({ id, count: 1, start: i });
  });
  return runs;
};

/** Clip ids for a whole call-out. A doubled item is named once: "double pickles". */
export function calloutClipIds(ticket: readonly string[]): string[] {
  const runs = runsOf(ticket);
  const ids = ['phrase.order_up'];
  runs.forEach((run, r) => {
    if (r > 0 && r === runs.length - 1) ids.push('phrase.and');
    if (run.count >= 2) ids.push('amount.double');
    ids.push(`ing.${run.id}`);
  });
  return ids;
}

/** Clip ids to speak when ticket[index] first appears at the window. */
export function itemClipIds(ticket: readonly string[], index: number): string[] {
  const runs = runsOf(ticket);
  const run = runs.find((r) => r.start === index);
  if (!run) return [];
  const ids: string[] = [];
  if (index === 0) ids.push('phrase.order_up');
  if (runs.indexOf(run) > 0 && runs.indexOf(run) === runs.length - 1) ids.push('phrase.and');
  if (run.count >= 2) ids.push('amount.double');
  ids.push(`ing.${run.id}`);
  return ids;
}

async function playSequence(ids: readonly string[], signal?: AbortSignal): Promise<void> {
  const generation = voiceGeneration;
  for (let i = 0; i < ids.length; i++) {
    if (!voiceIsActive(generation, signal)) return;
    await playClip(ids[i], generation, signal);
    if (i < ids.length - 1) await wait(40);
  }
}

export async function playCallout(ticket: readonly string[], signal?: AbortSignal): Promise<void> {
  await playSequence(calloutClipIds(ticket), signal);
}

/** Speak one window item as it joins the sill row, so seeing and hearing happen together. */
export async function playKioskItem(ticket: readonly string[], index: number, signal?: AbortSignal): Promise<void> {
  await playSequence(itemClipIds(ticket, index), signal);
}

export async function playClipById(id: string, signal?: AbortSignal): Promise<void> {
  await playSequence([id], signal);
}

let bgTimer: number | null = null;
export function startBackgroundLoop(getTempo: () => number): void {
  if (bgTimer !== null) return;
  const notes = [262, 330, 392, 330];
  let i = 0;
  const loop = (): void => {
    if (soundOn && ctx) tone(notes[i % notes.length], 180, 'triangle', 0.02);
    i++;
    bgTimer = window.setTimeout(loop, getTempo());
  };
  loop();
}
