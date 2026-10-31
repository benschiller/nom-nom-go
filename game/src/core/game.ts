import { classifyMismatch, firstMismatchIndex, type Mistake } from './compare';
import {
  MAX_BANKED,
  adjustDimensions,
  bankedTarget,
  clampDimensions,
  defaultDimensions,
  easeForLevel,
  emptyRuns,
  hintDelayMs,
  kioskMsForDims,
  patienceForOrder,
  peekBudgetFor,
  trayTargetFor,
  type DimRuns,
  type Dimensions,
} from './difficulty';
import { defaultMastery, generationHints, updateMastery, type MasteryProfile } from './mastery';
import { generateTryOrders, type Order } from './orders';
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
  /** Synced alias of dimensions.time. */
  paceStep: number;
  dimensions?: Dimensions;
  msToFirstTap: number | null;
  msToFinish: number | null;
  correct: boolean;
  mistake: Mistake | null;
  broken: string | null;
  hintsUsed: number;
  peeksUsed?: number;
}

export interface GameState {
  phase: Phase;
  paused: boolean;
  seed: number;
  rngState: number;
  level: number;
  savedLevel: number;
  warmup: boolean;
  /** Legacy alias of dimensions.time. */
  paceStep: number;
  mastery: MasteryProfile;
  dimensions: Dimensions;
  dimRuns: DimRuns;
  peeksUsed: number;
  peekBudget: number;
  /** True while the Head Chef HELP replay is speaking. Patience is paused. */
  helpPlaying: boolean;
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
  attemptsThisOrder: number;
  bankedProgress: number;
}

export type GameEvent =
  | { type: 'go' }
  | { type: 'tick'; ms: number }
  | { type: 'calloutFinished' }
  | { type: 'addItem'; item: string }
  | { type: 'peek' }
  | { type: 'helpEnd' }
  | { type: 'undo' }
  | { type: 'trash' }
  | { type: 'serve' }
  | { type: 'continue' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'powerOff' }
  | { type: 'powerOn' }
  | { type: 'powerReset' }
  | { type: 'tutorialDone' }
  | { type: 'tourDone' };

export interface StartOptions {
  seed?: number;
  savedLevel?: number;
  paceStep?: number;
  mastery?: MasteryProfile;
  dimensions?: Dimensions;
  bossBeaten?: boolean;
  starsByLevel?: Record<number, number>;
  tutorialsSeen?: string[];
  gagSeen?: string[];
  power?: 'on' | 'off';
  telemetry?: TelemetryEntry[];
  levelProgress?: number;
}

export function initialState(opts: StartOptions = {}): GameState {
  const savedLevel = Math.min(6, Math.max(1, opts.savedLevel ?? 1));
  const boss = opts.bossBeaten ?? false;
  const power = opts.power ?? 'on';
  const dimensions = clampDimensions(opts.dimensions ?? defaultDimensions(savedLevel, opts.paceStep), savedLevel);
  return {
    phase: power === 'off' ? 'poweredOff' : boss ? 'closed' : 'title',
    paused: false,
    seed: opts.seed ?? 1234,
    rngState: opts.seed ?? 1234,
    level: savedLevel,
    savedLevel,
    warmup: false,
    paceStep: dimensions.time,
    mastery: opts.mastery ?? defaultMastery(),
    dimensions,
    dimRuns: emptyRuns(),
    peeksUsed: 0,
    peekBudget: peekBudgetFor(savedLevel, dimensions, false),
    helpPlaying: false,
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
    attemptsThisOrder: 0,
    bankedProgress: Math.min(MAX_BANKED - 1, Math.max(0, opts.levelProgress ?? 0)),
  };
}

const orderOf = (s: GameState): Order | null => s.orders[s.orderIndex] ?? null;

