export type DishId = 'burger' | 'pizza' | 'sundae';
export type ItemKind = 'base' | 'topping';

export interface Item {
  id: string;
  dish: DishId;
  kind: ItemKind;
  /** Parent-facing name, used for Dad's clip text and the recording script. Never shown to the child. */
  clipText: string;
  emoji: string;
  shape: 'round' | 'flat-round' | 'triangle' | 'blob' | 'cup' | 'drizzle' | 'ring' | 'leaf';
  color: string;
  texture: 'smooth' | 'chunky' | 'speckled' | 'striped' | 'fluffy';
  lookalikeOf?: string;
}

const pair = (a: Omit<Item, 'lookalikeOf'>, b: Omit<Item, 'lookalikeOf'>): Item[] => [
  { ...a, lookalikeOf: b.id },
  { ...b, lookalikeOf: a.id },
];

export const ITEMS: Item[] = [
  // Burger
  {
    id: 'patty',
    dish: 'burger',
    kind: 'base',
    clipText: 'patty',
    emoji: '🟤',
    shape: 'flat-round',
    color: '#8a5a33',
    texture: 'speckled',
  },
  ...pair(
    {
      id: 'tomato',
      dish: 'burger',
      kind: 'topping',
      clipText: 'tomato slice',
      emoji: '🍅',
      shape: 'flat-round',
      color: '#e2483d',
      texture: 'smooth',
    },
    {
      id: 'pineapple',
      dish: 'burger',
      kind: 'topping',
      clipText: 'pineapple slice',
      emoji: '🍍',
      shape: 'flat-round',
      color: '#f2c230',
      texture: 'striped',
    },
  ),
  ...pair(
    {
      id: 'lettuce',
      dish: 'burger',
      kind: 'topping',
      clipText: 'lettuce',
      emoji: '🥬',
      shape: 'leaf',
      color: '#69b84d',
      texture: 'striped',
    },
    {
      id: 'avocado',
      dish: 'burger',
      kind: 'topping',
      clipText: 'avocado',
      emoji: '🥑',
      shape: 'blob',
      color: '#4d8f3a',
      texture: 'smooth',
    },
  ),
  ...pair(
    {
      id: 'ketchup',
      dish: 'burger',
      kind: 'topping',
      clipText: 'ketchup',
      emoji: '🫙',
      shape: 'drizzle',
      color: '#d42b1e',
      texture: 'smooth',
    },
    {
      id: 'salsa',
      dish: 'burger',
      kind: 'topping',
      clipText: 'salsa',
      emoji: '🥣',
      shape: 'drizzle',
      color: '#c93a22',
      texture: 'chunky',
    },
  ),
  {
    id: 'cheese',
    dish: 'burger',
    kind: 'topping',
    clipText: 'cheese',
    emoji: '🧀',
    shape: 'triangle',
    color: '#f7b731',
    texture: 'smooth',
  },
  {
    id: 'pickles',
    dish: 'burger',
    kind: 'topping',
    clipText: 'pickles',
    emoji: '🥒',
    shape: 'flat-round',
    color: '#3e7d32',
    texture: 'speckled',
  },
  {
    id: 'onionRings',
    dish: 'burger',
    kind: 'topping',
    clipText: 'onion rings',
    emoji: '⭕',
    shape: 'ring',
    color: '#f3e3c3',
    texture: 'smooth',
  },
  {
    id: 'crispyOnions',
    dish: 'burger',
    kind: 'topping',
    clipText: 'crispy onions',
    emoji: '🧅',
    shape: 'ring',
    color: '#d99a4e',
    texture: 'speckled',
  },

  // Pizza
  {
    id: 'crust.thin',
    dish: 'pizza',
    kind: 'base',
    clipText: 'thin crust',
    emoji: '🫓',
    shape: 'flat-round',
    color: '#eec27f',
    texture: 'smooth',
  },
  {
    id: 'crust.thick',
    dish: 'pizza',
    kind: 'base',
    clipText: 'thick crust',
    emoji: '🍞',
    shape: 'flat-round',
    color: '#dfa856',
    texture: 'speckled',
  },
  ...pair(
    {
      id: 'sauce.redSmooth',
      dish: 'pizza',
      kind: 'base',
      clipText: 'smooth red sauce',
      emoji: '🍅',
      shape: 'drizzle',
      color: '#d42b1e',
      texture: 'smooth',
    },
    {
      id: 'sauce.redChunky',
      dish: 'pizza',
      kind: 'base',
      clipText: 'chunky red sauce',
      emoji: '🥫',
      shape: 'drizzle',
      color: '#b8321f',
      texture: 'chunky',
    },
  ),
  {
    id: 'sauce.white',
    dish: 'pizza',
    kind: 'base',
    clipText: 'white sauce',
    emoji: '🥛',
    shape: 'drizzle',
    color: '#f6ecd7',
    texture: 'smooth',
  },
  {
    id: 'pepperoni',
    dish: 'pizza',
    kind: 'topping',
    clipText: 'beef pepperoni',
    emoji: '🔴',
    shape: 'flat-round',
    color: '#b03a2e',
    texture: 'speckled',
    lookalikeOf: 'pizzaTomato',
  },
  {
    id: 'pizzaTomato',
    dish: 'pizza',
    kind: 'topping',
    clipText: 'tomato slice',
    emoji: '🍅',
    shape: 'flat-round',
    color: '#e2483d',
    texture: 'smooth',
    lookalikeOf: 'pepperoni',
  },
  ...pair(
    {
      id: 'greenPepper',
      dish: 'pizza',
      kind: 'topping',
      clipText: 'green pepper',
      emoji: '🫑',
      shape: 'ring',
      color: '#2e9e4f',
      texture: 'smooth',
    },
    {
      id: 'basil',
      dish: 'pizza',
      kind: 'topping',
      clipText: 'basil leaf',
      emoji: '🌿',
      shape: 'leaf',
      color: '#1f7a38',
      texture: 'striped',
    },
  ),
  {
    id: 'mushroom',
    dish: 'pizza',
    kind: 'topping',
    clipText: 'mushroom',
    emoji: '🍄',
    shape: 'blob',
    color: '#cbb59a',
    texture: 'smooth',
  },
  {
    id: 'olives',
    dish: 'pizza',
    kind: 'topping',
    clipText: 'olives',
    emoji: '🫒',
    shape: 'ring',
    color: '#3b3b2f',
    texture: 'smooth',
  },
  {
    id: 'turkey',
    dish: 'pizza',
    kind: 'topping',
    clipText: 'turkey slice',
    emoji: '🍗',
    shape: 'flat-round',
    color: '#e8b4a0',
    texture: 'smooth',
  },
  {
    id: 'corn',
    dish: 'pizza',
    kind: 'topping',
    clipText: 'corn',
    emoji: '🌽',
    shape: 'blob',
    color: '#f7d038',
    texture: 'speckled',
  },

  // Sundae
  {
    id: 'cup',
    dish: 'sundae',
    kind: 'base',
    clipText: 'cup',
    emoji: '🥣',
    shape: 'cup',
    color: '#7ec8e3',
    texture: 'striped',
  },
  {
    id: 'cone',
    dish: 'sundae',
    kind: 'base',
    clipText: 'cone',
    emoji: '🍦',
    shape: 'triangle',
    color: '#d99a4e',
    texture: 'striped',
  },
  {
    id: 'scoop.vanilla',
    dish: 'sundae',
    kind: 'base',
    clipText: 'vanilla scoop',
    emoji: '⚪',
    shape: 'round',
    color: '#fdf6e3',
    texture: 'smooth',
  },
  {
    id: 'scoop.chocolate',
    dish: 'sundae',
    kind: 'base',
    clipText: 'chocolate scoop',
    emoji: '🟤',
    shape: 'round',
    color: '#6b4226',
    texture: 'smooth',
  },
  {
    id: 'scoop.strawberry',
    dish: 'sundae',
    kind: 'base',
    clipText: 'strawberry scoop',
    emoji: '🩷',
    shape: 'round',
    color: '#f49ac1',
    texture: 'speckled',
  },
  ...pair(
    {
      id: 'cherry',
      dish: 'sundae',
      kind: 'topping',
      clipText: 'cherry',
      emoji: '🍒',
      shape: 'round',
      color: '#d42b1e',
      texture: 'smooth',
    },
    {
      id: 'grape',
      dish: 'sundae',
      kind: 'topping',
      clipText: 'grape',
      emoji: '🍇',
      shape: 'round',
      color: '#7d3c98',
      texture: 'smooth',
    },
  ),
  ...pair(
    {
      id: 'whippedCream',
      dish: 'sundae',
      kind: 'topping',
      clipText: 'whipped cream',
      emoji: '☁️',
      shape: 'blob',
      color: '#ffffff',
      texture: 'fluffy',
    },
    {
      id: 'marshmallow',
      dish: 'sundae',
      kind: 'topping',
      clipText: 'marshmallow',
      emoji: '⬜',
      shape: 'blob',
      color: '#fdeef4',
      texture: 'smooth',
    },
  ),
  ...pair(
    {
      id: 'chocChips',
      dish: 'sundae',
      kind: 'topping',
      clipText: 'chocolate chips',
      emoji: '🍫',
      shape: 'blob',
      color: '#4a2c14',
      texture: 'speckled',
    },
    {
      id: 'sprinkles',
      dish: 'sundae',
      kind: 'topping',
      clipText: 'sprinkles',
      emoji: '🌈',
      shape: 'blob',
      color: '#ff69b4',
      texture: 'striped',
    },
  ),
  {
    id: 'banana',
    dish: 'sundae',
    kind: 'topping',
    clipText: 'banana slice',
    emoji: '🍌',
    shape: 'flat-round',
    color: '#f9e79f',
    texture: 'smooth',
  },
  {
    id: 'caramel',
    dish: 'sundae',
    kind: 'topping',
    clipText: 'caramel drizzle',
    emoji: '🍯',
    shape: 'drizzle',
    color: '#ca8a2c',
    texture: 'smooth',
  },
];

