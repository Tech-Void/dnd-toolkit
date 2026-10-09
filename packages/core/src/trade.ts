import type { Coins } from "./loot.ts";
import { roundPrice } from "./shops.ts";

// ---------------------------------------------------------------------------
// Buying and selling: paying from a purse (with change), haggling, and how much a shopkeeper who
// likes (or dislikes) the party shaves off or adds on.

const CP: Record<keyof Coins, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
const ORDER: (keyof Coins)[] = ["cp", "sp", "ep", "gp", "pp"];

export const purseCopper = (c: Partial<Coins>) => ORDER.reduce((n, k) => n + (c[k] ?? 0) * CP[k], 0);

/** Copper as coins, largest first (gp, sp, cp; no platinum or electrum in change). */
export function copperToCoins(cp: number): Coins {
  const n = Math.max(0, Math.round(cp));
  return { pp: 0, gp: Math.floor(n / 100), ep: 0, sp: Math.floor((n % 100) / 10), cp: n % 10 };
}

/**
 * Pay `gp` from a purse: small coins first, then bigger ones, with change back. Null if they
 * can't afford it.
 */
export function payFrom(purse: Coins, gp: number): Coins | null {
  let owe = Math.round(gp * 100);
  if (purseCopper(purse) < owe) return null;
  const left: Coins = { ...purse };
  for (const k of ORDER) {
    if (owe <= 0) break;
    const use = Math.min(left[k], Math.ceil(owe / CP[k]));
    left[k] -= use;
    owe -= use * CP[k];
  }
  // Overpaid: change in gp, sp and cp.
  const change = copperToCoins(-owe);
  for (const k of ORDER) left[k] += change[k];
  return left;
}

/** Add `gp` to a purse as gp, sp and cp. */
export function addToPurse(purse: Coins, gp: number): Coins {
  const add = copperToCoins(gp * 100);
  return { cp: purse.cp + add.cp, sp: purse.sp + add.sp, ep: purse.ep, gp: purse.gp + add.gp, pp: purse.pp };
}

/** A haggle (Persuasion) against the keeper's DC: the change to prices for that customer (−0.1 = 10% off). */
export function haggleModifier(total: number, dc: number): { mod: number; line: string } {
  if (total >= dc + 5) return { mod: -0.15, line: "throws up their hands: \"You'll ruin me!\" (15% off)" };
  if (total >= dc) return { mod: -0.1, line: "grumbles and knocks a tenth off" };
  if (total <= dc - 5) return { mod: 0.1, line: "takes offense, and the prices go up a tenth" };
  return { mod: 0, line: "won't budge on price" };
}

/** A keeper who knows the party: 5% better per point of attitude (−3 hostile … +3 devoted). */
export const attitudeModifier = (attitude: number) => -0.05 * Math.max(-3, Math.min(3, Math.round(attitude)));

/** What a customer pays per unit, with their haggle and the keeper's attitude. */
export const buyPrice = (askingGp: number, mod = 0) => roundPrice(Math.max(0.01, askingGp * (1 + mod)));

/** What the shop pays for something worth `baseGp`; a good haggle (negative mod) pays more. */
export const sellPrice = (baseGp: number, sellModifier: number, mod = 0) => roundPrice(Math.max(0, baseGp * sellModifier * (1 - mod)));
