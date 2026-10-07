import { createRng, type Rng } from "./rng.ts";
import { EPITHETS, FIRST_NAMES, SURNAMES } from "./data/names.ts";

// ---------------------------------------------------------------------------
// NPCs: someone to talk to (or fight), with a statblock to stand on.

export type NpcRole = "commoner" | "merchant" | "innkeeper" | "guard" | "soldier" | "noble" | "priest" | "scholar" | "criminal" | "mage";

export const NPC_ROLES: Record<NpcRole, { label: string; occupations: string[]; statblocks: [string, number][] }> = {
  commoner: {
    label: "Commoner",
    occupations: ["farmhand", "fishmonger", "baker", "cooper", "shepherd", "washerwoman's apprentice", "ferryman", "candlemaker", "street sweeper", "goatherd", "miller", "gravedigger"],
    statblocks: [["Commoner", 1]],
  },
  merchant: {
    label: "Merchant",
    occupations: ["spice trader", "traveling peddler", "cloth merchant", "horse trader", "moneylender", "caravan factor", "wine importer", "pawnbroker"],
    statblocks: [["Commoner", 3], ["Noble", 1]],
  },
  innkeeper: {
    label: "Innkeeper",
    occupations: ["innkeeper", "barkeep", "serving hand", "tavern cook", "stablehand at the inn", "brewer"],
    statblocks: [["Commoner", 3], ["Thug", 1]],
  },
  guard: {
    label: "Guard",
    occupations: ["gate guard", "town watch", "caravan guard", "bodyguard", "jailer", "watch sergeant"],
    statblocks: [["Guard", 4], ["Veteran", 1]],
  },
  soldier: {
    label: "Soldier",
    occupations: ["deserter", "mercenary", "border scout", "retired sergeant", "knight-errant", "recruiting officer"],
    statblocks: [["Veteran", 3], ["Scout", 2], ["Knight", 1]],
  },
  noble: {
    label: "Noble",
    occupations: ["minor lord", "heir to a failing house", "magistrate", "guild master", "courtier", "wealthy widow"],
    statblocks: [["Noble", 4], ["Knight", 1]],
  },
  priest: {
    label: "Priest",
    occupations: ["village priest", "temple acolyte", "wandering friar", "shrine keeper", "healer", "inquisitor"],
    statblocks: [["Acolyte", 3], ["Priest", 2]],
  },
  scholar: {
    label: "Scholar",
    occupations: ["sage", "librarian", "cartographer", "alchemist's apprentice", "herbalist", "astronomer", "scribe"],
    statblocks: [["Commoner", 3], ["Mage", 1]],
  },
  criminal: {
    label: "Criminal",
    occupations: ["pickpocket", "fence", "smuggler", "con artist", "gang enforcer", "burglar", "highwayman", "informant"],
    statblocks: [["Bandit", 2], ["Thug", 2], ["Spy", 2], ["Bandit Captain", 1]],
  },
  mage: {
    label: "Mage",
    occupations: ["hedge wizard", "court mage", "wand-maker", "fortune teller", "academy dropout", "warlock in hiding"],
    statblocks: [["Mage", 3], ["Cult Fanatic", 1]],
  },
};

export const NPC_RACES = ["human", "dwarf", "halfling", "elf", "half-elf", "gnome", "half-orc", "tiefling", "dragonborn"] as const;
const RACE_WEIGHTS: Record<string, number> = { human: 40, dwarf: 10, halfling: 10, elf: 8, "half-elf": 8, gnome: 7, "half-orc": 6, tiefling: 6, dragonborn: 5 };

const AGES = ["young", "young", "adult", "adult", "adult", "middle-aged", "middle-aged", "old", "ancient for their kind"];

