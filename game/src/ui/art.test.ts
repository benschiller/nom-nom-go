import { describe, expect, it } from 'vitest';
import { ITEMS, MONSTERS } from '../content/content';
import { BLEED_BOX, masterBox, monsterPoseFor } from './Art';
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

  it('bleed plates cover every landscape viewport from 4:3 to ~2.2:1', () => {
    // Stage is fit (contain) into the viewport; visible stage-unit area:
    const visible = (aspect: number): [number, number] =>
      aspect > 16 / 9 ? [900 * aspect, 900] : [1600, 1600 / aspect];
    for (const aspect of [4 / 3, 1194 / 834, 16 / 9, 852 / 393, 2.2]) {
      const [w, h] = visible(aspect);
      expect(BLEED_BOX.left, `aspect ${aspect}`).toBeLessThanOrEqual(800 - w / 2);
      expect(BLEED_BOX.left + BLEED_BOX.width).toBeGreaterThanOrEqual(800 + w / 2);
      expect(BLEED_BOX.top).toBeLessThanOrEqual(450 - h / 2);
      expect(BLEED_BOX.top + BLEED_BOX.height).toBeGreaterThanOrEqual(450 + h / 2);
    }
  });

  it('title pieces are placed in their storyboard boxes', () => {
    for (const id of ['monster.og.wave', 'monster.gobbler.wave', 'chef.windowWave', 'ui.goButton']) {
      const box = masterBox(id);
      expect(box, id).toBeDefined();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.left).toBeGreaterThanOrEqual(0);
      expect(box!.left + box!.width).toBeLessThanOrEqual(1600);
    }
    // OG left of the truck, Gobbler right of it, chef in the window above the Go button.
    expect(masterBox('monster.og.wave')!.left).toBeLessThan(800);
    expect(masterBox('monster.gobbler.wave')!.left).toBeGreaterThan(800);
    expect(masterBox('chef.windowWave')!.top).toBeLessThan(masterBox('ui.goButton')!.top);
  });
});
