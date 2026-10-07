import { createRng, type Rng } from "./rng.ts";
import { RARITY_VALUE_GP, type Rarity } from "./data/treasure.ts";

// ---------------------------------------------------------------------------
// The Forge: unique magic items from quick templates. Everything mechanical is spelled out
// (bonus, extra damage, effects, charges, save DC) so the Foundry side can build a working item.

export type ForgeKind = "weapon" | "armor" | "wondrous" | "wand" | "relic";
export type DamageType = "fire" | "cold" | "lightning" | "thunder" | "acid" | "poison" | "necrotic" | "radiant" | "psychic" | "force";
export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const FORGE_KINDS: Record<ForgeKind, string> = {
  weapon: "Weapon",
  armor: "Armor or shield",
  wondrous: "Wondrous item",
  wand: "Wand, staff or rod",
  relic: "Relic (legendary, with lore)",
};

export const RARITIES: Rarity[] = ["common", "uncommon", "rare", "very rare", "legendary"];

/** [name, damage dice, damage type] for SRD weapons. */
export const BASE_WEAPONS: [string, string, string][] = [
  ["Dagger", "1d4", "piercing"], ["Shortsword", "1d6", "piercing"], ["Longsword", "1d8", "slashing"], ["Greatsword", "2d6", "slashing"],
  ["Rapier", "1d8", "piercing"], ["Scimitar", "1d6", "slashing"], ["Battleaxe", "1d8", "slashing"], ["Greataxe", "1d12", "slashing"],
  ["Handaxe", "1d6", "slashing"], ["Warhammer", "1d8", "bludgeoning"], ["Mace", "1d6", "bludgeoning"], ["Maul", "2d6", "bludgeoning"],
  ["Flail", "1d8", "bludgeoning"], ["Morningstar", "1d8", "piercing"], ["War Pick", "1d8", "piercing"], ["Spear", "1d6", "piercing"],
  ["Glaive", "1d10", "slashing"], ["Halberd", "1d10", "slashing"], ["Quarterstaff", "1d6", "bludgeoning"], ["Whip", "1d4", "slashing"],
  ["Javelin", "1d6", "piercing"], ["Trident", "1d6", "piercing"], ["Shortbow", "1d6", "piercing"], ["Longbow", "1d8", "piercing"],
  ["Light Crossbow", "1d8", "piercing"], ["Heavy Crossbow", "1d10", "piercing"], ["Hand Crossbow", "1d6", "piercing"],
];

export const BASE_ARMOR = ["Leather Armor", "Studded Leather Armor", "Hide Armor", "Chain Shirt", "Scale Mail", "Breastplate", "Half Plate Armor", "Ring Mail", "Chain Mail", "Splint Armor", "Plate Armor", "Shield"];

export type WondrousSlot = "ring" | "amulet" | "cloak" | "boots" | "gloves" | "belt" | "circlet" | "bracers";
export const WONDROUS_SLOTS: WondrousSlot[] = ["ring", "amulet", "cloak", "boots", "gloves", "belt", "circlet", "bracers"];
export type WandForm = "wand" | "staff" | "rod";

interface Theme {
  /** Words for names. */
  adj: string[];
  roots: string[];
  /** "of the ..." suffixes. */
  of: string[];
  look: string[];
  /** The activated power: name, area, save. */
  power: [name: string, area: string, save: Ability];
  /** Riders on a weapon hit (rare and up sometimes). */
  rider: string;
}

