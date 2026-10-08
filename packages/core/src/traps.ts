import { createRng } from "./rng.ts";
import type { Ability } from "./forge.ts";

// ---------------------------------------------------------------------------
// Traps (damage by the DMG's severity table) and puzzles (riddles and mechanisms with answers,
// escalating hints and a price for getting it wrong).

export type TrapSeverity = "setback" | "dangerous" | "deadly";
export type TrapKind = "mechanical" | "magical";

export interface Trap {
  seed: string;
  name: string;
  kind: TrapKind;
  severity: TrapSeverity;
  trigger: string;
  effect: string;
  /** Spotting it. */
  detect: { skill: "prc" | "inv"; dc: number };
  /** Disarming it: thieves' tools, Arcana, or a clever idea. */
  disarm: { method: string; dc: number };
  save?: { ability: Ability; dc: number };
  /** Attack traps roll to hit instead. */
  attackBonus?: number;
  damage?: { formula: string; type: string };
  area?: string;
  /** What else happens: a condition, a reset. */
  rider?: string;
  countermeasures: string;
}

export interface TrapOptions {
  partyLevel?: number;
  severity?: TrapSeverity;
  kind?: TrapKind | "any";
  /** Triggered by walking onto it (for traps placed on a map), not by touching an object. */
  step?: boolean;
  /** Outdoors: snares, deadfalls and camouflaged pits instead of dungeon machinery. */
  wild?: boolean;
  /** Natural caves and broken ruins: nothing that needs intact walls, doors or ceilings. */
  rough?: boolean;
  seed?: string | number;
}

/** DMG trap damage by level band and severity. */
const DAMAGE: Record<TrapSeverity, [string, string, string, string]> = {
  setback: ["1d10", "2d10", "4d10", "10d10"],
  dangerous: ["2d10", "4d10", "10d10", "18d10"],
  deadly: ["4d10", "10d10", "18d10", "24d10"],
};
const SAVE_DC: Record<TrapSeverity, [number, number]> = { setback: [10, 11], dangerous: [12, 15], deadly: [16, 20] };
const ATTACK: Record<TrapSeverity, [number, number]> = { setback: [3, 5], dangerous: [6, 8], deadly: [9, 12] };
const band = (level: number) => (level <= 4 ? 0 : level <= 10 ? 1 : level <= 16 ? 2 : 3);

const TRIGGERS = [
  "a pressure plate under a loose flagstone", "a tripwire at ankle height across the doorway", "opening the chest without pressing the hidden catch",
  "lifting the idol from its pedestal", "pulling the obvious lever", "stepping onto the mosaic's red tiles", "touching the door handle",
  "reading the inscription aloud", "crossing the threshold with a light source", "disturbing the dust on the third stair",
];

/** Triggers a token can set off by walking. */
const STEP_TRIGGERS = [
  "a pressure plate under a loose flagstone", "a tripwire at ankle height", "stepping onto the mosaic's red tiles",
  "a flagstone that sinks a finger's width underfoot", "a hair-thin wire strung across the floor", "weight on the cracked tiles in the middle of the floor",
  "crossing the threshold with a light source", "a false floor of plaster painted to look like stone",
];

const ROUGH_TRIGGERS = [
  "a tripwire across the passage", "a loose stone that shifts underfoot", "a pressure plate under the gravel",
  "a thin crust of earth over a hollow", "a hair-thin wire strung at ankle height", "a cracked slab that tips when stepped on",
];

const WILD_TRIGGERS = [
  "a tripwire hidden in the long grass", "a patch of leaves over a thin lattice of sticks", "a buried pressure plate on the path",
  "a snare loop hidden under the leaf litter", "a cord strung between two trees at shin height",
];

type TrapTemplate = {
  name: string;
  kind: TrapKind;
  /** Where it fits: dungeons only (default), outdoors only, or anywhere. */
  where?: "wild" | "any";
  /** Needs built walls, doors or machinery (not in caves or ruins). */
  built?: boolean;
  effect: string;
  roll: { save: Ability } | { attack: true };
  type: string;
  area?: string;
  rider?: string;
  disarm: string;
  countermeasures: string;
};

