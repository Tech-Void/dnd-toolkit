import { createRng, type Rng } from "./rng.ts";

// ---------------------------------------------------------------------------
// Books worth reading: skill books (once read, training that subject goes faster), lore books
// (a secret, a lead) and wizards' tomes (spells to copy). Reading one is a downtime project.

/** What a book teaches or a character trains: "skill:ath", "tool:thief", "lang:elvish". */
export type Subject = `${"skill" | "tool" | "lang"}:${string}`;

export const SKILL_LABELS: Record<string, string> = {
  acr: "Acrobatics", ani: "Animal Handling", arc: "Arcana", ath: "Athletics", dec: "Deception", his: "History", ins: "Insight",
  itm: "Intimidation", inv: "Investigation", med: "Medicine", nat: "Nature", prc: "Perception", prf: "Performance",
  per: "Persuasion", rel: "Religion", slt: "Sleight of Hand", ste: "Stealth", sur: "Survival",
};

/** dnd5e tool keys: [label, ability]. */
export const TOOL_LABELS: Record<string, [string, string]> = {
  thief: ["Thieves' Tools", "dex"], herb: ["Herbalism Kit", "wis"], alchemist: ["Alchemist's Supplies", "int"], smith: ["Smith's Tools", "str"],
  leatherworker: ["Leatherworker's Tools", "dex"], cook: ["Cook's Utensils", "wis"], navg: ["Navigator's Tools", "wis"], pois: ["Poisoner's Kit", "int"],
  calligrapher: ["Calligrapher's Supplies", "dex"], carpenter: ["Carpenter's Tools", "str"], cartographer: ["Cartographer's Tools", "wis"],
  jeweler: ["Jeweler's Tools", "int"], tinker: ["Tinker's Tools", "dex"], weaver: ["Weaver's Tools", "dex"], woodcarver: ["Woodcarver's Tools", "dex"],
  brewer: ["Brewer's Supplies", "int"], mason: ["Mason's Tools", "str"], disg: ["Disguise Kit", "cha"], forg: ["Forgery Kit", "dex"],
  glassblower: ["Glassblower's Tools", "int"], painter: ["Painter's Supplies", "wis"], potter: ["Potter's Tools", "int"],
};

export const LANGUAGE_LABELS: Record<string, string> = {
  common: "Common", dwarvish: "Dwarvish", elvish: "Elvish", giant: "Giant", gnomish: "Gnomish", goblin: "Goblin", halfling: "Halfling", orc: "Orc",
  abyssal: "Abyssal", celestial: "Celestial", draconic: "Draconic", deep: "Deep Speech", infernal: "Infernal", primordial: "Primordial",
  sylvan: "Sylvan", undercommon: "Undercommon",
};

export function subjectLabel(s: string): string {
  const [kind, key = ""] = s.split(":");
  if (kind === "skill") return SKILL_LABELS[key] ?? key;
  if (kind === "tool") return TOOL_LABELS[key]?.[0] ?? key;
  if (kind === "lang") return LANGUAGE_LABELS[key] ?? key;
  return s;
}

/** Every subject a character can train, for pickers. */
export const SUBJECTS: Subject[] = [
  ...Object.keys(SKILL_LABELS).map((k) => `skill:${k}` as Subject),
  ...Object.keys(TOOL_LABELS).map((k) => `tool:${k}` as Subject),
  ...Object.keys(LANGUAGE_LABELS).filter((k) => k !== "common").map((k) => `lang:${k}` as Subject),
];

export type BookKind = "skill" | "lore" | "spells";

export interface Book {
  seed: string;
  kind: BookKind;
  title: string;
  author: string;
  /** Skill books: what it teaches. */
  subject?: Subject;
  /** Suggested reading time in hours (the GM sets the real figure when approving). */
  hours: number;
  valueGp: number;
  /** What it looks like and what it's about. */
  blurb: string;
  /** Lore books: what the reader learns at the end. */
  secret?: string;
  /** Wizard's tomes: spells it holds. */
  spells?: string[];
}

