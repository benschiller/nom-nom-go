/** Seeded RNG (mulberry32). State is a single number carried in game state. */
export interface Rng {
  state: number;
}

export const makeRng = (seed: number): Rng => ({ state: seed >>> 0 });

export const nextFloat = (rng: Rng): number => {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const nextInt = (rng: Rng, maxExclusive: number): number => Math.floor(nextFloat(rng) * maxExclusive);

export const pick = <T>(rng: Rng, arr: readonly T[]): T => arr[nextInt(rng, arr.length)];

export const shuffled = <T>(rng: Rng, arr: readonly T[]): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