const TEMPLATES: TrapTemplate[] = [
  { name: "Poison dart volley", kind: "mechanical", built: true, effect: "Darts fire from holes in the walls.", roll: { attack: true }, type: "piercing", rider: "Each hit also deals half again as much poison damage.", disarm: "thieves' tools to jam the dart holes", countermeasures: "Wedge a shield or wax into the holes; trigger it from a distance with a pole." },
  { name: "Spiked pit", kind: "mechanical", where: "any", effect: "The floor drops away into a 20-foot pit lined with spikes.", roll: { save: "dex" }, type: "piercing", area: "10-foot square", rider: "On a failed save the creature falls in (and takes 2d6 bludgeoning from the fall too).", disarm: "thieves' tools to lock the trapdoor shut", countermeasures: "Spike the lid shut, or bridge the pit with planks." },
  { name: "Scything blade", kind: "mechanical", built: true, effect: "A blade swings out of a slot in the wall.", roll: { attack: true }, type: "slashing", disarm: "thieves' tools to wedge the blade's mechanism", countermeasures: "Crawl beneath its arc, or jam the slot with an iron spike." },
  { name: "Collapsing ceiling", kind: "mechanical", effect: "The ceiling gives way in a rain of stone.", roll: { save: "dex" }, type: "bludgeoning", area: "10-foot square", rider: "The area becomes difficult terrain, and a creature that fails is knocked prone and buried (DC 15 Athletics to dig out).", disarm: "thieves' tools to disable the trigger", countermeasures: "Brace the ceiling with timber, or set it off from the doorway." },
  { name: "Fire jets", kind: "magical", effect: "Gouts of flame burst from the floor and walls.", roll: { save: "dex" }, type: "fire", area: "15-foot cone", disarm: "Arcana to scrub out the fire rune (dispel magic works too)", countermeasures: "Douse the vents, or bait it with something thrown across the trigger." },
  { name: "Poison gas", kind: "mechanical", built: true, effect: "Hissing green gas fills the room as the doors slam shut.", roll: { save: "con" }, type: "poison", area: "the whole room", rider: "A creature that fails is poisoned for 1 hour; the gas repeats each round for 3 rounds until the doors are forced (DC 15 Athletics).", disarm: "thieves' tools to block the vents", countermeasures: "Hold your breath, wedge the doors open first, or stuff cloth into the vents." },
  { name: "Lightning glyph", kind: "magical", where: "any", effect: "A glyph flares and lightning arcs through everyone nearby.", roll: { save: "dex" }, type: "lightning", area: "20-foot radius", disarm: "Arcana to unravel the glyph (dispel magic works too)", countermeasures: "Detect magic reveals it; ground it with a metal pole driven into the floor." },
  { name: "Rolling boulder", kind: "mechanical", effect: "A boulder thunders down the corridor.", roll: { save: "dex" }, type: "bludgeoning", area: "a 5-foot-wide line down the corridor", rider: "A creature that fails is knocked prone; the boulder rolls on until it hits something.", disarm: "thieves' tools to pin the release", countermeasures: "Find an alcove to duck into, or wedge the track ahead of it." },
  { name: "Net and bell", kind: "mechanical", where: "any", effect: "A weighted net drops and a bell clangs somewhere deeper in.", roll: { save: "dex" }, type: "bludgeoning", area: "10-foot square", rider: "A creature that fails is restrained (DC 12 Strength or 5 slashing damage to the net to escape), and anything nearby hears the alarm.", disarm: "thieves' tools to cut the cord silently", countermeasures: "Cut the bell rope first." },
  { name: "Rune of sleep", kind: "magical", where: "any", effect: "A soft hum, and the edges of the world go dim.", roll: { save: "wis" }, type: "psychic", area: "20-foot radius", rider: "A creature that fails falls unconscious for 1 minute (or until damaged or shaken awake).", disarm: "Arcana to smudge the rune", countermeasures: "Cover the rune with cloth or earth; elves and the sleepless are unaffected." },
  { name: "Freezing mist", kind: "magical", built: true, effect: "Cold white mist pours from the walls.", roll: { save: "con" }, type: "cold", area: "the whole room", rider: "A creature that fails has its speed halved until the end of its next turn.", disarm: "Arcana to warm the sigil", countermeasures: "A fire or warm cloaks give advantage on the save." },
  { name: "Acid sprayers", kind: "mechanical", built: true, effect: "Brass nozzles in the walls spray a fan of acid.", roll: { save: "dex" }, type: "acid", area: "15-foot cone", rider: "Nonmagical armor worn by a creature that fails takes a permanent -1 penalty to AC until repaired.", disarm: "thieves' tools to crimp the feed pipes", countermeasures: "Stuff the nozzles with clay, or hold a shield in front of them." },
  { name: "Falling portcullis", kind: "mechanical", built: true, effect: "An iron portcullis slams down behind the party, splitting the group.", roll: { save: "dex" }, type: "bludgeoning", area: "the doorway", rider: "A creature in the doorway that fails is pinned (restrained) beneath it; lifting it takes DC 20 Athletics.", disarm: "thieves' tools to lock the winch", countermeasures: "Wedge the slot with a spike or a crowbar before walking through." },
  { name: "Spear wall", kind: "mechanical", built: true, effect: "Spears thrust out of holes along both walls.", roll: { attack: true }, type: "piercing", rider: "The spears stay out for 1 round, making the area difficult terrain.", disarm: "thieves' tools to jam the spring", countermeasures: "Crawl along the floor below the spear holes." },
  { name: "Necrotic ward", kind: "magical", built: true, effect: "A skull carved into the lintel exhales a cold black breath.", roll: { save: "con" }, type: "necrotic", area: "20-foot radius", rider: "A creature that fails can't regain hit points until the end of its next turn.", disarm: "Arcana to deface the carved skull (dispel magic works too)", countermeasures: "Holy water splashed on the skull suppresses it for 1 minute." },
  { name: "Thunder plate", kind: "magical", effect: "A runed plate booms like a thunderclap.", roll: { save: "con" }, type: "thunder", area: "15-foot radius", rider: "A creature that fails is deafened for 1 minute and pushed 10 feet away; everything within 300 feet hears it.", disarm: "Arcana to dampen the rune", countermeasures: "Cover the plate with a thick cloak or a bedroll." },
  { name: "Flooding chamber", kind: "mechanical", built: true, effect: "Sluice gates open and water pours in as the doors seal.", roll: { save: "str" }, type: "bludgeoning", area: "the whole room", rider: "The room fills in 4 rounds; after that, creatures must hold their breath until the doors are forced (DC 17 Athletics).", disarm: "thieves' tools to close the sluices", countermeasures: "Jam the doors open first, or find the drain (DC 15 Investigation)." },
  { name: "Mind-shatter mirror", kind: "magical", built: true, effect: "A mirror shows each viewer their own death.", roll: { save: "wis" }, type: "psychic", area: "the whole room", rider: "A creature that fails is frightened of the mirror for 1 minute.", disarm: "Arcana to cloud the glass, or simply cover it", countermeasures: "Walk through blindfolded, or smash the mirror from out of sight." },
  { name: "Bear trap", kind: "mechanical", where: "wild", effect: "Iron jaws snap shut on a leg.", roll: { attack: true }, type: "piercing", rider: "On a hit the creature is restrained and its speed is 0; DC 13 Strength frees it, and each failed attempt deals 1 piercing damage.", disarm: "thieves' tools, or wedge the jaws with a stick (DC 12 Sleight of Hand)", countermeasures: "Probe the path ahead with a pole." },
  { name: "Snare", kind: "mechanical", where: "wild", effect: "A noose whips tight and yanks its victim upside down into the branches.", roll: { save: "dex" }, type: "bludgeoning", rider: "A creature that fails hangs restrained 10 feet up until the rope is cut (AC 11, 5 hit points).", disarm: "a knife and a steady hand (Sleight of Hand)", countermeasures: "Spot the bent sapling it's tied to." },
  { name: "Deadfall", kind: "mechanical", where: "wild", effect: "A log weighted with stones drops from the canopy.", roll: { save: "dex" }, type: "bludgeoning", area: "10-foot square", rider: "A creature that fails is knocked prone and pinned (DC 14 Athletics to get free).", disarm: "thieves' tools or a blade to cut the trigger line", countermeasures: "Trigger it with a thrown stone from a safe distance." },
  { name: "Caltrop field", kind: "mechanical", where: "wild", effect: "Blackened caltrops are scattered under the leaves.", roll: { save: "dex" }, type: "piercing", area: "15-foot square", rider: "A creature that fails stops moving, and its speed is reduced by 10 feet until it regains at least 1 hit point.", disarm: "a broom, a cloak or careful steps (Survival to clear a path)", countermeasures: "Move at half speed to pick through safely." },
  { name: "Swinging log", kind: "mechanical", where: "wild", effect: "A spiked log swings down from the trees like a battering ram.", roll: { attack: true }, type: "bludgeoning", rider: "A creature hit is knocked 10 feet back and prone.", disarm: "thieves' tools or a blade to cut the trip line", countermeasures: "Duck under its arc, or set it off with a thrown pack." },
  { name: "Wasp nest drop", kind: "mechanical", where: "wild", effect: "A tripwire shakes down a huge paper nest, and the wasps are furious.", roll: { save: "con" }, type: "poison", area: "20-foot radius", rider: "The swarm stays for 3 rounds; a creature that fails is poisoned for 1 minute.", disarm: "smoke the nest first (a torch and Survival)", countermeasures: "Run, or dive into water." },
  { name: "Crushing walls", kind: "mechanical", built: true, effect: "The walls begin grinding inward.", roll: { save: "str" }, type: "bludgeoning", area: "the whole corridor", rider: "The walls close a little more each round; a failed save means taking the damage each round until the mechanism is jammed.", disarm: "thieves' tools on the hidden gear (DC +2 while it moves)", countermeasures: "Jam it with iron spikes, a shield or a crowbar." },
];