function startBatch(s: GameState, level: number, preserveProgress: boolean): GameState {
  const seed = (s.seed * 1103515245 + level * 977 + s.tryCount * 131) >>> 0;
  const firstEntry = !s.sawtoothAppliedFor.includes(level);
  const dimensions = firstEntry ? easeForLevel(s.dimensions, level) : clampDimensions(s.dimensions, level);
  const hints = generationHints(s.mastery, level);
  const { orders, rngState } = generateTryOrders(level, seed, {
    doubleProb: hints.doubleProb,
    toppingDelta: hints.toppingDelta,
    trayTarget: trayTargetFor(level, dimensions, 0),
  });
  const failed = s.failedTries[level] ?? 0;
  const first = orders[0];
  // Banked progress applies only when starting the frontier level itself,
  // not a warm-up level below it, and is consumed once applied.
  const banked = !preserveProgress && level === s.savedLevel && !s.warmup ? s.bankedProgress : 0;
  return {
    ...s,
    level,
    paceStep: dimensions.time,
    dimensions,
    peeksUsed: 0,
    peekBudget: peekBudgetFor(level, dimensions, failed >= 2),
    orders,
    rngState,
    orderIndex: 0,
    tryCount: s.tryCount + 1,
    attemptsThisOrder: 0,
    starsTry: preserveProgress ? s.starsTry : banked,
    bankedProgress: banked > 0 ? 0 : s.bankedProgress,
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

function startTry(s: GameState, level: number): GameState {
  return startBatch(s, level, false);
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
  const total = patienceForOrder(order.ticket.length, s.dimensions, s.assist, order.broken);
  return {
    ...s,
    phase: 'cooking',
    phaseMs: 0,
    patienceTotalMs: total,
    patienceLeftMs: total,
    cookingMs: 0,
    idleMs: 0,
    hintsUsed: 0,
    peeksUsed: 0,
    peekBudget: peekBudgetFor(s.level, s.dimensions, s.assist),
    firstTapMs: null,
  };
}

function finishOrder(s: GameState, result: ServeResult): GameState {
  const order = orderOf(s);
  if (!order) return s;
  const correct = result.kind === 'correct';
  let { correctRun, fastRun, streak } = s;
  correctRun = correct ? correctRun + 1 : 0;
  if (correctRun >= 3) correctRun = 0;
  // A first wrong serve earns a retry of the same order, so difficulty does
  // not ease yet. A counted miss eases only its implicated dimension.
  const willRetry = result.kind === 'wrong' && s.attemptsThisOrder === 0;
  const adjusted = adjustDimensions(s.dimensions, s.dimRuns, {
    level: s.level,
    order,
    correct,
    mistake: result.mistake,
    willRetry,
  });
  const mastery = updateMastery(s.mastery, {
    level: s.level,
    order,
    correct,
    mistake: result.mistake,
    fast: result.fast,
    hintsUsed: s.hintsUsed,
    peeksUsed: s.peeksUsed,
  });
  const dimensions = adjusted.dimensions;
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
    paceStep: dimensions.time,
    dimensions: { ...dimensions },
    msToFirstTap: s.firstTapMs,
    msToFinish: s.cookingMs || null,
    correct,
    mistake: result.mistake,
    broken: order.broken,
    hintsUsed: s.hintsUsed,
    peeksUsed: s.peeksUsed,
  };
  return {
    ...s,
    result,
    paceStep: dimensions.time,
    mastery,
    dimensions,
    dimRuns: adjusted.runs,
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

/** Trim an order's ticket (and expected sequence) to at most `cap` items. */
function capOrder(order: Order, cap: number): Order {
  if (order.ticket.length <= cap) return order;
  const ticket = order.ticket.slice(0, Math.max(0, cap));
  return { ...order, ticket, expected: [...order.prebuilt, ...ticket] };
}

function advanceAfterResult(s: GameState): GameState {
  const cleared = { ...s, result: null, pendingEvents: [] as string[] };
  // First wrong serve: same order again from the kiosk, so the player can
  // re-watch and re-hear it. Getting it on the retry proceeds as normal.
  if (s.result?.kind === 'wrong' && s.attemptsThisOrder === 0) {
    const order = orderOf(s);
    if (order) {
      return {
        ...cleared,
        attemptsThisOrder: 1,
        phase: 'kiosk',
        phaseMs: 0,
        kioskShown: 0,
        built: [...order.prebuilt],
        printDone: false,
        calloutDone: false,
      };
    }
  }
  // A round is missed when it ends without a correct serve, excluding the
  // first wrong serve that is about to be retried. Two missed rounds on a
  // level turn assist mode on for the rounds that follow.
  const missedRound =
    s.result !== null && s.result.kind !== 'correct' && !(s.result.kind === 'wrong' && s.attemptsThisOrder === 0);
  const failedTries = missedRound ? { ...s.failedTries, [s.level]: (s.failedTries[s.level] ?? 0) + 1 } : s.failedTries;
  const progressed = {
    ...cleared,
    failedTries,
    assist: s.assist || (failedTries[s.level] ?? 0) >= 2,
  };

  // The level ends as soon as its banked-correct target is reached,
  // however many rounds that took.
  if (s.starsTry >= bankedTarget(s.level)) {
    const stars = s.starsTry;
    const best = Math.max(s.starsByLevel[s.level] ?? 0, stars);
    const withStars = {
      ...progressed,
      attemptsThisOrder: 0,
      starsByLevel: { ...s.starsByLevel, [s.level]: best },
      phase: 'levelResult' as Phase,
      phaseMs: 0,
      pendingEvents: [...progressed.pendingEvents, 'levelUp'],
    };
    if (s.level >= 6) {
      return {
        ...withStars,
        bossBeaten: true,
        phase: 'bossEnding' as Phase,
        pendingEvents: [...withStars.pendingEvents, 'bossWin'],
      };
    }
    return withStars;
  }

  if (s.orderIndex < 2) {
    const failed = orderOf(s);
    // Option 1: after a second miss, the next order is capped at the failed
    // order's length, so a double miss is never followed by a longer order.
    const nextRaw = s.orders[s.orderIndex + 1];
    const next =
      s.result?.kind === 'wrong' && s.attemptsThisOrder === 1 && failed
        ? capOrder(nextRaw, failed.ticket.length)
        : nextRaw;
    const orders = next !== nextRaw ? s.orders.map((o, i) => (i === s.orderIndex + 1 ? next : o)) : s.orders;
    return {
      ...progressed,
      orders,
      attemptsThisOrder: 0,
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
  // Batch exhausted with progress still to bank: deal a fresh batch of
  // rounds at the same level, keeping the banked correct count. Avoid an
  // immediate dish or monster repeat across the batch boundary.
  const batch = startBatch(progressed, s.level, true);
  const previous = orderOf(s);
  if (previous && batch.orders.length > 1) {
    const first = batch.orders[0];
    if (first.dish === previous.dish || first.monster === previous.monster) {
      const rotated = [batch.orders[1], batch.orders[2], batch.orders[0]];
      return {
        ...batch,
        orders: rotated,
        built: [...rotated[0].prebuilt],
        tutorial: tutorialFor(progressed, s.level, rotated[0]),
      };
    }
  }
  return batch;
}

function continueFromLevelResult(s: GameState): GameState {
  // Level result is only reached with three banked correct rounds.
  if (s.bossBeaten && s.level >= 6) return { ...s, phase: 'closed', phaseMs: 0 };
  const nextLevel = s.warmup && s.level < s.savedLevel ? s.savedLevel : s.level + 1;
  const wasWarmup = s.warmup;
  return startTry(
    {
      ...s,
      failedTries: {},
      assist: false,
      savedLevel: Math.max(s.savedLevel, wasWarmup ? s.savedLevel : nextLevel),
      warmup: false,
    },
    nextLevel,
  );
}

function withTutorialDismissed(s: GameState): GameState {
  const t = s.tutorial;
  if (!t) return s;
  const gag = t.startsWith('gag:') ? t.slice(4) : null;
  return {
    ...s,
    tutorial: null,
    tutorialsSeen: gag ? s.tutorialsSeen : [...new Set([...s.tutorialsSeen, t])],
    gagSeen: gag ? [...new Set([...s.gagSeen, gag])] : s.gagSeen,
  };
}

export function step(prev: GameState, event: GameEvent): GameState {
  // calloutFinished is allowed through while paused: the voice may finish
  // in the background, and dropping it would strand the game in callout.
  if (
    prev.paused &&
    event.type !== 'resume' &&
    event.type !== 'tick' &&
    event.type !== 'calloutFinished' &&
    event.type !== 'powerReset'
  )
    return prev;
  switch (event.type) {
    case 'pause':
      return { ...prev, paused: true };
    case 'resume':
      // Resuming counts as activity, so patience visibly moves again
      // instead of staying in the idle freeze until the next ingredient tap.
      return { ...prev, paused: false, idleMs: 0 };
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
    case 'tourDone': {
      if (prev.tutorialsSeen.includes('tour')) return prev;
      return { ...prev, tutorialsSeen: [...prev.tutorialsSeen, 'tour'] };
    }
    case 'tutorialDone': {
      return withTutorialDismissed(prev);
    }
    case 'calloutFinished': {
      const s = { ...prev, calloutDone: true };
      if (s.phase === 'callout' && (s.printDone || orderOf(s)?.broken === 'speaker'))
        return beginCooking({ ...s, printDone: true });
      if (s.phase === 'printing' && s.printDone) return beginCooking(s);
      return s;
    }
    case 'peek': {
      // HELP: Head Chef replay. Consumes one help from the memory budget.
      if (prev.phase !== 'cooking') return prev;
      if (prev.helpPlaying) return prev;
      if (prev.peeksUsed >= prev.peekBudget) return prev;
      return { ...prev, peeksUsed: prev.peeksUsed + 1, helpPlaying: true };
    }
    case 'helpEnd': {
      if (!prev.helpPlaying) return prev;
      return { ...prev, helpPlaying: false, idleMs: 0 };
    }
    case 'addItem': {
      if (prev.phase !== 'cooking') return prev;
      // The pointing hand is a coach mark, not a gate: the first real tap
      // dismisses it and marks it seen. No dismiss button covers the tray.
      const base = withTutorialDismissed(prev);
      return { ...base, built: [...base.built, event.item], idleMs: 0, firstTapMs: base.firstTapMs ?? base.cookingMs };
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
    case 'powerReset':
      // Complete wipe back to the beginning. Resetting the core first means
      // later ticks project this fresh state, never the old level.
      return initialState({ seed: prev.seed, power: 'on' });
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
          const hintsUsed =
            s.hintsUsed + (idleMs >= hintDelayMs(s.dimensions, s.level, s.assist) && s.hintsUsed === 0 ? 1 : 0);
          const left = frozen || s.helpPlaying ? s.patienceLeftMs : s.patienceLeftMs - ms;
          if (left <= 0) {
            return finishOrder(
              { ...s, cookingMs, idleMs, hintsUsed, patienceLeftMs: 0 },
              { kind: 'timeout', mistake: 'timeout', fast: false, highlight: null },
            );
          }
          return { ...s, cookingMs, idleMs, hintsUsed, patienceLeftMs: left };
        }
        case 'serveResult': {
          const hold = s.result?.kind === 'correct' ? 2500 : s.result?.kind === 'wrong' ? 2500 : 1200;
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
// core uses the encode dimension; UI test mode dispatches larger tick steps instead.
function kioskSpeed(s: GameState): number {
  return kioskMsForDims(s.dimensions);
}

export { orderOf as currentOrder };
export const serialize = (s: GameState): string => JSON.stringify({ v: 1, state: s });
export function deserialize(json: string): GameState {
  const parsed = JSON.parse(json) as { v: number; state: GameState };
  if (parsed.v !== 1) throw new Error('Unsupported core state version');
  return { ...initialState(), ...parsed.state };
}
