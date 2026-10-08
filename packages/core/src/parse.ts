import type { Rarity } from "./data/treasure.ts";
import type { Ability, ForgeEffect } from "./forge.ts";

// ---------------------------------------------------------------------------
// Paste & parse: book text (spells, magic items, monster actions, features) into the fields a
// VTT item needs. Handles the 2014 and 2024 book layouts and D&D Beyond's label-per-line layout.
// Anything it can't pin down goes into `warnings` rather than being guessed silently.

export type ParsedKind = "spell" | "item" | "action" | "feature";
export type AreaShape = "sphere" | "cone" | "cube" | "line" | "cylinder" | "radius" | "square" | "wall";

export interface ParsedEntry {
  kind: ParsedKind;
  name: string;
  /** Body text as paragraphs (header and stat lines removed). */
  paragraphs: string[];
  activation?: { type: "action" | "bonus" | "reaction" | "minute" | "hour" | "legendary" | "special"; cost: number; condition?: string };
  range?: { value: number | null; long?: number | null; units: "ft" | "mi" | "self" | "touch" | "spec" | "any" };
  target?: { value: number; width?: number; type: AreaShape | "creature"; units: "ft" | "" };
  duration?: { value: number | null; units: "inst" | "turn" | "round" | "minute" | "hour" | "day" | "perm" | "spec" };
  concentration?: boolean;
  actionType?: "mwak" | "rwak" | "msak" | "rsak" | "save" | "heal" | "util";
  /** Flat to-hit bonus as written (monster attacks). */
  attackBonus?: number;
  /** Damage and healing parts, e.g. ["8d6", "fire"], ["1d8 + @mod", "healing"]. */
  damage: [formula: string, type: string][];
  save?: { ability: Ability; dc?: number };
  uses?: { max: number; per: "day" | "dawn" | "charges" | "sr" | "lr"; recovery?: string };
  /** Monster recharge: 5 for "(Recharge 5-6)". */
  recharge?: number;
  spell?: {
    level: number;
    school: string;
    ritual: boolean;
    components: { v: boolean; s: boolean; m: boolean; material?: string; consumed?: boolean; cost?: number };
    scaling?: { mode: "level" | "cantrip"; formula: string };
  };
  item?: {
    itemType: "weapon" | "equipment" | "consumable";
    /** dnd5e subtype: trinket, clothing, wand, rod, potion, scroll, ammo, or an armor type. */
    subtype: string;
    /** Compendium base to build on, e.g. "Longsword", "Plate Armor". */
    base?: string;
    rarity?: Rarity | "artifact";
    attunement: boolean;
    /** +N to attack and damage (weapons) or AC (armor). */
    bonus?: number;
    effects: ForgeEffect[];
  };
  /** Effects the spell or feature puts on its targets (applied from the chat card). */
  targetEffects?: ForgeEffect[];
  warnings: string[];
}

const DAMAGE_TYPES = "acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder";
const ABILITIES: Record<string, Ability> = {
  strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha",
  str: "str", dex: "dex", con: "con", int: "int", wis: "wis", cha: "cha",
};
const SCHOOLS: Record<string, string> = {
  abjuration: "abj", conjuration: "con", divination: "div", enchantment: "enc", evocation: "evo",
  illusion: "ill", necromancy: "nec", transmutation: "trs",
};
const ORDINAL = /(\d+)(?:st|nd|rd|th)?/;

/** Undo the usual PDF and web copy damage: soft hyphens, ligatures, curly quotes, broken words. */
export function normalizeText(raw: string): string[] {
  const text = raw
    .replace(/\r/g, "")
    .replace(/­/g, "")
    .replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").replace(/ﬀ/g, "ff")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[‒–—−]/g, "-")
    .replace(/ /g, " ")
    // "dam-\nage" → "damage"
    .replace(/([a-z])-\n([a-z])/g, "$1$2");
  return text.split("\n").map((l) => l.replace(/\s+/g, " ").trim());
}

/** Rejoin a line broken inside parentheses: "M (a small, straight piece of" + "iron)". */
function mergeOpenParens(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const open = prev ? (prev.match(/\(/g)?.length ?? 0) - (prev.match(/\)/g)?.length ?? 0) : 0;
    if (prev && open > 0 && line) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

/** Join wrapped lines into paragraphs: a blank line, or a line ending a sentence before a new capital, starts a new one. */
function paragraphs(lines: string[]): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (!line) {
      if (cur) out.push(cur);
      cur = "";
      continue;
    }
    // Headings like "At Higher Levels." or a "Name. " paragraph start a new paragraph.
    const starts = /^(At Higher Levels|Using a Higher-Level Spell Slot|Cantrip Upgrade)\b/.test(line) || TITLE_LEAD.test(line);
    if (cur && (starts || /[.:!?)"]$/.test(cur))) {
      out.push(cur);
      cur = line;
    } else cur = cur ? `${cur} ${line}` : line;
  }
  if (cur) out.push(cur);
  return out;
}

