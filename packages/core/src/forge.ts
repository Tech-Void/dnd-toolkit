import { createRng, type Rng } from "./rng.ts";
import { RARITY_VALUE_GP, type Rarity } from "./data/treasure.ts";

// ---------------------------------------------------------------------------
// The Forge: unique magic items from quick templates. Everything mechanical is spelled out
// (bonus, extra damage, effects, charges, save DC) so the Foundry side can build a working item.

export type ForgeKind = "weapon" | "armor" | "wondrous" | "wand" | "relic" | "potion" | "scroll" | "ammo";
export type DamageType = "fire" | "cold" | "lightning" | "thunder" | "acid" | "poison" | "necrotic" | "radiant" | "psychic" | "force";
export type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const FORGE_KINDS: Record<ForgeKind, string> = {
  weapon: "Weapon",
  armor: "Armor or shield",
  wondrous: "Wondrous item",
  wand: "Wand, staff or rod",
  relic: "Relic (legendary, with lore)",
  potion: "Potion, elixir or oil",
  scroll: "Scroll (one use)",
  ammo: "Ammunition",
};

/** Consumable kinds: used up rather than worn or wielded. */
export const CONSUMABLE_KINDS = new Set<ForgeKind>(["potion", "scroll", "ammo"]);
export const POTION_FORMS = ["Potion", "Elixir", "Oil", "Philter", "Draught", "Tincture"];
export const AMMO_FORMS = ["Arrows", "Crossbow Bolts", "Sling Bullets", "Blowgun Needles"];

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

export type PowerKind = "blast" | "bolt" | "heal" | "utility";

export interface ForgePower {
  kind: PowerKind;
  name: string;
  charges: number;
  /** Charges regained at dawn, as a formula. */
  recharge: string;
  /** Charges spent per use. */
  cost: number;
  save?: { ability: Ability; dc: number };
  /** Damage (blast, bolt) or healing (heal). */
  damage?: { formula: string; type: DamageType | "healing" };
  /** Area for blasts, e.g. "15-foot cone". */
  area?: string;
  /** Range in feet for bolts and heals ("touch" when 0). */
  range?: number;
  /** What a utility power does, in words. */
  effect?: string;
  /** Used up after one use (scrolls, potions) instead of recharging. */
  single?: boolean;
}

export interface ForgedItem {
  seed: string;
  name: string;
  kind: ForgeKind;
  /** What it's built on: "Longsword", "Plate Armor", "Ring", "Staff"... */
  base: string;
  /** dnd5e item type it becomes. */
  itemType: "weapon" | "equipment" | "consumable";
  rarity: Rarity;
  attunement: boolean;
  theme: DamageType;
  /** +1 to +3 to attack and damage (weapons) or AC (armor). */
  bonus: number;
  /** Extra damage on every hit. */
  damage: { formula: string; type: DamageType }[];
  /** Crits on this roll or higher (weapons). */
  critThreshold?: number;
  /** Extra damage dice on a critical hit (weapons). */
  critDamage?: string;
  /** Situational damage against one kind of foe, rolled with the weapon's "other formula". */
  bane?: { formula: string; vs: string };
  effects: ForgeEffect[];
  power?: ForgePower;
  /** Text-only properties: riders, quirks, curses. Mechanics are described by forgedProperties(). */
  notes: string[];
  appearance: string;
  cursed?: boolean;
  /** Relics: where it came from, what it costs, and whether it thinks. */
  history?: string;
  drawback?: string;
  sentience?: string;
  valueGp: number;
  /** How many come together (ammunition). */
  quantity?: number;
  /** How long a potion's effects last once drunk, e.g. "1 hour". */
  duration?: string;
}

export type CurseChance = "never" | "sometimes" | "always";

export interface ForgeOptions {
  kind?: ForgeKind | "random";
  rarity?: Rarity | "auto";
  /** Party level for "auto" rarity. */
  partyLevel?: number;
  theme?: DamageType | "random";
  /** Base weapon or armor name, wondrous slot or wand form; random if empty. */
  base?: string;
  /** Chance of a curse. Default "never". */
  curse?: CurseChance;
  seed?: string | number;
}

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, "very rare": 3, legendary: 4 };
const DC = [11, 13, 15, 17, 19];
const POWER_DICE = [2, 3, 5, 7, 9];
const CHARGES: [number, string][] = [[1, "1"], [3, "1d3"], [5, "1d4+1"], [7, "1d6+1"], [10, "1d6+4"]];
export const ABILITY_NAMES: Record<Ability, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SLOT_ITEM: Record<WondrousSlot, string> = {
  ring: "Ring", amulet: "Amulet", cloak: "Cloak", boots: "Boots", gloves: "Gloves", belt: "Belt", circlet: "Circlet", bracers: "Bracers",
};
const OPPOSITE: Record<DamageType, DamageType> = {
  fire: "cold", cold: "fire", lightning: "acid", thunder: "psychic", acid: "lightning", poison: "radiant",
  necrotic: "radiant", radiant: "necrotic", psychic: "thunder", force: "necrotic",
};
const BANE_FOES = ["undead", "fiends", "dragons", "giants", "aberrations", "fey", "constructs", "beasts", "monstrosities", "celestials", "elementals", "lycanthropes", "goblinoids", "orcs"];

// ---------------------------------------------------------------------------
// Effect catalog: everything an item can do to its bearer, for both the generator and the manual editor.

export interface EffectTemplate {
  id: string;
  label: string;
  key: string;
  mode: ForgeEffect["mode"];
  /** Example value shown in the editor. */
  sample: string;
}

