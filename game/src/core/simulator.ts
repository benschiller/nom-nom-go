import { bankedTarget } from './difficulty';
import { initialState, step, type GameState } from './game';
import { makeRng, nextFloat } from './rng';

export interface Persona {
  name: string;
  firstTapMs: number;
  tapBaseMs: number;
  tapPerTrayItemMs: number;
  decisionMs: number;
  /** First-serve mistake probability at Level 1, growing slightly per level. */
  mistakeRate: number;
  retrySuccess: number;
  /** Talking/celebrating with Dad between attempts (session time, not task time). */
  pausePerOrderMs: number;
}

export const PERSONAS: Record<'struggling' | 'typical' | 'strong', Persona> = {
  struggling: {
    name: 'struggling',
    firstTapMs: 3000,
    tapBaseMs: 1700,
    tapPerTrayItemMs: 300,
    decisionMs: 900,
    mistakeRate: 0.42,
    retrySuccess: 0.8,
    pausePerOrderMs: 9000,
  },
  typical: {
    name: 'typical',
    firstTapMs: 2100,
    tapBaseMs: 1200,
    tapPerTrayItemMs: 210,
    decisionMs: 650,
    mistakeRate: 0.26,
    retrySuccess: 0.85,
    pausePerOrderMs: 6000,
  },
  strong: {
    name: 'strong',
    firstTapMs: 1400,
    tapBaseMs: 850,
    tapPerTrayItemMs: 130,
    decisionMs: 400,
    mistakeRate: 0.12,
    retrySuccess: 0.92,
    pausePerOrderMs: 3500,
  },
};

export interface RunResult {
  persona: string;
  seed: number;
  totalMs: number;
  attempts: number;
  correct: number;
  firstServeCorrect: number;
  perLevelMs: Record<number, number>;
  completed: boolean;
}

const CALLOUT_BASE_MS = 600;
const CALLOUT_PER_ITEM_MS = 900;
const LEVEL_RESULT_PAUSE_MS = 4000;

/** Drive the real reducer with a persona bot and estimate wall-clock time. */
export function simulateRun(persona: Persona, seed: number): RunResult {
  const rng = makeRng(seed * 7919 + 17);
  let s: GameState = initialState({ seed, savedLevel: 1 });
  let totalMs = 0;
  let attempts = 0;
  let correct = 0;
  let firstServeCorrect = 0;
  const perLevelMs: Record<number, number> = {};
  const add = (ms: number): void => {
    totalMs += ms;
    perLevelMs[s.level] = (perLevelMs[s.level] ?? 0) + ms;
  };
  const tick = (ms: number): void => {
    add(ms);
    s = step(s, { type: 'tick', ms });
  };

  s = step(s, { type: 'go' });
  let guard = 0;
  while (!s.bossBeaten && guard++ < 4000) {
    if (s.phase === 'levelIntro') {
      tick(1600);
    } else if (s.phase === 'kiosk' || s.phase === 'printing') {
      tick(200);
    } else if (s.phase === 'callout') {
      const items = s.orders[s.orderIndex]?.ticket.length ?? 0;
      add(CALLOUT_BASE_MS + items * CALLOUT_PER_ITEM_MS);
      s = step(s, { type: 'calloutFinished' });
    } else if (s.phase === 'cooking') {
      const order = s.orders[s.orderIndex];
      if (!order) break;
      attempts += 1;
      add(persona.pausePerOrderMs);
      const levelAtAttempt = s.level;
      const perTap = persona.tapBaseMs + order.tray.length * persona.tapPerTrayItemMs + persona.decisionMs;
      const cookingEst = persona.firstTapMs + order.ticket.length * perTap;
      const mistakeP = Math.min(0.65, persona.mistakeRate * (1 + 0.07 * (levelAtAttempt - 1)));
      const isRetry = s.attemptsThisOrder > 0;
      const succeed = isRetry ? nextFloat(rng) < persona.retrySuccess : nextFloat(rng) >= mistakeP;
      if (cookingEst >= s.patienceTotalMs && !succeed) {
        // Persona is too slow this time: run the clock out.
        tick(s.patienceTotalMs + 100);
      } else if (succeed) {
        tick(Math.min(cookingEst, Math.max(0, s.patienceTotalMs - 500)));
        for (const item of order.ticket) s = step(s, { type: 'addItem', item });
        s = step(s, { type: 'serve' });
        if (s.result?.kind === 'correct') {
          correct += 1;
          if (!isRetry) firstServeCorrect += 1;
        }
      } else {
        tick(persona.firstTapMs);
        s = step(s, { type: 'serve' });
      }
      void levelAtAttempt;
    } else if (s.phase === 'serveResult') {
      tick(2600);
    } else if (s.phase === 'levelResult') {
      add(LEVEL_RESULT_PAUSE_MS);
      s = step(s, { type: 'continue' });
    } else if (s.phase === 'bossEnding') {
      tick(3000);
    } else {
      break;
    }
  }
  return {
    persona: persona.name,
    seed,
    totalMs,
    attempts,
    correct,
    firstServeCorrect,
    perLevelMs,
    completed: s.bossBeaten || correct >= [1, 2, 3, 4, 5, 6].reduce((a, l) => a + bankedTarget(l), 0),
  };
}

export function simulateMedian(persona: Persona, seeds: number[]): RunResult & { medianMs: number } {
  const runs = seeds.map((seed) => simulateRun(persona, seed));
  const sorted = [...runs].sort((a, b) => a.totalMs - b.totalMs);
  const median = sorted[Math.floor(sorted.length / 2)];
  return { ...median, medianMs: median.totalMs };
}
