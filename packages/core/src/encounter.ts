import { createRng, type Rng } from "./rng.ts";
import { generateLoot, type LootResult, type MagicItemPool } from "./loot.ts";
import { SRD_MONSTER_ROWS } from "./data/monsters.ts";

// ---------------------------------------------------------------------------
// Monsters and the catalog

export type Role = "minion" | "brute" | "skirmisher" | "artillery" | "caster" | "controller" | "leader" | "solo";

export interface MonsterEntry {
  /** Stable id: a Foundry UUID when built from compendiums, else a slug. */
  id: string;
  name: string;
  cr: number;
  /** Creature type: humanoid, undead, fiend... */
  type: string;
  tags: string[];
  roles: Role[];
  /** Foundry document UUID, when known. */
  uuid?: string;
  img?: string;
  source?: string;
}

export const CREATURE_TYPES = new Set([
  "aberration", "beast", "celestial", "construct", "dragon", "elemental", "fey", "fiend",
  "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
]);

/** Races a generic "anyrace" NPC statblock can be reskinned as. */
export const RACES = new Set([
  "human", "elf", "drow", "dwarf", "duergar", "halfling", "gnome", "orc", "half-orc", "half-elf",
  "tiefling", "dragonborn", "goblin", "hobgoblin", "bugbear", "kobold", "gnoll", "lizardfolk",
  "aasimar", "goliath", "genasi", "firbolg", "tabaxi", "kenku", "triton", "yuan-ti",
]);

const XP_BY_CR: Record<string, number> = {
  0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900,
  8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000,
  17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000,
  25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000,
};

export const xpForCr = (cr: number) => XP_BY_CR[String(cr)] ?? XP_BY_CR[String(Math.round(cr))] ?? 0;

export function parseCr(cr: string | number): number {
  if (typeof cr === "number") return cr;
  const [n, d] = cr.split("/").map(Number);
  return d ? n! / d : n!;
}