export const EFFECT_CATALOG: EffectTemplate[] = [
  { id: "ac", label: "AC bonus", key: "system.attributes.ac.bonus", mode: "add", sample: "+1" },
  { id: "saves", label: "Saving throw bonus", key: "system.bonuses.abilities.save", mode: "add", sample: "+1" },
  { id: "checks", label: "Ability check bonus", key: "system.bonuses.abilities.check", mode: "add", sample: "+1" },
  { id: "skills", label: "Skill check bonus", key: "system.bonuses.abilities.skill", mode: "add", sample: "+2" },
  { id: "init", label: "Initiative bonus", key: "system.attributes.init.bonus", mode: "add", sample: "+2" },
  { id: "dr", label: "Damage resistance", key: "system.traits.dr.value", mode: "add", sample: "fire" },
  { id: "di", label: "Damage immunity", key: "system.traits.di.value", mode: "add", sample: "poison" },
  { id: "dv", label: "Damage vulnerability", key: "system.traits.dv.value", mode: "add", sample: "cold" },
  { id: "ci", label: "Condition immunity", key: "system.traits.ci.value", mode: "add", sample: "frightened" },
  { id: "darkvision", label: "Darkvision", key: "system.attributes.senses.darkvision", mode: "upgrade", sample: "60" },
  { id: "blindsight", label: "Blindsight", key: "system.attributes.senses.blindsight", mode: "upgrade", sample: "10" },
  { id: "tremorsense", label: "Tremorsense", key: "system.attributes.senses.tremorsense", mode: "upgrade", sample: "30" },
  { id: "truesight", label: "Truesight", key: "system.attributes.senses.truesight", mode: "upgrade", sample: "30" },
  { id: "walk", label: "Walking speed +", key: "system.attributes.movement.walk", mode: "add", sample: "10" },
  { id: "fly", label: "Flying speed", key: "system.attributes.movement.fly", mode: "upgrade", sample: "30" },
  { id: "swim", label: "Swimming speed", key: "system.attributes.movement.swim", mode: "upgrade", sample: "30" },
  { id: "climb", label: "Climbing speed", key: "system.attributes.movement.climb", mode: "upgrade", sample: "30" },
  { id: "mwak", label: "Melee attack bonus", key: "system.bonuses.mwak.attack", mode: "add", sample: "+1" },
  { id: "rwak", label: "Ranged attack bonus", key: "system.bonuses.rwak.attack", mode: "add", sample: "+1" },
  { id: "mwakd", label: "Melee damage bonus", key: "system.bonuses.mwak.damage", mode: "add", sample: "+1d4" },
  { id: "rwakd", label: "Ranged damage bonus", key: "system.bonuses.rwak.damage", mode: "add", sample: "+1d4" },
  { id: "spellatk", label: "Spell attack bonus", key: "system.bonuses.rsak.attack", mode: "add", sample: "+1" },
  { id: "spelldc", label: "Spell save DC bonus", key: "system.bonuses.spell.dc", mode: "add", sample: "+1" },
  { id: "hp", label: "Hit points per level", key: "system.attributes.hp.bonuses.level", mode: "add", sample: "1" },
  ...(["str", "dex", "con", "int", "wis", "cha"] as Ability[]).flatMap((a): EffectTemplate[] => [
    { id: `${a}set`, label: `${ABILITY_NAMES[a]} becomes`, key: `system.abilities.${a}.value`, mode: "upgrade", sample: "19" },
    { id: `${a}add`, label: `${ABILITY_NAMES[a]} +`, key: `system.abilities.${a}.value`, mode: "add", sample: "2" },
  ]),
];

/** One plain-English sentence for an effect. */
export function effectText(e: ForgeEffect): string {
  const v = e.value;
  const n = v.replace(/^\+/, "");
  const sense = /senses\.(\w+)$/.exec(e.key)?.[1];
  const move = /movement\.(\w+)$/.exec(e.key)?.[1];
  const ability = /abilities\.(\w{3})\.value$/.exec(e.key)?.[1] as Ability | undefined;
  const attack = /bonuses\.(mwak|rwak|msak|rsak)\.(attack|damage)$/.exec(e.key);
  if (e.key.endsWith("ac.bonus")) return `You gain a +${n} bonus to AC.`;
  if (e.key.endsWith("abilities.save")) return `You gain a +${n} bonus to saving throws.`;
  if (e.key.endsWith("abilities.check")) return `You gain a +${n} bonus to ability checks.`;
  if (e.key.endsWith("abilities.skill")) return `You gain a +${n} bonus to skill checks.`;
  if (e.key.endsWith("init.bonus")) return `You gain a +${n} bonus to initiative rolls.`;
  if (e.key.endsWith("dr.value")) return `You have resistance to ${v} damage.`;
  if (e.key.endsWith("di.value")) return `You are immune to ${v} damage.`;
  if (e.key.endsWith("dv.value")) return `You are vulnerable to ${v} damage.`;
  if (e.key.endsWith("ci.value")) return `You can't be ${v}.`;
  if (sense) return `You have ${sense} out to ${n} feet.`;
  if (move === "walk") return `Your walking speed increases by ${n} feet.`;
  if (move) return `You have a ${move === "fly" ? "flying" : move === "swim" ? "swimming" : move === "climb" ? "climbing" : move} speed of ${n} feet${e.mode === "upgrade" ? " (unless yours is already faster)" : ""}.`;
  if (attack) return `You gain a +${n} bonus to ${{ mwak: "melee weapon", rwak: "ranged weapon", msak: "melee spell", rsak: "spell" }[attack[1]!]} ${attack[2]} rolls.`;
  if (e.key.endsWith("spell.dc")) return `Your spell save DC increases by ${n}.`;
  if (e.key.endsWith("hp.bonuses.level")) return `Your hit point maximum increases by ${n} for each level you have.`;
  if (ability && e.mode === "upgrade") return `Your ${ABILITY_NAMES[ability]} score is ${n} while you have it (no effect if yours is already higher).`;
  if (ability) return `Your ${ABILITY_NAMES[ability]} score increases by ${n}.`;
  return `${e.label}: ${e.key} ${e.mode} ${v}.`;
}

