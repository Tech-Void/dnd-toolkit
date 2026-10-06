/**
 * Seeded randomness. Every generator takes a seed so results are reproducible:
 * the same seed + options always yields the same dungeon/loot/hook, which lets
 * a GM share a seed string instead of a file.
 */

export interface Rng {
  readonly seed: string;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  shuffle<T>(items: readonly T[]): T[];
  /** Roll dice notation: "3d6", "2d4+1", "4d6*100", "1d4-1", "12". */
  roll(expr: string): number;
}

/** FNV-1a hash of a string to a 32-bit unsigned int. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Short human-friendly random seed, e.g. "k3f9q2". */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 8);
}

const DICE = /^(\d*)d(\d+)\s*([+-]\s*\d+)?\s*(?:[*x×]\s*(\d+))?$/i;

export function createRng(seed: string | number = randomSeed()): Rng {
  const seedStr = String(seed);
  let a = hashSeed(seedStr);

  // mulberry32
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));

  const rng: Rng = {
    seed: seedStr,
    next,
    int,
    chance: (p) => next() < p,
    pick(items) {
      if (items.length === 0) throw new Error("pick() from empty list");
      return items[Math.floor(next() * items.length)]!;
    },
    weighted(entries) {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let r = next() * total;
      for (const [value, w] of entries) {
        r -= w;
        if (r < 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
    roll(expr) {
      const trimmed = expr.trim();
      if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
      const m = DICE.exec(trimmed);
      if (!m) throw new Error(`Bad dice expression: "${expr}"`);
      const count = m[1] ? Number(m[1]) : 1;
      const sides = Number(m[2]);
      let total = 0;
      for (let i = 0; i < count; i++) total += int(1, sides);
      if (m[3]) total += Number(m[3].replace(/\s/g, ""));
      if (m[4]) total *= Number(m[4]);
      return Math.max(0, total);
    },
  };
  return rng;
}