export function generateTrap(opts: TrapOptions = {}): Trap {
  const rng = createRng(opts.seed);
  const level = Math.max(1, Math.min(20, opts.partyLevel ?? 3));
  const severity = opts.severity ?? rng.weighted([["setback", 3], ["dangerous", 3], ["deadly", 1]] as const);
  const fits = (t: TrapTemplate) => (opts.wild ? t.where === "wild" || t.where === "any" : t.where !== "wild") && !(opts.rough && t.built);
  const pool = TEMPLATES.filter((t) => fits(t) && (!opts.kind || opts.kind === "any" || t.kind === opts.kind));
  const t = rng.pick(pool);
  const b = band(level);
  const [dcMin, dcMax] = SAVE_DC[severity];
  const dc = rng.int(dcMin, dcMax);
  const trap: Trap = {
    seed: rng.seed,
    name: t.name,
    kind: t.kind,
    severity,
    trigger: rng.pick(opts.wild ? WILD_TRIGGERS : opts.rough ? ROUGH_TRIGGERS : opts.step ? STEP_TRIGGERS : TRIGGERS),
    effect: t.effect,
    detect: { skill: t.kind === "magical" ? "inv" : rng.pick(["prc", "inv"] as const), dc: Math.max(10, dc + rng.int(-1, 2)) },
    disarm: { method: t.disarm, dc: dc + rng.int(0, 2) },
    damage: { formula: DAMAGE[severity][b]!, type: t.type },
    area: t.area,
    rider: t.rider,
    countermeasures: t.countermeasures,
  };
  if ("save" in t.roll) trap.save = { ability: t.roll.save, dc };
  else trap.attackBonus = rng.int(...ATTACK[severity]);
  return trap;
}