/** The power in words, from its numbers. */
export function powerText(p: ForgePower): string {
  const cost = p.cost === 1 ? "1 charge" : `${p.cost} charges`;
  const tail = p.single ? "" : ` It has ${p.charges} charges and regains ${p.recharge} expended charges daily at dawn.`;
  const save = p.save ? `DC ${p.save.dc} ${ABILITY_NAMES[p.save.ability]} saving throw` : "";
  const dmg = p.damage ? `${p.damage.formula} ${p.damage.type}` : "";
  if (p.single) {
    switch (p.kind) {
      case "blast":
        return `${p.name}: each creature in a ${p.area ?? "15-foot cone"} originating from you makes a ${save}, taking ${dmg} damage on a failed save, or half as much on a success.`;
      case "bolt":
        return `${p.name}: make a ranged spell attack against a creature within ${p.range ?? 120} feet (use your spell attack bonus, or +${(p.save?.dc ?? 13) - 8} if you have none). On a hit it takes ${dmg} damage.`;
      case "heal":
        return `${p.name}: the drinker (or a creature you touch) regains ${p.damage?.formula ?? "2d4 + 2"} hit points.`;
      default:
        return `${p.name}: ${p.effect ?? "something remarkable happens"}.`;
    }
  }
  switch (p.kind) {
    case "blast":
      return `As an action, you can expend ${cost} to unleash ${p.name}: each creature in a ${p.area ?? "15-foot cone"} originating from you makes a ${save}, taking ${dmg} damage on a failed save, or half as much on a success.${tail}`;
    case "bolt":
      return `As an action, you can expend ${cost} to hurl ${p.name} at a creature within ${p.range ?? 120} feet. Make a ranged spell attack; on a hit it takes ${dmg} damage.${tail}`;
    case "heal":
      return `As an action, you can expend ${cost} to invoke ${p.name}: a creature you touch regains ${p.damage?.formula ?? "2d8"} hit points.${tail}`;
    default:
      return `As ${/bonus action/i.test(p.effect ?? "") ? "a bonus action" : "an action"}, you can expend ${cost} to invoke ${p.name}: ${p.effect ?? "it does something remarkable"}.${tail}`;
  }
}

/** Every property in words: the numbers first, then the notes. */
export function forgedProperties(i: ForgedItem): string[] {
  const lines: string[] = [];
  if (i.bonus) {
    lines.push(i.itemType === "weapon" || i.kind === "ammo"
      ? `You gain a +${i.bonus} bonus to attack and damage rolls made with this magic ${i.kind === "ammo" ? "ammunition" : "weapon"}.`
      : `You gain a +${i.bonus} bonus to AC while you ${i.base === "Shield" ? "hold this shield" : "wear this armor"}.`);
  }
  for (const d of i.damage) lines.push(`A creature hit by it takes an extra ${d.formula} ${d.type} damage.`);
  if (i.critThreshold && i.critThreshold < 20) lines.push(`Attacks with it score a critical hit on a roll of ${i.critThreshold} or 20.`);
  if (i.critDamage) lines.push(`On a critical hit, the target takes an extra ${i.critDamage} damage of the weapon's type.`);
  if (i.bane) lines.push(`Against ${i.bane.vs}, it deals an extra ${i.bane.formula} damage (roll the item's other formula).`);
  if (i.kind === "potion" && (i.effects.length || i.duration)) lines.push(`When you drink it, for ${i.duration ?? "1 hour"}:`);
  for (const e of i.effects) lines.push(effectText(e));
  if (i.power) lines.push(powerText(i.power));
  lines.push(...i.notes);
  return lines;
}

// ---------------------------------------------------------------------------
// Random tables

/** Rarity for a party level, weighted like the treasure tables. */
function autoRarity(rng: Rng, level: number): Rarity {
  if (level <= 4) return rng.weighted([["common", 15], ["uncommon", 60], ["rare", 25]] as const);
  if (level <= 10) return rng.weighted([["uncommon", 30], ["rare", 50], ["very rare", 20]] as const);
  if (level <= 16) return rng.weighted([["rare", 35], ["very rare", 50], ["legendary", 15]] as const);
  return rng.weighted([["very rare", 50], ["legendary", 50]] as const);
}

const fx = (id: string, value: string, label?: string): ForgeEffect => {
  const t = EFFECT_CATALOG.find((e) => e.id === id)!;
  return { label: label ?? t.label, key: t.key, mode: t.mode, value };
};

// Effects a worn item can grant: [min rank, builder]. Builders return an effect or a text-only note.
type EffectPick = [minRank: number, build: (rng: Rng, rank: number, theme: DamageType) => ForgeEffect | string];
const WORN_EFFECTS: EffectPick[] = [
  [1, (_, r) => fx("ac", `+${Math.min(2, r)}`, "Protection")],
  [1, (_, r) => fx("saves", `+${Math.min(2, r)}`, "Warding")],
  [1, (_, __, t) => fx("dr", t, `${t} resistance`)],
  [1, () => fx("walk", "10", "Fleetness")],
  [1, () => fx("darkvision", "60")],
  [1, (_, r) => fx("init", `+${r + 1}`, "Alertness")],
  [1, (_, r) => fx("checks", `+${Math.min(2, r)}`, "Competence")],
  [1, () => fx("climb", "30", "Spider climb")],
  [1, () => fx("swim", "30", "Tidewalker")],
  [1, (rng) => fx("rwak", `+${rng.int(1, 2)}`, "Steady aim")],
  [2, (_, r) => fx("spelldc", `+${Math.min(3, r - 1)}`, "Spell focus")],
  [2, (_, r) => fx("spellatk", `+${Math.min(3, r - 1)}`, "Spell edge")],
  [2, (_, r) => fx("hp", `${r - 1}`, "Vigor")],
  [2, (rng) => fx("ci", rng.pick(["frightened", "charmed", "poisoned", "paralyzed"]), "Steadfast")],
  [2, () => fx("blindsight", "10", "Battle sense")],
  [2, () => fx("tremorsense", "30", "Earth sense")],
  [2, (rng) => fx("mwakd", rng.pick(["+1d4", "+2"]), "Brutality")],
  [2, (rng) => fx(`${rng.pick(["str", "dex", "con", "int", "wis", "cha"])}add`, "2", "Enhancement")],
  [3, (rng) => fx("fly", rng.pick(["30", "50"]), "Flight")],
  [3, () => fx("strset", "21", "Giant's might")],
  [3, () => fx("dexset", "19", "Grace")],
  [3, () => fx("conset", "19", "Fortitude")],
  [3, () => fx("intset", "19", "Intellect")],
  [3, (_, __, t) => fx("di", t, `${t} immunity`)],
  [4, () => fx("truesight", "30", "True sight")],
  [2, () => "You can't be charmed or frightened while you are attuned to it."],
  [1, () => "You can breathe normally in any environment, and you have advantage on saving throws against harmful gases and vapors."],
  [2, () => "As a bonus action, you can turn invisible until the start of your next turn. Once used, this property can't be used again until the next dawn."],
  [1, () => "You can't be surprised while you are conscious and attuned to it."],
  [1, () => "You don't need to sleep; instead you rest in a waking trance for 4 hours to gain the benefits of a long rest."],
  [2, () => "When you fall, you descend 60 feet per round and take no falling damage."],
  [2, () => "You can speak with beasts as if you shared a language."],
  [3, () => "When you drop to 0 hit points, you drop to 1 hit point instead. Once used, this property can't be used again until the next dawn."],
  [3, () => "You have advantage on saving throws against spells and other magical effects."],
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
  "It smells faintly of rain, no matter how dry the weather.",
  "Its reflection shows how it looked on the day it was made.",
  "Candles gutter when it is unsheathed or uncovered.",
  "It hums in harmony with any music played nearby.",
  "It leaves a trail of tiny sparks when swung or waved.",
  "Cats will not stay in the same room as it.",
  "It floats in water and always drifts back toward its owner.",
  "It grows cold when someone nearby is lying.",
  "Faint runes on it spell out the name of whoever last died within 30 feet.",
  "It feels lighter in the hands of the brave.",
];