/** Training speed a skill book adds once read; two different books on a subject is the most that helps. */
export const BOOK_BONUS = 0.25;
export const MAX_BOOK_BONUS = 0.5;

const AUTHORS = [
  "Master Orlan Vey", "Sister Hesper of the Quill", "Bram Tallowmere", "the Sage of Brindle Hill", "Ysolde Marrowgate", "an anonymous Guild hand",
  "Archmage Tarsakh the Elder", "Captain Ilse Thorne", "Grandmother Pell", "Dorn Ironquill", "the Brothers Vashti", "Amaris Lightfoot",
  "Professor Quennel Ash", "a disgraced court physician", "Old Fenwick", "Kerra Stonewright",
];
const LOOKS = [
  "bound in cracked red leather", "with a water-stained cover", "copied by hand in a neat, tiny script", "full of margin notes in three different hands",
  "with a broken brass clasp", "smelling of pipe smoke", "with half its illustrations cut out by some earlier reader", "in a protective oilskin wrap",
  "with a dried flower pressed between two pages", "whose spine is held together with string",
];

const SKILL_TITLES: Record<string, string[]> = {
  acr: ["The Tumbler's Primer", "On Balance and the Fall"], ani: ["The Drover's Companion", "Horse, Hound and Hawk"], arc: ["Principia Arcanum", "Lesser Mysteries of the Weave"],
  ath: ["The Wrestler's Manual", "Strength and Its Uses"], dec: ["The Smiling Liar", "Faces and Masks"], his: ["A Chronicle of the Fallen Kingdoms", "The Long Count of Years"],
  ins: ["Reading the Heart", "What the Eyes Betray"], itm: ["The Iron Word", "On Fear and Its Uses"], inv: ["The Inquirer's Method", "Small Clues"],
  med: ["The Barber-Surgeon's Handbook", "On Wounds and Their Mending"], nat: ["A Natural History of the Wilds", "The Green Almanac"], prc: ["The Watchman's Eye", "Seeing What Is There"],
  prf: ["The Player's Art", "Songs for Every Hall"], per: ["The Courtier's Grace", "Of Words That Open Doors"], rel: ["The Book of Many Gods", "Rites and Their Meanings"],
  slt: ["Quick Hands", "The Conjuror's Secrets"], ste: ["The Silent Step", "Shadows and How to Wear Them"], sur: ["The Ranger's Almanac", "Fire, Water, Shelter"],
};
const TOOL_TITLE = ["A Practical Treatise on {x}", "The Apprentice's Guide to {x}", "{x}: Notes from the Workshop", "The Journeyman's {x} Manual"];
const LANG_TITLE = ["A Primer of {x}", "{x} for Travelers", "The {x} Lexicon", "Conversations in {x}"];
const LORE = [
  ["Rumors of the Drowned Abbey", "The abbey's bells still ring on the night of the new moon, and the tide leaves the causeway open for an hour."],
  ["A Ledger of the Merchant Prince", "The prince's fortune was built on smuggled dragon eggs; one shipment never arrived."],
  ["Testimony of the Last Watchman", "The old fort's well leads into a sealed vault, and the vault was sealed from the inside."],
  ["On the Silver Serpent", "The serpent sleeps beneath the frozen lake and can be bargained with, if you bring her a song she's never heard."],
  ["The Hollow King's Lineage", "The current baron is a usurper; the true heir was smuggled out as an infant and raised by millers."],
  ["Bestiary of the Deep Roads", "Hook horrors hunt by echo; a muffled party passes them unheard."],
  ["Diary of an Expedition", "The writer's party found a door in the mountain marked with three crows, and only one of them came back."],
  ["Concerning the Crow Knives", "The bandit lords meet at the drowned mill on the first day of each month."],
] as const;
const SPELLS_BY_TIER = [
  ["Detect Magic", "Identify", "Magic Missile", "Shield", "Sleep", "Burning Hands", "Find Familiar", "Feather Fall", "Mage Armor", "Silent Image"],
  ["Misty Step", "Web", "Invisibility", "Scorching Ray", "Knock", "Levitate", "Fireball", "Counterspell", "Fly", "Dispel Magic"],
  ["Polymorph", "Dimension Door", "Greater Invisibility", "Wall of Fire", "Cone of Cold", "Wall of Force", "Telekinesis", "Arcane Eye"],
  ["Chain Lightning", "Disintegrate", "Globe of Invulnerability", "Teleport", "Finger of Death", "Plane Shift", "Mind Blank", "Power Word Stun"],
];

