import { ITEM_BY_ID, isLookalikePair } from '../content/content';

export type Mistake =
  'missed_item' | 'extra_item' | 'wrong_amount' | 'wrong_base' | 'lookalike_swap' | 'wrong_order' | 'timeout';

const counts = (seq: readonly string[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const id of seq) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
};

const kindOf = (id: string): string => ITEM_BY_ID.get(id)?.kind ?? 'topping';

/**
 * Classify the first mismatch between built and expected sequences.
 * Precedence is pinned in docs/wonder-prompt.md section 6.4.
 */
export function classifyMismatch(built: readonly string[], expected: readonly string[]): Mistake | null {
  if (built.length === expected.length && built.every((id, i) => id === expected[i])) {
    return null;
  }
  const isPrefix = (short: readonly string[], long: readonly string[]): boolean =>
    short.every((id, i) => id === long[i]);
  if (built.length < expected.length && isPrefix(built, expected)) return 'missed_item';
  if (expected.length < built.length && isPrefix(expected, built)) return 'extra_item';

  let i = 0;
  while (i < Math.min(built.length, expected.length) && built[i] === expected[i]) i++;
  const b = built[i];
  const e = expected[i];
  if (b !== undefined && e !== undefined) {
    if (kindOf(b) !== kindOf(e)) return 'wrong_base';
    if (isLookalikePair(b, e)) return 'lookalike_swap';
    const cb = counts(built);
    const ce = counts(expected);
    if ((cb.get(e) ?? 0) !== (ce.get(e) ?? 0) || (cb.get(b) ?? 0) !== (ce.get(b) ?? 0)) {
      return 'wrong_amount';
    }
    const sameMultiset = cb.size === ce.size && [...ce.entries()].every(([id, n]) => cb.get(id) === n);
    if (sameMultiset) return 'wrong_order';
    if (!expected.slice(i + 1).includes(b) && !expected.slice(0, i).includes(b)) {
      return 'extra_item';
    }
    return 'missed_item';
  }
  return built.length < expected.length ? 'missed_item' : 'extra_item';
}

export const isCorrect = (built: readonly string[], expected: readonly string[]): boolean =>
  classifyMismatch(built, expected) === null;

/** Index (into expected for missed, into built otherwise) of the item to highlight. */
export function firstMismatchIndex(
  built: readonly string[],
  expected: readonly string[],
): { side: 'built' | 'expected'; index: number } | null {
  if (isCorrect(built, expected)) return null;
  let i = 0;
  while (i < Math.min(built.length, expected.length) && built[i] === expected[i]) i++;
  if (i >= built.length) return { side: 'expected', index: i };
  return { side: 'built', index: i };
}
