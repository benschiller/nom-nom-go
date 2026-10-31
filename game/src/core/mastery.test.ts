import { describe, expect, it } from 'vitest';
import { adjustDimensions, bankedTarget, clampDimensions, defaultDimensions, peekBudgetFor } from './difficulty';
import { initialState, step, type GameState } from './game';
import {
  defaultMastery,
  generationHints,
  implicatedSkill,
  practicedSkills,
  shrunkMastery,
  updateMastery,
} from './mastery';
import { generateTryOrders } from './orders';
import { defaultSave, migrateSave } from './save';
import { PERSONAS, simulateMedian, simulateRun } from './simulator';

describe('mastery model', () => {
  it('maps mistakes to exactly one implicated skill', () => {
    expect(implicatedSkill('wrong_base')).toBe('base');
    expect(implicatedSkill('lookalike_swap')).toBe('discrimination');
    expect(implicatedSkill('wrong_amount')).toBe('quantity');
    expect(implicatedSkill('wrong_order')).toBe('sequence');
    expect(implicatedSkill('missed_item')).toBe('recall');
    expect(implicatedSkill(null)).toBeNull();
  });

  it('credits practiced skills on correct and debits only the implicated skill on a miss', () => {
    const order = {
      ticket: ['patty', 'cheese', 'pickles'],
      tray: ['patty', 'cheese', 'pickles', 'lettuce'],
      broken: null,
    };
    expect(practicedSkills(2, order)).toContain('base');
    const start = defaultMastery();
    const afterCorrect = updateMastery(start, {
      level: 2,
      order,
      correct: true,
      mistake: null,
      fast: false,
      hintsUsed: 0,
      peeksUsed: 0,
    });
    expect(afterCorrect.skills.sequence.mastery).toBeGreaterThan(start.skills.sequence.mastery);
    expect(afterCorrect.skills.base.n).toBe(1);

    const afterMiss = updateMastery(start, {
      level: 2,
      order,
      correct: false,
      mistake: 'wrong_base',
      fast: false,
      hintsUsed: 0,
      peeksUsed: 0,
    });
    expect(afterMiss.skills.base.mastery).toBeLessThan(start.skills.base.mastery);
    expect(afterMiss.skills.sequence.mastery).toBe(start.skills.sequence.mastery);
    expect(afterMiss.skills.recall.n).toBe(0);
  });

  it('clamps per-order movement so sparse evidence cannot swing mastery', () => {
    let p = defaultMastery();
    const order = { ticket: ['cheese'], tray: ['cheese'], broken: null };
    for (let i = 0; i < 30; i++)
      p = updateMastery(p, { level: 1, order, correct: true, mistake: null, fast: true, hintsUsed: 0, peeksUsed: 0 });
    expect(p.skills.sequence.mastery).toBeLessThanOrEqual(0.97);
    expect(shrunkMastery(p.skills.sequence)).toBeGreaterThan(0.45);
  });
});

describe('decoupled dimensions', () => {
  const order = { ticket: ['patty', 'cheese'], tray: ['patty', 'cheese', 'lettuce'], broken: null };

  it('timeout eases only time pressure', () => {
    const dims = defaultDimensions(3, 3);
    const { dimensions } = adjustDimensions(
      dims,
      { encode: 0, time: 0, memory: 0, search: 0, complexity: 0 },
      {
        level: 3,
        order,
        correct: false,
        mistake: 'timeout',
        willRetry: false,
      },
    );
    expect(dimensions.time).toBe(dims.time - 1);
    expect(dimensions.encode).toBe(dims.encode);
    expect(dimensions.memory).toBe(dims.memory);
    expect(dimensions.search).toBe(dims.search);
    expect(dimensions.complexity).toBe(dims.complexity);
  });

  it('lookalike swap eases only search, missed item eases only memory', () => {
    const dims = { ...defaultDimensions(5, 5), search: 5, memory: 4 };
    const runs = { encode: 0, time: 0, memory: 0, search: 0, complexity: 0 };
    const look = adjustDimensions(dims, runs, {
      level: 5,
      order,
      correct: false,
      mistake: 'lookalike_swap',
      willRetry: false,
    });
    expect(look.dimensions.search).toBe(dims.search - 1);
    expect(look.dimensions.time).toBe(dims.time);
    const missed = adjustDimensions(dims, runs, {
      level: 5,
      order,
      correct: false,
      mistake: 'missed_item',
      willRetry: false,
    });
    expect(missed.dimensions.memory).toBe(dims.memory - 1);
    expect(missed.dimensions.time).toBe(dims.time);
  });

  it('first wrong serve (willRetry) eases nothing', () => {
    const dims = defaultDimensions(3, 3);
    const { dimensions } = adjustDimensions(
      dims,
      { encode: 0, time: 0, memory: 0, search: 0, complexity: 0 },
      {
        level: 3,
        order,
        correct: false,
        mistake: 'wrong_order',
        willRetry: true,
      },
    );
    expect(dimensions).toEqual(dims);
  });

  it('clamps every dimension inside its level envelope', () => {
    const wild = { encode: 99, time: -5, memory: 99, search: -5, complexity: 99 };
    const clamped = clampDimensions(wild, 1);
    expect(clamped.encode).toBe(2);
    expect(clamped.time).toBe(0);
    expect(clamped.complexity).toBe(1);
  });

  it('peek budget shrinks with memory difficulty and grows in assist', () => {
    const easy = defaultDimensions(1);
    const hard = { ...defaultDimensions(6), memory: 5 };
    expect(peekBudgetFor(1, easy, false)).toBe(3);
    expect(peekBudgetFor(6, hard, false)).toBe(1);
    expect(peekBudgetFor(6, hard, true)).toBe(2);
  });

  it('enforces the peek budget in the reducer', () => {
    let s: GameState = { ...initialState({ seed: 5, savedLevel: 1 }), phase: 'cooking', peeksUsed: 0, peekBudget: 1 };
    s = step(s, { type: 'peek' });
    expect(s.peeksUsed).toBe(1);
    const blocked = step(s, { type: 'peek' });
    expect(blocked.peeksUsed).toBe(1);
  });

  it('help replay pauses patience until it ends', () => {
    let s: GameState = {
      ...initialState({ seed: 5, savedLevel: 1 }),
      phase: 'cooking',
      peeksUsed: 0,
      peekBudget: 2,
      patienceTotalMs: 20000,
      patienceLeftMs: 20000,
    };
    s = step(s, { type: 'peek' });
    expect(s.helpPlaying).toBe(true);
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.patienceLeftMs).toBe(20000);
    s = step(s, { type: 'helpEnd' });
    expect(s.helpPlaying).toBe(false);
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.patienceLeftMs).toBe(17000);
  });
});