const ABILITY_NAMES: Record<Ability, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

/** The trap as a one-paragraph GM summary. */
export function trapText(t: Trap): string {
  const roll = t.save
    ? `Each creature${t.area ? ` in ${t.area.startsWith("the ") || t.area.startsWith("a ") ? t.area : `a ${t.area}`}` : ""} makes a DC ${t.save.dc} ${ABILITY_NAMES[t.save.ability]} saving throw, taking ${t.damage!.formula} ${t.damage!.type} damage on a failure, or half as much on a success.`
    : `It makes a +${t.attackBonus} attack against the triggering creature, dealing ${t.damage!.formula} ${t.damage!.type} damage on a hit.`;
  return `${t.name} (${t.severity}, ${t.kind}). Triggered by ${t.trigger}. ${t.effect} ${roll}${t.rider ? ` ${t.rider}` : ""} ` +
    `Spot it: DC ${t.detect.dc} ${t.detect.skill === "prc" ? "Wisdom (Perception)" : "Intelligence (Investigation)"}. Disarm: DC ${t.disarm.dc}, ${t.disarm.method}.`;
}

// --- Puzzles --------------------------------------------------------------------------------

export interface Puzzle {
  seed: string;
  kind: "riddle" | "mechanism";
  title: string;
  /** What the players see or hear. */
  prompt: string;
  solution: string;
  /** From gentle to blatant. */
  hints: string[];
  /** What a wrong answer costs. */
  failure: string;
  reward: string;
}

