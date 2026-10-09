import type { Coins } from "./loot.ts";
import { xpBudget, xpForCr } from "./encounter.ts";

// ---------------------------------------------------------------------------
// Rewards: XP for a fight or a quest, who levels up, and what a session added up to.

/** XP needed to reach each level (index = level). */
export const LEVEL_XP = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

export const levelForXp = (xp: number) => {
  let l = 1;
  while (l < 20 && xp >= LEVEL_XP[l + 1]!) l++;
  return l;
};

/** XP for the creatures beaten in a fight (by CR, or their own XP if known). */
export function fightXp(foes: readonly { cr?: number; xp?: number }[]): number {
  return foes.reduce((n, f) => n + (f.xp ?? (f.cr !== undefined ? xpForCr(f.cr) : 0)), 0);
}

/** An even share, rounded down. */
export const xpShare = (total: number, people: number) => (people > 0 ? Math.floor(total / people) : 0);

/** A fair quest reward in XP for the whole party: about a moderate fight's worth, more for big quests. */
export function questXp(partyLevel: number, partySize: number, size: "small" | "normal" | "major" = "normal"): number {
  const base = xpBudget(partyLevel, partySize, "moderate");
  return Math.round((base * { small: 0.5, normal: 1, major: 2 }[size]) / 10) * 10;
}

/** Characters that just crossed a level line. */
export function levelUps(before: readonly { name: string; xp: number; level: number }[], gained: number): { name: string; to: number }[] {
  return before.map((c) => ({ name: c.name, to: levelForXp(c.xp + gained) })).filter((c, i) => c.to > before[i]!.level);
}

/** Coins named in a reward line: "100 gp and a favor" → { gp: 100 }. */
export function rewardCoins(text: string): Partial<Coins> {
  const out: Partial<Coins> = {};
  for (const m of text.matchAll(/(\d[\d,]*)\s*(cp|sp|ep|gp|pp)\b/gi)) {
    const k = m[2]!.toLowerCase() as keyof Coins;
    out[k] = (out[k] ?? 0) + Number(m[1]!.replace(/,/g, ""));
  }
  return out;
}

// --- Session recap ------------------------------------------------------------------------------

export type SessionEventKind = "xp" | "loot" | "quest" | "level" | "fight" | "note";

export interface SessionEvent {
  kind: SessionEventKind;
  text: string;
  /** XP awarded per character (xp events). */
  xp?: number;
  /** Gold-piece value (loot events). */
  gp?: number;
}

export interface SessionRecap {
  number: number;
  xpEach: number;
  lootGp: number;
  sections: { title: string; lines: string[] }[];
}

const TITLES: Record<SessionEventKind, string> = { fight: "Fights", xp: "Experience", level: "Level ups", loot: "Treasure", quest: "Quests", note: "Notes" };

/** What happened this session, grouped, with the XP each and the treasure's value totalled. */
export function sessionRecap(n: number, events: readonly SessionEvent[], campaignLines: readonly string[] = []): SessionRecap {
  const order: SessionEventKind[] = ["fight", "xp", "level", "loot", "quest", "note"];
  const sections = order.map((k) => ({ title: TITLES[k], lines: events.filter((e) => e.kind === k).map((e) => e.text) })).filter((s) => s.lines.length);
  if (campaignLines.length) sections.push({ title: "In the world", lines: [...campaignLines] });
  return {
    number: n,
    xpEach: events.reduce((t, e) => t + (e.xp ?? 0), 0),
    lootGp: Math.round(events.reduce((t, e) => t + (e.gp ?? 0), 0)),
    sections,
  };
}