const CONSUMABLE_QUIRKS = [
  "It tastes awful, like pond water and pennies.",
  "Whoever uses it hiccups bubbles for an hour.",
  "Your hair turns a vivid color for a day.",
  "It hums a single note until it's used.",
  "Its label is in a language nobody at the table can read.",
  "Your voice drops an octave for an hour.",
  "Small flowers bloom wherever a drop of it falls.",
];

/** Curses for things that get used up. */
const CONSUMABLE_CURSES: Record<"potion" | "scroll" | "ammo", string[]> = {
  potion: [
    "It's tainted: the drinker must also succeed on a DC 13 Constitution save or be poisoned for 1 hour.",
    "The drinker's voice is replaced by a stranger's for a day.",
    "The drinker can't regain hit points from any other source for 1 hour.",
    "The drinker shrinks one size category for 1d4 hours, along with everything they wear.",
    "Whatever it does, the drinker also falls into a deep sleep 1 hour later (DC 13 Constitution save to resist).",
  ],
  scroll: [
    "Reading it also deals {theme} damage to the reader equal to half the damage it deals (or 2d6, if it deals none).",
    "The reader has disadvantage on all saving throws until the end of their next turn.",
    "A minor fiend appears beside the reader as the scroll burns, and it is not friendly.",
    "The reader forgets the last hour of their life.",
  ],
  ammo: [
    "Each shot has a 1 in 6 chance to veer toward the nearest ally instead.",
    "A creature it kills rises as a zombie at the next midnight.",
    "Whoever fires it can't take reactions until the start of their next turn.",
  ],
};

const WEAPON_RIDERS = [
  "When you roll a 20 on an attack with it, the target is blinded until the start of your next turn.",
  "Whenever it reduces a creature to 0 hit points, you gain temporary hit points equal to your proficiency bonus.",
  "As a bonus action, you can make it shed bright light in a 20-foot radius and dim light for 20 feet more, or douse it.",
  "If it is thrown, it returns to your hand immediately after the attack.",
  "You can't be disarmed of it while you are conscious.",
  "It ignores resistance to its damage type.",
  "When you hit a creature that hasn't acted yet this combat, the hit deals an extra die of the weapon's damage.",
  "Once per turn, when you hit a creature you can see that is within 5 feet of an ally, you deal an extra 1d6 damage.",
];

const CURSES = [
  "While attuned, you can't voluntarily part with it; it reappears in your pack if discarded.",
  "Attuning to it is easy; ending the attunement takes a remove curse spell.",
  "Each time you use its power, you take 1d6 psychic damage that can't be reduced.",
  "Beasts are hostile to you and attack on sight.",
  "Once per day, the DM can make you reroll a successful saving throw and take the lower result.",
  "Coins you carry slowly turn to lead: you lose 1d10 gp each dawn.",
  "Holy water burns you as if you were undead.",
  "You can't speak above a whisper while attuned.",
  "Each night, a stranger's dream plays in your sleep; on a 1 on a d20 you wake with a level of exhaustion.",
  "While attuned, you have disadvantage on Wisdom saving throws against being charmed.",
  "It drinks a little of its bearer's warmth: you need twice as much food and water.",
  "Each dusk, make a DC 13 Wisdom save; on a failure you're compelled to pick a fight before dawn.",
  "Your reflection no longer appears in mirrors while you are attuned to it.",
  "Healing you receive from spells is reduced by 1 per die.",
  "Whenever you roll a natural 1 on an attack, you take damage equal to the item's bonus damage.",
  "It whispers your secrets aloud when you lie.",
];

/** Mechanical curses: an Active Effect that hurts. */
const CURSE_EFFECTS: ((theme: DamageType) => ForgeEffect)[] = [
  (t) => fx("dv", OPPOSITE[t], `Curse: ${OPPOSITE[t]} vulnerability`),
  () => fx("saves", "-1", "Curse: frailty"),
  () => fx("ac", "-1", "Curse: clumsiness"),
  () => fx("init", "-5", "Curse: dread"),
  () => fx("walk", "-10", "Curse: leaden feet"),
  () => fx("hp", "-1", "Curse: withering"),
];

/** Lines and effects that make up a curse. */
export const isCurseNote = (n: string) => n.startsWith("Curse.");
export const isCurseEffect = (e: ForgeEffect) => e.label.startsWith("Curse:");

/** Give an item a curse (replacing any it has): a mechanical penalty or a nasty property. */
export function curseItem(item: ForgedItem, seed?: string | number): ForgedItem {
  const rng = createRng(seed);
  const clean = liftCurse(item);
  const cursed: ForgedItem = { ...clean, cursed: true, attunement: true, effects: [...clean.effects], notes: [...clean.notes] };
  if (rng.chance(0.4)) cursed.effects.push(rng.pick(CURSE_EFFECTS)(item.theme));
  cursed.notes.push(`Curse. ${rng.pick(CURSES)}`);
  return cursed;
}

/** Remove any curse; the item keeps everything else. */
export function liftCurse(item: ForgedItem): ForgedItem {
  return { ...item, cursed: undefined, effects: item.effects.filter((e) => !isCurseEffect(e)), notes: item.notes.filter((n) => !isCurseNote(n)) };
}

const ORIGINS = [
  "forged in the last days of a fallen empire by a smith who refused to let its name die",
  "pulled from the hoard of a slain dragon, scarred by its breath",
  "carried by seven generations of a knightly order now reduced to one old woman",
  "made by a hermit wizard as payment for a debt to a fey queen",
  "found in a tomb whose walls warned, in nine languages, not to take it",
  "cooled in the blood of a giant at the end of a war no one remembers",
  "blessed by a dying god, whose last breath is still caught inside it",
  "stolen from a dwarven vault so deep the thieves never saw the sun again",
  "fished from a lake that had swallowed a city a thousand years before",
  "assembled from the relics of three saints who hated each other in life",
  "won in a game of riddles against a sphinx who still wants it back",
  "grown, not made, in the heart of a crystal that took a century to bloom",
];