/** Classic, public-domain riddles. [riddle, answer, hint 1, hint 2]. */
const RIDDLES: [string, string, string, string][] = [
  ["What has roots as nobody sees, is taller than trees; up, up it goes, and yet never grows?", "A mountain", "It's very old and very still.", "You may have climbed one to get here."],
  ["Voiceless it cries, wingless flutters, toothless bites, mouthless mutters.", "The wind", "You can feel it but never see it.", "It's howling outside right now."],
  ["This thing all things devours: birds, beasts, trees, flowers; gnaws iron, bites steel, grinds hard stones to meal.", "Time", "Nothing escapes it, not even kings.", "You never have enough of it."],
  ["What can run but never walks, has a mouth but never talks, has a head but never weeps, has a bed but never sleeps?", "A river", "You might have crossed one on the way.", "Fish live in its bed."],
  ["The more you take, the more you leave behind. What am I?", "Footsteps", "You're making them right now.", "Look down."],
  ["I'm light as a feather, yet the strongest man can't hold me for long.", "Breath", "You do it without thinking.", "Try holding it."],
  ["What has keys but can't open locks?", "A piano (or a map's legend)", "It makes music.", "Black and white."],
  ["What gets wetter the more it dries?", "A towel", "You'd want one after a bath.", "It's made of cloth."],
  ["I have cities, but no houses; forests, but no trees; water, but no fish.", "A map", "You probably have one in your pack.", "It shows the way."],
  ["What can you catch but not throw?", "A cold", "It might make you sneeze.", "A healer can cure it."],
  ["Feed me and I live; give me a drink and I die.", "Fire", "It's warm and bright.", "Water is its enemy."],
  ["The one who makes it, sells it; the one who buys it never uses it; the one who uses it never knows.", "A coffin", "It's made of wood, usually.", "Ask a gravedigger."],
  ["What has one eye but cannot see?", "A needle", "A tailor uses it.", "Thread goes through it."],
  ["I am always ahead of you but can never be seen.", "The future", "It hasn't happened yet.", "Seers try to glimpse it."],
];