export const THEMES: Record<DamageType, Theme> = {
  fire: {
    adj: ["Emberforged", "Searing", "Cinder", "Blazing", "Sunfire"], roots: ["Ember", "Cinder", "Ash", "Pyre", "Flame", "Sun"],
    of: ["the Burning Hour", "the Last Pyre", "Embers", "the Red Dawn"], look: ["veins of molten orange that pulse with each heartbeat", "a blackened finish that never cools", "a faint smell of woodsmoke"],
    power: ["Scorching Burst", "15-foot cone", "dex"], rider: "the target catches fire, taking 1d4 fire damage at the start of each of its turns until it or an ally uses an action to douse the flames",
  },
  cold: {
    adj: ["Frostbitten", "Rimecut", "Glacial", "Winter's", "Hoarfrost"], roots: ["Frost", "Rime", "Winter", "Ice", "Glacier", "Snow"],
    of: ["the Long Winter", "the Frozen Tide", "Still Waters", "the North Wind"], look: ["a skin of frost that reforms within moments", "pale blue light trapped in the metal", "breath-fog curling from it in any weather"],
    power: ["Frost Lance", "60-foot line, 5 feet wide", "con"], rider: "the target's speed is reduced by 10 feet until the start of your next turn",
  },
  lightning: {
    adj: ["Stormcalled", "Crackling", "Thunderborn", "Galvanic", "Skyforged"], roots: ["Storm", "Spark", "Bolt", "Sky", "Arc", "Tempest"],
    of: ["the Tempest", "the Seventh Storm", "Living Sparks", "the High Peaks"], look: ["tiny arcs of lightning that jump between your fingers", "a faint ozone smell", "a surface that hums when a storm is near"],
    power: ["Chain Arc", "60-foot line, 5 feet wide", "dex"], rider: "the target can't take reactions until the start of its next turn",
  },
  thunder: {
    adj: ["Resounding", "Booming", "Quakeborn", "Thundering", "Clamorous"], roots: ["Thunder", "Quake", "Drum", "Roar", "Boom"],
    of: ["the Warhorn", "Breaking Walls", "the Mountain's Voice", "the Last Echo"], look: ["a low hum you can feel in your teeth", "runes that shiver like plucked strings", "a bell-like ring when tapped"],
    power: ["Shockwave", "15-foot cube", "con"], rider: "the target is pushed 10 feet away from you",
  },
  acid: {
    adj: ["Corroding", "Caustic", "Venomglass", "Etched", "Dissolving"], roots: ["Acid", "Rot", "Etch", "Bile", "Sludge"],
    of: ["the Black Mire", "Slow Ruin", "the Dissolving King", "Bitter Rains"], look: ["a slick green sheen", "pitted, bubbling metal that never wears through", "faint hissing where it rests"],
    power: ["Caustic Spray", "15-foot cone", "dex"], rider: "the target's AC is reduced by 1 until the end of its next turn (doesn't stack)",
  },
  poison: {
    adj: ["Venomous", "Toxic", "Nightshade", "Viper's", "Wasting"], roots: ["Viper", "Venom", "Asp", "Nightshade", "Fang", "Blight"],
    of: ["the Serpent Court", "Bitter Almonds", "the Widow", "Slow Sleep"], look: ["a dark green tint and a sickly-sweet smell", "serpent scales etched along it", "a single drop of venom that beads and never falls"],
    power: ["Venom Cloud", "20-foot-radius sphere", "con"], rider: "the target must succeed on a Constitution save against your item's DC or be poisoned until the end of its next turn",
  },
  necrotic: {
    adj: ["Gravebound", "Withering", "Deathsworn", "Hollow", "Ashen"], roots: ["Grave", "Doom", "Wraith", "Bone", "Shade", "Ruin"],
    of: ["the Hollow King", "the Last Breath", "Ashen Fields", "the Unquiet Dead"], look: ["a chill that leaches warmth from your hand", "bone inlay carved with funeral prayers", "shadows that pool around it in bright light"],
    power: ["Grasp of the Grave", "20-foot-radius sphere", "con"], rider: "the target can't regain hit points until the start of your next turn",
  },
  radiant: {
    adj: ["Dawnlit", "Hallowed", "Sunblessed", "Radiant", "Gleaming"], roots: ["Dawn", "Sun", "Halo", "Star", "Gleam", "Light"],
    of: ["the First Light", "the Silver Flame", "Morning", "the Saints"], look: ["a soft golden glow, like candlelight through honey", "holy symbols that brighten near undead", "warmth that soothes aching joints"],
    power: ["Searing Dawn", "30-foot cone", "con"], rider: "the target sheds dim light in a 5-foot radius and can't benefit from being invisible until the start of your next turn",
  },
  psychic: {
    adj: ["Whispering", "Dreamforged", "Mindrending", "Echoing", "Lucid"], roots: ["Whisper", "Dream", "Echo", "Mind", "Thought", "Lullaby"],
    of: ["Forgotten Names", "the Dreaming Sea", "Many Voices", "the Quiet Mind"], look: ["faint whispering just beyond hearing", "a surface that shows your reflection a moment late", "an iridescent shimmer like oil on water"],
    power: ["Mind Spike", "20-foot-radius sphere", "int"], rider: "the target has disadvantage on its next attack roll before the end of its next turn",
  },
  force: {
    adj: ["Arcane", "Spellwrought", "Starforged", "Runic", "Gravitic"], roots: ["Rune", "Star", "Arc", "Sigil", "Void", "Aegis"],
    of: ["the Archmage", "Unseen Hands", "the Starry Vault", "the Ninth Circle"], look: ["runes that drift slowly across its surface", "a faint violet shimmer", "a weightlessness, as if it floats in your grip"],
    power: ["Arcane Barrage", "15-foot cube", "dex"], rider: "the target is knocked prone if it is Large or smaller",
  },
};

