import type { Mistake } from './compare';
import type { OrderLike } from './mastery';

export type DimId = 'encode' | 'time' | 'memory' | 'search' | 'complexity';

export const DIM_IDS: DimId[] = ['encode', 'time', 'memory', 'search', 'complexity'];

export type Dimensions = Record<DimId, number>;
export type DimRuns = Record<DimId, number>;

/** Correct banked per level. Total 29 across L1–L6 sizes the ~25-minute run. */
export const BANKED_BY_LEVEL: Record<number, number> = { 1: 3, 2: 4, 3: 4, 4: 5, 5: 6, 6: 7 };
export const bankedTarget = (level: number): number => BANKED_BY_LEVEL[Math.min(6, Math.max(1, level))] ?? 3;
export const MAX_BANKED = Math.max(...Object.values(BANKED_BY_LEVEL));

interface Envelope {
  min: number;
  max: number;
}

/** Per-level [min,max] for each dimension. Levels still feel like levels. */
export const ENVELOPES: Record<number, Record<DimId, Envelope>> = {
  1: {
    encode: { min: 0, max: 2 },
    time: { min: 0, max: 2 },
    memory: { min: 0, max: 2 },
    search: { min: 0, max: 2 },
    complexity: { min: 0, max: 1 },
  },
  2: {
    encode: { min: 0, max: 3 },
    time: { min: 0, max: 3 },
    memory: { min: 0, max: 3 },
    search: { min: 0, max: 3 },
    complexity: { min: 0, max: 2 },
  },
  3: {
    encode: { min: 1, max: 4 },
    time: { min: 1, max: 4 },
    memory: { min: 1, max: 4 },
    search: { min: 1, max: 4 },
    complexity: { min: 1, max: 3 },
  },
  4: {
    encode: { min: 2, max: 5 },
    time: { min: 2, max: 5 },
    memory: { min: 2, max: 5 },
    search: { min: 2, max: 6 },
    complexity: { min: 2, max: 4 },
  },
  5: {
    encode: { min: 2, max: 6 },
    time: { min: 2, max: 6 },
    memory: { min: 2, max: 6 },
    search: { min: 3, max: 7 },
    complexity: { min: 2, max: 5 },
  },
  6: {
    encode: { min: 3, max: 7 },
    time: { min: 3, max: 8 },
    memory: { min: 3, max: 7 },
    search: { min: 4, max: 8 },
    complexity: { min: 3, max: 6 },
  },
};

export const envelopeFor = (level: number): Record<DimId, Envelope> =>
  ENVELOPES[Math.min(6, Math.max(1, level))] ?? ENVELOPES[1];

const clampDim = (level: number, dim: DimId, v: number): number => {
  const e = envelopeFor(level)[dim];
  return Math.min(e.max, Math.max(e.min, Math.round(v)));
};

export function clampDimensions(dims: Dimensions, level: number): Dimensions {
  return {
    encode: clampDim(level, 'encode', dims.encode),
    time: clampDim(level, 'time', dims.time),
    memory: clampDim(level, 'memory', dims.memory),
    search: clampDim(level, 'search', dims.search),
    complexity: clampDim(level, 'complexity', dims.complexity),
  };
}

/** Start-of-level dimensions: envelope floor, legacy pace seeds time+encode. */
export function defaultDimensions(level: number, legacyPace?: number): Dimensions {
  const env = envelopeFor(level);
  const seed = legacyPace ?? env.time.min;
  return clampDimensions(
    {
      encode: seed,
      time: seed,
      memory: env.memory.min,
      search: env.search.min,
      complexity: env.complexity.min,
    },
    level,
  );
}

/** Sawtooth: entering a level eases time+encode by one inside the envelope. */
export function easeForLevel(dims: Dimensions, level: number): Dimensions {
  const clamped = clampDimensions(dims, level);
  const env = envelopeFor(level);
  return {
    ...clamped,
    encode: Math.max(env.encode.min, clamped.encode - 1),
    time: Math.max(env.time.min, clamped.time - 1),
  };
}

