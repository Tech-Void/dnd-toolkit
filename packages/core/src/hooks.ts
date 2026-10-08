import { createRng, type Rng } from "./rng.ts";

export type HookTone = "any" | "heroic" | "mystery" | "horror" | "intrigue" | "exploration";
export const HOOK_TONES: Exclude<HookTone, "any">[] = ["heroic", "mystery", "horror", "intrigue", "exploration"];

export interface PlotHook {
  seed: string;
  title: string;
  /** One read-aloud-ready paragraph, built from the parts below. */
  text: string;
  patron: string;
  location: string;
  goal: string;
  /** A wrinkle the party learns about up front. */
  complication: string;
  /** Who or what is behind it. */
  villain: string;
  deadline: string;
  rewardGp: number;
  /** Something besides gold. */
  bonusReward: string;
  /** GM only. */
  twist: string;
  tone: Exclude<HookTone, "any">;
  partyLevel: number;
}

/** The parts of a hook that can be rerolled (or edited) one at a time. */
export type HookPart = "title" | "patron" | "location" | "goal" | "complication" | "villain" | "deadline" | "reward" | "bonusReward" | "twist";
export const HOOK_PARTS: HookPart[] = ["title", "patron", "goal", "location", "complication", "villain", "deadline", "reward", "bonusReward", "twist"];

export interface HookOptions {
  partyLevel?: number;
  tone?: HookTone;
  seed?: string | number;
}

const PATRONS = [
  "a nervous halfling innkeeper", "the widowed baroness of the river holdings", "a temple acolyte who speaks only in whispers",
  "a one-eyed dwarven caravan master", "a merchant guild factor with ink-stained fingers", "a retired adventurer who walks with a cane",
  "the town's overworked constable", "a child clutching a hand-drawn map", "a scholar from the distant academy",
  "an elven ranger wounded and short of breath", "a gnome inventor whose workshop just exploded", "a masked emissary who will not give a name",
  "a tiefling fortune-teller who already knows their names", "the harbormaster, soaked and furious", "a ghost who only appears in mirrors",
  "a talking raven sent by someone who can't come in person", "a pair of feuding twins, each offering double what the other does",
  "the high priest's unhappy apprentice", "a dragonborn bounty hunter with too many bounties", "a farmer whose scarecrow walked off last night",
  "a disgraced knight hoping to buy back their honor", "the local thieves' guild, politely", "a dying wizard with one last errand",
  "a village elder who remembers when this happened before", "an orc chieftain seeking an unlikely alliance",
  "a frightened noble heir running from their own family", "the city's chief librarian, missing three very old books",
  "a traveling circus ringmaster with a missing act", "a druid whose grove has gone silent", "a smuggler who swears this time it's legitimate",
];

const LOCATIONS = [
  "the drowned crypts beneath the old lighthouse", "an abandoned silver mine in the foothills", "the ruined monastery on Cinder Hill",
  "a sunken barge in the marsh", "the sewers under the merchant quarter", "a wizard's tower that appeared overnight",
  "the hollow inside a dead giant oak", "a frozen watchtower on the northern pass", "the catacombs below the cathedral",
  "a smugglers' cave reachable only at low tide", "the burned-out manor of a disgraced noble", "a goblin-held bridge fort on the trade road",
  "a floating island tethered by rusted chains", "the bottom of a dry well that goes down much too far", "an inn that only exists on foggy nights",
  "a petrified forest where the trees still whisper", "a shipwreck high in the mountains, nowhere near the sea", "the vaults of a bankrupt bank",
  "a haunted opera house closed for twenty years", "a giant's skull used as a bandit fortress", "the glass gardens of a mad alchemist",
  "a toll bridge whose troll has gone missing", "the fighting pits beneath the arena", "a village where everyone sleeps at noon",
  "a lighthouse whose beam shows things that aren't there", "an elven ruin swallowed by a glacier", "the hollow hill where the fey hold court",
  "a clocktower whose bells ring backwards", "a quarantined district behind a wall of salt", "the stairway carved into a waterfall",
];