export const DAMAGE_TYPES = Object.keys(THEMES) as DamageType[];

/** Mechanical effect, applied as an Active Effect on the item. */
export interface ForgeEffect {
  label: string;
  /** Actor data path, e.g. "system.attributes.ac.bonus". */
  key: string;
  mode: "add" | "upgrade" | "override";
  value: string;
}

export interface ForgePower {
  name: string;
  text: string;
  charges: number;
  /** Charges regained at dawn, as a formula. */
  recharge: string;
  /** Charges spent per use. */
  cost: number;
  save?: { ability: Ability; dc: number };
  damage?: { formula: string; type: DamageType };
  area?: string;
}

export interface ForgedItem {
  seed: string;
  name: string;
  kind: ForgeKind;
  /** What it's built on: "Longsword", "Plate Armor", "ring", "staff"... */
  base: string;
  /** dnd5e item type it becomes. */
  itemType: "weapon" | "equipment" | "consumable";
  rarity: Rarity;
  attunement: boolean;
  theme: DamageType;
  /** +1 to +3 to attack and damage (weapons) or AC (armor). */
  bonus: number;
  /** Extra damage on a hit. */
  damage: { formula: string; type: DamageType }[];
  effects: ForgeEffect[];
  power?: ForgePower;
  /** Every property in plain words, for the description. */
  properties: string[];
  appearance: string;
  /** Relics: where it came from and what it costs. */
  history?: string;
  drawback?: string;
  valueGp: number;
}

export interface ForgeOptions {
  kind?: ForgeKind | "random";
  rarity?: Rarity | "auto";
  /** Party level for "auto" rarity. */
  partyLevel?: number;
  theme?: DamageType | "random";
  /** Base weapon or armor name, wondrous slot or wand form; random if empty. */
  base?: string;
  seed?: string | number;
}

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, "very rare": 3, legendary: 4 };
const DC = [11, 13, 15, 17, 19];
const POWER_DICE = [2, 3, 5, 7, 9];
const CHARGES: [number, string][] = [[1, "1"], [3, "1d3"], [5, "1d4+1"], [7, "1d6+1"], [10, "1d6+4"]];
const ABILITY_NAMES: Record<Ability, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SLOT_ITEM: Record<WondrousSlot, string> = {
  ring: "Ring", amulet: "Amulet", cloak: "Cloak", boots: "Boots", gloves: "Gloves", belt: "Belt", circlet: "Circlet", bracers: "Bracers",
};

/** Rarity for a party level, weighted like the treasure tables. */
function autoRarity(rng: Rng, level: number): Rarity {
  if (level <= 4) return rng.weighted([["common", 15], ["uncommon", 60], ["rare", 25]] as const);
  if (level <= 10) return rng.weighted([["uncommon", 30], ["rare", 50], ["very rare", 20]] as const);
  if (level <= 16) return rng.weighted([["rare", 35], ["very rare", 50], ["legendary", 15]] as const);
  return rng.weighted([["very rare", 50], ["legendary", 50]] as const);
}

