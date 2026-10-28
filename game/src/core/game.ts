import { classifyMismatch, firstMismatchIndex, type Mistake } from './compare';
import { generateTryOrders, type Order } from './orders';
import { clampPace, kioskIntervalMs, patienceMs } from './pace';
import { makeRng } from './rng';

export type Phase =
  | 'title'
  | 'levelIntro'
  | 'kiosk'
  | 'printing'
  | 'callout'
  | 'cooking'
  | 'serveResult'
  | 'levelResult'
  | 'bossEnding'
  | 'closed'
  | 'poweredOff';

export interface ServeResult {
  kind: 'correct' | 'wrong' | 'timeout';
  mistake: Mistake | null;
  fast: boolean;
  highlight: { side: 'built' | 'expected'; index: number } | null;
}

export interface TelemetryEntry {
  level: number;
  dish: string;
  monster: string;
  paceStep: number;
  msToFirstTap: number | null;
  msToFinish: number | null;
  correct: boolean;
  mistake: Mistake | null;
  broken: string | null;
  hintsUsed: number;
}

export interface GameState {
  phase: Phase;
  paused: boolean;
  seed: number;
  rngState: number;
  level: number;
  savedLevel: number;
  warmup: boolean;
  paceStep: number;
  orders: Order[];
  orderIndex: number;
  built: string[];
  phaseMs: number;
  kioskShown: number;
  printDone: boolean;
  calloutDone: boolean;
  patienceTotalMs: number;
  patienceLeftMs: number;
  cookingMs: number;
  idleMs: number;
  hintsUsed: number;
  firstTapMs: number | null;
  starsTry: number;
  correctRun: number;
  fastRun: number;
  streak: boolean;
  result: ServeResult | null;
  failedTries: Record<number, number>;
  assist: boolean;
  droppedThisSession: boolean;
  sawtoothAppliedFor: number[];
  bossBeaten: boolean;
  starsByLevel: Record<number, number>;
  tutorialsSeen: string[];
  gagSeen: string[];
  tutorial: string | null;
  telemetry: TelemetryEntry[];
  power: 'on' | 'off';
  pendingEvents: string[];
  tryCount: number;
}

export type GameEvent =
  | { type: 'go' }
  | { type: 'tick'; ms: number }
  | { type: 'calloutFinished' }
  | { type: 'addItem'; item: string }
  | { type: 'undo' }
  | { type: 'trash' }
  | { type: 'serve' }
  | { type: 'continue' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'powerOff' }
  | { type: 'powerOn' }
  | { type: 'tutorialDone' };

export interface StartOptions {
  seed?: number;
  savedLevel?: number;
  paceStep?: number;
  bossBeaten?: boolean;
  starsByLevel?: Record<number, number>;
  tutorialsSeen?: string[];
  gagSeen?: string[];
  power?: 'on' | 'off';
  telemetry?: TelemetryEntry[];
}

export function initialState(opts: StartOptions = {}): GameState {
  const savedLevel = Math.min(6, Math.max(1, opts.savedLevel ?? 1));
  const boss = opts.bossBeaten ?? false;
  const power = opts.power ?? 'on';
  return {
    phase: power === 'off' ? 'poweredOff' : boss ? 'closed' : 'title',
    paused: false,
    seed: opts.seed ?? 1234,
    rngState: opts.seed ?? 1234,
    level: savedLevel,
    savedLevel,
    warmup: false,
    paceStep: clampPace(opts.paceStep ?? 0),
    orders: [],
    orderIndex: 0,
    built: [],
    phaseMs: 0,
    kioskShown: 0,
    printDone: false,
    calloutDone: false,
    patienceTotalMs: 0,
    patienceLeftMs: 0,
    cookingMs: 0,
    idleMs: 0,
    hintsUsed: 0,
    firstTapMs: null,
    starsTry: 0,
    correctRun: 0,
    fastRun: 0,
    streak: false,
    result: null,
    failedTries: {},
    assist: false,
    droppedThisSession: false,
    sawtoothAppliedFor: [],
    bossBeaten: boss,
    starsByLevel: opts.starsByLevel ?? {},
    tutorialsSeen: opts.tutorialsSeen ?? [],
    gagSeen: opts.gagSeen ?? [],
    tutorial: null,
    telemetry: opts.telemetry ?? [],
    power,
    pendingEvents: [],
    tryCount: 0,
  };
}

