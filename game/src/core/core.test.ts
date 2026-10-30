import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ITEMS, itemsFor } from '../content/content';
import { classifyMismatch } from './compare';
import { deserialize, initialState, serialize, step, type GameState } from './game';
import { toMirror } from './mirror';
import { generateOrder, generateTryOrders } from './orders';
import { kioskIntervalMs, patienceMs, perItemSeconds } from './pace';
import { makeRng } from './rng';
import { defaultSave, migrateSave, saveFromState } from './save';

describe('order generation', () => {
  it('is always solvable with the tray shown', () => {
    for (let level = 1; level <= 6; level++) {
      for (let seed = 1; seed <= 30; seed++) {
        const { orders } = generateTryOrders(level, seed * 7919);
        expect(orders).toHaveLength(3);
        expect(new Set(orders.map((o) => o.dish)).size).toBe(3);
        for (const order of orders) {
          for (const needed of new Set(order.ticket)) {
            expect(order.tray, `L${level} ${order.dish} needs ${needed}`).toContain(needed);
          }
          expect(order.tray.length, `L${level} ${order.dish} tray size`).toBe(level + 3);
          expect(new Set(order.tray).size).toBe(order.tray.length);
        }
      }
    }
  });

  it('pre-builds the base only on Level 1 and keeps it off the ticket', () => {
    const rng = makeRng(42);
    const o1 = generateOrder(1, 'burger', rng, 'gobbler');
    expect(o1.prebuilt).toEqual(['patty']);
    expect(o1.ticket).not.toContain('patty');
    expect(o1.expected[0]).toBe('patty');
    const o2 = generateOrder(2, 'pizza', makeRng(7), 'fussy');
    expect(o2.prebuilt).toEqual([]);
    expect(o2.ticket.slice(0, 2)).toEqual(o2.expected.slice(0, 2));
  });

  it('gates look-alikes and broken channels by level', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const l3 = generateOrder(3, 'sundae', makeRng(seed), 'speedy');
      expect(l3.broken).toBeNull();
      const l4 = generateOrder(4, 'burger', makeRng(seed), 'speedy');
      expect(l4.broken).toBeNull();
      const l5 = generateOrder(5, 'pizza', makeRng(seed), 'speedy');
      expect(l5.broken).not.toBeNull();
    }
  });
});

describe('comparison and classification (prompt 6.4)', () => {
  const exp = ['patty', 'cheese', 'pickles', 'pickles'];
  it('accepts exact matches only', () => {
    expect(classifyMismatch(exp, exp)).toBeNull();
    expect(classifyMismatch(['patty', 'cheese'], exp)).toBe('missed_item');
    expect(classifyMismatch([...exp, 'cheese'], exp)).toBe('extra_item');
  });
  it('classifies base, lookalike, amount and order errors', () => {
    expect(classifyMismatch(['cheese', 'cheese', 'pickles', 'pickles'], exp)).toBe('wrong_base');
    expect(
      classifyMismatch(['patty', 'cheese', 'tomato', 'pickles'], ['patty', 'cheese', 'pineapple', 'pickles']),
    ).toBe('lookalike_swap');
    expect(classifyMismatch(['patty', 'cheese', 'pickles'], exp)).toBe('missed_item');
    expect(classifyMismatch(['patty', 'pickles', 'cheese', 'pickles'], exp)).toBe('wrong_order');
    expect(classifyMismatch(['patty', 'cheese', 'cheese', 'pickles'], exp)).toBe('wrong_amount');
  });
});

describe('pace (prompt 6.7)', () => {
  it('computes per-item, patience and kiosk interval', () => {
    expect(perItemSeconds(0)).toBe(4);
    expect(perItemSeconds(9)).toBeCloseTo(1.55, 1);
    expect(patienceMs(2, 0, false)).toBe(13000);
    expect(patienceMs(2, 0, true)).toBe(16900);
    expect(kioskIntervalMs(0)).toBe(900);
    expect(kioskIntervalMs(9)).toBe(500);
  });
});

