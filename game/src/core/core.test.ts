import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ITEMS, itemsFor } from '../content/content';
import { classifyMismatch } from './compare';
import { deserialize, initialState, serialize, step, type GameState } from './game';
import { toMirror } from './mirror';
import { generateOrder, generateTryOrders } from './orders';
import { kioskIntervalMs, patienceMs, perItemSeconds } from './pace';
import { makeRng } from './rng';
import { defaultSave, migrateSave } from './save';

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
          expect(order.tray.length).toBeLessThanOrEqual(8);
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
});

describe('content coverage', () => {
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