const FEATURES = [
  "a crooked nose, broken more than once", "freckles everywhere", "a burn scar along one forearm", "piercing pale eyes",
  "an elaborate braid threaded with beads", "ink-stained fingers", "a missing front tooth", "a shaved head with a tattooed scalp",
  "a booming laugh and a belly to match", "hands calloused like old leather", "one ear notched like a tomcat's", "a magnificent mustache",
  "a nervous twitch in one eye", "heavy, tired eyes", "a jagged scar through one eyebrow", "very tall and stooped",
  "short and broad as a barrel", "skin weathered by sun and wind", "a silver ring on every finger", "a pronounced limp",
  "a tattoo of a ship's anchor", "an unnervingly perfect smile", "prematurely gray hair", "a nose ring and many earrings",
];

const CLOTHES: Record<"poor" | "modest" | "rich", string[]> = {
  poor: ["patched homespun", "a threadbare cloak", "mud-caked boots and a stained apron", "clothes two sizes too big", "a moth-eaten wool coat"],
  modest: ["sturdy traveling clothes", "a clean apron over plain wool", "a well-kept leather jerkin", "a faded uniform", "simple robes tied with a cord"],
  rich: ["velvet and lace", "a fur-trimmed cloak with a jeweled clasp", "silk dyed an expensive purple", "immaculate, tailored black", "far too much gold jewelry"],
};

const WEALTH: Record<NpcRole, "poor" | "modest" | "rich"> = {
  commoner: "poor", merchant: "modest", innkeeper: "modest", guard: "modest", soldier: "modest",
  noble: "rich", priest: "modest", scholar: "modest", criminal: "poor", mage: "modest",
};

const VOICES = [
  "speaks in a slow, careful drawl", "talks fast and finishes other people's sentences", "whispers, as if always overheard",
  "booms every word like a town crier", "punctuates everything with a nervous laugh", "uses big words, mostly correctly",
  "never uses one word where five will do", "answers questions with questions", "has a thick regional accent", "hums between sentences",
  "speaks in clipped military phrases", "is softly spoken and hard to hear", "swears creatively and often", "refers to themself by name",
  "constantly quotes a grandparent's sayings", "sniffs loudly before speaking", "has a high, reedy voice", "says \"friend\" in a way that sounds like a threat",
];

const PERSONALITIES = [
  "kind but easily flustered", "suspicious of strangers", "boastful and eager to impress", "dry, deadpan humor", "deeply pious",
  "greedy but honest about it", "anxious about everything", "relentlessly optimistic", "bitter about an old injustice", "curious to a fault",
  "lazy but clever", "fiercely loyal to friends", "a terrible gossip", "proud and quick to take offense", "gentle and patient",
  "cowardly, but ashamed of it", "a romantic at heart", "coldly practical",
];

const MOTIVES = [
  "pay off a debt before the collectors return", "find a missing sibling", "earn enough to leave this town for good",
  "be taken seriously by the local guild", "protect a secret love affair", "avenge a friend killed on the road",
  "win back a family heirloom lost at cards", "get elected to the town council", "discover who has been poisoning the wells",
  "keep the business afloat for one more season", "prove an old rumor about buried treasure", "get a sick child to a healer",
  "be left alone", "make amends for a past betrayal", "impress a stern parent", "see the ocean before dying",
];

const SECRETS = [
  "is an informant for a thieves' guild", "is actually a minor noble in hiding", "killed someone in self-defense and fled",
  "is deeply in debt to a dangerous loan shark", "worships a forbidden god", "is a lycanthrope who doesn't know it yet",
  "is skimming money from an employer", "has a twin who is a wanted criminal", "witnessed a murder and told no one",
  "carries a cursed coin that cannot be thrown away", "is spying for a rival town", "has a map to a dragon's old lair",
  "is the anonymous author of a scandalous pamphlet", "owes a favor to a fey creature", "is not who their papers say they are",
  "has nothing to hide at all, which is suspicious in itself",
];

const QUIRKS = [
  "keeps a pet rat in a coat pocket", "collects teeth", "always eats while talking", "refuses to touch iron", "counts everything",
  "never sits with their back to a door", "carves tiny wooden animals", "is terrified of birds", "names every weapon they see",
  "bets on anything", "constantly sharpens a knife", "keeps a diary and writes in it mid-conversation", "is allergic to cats and surrounded by them",
  "insists on shaking hands twice", "tells the same story about a giant every time", "smells strongly of onions",
];

