import type { GameState, TelemetryEntry } from './game';
import { MAX_BANKED, bankedTarget, defaultDimensions, type Dimensions } from './difficulty';
import { SKILL_IDS, defaultMastery, masteryFromTelemetry, type MasteryProfile, type SkillId } from './mastery';

export interface SaveData {
  v: 2;
  /** Frontier: the first uncompleted level. Last success is level - 1. */
  level: number;
  /** Legacy alias of dimensions.time, kept for older tooling/tests. */
  paceStep: number;
  mastery: MasteryProfile;
  dimensions: Dimensions;
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
  levelProgress: number;
}

export const frontierLevel = (save: Pick<SaveData, 'level'>): number => Math.min(6, Math.max(1, save.level));
export const lastSuccessLevel = (save: Pick<SaveData, 'level'>): number => Math.max(0, frontierLevel(save) - 1);
export const warmupLevelFor = (save: Pick<SaveData, 'level'>): number => Math.max(1, frontierLevel(save) - 1);

export const defaultSave = (): SaveData => ({
  v: 2,
  level: 1,
  paceStep: 0,
  mastery: defaultMastery(),
  dimensions: defaultDimensions(1, 0),
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
  levelProgress: 0,
});

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseMastery(raw: unknown): MasteryProfile | null {
  if (!isRecord(raw) || !isRecord(raw.skills) || !isRecord(raw.fluency)) return null;
  if (!isFiniteNum(raw.fluency.mastery) || !isFiniteNum(raw.fluency.n)) return null;
  const skills = {} as Record<SkillId, { mastery: number; n: number }>;
  for (const id of SKILL_IDS) {
    const e = raw.skills[id];
    if (!isRecord(e) || !isFiniteNum(e.mastery) || !isFiniteNum(e.n)) return null;
    skills[id] = { mastery: Math.min(0.97, Math.max(0.05, e.mastery)), n: Math.max(0, Math.floor(e.n)) };
  }
  return {
    skills,
    fluency: {
      mastery: Math.min(0.97, Math.max(0.05, raw.fluency.mastery)),
      n: Math.max(0, Math.floor(raw.fluency.n)),
    },
  };
}

function parseDimensions(raw: unknown): Dimensions | null {
  if (!isRecord(raw)) return null;
  const keys = ['encode', 'time', 'memory', 'search', 'complexity'] as const;
  for (const k of keys) if (!isFiniteNum(raw[k])) return null;
  return {
    encode: raw.encode as number,
    time: raw.time as number,
    memory: raw.memory as number,
    search: raw.search as number,
    complexity: raw.complexity as number,
  };
}

/** Migrate any older/partial raw value to SaveData v2. Unknown fields are dropped. */
export function migrateSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (!isRecord(raw)) return base;
  const r = raw;
  const level = typeof r.level === 'number' ? Math.min(6, Math.max(1, r.level)) : base.level;
  const paceStep = typeof r.paceStep === 'number' ? Math.min(9, Math.max(0, r.paceStep)) : base.paceStep;
  const telemetry: TelemetryEntry[] = Array.isArray(r.telemetry) ? (r.telemetry as TelemetryEntry[]).slice(-200) : [];
  return {
    v: 2,
    level,
    paceStep,
    mastery: parseMastery(r.mastery) ?? masteryFromTelemetry(telemetry),
    dimensions: parseDimensions(r.dimensions) ?? defaultDimensions(level, paceStep),
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
    telemetry,
    power: r.power === 'off' ? 'off' : 'on',
    freshStartPending: r.freshStartPending === true,
    levelProgress:
      typeof r.levelProgress === 'number'
        ? Math.min(MAX_BANKED - 1, Math.max(0, Math.floor(r.levelProgress)))
        : base.levelProgress,
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
  const target = bankedTarget(state.level);
  const completedLevel = state.starsTry >= target && !state.warmup ? state.level + 1 : state.savedLevel;
  // Bank correct rounds toward the frontier level. Warm-up rounds and the
  // level-result moment itself do not move the bank.
  const levelProgress =
    state.phase === 'title'
      ? prev.levelProgress
      : state.phase === 'levelResult' || state.phase === 'bossEnding' || state.phase === 'closed'
        ? 0
        : !state.warmup && state.level === state.savedLevel
          ? Math.min(target - 1, state.starsTry)
          : prev.levelProgress;
  return {
    ...prev,
    v: 2,
    level: state.bossBeaten ? 6 : Math.min(6, Math.max(prev.level, completedLevel)),
    paceStep: state.paceStep,
    mastery: state.mastery,
    dimensions: state.dimensions,
    bossBeaten: state.bossBeaten,
    starsByLevel: state.starsByLevel,
    tutorialsSeen: state.tutorialsSeen,
    gagSeen: state.gagSeen,
    telemetry: state.telemetry,
    power: state.power,
    freshStartPending: state.power === 'off',
    levelProgress,
  };
}