const orderOf = (s: GameState): Order | null => s.orders[s.orderIndex] ?? null;

function startTry(s: GameState, level: number): GameState {
  const seed = (s.seed * 1103515245 + level * 977 + s.tryCount * 131) >>> 0;
  const { orders, rngState } = generateTryOrders(level, seed);
  let pace = s.paceStep;
  if (!s.sawtoothAppliedFor.includes(level)) {
    pace = clampPace(pace - 2);
  }
  const failed = s.failedTries[level] ?? 0;
  const first = orders[0];
  return {
    ...s,
    level,
    paceStep: pace,
    orders,
    rngState,
    orderIndex: 0,
    tryCount: s.tryCount + 1,
    starsTry: 0,
    assist: failed >= 2,
    sawtoothAppliedFor: [...new Set([...s.sawtoothAppliedFor, level])],
    phase: 'kiosk',
    phaseMs: 0,
    kioskShown: 0,
    built: [...first.prebuilt],
    printDone: false,
    calloutDone: false,
    result: null,
    tutorial: tutorialFor(s, level, first),
  };
}

function tutorialFor(s: GameState, level: number, order: Order): string | null {
  const seen = new Set(s.tutorialsSeen);
  if (s.orders.length === 0 && level === 1 && !seen.has('firstOrder')) return 'firstOrder';
  if (level === 2 && !seen.has('baseShelf')) return 'baseShelf';
  if (level === 3 && !seen.has('doubles')) return 'doubles';
  if (level === 4 && !seen.has('lookalikes')) return 'lookalikes';
  if (level === 6 && !seen.has('boss')) return 'boss';
  if (order.broken && !s.gagSeen.includes(order.broken)) return `gag:${order.broken}`;
  return null;
}

function beginCooking(s: GameState): GameState {
  const order = orderOf(s);
  if (!order) return s;
  const total = patienceMs(order.ticket.length, s.paceStep, s.assist);
  return {
    ...s,
    phase: 'cooking',
    phaseMs: 0,
    patienceTotalMs: total,
    patienceLeftMs: total,
    cookingMs: 0,
    idleMs: 0,
    hintsUsed: 0,
    firstTapMs: null,
  };
}

function finishOrder(s: GameState, result: ServeResult): GameState {
  const order = orderOf(s);
  if (!order) return s;
  const correct = result.kind === 'correct';
  let { paceStep, correctRun, fastRun, streak } = s;
  correctRun = correct ? correctRun + 1 : 0;
  if (correctRun >= 3) {
    paceStep = clampPace(paceStep + 1);
    correctRun = 0;
  }
  if (!correct) paceStep = clampPace(paceStep - 1);
  if (correct && result.fast) {
    fastRun += 1;
    if (fastRun >= 3) streak = true;
  } else {
    fastRun = 0;
    streak = false;
  }
  const events = [...s.pendingEvents];
  if (correct) events.push(result.fast ? 'fastServed' : 'served');
  else events.push(result.kind === 'timeout' ? 'timeout' : 'oops');
  if (streak && correct && result.fast && fastRun === 3) events.push('streakStart');
  const entry: TelemetryEntry = {
    level: s.level,
    dish: order.dish,
    monster: order.monster,
    paceStep: s.paceStep,
    msToFirstTap: s.firstTapMs,
    msToFinish: s.cookingMs || null,
    correct,
    mistake: result.mistake,
    broken: order.broken,
    hintsUsed: s.hintsUsed,
  };
  return {
    ...s,
    result,
    paceStep,
    correctRun,
    fastRun,
    streak,
    starsTry: s.starsTry + (correct ? 1 : 0),
    phase: 'serveResult',
    phaseMs: 0,
    pendingEvents: events,
    telemetry: [...s.telemetry, entry].slice(-200),
  };
}