describe('game flow', () => {
  const playCorrectOrder = (s: GameState): GameState => {
    let out = s;
    // kiosk -> printing -> callout
    out = step(out, { type: 'tick', ms: 10000 });
    out = step(out, { type: 'tick', ms: 1000 });
    expect(out.phase).toBe('callout');
    out = step(out, { type: 'calloutFinished' });
    expect(out.phase).toBe('cooking');
    const order = out.orders[out.orderIndex];
    const toTap = order.ticket;
    for (const item of toTap) out = step(out, { type: 'addItem', item });
    out = step(out, { type: 'serve' });
    expect(out.result?.kind).toBe('correct');
    out = step(out, { type: 'tick', ms: 3000 });
    return out;
  };

  it('completes Level 1 and levels up', () => {
    let s = initialState({ seed: 99, savedLevel: 1 });
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    expect(s.phase).toBe('kiosk');
    for (let i = 0; i < 3; i++) s = playCorrectOrder(s);
    expect(s.phase).toBe('levelResult');
    expect(s.starsTry).toBe(3);
    s = step(s, { type: 'continue' });
    expect(s.level).toBe(2);
  });

  it('marks the onboarding tour seen once and re-arms it on power cycle', () => {
    let s = initialState({ seed: 1, savedLevel: 1 });
    s = step(s, { type: 'tourDone' });
    expect(s.tutorialsSeen).toContain('tour');
    const again = step(s, { type: 'tourDone' });
    expect(again).toBe(s);
    const off = step({ ...s, phase: 'closed', bossBeaten: true }, { type: 'powerOff' });
    const on = step(off, { type: 'powerOn' });
    expect(on.tutorialsSeen).not.toContain('tour');
  });

  it('dismisses the pointing tutorial on the first tap and marks it seen', () => {
    let s = initialState({ seed: 99, savedLevel: 1 });
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    s = step(s, { type: 'tick', ms: 10000 });
    s = step(s, { type: 'tick', ms: 1000 });
    s = step(s, { type: 'calloutFinished' });
    expect(s.phase).toBe('cooking');
    expect(s.tutorial).toBe('firstOrder');
    const item = s.orders[s.orderIndex].ticket[0];
    s = step(s, { type: 'addItem', item });
    expect(s.tutorial).toBeNull();
    expect(s.tutorialsSeen).toContain('firstOrder');
    expect(s.built).toContain(item);
  });

  it('records a callout that finishes while paused and resumes into cooking', () => {
    let s = initialState({ seed: 99, savedLevel: 1 });
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    s = step(s, { type: 'tick', ms: 10000 });
    s = step(s, { type: 'tick', ms: 1000 });
    expect(s.phase).toBe('callout');
    s = step(s, { type: 'pause' });
    s = step(s, { type: 'calloutFinished' });
    expect(s.phase).toBe('cooking');
    expect(s.paused).toBe(true);
    s = step(s, { type: 'resume' });
    expect(s.paused).toBe(false);
    expect(s.phase).toBe('cooking');
  });

  it('clears the idle freeze on resume so patience moves again', () => {
    let s = initialState({ seed: 99, savedLevel: 1 });
    s = { ...s, phase: 'cooking', paused: true, idleMs: 12000, patienceLeftMs: 5000, patienceTotalMs: 13000 };
    s = step(s, { type: 'resume' });
    expect(s.idleMs).toBe(0);
    s = step(s, { type: 'tick', ms: 1000 });
    expect(s.patienceLeftMs).toBe(4000);
  });

  it('retries the same order after a first wrong serve, then proceeds when corrected', () => {
    const toCooking = (s: GameState): GameState => {
      let out = step(s, { type: 'tick', ms: 10000 });
      out = step(out, { type: 'tick', ms: 1000 });
      out = step(out, { type: 'calloutFinished' });
      expect(out.phase).toBe('cooking');
      return out;
    };
    let s = initialState({ seed: 99, savedLevel: 1, paceStep: 5 });
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    s = toCooking(s);
    const paceBefore = s.paceStep;
    s = step(s, { type: 'serve' });
    expect(s.result?.kind).toBe('wrong');
    expect(s.paceStep).toBe(paceBefore);
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.phase).toBe('kiosk');
    expect(s.orderIndex).toBe(0);
    expect(s.attemptsThisOrder).toBe(1);
    s = toCooking(s);
    for (const item of s.orders[s.orderIndex].ticket) s = step(s, { type: 'addItem', item });
    s = step(s, { type: 'serve' });
    expect(s.result?.kind).toBe('correct');
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.orderIndex).toBe(1);
    expect(s.starsTry).toBe(1);
    expect(s.attemptsThisOrder).toBe(0);
  });

  it('moves on after a second wrong serve, easing only the implicated dimension', () => {
    const toCooking = (s: GameState): GameState => {
      let out = step(s, { type: 'tick', ms: 10000 });
      out = step(out, { type: 'tick', ms: 1000 });
      return step(out, { type: 'calloutFinished' });
    };
    let s = initialState({ seed: 99, savedLevel: 3, paceStep: 3 });
    s = { ...s, savedLevel: 3 };
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    // Warm-up plays one level below the frontier; jump straight to cooking
    // on the current order to isolate the dimension assertion.
    s = toCooking(s);
    s = { ...s, dimensions: { ...s.dimensions, memory: 2, time: 2 } };
    const dimsBefore = { ...s.dimensions };
    s = step(s, { type: 'serve' });
    s = step(s, { type: 'tick', ms: 3000 });
    s = toCooking(s);
    s = step(s, { type: 'serve' });
    expect(s.result?.kind).toBe('wrong');
    // Empty serve is a missed item: memory eases, time pressure does not.
    expect(s.dimensions.memory).toBe(dimsBefore.memory - 1);
    expect(s.dimensions.time).toBe(dimsBefore.time);
    expect(s.paceStep).toBe(s.dimensions.time);
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.orderIndex).toBe(1);
    expect(s.starsTry).toBe(0);
  });

  it('caps the next order at the failed length after a second miss', () => {
    const { orders } = generateTryOrders(2, 5);
    expect(orders[0].ticket.length).toBeLessThan(orders[1].ticket.length);
    let s: GameState = {
      ...initialState({ seed: 5, savedLevel: 2 }),
      level: 2,
      phase: 'cooking' as const,
      orders,
      orderIndex: 0,
      attemptsThisOrder: 1,
      built: [...orders[0].prebuilt],
    };
    s = step(s, { type: 'serve' });
    expect(s.result?.kind).toBe('wrong');
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.orderIndex).toBe(1);
    const next = s.orders[1];
    expect(next.ticket.length).toBeLessThanOrEqual(orders[0].ticket.length);
    expect(next.dish).toBe(orders[1].dish);
    expect(next.monster).toBe(orders[1].monster);
    expect(next.expected).toEqual([...next.prebuilt, ...next.ticket]);
    for (const id of new Set(next.ticket)) expect(next.tray).toContain(id);
    expect(next.tray.length).toBe(5);
  });

  it('does not cap the next order after a correct serve', () => {
    const { orders } = generateTryOrders(2, 5);
    let s: GameState = {
      ...initialState({ seed: 5, savedLevel: 2 }),
      level: 2,
      phase: 'cooking' as const,
      orders,
      orderIndex: 0,
      attemptsThisOrder: 0,
      built: [...orders[0].expected],
    };
    s = step(s, { type: 'serve' });
    expect(s.result?.kind).toBe('correct');
    s = step(s, { type: 'tick', ms: 3000 });
    expect(s.orders[1].ticket).toEqual(orders[1].ticket);
  });

  it('banks correct rounds across batches until three finish the level', () => {
    const toCooking = (s: GameState): GameState => {
      let out = step(s, { type: 'tick', ms: 10000 });
      out = step(out, { type: 'tick', ms: 1000 });
      return step(out, { type: 'calloutFinished' });
    };
    const playRound = (s: GameState, correct: boolean): GameState => {
      let out = toCooking(s);
      if (correct) {
        for (const item of out.orders[out.orderIndex].ticket) out = step(out, { type: 'addItem', item });
        out = step(out, { type: 'serve' });
        return step(out, { type: 'tick', ms: 3000 });
      }
      out = step(out, { type: 'serve' });
      out = step(out, { type: 'tick', ms: 3000 });
      out = toCooking(out);
      out = step(out, { type: 'serve' });
      return step(out, { type: 'tick', ms: 3000 });
    };
    let s = initialState({ seed: 99, savedLevel: 1 });
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    s = playRound(s, false);
    expect(s.starsTry).toBe(0);
    s = playRound(s, true);
    s = playRound(s, true);
    // Batch of three is done with only two banked: a fresh batch continues
    // the same level instead of ending it.
    expect(s.phase).toBe('kiosk');
    expect(s.level).toBe(1);
    expect(s.starsTry).toBe(2);
    s = playRound(s, true);
    expect(s.phase).toBe('levelResult');
    expect(s.starsTry).toBe(3);
    s = step(s, { type: 'continue' });
    expect(s.level).toBe(2);
    expect(s.starsTry).toBe(0);
  });

  it('restores banked progress when starting the saved level', () => {
    let s = initialState({ seed: 99, savedLevel: 1, levelProgress: 2 });
    s = step(s, { type: 'go' });
    s = step(s, { type: 'tick', ms: 2000 });
    expect(s.phase).toBe('kiosk');
    expect(s.starsTry).toBe(2);
    expect(s.bankedProgress).toBe(0);
  });

  it('power reset wipes back to Level 1 from any point', () => {
    let s = initialState({ seed: 7, savedLevel: 5, paceStep: 6, bossBeaten: false });
    s = {
      ...s,
      phase: 'cooking',
      level: 5,
      starsByLevel: { 1: 3, 2: 3 },
      tutorialsSeen: ['tour', 'firstOrder'],
      telemetry: [
        {
          level: 5,
          dish: 'pizza',
          monster: 'fussy',
          paceStep: 6,
          msToFirstTap: 100,
          msToFinish: 900,
          correct: true,
          mistake: null,
          broken: null,
          hintsUsed: 0,
        },
      ],
    };
    s = step(s, { type: 'powerReset' });
    expect(s.phase).toBe('title');
    expect(s.level).toBe(1);
    expect(s.savedLevel).toBe(1);
    expect(s.paceStep).toBe(0);
    expect(s.starsByLevel).toEqual({});
    expect(s.tutorialsSeen).toEqual([]);
    expect(s.telemetry).toEqual([]);
    expect(s.bossBeaten).toBe(false);
  });

  it('boss leads to closed, power cycle resets to a fresh title', () => {
    let s = initialState({ seed: 5, savedLevel: 6 });
    s = { ...s, phase: 'closed', bossBeaten: true, power: 'on' };
    s = step(s, { type: 'powerOff' });
    expect(s.phase).toBe('poweredOff');
    const paired = s;
    s = step(s, { type: 'powerOn' });
    expect(s.phase).toBe('title');
    expect(s.level).toBe(1);
    expect(s.bossBeaten).toBe(false);
    void paired;
  });

  it('serialize round-trips and mirror is a whitelist', () => {
    const s = initialState({ seed: 3 });
    expect(deserialize(serialize(s)).seed).toBe(3);
    const m = toMirror(s);
    expect(Object.keys(m)).not.toContain('telemetry');
    expect(Object.keys(m)).not.toContain('kitchenId');
  });
});

