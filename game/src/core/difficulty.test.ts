import { describe, expect, it } from 'vitest';
import { orderingMsForDims, type Dimensions } from './difficulty';

const dims = (encode: number): Dimensions => ({
  encode,
  memory: 0,
  time: 0,
  search: 0,
  complexity: 0,
});

describe('ordering preview pace', () => {
  it('never reveals faster than ~1050ms per item, whatever the mastery', () => {
    for (let encode = 0; encode <= 12; encode++) {
      expect(orderingMsForDims(dims(encode))).toBeGreaterThanOrEqual(1050);
    }
  });

  it('starts slower for beginners and settles at the floor', () => {
    expect(orderingMsForDims(dims(0))).toBe(1500);
    expect(orderingMsForDims(dims(3))).toBeLessThan(1500);
    expect(orderingMsForDims(dims(3))).toBeGreaterThan(1050);
    expect(orderingMsForDims(dims(12))).toBe(1050);
  });
});