export const emptyRuns = (): DimRuns => ({ encode: 0, time: 0, memory: 0, search: 0, complexity: 0 });

export const perItemSecondsFor = (timeStep: number): number =>
  Math.min(4.0, Math.max(1.5, 4.0 * Math.pow(0.9, timeStep)));

/** Broken channels buy time back: losing a channel should not also shrink the clock. */
export function patienceForOrder(
  tappableItems: number,
  dims: Dimensions,
  assist: boolean,
  broken: string | null,
): number {
  const base = (5 + tappableItems * perItemSecondsFor(dims.time)) * 1000;
  return Math.round(base * (assist ? 1.3 : 1) * (broken ? 1.15 : 1));
}

export const kioskMsForDims = (dims: Dimensions): number =>
  Math.min(1050, Math.max(480, Math.round(1050 * Math.pow(0.93, dims.encode))));

export function hintDelayMs(dims: Dimensions, level: number, assist: boolean): number {
  if (assist) return 2000;
  const rel = dims.memory - envelopeFor(level).memory.min;
  return Math.min(4200, Math.max(2200, 4200 - rel * 300));
}

export function peekBudgetFor(level: number, dims: Dimensions, assist: boolean): number {
  const levelBase = level <= 2 ? 3 : level <= 4 ? 2 : 1;
  const rel = dims.memory - envelopeFor(level).memory.min;
  const base = Math.max(1, levelBase - Math.floor(rel / 2));
  return Math.min(4, base + (assist ? 1 : 0));
}

export function trayTargetFor(level: number, dims: Dimensions, neededDistinct: number): number {
  const rel = dims.search - envelopeFor(level).search.min;
  return Math.min(10, Math.max(neededDistinct, level + 3 + (rel - 1)));
}

/** Dimensions an order exercises, via its practiced demands. */
export function practicedDims(level: number): DimId[] {
  const out: DimId[] = ['encode', 'memory', 'time'];
  if (level >= 2) out.push('complexity');
  if (level >= 4) out.push('search');
  return out;
}

export const dimForMistake = (mistake: Mistake | null): DimId | null => {
  switch (mistake) {
    case 'timeout':
      return 'time';
    case 'wrong_base':
    case 'wrong_amount':
      return 'complexity';
    case 'lookalike_swap':
    case 'extra_item':
      return 'search';
    case 'wrong_order':
      return 'encode';
    case 'missed_item':
      return 'memory';
    default:
      return null;
  }
};

export interface DimOutcome {
  level: number;
  order: OrderLike;
  correct: boolean;
  mistake: Mistake | null;
  /** First wrong serve will be retried: no easing yet. */
  willRetry: boolean;
}

/**
 * Per-dimension staircase (3-up / 1-down, ~79% target): a correct serve
 * advances only practiced dimensions; a counted miss eases only the
 * implicated dimension. One outcome never moves two axes the hard way.
 */
export function adjustDimensions(
  dims: Dimensions,
  runs: DimRuns,
  outcome: DimOutcome,
): { dimensions: Dimensions; runs: DimRuns } {
  const nextDims = { ...dims };
  const nextRuns = { ...runs };
  const { level } = outcome;
  if (outcome.correct) {
    for (const dim of practicedDims(level)) {
      nextRuns[dim] += 1;
      if (nextRuns[dim] >= 3) {
        nextDims[dim] = clampDim(level, dim, nextDims[dim] + 1);
        nextRuns[dim] = 0;
      }
    }
  } else if (!outcome.willRetry) {
    const dim = dimForMistake(outcome.mistake);
    if (dim) {
      nextDims[dim] = clampDim(level, dim, nextDims[dim] - 1);
      nextRuns[dim] = 0;
    }
    for (const d of DIM_IDS) if (d !== dim) nextRuns[d] = 0;
  }
  return { dimensions: clampDimensions(nextDims, level), runs: nextRuns };
}
