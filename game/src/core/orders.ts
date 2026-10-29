import {
  DISHES,
  ITEM_BY_ID,
  MONSTERS,
  PREBUILT_BASE,
  TOPPING_TYPES_BY_LEVEL,
  itemsFor,
  lookalikeOf,
  type DishId,
} from '../content/content';
import { makeRng, shuffled, type Rng } from './rng';

export type BrokenChannel = 'speaker' | 'monitor' | 'kiosk';

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

export function generateOrder(level: number, dish: DishId, rng: Rng, monster: string): Order {
  const toppingTypes = TOPPING_TYPES_BY_LEVEL[Math.min(6, Math.max(1, level))] ?? 2;
  const pool = shuffled(
    rng,
    itemsFor(dish, 'topping').map((i) => i.id),
  );
  const chosen = pool.slice(0, toppingTypes);
  const toppings: string[] = [...chosen];
  if (level >= 3 && toppings.length > 0 && rngFloat(rng) < 0.7) {
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
  const trayTarget = level + 3;
  const needed = [...new Set(ticket)];
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

  const broken: BrokenChannel | null =
    level >= 5 ? (['speaker', 'monitor', 'kiosk'] as BrokenChannel[])[Math.floor(rngFloat(rng) * 3)] : null;

  return { dish, monster, expected, ticket, prebuilt, tray, broken };
}

export function generateTryOrders(level: number, seed: number): { orders: Order[]; rngState: number } {
  const rng = makeRng(seed);
  const dishes = shuffled(rng, DISHES);
  const monsters = shuffled(
    rng,
    MONSTERS.map((m) => m.id),
  );
  const orders = dishes.map((dish, i) => generateOrder(level, dish, rng, monsters[i % monsters.length]));
  return { orders, rngState: rng.state };
}
