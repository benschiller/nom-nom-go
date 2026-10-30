import { bankedTarget } from './difficulty';
import { currentOrder, type GameState } from './game';

export interface MirrorView {
  v: 1;
  phase: GameState['phase'];
  level: number;
  orderIndex: number;
  starsTry: number;
  bankedTarget: number;
  peeksUsed: number;
  peekBudget: number;
  dish: string | null;
  monster: string | null;
  ticket: string[];
  built: string[];
  tray: string[];
  broken: string | null;
  patienceFraction: number;
  resultKind: string | null;
  mistake: string | null;
  streak: boolean;
  bossBeaten: boolean;
}

/** Whitelist projection for Dad's Window. Never includes save, telemetry, or pairing data. */
export function toMirror(state: GameState): MirrorView {
  const order = currentOrder(state);
  return {
    v: 1,
    phase: state.phase,
    level: state.level,
    orderIndex: state.orderIndex,
    starsTry: state.starsTry,
    bankedTarget: bankedTarget(state.level),
    peeksUsed: state.peeksUsed,
    peekBudget: state.peekBudget,
    dish: order?.dish ?? null,
    monster: order?.monster ?? null,
    ticket: order?.ticket ?? [],
    built: [...state.built],
    tray: order?.tray ?? [],
    broken: order?.broken ?? null,
    patienceFraction: state.patienceTotalMs > 0 ? Math.max(0, state.patienceLeftMs / state.patienceTotalMs) : 1,
    resultKind: state.result?.kind ?? null,
    mistake: state.result?.mistake ?? null,
    streak: state.streak,
    bossBeaten: state.bossBeaten,
  };
}

export const parseMirror = (raw: unknown): MirrorView | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.phase !== 'string') return null;
  return raw as MirrorView;
};