describe('mastery-aware generation', () => {
  it('stays solvable at mastery extremes', () => {
    const weak = defaultMastery();
    const strong = defaultMastery();
    strong.skills.quantity = { mastery: 0.95, n: 20 };
    strong.skills.sequence = { mastery: 0.95, n: 20 };
    for (const profile of [weak, strong]) {
      const hints = generationHints(profile, 6);
      const { orders } = generateTryOrders(6, 4242, {
        doubleProb: hints.doubleProb,
        toppingDelta: hints.toppingDelta,
        trayTarget: 9,
      });
      for (const o of orders) {
        for (const needed of new Set(o.ticket)) expect(o.tray).toContain(needed);
      }
    }
    expect(bankedTarget(1)).toBe(3);
    expect(bankedTarget(6)).toBe(7);
  });
});

describe('save v2 migration', () => {
  it('upgrades a v1 save, seeding mastery from telemetry and dimensions from paceStep', () => {
    const v1 = {
      level: 4,
      paceStep: 5,
      soundOn: true,
      telemetry: [
        {
          level: 3,
          dish: 'pizza',
          monster: 'fussy',
          paceStep: 4,
          msToFirstTap: 900,
          msToFinish: 5000,
          correct: true,
          mistake: null,
          broken: null,
          hintsUsed: 0,
        },
        {
          level: 3,
          dish: 'pizza',
          monster: 'fussy',
          paceStep: 4,
          msToFirstTap: 900,
          msToFinish: 5000,
          correct: false,
          mistake: 'wrong_amount',
          broken: null,
          hintsUsed: 1,
        },
      ],
    };
    const m = migrateSave(v1);
    expect(m.v).toBe(2);
    expect(m.level).toBe(4);
    expect(m.dimensions.time).toBe(5);
    expect(m.mastery.skills.quantity.n).toBeGreaterThan(0);
    expect(m.mastery.skills.sequence.n).toBeGreaterThan(0);
    expect(defaultSave().v).toBe(2);
  });
});

describe('persona pacing simulator', () => {
  it('completes L1-L6 and orders personas by speed', () => {
    const seeds = [11, 23, 37];
    const strong = simulateMedian(PERSONAS.strong, seeds);
    const typical = simulateMedian(PERSONAS.typical, seeds);
    const struggling = simulateMedian(PERSONAS.struggling, seeds);
    console.log(
      `pacing medians (min): strong=${(strong.medianMs / 60000).toFixed(1)} typical=${(typical.medianMs / 60000).toFixed(1)} struggling=${(struggling.medianMs / 60000).toFixed(1)}`,
    );
    expect(typical.completed).toBe(true);
    expect(strong.medianMs).toBeLessThan(typical.medianMs);
    expect(typical.medianMs).toBeLessThan(struggling.medianMs);
    // Calibration band from the plan: typical persona ~25-minute session.
    expect(typical.medianMs).toBeGreaterThan(20 * 60000);
    expect(typical.medianMs).toBeLessThan(28 * 60000);
    const run = simulateRun(PERSONAS.typical, 11);
    expect(run.perLevelMs[6]).toBeGreaterThan(run.perLevelMs[1]);
  });
});