export const ITEM_BY_ID: ReadonlyMap<string, Item> = new Map(ITEMS.map((i) => [i.id, i]));
export const itemsFor = (dish: DishId, kind: ItemKind): Item[] =>
  ITEMS.filter((i) => i.dish === dish && i.kind === kind);
export const lookalikeOf = (id: string): string | undefined => ITEM_BY_ID.get(id)?.lookalikeOf;
export const isLookalikePair = (a: string, b: string): boolean => lookalikeOf(a) === b || lookalikeOf(b) === a;

/** Level 1 pre-built bases. Never tapped, never on the Level 1 ticket. */
export const PREBUILT_BASE: Record<DishId, string[]> = {
  burger: ['patty'],
  pizza: ['crust.thick', 'sauce.redSmooth'],
  sundae: ['cup', 'scoop.vanilla'],
};

export interface Monster {
  id: string;
  name: string;
  emoji: string;
  pitch: number;
  formant: number;
}

export const MONSTERS: Monster[] = [
  { id: 'gobbler', name: 'Gobbler', emoji: '👾', pitch: 0.7, formant: 300 },
  { id: 'doubleTrouble', name: 'Double-Trouble', emoji: '👹', pitch: 1.1, formant: 700 },
  { id: 'sneezer', name: 'Sneezer', emoji: '👺', pitch: 1.4, formant: 1000 },
  { id: 'fussy', name: 'Fussy', emoji: '🧐', pitch: 1.0, formant: 600 },
  { id: 'speedy', name: 'Speedy', emoji: '😎', pitch: 1.3, formant: 850 },
];

export const DISHES: DishId[] = ['burger', 'pizza', 'sundae'];
export const DISH_EMOJI: Record<DishId, string> = { burger: '🍔', pizza: '🍕', sundae: '🍨' };
export const TOPPING_TYPES_BY_LEVEL: Record<number, number> = { 1: 2, 2: 2, 3: 3, 4: 3, 5: 3, 6: 4 };