const GOALS: Record<PlotHook["tone"], readonly string[]> = {
  heroic: [
    "rescue the villagers taken in last night's raid", "recover a stolen relic before it is destroyed", "drive off the beast that has been killing livestock",
    "escort a supply wagon through contested land", "destroy the source of a creeping blight", "hold the old fort until reinforcements arrive",
    "free the prisoners held in a slaver camp", "slay the wyrmling before it grows into a dragon", "rebuild the shrine and survive the night it's attacked",
    "bring the healer through the storm to a dying town", "break the siege on a mountain monastery", "challenge the champion of the warband to single combat",
  ],
  mystery: [
    "find out why the town's bells ring at midnight on their own", "learn what happened to a survey team that never returned",
    "identify who has been leaving silver coins on the graves", "decipher the map found sewn into a dead courier's coat",
    "discover why the well water now tastes of copper", "work out how a locked-room murder was done", "trace a counterfeit coin back to its forger",
    "learn why every portrait in the manor turned to face the wall", "find out who keeps stealing the town's shadows",
    "discover why the river now flows uphill for an hour each night", "explain the stranger who arrived claiming to be the mayor",
    "learn why the oldest tree in town started bleeding sap the color of wine",
  ],
  horror: [
    "find the missing children before the new moon", "seal the door that someone has been opening from below",
    "put to rest the knight who rides the road at dusk", "burn the nest before the eggs hatch", "retrieve a body that will not stay buried",
    "survive a night in the house so the deed transfers", "stop the plague that makes its victims sing", "find what's wearing the miller's face",
    "end the curse that makes every mirror in town show a stranger", "break the ritual before the stars align",
    "follow the scratching under the floorboards to its source", "recover the lost expedition, or what is left of it",
  ],
  intrigue: [
    "steal back a letter that could start a war", "plant false evidence on a corrupt magistrate", "protect a witness until the trial at week's end",
    "uncover which council member is selling secrets", "deliver a sealed message without anyone learning of it",
    "swap a fake crown for the real one during the coronation", "win a duel of wits at the masked ball", "expose a cult hiding inside the city watch",
    "keep two rival heirs from killing each other before the will is read", "smuggle a defector across the border",
    "rig the election without getting caught", "find the spy in the party's own patron's household",
  ],
  exploration: [
    "map the newly opened caverns before the prospectors do", "reach the summit and light the old signal beacon",
    "find the source of the river that appeared last spring", "chart a safe path through the shifting desert",
    "recover the logbook of a ship that sailed off the edge of the map", "find the lost city in the jungle the old songs mention",
    "catalog the creatures on an island no one has visited in a century", "find a way across the chasm that opened overnight",
    "locate the seed vault of a vanished civilization", "follow a migrating herd of something enormous",
    "dive to the drowned temple at the bottom of the lake", "reach the heart of the floating ruins before they sink",
  ],
};

const COMPLICATIONS = [
  "the only road there is washed out, adding two days", "a rival party left yesterday and has a head start",
  "the patron can only pay in a foreign currency", "the local lord has forbidden anyone to go", "it's the middle of a festival and every room is taken",
  "someone in the party is wanted in that region", "the guide they're given is clearly lying about something", "a storm is due to hit within the day",
  "the area is under quarantine", "the previous group sent never came back, and their families want answers",
  "a magical silence covers the place, so no spells with verbal components", "the job requires them to work with someone they've wronged",
  "the target is protected by an old treaty", "the route crosses a dragon's hunting grounds", "a religious holiday forbids violence for three days",
  "the patron insists on coming along",
];

const VILLAINS = [
  "a lich's apprentice who wants a promotion", "a bandit queen with a code of honor", "a hag who made a bargain with the town long ago",
  "a disgraced paladin turned warlord", "a cult of the Drowned God", "a mind flayer posing as a merchant prince",
  "a dragon in human guise", "an ambitious goblin king", "a vampire noble who funds the city watch", "a necromancer grieving a lost child",
  "a rogue golem whose maker is long dead", "a fey prince who thinks it's all a game", "a corrupt high priest", "a band of mercenaries hired by someone else",
  "a devil collecting on an old contract", "a beholder that hoards maps", "an exiled archmage", "a werewolf pack leader with a grudge",
  "a crime lord who owns half the city", "nobody: it's a natural disaster with a mind of its own",
];

const DEADLINES = [
  "before the next full moon", "within three days", "by the end of the harvest festival", "before the snows close the pass",
  "before the trial at week's end", "before the eclipse in nine days", "by dawn", "before the caravan leaves the day after tomorrow",
  "before the tide turns tonight", "within the week, or the deal is off", "before the king's birthday", "no rush, which is suspicious in itself",
];

const BONUS_REWARDS = [
  "a favor owed by the patron's powerful family", "free lodging at the inn for life", "a deed to an abandoned property",
  "a minor magic item from the patron's collection", "a letter of introduction to the royal court", "a map to a forgotten treasure",
  "honorary membership in the merchants' guild", "the secret of a shortcut through the mountains", "a horse from the baron's stables",
  "the answer to a question one of them has been asking", "a pardon for one past crime, no questions asked", "first pick of the spoils",
  "a share in a trading venture", "the town's undying gratitude (and a statue)",
];

