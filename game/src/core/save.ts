import type { GameState, TelemetryEntry } from './game';

export interface SaveData {
  v: 1;
  level: number;
  paceStep: number;
  bossBeaten: boolean;
  starsByLevel: Record<number, number>;
  tutorialsSeen: string[];
  gagSeen: string[];
  soundOn: boolean;
  lastHiddenAt: number | null;
  kitchenId: string | null;
  dadKitchenId: string | null;
  telemetry: TelemetryEntry[];
  power: 'on' | 'off';
  freshStartPending: boolean;
}

export const defaultSave = (): SaveData => ({
  v: 1,
  level: 1,
  paceStep: 0,
  bossBeaten: false,
  starsByLevel: {},
  tutorialsSeen: [],
  gagSeen: [],
  soundOn: true,
  lastHiddenAt: null,
  kitchenId: null,
  dadKitchenId: null,
  telemetry: [],
  power: 'on',
  freshStartPending: false,
});

/** Migrate any older/partial raw value to SaveData v1. Unknown fields are dropped. */
export function migrateSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  return {
    v: 1,
    level: typeof r.level === 'number' ? Math.min(6, Math.max(1, r.level)) : base.level,
    paceStep: typeof r.paceStep === 'number' ? Math.min(9, Math.max(0, r.paceStep)) : base.paceStep,
    bossBeaten: r.bossBeaten === true,
    starsByLevel:
      typeof r.starsByLevel === 'object' && r.starsByLevel !== null ? (r.starsByLevel as Record<number, number>) : {},
    tutorialsSeen: Array.isArray(r.tutorialsSeen)
      ? r.tutorialsSeen.filter((x): x is string => typeof x === 'string')
      : [],
    gagSeen: Array.isArray(r.gagSeen) ? r.gagSeen.filter((x): x is string => typeof x === 'string') : [],
    soundOn: r.soundOn !== false,
    lastHiddenAt: typeof r.lastHiddenAt === 'number' ? r.lastHiddenAt : null,
    kitchenId: typeof r.kitchenId === 'string' ? r.kitchenId : null,
    dadKitchenId: typeof r.dadKitchenId === 'string' ? r.dadKitchenId : null,
    telemetry: Array.isArray(r.telemetry) ? (r.telemetry as TelemetryEntry[]).slice(-200) : [],
    power: r.power === 'off' ? 'off' : 'on',
    freshStartPending: r.freshStartPending === true,
  };
}

const KEY = 'nom-nom-go-save-v1';

export function loadSave(storage: Pick<Storage, 'getItem'>): SaveData {
  try {
    const raw = storage.getItem(KEY);
    return raw ? migrateSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

export function persistSave(storage: Pick<Storage, 'setItem'>, save: SaveData): void {
  try {
    storage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable (private mode): play continues without saving.
  }
}

/** Project game state + device settings into the save schema. */
export function saveFromState(state: GameState, prev: SaveData): SaveData {
  const completedLevel = state.starsTry === 3 && !state.warmup ? state.level + 1 : state.savedLevel;
  return {
    ...prev,
    v: 1,
    level: state.bossBeaten ? 6 : Math.min(6, Math.max(prev.level, completedLevel)),
    paceStep: state.paceStep,
    bossBeaten: state.bossBeaten,
    starsByLevel: state.starsByLevel,
    tutorialsSeen: state.tutorialsSeen,
    gagSeen: state.gagSeen,
    telemetry: state.telemetry,
    power: state.power,
    freshStartPending: state.power === 'off',
  };
}