// Effects a worn item can grant, from mild to strong. [min rank, effect builder, text]
type EffectPick = [minRank: number, build: (rank: number, theme: DamageType) => { effect?: ForgeEffect; text: string }];
const WORN_EFFECTS: EffectPick[] = [
  [1, (r) => ({ effect: { label: "Protection", key: "system.attributes.ac.bonus", mode: "add", value: `+${Math.min(2, r)}` }, text: `You gain a +${Math.min(2, r)} bonus to AC.` })],
  [1, (r) => ({ effect: { label: "Warding", key: "system.bonuses.abilities.save", mode: "add", value: `+${Math.min(2, r)}` }, text: `You gain a +${Math.min(2, r)} bonus to saving throws.` })],
  [1, (_, t) => ({ effect: { label: `${t} resistance`, key: "system.traits.dr.value", mode: "add", value: t }, text: `You have resistance to ${t} damage.` })],
  [1, () => ({ effect: { label: "Fleetness", key: "system.attributes.movement.walk", mode: "add", value: "10" }, text: "Your walking speed increases by 10 feet." })],
  [1, () => ({ effect: { label: "Darkvision", key: "system.attributes.senses.darkvision", mode: "upgrade", value: "60" }, text: "You have darkvision out to 60 feet." })],
  [1, (r) => ({ effect: { label: "Alertness", key: "system.attributes.init.bonus", mode: "add", value: `+${r + 1}` }, text: `You gain a +${r + 1} bonus to initiative rolls.` })],
  [2, (r) => ({ effect: { label: "Spell focus", key: "system.bonuses.spell.dc", mode: "add", value: `+${Math.min(3, r - 1)}` }, text: `Your spell save DC increases by ${Math.min(3, r - 1)}.` })],
  [2, (r) => ({ effect: { label: "Vigor", key: "system.attributes.hp.bonuses.level", mode: "add", value: `${r - 1}` }, text: `Your hit point maximum increases by ${r - 1} for each level you have.` })],
  [3, () => ({ effect: { label: "Giant's might", key: "system.abilities.str.value", mode: "upgrade", value: "21" }, text: "Your Strength score is 21 while you wear it (no effect if it is already 21 or higher)." })],
  [3, () => ({ effect: { label: "Grace", key: "system.abilities.dex.value", mode: "upgrade", value: "19" }, text: "Your Dexterity score is 19 while you wear it (no effect if it is already 19 or higher)." })],
  [2, () => ({ text: "You can't be charmed or frightened while you are attuned to it." })],
  [1, () => ({ text: "You can breathe normally in any environment, and you have advantage on saving throws against harmful gases and vapors." })],
  [2, () => ({ text: "As a bonus action, you can turn invisible until the start of your next turn. Once used, this property can't be used again until the next dawn." })],
];

const MINOR_QUIRKS = [
  "It glows faintly (dim light in a 5-foot radius) when enemies are within 120 feet.",
  "It is always clean and never rusts, stains or dulls.",
  "It hums a few notes of an old lullaby when you sleep holding it.",
  "It points north when set down.",
  "It is warm to the touch, even in snow.",
  "Whoever holds it can speak and understand one extra language while doing so.",
  "It weighs half what it should.",
  "Animals are calm around whoever carries it.",
  "It can't be drawn or used by a creature who has lied in the last hour.",
  "It whispers your name when it is about to be stolen.",
];

const ORIGINS = [
  "forged in the last days of a fallen empire by a smith who refused to let its name die",
  "pulled from the hoard of a slain dragon, scarred by its breath",
  "carried by seven generations of a knightly order now reduced to one old woman",
  "made by a hermit wizard as payment for a debt to a fey queen",
  "found in a tomb whose walls warned, in nine languages, not to take it",
  "cooled in the blood of a giant at the end of a war no one remembers",
  "blessed by a dying god, whose last breath is still caught inside it",
  "stolen from a dwarven vault so deep the thieves never saw the sun again",
];

const DRAWBACKS = [
  "While attuned, you can't benefit from a long rest unless it lies within reach of you.",
  "Whenever you roll a 1 on an attack or save while attuned, it whispers a secret of yours aloud.",
  "While attuned, you have disadvantage on Charisma (Persuasion) checks with anyone of the faith that made it.",
  "Each dawn while attuned, make a DC 12 Wisdom save; on a failure you feel compelled to seek out its former owner's enemies.",
  "Undead and fiends within a mile always know where it is.",
  "Your shadow no longer matches your movements while you are attuned.",
];

