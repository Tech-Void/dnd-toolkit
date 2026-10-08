import type { Ability } from "./forge.ts";
import { normalizeText, parseText, type ParsedEntry } from "./parse.ts";

// ---------------------------------------------------------------------------
// Whole statblocks (2014, 2024 and D&D Beyond layouts) into everything an NPC actor needs.

export type SizeCode = "tiny" | "sm" | "med" | "lg" | "huge" | "grg";
export type StatSection = "traits" | "actions" | "bonus" | "reactions" | "legendary" | "lair";

export interface StatSpell {
  name: string;
  /** prepared: uses slots; atwill / innate: from the statblock's "At will" and "X/day" lists. */
  mode: "prepared" | "atwill" | "innate";
  /** Uses per day for innate spells. */
  uses?: number;
}

export interface ParsedStatblock {
  name: string;
  size: SizeCode;
  type: string;
  subtype: string;
  alignment: string;
  ac: { value: number; note?: string };
  hp: { value: number; formula?: string };
  speed: { walk: number; fly: number; swim: number; climb: number; burrow: number; hover: boolean };
  abilities: Record<Ability, number>;
  /** Proficient saving throws with their written bonus. */
  saves: Partial<Record<Ability, number>>;
  /** dnd5e skill code → written bonus. */
  skills: Record<string, number>;
  senses: { darkvision: number; blindsight: number; tremorsense: number; truesight: number };
  languages: string[];
  cr: number;
  /** Damage types; "physical" bypass when the text says nonmagical. */
  resistances: string[];
  immunities: string[];
  vulnerabilities: string[];
  conditionImmunities: string[];
  physicalBypassMagic: boolean;
  /** Entries per section, already parsed into attacks and features. */
  sections: Record<StatSection, ParsedEntry[]>;
  legendaryActions: number;
  legendaryResistances: number;
  spellcasting?: { ability?: Ability; level?: number; dc?: number; spells: StatSpell[] };
  warnings: string[];
}

const SIZES: Record<string, SizeCode> = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
const ABILITY_KEYS: Ability[] = ["str", "dex", "con", "int", "wis", "cha"];
const ABILITY_WORDS: Record<string, Ability> = {
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
};
export const SKILL_CODES: Record<string, string> = {
  acrobatics: "acr", "animal handling": "ani", arcana: "arc", athletics: "ath", deception: "dec", history: "his", insight: "ins",
  intimidation: "itm", investigation: "inv", medicine: "med", nature: "nat", perception: "prc", performance: "prf",
  persuasion: "per", religion: "rel", "sleight of hand": "slt", stealth: "ste", survival: "sur",
};
const DAMAGE = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const CONDITIONS = ["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];
const SECTION_HEADINGS: [RegExp, StatSection][] = [
  [/^traits$/i, "traits"], [/^actions$/i, "actions"], [/^bonus actions$/i, "bonus"], [/^reactions$/i, "reactions"],
  [/^legendary actions$/i, "legendary"], [/^(?:lair actions|mythic actions)$/i, "lair"],
];

/** Does this text look like a statblock (has AC and HP lines)? */
export function looksLikeStatblock(raw: string): boolean {
  const lines = normalizeText(raw);
  return lines.some((l) => /^(?:Armor Class|AC) \d+/i.test(l)) && lines.some((l) => /^(?:Hit Points|HP) \d+/i.test(l));
}

const value = (lines: string[], label: RegExp) => {
  for (const l of lines) {
    const m = label.exec(l);
    if (m) return l.slice(m[0].length).trim();
  }
  return undefined;
};

function parseCr(s: string | undefined): number {
  const m = /(\d+)(?:\/(\d+))?/.exec(s ?? "");
  return m ? (m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1])) : 0;
}

function parseSpeed(s: string | undefined): ParsedStatblock["speed"] {
  const speed = { walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0, hover: false };
  if (!s) return speed;
  speed.walk = Number(/^(\d+)/.exec(s)?.[1] ?? 0);
  for (const kind of ["fly", "swim", "climb", "burrow"] as const) speed[kind] = Number(new RegExp(`${kind} (\\d+)`, "i").exec(s)?.[1] ?? 0);
  speed.hover = /hover/i.test(s);
  return speed;
}

