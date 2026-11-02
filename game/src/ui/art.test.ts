import { describe, expect, it } from 'vitest';
import { ITEMS, MONSTERS } from '../content/content';
import { monsterPoseFor } from './Art';
import manifest from './artManifest.json';

const CURATED = ['idle', 'tap', 'happy', 'fidgety', 'grumpy', 'gobble', 'dance', 'confused', 'leave'] as const;

describe('production art integration', () => {
  it('OG is a playable monster with a full curated pose set', () => {
    expect(MONSTERS.map((m) => m.id)).toContain('og');
    const ids = new Set(manifest.assets.map((a) => a.id));
    for (const m of MONSTERS) {
      for (const pose of CURATED) expect(ids.has(`monster.${m.id}.${pose}`), `${m.id}.${pose}`).toBe(true);
    }
  });

  it('every item has tray and dish art, and buns exist as scenery', () => {
    const ids = new Set(manifest.assets.map((a) => a.id));
    for (const item of ITEMS) {
      expect(ids.has(`item.${item.id}.tray`), item.id).toBe(true);
      expect(ids.has(`item.${item.id}.dish`), item.id).toBe(true);
    }
    expect(ids.has('dish.bunBottom')).toBe(true);
    expect(ids.has('dish.bunTop')).toBe(true);
  });

  it('maps game state to the curated poses', () => {
    const at = (over: Partial<Parameters<typeof monsterPoseFor>[0]>) =>
      monsterPoseFor({ phase: 'cooking', patienceFraction: 1, resultKind: null, phaseMs: 0, ...over });
    expect(at({ phase: 'ordering' })).toBe('tap');
    expect(at({ phase: 'goWipe' })).toBe('happy');
    expect(at({ patienceFraction: 0.9 })).toBe('happy');
    expect(at({ patienceFraction: 0.5 })).toBe('fidgety');
    expect(at({ patienceFraction: 0.1 })).toBe('grumpy');
    expect(at({ phase: 'serveResult', resultKind: 'correct', phaseMs: 100 })).toBe('gobble');
    expect(at({ phase: 'serveResult', resultKind: 'correct', phaseMs: 2000 })).toBe('dance');
    expect(at({ phase: 'serveResult', resultKind: 'wrong' })).toBe('confused');
    expect(at({ phase: 'serveResult', resultKind: 'timeout' })).toBe('leave');
  });
});
