import { useSyncExternalStore } from 'react';
import { initialState, step, type GameEvent, type GameState } from '../core/game';
import { decayMastery } from '../core/mastery';
import { loadSave, persistSave, saveFromState, type SaveData } from '../core/save';

export interface Store {
  getState: () => GameState;
  dispatch: (e: GameEvent) => void;
  subscribe: (fn: () => void) => () => void;
  getSave: () => SaveData;
  setSave: (save: SaveData) => void;
}

/** Fresh seed per launch, from outside the pure core. Test mode stays pinned. */
function launchSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] || 1234;
  } catch {
    return Date.now() >>> 0;
  }
}

export function createStore(seed?: number): Store {
  const params = new URLSearchParams(window.location.search);
  const testMode = params.get('test') === '1';
  const testSeed = testMode ? Number(params.get('seed') ?? 1234) : undefined;
  let save = loadSave(window.localStorage);
  if (testMode && params.get('boss') === '1') {
    save = { ...save, bossBeaten: true, level: 6 };
  }
  let state = initialState({
    seed: seed ?? testSeed ?? launchSeed(),
    savedLevel: save.level,
    paceStep: save.paceStep,
    // Returning session: mild forgetting pull toward the prior (applied once
    // at launch; the decayed profile is what then gets persisted on play).
    mastery: decayMastery(save.mastery),
    dimensions: save.dimensions,
    bossBeaten: save.bossBeaten,
    starsByLevel: save.starsByLevel,
    tutorialsSeen: save.tutorialsSeen,
    gagSeen: save.gagSeen,
    power: save.power,
    telemetry: save.telemetry,
    levelProgress: save.levelProgress,
  });
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    getSave: () => save,
    setSave: (next) => {
      save = next;
      persistSave(window.localStorage, save);
      listeners.forEach((fn) => fn());
    },
    dispatch: (event) => {
      const next = step(state, event);
      if (next !== state) {
        state = next;
        const nextSave = saveFromState(state, save);
        if (JSON.stringify(nextSave) !== JSON.stringify(save)) {
          save = nextSave;
          persistSave(window.localStorage, save);
        }
        listeners.forEach((fn) => fn());
      }
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

let singleton: Store | null = null;
export const getStore = (): Store => (singleton ??= createStore());

export function useGame(): { state: GameState; dispatch: (e: GameEvent) => void; store: Store } {
  const store = getStore();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  return { state, dispatch: store.dispatch, store };
}

export const isTestMode = (): boolean => new URLSearchParams(window.location.search).get('test') === '1';
export const testSpeed = (): number => {
  const p = new URLSearchParams(window.location.search);
  return p.get('test') === '1' ? Math.max(1, Number(p.get('speed') ?? 20)) : 1;
};
