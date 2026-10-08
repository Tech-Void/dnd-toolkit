import type { Coins, LootItem, LootResult } from "./loot.ts";

// ---------------------------------------------------------------------------
// Treasure on the map: a pile (a chest, a sack, a body) the party walks up to, maybe has to find
// first, maybe has to unlock or disarm, and loots into the party stash. These are the rules; the
// Foundry side keeps the state on a Region and moves the items.

export type PileKind = "cache" | "body" | "treasure";

export type TrapState = "armed" | "found" | "disarmed" | "sprung";

export interface PileContainer {
  name: string;
  /** Thieves' tools DC; undefined once unlocked (or if it never had a lock). */
  lockDc?: number;
  locked: boolean;
  trap?: { name: string; text: string; dc: number; state: TrapState };
  /** The "chest" is a mimic. */
  mimic: boolean;
}

export interface Pile {
  id: string;
  name: string;
  kind: PileKind;
  /** What's left in it. */
  loot: LootResult;
  /** Not yet found: passive Perception (walking past) or a Search check against `searchDc`. */
  hidden: boolean;
  searchDc?: number;
  container?: PileContainer;
  /** The container has been opened (or there isn't one). */
  open: boolean;
}

export interface PileOptions {
  id: string;
  name?: string;
  kind: PileKind;
  hidden?: boolean;
  searchDc?: number;
}