/** Ability scores and (2024) saves from the stat table, whatever its layout. */
function parseAbilities(lines: string[]): { scores: Record<Ability, number>; saves: Partial<Record<Ability, number>> } | null {
  const scores = {} as Record<Ability, number>;
  const saves: Partial<Record<Ability, number>> = {};
  const joined = lines.join(" ");
  // 2024: "Str 8 -1 -1 Dex 15 +2 +2 ..." (score, modifier, save).
  for (const m of joined.matchAll(/\b(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\s+([+-]\d+)\s+([+-]\d+)/gi)) {
    const key = ABILITY_WORDS[m[1]!.toLowerCase()]!;
    scores[key] = Number(m[2]);
    if (m[4] !== m[3]) saves[key] = Number(m[4]);
  }
  if (ABILITY_KEYS.every((k) => scores[k])) return { scores, saves };
  // 2014 and D&D Beyond: after the STR heading, six "8 (-1)" pairs, on one line or many.
  const start = lines.findIndex((l) => /^STR\b/.test(l));
  if (start < 0) return null;
  const pairs = [...lines.slice(start, start + 14).join(" ").matchAll(/(\d+)\s*\(\s*[+-]?\d+\s*\)/g)].slice(0, 6);
  if (pairs.length < 6) return null;
  ABILITY_KEYS.forEach((k, i) => (scores[k] = Number(pairs[i]![1])));
  return { scores, saves };
}

/** "Dex +5, Con +11" or "Perception +12, Stealth +6". */
function bonusList(s: string | undefined): [string, number][] {
  return [...(s ?? "").matchAll(/([A-Za-z][A-Za-z ]*?)\s*([+-]\d+)/g)].map((m) => [m[1]!.trim().toLowerCase(), Number(m[2])]);
}

function damageList(s: string | undefined): { types: string[]; conditions: string[]; nonmagical: boolean } {
  const t = (s ?? "").toLowerCase();
  return {
    types: DAMAGE.filter((d) => new RegExp(`\\b${d}\\b`).test(t)),
    conditions: CONDITIONS.filter((c) => new RegExp(`\\b${c}\\b`).test(t)),
    nonmagical: /nonmagical|that aren't magical|non-magical/.test(t),
  };
}

function parseSenses(s: string | undefined): ParsedStatblock["senses"] {
  const get = (k: string) => Number(new RegExp(`${k} (\\d+)`, "i").exec(s ?? "")?.[1] ?? 0);
  return { darkvision: get("darkvision"), blindsight: get("blindsight"), tremorsense: get("tremorsense"), truesight: get("truesight") };
}

/** Spell lists from a Spellcasting trait, 2014 or 2024 style. */
function parseSpellcasting(text: string): ParsedStatblock["spellcasting"] {
  const ability = /spellcasting ability is (\w+)|using (\w+) as the spellcasting ability/i.exec(text);
  const level = /(\d+)(?:st|nd|rd|th)-level spellcaster/i.exec(text);
  const dc = /spell save DC (\d+)/i.exec(text);
  const spells: StatSpell[] = [];
  const LIST = /(Cantrips \(at will\)|At will|(\d+)(?:st|nd|rd|th) level \(\d+ slots?\)|(\d+)\/day(?: each)?)\s*:\s*/gi;
  const marks = [...text.matchAll(LIST)];
  marks.forEach((m, i) => {
    const end = marks[i + 1]?.index ?? text.length;
    const list = text.slice(m.index! + m[0].length, end);
    const mode: StatSpell["mode"] = /at will/i.test(m[1]!) && !/cantrips/i.test(m[1]!) ? "atwill" : m[3] ? "innate" : "prepared";
    for (const raw of list.split(/,|\band\b/)) {
      const name = raw.replace(/\([^)]*\)/g, "").replace(/[*.]/g, "").trim();
      if (name && name.length < 40) spells.push({ name: name.replace(/\b\w/g, (c) => c.toUpperCase()), mode, uses: m[3] ? Number(m[3]) : undefined });
    }
  });
  if (!spells.length && !ability) return undefined;
  const word = (ability?.[1] ?? ability?.[2] ?? "").toLowerCase();
  return { ability: ABILITY_WORDS[word], level: level ? Number(level[1]) : undefined, dc: dc ? Number(dc[1]) : undefined, spells };
}