describe('save migration', () => {
  it('migrates partial data and defaults safely', () => {
    expect(migrateSave(null)).toEqual(defaultSave());
    const m = migrateSave({ level: 4, soundOn: false, power: 'off', bogus: 1 });
    expect(m.level).toBe(4);
    expect(m.soundOn).toBe(false);
    expect(m.power).toBe('off');
    expect('bogus' in m).toBe(false);
  });

  it('clamps and banks level progress', () => {
    expect(migrateSave({ levelProgress: 9 }).levelProgress).toBe(6);
    expect(migrateSave({ levelProgress: -1 }).levelProgress).toBe(0);
    const playing = {
      ...initialState({ seed: 1, savedLevel: 2 }),
      phase: 'cooking' as const,
      level: 2,
      starsTry: 1,
    };
    expect(saveFromState(playing, defaultSave()).levelProgress).toBe(1);
    const warming = { ...playing, warmup: true, level: 1 };
    expect(saveFromState(warming, { ...defaultSave(), levelProgress: 2 }).levelProgress).toBe(2);
  });
});

describe('content coverage', () => {
  it('never shows the same picture for two different items of one dish', () => {
    for (const dish of ['burger', 'pizza', 'sundae'] as const) {
      const emojis = ITEMS.filter((i) => i.dish === dish).map((i) => i.emoji);
      expect(new Set(emojis).size, dish).toBe(emojis.length);
    }
  });

  it('has no nuts and no pork items, and clips cover every item', () => {
    const text = ITEMS.map((i) => `${i.id} ${i.clipText}`)
      .join(' ')
      .toLowerCase();
    for (const banned of ['nut', 'bacon', 'ham']) expect(text).not.toContain(banned);
    for (const dish of ['burger', 'pizza', 'sundae'] as const) {
      expect(itemsFor(dish, 'topping').length).toBeGreaterThanOrEqual(8);
    }
    const clips = JSON.parse(readFileSync('public/audio/clips.json', 'utf8')) as { clips: { id: string }[] };
    const clipIds = new Set(clips.clips.map((c) => c.id));
    for (const item of ITEMS) expect(clipIds.has(`ing.${item.id}`), item.id).toBe(true);
    const manifest = JSON.parse(readFileSync('public/art/manifest.json', 'utf8')) as { assets: { id: string }[] };
    const artIds = new Set(manifest.assets.map((a) => a.id));
    for (const item of ITEMS) expect(artIds.has(`item.${item.id}`), item.id).toBe(true);
  });
});