const DRAWBACKS = [
  "While attuned, you can't benefit from a long rest unless it lies within reach of you.",
  "Whenever you roll a 1 on an attack or save while attuned, it whispers a secret of yours aloud.",
  "While attuned, you have disadvantage on Charisma (Persuasion) checks with anyone of the faith that made it.",
  "Each dawn while attuned, make a DC 12 Wisdom save; on a failure you feel compelled to seek out its former owner's enemies.",
  "Undead and fiends within a mile always know where it is.",
  "Your shadow no longer matches your movements while you are attuned.",
  "Flowers wilt and milk sours in your presence.",
  "You age one day for each charge you spend.",
];

const SENTIENCE = {
  personality: ["proud and grandiloquent", "gloomy and fatalistic", "childlike and curious", "cold and calculating", "jovial and boastful", "pious and judgmental", "sly and mischievous", "weary and kind"],
  purpose: ["destroy the undead", "protect the innocent", "avenge its maker", "find its missing twin", "see its bearer crowned", "preserve forbidden knowledge", "end a particular bloodline", "return home"],
  voice: ["speaks telepathically to its bearer", "speaks aloud in an old, formal dialect", "communicates through feelings and visions", "sings rather than speaks"],
};

const PROPER_SUFFIX: Record<"weapon" | "armor" | "worn", string[]> = {
  weapon: ["brand", "fang", "bite", "edge", "bane", "caller", "maw", "song", "reaver", "thorn", "claw", "fury"],
  armor: ["ward", "aegis", "bulwark", "shell", "mantle", "guard", "keep", "hide", "wall"],
  worn: ["heart", "keeper", "whisper", "sigil", "charm", "eye", "token", "crown", "band", "tear"],
};
const RELIC_TITLES = ["the Last King", "the Unbroken Oath", "the Weeping Saint", "the Ninth Legion", "the Drowned Queen", "the Hollow Crown", "the First Smith", "the Silver Exile", "the Starless Night", "the Thousand Graves", "the Sundered Throne", "the Twice-Born"];