const TWISTS = [
  "the patron is secretly working for the enemy", "the 'monster' is protecting something worse", "a rival adventuring party has the same job",
  "the reward is counterfeit", "the victims went willingly", "the location is not empty: it is occupied by refugees",
  "someone in town is warning the enemy of every move", "the patron's story is true, but they left out the curse",
  "the treasure belongs to a dragon who will want it back", "it is all a test set by a powerful organization",
  "the villain is the patron's estranged sibling", "the job was already done once, and undone", "the party was chosen because one of them is the key",
  "it's a trap meant for the patron, and the party is the bait", "the villain has a point", "the thing they're sent to kill is the last of its kind",
  "the map is accurate, but the place has moved", "time runs differently there: a day inside is a week outside",
];

const TITLE_NOUNS = ["Bells", "Tide", "Ash", "Lantern", "Crown", "Thorn", "Hollow", "Silence", "Ember", "Debt", "Mirror", "Oath", "Mask", "Well", "Ledger", "Song", "Spire", "Serpent", "Harvest", "Key"];
const TITLE_ADJ = ["Drowned", "Silver", "Broken", "Hollow", "Last", "Crimson", "Forgotten", "Gilded", "Midnight", "Iron", "Weeping", "Sleeping", "Hungry", "Twice-Told", "Burning", "Pale"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Reward scales roughly with level squared; rounded to a believable figure. */
const rollReward = (rng: Rng, level: number) => Math.round((level * level * 25 + rng.int(0, level * 50)) / 10) * 10;

/** The read-aloud paragraph from a hook's parts. */
export function composeHookText(h: Omit<PlotHook, "text" | "seed">): string {
  return `${capitalize(h.patron)} approaches the party with an urgent request: ${h.goal}, ${h.deadline}. ` +
    `The trail leads to ${h.location}. The catch: ${h.complication}. ` +
    `They offer ${h.rewardGp} gp for the job, half up front, and ${h.bonusReward}.`;
}

/** Roll one part of a hook. */
function rollPart(rng: Rng, part: HookPart, tone: PlotHook["tone"], level: number): string | number {
  switch (part) {
    case "title": return `The ${rng.pick(TITLE_ADJ)} ${rng.pick(TITLE_NOUNS)}`;
    case "patron": return rng.pick(PATRONS);
    case "location": return rng.pick(LOCATIONS);
    case "goal": return rng.pick(GOALS[tone]);
    case "complication": return rng.pick(COMPLICATIONS);
    case "villain": return rng.pick(VILLAINS);
    case "deadline": return rng.pick(DEADLINES);
    case "reward": return rollReward(rng, level);
    case "bonusReward": return rng.pick(BONUS_REWARDS);
    case "twist": return rng.pick(TWISTS);
  }
}

export function generateHook(opts: HookOptions = {}): PlotHook {
  const rng = createRng(opts.seed);
  const partyLevel = Math.max(1, Math.min(20, opts.partyLevel ?? 3));
  const tone = !opts.tone || opts.tone === "any" ? rng.pick(HOOK_TONES) : opts.tone;
  const part = (p: HookPart) => rollPart(rng, p, tone, partyLevel);
  const hook: Omit<PlotHook, "text"> = {
    seed: rng.seed,
    tone,
    partyLevel,
    patron: part("patron") as string,
    location: part("location") as string,
    goal: part("goal") as string,
    twist: part("twist") as string,
    rewardGp: part("reward") as number,
    title: part("title") as string,
    complication: part("complication") as string,
    villain: part("villain") as string,
    deadline: part("deadline") as string,
    bonusReward: part("bonusReward") as string,
  };
  return { ...hook, text: composeHookText(hook) };
}

/** Reroll one part and rebuild the text. */
export function rerollHookPart(hook: PlotHook, part: HookPart, seed?: string | number): PlotHook {
  const rng = createRng(seed);
  let value = rollPart(rng, part, hook.tone, hook.partyLevel);
  // Don't "reroll" into the same thing.
  for (let i = 0; i < 5 && value === (part === "reward" ? hook.rewardGp : hook[part]); i++) value = rollPart(rng, part, hook.tone, hook.partyLevel);
  const next = part === "reward" ? { ...hook, rewardGp: value as number } : { ...hook, [part]: value as string };
  return { ...next, text: composeHookText(next) };
}