export interface BookOptions {
  kind?: BookKind | "random";
  subject?: Subject;
  /** 1-4, for spell books and value. */
  tier?: number;
  seed?: string | number;
}

const fill = (template: string, x: string) => template.replace("{x}", x);

export function generateBook(opts: BookOptions = {}): Book {
  const rng = createRng(opts.seed);
  const tier = Math.max(1, Math.min(4, opts.tier ?? 1));
  const kind: BookKind = opts.subject ? "skill" : !opts.kind || opts.kind === "random" ? rng.weighted([["skill", 6], ["lore", 3], ["spells", tier >= 2 ? 2 : 1]] as const) : opts.kind;
  const author = rng.pick(AUTHORS);
  const look = rng.pick(LOOKS);
  if (kind === "skill") {
    const subject = opts.subject ?? rng.pick(SUBJECTS);
    const [type, key = ""] = subject.split(":");
    const label = subjectLabel(subject);
    const title = type === "skill" ? rng.pick(SKILL_TITLES[key] ?? ["On {x}"]).replace("{x}", label) : fill(rng.pick(type === "tool" ? TOOL_TITLE : LANG_TITLE), label);
    return {
      seed: rng.seed, kind, title, author, subject, hours: rng.pick([12, 16, 20, 24, 30, 40]), valueGp: rng.pick([25, 35, 50, 75, 100]) * tier,
      blurb: `A book on ${label}, ${look}. Once read, training in ${label} goes ${Math.round(BOOK_BONUS * 100)}% faster.`,
    };
  }
  if (kind === "lore") {
    const [title, secret] = rng.pick(LORE);
    return { seed: rng.seed, kind, title, author, hours: rng.pick([4, 6, 8, 12]), valueGp: rng.pick([10, 25, 50]), blurb: `A slim volume ${look}.`, secret };
  }
  const pool = SPELLS_BY_TIER.slice(0, Math.min(tier, 4)).flat();
  const spells = rng.shuffle(pool).slice(0, rng.int(2, 4));
  return {
    seed: rng.seed, kind, title: `${rng.pick(["The Workbook of", "Spellbook of", "Formulae of", "The Grimoire of"])} ${author.replace(/^(the |an? )/, "")}`, author,
    hours: 8 + spells.length * 4, valueGp: 50 * spells.length * tier, blurb: `A wizard's working spellbook ${look}. Its spells can be copied once deciphered.`, spells,
  };
}

/** "Thieves' Tools" etc. as a display name for a book item. */
export const bookItemName = (b: Book) => (b.kind === "skill" && b.subject ? `${b.title} (${subjectLabel(b.subject)})` : b.title);

/** A character's training speed for a subject, from the books they've read on it. */
export function trainingSpeed(readBonus: Partial<Record<string, number>>, subject: string): number {
  return 1 + Math.min(MAX_BOOK_BONUS, readBonus[subject] ?? 0);
}

/** A random book for treasure. */
export const lootBook = (rng: Rng, tier: number): Book => generateBook({ tier, seed: `${rng.seed}:book:${rng.int(0, 1e6)}` });