// Utility powers that spend charges.
const UTILITY_POWERS: [name: string, effect: string, minRank: number][] = [
  ["Blink Step", "as a bonus action, you teleport up to 30 feet to an unoccupied space you can see", 1],
  ["Veil", "you become invisible for 1 minute or until you attack or cast a spell", 2],
  ["Ward of Ages", "you and up to five creatures you choose within 30 feet gain 2d8 temporary hit points", 2],
  ["Wind Walk", "for 10 minutes you gain a flying speed equal to your walking speed", 2],
  ["Far Speech", "you send a 25-word message to a creature you know on the same plane, which can reply", 1],
  ["Stone Shape", "you reshape a 5-foot cube of stone into any form you like", 2],
  ["Haste", "for 1 minute you gain +2 to AC, double speed and an extra action each turn (concentration)", 3],
  ["Plane Door", "you open a 10-foot door to a location you have seen within 500 feet, which stays open for 1 round", 3],
  ["Sanctuary", "until the end of your next turn, creatures must succeed on a Wisdom save against the item's DC to target you", 1],
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function itemName(rng: Rng, kind: ForgeKind, shape: string, base: string, theme: Theme, rarity: Rarity): string {
  if (kind === "relic") return `The ${base} of ${rng.pick(RELIC_TITLES)}`;
  const rank = RANK[rarity];
  const suffixes = PROPER_SUFFIX[shape === "weapon" ? "weapon" : shape === "armor" ? "armor" : "worn"];
  // Rare and up sometimes earn a name of their own.
  if (rank >= 2 && rng.chance(0.45)) {
    const proper = `${rng.pick(theme.roots)}${rng.pick(suffixes)}`;
    return rng.chance(0.5) ? `${proper}, the ${rng.pick(theme.adj)} ${base}` : `${proper}, ${base} of ${rng.pick(theme.of)}`;
  }
  return rng.chance(0.5) ? `${rng.pick(theme.adj)} ${base}` : `${base} of ${rng.pick(theme.of)}`;
}

function rollPower(rng: Rng, rank: number, themeKey: DamageType, theme: Theme, cost = 1): ForgePower {
  const [charges, recharge] = CHARGES[Math.max(1, rank)]!;
  const dc = DC[rank]!;
  const kind = rng.weighted([["blast", 4], ["bolt", 3], ["heal", themeKey === "radiant" ? 4 : 1], ["utility", 2]] as const);
  const base = { charges, recharge, cost };
  if (kind === "blast") {
    const [name, area, save] = theme.power;
    return { ...base, kind, name, area, save: { ability: save, dc }, damage: { formula: `${POWER_DICE[rank]}d6`, type: themeKey } };
  }
  if (kind === "bolt") {
    return { ...base, kind, name: `${rng.pick(theme.roots)} Bolt`, range: 120, damage: { formula: `${Math.max(2, rank * 2)}d10`, type: themeKey } };
  }
  if (kind === "heal") {
    return { ...base, kind, name: rng.pick(["Mending Light", "Second Wind", "Lifebloom", "Saint's Touch"]), range: 0, damage: { formula: `${rank + 1}d8 + ${rank * 2}`, type: "healing" } };
  }
  const options = UTILITY_POWERS.filter(([, , min]) => min <= Math.max(1, rank));
  const [name, effect] = rng.pick(options);
  return { ...base, kind, name, effect, save: /Wisdom save/.test(effect) ? { ability: "wis", dc } : undefined };
}

// ---------------------------------------------------------------------------
// Consumables: potions, scrolls and ammunition.

const POTION_LOOKS = [
  "swirls like liquid silver", "is thick and red as old wine", "fizzes and pops against the glass", "glows faintly from within",
  "is clear as water but heavy as mercury", "separates into three colored layers until shaken", "smells of cut grass and thunderstorms",
  "has a tiny live minnow swimming in it", "is cloudy and smells of honey", "is so dark it seems to drink the light", "tastes of cinnamon and copper",
  "steams gently, though it's cold to the touch",
];
/** Price by rarity: one potion or scroll, or a whole stack of ammunition. */
const CONSUMABLE_VALUE = [50, 150, 500, 2500, 10000];
const AMMO_VALUE = [100, 300, 1000, 3000, 8000];
const POTION_DURATION = ["10 minutes", "1 hour", "1 hour", "8 hours", "8 hours"];
const POTION_HEAL = ["2d4 + 2", "4d4 + 4", "8d4 + 8", "10d4 + 20", "12d4 + 30"];

/** Things a potion can do for a while, as text: [name, effect, min rank]. */
const POTION_UTILITY: [string, string, number][] = [
  ["Night Eyes", "you can see in darkness, magical or not, out to 60 feet", 0],
  ["Feather Step", "you can walk across liquids and loose sand as if they were solid ground", 1],
  ["Beast Tongue", "you can speak with beasts and understand their replies", 0],
  ["Clear Mind", "you are immune to the charmed and frightened conditions", 1],
  ["Shadow Skin", "you have advantage on Dexterity (Stealth) checks, and you can hide while lightly obscured", 1],
  ["Truthful Tongue", "you can't speak a deliberate lie, and you know when someone speaking to you does", 1],
  ["Stoneflesh", "you have resistance to bludgeoning, piercing and slashing damage, but your speed is halved", 2],
  ["Mist Form", "you can turn into mist as an action (as the gaseous form spell) and back again as a bonus action", 2],
  ["Second Sight", "you can see invisible creatures and objects, and into the Ethereal Plane out to 30 feet", 2],
  ["Giant's Draught", "you grow to Large size: advantage on Strength checks and saves, and your weapons deal an extra 1d4 damage", 1],
  ["Blinkwine", "once on each of your turns, you can teleport up to 15 feet as part of your movement", 2],
  ["Ironwill", "you have advantage on all saving throws", 3],
  ["Phoenix Draught", "if you drop to 0 hit points, you instead return to life with half your hit points in a burst of flame (once)", 3],
  ["Tongues", "you understand every spoken language and every creature that knows a language understands you", 1],
  ["Spider's Grace", "you can climb on walls and ceilings with your hands free, at your walking speed", 0],
];

/** Oils go on a weapon or armor: [name, effect with {theme} and {dice}, min rank]. */
const OIL_EFFECTS: [string, string, number][] = [
  ["Searing Oil", "for 1 hour, a weapon coated with it deals an extra {dice} {theme} damage on a hit", 0],
  ["Keen Oil", "for 1 hour, a weapon coated with it scores a critical hit on a roll of 19 or 20", 2],
  ["Ghost Oil", "for 1 hour, a weapon coated with it counts as magical and can strike ethereal and incorporeal creatures normally", 1],
  ["Warding Oil", "for 1 hour, armor coated with it grants resistance to {theme} damage", 1],
  ["Silvershine Oil", "for 1 hour, a weapon coated with it counts as silvered and sheds dim light in a 10-foot radius", 0],
];

/** Riders for magic ammunition: [text with {dc}, {theme}, {dice}, min rank]. */
const AMMO_RIDERS: [string, number][] = [
  ["On a hit, the shot bursts: each creature within 5 feet of the target makes a DC {dc} Dexterity save, taking {dice} {theme} damage on a failure, or half as much on a success.", 1],
  ["It ignores half and three-quarters cover.", 1],
  ["A creature hit sheds dim light in a 10-foot radius and can't benefit from being invisible for 1 minute.", 0],
  ["On a hit, the target must succeed on a DC {dc} Strength save or be knocked prone.", 1],
  ["On a hit, the target's speed is reduced by 10 feet until the start of your next turn.", 0],
  ["If you speak a creature's name as you fire, the shot curves to reach it, even around corners, within normal range.", 2],
  ["On a hit, the shot trails a whistling shriek audible for a mile, and the target has disadvantage on its next attack roll.", 0],
];

function consumable(rng: Rng, kind: "potion" | "scroll" | "ammo", rarity: Rarity, themeKey: DamageType, base: string): ForgedItem {
  const rank = RANK[rarity];
  const theme = THEMES[themeKey];
  const item: ForgedItem = {
    seed: rng.seed, name: "", kind, base, itemType: "consumable", rarity, attunement: false, theme: themeKey,
    bonus: 0, damage: [], effects: [], notes: [], appearance: "", valueGp: (kind === "ammo" ? AMMO_VALUE : CONSUMABLE_VALUE)[rank]!,
  };
  if (kind === "scroll") {
    const power = rollPower(rng, rank, themeKey, theme);
    item.power = { ...power, charges: 1, recharge: "", single: true };
    item.name = `Scroll of ${power.name}`;
    item.base = "Scroll";
    item.appearance = `The scroll is sealed with ${rng.pick(["black wax", "a gold ribbon", "a lead seal", "a thorny vine", "a knot of red thread", "a drop of amber"])}, and its writing has ${rng.pick(theme.look)}.`;
    item.notes.push("Anyone can read it aloud as an action; no spellcasting needed. It crumbles to dust afterward.");
    return item;
  }
  if (kind === "ammo") {
    base = AMMO_FORMS.includes(base) ? base : rng.pick(AMMO_FORMS);
    item.base = base;
    item.quantity = [20, 10, 10, 5, 3][rank]!;
    item.bonus = Math.min(3, rank);
    const extra = ["", "1d4", "1d6", "2d6", "3d6"][rank]!;
    if (extra) item.damage.push({ formula: extra, type: themeKey });
    const dc = DC[rank]!;
    for (const [text] of rng.shuffle(AMMO_RIDERS.filter(([, min]) => min <= rank)).slice(0, rank >= 3 ? 2 : 1)) {
      item.notes.push(text.replace("{dc}", String(dc)).replace("{theme}", themeKey).replace("{dice}", `${Math.max(1, rank)}d6`));
    }
    if (rank >= 3 && rng.chance(0.4)) {
      const foe = rng.pick(BANE_FOES);
      item.notes.push(`Slaying: when one hits one of the ${foe}, the target makes a DC ${dc} Constitution save, taking an extra 6d10 piercing damage on a failure, or half as much on a success.`);
    }
    item.notes.push("Each piece loses its magic once it hits a target.");
    item.name = rng.chance(0.5) ? `${rng.pick(theme.adj)} ${base}` : `${base} of ${rng.pick(theme.of)}`;
    item.appearance = `The ${base.toLowerCase()} have ${rng.pick(theme.look)}.`;
    return item;
  }
  // Potions, elixirs and oils.
  base = POTION_FORMS.includes(base) ? base : rng.weighted([["Potion", 5], ["Elixir", 2], ["Oil", 2], ["Philter", 1], ["Draught", 1], ["Tincture", 1]] as const);
  item.base = base;
  item.appearance = `The ${base.toLowerCase()} ${rng.pick(POTION_LOOKS)}.`;
  if (base === "Oil") {
    const [name, text] = rng.pick(OIL_EFFECTS.filter(([, , min]) => min <= rank));
    item.name = `${name} of ${rng.pick(theme.of)}`;
    item.notes.push(`${cap(text.replace("{theme}", themeKey).replace("{dice}", ["1d4", "1d6", "2d6", "3d6", "4d6"][rank]!))}. One vial coats one weapon or one suit of armor.`);
    return item;
  }
  const what = rng.weighted([["heal", rank <= 2 ? 4 : 2], ["buff", 4], ["utility", 3], ["breath", rank >= 1 ? 1 : 0]] as const);
  item.duration = POTION_DURATION[rank];
  if (what === "heal") {
    item.duration = undefined;
    item.power = { kind: "heal", name: rng.pick(["Mending", "Restoration", "Vitality", "Lifeblood", "the Second Wind"]), charges: 1, recharge: "", cost: 1, single: true, damage: { formula: POTION_HEAL[rank]!, type: "healing" } };
    item.name = `${base} of ${item.power.name}`;
    item.power.name = "Drink it";
    if (rank >= 2 && rng.chance(0.5)) item.notes.push(rng.pick(["It also ends one disease or the poisoned condition.", "You also gain temporary hit points equal to half the hit points regained.", "It also removes one level of exhaustion."]));
  } else if (what === "breath") {
    const [name, area, save] = theme.power;
    item.duration = "1 hour";
    item.power = { kind: "blast", name: "Breathe", area, charges: 1, recharge: "", cost: 1, single: true, save: { ability: save, dc: DC[rank]! }, damage: { formula: `${POWER_DICE[rank]}d6`, type: themeKey } };
    item.name = `${base} of ${name}`;
    item.notes.push(`For 1 hour after drinking it, you can use a bonus action to exhale it ${rank >= 3 ? "three times" : "twice"} in all.`);
  } else if (what === "utility") {
    const [name, effect] = rng.pick(POTION_UTILITY.filter(([, , min]) => min <= rank));
    item.name = `${base} of ${name}`;
    item.notes.push(`When you drink it, for ${item.duration}, ${effect}.`);
    item.duration = undefined;
  } else {
    const pool = rng.shuffle(WORN_EFFECTS.filter(([min]) => min <= Math.max(1, rank)));
    for (const [, build] of pool) {
      const got = build(rng, Math.max(1, rank), themeKey);
      if (typeof got !== "string") item.effects.push(got);
      if (item.effects.length >= (rank >= 3 ? 2 : 1)) break;
    }
    item.name = `${base} of ${item.effects[0]?.label.replace(/\b\w/g, (c) => c.toUpperCase()) ?? rng.pick(theme.of)}`;
  }
  return item;
}

export function forgeItem(opts: ForgeOptions = {}): ForgedItem {
  const rng = createRng(opts.seed);
  // A random kind only turns out to be a relic when the rarity allows legendary.
  const relicOk = !opts.rarity || opts.rarity === "auto" || opts.rarity === "legendary";
  const kind: ForgeKind = !opts.kind || opts.kind === "random"
    ? rng.weighted([["weapon", 4], ["armor", 2], ["wondrous", 3], ["wand", 2], ["relic", relicOk ? 1 : 0], ["potion", 2], ["scroll", 2], ["ammo", 1]] as const)
    : opts.kind;
  const rarity: Rarity = kind === "relic" ? "legendary" : !opts.rarity || opts.rarity === "auto" ? autoRarity(rng, opts.partyLevel ?? 5) : opts.rarity;
  const rank = RANK[rarity];
  const themeKey: DamageType = !opts.theme || opts.theme === "random" ? rng.pick(DAMAGE_TYPES) : opts.theme;
  const theme = THEMES[themeKey];
  if (kind === "potion" || kind === "scroll" || kind === "ammo") {
    const item = consumable(rng, kind, rarity, themeKey, opts.base?.trim() ?? "");
    if (rank <= 1 && rng.chance(0.3) && kind === "potion") item.notes.push(rng.pick(CONSUMABLE_QUIRKS));
    const curse = opts.curse ?? "never";
    if (curse === "always" || (curse === "sometimes" && rng.chance(0.15))) {
      item.cursed = true;
      item.notes.push(`Curse. ${rng.pick(CONSUMABLE_CURSES[kind]).replace("{theme}", themeKey)}`);
    }
    return item;
  }

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
    name: itemName(rng, kind, shape, base, theme, rarity),
    kind,
    base,
    itemType,
    rarity,
    attunement: false,
    theme: themeKey,
    bonus: 0,
    damage: [],
    effects: [],
    notes: [],
    appearance: `The ${base.toLowerCase()} has ${rng.pick(theme.look)}.`,
    valueGp: RARITY_VALUE_GP[rarity],
  };

  const addEffects = (count: number) => {
    const pool = rng.shuffle(WORN_EFFECTS.filter(([min]) => min <= Math.max(1, rank)));
    for (const [, build] of pool.slice(0, count)) {
      const got = build(rng, Math.max(1, rank), themeKey);
      if (typeof got === "string") item.notes.push(got);
      else item.effects.push(got);
    }
  };

  if (shape === "weapon") {
    item.bonus = Math.min(3, rank);
    const extra = ["", rng.chance(0.5) ? "1d4" : "", "1d6", "2d6", "3d6"][rank]!;
    if (extra) item.damage.push({ formula: extra, type: themeKey });
    // A grab bag of weapon properties, more of them at higher rarity.
    const props = rng.shuffle(["keen", "vicious", "bane", "rider", "crit"] as const).slice(0, rank >= 3 ? 2 : rank >= 1 && rng.chance(0.6) ? 1 : 0);
    for (const p of props) {
      if (p === "keen") item.critThreshold = rank >= 4 ? 18 : 19;
      else if (p === "vicious") item.critDamage = rank >= 3 ? "2d6" : "1d6";
      else if (p === "bane") item.bane = { formula: `${Math.max(1, rank)}d6`, vs: rng.pick(BANE_FOES) };
      else if (p === "rider") item.notes.push(rng.pick(WEAPON_RIDERS));
      else item.notes.push(`On a critical hit, ${theme.rider}.`);
    }
    if (kind === "relic") {
      addEffects(1);
      item.power = rollPower(rng, rank, themeKey, theme, 2);
    }
  } else if (shape === "armor") {
    item.bonus = Math.min(3, rank);
    if (rank >= 2) item.effects.push(fx("dr", themeKey, `${themeKey} resistance`));
    if (rank >= 3) addEffects(1);
    if (rank >= 2 && rng.chance(0.25)) item.notes.push(rng.pick(["Critical hits against you become normal hits.", "You can don or doff it as an action.", "While wearing it, you can't be knocked prone against your will."]));
  } else if (shape === "wondrous") {
    addEffects(kind === "relic" ? 3 : [1, 1, 2, 2, 3][rank]!);
    if (kind === "relic" || (rank >= 2 && rng.chance(0.5))) item.power = rollPower(rng, rank, themeKey, theme, kind === "relic" ? 2 : 1);
  } else {
    item.power = rollPower(rng, rank, themeKey, theme);
    if (base === "Staff") item.effects.push(fx("spellatk", `+${Math.max(1, rank - 1)}`, "Spell attacks"));
    if (base === "Rod") item.notes.push(`While holding it, you have advantage on ${themeKey === "psychic" ? "Wisdom" : "Constitution"} saving throws to maintain concentration.`);
  }

  // A little personality at any rarity.
  if (rank <= 1 || rng.chance(0.5)) item.notes.push(rng.pick(MINOR_QUIRKS));
  const curse = opts.curse ?? "never";
  if (kind !== "relic" && (curse === "always" || (curse === "sometimes" && rng.chance(0.15)))) {
    const cursed = curseItem(item, `${rng.seed}:curse`);
    Object.assign(item, cursed);
  }
  if (kind === "relic") {
    item.history = `It was ${rng.pick(ORIGINS)}.`;
    item.drawback = rng.pick(DRAWBACKS);
    item.valueGp = RARITY_VALUE_GP.legendary * 2;
    if (rng.chance(0.6)) {
      item.sentience = `It is sentient (Intelligence ${rng.int(10, 18)}, Wisdom ${rng.int(10, 18)}, Charisma ${rng.int(12, 20)}): ${rng.pick(SENTIENCE.personality)}, it ${rng.pick(SENTIENCE.voice)} and wants to ${rng.pick(SENTIENCE.purpose)}.`;
    }
  }
  // Attunement: anything with real power (effects, charges, a big damage die, a curse) asks for it.
  item.attunement = kind === "relic" || !!item.cursed || item.effects.length > 0 || !!item.power || rank >= 3 || (rank === 2 && item.damage.length > 0);
  return item;
}

