import { lookalikeOf } from '../content/content';
import type { Mistake } from './compare';

export type SkillId = 'base' | 'discrimination' | 'quantity' | 'sequence' | 'recall';

export const SKILL_IDS: SkillId[] = ['base', 'discrimination', 'quantity', 'sequence', 'recall'];

export const SKILL_LABELS: Record<SkillId, string> = {
  base: 'Building the base',
  discrimination: 'Telling look-alikes apart',
  quantity: 'Amounts & doubles',
  sequence: 'Right order',
  recall: 'Remembering the order',
};

export interface MasteryEntry {
  mastery: number;
  n: number;
}

export interface MasteryProfile {
  skills: Record<SkillId, MasteryEntry>;
  /** Performance (speed vs patience), tracked separately from knowledge. */
  fluency: MasteryEntry;
}

/** Structural view of an order, so this module stays free of orders.ts imports. */
export interface OrderLike {
  ticket: readonly string[];
  tray: readonly string[];
  broken: string | null;
}

const PRIOR = 0.45;
const clampMastery = (v: number): number => Math.min(0.97, Math.max(0.05, v));

export const defaultMastery = (): MasteryProfile => ({
  skills: {
    base: { mastery: PRIOR, n: 0 },
    discrimination: { mastery: PRIOR, n: 0 },
    quantity: { mastery: PRIOR, n: 0 },
    sequence: { mastery: PRIOR, n: 0 },
    recall: { mastery: PRIOR, n: 0 },
  },
  fluency: { mastery: 0.5, n: 0 },
});

const hasDouble = (ticket: readonly string[]): boolean => ticket.some((id, i) => i > 0 && ticket[i - 1] === id);

const trayHasLookalike = (o: OrderLike): boolean =>
  o.ticket.some((id) => {
    const look = lookalikeOf(id);
    return look !== undefined && o.tray.includes(look);
  });

/** Skills an order actually exercises at a level. */
export function practicedSkills(level: number, o: OrderLike): SkillId[] {
  const out: SkillId[] = ['sequence', 'recall'];
  if (level >= 2) out.push('base');
  if (level >= 3 || hasDouble(o.ticket)) out.push('quantity');
  if (level >= 4 && trayHasLookalike(o)) out.push('discrimination');
  return out;
}

export const implicatedSkill = (mistake: Mistake | null): SkillId | null => {
  switch (mistake) {
    case 'wrong_base':
      return 'base';
    case 'lookalike_swap':
      return 'discrimination';
    case 'wrong_amount':
      return 'quantity';
    case 'wrong_order':
      return 'sequence';
    case 'missed_item':
    case 'extra_item':
    case 'timeout':
      return 'recall';
    default:
      return null;
  }
};

const alphaFor = (n: number): number => Math.min(0.34, Math.max(0.09, 0.34 / (1 + n * 0.12)));

function updated(entry: MasteryEntry, outcome: number): MasteryEntry {
  const delta = alphaFor(entry.n) * (outcome - entry.mastery);
  const clamped = Math.min(0.2, Math.max(-0.2, delta));
  return { mastery: clampMastery(entry.mastery + clamped), n: entry.n + 1 };
}

export interface MasteryObservation {
  level: number;
  order: OrderLike;
  correct: boolean;
  mistake: Mistake | null;
  fast: boolean;
  hintsUsed: number;
  peeksUsed: number;
}

/**
 * BKT-lite update: correct serves credit every practiced skill (discounted
 * for recall when heavy support was used); a miss debits only the implicated
 * skill, so one error never masquerades as weakness everywhere.
 */