export const crLabel = (cr: number) => ({ 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" })[cr] ?? String(cr);

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const SRD_MONSTERS: MonsterEntry[] = SRD_MONSTER_ROWS.trim().split("\n").map((line) => {
  const [name, cr, type, tags, roles] = line.split("|") as [string, string, string, string, string];
  return {
    id: `srd:${slug(name)}`,
    name,
    cr: parseCr(cr),
    type,
    tags: tags.split(" ").filter(Boolean),
    roles: roles.split(" ").filter(Boolean) as Role[],
    source: "SRD 5.1",
  };
});

/** Tag → number of monsters carrying it; for autocomplete. */
export function tagCounts(catalog: readonly MonsterEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of catalog) {
    for (const t of new Set([m.type, ...m.tags, ...m.roles])) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Tag queries: "humanoid+human, orc -leader"
//   "+" or space = AND, "," "|" "or" = OR between clauses, "-x" or "!x" = exclude.

export interface TagQuery {
  clauses: string[][];
  exclude: string[];
}

const ALIASES: Record<string, string> = {
  men: "human", humen: "human", people: "humanoid", npc: "humanoid", npcs: "humanoid",
  boss: "solo", bosses: "solo", mook: "minion", mooks: "minion", undeads: "undead",
  city: "urban", town: "urban", village: "urban", street: "urban",
  cave: "underdark", caves: "underdark", cavern: "underdark",
  tomb: "crypt", graveyard: "crypt", cemetery: "crypt",
  woods: "forest", jungle: "forest", wood: "forest",
  mountains: "mountain", snow: "arctic", ice: "arctic", tundra: "arctic", frozen: "arctic",
  marsh: "swamp", bog: "swamp", plains: "grassland", plain: "grassland",
  sea: "coast", beach: "coast", ocean: "underwater",
  wizard: "mage", wizards: "mage", soldier: "military", soldiers: "military", army: "military",
  infernal: "devil", demonic: "demon", thieves: "criminal", thief: "criminal",
  dragonkin: "dragon", fae: "fey", faerie: "fey", golems: "golem", halforc: "half-orc", halfelf: "half-elf",
};

export function normalizeTag(raw: string): string {
  const t = raw.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (ALIASES[t]) return ALIASES[t];
  if (CREATURE_TYPES.has(t) || RACES.has(t) || t.length <= 3) return t;
  if (t.endsWith("ies")) return `${t.slice(0, -3)}y`;
  if (t.endsWith("ves")) return `${t.slice(0, -3)}f`;
  if (t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

export function parseTags(query: string): TagQuery {
  const q: TagQuery = { clauses: [], exclude: [] };
  for (const part of query.toLowerCase().split(/[,|;]|\bor\b/)) {
    const clause: string[] = [];
    for (const term of part.split(/[+&\s]+/)) {
      if (!term || term === "and") continue;
      if (term.startsWith("-") || term.startsWith("!")) {
        const t = normalizeTag(term.slice(1));
        if (t) q.exclude.push(t);
      } else {
        const t = normalizeTag(term);
        if (t) clause.push(t);
      }
    }
    if (clause.length) q.clauses.push(clause);
  }
  return q;
}

const termCache = new WeakMap<MonsterEntry, Set<string>>();
function terms(m: MonsterEntry): Set<string> {
  let set = termCache.get(m);
  if (!set) {
    const nameWords = m.name.split(/[^A-Za-z-]+/).filter(Boolean).map(normalizeTag);
    set = new Set([...m.tags.map(normalizeTag), ...m.roles, ...nameWords]);
    termCache.set(m, set);
  }
  return set;
}

/** Creature-type words only match the type ("giant" ≠ Giant Rat); other words match tags, roles or name. */
function has(m: MonsterEntry, t: string): boolean {
  return CREATURE_TYPES.has(t) ? m.type === t : terms(m).has(t);
}

export const isAnyRace = (m: MonsterEntry) => m.tags.includes("anyrace");

/** Statblocks that make odd race stand-ins ("Orc Commoner", "Orc Spy") unless the query asks for them. */
const RESKIN_ONLY_IF_ASKED = ["civilian", "covert"];

/** Can this generic statblock stand in for `race`? */
const canReskin = (m: MonsterEntry, clause: string[], race?: string) =>
  !!race && isAnyRace(m) && RESKIN_ONLY_IF_ASKED.every((t) => !m.tags.includes(t) || clause.includes(t));

/** Does the monster match? `race` lets generic "anyrace" statblocks satisfy that race tag. */
export function matchesQuery(m: MonsterEntry, q: TagQuery, race?: string): boolean {
  if (q.exclude.some((t) => has(m, t))) return false;
  if (q.clauses.length === 0) return true;
  return q.clauses.some((clause) => clause.every((t) => has(m, t) || (t === race && canReskin(m, clause, race))));
}

/**
 * Tags marking an exotic variant: shapechangers, lycanthropes, and hybrids carrying another
 * creature type's tag (Half-Red Dragon Veteran is a humanoid tagged "dragon").
 */
const exoticMarkers = (m: MonsterEntry) =>
  m.tags.filter((t) => t === "shapechanger" || t === "lycanthrope" || (CREATURE_TYPES.has(t) && t !== m.type));

/** Exotic variants are odd picks for "humans" or "urban" unless the query names them (or the monster). */
export function isUnaskedExotic(m: MonsterEntry, q: TagQuery): boolean {
  const markers = exoticMarkers(m);
  if (!markers.length) return false;
  const asked = q.clauses.flat();
  return !asked.some((t) => markers.includes(t) || (!CREATURE_TYPES.has(t) && !RACES.has(t) && m.name.toLowerCase().includes(t)));
}

export const racesIn = (q: TagQuery) => [...new Set(q.clauses.flat().filter((t) => RACES.has(t)))];

// ---------------------------------------------------------------------------
// Budgets (SRD 5.2 XP budget per character; "deadly" is this toolkit's 1.5× high)

export type Difficulty = "low" | "moderate" | "high" | "deadly";
export const DIFFICULTIES: Difficulty[] = ["low", "moderate", "high", "deadly"];

const BUDGET_PER_PC: [number, number, number][] = [
  [50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100],
  [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
  [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800],
  [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000],
];

export function xpBudget(partyLevel: number, partySize: number, difficulty: Difficulty): number {
  const [low, mod, high] = BUDGET_PER_PC[Math.max(1, Math.min(20, Math.round(partyLevel))) - 1]!;
  const per = { low, moderate: mod, high, deadly: Math.round(high * 1.5) }[difficulty];
  return per * Math.max(1, partySize);
}

export function rateEncounter(totalXp: number, partyLevel: number, partySize: number): Difficulty | "trivial" {
  let rating: Difficulty | "trivial" = "trivial";
  // Within 15% of a tier's budget counts as that tier.
  for (const d of DIFFICULTIES) if (totalXp >= xpBudget(partyLevel, partySize, d) * 0.85) rating = d;
  return rating;
}

// ---------------------------------------------------------------------------
// Encounter generation

export type EncounterTemplate = "solo" | "elite" | "leader" | "squad" | "horde";
export const TEMPLATES: Record<EncounterTemplate, string> = {
  solo: "Solo threat",
  elite: "Elite pair",
  leader: "Leader & followers",
  squad: "Mixed squad",
  horde: "Horde",
};

export interface EncounterOptions {
  partyLevel: number;
  partySize?: number;
  difficulty?: Difficulty;
  /** Tag query, e.g. "humanoid+orc" or "undead, fiend -incorporeal". Empty = anything. */
  tags?: string;
  template?: EncounterTemplate | "auto";
  /** Cap on creature count (hordes may go to 1.5×). */
  maxCreatures?: number;
  catalog?: readonly MonsterEntry[];
  /** Roll treasure for the encounter. */
  loot?: boolean;
  magicItems?: MagicItemPool;
  seed?: string | number;
  /** Groups to keep as-is; the rest of the budget and creature cap is filled around them. */
  locked?: readonly EncounterGroup[];
  /** Race for reskins, instead of picking one of the races in the query. */
  race?: string;
  /** XP budget, instead of the one for `difficulty`. */
  budget?: number;
  /**
   * When the query names no creature type or race, stick to these creature types (if any match)
   * instead of picking one at random. Defaults to the locked groups' types.
   */
  creatureTypes?: readonly string[];
  /** Monsters to pick more often, e.g. the main encounter's when building a wave. */
  favor?: readonly MonsterEntry[];
  /**
   * Monsters (ids or names) used recently, most recent first. They're picked far less often, so
   * a session doesn't keep meeting the same creatures.
   */
  recent?: readonly string[];
}

export interface EncounterGroup {
  monster: MonsterEntry;
  /** Display name, including any race reskin ("Orc Veteran"). */
  name: string;
  count: number;
  xpEach: number;
  role?: Role;
}

export interface Encounter {
  seed: string;
  tags: string;
  partyLevel: number;
  partySize: number;
  difficulty: Difficulty;
  /** What the final total actually rates as. */
  rating: Difficulty | "trivial";
  budget: number;
  totalXp: number;
  template: EncounterTemplate;
  race?: string;
  groups: EncounterGroup[];
  tactics: string[];
  situation: string;
  terrain: string;
  loot?: LootResult;
  /** Reinforcements added with addWave(), in arrival order. */
  waves?: Wave[];
  warnings: string[];
}

export interface Wave {
  seed: string;
  /** Round at the start of which the wave arrives. */
  round: number;
  arrival: string;
  groups: EncounterGroup[];
  xp: number;
  tactics: string[];
}

/** weight: native statblocks (a real Orc) outweigh reskinned generic NPCs (Orc Veteran). */
type Pick = { monster: MonsterEntry; xp: number; weight: number };

/** Weighted random order (Efraimidis–Spirakis): heavier picks tend to come first. */
function weightedShuffle(rng: Rng, picks: Pick[]): Pick[] {
  return picks
    .map((p) => ({ p, key: Math.log(1 - rng.next()) / p.weight }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.p);
}
type Draft = Map<MonsterEntry, number>;

const BESTIAL = new Set(["beast", "ooze", "plant", "construct"]);
const ALPHA_TACTICS: [string, string] = [
  "is the pack's alpha, attacking first and hardest; if it falls, the rest scatter",
  "lead the pack, attacking first and hardest; if they fall, the rest scatter",
];

/** [singular, plural] tactics per role. */
const ROLE_TACTICS: Record<Role, [string, string]> = {
  leader: ["barks orders from the back; drop it and the rest check morale (DC 10 Wis or flee)", "bark orders from the back; drop them and the rest check morale"],
  solo: ["fights smart: uses terrain, focuses whoever hurt it most, retreats at quarter HP", "fight smart, using terrain and focusing whoever hurt them most"],
  brute: ["charges the nearest target and tries to pin the front line", "charge the nearest targets and try to pin the front line"],
  skirmisher: ["hits and runs, picking off isolated or spellcasting PCs", "hit and run, picking off isolated or spellcasting PCs"],
  artillery: ["holds back at range behind cover, focusing one target", "hold back at range behind cover, focusing fire on one target"],
  caster: ["opens with its strongest area spell, then stays out of reach", "open with their strongest area spells, then stay out of reach"],
  controller: ["locks down the toughest PC with grapples, restraints or conditions", "lock down the toughest PCs with grapples, restraints or conditions"],
  minion: ["harries the flanks and flees when its allies fall", "swarm and surround for flanking; they break when half have fallen"],
};

const SITUATIONS = [
  "Ambush — the enemies have set up hidden positions (Stealth vs passive Perception).",
  "They are mid-argument and distracted; the party gets a surprise round on a successful group Stealth check.",
  "They are already fighting something else; whoever wins will be weakened.",
  "They are guarding a prisoner who shouts for help.",
  "They are negotiable — they want something the party has.",
  "They are making camp: half are asleep, armor off.",
  "They are retreating from something worse and will fight only if cornered.",
  "One of them is a deserter who will switch sides if offered safety.",
  "They arrive in two waves: half now, the rest at the start of round 3.",
  "They are performing a ritual; interrupt it within 3 rounds or something worse arrives.",
];

const TERRAIN = [
  "Rubble and broken masonry make half the area difficult terrain.",
  "Thick pillars provide half cover throughout.",
  "A 10-ft ledge overlooks the area; the enemy holds the high ground.",
  "Dim light from guttering torches; the far half of the area is darkness.",
  "Heavy fog: everything beyond 20 ft is heavily obscured.",
  "A rickety bridge over a 30-ft drop splits the battlefield.",
  "Waist-deep water slows anyone without a swim speed.",
  "Stacked crates and barrels can be toppled (DC 12 Str) to block a path or knock a foe prone.",
  "A burning building or brush fire spreads 10 ft each round.",
  "Narrow chokepoint: only two creatures can fight side by side.",
  "Slick ice: DC 10 Dex save when dashing or knocked back, or fall prone.",
  "Open ground with no cover; ranged attackers love it.",
];

/** Rough shape of a finished group list, for encounters built around locked groups. */
function shapeOf(groups: readonly EncounterGroup[]): EncounterTemplate {
  const n = groups.reduce((sum, g) => sum + g.count, 0);
  if (n === 1) return "solo";
  if (n === 2) return "elite";
  if (n >= 8 && groups.length <= 2) return "horde";
  const [top, next] = groups;
  if (top!.count === 1 && next && top!.xpEach >= 2 * next.xpEach) return "leader";
  return "squad";
}

function weightedRole(m: MonsterEntry, prefer: readonly Role[]): Role | undefined {
  return m.roles.find((r) => prefer.includes(r)) ?? m.roles[0];
}

/** Random monster with XP in [min, max], favoring entries with preferred roles. */
function pickIn(rng: Rng, pool: Pick[], min: number, max: number, prefer: readonly Role[] = [], avoid?: Set<MonsterEntry>): Pick | null {
  const inRange = pool.filter((p) => p.xp >= min && p.xp <= max && !avoid?.has(p.monster));
  if (!inRange.length) return null;
  const preferred = inRange.filter((p) => p.monster.roles.some((r) => prefer.includes(r)));
  // Prefer fitting roles, but not so hard that one caster leads every fight in a narrow theme.
  const from = preferred.length && rng.chance(0.5) ? preferred : inRange;
  return rng.weighted(from.map((p) => [p, p.weight] as const));
}

const draftXp = (d: Draft) => [...d].reduce((sum, [m, n]) => sum + xpForCr(m.cr) * n, 0);
const draftCount = (d: Draft) => [...d.values()].reduce((a, b) => a + b, 0);

/** Round-robin add creatures of the given types until the budget or cap is reached. */
function fill(draft: Draft, types: Pick[], budget: number, cap: number) {
  let progress = true;
  while (progress) {
    progress = false;
    for (const t of types) {
      if (draftCount(draft) >= cap) return;
      if (draftXp(draft) + t.xp > budget * 1.05) continue;
      draft.set(t.monster, (draft.get(t.monster) ?? 0) + 1);
      progress = true;
    }
  }
}

function build(rng: Rng, template: EncounterTemplate, pool: Pick[], B: number, cap: number): Draft | null {
  const draft: Draft = new Map();
  switch (template) {
    case "solo": {
      const p = pickIn(rng, pool, B * 0.6, B * 1.05, ["solo", "leader", "brute"]);
      if (!p) return null;
      draft.set(p.monster, 1);
      return draft;
    }
    case "elite": {
      const a = pickIn(rng, pool, B * 0.3, B * 0.55, ["leader", "brute", "caster", "solo"]);
      if (!a) return null;
      const b = rng.chance(0.5) ? a : pickIn(rng, pool, B * 0.3, B * 1.05 - a.xp, ["brute", "caster", "skirmisher"], new Set([a.monster])) ?? a;
      draft.set(a.monster, 1);
      draft.set(b.monster, (draft.get(b.monster) ?? 0) + 1);
      return draft;
    }
    case "leader": {
      const lead = pickIn(rng, pool, B * 0.2, B * 0.55, ["leader", "caster", "solo"]);
      if (!lead) return null;
      draft.set(lead.monster, 1);
      const rest = B - lead.xp;
      const followers = weightedShuffle(rng, pool.filter((p) => p.xp <= lead.xp / 2 && p.xp >= rest / (cap * 1.5) && p.monster !== lead.monster));
      if (!followers.length) return null;
      const minions = followers.filter((p) => p.monster.roles.some((r) => r === "minion" || r === "brute" || r === "skirmisher"));
      fill(draft, (minions.length ? minions : followers).slice(0, rng.int(1, 2)), B, cap);
      return draftCount(draft) > 1 ? draft : null;
    }
    case "squad": {
      const candidates = weightedShuffle(rng, pool.filter((p) => p.xp >= B / 12 && p.xp <= B / 2.5));
      const types: Pick[] = [];
      const roles = new Set<Role>();
      // Prefer types that each bring a new role: front line + ranged + support.
      for (const c of candidates) {
        if (types.length >= rng.int(2, 3)) break;
        const role = c.monster.roles[0];
        if (role && roles.has(role) && candidates.length > 4) continue;
        types.push(c);
        if (role) roles.add(role);
      }
      if (types.length < 2) return null;
      fill(draft, types, B, cap);
      return draft.size >= 2 ? draft : null;
    }
    case "horde": {
      const hordeCap = Math.round(cap * 1.5);
      // Genuinely weak creatures only: it takes most of the cap to reach the budget.
      const candidates = weightedShuffle(rng, pool.filter((p) => p.xp >= B / (hordeCap * 1.3) && p.xp <= B / (hordeCap * 0.6)));
      if (!candidates.length) return null;
      fill(draft, candidates.slice(0, rng.int(1, 2)), B, hordeCap);
      return draftCount(draft) >= 6 ? draft : null;
    }
  }
}

const TEMPLATE_WEIGHTS: [EncounterTemplate, number][] = [["solo", 1], ["elite", 1.5], ["leader", 3], ["squad", 3], ["horde", 1.5]];

export function generateEncounter(opts: EncounterOptions): Encounter {
  const rng = createRng(opts.seed);
  const partyLevel = Math.max(1, Math.min(20, opts.partyLevel));
  const partySize = Math.max(1, opts.partySize ?? 4);
  const difficulty = opts.difficulty ?? "moderate";
  const locked = (opts.locked ?? []).map((g) => ({ ...g }));
  const lockedIds = new Set(locked.map((g) => g.monster.id));
  const favored = new Set((opts.favor ?? []).map((m) => m.id));
  // The more recently a monster was used, the less likely it comes back.
  const recentList = opts.recent ?? [];
  const recentSet = new Set(recentList);
  const recentPenalty = (m: MonsterEntry) => {
    const i = Math.max(recentList.indexOf(m.id), recentList.indexOf(m.name));
    return i < 0 ? 1 : 0.08 + 0.6 * (i / Math.max(1, recentList.length));
  };
  const fullBudget = opts.budget ?? xpBudget(partyLevel, partySize, difficulty);
  // With locked groups, only the remainder of the budget and cap is generated.
  const B = fullBudget - locked.reduce((sum, g) => sum + g.xpEach * g.count, 0);
  const cap = (opts.maxCreatures ?? Math.max(4, partySize * 2)) - locked.reduce((sum, g) => sum + g.count, 0);
  const catalog = opts.catalog ?? SRD_MONSTERS;
  const warnings: string[] = [];

  const query = parseTags(opts.tags ?? "");
  const races = racesIn(query);
  const race = opts.race ?? (races.length ? rng.pick(races) : undefined);
  let matched = catalog.filter((m) => matchesQuery(m, query, race));
  const ordinary = matched.filter((m) => !isUnaskedExotic(m, query));
  if (ordinary.length) matched = ordinary;
  // No creature type or race in the query (blank, or just terrain/theme like "forest"): usually
  // theme the encounter around one creature type so it hangs together.
  const typed = query.clauses.flat().some((t) => CREATURE_TYPES.has(t) || RACES.has(t));
  const themeTypes = opts.creatureTypes ?? locked.map((g) => g.monster.type);
  if (!typed && themeTypes.length) {
    const same = matched.filter((m) => themeTypes.includes(m.type));
    if (same.length) matched = same;
  } else if (!typed && (!query.clauses.length || rng.chance(0.7))) {
    const fits = matched.filter((m) => xpForCr(m.cr) <= B && xpForCr(m.cr) >= B / 20);
    if (fits.length) {
      // Pick the theme by type, not by monster: beasts vastly outnumber everything else, so a
      // per-monster pick is almost always "beast". Square-rooting the counts evens it out.
      const byType = new Map<string, number>();
      for (const m of fits) byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
      const recentTypes = new Set(catalog.filter((m) => recentSet.has(m.id) || recentSet.has(m.name)).map((m) => m.type));
      const type = rng.weighted([...byType].map(([t, n]) => [t, Math.sqrt(n) * (recentTypes.has(t) ? 0.4 : 1)] as const));
      matched = matched.filter((m) => m.type === type);
    }
  }
  if (!matched.length && !locked.length) throw new Error(`No monsters match "${opts.tags}".`);
  const pool: Pick[] = matched
    .filter((monster) => !lockedIds.has(monster.id))
    .map((monster) => ({
      monster,
      xp: xpForCr(monster.cr),
      weight: (race && isAnyRace(monster) ? 1 : 6) * (favored.has(monster.id) ? 4 : 1) * recentPenalty(monster),
    }))
    .filter((p) => p.xp > 0);

  // Try every allowed template, then choose randomly among drafts that fit the budget well. Always
  // taking the single closest fit would make every seed produce the same encounter.
  const fixed = opts.template && opts.template !== "auto" ? opts.template : null;
  const templateWeight = new Map(TEMPLATE_WEIGHTS);
  type Result = { draft: Draft; template: EncounterTemplate; score: number; weight: number };
  const results: Result[] = [];
  const reskinShare = (d: Draft) => [...d].reduce((n, [m, c]) => n + (race && isAnyRace(m) ? c : 0), 0) / draftCount(d);
  const tryTemplate = (template: EncounterTemplate) => {
    for (let i = 0; i < 25; i++) {
      const draft = build(rng, template, pool, B, cap);
      if (!draft) continue;
      const xp = draftXp(draft);
      if (xp > B * 1.1) continue;
      // Prefer real race statblocks over reskinned generic NPCs when both fit.
      const weight = templateWeight.get(template)! / (1 + 6 * reskinShare(draft));
      results.push({ draft, template, score: Math.abs(xp - B) / B, weight });
    }
  };
  const room = B > 0 && cap > 0 && pool.length > 0;
  if (room && fixed) tryTemplate(fixed);
  if (room && !results.length) for (const [t] of TEMPLATE_WEIGHTS) if (t !== fixed) tryTemplate(t);

  let best: Result | null = null;
  if (results.length) {
    const bestScore = Math.min(...results.map((r) => r.score));
    // Count each distinct line-up once: a monster that happens to fit the budget neatly turns up
    // in many identical drafts, and shouldn't win just by being drafted more often.
    const seen = new Set<string>();
    const good = results.filter((r) => {
      // Within 15% of the budget still rates at the difficulty asked for; closer fits are only mildly favored.
      if (r.score > Math.max(0.15, bestScore + 0.05)) return false;
      const key = [...r.draft].map(([m, n]) => `${m.id}x${n}`).sort().join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((r) => ({ ...r, weight: r.weight * (1.2 - r.score) * Math.min(...[...r.draft.keys()].map(recentPenalty)) }));
    // Normalize per template so templates that happen to produce more valid drafts don't dominate.
    const perTemplate = new Map<EncounterTemplate, number>();
    for (const r of good) perTemplate.set(r.template, (perTemplate.get(r.template) ?? 0) + 1);
    best = rng.weighted(good.map((r) => [r, r.weight / perTemplate.get(r.template)!] as const));
  }

  if (!best && locked.length) {
    // Leftover budget too small for anything matching: keep just the locked groups.
    if (room && B >= fullBudget * 0.15) warnings.push(`Nothing matching fits the ${B.toLocaleString("en-US")} XP left beside the locked creatures.`);
  } else if (!best) {
    // Everything matching is too strong (or weak) for this party: take the closest single monster.
    const closest = [...pool].sort((a, b) => Math.abs(a.xp - B) - Math.abs(b.xp - B))[0]!;
    best = { draft: new Map([[closest.monster, 1]]), template: "solo", score: 1, weight: 1 };
    warnings.push(`Nothing matching "${opts.tags}" fits a ${difficulty} budget of ${B} XP; using the closest match.`);
  }
  if (best && !locked.length && opts.template && opts.template !== "auto" && best.template !== opts.template) {
    warnings.push(`Couldn't build a ${TEMPLATES[opts.template].toLowerCase()} from the matching monsters; made a ${TEMPLATES[best.template].toLowerCase()} instead.`);
  }

  const fresh = best ? toGroups(best.draft, best.template, race) : [];
  const groups = [...locked, ...fresh].sort((a, b) => b.xpEach - a.xpEach);
  const template = locked.length ? shapeOf(groups) : best!.template;

  // In a leader template the strongest is the leader regardless of statblock role (locked roles stay).
  if (!locked.includes(groups[0]!)) {
    if (template === "leader") groups[0]!.role = "leader";
    if (template === "solo") groups[0]!.role = "solo";
  }

  const totalXp = groups.reduce((sum, g) => sum + g.xpEach * g.count, 0);
  const maxCr = Math.max(...groups.map((g) => g.monster.cr));
  const encounter: Encounter = {
    seed: rng.seed,
    tags: opts.tags ?? "",
    partyLevel,
    partySize,
    difficulty,
    rating: rateEncounter(totalXp, partyLevel, partySize),
    budget: fullBudget,
    totalXp,
    template,
    race,
    groups,
    tactics: tacticsFor(groups),
    situation: rng.pick(SITUATIONS),
    terrain: rng.pick(TERRAIN),
    warnings,
  };
  if (opts.loot) {
    const creatures = groups.map((g) => ({ name: g.monster.name, type: g.monster.type, cr: g.monster.cr, count: g.count }));
    encounter.loot = generateLoot({ cr: maxCr, mode: "individual", magicItems: opts.magicItems, creatures, seed: `${rng.seed}:loot` });
  }
  return encounter;
}

function toGroups(draft: Draft, template: EncounterTemplate, race?: string): EncounterGroup[] {
  return [...draft]
    .map(([monster, count]) => ({
      monster,
      count,
      xpEach: xpForCr(monster.cr),
      name: race && isAnyRace(monster) && !terms(monster).has(race) ? `${race.charAt(0).toUpperCase()}${race.slice(1)} ${monster.name}` : monster.name,
      role: weightedRole(monster, template === "solo" ? ["solo"] : ["leader", "caster", "artillery", "controller", "skirmisher", "brute", "minion"]),
    }))
    .sort((a, b) => b.xpEach - a.xpEach);
}

function tacticsFor(groups: readonly EncounterGroup[]): string[] {
  return groups.map((g) => {
    const role = g.role ?? "brute";
    // Animals and mindless things lead by instinct, not orders.
    const [one, many] = role === "leader" && BESTIAL.has(g.monster.type) ? ALPHA_TACTICS : ROLE_TACTICS[role];
    return g.count > 1 ? `${g.count}× ${g.name} ${many}.` : `The ${g.name} ${one}.`;
  });
}

// ---------------------------------------------------------------------------
// Waves

const ARRIVALS = [
  "Reinforcements come running from behind the enemy line.",
  "They burst in from the flank, through a door or gap nobody was watching.",
  "They come from behind the party, cutting off the retreat.",
  "They drop from above: a ledge, the rafters, or a hole in the ceiling.",
  "They were lying in wait and spring up among the PCs.",
  "Horns or shouts give a round's warning; they arrive from the far side.",
];

export interface WaveOptions {
  /** Monsters used recently in the session, to avoid repeating. */
  recent?: readonly string[];
  catalog?: readonly MonsterEntry[];
  /** Wave budget as a share of the encounter's budget. Default 0.5. */
  share?: number;
  seed?: string | number;
}

/**
 * Add a wave of reinforcements: same tags, race and creature types at about half the budget,
 * arriving a couple of rounds in (after any earlier wave). Returns a new encounter.
 */
export function addWave(e: Encounter, opts: WaveOptions = {}): Encounter {
  const rng = createRng(opts.seed);
  const prev = e.waves ?? [];
  const wave = generateEncounter({
    partyLevel: e.partyLevel,
    partySize: e.partySize,
    tags: e.tags,
    race: e.race,
    budget: Math.round(e.budget * (opts.share ?? 0.5)),
    creatureTypes: [...new Set(e.groups.map((g) => g.monster.type))],
    // Reinforcements are usually more of the same.
    favor: e.groups.map((g) => g.monster),
    recent: opts.recent,
    catalog: opts.catalog,
    seed: `${rng.seed}:wave`,
  });
  const round = (prev.at(-1)?.round ?? 0) + rng.int(2, 3);
  return {
    ...e,
    waves: [...prev, { seed: rng.seed, round, arrival: rng.pick(ARRIVALS), groups: wave.groups, xp: wave.totalXp, tactics: wave.tactics }],
  };
}

/** XP of the encounter plus all its waves. */
export const encounterXp = (e: Encounter) => e.totalXp + (e.waves ?? []).reduce((sum, w) => sum + w.xp, 0);

/** One-line summary, e.g. "Orc Veteran, 4× Orc (moderate, 1,300 XP)". */
export function encounterSummary(e: Encounter): string {
  const list = e.groups.map((g) => (g.count > 1 ? `${g.count}× ${g.name}` : g.name)).join(", ");
  return `${list} (${e.rating}, ${e.totalXp.toLocaleString("en-US")} XP)`;
}