/** Forge several at once, e.g. a dragon's hoard of unique pieces. */
export function forgeItems(count: number, opts: ForgeOptions = {}): ForgedItem[] {
  const rng = createRng(opts.seed);
  return Array.from({ length: Math.max(1, Math.min(20, count)) }, (_, i) => forgeItem({ ...opts, seed: `${rng.seed}:${i}` }));
}

/** What players see before a cursed item is identified: a plain name and only the good parts. */
export function disguisedItem(i: ForgedItem): { name: string; properties: string[] } {
  const look = i.itemType === "weapon" ? "Fine" : i.kind === "armor" ? "Polished" : "Ornate";
  return { name: `${look} ${i.base}`, properties: forgedProperties(liftCurse(i)) };
}

/** A plain starting point for the manual editor. */
export function blankItem(kind: ForgeKind = "wondrous"): ForgedItem {
  const base = kind === "weapon" ? "Longsword" : kind === "armor" ? "Chain Mail" : kind === "wand" ? "Wand"
    : kind === "potion" ? "Potion" : kind === "scroll" ? "Scroll" : kind === "ammo" ? "Arrows" : "Amulet";
  return {
    seed: `custom-${Date.now().toString(36)}`,
    name: "New Item",
    kind,
    base,
    itemType: kind === "weapon" ? "weapon" : kind === "wand" || CONSUMABLE_KINDS.has(kind) ? "consumable" : "equipment",
    rarity: "uncommon",
    attunement: false,
    theme: "force",
    bonus: 0,
    damage: [],
    effects: [],
    notes: [],
    appearance: "",
    valueGp: RARITY_VALUE_GP.uncommon,
  };
}