function advanceAfterResult(s: GameState): GameState {
  const cleared = { ...s, result: null, pendingEvents: [] as string[] };
  if (s.orderIndex < 2) {
    const next = s.orders[s.orderIndex + 1];
    return {
      ...cleared,
      orderIndex: s.orderIndex + 1,
      phase: 'kiosk',
      phaseMs: 0,
      kioskShown: 0,
      built: [...next.prebuilt],
      printDone: false,
      calloutDone: false,
      tutorial: tutorialFor(s, s.level, next),
    };
  }
  // Level result
  const stars = s.starsTry;
  const best = Math.max(s.starsByLevel[s.level] ?? 0, stars);
  const withStars = {
    ...cleared,
    starsByLevel: { ...s.starsByLevel, [s.level]: best },
    phase: 'levelResult' as Phase,
    phaseMs: 0,
  };
  if (stars === 3) {
    withStars.pendingEvents = [...withStars.pendingEvents, 'levelUp'];
    if (s.level >= 6) {
      return {
        ...withStars,
        bossBeaten: true,
        phase: 'bossEnding',
        pendingEvents: [...withStars.pendingEvents, 'bossWin'],
      };
    }
  }
  return withStars;
}

function continueFromLevelResult(s: GameState): GameState {
  if (s.bossBeaten && s.level >= 6 && s.starsTry === 3) return { ...s, phase: 'closed', phaseMs: 0 };
  if (s.starsTry === 3) {
    const nextLevel = s.warmup && s.level < s.savedLevel ? s.savedLevel : s.level + 1;
    const wasWarmup = s.warmup;
    return startTry(
      { ...s, savedLevel: Math.max(s.savedLevel, wasWarmup ? s.savedLevel : nextLevel), warmup: false },
      nextLevel,
    );
  }
  // Failed try: easing off.
  const failed = { ...s.failedTries, [s.level]: (s.failedTries[s.level] ?? 0) + 1 };
  const failedCount = failed[s.level];
  if (failedCount >= 3 && s.assist && !s.droppedThisSession && s.level > 1) {
    return startTry({ ...s, failedTries: failed, droppedThisSession: true }, s.level - 1);
  }
  return startTry({ ...s, failedTries: failed, assist: failedCount >= 2 }, s.level);
}