/** A pile from rolled treasure. Its container (if the loot has a lockable one) starts shut. */
export function makePile(loot: LootResult, o: PileOptions): Pile {
  const c = loot.container;
  // Pouches and belts aren't containers you have to open.
  const real = c && (c.lockDc !== undefined || c.trap);
  let container: PileContainer | undefined;
  if (c && real) {
    const [trapName, ...rest] = (c.trap ?? "").split(". ");
    const mimic = /mimic/i.test(trapName ?? "");
    container = {
      name: c.name,
      lockDc: c.lockDc,
      locked: c.lockDc !== undefined && !mimic,
      trap: c.trap && !mimic ? { name: trapName!, text: rest.join(". "), dc: c.trapDc ?? 15, state: "armed" } : undefined,
      mimic,
    };
  }
  const name = o.name ?? (c ? cap(c.name) : o.kind === "body" ? "Body" : "Loot");
  return { id: o.id, name, kind: o.kind, loot: structuredClone(loot), hidden: !!o.hidden, searchDc: o.searchDc, container, open: !container };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const COIN_ORDER: (keyof Coins)[] = ["pp", "gp", "ep", "sp", "cp"];

export const coinsText = (c: Coins) => COIN_ORDER.filter((k) => (c[k] ?? 0) > 0).map((k) => `${c[k]} ${k}`).join(", ");
export const hasCoins = (c: Coins) => COIN_ORDER.some((k) => (c[k] ?? 0) > 0);

/** "34 gp, 2 sp, Potion of healing, 2× Wolf pelt". */
export function lootLine(l: Pick<LootResult, "coins" | "items">): string {
  const parts = [coinsText(l.coins), ...l.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ${i.name}` : i.name))].filter(Boolean);
  return parts.join(", ") || "nothing";
}

export const pileEmpty = (p: Pile) => !hasCoins(p.loot.coins) && !p.loot.items.length;

const noCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

/** Parts still on a body need a harvest check; everything else can just be taken. */
export const needsHarvest = (i: LootItem) => i.kind === "part" && !!i.harvest;

/**
 * Take items (by index) and optionally the coins. Parts that need harvesting are skipped (use
 * `harvest`). Returns what was taken and the pile after.
 */
export function takeFromPile(p: Pile, picks: readonly number[] | "all", coins: boolean): { taken: Pick<LootResult, "coins" | "items">; pile: Pile } {
  if (!p.open || p.hidden) return { taken: { coins: noCoins(), items: [] }, pile: p };
  const want = new Set(picks === "all" ? p.loot.items.map((_, i) => i) : picks);
  const items: LootItem[] = [];
  const left: LootItem[] = [];
  p.loot.items.forEach((item, i) => (want.has(i) && !needsHarvest(item) ? items : left).push(item));
  const taken = { coins: coins ? { ...noCoins(), ...p.loot.coins } : noCoins(), items };
  const loot = { ...p.loot, items: left, coins: coins ? noCoins() : p.loot.coins };
  return { taken, pile: { ...p, loot } };
}

/** Try to harvest a part: on a success it's taken, on a failure it's ruined. Either way it leaves the pile. */
export function harvest(p: Pile, index: number, total: number): { ok: boolean; item?: LootItem; pile: Pile } {
  const item = p.loot.items[index];
  if (!item?.harvest || !p.open) return { ok: false, pile: p };
  const ok = total >= item.harvest.dc;
  const pile = { ...p, loot: { ...p.loot, items: p.loot.items.filter((_, i) => i !== index) } };
  return { ok, item: ok ? { ...item, harvest: undefined, note: item.note?.replace(/^Harvest:[^.]*\.\s*/, "") } : undefined, pile };
}

// --- Containers ----------------------------------------------------------------------------------

export type ContainerAttempt = "open" | "pick" | "force" | "inspect" | "disarm";

/** What a character can try on a pile's container right now. */
export function containerChoices(p: Pile): ContainerAttempt[] {
  const c = p.container;
  if (!c || p.open) return [];
  const out: ContainerAttempt[] = [];
  if (c.locked) out.push("pick", "force");
  else out.push("open");
  if (c.mimic || !c.trap || c.trap.state === "armed") out.push("inspect");
  if (c.trap?.state === "found") out.push("disarm");
  return out;
}

export type ContainerOutcome = "opened" | "unlocked" | "stillLocked" | "sprung" | "trapFound" | "nothingFound" | "disarmed" | "mimic" | "mimicFound";

export interface ContainerResult {
  pile: Pile;
  outcome: ContainerOutcome;
  /** The trap went off (on top of the outcome). */
  sprung?: boolean;
  /** Failed by 5 or more: loud. */
  noisy?: boolean;
  /** One line for chat. */
  text: string;
}

/** Forcing a lock is harder than picking it. */
export const FORCE_DC_BONUS = 2;

/**
 * Resolve an attempt on a container with the roll's total (not needed to just open it):
 * - open: springs an armed or found trap; a mimic bites.
 * - pick (thieves' tools) unlocks; force (Athletics, DC +2) unlocks and opens it, springing any trap.
 * - inspect (Investigation) finds the trap, or sees the mimic for what it is.
 * - disarm (thieves' tools) makes a found trap safe; failing by 5 sets it off.
 */
export function tryContainer(p: Pile, attempt: ContainerAttempt, total = 0): ContainerResult {
  const c = p.container;
  if (!c || p.open) return { pile: p, outcome: "opened", text: "It's already open." };
  const next = (patch: Partial<PileContainer>, open = p.open): Pile => ({ ...p, open, container: { ...c, ...patch } });
  const spring = (pl: Pile): Pile => (pl.container?.trap ? { ...pl, container: { ...pl.container, trap: { ...pl.container.trap, state: "sprung" } } } : pl);
  const armed = c.trap && (c.trap.state === "armed" || c.trap.state === "found");
  switch (attempt) {
    case "open": {
      if (c.mimic) return { pile: p, outcome: "mimic", text: `The ${c.name} opens a mouth full of teeth. It's a mimic!` };
      if (c.locked) return { pile: p, outcome: "stillLocked", text: `The ${c.name} is locked.` };
      if (armed) return { pile: spring(next({}, true)), outcome: "sprung", sprung: true, text: `Click. ${c.trap!.name}!` };
      return { pile: next({}, true), outcome: "opened", text: `The ${c.name} opens.` };
    }
    case "pick": {
      if (c.mimic) return { pile: p, outcome: "mimic", text: `The lock squirms under the picks. It's a mimic!` };
      const dc = c.lockDc ?? 10;
      if (total >= dc) return { pile: next({ locked: false }), outcome: "unlocked", text: `picks the lock (${total} vs DC ${dc}). It clicks open.` };
      return { pile: p, outcome: "stillLocked", noisy: dc - total >= 5, text: `can't pick the lock (${total} vs DC ${dc}).` };
    }
    case "force": {
      if (c.mimic) return { pile: p, outcome: "mimic", text: `The ${c.name} bites back. It's a mimic!` };
      const dc = (c.lockDc ?? 10) + FORCE_DC_BONUS;
      if (total < dc) return { pile: p, outcome: "stillLocked", noisy: true, text: `heaves at the lid, but it holds (${total} vs DC ${dc}).` };
      const opened = next({ locked: false }, true);
      if (armed) return { pile: spring(opened), outcome: "sprung", sprung: true, text: `wrenches the ${c.name} open (${total} vs DC ${dc}). Click. ${c.trap!.name}!` };
      return { pile: opened, outcome: "opened", text: `wrenches the ${c.name} open (${total} vs DC ${dc}).` };
    }
    case "inspect": {
      if (c.mimic) return total >= 15
        ? { pile: p, outcome: "mimicFound", text: `looks closer: the wood is too warm, and it's breathing. A mimic.` }
        : { pile: p, outcome: "nothingFound", text: `checks the ${c.name} and finds nothing odd.` };
      if (c.trap && c.trap.state === "armed" && total >= c.trap.dc) return { pile: next({ trap: { ...c.trap, state: "found" } }), outcome: "trapFound", text: `finds a trap: ${c.trap.name}.` };
      return { pile: p, outcome: "nothingFound", text: `checks the ${c.name} and finds nothing odd.` };
    }
    case "disarm": {
      if (!c.trap || c.trap.state !== "found") return { pile: p, outcome: "nothingFound", text: "There's nothing to disarm." };
      if (total >= c.trap.dc) return { pile: next({ trap: { ...c.trap, state: "disarmed" } }), outcome: "disarmed", text: `disarms the ${c.trap.name.toLowerCase()} (${total} vs DC ${c.trap.dc}).` };
      if (c.trap.dc - total >= 5) return { pile: spring(next({})), outcome: "sprung", sprung: true, text: `slips while disarming it (${total} vs DC ${c.trap.dc}). Click. ${c.trap.name}!` };
      return { pile: p, outcome: "nothingFound", text: `can't disarm it yet (${total} vs DC ${c.trap.dc}).` };
    }
  }
}

/** The save and damage in a container trap's text, for one-click rolls. */
export function trapRolls(text: string): { save?: { ability: string; dc: number }; damage?: { formula: string; type: string }; attack?: number } {
  const ab: Record<string, string> = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };
  const s = /DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) save/i.exec(text);
  const d = /(\d+d\d+(?:\s*[+-]\s*\d+)?) (\w+) damage/i.exec(text);
  const a = /\+(\d+) to hit/i.exec(text);
  return {
    save: s ? { ability: ab[s[2]!.toLowerCase()]!, dc: Number(s[1]) } : undefined,
    damage: d ? { formula: d[1]!.replace(/\s+/g, ""), type: d[2]!.toLowerCase() } : undefined,
    attack: a ? Number(a[1]) : undefined,
  };
}

/** Does a search with this total find the pile? */
export const searchFinds = (p: Pile, total: number) => p.hidden && total >= (p.searchDc ?? 10);