/** A fresh power of a given kind, for the editor's "add power". */
export function blankPower(kind: PowerKind, rarity: Rarity, theme: DamageType): ForgePower {
  const rank = RANK[rarity];
  const [charges, recharge] = CHARGES[Math.max(1, rank)]!;
  const base = { kind, charges, recharge, cost: 1 };
  if (kind === "blast") return { ...base, name: THEMES[theme].power[0], area: THEMES[theme].power[1], save: { ability: THEMES[theme].power[2], dc: DC[rank]! }, damage: { formula: `${POWER_DICE[rank]}d6`, type: theme } };
  if (kind === "bolt") return { ...base, name: "Bolt", range: 120, damage: { formula: `${Math.max(2, rank * 2)}d10`, type: theme } };
  if (kind === "heal") return { ...base, name: "Mending Light", range: 0, damage: { formula: `${rank + 1}d8 + ${rank * 2}`, type: "healing" } };
  return { ...base, name: "Power", effect: "describe what it does" };
}

/** "Weapon (longsword), rare (requires attunement)" */
export function forgedSubtitle(i: ForgedItem): string {
  const kind = i.itemType === "weapon" ? `Weapon (${i.base.toLowerCase()})`
    : i.kind === "armor" ? (i.base === "Shield" ? "Armor (shield)" : `Armor (${i.base.toLowerCase()})`)
    : i.kind === "ammo" ? `Ammunition (${i.base.toLowerCase()}${i.quantity ? `, ${i.quantity}` : ""})`
    : i.itemType === "consumable" ? i.base
    : `Wondrous item (${i.base.toLowerCase()})`;
  return `${kind}, ${i.kind === "relic" ? "artifact" : i.rarity}${i.attunement ? " (requires attunement)" : ""}${i.cursed ? ", cursed" : ""}`;
}
