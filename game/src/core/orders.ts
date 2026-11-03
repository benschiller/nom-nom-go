import {
  ACTIVE_DISHES,
  ITEM_BY_ID,
  MONSTERS,
  PREBUILT_BASE,
  TOPPING_TYPES_BY_LEVEL,
  itemsFor,
  lookalikeOf,
  type DishId,
} from '../content/content';
import { makeRng, shuffled, type Rng } from './rng';

/** After the one-screen merge only the speaker can break: the kiosk
 * screen (snow) is gone and the printer/monitor gag was retired Oct 30. */
export type BrokenChannel = 'speaker';

export interface Order {
  dish: DishId;
  monster: string;
  /** Full sequence judged at serve (includes pre-built base). */
  expected: string[];
  /** What the ticket and call-out show: toppings only on Level 1, full tappable sequence after. */
  ticket: string[];
  /** Base items the dish starts with (Level 1 only). */
  prebuilt: string[];
  tray: string[];
  broken: BrokenChannel | null;
}

const baseSequence = (rng: Rng, dish: DishId, level: number): string[] => {
  if (level <= 1) return [];
  switch (dish) {
    case 'burger': {
      const patties = 1 + Math.floor(rngFloat(rng) * 2);
      return Array.from({ length: patties }, () => 'patty');
    }
    case 'pizza': {
      const crust = rngFloat(rng) < 0.5 ? 'crust.thin' : 'crust.thick';
      const sauces =
        level >= 4 ? ['sauce.redSmooth', 'sauce.redChunky', 'sauce.white'] : ['sauce.redSmooth', 'sauce.white'];
      return [crust, sauces[Math.floor(rngFloat(rng) * sauces.length)]];
    }
    case 'sundae': {
      const container = rngFloat(rng) < 0.5 ? 'cup' : 'cone';
      const flavours = ['scoop.vanilla', 'scoop.chocolate', 'scoop.strawberry'];
      const flavour = flavours[Math.floor(rngFloat(rng) * flavours.length)];
      const scoops = 1 + Math.floor(rngFloat(rng) * 2);
      return [container, ...Array.from({ length: scoops }, () => flavour)];
    }
  }
};

// Local float helper so orders.ts does not depend on rng internals ordering.
import { nextFloat as rngFloat } from './rng';

export interface GenerateOptions {
  /** Probability of doubling a topping (Level 3+). Default 0.7. */
  doubleProb?: number;
  /** Adjust topping-type count within the level band. Default 0. */
  toppingDelta?: number;
  /** Tray size override from the search dimension. Default level + 3. */
  trayTarget?: number;
}

export function generateOrder(
  level: number,
  dish: DishId,
  rng: Rng,
  monster: string,
  opts: GenerateOptions = {},
): Order {
  const baseTypes = TOPPING_TYPES_BY_LEVEL[Math.min(6, Math.max(1, level))] ?? 2;
  const toppingTypes = Math.min(baseTypes, Math.max(1, baseTypes + (opts.toppingDelta ?? 0)));
  const pool = shuffled(
    rng,
    itemsFor(dish, 'topping').map((i) => i.id),
  );
  const chosen = pool.slice(0, toppingTypes);
  const toppings: string[] = [...chosen];
  if (level >= 3 && toppings.length > 0 && rngFloat(rng) < (opts.doubleProb ?? 0.7)) {
    const idx = Math.floor(rngFloat(rng) * toppings.length);
    toppings.splice(idx + 1, 0, toppings[idx]);
  }
  const base = baseSequence(rng, dish, level);
  const prebuilt = level <= 1 ? [...PREBUILT_BASE[dish]] : [];
  const expected = [...prebuilt, ...base, ...toppings];
  const ticket = level <= 1 ? [...toppings] : [...base, ...toppings];

  // Tray: exactly level + 3 distinct items in every round (Level 1: 4,
  // rising one per level to Level 6: 9). Needed items first, then one wrong
  // base alternative from Level 2, a forced look-alike from Level 4, and
  // distractors to fill. Never depletes.
  const needed = [...new Set(ticket)];
  const trayTarget = Math.max(opts.trayTarget ?? level + 3, needed.length);
  const traySet = new Set<string>(needed);
  if (level >= 2) {
    const wrongBases =
      dish === 'pizza'
        ? [
            'crust.thin',
            'crust.thick',
            ...(level >= 4 ? ['sauce.redSmooth', 'sauce.redChunky'] : []),
            'sauce.white',
          ].filter((id) => !traySet.has(id))
        : dish === 'sundae'
          ? ['cup', 'cone', 'scoop.vanilla', 'scoop.chocolate', 'scoop.strawberry'].filter((id) => !traySet.has(id))
          : [];
    const wrong = shuffled(rng, wrongBases);
    if (wrong.length > 0) traySet.add(wrong[0]);
  }
  if (level >= 4) {
    for (const id of chosen) {
      const look = lookalikeOf(id);
      if (look && ITEM_BY_ID.get(look)?.dish === dish) {
        traySet.add(look);
        break;
      }
    }
  }
  const basePool =
    level <= 1
      ? []
      : dish === 'burger'
        ? ['patty']
        : dish === 'pizza'
          ? ['crust.thin', 'crust.thick', 'sauce.redSmooth', ...(level >= 4 ? ['sauce.redChunky'] : []), 'sauce.white']
          : ['cup', 'cone', 'scoop.vanilla', 'scoop.chocolate', 'scoop.strawberry'];
  const distractors = shuffled(
    rng,
    [...basePool, ...itemsFor(dish, 'topping').map((i) => i.id)].filter((id) => {
      if (traySet.has(id)) return false;
      if (level < 4 && chosen.some((c) => lookalikeOf(c) === id)) return false;
      return true;
    }),
  );
  for (const d of distractors) {
    if (traySet.size >= trayTarget) break;
    traySet.add(d);
  }
  const tray = shuffled(rng, [...traySet]);

  // From Level 5 the speaker is the one broken channel on every order.
  const broken: BrokenChannel | null = level >= 5 ? 'speaker' : null;

  return { dish, monster, expected, ticket, prebuilt, tray, broken };
}

/** Orders dealt per batch (round set) at the kitchen window. */
export const ORDERS_PER_BATCH = 3;

const sameTicket = (a: Order, b: Order): boolean =>
  a.dish === b.dish && a.ticket.length === b.ticket.length && a.ticket.every((id, i) => id === b.ticket[i]);

/** Deal one batch: ORDERS_PER_BATCH orders, each from a different monster,
 *  cycling through the active dishes (one of each when three are active).
 *  Two orders in a row never share an identical ticket. */
export function generateTryOrders(
  level: number,
  seed: number,
  opts: GenerateOptions = {},
  dishes: readonly DishId[] = ACTIVE_DISHES,
): { orders: Order[]; rngState: number } {
  const rng = makeRng(seed);
  const dishOrder = shuffled(rng, [...dishes]);
  const monsters = shuffled(
    rng,
    MONSTERS.map((m) => m.id),
  );
  const orders: Order[] = [];
  for (let i = 0; i < ORDERS_PER_BATCH; i++) {
    const dish = dishOrder[i % dishOrder.length];
    const monster = monsters[i % monsters.length];
    let order = generateOrder(level, dish, rng, monster, opts);
    const prev = orders[i - 1];
    for (let retry = 0; prev && sameTicket(order, prev) && retry < 8; retry++) {
      order = generateOrder(level, dish, rng, monster, opts);
    }
    orders.push(order);
  }
  return { orders, rngState: rng.state };
}