const PROPER_SUFFIX = ["brand", "fang", "heart", "bite", "song", "caller", "maw", "edge", "ward", "bane", "keeper", "whisper"];
const RELIC_TITLES = ["the Last King", "the Unbroken Oath", "the Weeping Saint", "the Ninth Legion", "the Drowned Queen", "the Hollow Crown", "the First Smith", "the Silver Exile"];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function itemName(rng: Rng, kind: ForgeKind, base: string, theme: Theme, rarity: Rarity): string {
  if (kind === "relic") return `${rng.pick(["The", "The"])} ${base} of ${rng.pick(RELIC_TITLES)}`;
  const rank = RANK[rarity];
  // Rare and up sometimes earn a name of their own.
  if (rank >= 2 && rng.chance(0.45)) return `${rng.pick(theme.roots)}${rng.pick(PROPER_SUFFIX)}, the ${rng.pick(theme.adj)} ${base}`;
  return rng.chance(0.5) ? `${rng.pick(theme.adj)} ${base}` : `${base} of ${rng.pick(theme.of)}`;
}

export function forgeItem(opts: ForgeOptions = {}): ForgedItem {
  const rng = createRng(opts.seed);
  // A random kind only turns out to be a relic when the rarity allows legendary.
  const relicOk = !opts.rarity || opts.rarity === "auto" || opts.rarity === "legendary";
  const kind: ForgeKind = !opts.kind || opts.kind === "random"
    ? rng.weighted([["weapon", 4], ["armor", 2], ["wondrous", 3], ["wand", 2], ["relic", relicOk ? 1 : 0]] as const)
    : opts.kind;
  const rarity: Rarity = kind === "relic" ? "legendary" : !opts.rarity || opts.rarity === "auto" ? autoRarity(rng, opts.partyLevel ?? 5) : opts.rarity;
  const rank = RANK[rarity];
  const themeKey: DamageType = !opts.theme || opts.theme === "random" ? rng.pick(DAMAGE_TYPES) : opts.theme;
  const theme = THEMES[themeKey];
  const dc = DC[rank]!;

  // Relics are a weapon or a worn item, at full strength.
  const shape = kind === "relic" ? rng.pick(["weapon", "wondrous"] as const) : kind;
  let base = opts.base?.trim() || "";
  let itemType: ForgedItem["itemType"] = "equipment";
  if (shape === "weapon") {
    itemType = "weapon";
    base = BASE_WEAPONS.find(([n]) => n.toLowerCase() === base.toLowerCase())?.[0] ?? rng.pick(BASE_WEAPONS)[0];
  } else if (shape === "armor") {
    base = BASE_ARMOR.find((n) => n.toLowerCase() === base.toLowerCase()) ?? rng.pick(BASE_ARMOR);
  } else if (shape === "wondrous") {
    const slot = WONDROUS_SLOTS.find((s) => s === base.toLowerCase()) ?? rng.pick(WONDROUS_SLOTS);
    base = SLOT_ITEM[slot];
  } else {
    itemType = "consumable";
    const form = (["wand", "staff", "rod"] as const).find((f) => f === base.toLowerCase()) ?? rng.weighted([["wand", 3], ["staff", 2], ["rod", 1]] as const);
    base = cap(form);
  }

  const item: ForgedItem = {
    seed: rng.seed,
    name: itemName(rng, kind, base, theme, rarity),
    kind,
    base,
    itemType,
    rarity,
    attunement: false,
    theme: themeKey,
    bonus: 0,
    damage: [],
    effects: [],
    properties: [],
    appearance: `${cap(base.toLowerCase().startsWith("the ") ? base : `The ${base.toLowerCase()}`)} has ${rng.pick(theme.look)}.`,
    valueGp: RARITY_VALUE_GP[rarity],
  };

  const addEffects = (count: number) => {
    const pool = rng.shuffle(WORN_EFFECTS.filter(([min]) => min <= Math.max(1, rank)));
    for (const [, build] of pool.slice(0, count)) {
      const { effect, text } = build(Math.max(1, rank), themeKey);
      if (effect) item.effects.push(effect);
      item.properties.push(text);
    }
  };
  const addPower = (cost = 1) => {
    const [charges, recharge] = CHARGES[Math.max(1, rank)]!;
    const [powerName, area, save] = theme.power;
    const dice = `${POWER_DICE[rank]}d6`;
    item.power = {
      name: powerName,
      area,
      cost,
      charges,
      recharge,
      save: { ability: save, dc },
      damage: { formula: dice, type: themeKey },
      text: `As an action, you can expend ${cost === 1 ? "1 charge" : `${cost} charges`} to unleash ${powerName}: each creature in a ${area} originating from you makes a DC ${dc} ${ABILITY_NAMES[save]} saving throw, taking ${dice} ${themeKey} damage on a failed save, or half as much on a success. It has ${charges} charges and regains ${recharge} expended charges daily at dawn.`,
    };
    item.properties.push(item.power.text);
  };

  if (shape === "weapon") {
    item.bonus = Math.min(3, rank);
    if (item.bonus) item.properties.push(`You gain a +${item.bonus} bonus to attack and damage rolls made with this magic weapon.`);
    const extra = ["", rng.chance(0.5) ? "1d4" : "", "1d6", "2d6", "3d6"][rank]!;
    if (extra) {
      item.damage.push({ formula: extra, type: themeKey });
      item.properties.push(`A creature hit by it takes an extra ${extra} ${themeKey} damage.`);
    }
    if (rank >= 3 || (rank === 2 && rng.chance(0.4))) item.properties.push(`On a critical hit, ${theme.rider}.`);
    if (kind === "relic") {
      addEffects(1);
      addPower(2);
    }
  } else if (shape === "armor") {
    item.bonus = Math.min(3, rank);
    if (item.bonus) item.properties.push(`You gain a +${item.bonus} bonus to AC while you ${base === "Shield" ? "hold this shield" : "wear this armor"}.`);
    if (rank >= 2) {
      item.effects.push({ label: `${themeKey} resistance`, key: "system.traits.dr.value", mode: "add", value: themeKey });
      item.properties.push(`You have resistance to ${themeKey} damage while you ${base === "Shield" ? "hold it" : "wear it"}.`);
    }
    if (rank >= 3) addEffects(1);
  } else if (shape === "wondrous") {
    addEffects(kind === "relic" ? 3 : [1, 1, 2, 2, 3][rank]!);
    if (kind === "relic" || (rank >= 2 && rng.chance(0.5))) addPower(kind === "relic" ? 2 : 1);
  } else {
    addPower(1);
    if (base === "Staff") item.properties.push(`While holding it, you gain a +${Math.max(1, rank - 1)} bonus to spell attack rolls.`);
    if (base === "Staff") item.effects.push({ label: "Spell attacks", key: "system.bonuses.rsak.attack", mode: "add", value: `+${Math.max(1, rank - 1)}` });
    if (base === "Rod") item.properties.push(`While holding it, you have advantage on ${themeKey === "psychic" ? "Wisdom" : "Constitution"} saving throws to maintain concentration.`);
  }

  // A little personality at any rarity.
  if (rank <= 1 || rng.chance(0.5)) item.properties.push(rng.pick(MINOR_QUIRKS));
  if (kind === "relic") {
    item.history = `It was ${rng.pick(ORIGINS)}.`;
    item.drawback = rng.pick(DRAWBACKS);
    item.valueGp = RARITY_VALUE_GP.legendary * 2;
  }
  // Attunement: anything with real power (effects, charges, a big damage die) asks for it.
  item.attunement = kind === "relic" || item.effects.length > 0 || !!item.power || rank >= 3 || (rank === 2 && item.damage.length > 0);
  return item;
}

/** Forge several at once, e.g. a dragon's hoard of unique pieces. */
export function forgeItems(count: number, opts: ForgeOptions = {}): ForgedItem[] {
  const rng = createRng(opts.seed);
  return Array.from({ length: Math.max(1, Math.min(20, count)) }, (_, i) => forgeItem({ ...opts, seed: `${rng.seed}:${i}` }));
}

/** "Weapon (longsword), rare (requires attunement)" */
export function forgedSubtitle(i: ForgedItem): string {
  const kind = i.itemType === "weapon" ? `Weapon (${i.base.toLowerCase()})`
    : i.kind === "armor" ? (i.base === "Shield" ? "Armor (shield)" : `Armor (${i.base.toLowerCase()})`)
    : i.itemType === "consumable" ? i.base
    : `Wondrous item (${i.base.toLowerCase()})`;
  return `${kind}, ${i.kind === "relic" ? "artifact" : i.rarity}${i.attunement ? " (requires attunement)" : ""}`;
}