export function step(prev: GameState, event: GameEvent): GameState {
  if (prev.paused && event.type !== 'resume' && event.type !== 'tick') return prev;
  switch (event.type) {
    case 'pause':
      return { ...prev, paused: true };
    case 'resume':
      return { ...prev, paused: false };
    case 'go': {
      if (prev.phase !== 'title') return prev;
      const startLevel = Math.max(1, prev.savedLevel - (prev.savedLevel > 1 ? 1 : 0));
      const warmup = prev.savedLevel > 1;
      const rng = makeRng(prev.seed);
      void rng;
      return {
        ...startTry({ ...prev, warmup }, warmup ? startLevel : prev.savedLevel),
        phase: 'levelIntro',
        phaseMs: 0,
      };
    }
    case 'continue': {
      if (prev.phase === 'levelResult') return continueFromLevelResult(prev);
      if (prev.phase === 'levelIntro') {
        // startTry already set phase kiosk; levelIntro is a wrapper: go straight to kiosk of current orders.
        return { ...prev, phase: 'kiosk', phaseMs: 0 };
      }
      return prev;
    }
    case 'tutorialDone': {
      const t = prev.tutorial;
      if (!t) return prev;
      const gag = t.startsWith('gag:') ? t.slice(4) : null;
      return {
        ...prev,
        tutorial: null,
        tutorialsSeen: gag ? prev.tutorialsSeen : [...new Set([...prev.tutorialsSeen, t])],
        gagSeen: gag ? [...new Set([...prev.gagSeen, gag])] : prev.gagSeen,
      };
    }
    case 'calloutFinished': {
      const s = { ...prev, calloutDone: true };
      if (s.phase === 'callout' && (s.printDone || orderOf(s)?.broken === 'speaker'))
        return beginCooking({ ...s, printDone: true });
      if (s.phase === 'printing' && s.printDone) return beginCooking(s);
      return s;
    }
    case 'addItem': {
      if (prev.phase !== 'cooking') return prev;
      return { ...prev, built: [...prev.built, event.item], idleMs: 0, firstTapMs: prev.firstTapMs ?? prev.cookingMs };
    }
    case 'undo': {
      if (prev.phase !== 'cooking') return prev;
      const order = orderOf(prev);
      const floor = order ? order.prebuilt.length : 0;
      if (prev.built.length <= floor) return prev;
      return { ...prev, built: prev.built.slice(0, -1), idleMs: 0 };
    }
    case 'trash': {
      if (prev.phase !== 'cooking') return prev;
      const order = orderOf(prev);
      return { ...prev, built: order ? [...order.prebuilt] : [], idleMs: 0 };
    }
    case 'serve': {
      if (prev.phase !== 'cooking') return prev;
      const order = orderOf(prev);
      if (!order) return prev;
      const mistake = classifyMismatch(prev.built, order.expected);
      const correct = mistake === null;
      const fast = correct && prev.patienceLeftMs >= prev.patienceTotalMs / 2;
      return finishOrder(prev, {
        kind: correct ? 'correct' : 'wrong',
        mistake,
        fast,
        highlight: firstMismatchIndex(prev.built, order.expected),
      });
    }
    case 'powerOff':
      return prev.phase === 'closed' ? { ...prev, phase: 'poweredOff', power: 'off' } : prev;
    case 'powerOn': {
      if (prev.phase !== 'poweredOff') return prev;
      const fresh = initialState({ seed: prev.seed, power: 'on' });
      return { ...fresh, tutorialsSeen: [], gagSeen: [], starsByLevel: {}, telemetry: [] };
    }
    case 'tick': {
      if (prev.paused) return prev;
      const ms = event.ms;
      const s: GameState = { ...prev, phaseMs: prev.phaseMs + ms };
      switch (s.phase) {
        case 'levelIntro':
          return s.phaseMs >= 1600 ? { ...s, phase: 'kiosk', phaseMs: 0 } : s;
        case 'kiosk': {
          const order = orderOf(s);
          if (!order) return s;
          const shown = Math.min(
            order.ticket.length,
            Math.floor(s.phaseMs / Math.max(1, kioskSpeed(s))) + (s.phaseMs > 0 ? 1 : 0),
          );
          const totalMs = order.ticket.length * kioskSpeed(s) + 700;
          if (s.phaseMs >= totalMs)
            return { ...s, phase: 'printing', phaseMs: 0, kioskShown: order.ticket.length, printDone: false };
          return { ...s, kioskShown: shown };
        }
        case 'printing': {
          if (s.phaseMs >= 600) {
            const done = { ...s, printDone: true };
            const order = orderOf(done);
            if (order?.broken === 'speaker') return { ...done, phase: 'callout', phaseMs: 0, calloutDone: true };
            return { ...done, phase: 'callout', phaseMs: 0 };
          }
          return s;
        }
        case 'callout': {
          // Cooking begins via calloutFinished event from the audio layer.
          // Safety: if no audio layer (tests), UI dispatches calloutFinished.
          return s;
        }
        case 'cooking': {
          const cookingMs = s.cookingMs + ms;
          const idleMs = s.idleMs + ms;
          const frozen = idleMs >= 10000;
          const hintsUsed = s.hintsUsed + (idleMs >= 4000 && s.hintsUsed === 0 ? 1 : 0);
          const left = frozen ? s.patienceLeftMs : s.patienceLeftMs - ms;
          if (left <= 0) {
            return finishOrder(
              { ...s, cookingMs, idleMs, hintsUsed, patienceLeftMs: 0 },
              { kind: 'timeout', mistake: 'timeout', fast: false, highlight: null },
            );
          }
          return { ...s, cookingMs, idleMs, hintsUsed, patienceLeftMs: left };
        }
        case 'serveResult': {
          const hold = s.result?.kind === 'correct' ? 2500 : s.result?.kind === 'wrong' ? 1800 : 1200;
          return s.phaseMs >= hold ? advanceAfterResult(s) : s;
        }
        case 'bossEnding':
          return s.phaseMs >= 3000 ? { ...s, phase: 'closed', phaseMs: 0 } : s;
        default:
          return s;
      }
    }
  }
}

// Kiosk speed may be scaled by UI test mode via a multiplier stored outside core:
// core uses real pace interval; UI test mode dispatches larger tick steps instead.
function kioskSpeed(s: GameState): number {
  return kioskIntervalMs(s.paceStep);
}

export { orderOf as currentOrder };
export const serialize = (s: GameState): string => JSON.stringify({ v: 1, state: s });
export function deserialize(json: string): GameState {
  const parsed = JSON.parse(json) as { v: number; state: GameState };
  if (parsed.v !== 1) throw new Error('Unsupported core state version');
  return { ...initialState(), ...parsed.state };
}
