import { describe, expect, it } from 'vitest';
import { calloutClipIds, itemClipIds } from './audio';

describe('call-out grammar', () => {
  it('says a doubled item once, announced as double', () => {
    expect(calloutClipIds(['cheese', 'pickles', 'pickles'])).toEqual([
      'phrase.order_up',
      'ing.cheese',
      'phrase.and',
      'amount.double',
      'ing.pickles',
    ]);
    expect(calloutClipIds(['pickles', 'pickles', 'cheese'])).toEqual([
      'phrase.order_up',
      'amount.double',
      'ing.pickles',
      'phrase.and',
      'ing.cheese',
    ]);
  });

  it('speaks each kiosk item only when its run first appears', () => {
    const ticket = ['cheese', 'pickles', 'pickles'];
    expect(itemClipIds(ticket, 0)).toEqual(['phrase.order_up', 'ing.cheese']);
    expect(itemClipIds(ticket, 1)).toEqual(['phrase.and', 'amount.double', 'ing.pickles']);
    expect(itemClipIds(ticket, 2)).toEqual([]);
  });
});