export function updateMastery(profile: MasteryProfile, obs: MasteryObservation): MasteryProfile {
  const skills = { ...profile.skills };
  if (obs.correct) {
    for (const skill of practicedSkills(obs.level, obs.order)) {
      const supported = skill === 'recall' && (obs.hintsUsed > 0 || obs.peeksUsed >= 2);
      skills[skill] = updated(skills[skill], supported ? 0.7 : 1);
    }
  } else {
    const hit = implicatedSkill(obs.mistake);
    if (hit && practicedSkills(obs.level, obs.order).includes(hit)) skills[hit] = updated(skills[hit], 0);
    else if (hit) skills[hit] = updated(skills[hit], 0);
  }
  const fluency = obs.correct ? updated(profile.fluency, obs.fast ? 1 : 0.6) : updated(profile.fluency, 0);
  return { skills, fluency };
}

/** Shrinkage toward the prior while evidence is thin. */
export const shrunkMastery = (e: MasteryEntry): number => (e.mastery * e.n + PRIOR * 2) / (e.n + 2);

export function weakestSkill(profile: MasteryProfile, candidates: readonly SkillId[]): SkillId | null {
  let best: SkillId | null = null;
  let bestScore = Infinity;
  for (const id of candidates) {
    const score = shrunkMastery(profile.skills[id]);
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** Mild forgetting between sessions: pull toward the prior, keep the evidence count. */
export function decayMastery(profile: MasteryProfile, retain = 0.9): MasteryProfile {
  const pull = (e: MasteryEntry): MasteryEntry => ({
    mastery: clampMastery(PRIOR + (e.mastery - PRIOR) * retain),
    n: e.n,
  });
  return {
    skills: {
      base: pull(profile.skills.base),
      discrimination: pull(profile.skills.discrimination),
      quantity: pull(profile.skills.quantity),
      sequence: pull(profile.skills.sequence),
      recall: pull(profile.skills.recall),
    },
    fluency: { mastery: clampMastery(0.5 + (profile.fluency.mastery - 0.5) * retain), n: profile.fluency.n },
  };
}

export interface TelemetryLike {
  level: number;
  correct: boolean;
  mistake: Mistake | null;
  broken: string | null;
  hintsUsed: number;
}

/** Seed a profile from legacy telemetry (v1 saves) using level-based practice rules. */
export function masteryFromTelemetry(entries: readonly TelemetryLike[]): MasteryProfile {
  let profile = defaultMastery();
  for (const t of entries) {
    const practiced: SkillId[] = ['sequence', 'recall'];
    if (t.level >= 2) practiced.push('base');
    if (t.level >= 3) practiced.push('quantity');
    if (t.level >= 4) practiced.push('discrimination');
    const skills = { ...profile.skills };
    if (t.correct) {
      for (const s of practiced) skills[s] = updated(skills[s], t.hintsUsed > 0 && s === 'recall' ? 0.7 : 1);
    } else {
      const hit = implicatedSkill(t.mistake);
      if (hit) skills[hit] = updated(skills[hit], 0);
    }
    profile = { skills, fluency: t.correct ? updated(profile.fluency, 0.6) : updated(profile.fluency, 0) };
  }
  return profile;
}

export interface GenerationHints {
  practiceSkill: SkillId | null;
  /** Probability of doubling a topping (Level 3+). */
  doubleProb: number;
  /** -1 eases topping-type count within the level band, 0 keeps curriculum. */
  toppingDelta: number;
}

export function generationHints(profile: MasteryProfile, level: number): GenerationHints {
  const candidates: SkillId[] = ['sequence', 'recall'];
  if (level >= 2) candidates.push('base');
  if (level >= 3) candidates.push('quantity');
  if (level >= 4) candidates.push('discrimination');
  const practice = weakestSkill(profile, candidates);
  const quantity = shrunkMastery(profile.skills.quantity);
  const doubleProb = practice === 'quantity' ? 0.4 : quantity > 0.7 ? 0.85 : 0.7;
  const weakSequencing = shrunkMastery(profile.skills.sequence) < 0.35 || shrunkMastery(profile.skills.quantity) < 0.35;
  return { practiceSkill: practice, doubleProb, toppingDelta: weakSequencing && level > 1 ? -1 : 0 };
}
