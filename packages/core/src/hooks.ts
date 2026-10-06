import { createRng } from "./rng.ts";

export type HookTone = "any" | "heroic" | "mystery" | "horror" | "intrigue";

export interface PlotHook {
  seed: string;
  title: string;
  /** One read-aloud-ready paragraph. */
  text: string;
  patron: string;
  location: string;
  goal: string;
  twist: string;
  rewardGp: number;
  tone: Exclude<HookTone, "any">;
}

export interface HookOptions {
  partyLevel?: number;
  tone?: HookTone;
  seed?: string | number;
}

const PATRONS = [
  "a nervous halfling innkeeper",
  "the widowed baroness of the river holdings",
  "a temple acolyte who speaks only in whispers",
  "a one-eyed dwarven caravan master",
  "a merchant guild factor with ink-stained fingers",
  "a retired adventurer who walks with a cane",
  "the town's overworked constable",
  "a child clutching a hand-drawn map",
  "a scholar from the distant academy",
  "an elven ranger wounded and short of breath",
  "a gnome inventor whose workshop just exploded",
  "a masked emissary who will not give a name",
];

const LOCATIONS = [
  "the drowned crypts beneath the old lighthouse",
  "an abandoned silver mine in the foothills",
  "the ruined monastery on Cinder Hill",
  "a sunken barge in the marsh",
  "the sewers under the merchant quarter",
  "a wizard's tower that appeared overnight",
  "the hollow inside a dead giant oak",
  "a frozen watchtower on the northern pass",
  "the catacombs below the cathedral",
  "a smugglers' cave reachable only at low tide",
  "the burned-out manor of a disgraced noble",
  "a goblin-held bridge fort on the trade road",
];

const GOALS: Record<PlotHook["tone"], readonly string[]> = {
  heroic: [
    "rescue the villagers taken in last night's raid",
    "recover a stolen relic before it is destroyed",
    "drive off the beast that has been killing livestock",
    "escort a supply wagon through contested land",
    "destroy the source of a creeping blight",
  ],
  mystery: [
    "find out why the town's bells ring at midnight on their own",
    "learn what happened to a survey team that never returned",
    "identify who has been leaving silver coins on the graves",
    "decipher the map found sewn into a dead courier's coat",
    "discover why the well water now tastes of copper",
  ],
  horror: [
    "find the missing children before the new moon",
    "seal the door that someone has been opening from below",
    "put to rest the knight who rides the road at dusk",
    "burn the nest before the eggs hatch",
    "retrieve a body that will not stay buried",
  ],
  intrigue: [
    "steal back a letter that could start a war",
    "plant false evidence on a corrupt magistrate",
    "protect a witness until the trial at week's end",
    "uncover which council member is selling secrets",
    "deliver a sealed message without anyone learning of it",
  ],
};

const TWISTS = [
  "the patron is secretly working for the enemy",
  "the 'monster' is protecting something worse",
  "a rival adventuring party has the same job",
  "the reward is counterfeit",
  "the victims went willingly",
  "the location is not empty — it is occupied by refugees",
  "someone in town is warning the enemy of every move",
  "the patron's story is true, but they left out the curse",
  "the treasure belongs to a dragon who will want it back",
  "it is all a test set by a powerful organization",
];

const TITLE_NOUNS = ["Bells", "Tide", "Ash", "Lantern", "Crown", "Thorn", "Hollow", "Silence", "Ember", "Debt", "Mirror", "Oath"];
const TITLE_ADJ = ["Drowned", "Silver", "Broken", "Hollow", "Last", "Crimson", "Forgotten", "Gilded", "Midnight", "Iron"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function generateHook(opts: HookOptions = {}): PlotHook {
  const rng = createRng(opts.seed);
  const level = Math.max(1, Math.min(20, opts.partyLevel ?? 3));
  const tone = !opts.tone || opts.tone === "any" ? rng.pick(["heroic", "mystery", "horror", "intrigue"] as const) : opts.tone;

  const patron = rng.pick(PATRONS);
  const location = rng.pick(LOCATIONS);
  const goal = rng.pick(GOALS[tone]);
  const twist = rng.pick(TWISTS);
  // Reward scales roughly with level squared; rounded to a believable figure.
  const rewardGp = Math.round((level * level * 25 + rng.int(0, level * 50)) / 10) * 10;
  const title = `The ${rng.pick(TITLE_ADJ)} ${rng.pick(TITLE_NOUNS)}`;

  const text = `${capitalize(patron)} approaches the party with an urgent request: ${goal}. ` +
    `The trail leads to ${location}. They offer ${rewardGp} gp for the job, half up front.`;

  return { seed: rng.seed, title, text, patron, location, goal, twist, rewardGp, tone };
}
