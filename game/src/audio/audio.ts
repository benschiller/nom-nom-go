/** Web Audio SFX, gibberish, and Dad clip playback with speech stand-in. */

let ctx: AudioContext | null = null;
let soundOn = true;
export const setSoundOn = (on: boolean): void => {
  soundOn = on;
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
  | 'sputter';
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
export async function loadClips(): Promise<Clip[]> {
  if (clipsCache) return clipsCache;
  try {
    const res = await fetch('/audio/clips.json');
    const data = (await res.json()) as { clips: Clip[] };
    clipsCache = data.clips;
  } catch {
    clipsCache = [];
  }
  return clipsCache;
}

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!soundOn) {
      resolve();
      return;
    }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      // Safety timeout so a stuck utterance never blocks the game.
      setTimeout(resolve, Math.max(800, text.length * 110));
    } catch {
      resolve();
    }
  });
}

async function playClip(id: string): Promise<void> {
  const clips = await loadClips();
  const clip = clips.find((c) => c.id === id);
  if (!clip) return;
  if (clip.file) {
    try {
      await new Promise<void>((resolve, reject) => {
        const a = new Audio(`/audio/clips/${clip.file}`);
        a.onended = () => resolve();
        a.onerror = () => reject(new Error('clip failed'));
        void a.play().catch(reject);
      });
      return;
    } catch {
      /* fall through to speech stand-in */
    }
  }
  await speak(clip.text);
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

/** Clip ids to speak when ticket[index] first appears at the kiosk. */
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

export async function playCallout(ticket: readonly string[]): Promise<void> {
  if (!soundOn) return;
  const ids = calloutClipIds(ticket);
  for (let i = 0; i < ids.length; i++) {
    await playClip(ids[i]);
    if (i < ids.length - 1) await wait(40);
  }
}

/** Speak one kiosk item as it pops up, so seeing and hearing happen together. */
export async function playKioskItem(ticket: readonly string[], index: number): Promise<void> {
  if (!soundOn) return;
  for (const id of itemClipIds(ticket, index)) {
    await playClip(id);
    await wait(40);
  }
}

export async function playClipById(id: string): Promise<void> {
  await playClip(id);
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