const MECHANISMS: { title: string; prompt: string; solution: string; hints: [string, string, string] }[] = [
  {
    title: "The four statues", prompt: "Four statues (a knight, a priest, a thief and a king) stand on turntables facing the walls. An inscription reads: 'The crown fears the dagger, the dagger fears the sword, the sword bows to the god, and the god watches the crown.'",
    solution: "Turn each statue to face the one it fears or watches: the king faces the thief, the thief faces the knight, the knight faces the priest, the priest faces the king.",
    hints: ["The statues must look at each other, not the walls.", "Each line of the inscription names who looks at whom.", "Start with the king: who does a crown fear?"],
  },
  {
    title: "Three levers", prompt: "Three levers (iron, copper and gold) sit under a mural of a sunrise, a noon sky and a sunset.",
    solution: "Pull them in the order of the sun: copper (dawn's color), gold (noon), iron (dusk's grey).",
    hints: ["The mural is the clue: it's about time of day.", "Each metal matches the sky's color in one panel.", "The order is the order of the day."],
  },
  {
    title: "The weighing scales", prompt: "A great set of scales holds a stone heart on one pan. The door opens when they balance. Around the room lie a feather, a skull, a gold crown and a loaf of bread.",
    solution: "Place the feather. ('A heart as light as a feather' is the old judgment of the dead; the heavy offerings tip it the wrong way.)",
    hints: ["The scales judge, they don't weigh.", "Think of the old stories about hearts weighed after death.", "The lightest thing in the room is the right one."],
  },
  {
    title: "The colored crystals", prompt: "Five sockets in a door and five crystals: red, orange, yellow, green and blue. A faded painting shows a rainbow over the mountains.",
    solution: "Set them in rainbow order from left to right: red, orange, yellow, green, blue.",
    hints: ["The painting is not decoration.", "Rainbows always have the same order.", "Start with red on the left."],
  },
  {
    title: "The echoing word", prompt: "A carved mouth in the wall says, whenever anyone speaks near it: 'Say my name and I vanish.'",
    solution: "Stay silent: the answer is 'silence', and saying nothing for a full minute opens the way.",
    hints: ["Every time you speak, it repeats the riddle.", "What breaks when you name it?", "Try not saying anything at all."],
  },
  {
    title: "The drowned room", prompt: "A sealed chamber begins to fill with water. On the far wall, six tiles bear runes for fire, water, earth, air, light and dark; three are slightly raised.",
    solution: "Press the three raised tiles in the order that stops water: earth (dam), fire (boil), air (lift), and the drain opens.",
    hints: ["Only three of the runes matter: the raised ones.", "Think of what each element does to water.", "Earth holds it back first."],
  },
];

const FAILURES = [
  "A wrong answer triggers a trap (roll one up: dangerous severity).", "Each wrong answer releases a guardian (an animated armor or two).",
  "Water rises a foot with each mistake; three mistakes and the room floods.", "A wrong answer seals the door for 24 hours.",
  "Each wrong answer deals 2d6 psychic damage to whoever gave it.", "Nothing happens, except the door to the next room quietly locks too.",
];
const REWARDS = ["The way forward opens.", "A hidden cache slides out of the wall.", "The guardian bows and steps aside.", "A secret door to the treasury opens.", "The statue's eyes glow, and it answers one question truthfully."];

export function generatePuzzle(opts: { kind?: "riddle" | "mechanism" | "any"; seed?: string | number } = {}): Puzzle {
  const rng = createRng(opts.seed);
  const kind = !opts.kind || opts.kind === "any" ? rng.pick(["riddle", "mechanism"] as const) : opts.kind;
  if (kind === "riddle") {
    const [riddle, answer, h1, h2] = rng.pick(RIDDLES);
    return {
      seed: rng.seed, kind, title: "A riddle at the door", prompt: `A voice, a carving or a guardian asks: "${riddle}"`, solution: answer,
      hints: [h1, h2, `It starts with "${answer.replace(/^(A|An|The) /, "").charAt(0).toUpperCase()}".`], failure: rng.pick(FAILURES), reward: rng.pick(REWARDS),
    };
  }
  const m = rng.pick(MECHANISMS);
  return { seed: rng.seed, kind, title: m.title, prompt: m.prompt, solution: m.solution, hints: [...m.hints], failure: rng.pick(FAILURES), reward: rng.pick(REWARDS) };
}