export function parseStatblock(raw: string): ParsedStatblock {
  const lines = normalizeText(raw).filter((l, i, all) => l || all[i - 1]);
  while (lines.length && !lines[0]) lines.shift();
  const warnings: string[] = [];
  const name = lines[0] ?? "Unnamed";

  // Header vs body: the body starts after the Challenge/CR line (or the Proficiency Bonus line after it).
  let crIndex = lines.findIndex((l) => /^(?:Challenge|CR)\s+[\d/]+/i.test(l));
  if (crIndex >= 0 && /^Proficiency Bonus/i.test(lines[crIndex + 1] ?? "")) crIndex++;
  if (crIndex < 0) warnings.push("No Challenge/CR line found: CR set to 0.");
  const header = lines.slice(0, crIndex >= 0 ? crIndex + 1 : lines.length);
  const body = crIndex >= 0 ? lines.slice(crIndex + 1) : [];

  const typeLine = header.find((l) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i.test(l)) ?? "";
  const tm = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or \w+)? (?:swarm of \w+ )?([A-Za-z]+)(?: \(([^)]+)\))?,?\s*(.*)$/i.exec(typeLine);
  if (!tm) warnings.push("Couldn't read the size and type line.");

  const acText = value(header, /^(?:Armor Class|AC)\s+/i) ?? "";
  const hpText = value(header, /^(?:Hit Points|HP)\s+/i) ?? "";
  const abilities = parseAbilities(header);
  if (!abilities) warnings.push("Couldn't find the six ability scores: set to 10.");

  const saves: Partial<Record<Ability, number>> = { ...abilities?.saves };
  for (const [k, v] of bonusList(value(header, /^Saving Throws\s+/i))) if (ABILITY_WORDS[k]) saves[ABILITY_WORDS[k]!] = v;
  const skills: Record<string, number> = {};
  for (const [k, v] of bonusList(value(header, /^Skills\s+/i))) if (SKILL_CODES[k]) skills[SKILL_CODES[k]!] = v;

  // 2014 splits damage and condition lines; 2024 has "Immunities Poison; Charmed, Poisoned".
  const resist = damageList(value(header, /^(?:Damage )?Resistances\s+/i));
  const immune = damageList(value(header, /^(?:Damage )?Immunities\s+/i));
  const vuln = damageList(value(header, /^(?:Damage )?Vulnerabilities\s+/i));
  const condImmune = damageList(value(header, /^Condition Immunities\s+/i));
  const languages = (value(header, /^Languages\s+/i) ?? "").split(/,|;/).map((l) => l.trim()).filter((l) => l && l !== "-" && !/^none/i.test(l));

  // Body sections.
  const sectionLines: Record<StatSection, string[]> = { traits: [], actions: [], bonus: [], reactions: [], legendary: [], lair: [] };
  let section: StatSection = "traits";
  for (const l of body) {
    const heading = SECTION_HEADINGS.find(([re]) => re.test(l));
    if (heading) section = heading[1];
    else sectionLines[section].push(l);
  }
  // The legendary intro ("can take 3 legendary actions...") isn't an action.
  let legendaryActions = 0;
  sectionLines.legendary = sectionLines.legendary.filter((l) => {
    const m = /can take (\d+) legendary actions|Legendary Action Uses:? (\d+)/i.exec(l);
    if (m) legendaryActions = Number(m[1] ?? m[2]);
    return !m && !/^(?:only one legendary action|the \w+ regains spent legendary actions)/i.test(l);
  });
  sectionLines.lair = sectionLines.lair.filter((l) => !/^On initiative count 20|^When fighting inside its lair/i.test(l));
  if (sectionLines.legendary.length && !legendaryActions) legendaryActions = 3;

  const sections = {} as Record<StatSection, ParsedEntry[]>;
  for (const key of Object.keys(sectionLines) as StatSection[]) {
    const text = sectionLines[key].join("\n");
    sections[key] = text.trim() ? parseText(text, key === "traits" ? "feature" : "action") : [];
  }

  // Legendary Resistance (3/Day) and spellcasting live in the traits.
  let legendaryResistances = 0;
  let spellcasting: ParsedStatblock["spellcasting"];
  for (const t of [...sections.traits, ...sections.actions]) {
    if (/^Legendary Resistance/i.test(t.name)) legendaryResistances = t.uses?.max ?? 3;
    if (/spellcasting/i.test(t.name)) spellcasting = parseSpellcasting(t.paragraphs.join(" ")) ?? spellcasting;
  }

  return {
    name,
    size: tm ? SIZES[tm[1]!.toLowerCase()]! : "med",
    type: tm ? tm[2]!.toLowerCase() : "humanoid",
    subtype: (tm?.[3] ?? "").toLowerCase(),
    alignment: (tm?.[4] ?? "").trim().toLowerCase(),
    // 2024 puts initiative on the AC line: "AC 15 Initiative +2 (12)".
    ac: { value: Number(/^(\d+)/.exec(acText)?.[1] ?? 10), note: /\(([^)]+)\)/.exec(acText.replace(/Initiative.*$/i, ""))?.[1] },
    hp: { value: Number(/^(\d+)/.exec(hpText)?.[1] ?? 1), formula: /\(([^)]+)\)/.exec(hpText)?.[1]?.replace(/\s+/g, " ") },
    speed: parseSpeed(value(header, /^Speed\s+/i)),
    abilities: abilities?.scores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saves,
    skills,
    senses: parseSenses(value(header, /^Senses\s+/i)),
    languages,
    cr: parseCr(value(header, /^(?:Challenge|CR)\s+/i)),
    resistances: resist.types,
    immunities: immune.types,
    vulnerabilities: vuln.types,
    conditionImmunities: [...new Set([...condImmune.conditions, ...immune.conditions])],
    physicalBypassMagic: resist.nonmagical || immune.nonmagical,
    sections,
    legendaryActions,
    legendaryResistances,
    spellcasting,
    warnings: [...warnings, ...Object.values(sections).flat().flatMap((e) => e.warnings.map((w) => `${e.name}: ${w}`))],
  };
}