const OPENERS = [
  "\"You're not from around here, are you?\"", "\"Mind the step. Mind everything, really.\"", "\"If the watch asks, you never saw me.\"",
  "\"Finally, someone who looks capable.\"", "\"We're closed. Unless you're paying.\"", "\"Have you seen a gray cat? Answers to Duke.\"",
  "\"Don't trust the mayor. Don't trust me either.\"", "\"You've got the look of trouble. I like trouble.\"",
];

export interface Npc {
  seed: string;
  name: string;
  race: string;
  role: NpcRole;
  occupation: string;
  age: string;
  /** Two features plus clothing. */
  look: string;
  voice: string;
  personality: string;
  motive: string;
  /** GM only. */
  secret: string;
  quirk: string;
  /** A first line to open with. */
  opener: string;
  /** Statblock to build the actor from, e.g. "Veteran". */
  statblock: string;
}

export interface NpcOptions {
  role?: NpcRole | "random";
  race?: string;
  /** Keep this name (e.g. an existing shopkeeper). */
  name?: string;
  /** Fixed traits, e.g. what the Shop tab already said about the keeper. */
  traits?: Partial<Pick<Npc, "occupation" | "personality" | "quirk">>;
  seed?: string | number;
}

function npcName(rng: Rng, race: string): string {
  if (race === "half-elf") return npcName(rng, rng.pick(["human", "elf"]));
  const firsts = FIRST_NAMES[race] ?? FIRST_NAMES.human!;
  const first = rng.pick(firsts);
  if (race === "half-orc") return rng.chance(0.6) ? `${first} ${rng.pick(EPITHETS)}` : first;
  // Tieflings often take a virtue name instead of a family name.
  if (race === "tiefling" && rng.chance(0.4)) return rng.pick(SURNAMES.tiefling!);
  const last = SURNAMES[race];
  return last ? `${first} ${rng.pick(last)}` : first;
}

export function generateNpc(opts: NpcOptions = {}): Npc {
  const rng = createRng(opts.seed);
  const role = !opts.role || opts.role === "random" ? rng.pick(Object.keys(NPC_ROLES) as NpcRole[]) : opts.role;
  const def = NPC_ROLES[role];
  const race = opts.race && opts.race !== "random" ? opts.race : rng.weighted(Object.entries(RACE_WEIGHTS));
  const [f1, f2] = rng.shuffle(FEATURES);
  return {
    seed: rng.seed,
    name: opts.name ?? npcName(rng, race),
    race,
    role,
    occupation: rng.pick(def.occupations),
    age: rng.pick(AGES),
    look: `${f1}, ${f2}; wears ${rng.pick(CLOTHES[WEALTH[role]])}`,
    voice: rng.pick(VOICES),
    personality: rng.pick(PERSONALITIES),
    motive: rng.pick(MOTIVES),
    secret: rng.pick(SECRETS),
    quirk: rng.pick(QUIRKS),
    opener: rng.pick(OPENERS),
    statblock: rng.weighted(def.statblocks),
    ...opts.traits,
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** One line, e.g. "Greta Harrow, middle-aged human fishmonger". */
export const npcSummary = (n: Npc) => `${n.name}, ${n.age} ${n.race} ${n.occupation}`;

/** Labeled trait lines in display order; `secret` is GM-only. */
export function npcTraits(n: Npc): [label: string, text: string, gmOnly?: boolean][] {
  return [
    ["Look", cap(n.look)],
    ["Voice", cap(n.voice)],
    ["Personality", cap(n.personality)],
    ["Wants to", n.motive],
    ["Quirk", cap(n.quirk)],
    ["Opens with", n.opener],
    ["Secret", cap(n.secret), true],
    ["Statblock", n.statblock, true],
  ];
}