/** "Fire Breath (Recharge 5-6). The dragon..." / "Scimitar. Melee Weapon Attack..." */
const TITLE_LEAD = /^((?:[A-Z][\w'-]*|of|the|and|a|an|in|on|to|with)(?: (?:[A-Z][\w'-]*|of|the|and|a|an|in|on|to|with|\d+)){0,5})(?: \(([^)]{1,40})\))?\. (?=[A-Z0-9"])/;

const firstNumber = (s: string) => Number(ORDINAL.exec(s)?.[1] ?? NaN);

function parseActivation(s: string): ParsedEntry["activation"] {
  const t = s.toLowerCase();
  const n = Number(/(\d+)/.exec(t)?.[1] ?? 1);
  const condition = /reaction,? (?:which you take )?(when .*)$/i.exec(s)?.[1];
  if (/bonus action/.test(t)) return { type: "bonus", cost: 1 };
  if (/reaction/.test(t)) return { type: "reaction", cost: 1, condition };
  if (/minute/.test(t)) return { type: "minute", cost: n };
  if (/hour/.test(t)) return { type: "hour", cost: n };
  if (/action/.test(t)) return { type: "action", cost: 1 };
  return { type: "special", cost: 1 };
}

function parseRange(s: string): ParsedEntry["range"] {
  const t = s.toLowerCase();
  if (t.startsWith("self")) return { value: null, units: "self" };
  if (t.startsWith("touch")) return { value: null, units: "touch" };
  if (/unlimited|any/.test(t)) return { value: null, units: "any" };
  if (/sight|special/.test(t)) return { value: null, units: "spec" };
  const mi = /(\d+)\s*(?:mile|mi)/.exec(t);
  if (mi) return { value: Number(mi[1]), units: "mi" };
  const ft = /(\d+)(?:\s*\/\s*(\d+))?\s*(?:feet|foot|ft)/.exec(t);
  if (ft) return { value: Number(ft[1]), long: ft[2] ? Number(ft[2]) : null, units: "ft" };
  return undefined;
}

function parseDuration(s: string): Pick<ParsedEntry, "duration" | "concentration"> {
  const t = s.toLowerCase();
  const concentration = t.includes("concentration");
  if (t.includes("instantaneous")) return { duration: { value: null, units: "inst" }, concentration };
  if (/until dispelled|permanent/.test(t)) return { duration: { value: null, units: "perm" }, concentration };
  const m = /(\d+)\s*(round|minute|hour|day|turn)/.exec(t);
  if (m) return { duration: { value: Number(m[1]), units: m[2] as "round" }, concentration };
  return { duration: { value: null, units: "spec" }, concentration };
}

/** Area of effect anywhere in the text. */
function parseArea(text: string): ParsedEntry["target"] {
  const m = new RegExp(String.raw`(\d+)[- ](?:foot|feet|ft\.?)[- ](?:radius[- ]|long[- ]|wide[- ]|high[- ])?(sphere|cone|cube|line|cylinder|emanation|radius|square|wall)`, "i").exec(text);
  if (!m) return undefined;
  const shape = m[2]!.toLowerCase();
  const width = /(?:that is|and) (\d+) (?:feet|foot) wide/i.exec(text)?.[1];
  return {
    value: Number(m[1]),
    width: width ? Number(width) : undefined,
    type: (shape === "emanation" ? "radius" : shape) as AreaShape,
    units: "ft",
  };
}

/** Damage and healing parts. "7 (1d10 + 2) piercing damage", "8d6 fire damage", "taking 56 (16d6) Fire damage". */
function parseDamage(text: string): [string, string][] {
  const parts: [string, string][] = [];
  const re = new RegExp(String.raw`(?:\d+ \()?(\d+d\d+(?:\s*[+-]\s*\d+)?)\)?\s+(${DAMAGE_TYPES}) damage`, "gi");
  for (const m of text.matchAll(re)) {
    const formula = m[1]!.replace(/\s*([+-])\s*/g, " $1 ");
    const type = m[2]!.toLowerCase();
    // Skip "at higher levels" scaling sentences and repeats of the same part.
    const before = text.slice(Math.max(0, m.index! - 40), m.index);
    if (/increases by\s*$/i.test(before)) continue;
    if (!parts.some(([f, t]) => f === formula && t === type)) parts.push([formula, type]);
  }
  const heal =
    /regains? (?:a number of )?hit points equal to (\d+d\d+)(\s*(?:\+|plus) your spellcasting ability modifier)?/i.exec(text) ??
    /regains? (\d+d\d+(?:\s*\+\s*\d+)?) hit points/i.exec(text);
  if (heal) parts.push([`${heal[1]!.replace(/\s*\+\s*/g, " + ")}${heal[2] ? " + @mod" : ""}`, "healing"]);
  return parts;
}

function parseSave(text: string): ParsedEntry["save"] {
  const m = /(?:DC (\d+) )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(text)
    ?? /\b(?:DC (\d+) )?(STR|DEX|CON|INT|WIS|CHA) Save\b/.exec(text);
  return m ? { ability: ABILITIES[m[2]!.toLowerCase()]!, dc: m[1] ? Number(m[1]) : undefined } : undefined;
}

function parseUses(text: string, label = ""): Pick<ParsedEntry, "uses" | "recharge"> {
  const out: Pick<ParsedEntry, "uses" | "recharge"> = {};
  const recharge = /Recharge (\d)/i.exec(label + " " + text);
  if (recharge) out.recharge = Number(recharge[1]);
  const perDay = /(\d+)\/Day/i.exec(label);
  if (perDay) out.uses = { max: Number(perDay[1]), per: "day" };
  const charges = /has (\d+) charges/i.exec(text);
  if (charges) {
    const regain = /regains? (\d+d\d+(?:\s*[+-]\s*\d+)?|\d+|all) expended charges (?:daily )?at dawn/i.exec(text);
    out.uses = { max: Number(charges[1]), per: "dawn", recovery: regain ? (regain[1] === "all" ? charges[1] : regain[1]!.replace(/\s+/g, "")) : undefined };
  } else if (!out.uses) {
    if (/can't (?:be used|use (?:it|this property)) again until the next dawn/i.test(text)) out.uses = { max: 1, per: "dawn", recovery: "1" };
    else if (/until (?:you|it) finish(?:es)? a short or long rest/i.test(text)) out.uses = { max: 1, per: "sr" };
    else if (/until (?:you|it) finish(?:es)? a long rest/i.test(text)) out.uses = { max: 1, per: "lr" };
  }
  return out;
}

/** Attack rolls: monster stat lines (2014 and 2024) and spell attacks. */
function parseAttack(text: string): Pick<ParsedEntry, "actionType" | "attackBonus" | "range"> {
  const m = /(Melee|Ranged|Melee or Ranged) (Weapon |Spell )?Attack(?: Roll)?: \+(\d+)/i.exec(text);
  if (m) {
    const melee = /^melee/i.test(m[1]!);
    const spell = /spell/i.test(m[2] ?? "");
    const reach = /reach (\d+) ft/i.exec(text);
    const range = /range (\d+)(?:\/(\d+))? ft/i.exec(text);
    return {
      actionType: spell ? (melee ? "msak" : "rsak") : melee ? "mwak" : "rwak",
      attackBonus: Number(m[3]),
      range: melee && reach ? { value: Number(reach[1]), units: "ft" } : range ? { value: Number(range[1]), long: range[2] ? Number(range[2]) : null, units: "ft" } : undefined,
    };
  }
  const spellAttack = /(melee|ranged) spell attack/i.exec(text);
  if (spellAttack) return { actionType: spellAttack[1]!.toLowerCase() === "melee" ? "msak" : "rsak" };
  return {};
}

/** Bonuses a spell or feature grants its targets: "+1 bonus to attack rolls it makes with ranged weapons". */
function parseTargetEffects(text: string): ForgeEffect[] {
  const effects: ForgeEffect[] = [];
  for (const m of text.matchAll(/(?:a )?([+-]\d+|\d+d\d+) bonus to (attack|damage) rolls(?: (?:it|they|you|the target) makes?)?(?: with (melee|ranged|spell)? ?(?:weapons?|weapon attacks|attacks|spells?))?/gi)) {
    const value = m[1]!.startsWith("-") || m[1]!.startsWith("+") ? m[1]! : `+${m[1]}`;
    const what = m[2]!.toLowerCase();
    const kind = (m[3] ?? "").toLowerCase();
    const keys = kind === "ranged" ? ["rwak"] : kind === "melee" ? ["mwak"] : kind === "spell" ? ["msak", "rsak"] : ["mwak", "rwak", "msak", "rsak"];
    for (const k of keys) effects.push({ label: `${what === "attack" ? "Attack" : "Damage"} bonus`, key: `system.bonuses.${k}.${what}`, mode: "add", value });
  }
  const ac = /([+-]\d+) bonus to (?:its |their |your )?AC/i.exec(text);
  if (ac) effects.push({ label: "AC bonus", key: "system.attributes.ac.bonus", mode: "add", value: ac[1]! });
  const saves = /(?:a )?([+-]\d+|\d+d\d+) bonus to (?:all )?saving throws/i.exec(text);
  if (saves) effects.push({ label: "Save bonus", key: "system.bonuses.abilities.save", mode: "add", value: saves[1]!.startsWith("+") || saves[1]!.startsWith("-") ? saves[1]! : `+${saves[1]}` });
  const checks = /(?:a )?([+-]\d+|\d+d\d+) bonus to (?:all )?ability checks/i.exec(text);
  if (checks) effects.push({ label: "Check bonus", key: "system.bonuses.abilities.check", mode: "add", value: checks[1]!.startsWith("+") || checks[1]!.startsWith("-") ? checks[1]! : `+${checks[1]}` });
  const speed = /speed increases by (\d+) feet/i.exec(text);
  if (speed) effects.push({ label: "Speed", key: "system.attributes.movement.walk", mode: "add", value: speed[1]! });
  for (const m of text.matchAll(/(?:has|gains?|have) resistance to (acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/gi)) {
    effects.push({ label: `${m[1]!.toLowerCase()} resistance`, key: "system.traits.dr.value", mode: "add", value: m[1]!.toLowerCase() });
  }
  return effects;
}

/** Worn and wielded bonuses as Active Effect changes. */
function parseEffects(text: string, isArmor: boolean): { bonus?: number; effects: ForgeEffect[]; warnings: string[] } {
  const effects: ForgeEffect[] = [];
  const warnings: string[] = [];
  let bonus: number | undefined;
  const weaponBonus = /\+(\d) bonus to attack and damage rolls/i.exec(text);
  if (weaponBonus) bonus = Number(weaponBonus[1]);
  const ac = /\+(\d) bonus to (?:your )?AC/i.exec(text) ?? /\+(\d) bonus to Armor Class/i.exec(text);
  if (ac) {
    if (isArmor) bonus = Number(ac[1]);
    else effects.push({ label: "AC bonus", key: "system.attributes.ac.bonus", mode: "add", value: `+${ac[1]}` });
  }
  const saves = /\+(\d) bonus to (?:AC and )?saving throws/i.exec(text);
  if (saves) effects.push({ label: "Save bonus", key: "system.bonuses.abilities.save", mode: "add", value: `+${saves[1]}` });
  for (const [kind, key] of [["resistance", "dr"], ["immunity", "di"]] as const) {
    for (const m of text.matchAll(new RegExp(String.raw`${kind} to (${DAMAGE_TYPES})(?:,? and (${DAMAGE_TYPES}))? damage`, "gi"))) {
      for (const type of [m[1], m[2]].filter(Boolean)) effects.push({ label: `${type} ${kind}`, key: `system.traits.${key}.value`, mode: "add", value: type!.toLowerCase() });
    }
  }
  if (/resistance to one damage type|resistance to that damage/i.test(text)) warnings.push("Resistance type varies: add it to the effect yourself.");
  const dv = /darkvision (?:out )?to a range of (\d+) feet/i.exec(text);
  if (dv) effects.push({ label: "Darkvision", key: "system.attributes.senses.darkvision", mode: "upgrade", value: dv[1]! });
  const score = /your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score (?:is|changes to) (\d+)/i.exec(text);
  if (score) effects.push({ label: `${score[1]} ${score[2]}`, key: `system.abilities.${ABILITIES[score[1]!.toLowerCase()]}.value`, mode: "upgrade", value: score[2]! });
  const speed = /(?:walking )?speed increases by (\d+) feet/i.exec(text);
  if (speed) effects.push({ label: "Speed", key: "system.attributes.movement.walk", mode: "add", value: speed[1]! });
  const init = /\+(\d) bonus to initiative/i.exec(text);
  if (init) effects.push({ label: "Initiative", key: "system.attributes.init.bonus", mode: "add", value: `+${init[1]}` });
  const spellAtk = /\+(\d) bonus to spell attack rolls/i.exec(text);
  if (spellAtk) {
    effects.push({ label: "Spell attacks", key: "system.bonuses.msak.attack", mode: "add", value: `+${spellAtk[1]}` });
    effects.push({ label: "Spell attacks", key: "system.bonuses.rsak.attack", mode: "add", value: `+${spellAtk[1]}` });
  }
  const spellDc = /\+(\d) bonus to (?:your )?spell save DC/i.exec(text);
  if (spellDc) effects.push({ label: "Spell DC", key: "system.bonuses.spell.dc", mode: "add", value: `+${spellDc[1]}` });
  if (/bonus (?:to attack and damage rolls )?is determined by the (?:weapon|armor)'s rarity|\+1, \+2, or \+3/i.test(text)) {
    warnings.push("The bonus depends on rarity: set the +1/+2/+3 version you want.");
  }
  return { bonus, effects, warnings };
}

// --- Headers ------------------------------------------------------------------

const ITEM_LINE = /^(Weapon|Armor|Wondrous Item|Ring|Rod|Staff|Wand|Potion|Scroll|Ammunition)(?: \(([^)]+)\))?,\s*(common|uncommon|rare|very rare|legendary|artifact|rarity varies)[^(]*?(\(requires attunement[^)]*\))?\s*$/i;

/** Spell header line, in any of the layouts. Returns level and school code. */
function spellHeader(line: string): { level: number; school: string; ritual: boolean } | null {
  let m = /^(\d)(?:st|nd|rd|th)[- ]level (\w+)( \(ritual\))?/i.exec(line);
  if (m) return { level: Number(m[1]), school: SCHOOLS[m[2]!.toLowerCase()] ?? "", ritual: !!m[3] };
  m = /^level (\d) (\w+)/i.exec(line);
  if (m) return { level: Number(m[1]), school: SCHOOLS[m[2]!.toLowerCase()] ?? "", ritual: /ritual/i.test(line) };
  m = /^(\w+) cantrip/i.exec(line);
  if (m && SCHOOLS[m[1]!.toLowerCase()]) return { level: 0, school: SCHOOLS[m[1]!.toLowerCase()]!, ritual: false };
  return null;
}

/** "Casting Time: 1 action" or a "Casting Time" line followed by its value (D&D Beyond). */
function field(lines: string[], ...labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`^${label}\\s*:?\\s*(.*)$`, "i");
    for (let i = 0; i < lines.length; i++) {
      const m = re.exec(lines[i]!);
      if (!m) continue;
      if (m[1]) return m[1];
      const next = lines.slice(i + 1).find((l) => l);
      if (next && isShortValue(next)) return next;
    }
  }
  return undefined;
}

/** A D&D Beyond field value ("1 Action", "DEX Save", "Fire"), as opposed to a sentence of description. */
const isShortValue = (line: string) => line.length <= 40 && line.split(" ").length <= 5 && !STAT_LINE.test(line);

const STAT_LINE = /^(Casting Time|Range(?:\/Area)?|Components|Duration|Level|School|Attack\/Save|Damage\/Effect|Classes)\b/i;

function itemFromHeader(line: string, name: string, warnings: string[]): NonNullable<ParsedEntry["item"]> | null {
  const m = ITEM_LINE.exec(line);
  if (!m) return null;
  const category = m[1]!.toLowerCase();
  const detail = (m[2] ?? "").toLowerCase();
  const rarityText = m[3]!.toLowerCase();
  const rarity = rarityText === "rarity varies" ? undefined : (rarityText as Rarity | "artifact");
  if (!rarity) warnings.push("Rarity varies: set the rarity you want.");
  const item: NonNullable<ParsedEntry["item"]> = { itemType: "equipment", subtype: "trinket", rarity, attunement: !!m[4], effects: [] };
  const lowerName = name.toLowerCase();

  if (category === "weapon" || category === "staff") {
    item.itemType = "weapon";
    item.subtype = "martialM";
    const base = category === "staff" ? "Quarterstaff" : baseWeapon(detail || lowerName);
    item.base = base ?? "Longsword";
    if (!base) warnings.push(`"Weapon (${detail || "any"})": built on a ${item.base}. Change the base item if you want another.`);
  } else if (category === "armor") {
    item.subtype = "medium";
    const base = baseArmor(detail || lowerName);
    item.base = base ?? "Chain Mail";
    if (!base) warnings.push(`"Armor (${detail || "any"})": built on ${item.base}. Change the base item if you want another.`);
  } else if (category === "wand" || category === "rod") {
    item.itemType = "consumable";
    item.subtype = category;
  } else if (category === "potion" || category === "scroll") {
    item.itemType = "consumable";
    item.subtype = category;
  } else if (category === "ammunition") {
    item.itemType = "consumable";
    item.subtype = "ammo";
  } else {
    item.subtype = /cloak|boots|gloves|gauntlets|belt|bracers|circlet|helm|hat|robe|mantle|cape|slippers|vestment/.test(lowerName) ? "clothing" : "trinket";
  }
  return item;
}

const WEAPON_WORDS: [RegExp, string][] = [
  [/greatsword/, "Greatsword"], [/longsword|any sword|sword/, "Longsword"], [/shortsword/, "Shortsword"], [/rapier/, "Rapier"], [/scimitar/, "Scimitar"],
  [/greataxe/, "Greataxe"], [/battleaxe|any axe|axe/, "Battleaxe"], [/handaxe/, "Handaxe"], [/warhammer|hammer/, "Warhammer"], [/maul/, "Maul"],
  [/mace/, "Mace"], [/dagger/, "Dagger"], [/spear/, "Spear"], [/trident/, "Trident"], [/javelin/, "Javelin"], [/glaive/, "Glaive"], [/halberd/, "Halberd"],
  [/longbow/, "Longbow"], [/shortbow/, "Shortbow"], [/heavy crossbow/, "Heavy Crossbow"], [/hand crossbow/, "Hand Crossbow"], [/crossbow/, "Light Crossbow"],
  [/quarterstaff|staff/, "Quarterstaff"], [/whip/, "Whip"], [/flail/, "Flail"], [/morningstar/, "Morningstar"], [/war pick|pick/, "War Pick"],
];
const baseWeapon = (s: string) => WEAPON_WORDS.find(([re]) => re.test(s))?.[1];

const ARMOR_WORDS: [RegExp, string][] = [
  [/studded/, "Studded Leather Armor"], [/leather/, "Leather Armor"], [/hide/, "Hide Armor"], [/chain shirt/, "Chain Shirt"], [/scale/, "Scale Mail"],
  [/breastplate/, "Breastplate"], [/half plate/, "Half Plate Armor"], [/ring mail/, "Ring Mail"], [/chain mail/, "Chain Mail"], [/splint/, "Splint Armor"],
  [/plate/, "Plate Armor"], [/shield/, "Shield"],
];
const baseArmor = (s: string) => ARMOR_WORDS.find(([re]) => re.test(s))?.[1];

// --- Entry points --------------------------------------------------------------------

/** Shared mechanics from a body of text. */
function mechanics(entry: ParsedEntry, text: string, label = "") {
  Object.assign(entry, parseAttack(text));
  entry.damage = parseDamage(text);
  const save = parseSave(text);
  if (save) entry.save = save;
  const area = parseArea(text);
  if (area) entry.target = area;
  Object.assign(entry, parseUses(text, label));
  if (!entry.actionType) {
    if (entry.damage.some(([, t]) => t === "healing")) entry.actionType = "heal";
    else if (entry.save) entry.actionType = "save";
  }
}

function parseSpell(lines: string[], forcedName?: string): ParsedEntry {
  const nonEmpty = lines.filter((l) => l);
  const warnings: string[] = [];
  const name = forcedName ?? nonEmpty[0]!;
  // Header: classic/2024 line, or D&D Beyond's "Level 3rd" + "School Evocation".
  let header = nonEmpty.slice(0, 4).map(spellHeader).find(Boolean) ?? null;
  if (!header) {
    const level = field(lines, "Level");
    const school = field(lines, "School");
    if (level || school) header = { level: level && /cantrip/i.test(level) ? 0 : firstNumber(level ?? "1") || 0, school: SCHOOLS[(school ?? "").toLowerCase()] ?? "", ritual: false };
  }
  if (!header) warnings.push("Couldn't find the spell's level and school.");

  const castingTime = field(lines, "Casting Time");
  const range = field(lines, "Range/Area", "Range");
  const components = field(lines, "Components") ?? "";
  const duration = field(lines, "Duration") ?? "";
  // Body: everything that isn't the name, header or a stat line (or a D&D Beyond value under one).
  const skip = new Set<number>();
  lines.forEach((l, i) => {
    if (STAT_LINE.test(l)) {
      skip.add(i);
      if (!/:/.test(l) || /:\s*$/.test(l)) {
        const next = lines.findIndex((x, j) => j > i && x);
        if (next > 0 && isShortValue(lines[next]!)) skip.add(next);
      }
    }
  });
  const nameIndex = lines.findIndex((l) => l === name);
  const headerIndex = lines.findIndex((l) => spellHeader(l));
  const body = lines.filter((l, i) => i !== nameIndex && i !== headerIndex && !skip.has(i));
  const paras = paragraphs(body);
  const text = paras.join(" ");

  const material = /M \(([^)]*)\)/.exec(components)?.[1];
  const cost = material ? Number(/([\d,]+)\+?\s*gp/i.exec(material)?.[1]?.replace(/,/g, "") ?? 0) : 0;
  const entry: ParsedEntry = {
    kind: "spell",
    name,
    paragraphs: paras,
    activation: castingTime ? parseActivation(castingTime) : undefined,
    range: range ? parseRange(range) : undefined,
    ...parseDuration(duration),
    damage: [],
    spell: {
      level: header?.level ?? 1,
      school: header?.school ?? "",
      ritual: !!header?.ritual || /ritual/i.test(castingTime ?? ""),
      components: { v: /\bV\b/.test(components), s: /\bS\b/.test(components), m: /\bM\b/.test(components), material, consumed: !!material && /consume/i.test(material), cost },
    },
    warnings,
  };
  mechanics(entry, text);
  // D&D Beyond's "Range/Area 150 ft. (20 ft. )" carries the area size; the shape is in the text.
  if (!entry.target && range) {
    const size = /\((\d+) ft/.exec(range)?.[1];
    const shape = /(sphere|cone|cube|line|cylinder|radius)/i.exec(text)?.[1];
    if (size && shape) entry.target = { value: Number(size), type: shape.toLowerCase() as AreaShape, units: "ft" };
  }
  if (!entry.actionType) entry.actionType = "util";
  // No area: "up to three creatures" / "one creature you touch" is the target count.
  if (!entry.target) {
    const COUNT: Record<string, number> = { one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const who = /\b(?:up to )?(one|a|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:willing |other )?creatures?\b/i.exec(text);
    if (who) entry.target = { value: COUNT[who[1]!.toLowerCase()] ?? Number(who[1]), type: "creature", units: "" };
  }
  const buffs = parseTargetEffects(text);
  if (buffs.length) entry.targetEffects = buffs;
  if (/(?:normal and long )?range of .* (?:is|are) doubled/i.test(text)) entry.warnings.push("Doubled weapon range isn't something an effect can do: track it by hand.");

  // Upcasting and cantrip scaling.
  const higher = /(?:damage|healing) increases by (\d+d\d+) for each (?:spell )?slot level above/i.exec(text);
  const cantrip = /damage increases by (\d+d\d+) when you reach (?:5th level|character level 5|levels? 5)/i.exec(text);
  if (/additional creature for each (?:spell )?slot level above/i.test(text)) entry.warnings.push("Upcasting adds targets: nothing to automate, just pick more targets.");
  if (header?.level === 0 && cantrip) entry.spell!.scaling = { mode: "cantrip", formula: cantrip[1]! };
  else if (higher) entry.spell!.scaling = { mode: "level", formula: higher[1]! };
  else if (header?.level === 0 && entry.damage.length) entry.spell!.scaling = { mode: "cantrip", formula: entry.damage[0]![0].replace(/^\d+/, "1") };

  if (!entry.damage.length && /damage/i.test(text) && !/no damage/i.test(text)) warnings.push("Mentions damage, but no dice like \"8d6 fire damage\" were found.");
  return entry;
}

function parseItem(lines: string[], typeLineIndex: number, forcedName?: string): ParsedEntry {
  const warnings: string[] = [];
  const nonEmpty = lines.filter((l) => l);
  const name = forcedName ?? nonEmpty[0]!;
  const item = itemFromHeader(lines[typeLineIndex]!, name, warnings)!;
  const body = lines.filter((l, i) => i !== typeLineIndex && l !== name);
  const paras = paragraphs(body);
  const text = paras.join(" ");
  const entry: ParsedEntry = { kind: "item", name, paragraphs: paras, damage: [], item, warnings };
  mechanics(entry, text);
  const fx = parseEffects(text, item.subtype !== "trinket" && item.subtype !== "clothing" && item.itemType === "equipment");
  item.bonus = fx.bonus;
  item.effects = fx.effects;
  warnings.push(...fx.warnings);
  // On a weapon, "extra 2d6 fire damage" is a damage part to add, not a power to roll.
  if (item.itemType === "weapon") {
    entry.damage = entry.damage.filter(([, t]) => t !== "healing");
    delete entry.save;
    delete entry.actionType;
  }
  if (item.itemType === "consumable" && item.subtype === "potion") entry.activation = { type: "action", cost: 1 };
  else if (entry.uses || entry.actionType === "save") entry.activation ??= { type: /bonus action/i.test(text) ? "bonus" : "action", cost: 1 };
  if (/cast (?:the )?([a-z' ]+?) spell/i.test(text)) warnings.push(`It casts a spell (${/cast (?:the )?([a-z' ]+?) spell/i.exec(text)![1]}): add the spell to the character or roll it from their sheet.`);
  return entry;
}

/** One monster action or feature: "Name (Recharge 5-6). Text..." */
function parseFeature(name: string, label: string, text: string, kind: ParsedKind): ParsedEntry {
  const entry: ParsedEntry = { kind, name, paragraphs: [text], damage: [], warnings: [] };
  mechanics(entry, text, label);
  const cost = /Costs? (\d+) Actions?/i.exec(label)?.[1];
  if (cost) entry.activation = { type: "legendary", cost: Number(cost) };
  else if (/\bas a bonus action\b|\buses? a bonus action\b/i.test(text)) entry.activation = { type: "bonus", cost: 1 };
  else if (/\breaction\b/i.test(label + text) && /\bin response|when (?:a|an|the)\b/i.test(text)) entry.activation = { type: "reaction", cost: 1 };
  else if (entry.actionType || entry.recharge || entry.uses) entry.activation = { type: "action", cost: 1 };
  if (!entry.actionType && entry.damage.length) entry.actionType = "util";
  return entry;
}

/**
 * Parse pasted text into one or more entries. `kind` forces a reading; otherwise it's detected:
 * spells by their level line or "Casting Time", items by their "Wondrous item, rare" line, and
 * anything else is split into "Name. Text" actions/features (a statblock's Actions section works).
 */
export function parseText(raw: string, kind: ParsedKind | "auto" = "auto"): ParsedEntry[] {
  const lines = mergeOpenParens(normalizeText(raw));
  while (lines.length && !lines[0]) lines.shift();
  if (!lines.length) return [];
  const head = lines.filter((l) => l).slice(0, 6);

  const typeLine = lines.findIndex((l, i) => i <= 4 && ITEM_LINE.test(l));
  const looksSpell = head.some((l) => spellHeader(l)) || lines.some((l) => /^Casting Time\b/i.test(l));
  if (kind === "spell" || (kind === "auto" && looksSpell)) return [parseSpell(lines)];
  if (kind === "item" || (kind === "auto" && typeLine >= 0)) {
    if (typeLine >= 0) return [parseItem(lines, typeLine)];
    // Forced "item" without a type line: treat as a wondrous trinket.
    const entry = parseItem([lines[0]!, "Wondrous item, uncommon", ...lines.slice(1)], 1);
    entry.warnings.push("No item type line (e.g. \"Wondrous item, rare\") found: made it an uncommon wondrous item.");
    return [entry];
  }

  // Actions and features: split on "Name. " paragraph leads.
  const paras = paragraphs(lines);
  const entries: ParsedEntry[] = [];
  let pendingTitle: string | null = null;
  for (const p of paras) {
    const m = TITLE_LEAD.exec(p);
    if (m) {
      const text = p.slice(m[0].length);
      const featKind = kind === "auto" ? (/Attack(?: Roll)?:|saving throw|damage/i.test(text) ? "action" : "feature") : kind;
      entries.push(parseFeature(m[1]!, m[2] ?? "", text, featKind));
      pendingTitle = null;
    } else if (entries.length && !pendingTitle) {
      // A wrapped paragraph that belongs to the previous entry.
      const last = entries[entries.length - 1]!;
      last.paragraphs.push(p);
      mechanics(last, last.paragraphs.join(" "));
    } else if (!entries.length && !pendingTitle && p.length < 60 && !/[.]$/.test(p)) {
      pendingTitle = p;
    } else {
      entries.push(parseFeature(pendingTitle ?? p.slice(0, 40), "", pendingTitle ? p : p, kind === "auto" ? "feature" : kind));
      pendingTitle = null;
    }
  }
  return entries;
}

/** Short human summary of what was found, for a preview list. */
export function parsedFacts(e: ParsedEntry): [string, string][] {
  const facts: [string, string][] = [];
  const ab: Record<Ability, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  if (e.spell) {
    const lvl = e.spell.level === 0 ? "Cantrip" : `Level ${e.spell.level}`;
    facts.push(["Spell", `${lvl} ${Object.entries(SCHOOLS).find(([, v]) => v === e.spell!.school)?.[0] ?? "(school?)"}${e.spell.ritual ? " (ritual)" : ""}`]);
    const c = e.spell.components;
    facts.push(["Components", [c.v && "V", c.s && "S", c.m && `M${c.material ? ` (${c.material})` : ""}`].filter(Boolean).join(", ") || "none"]);
  }
  if (e.item) {
    facts.push(["Item", `${e.item.base ?? e.item.subtype}${e.item.rarity ? `, ${e.item.rarity}` : ""}${e.item.attunement ? " (requires attunement)" : ""}`]);
    if (e.item.bonus) facts.push(["Magic bonus", `+${e.item.bonus}`]);
    if (e.item.effects.length) facts.push(["Effects", e.item.effects.map((f) => `${f.label} (${f.value})`).join(", ")]);
  }
  if (e.activation) facts.push(["Use", `${e.activation.cost > 1 ? `${e.activation.cost} ` : ""}${e.activation.type}${e.activation.condition ? `, ${e.activation.condition}` : ""}`]);
  if (e.range) facts.push(["Range", e.range.value ? `${e.range.value}${e.range.long ? `/${e.range.long}` : ""} ${e.range.units}` : e.range.units]);
  if (e.target?.type === "creature") facts.push(["Targets", `${e.target.value} creature${e.target.value > 1 ? "s" : ""}`]);
  else if (e.target) facts.push(["Area", `${e.target.value}-ft ${e.target.type}${e.target.width ? `, ${e.target.width} ft wide` : ""}`]);
  if (e.duration) facts.push(["Duration", `${e.concentration ? "Concentration, " : ""}${e.duration.value ? `${e.duration.value} ${e.duration.units}` : e.duration.units}`]);
  if (e.attackBonus !== undefined) facts.push(["Attack", `+${e.attackBonus} (${e.actionType})`]);
  else if (e.actionType && e.actionType !== "util") facts.push(["Roll", e.actionType]);
  if (e.save) facts.push(["Save", `${e.save.dc ? `DC ${e.save.dc}` : "spell DC"} ${ab[e.save.ability]}`]);
  if (e.damage.length) facts.push(["Damage", e.damage.map(([f, t]) => `${f} ${t}`).join(" + ")]);
  if (e.spell?.scaling) facts.push(["Scaling", `+${e.spell.scaling.formula} per ${e.spell.scaling.mode === "level" ? "slot level" : "cantrip tier"}`]);
  if (e.uses) facts.push(["Uses", `${e.uses.max}/${e.uses.per}${e.uses.recovery ? `, regains ${e.uses.recovery}` : ""}`]);
  if (e.recharge) facts.push(["Recharge", `${e.recharge}-6`]);
  if (e.targetEffects?.length) facts.push(["Grants", [...new Set(e.targetEffects.map((f) => `${f.label} ${f.value}`))].join(", ")]);
  return facts;
}
