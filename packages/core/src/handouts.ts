import { createRng } from "./rng.ts";

// ---------------------------------------------------------------------------
// Player handouts: wanted posters, intercepted letters and treasure maps. Text here; the Foundry
// side paints them as images to show the table.

export type HandoutKind = "wanted" | "letter" | "map";

/** Story threads a handout can use, e.g. from the current side quest. */
export interface HandoutContext {
  villain?: string;
  macguffin?: string;
  lair?: string;
  sigil?: string;
  region?: string;
  town?: string;
}

export interface Handout {
  seed: string;
  kind: HandoutKind;
  title: string;
  /** Main text lines, top to bottom. */
  lines: string[];
  /** Small print / signature / map note. */
  footer: string;
  /** Wanted: the reward line. Letter: the seal's letter. */
  accent: string;
  /** Map landmarks to place and label. */
  landmarks?: string[];
  /** What the GM should know that the handout doesn't say. */
  gmNote: string;
}

const NAMES = ["Black Tom Varrow", "Mags the Knife", "Silas Crane", "One-Eyed Jessa", "the Gentleman", "Corvin Dusk", "Red Ilsa", "Hob Kettleblack", "the Lantern Thief", "Brannoc Vey"];
const CRIMES = ["highway robbery", "murder of a royal tax collector", "arson of the granary", "horse theft (seven horses)", "kidnapping", "desecration of the temple", "forgery of the lord's seal", "smuggling and sedition", "poisoning a well", "jailbreak"];
const LOOKS = ["tall, with a scar through the left eyebrow", "short, bald, missing two fingers", "a woman with braided red hair and a crooked smile", "thin as a rake, always in a grey cloak", "broad-shouldered, with a tattooed neck", "an elf with silver eyes and a quiet voice"];
const SENDERS = ["your servant", "a friend", "M.", "the Collector", "one who watches", "your loving sister", "Captain V.", "the Hand"];
const OPENINGS = ["My dear", "Brother", "To whom it may concern,", "Friend,", "You fool,", "Most esteemed"];
const MAP_TITLES = ["The way to", "The secret path to", "Here lies the hoard, at", "What was buried at"];
const LANDMARKS = ["Hanging Tree", "Three Sisters (stones)", "Old Mill", "Crow's Peak", "Drowned Chapel", "Wolf Ford", "Broken Tower", "Hermit's Well", "Bone Bridge", "Weeping Rock", "Fox Hollow", "Saltmarsh"];

const pickOr = <T>(v: T | undefined, fallback: T) => (v ? v : fallback);

export function generateHandout(opts: { kind?: HandoutKind | "random"; context?: HandoutContext; seed?: string | number } = {}): Handout {
  const rng = createRng(opts.seed);
  const kind: HandoutKind = !opts.kind || opts.kind === "random" ? rng.pick(["wanted", "letter", "map"] as const) : opts.kind;
  const c = opts.context ?? {};
  const villainName = c.villain?.split(",")[0]?.replace(/^the /i, "The ");

  if (kind === "wanted") {
    const name = pickOr(villainName, rng.pick(NAMES));
    const reward = rng.pick([50, 100, 250, 500, 1000]);
    return {
      seed: rng.seed, kind, title: "WANTED",
      lines: [rng.chance(0.4) ? "DEAD OR ALIVE" : "FOR CRIMES AGAINST THE CROWN", name.toUpperCase(), `for ${rng.pick(CRIMES)}`, `Described as ${rng.pick(LOOKS)}.`],
      accent: `${reward} GOLD REWARD`,
      footer: `Bring word to the magistrate${c.town ? ` of ${c.town}` : ""}.${c.sigil ? ` Known by their mark: ${c.sigil}.` : ""}`,
      gmNote: `${name} is ${rng.pick(["guilty, and worse than the poster says", "innocent, framed by the one who posted the bounty", "already dead; someone else is using the name", "hiding in plain sight in the next town"])}.`,
    };
  }

  if (kind === "letter") {
    const from = pickOr(villainName, rng.pick(SENDERS));
    const body = [
      `${rng.pick(OPENINGS)}`,
      c.macguffin ? `The ${c.macguffin.replace(/^(a|an|the) /i, "")} is in hand. Keep it hidden until the appointed night.` : "The goods are in hand. Keep them hidden until the appointed night.",
      c.lair ? `Bring the others to ${c.lair}. Tell no one, least of all the priest.` : "Bring the others to the old place. Tell no one, least of all the priest.",
      rng.pick(["If the meddlers come, let them find nothing.", "Burn this letter once you've read it.", "The payment will be waiting under the third stone.", "Remember what happened to the last one who talked."]),
    ];
    return {
      seed: rng.seed, kind, title: "An intercepted letter", lines: body, footer: `— ${from}`, accent: from.replace(/^the /i, "").charAt(0).toUpperCase(),
      gmNote: `The letter was meant for ${rng.pick(["a guard captain on the take", "the innkeeper", "a cultist hiding as an acolyte", "the patron's own steward"])}.${c.sigil ? ` The seal shows ${c.sigil}.` : ""}`,
    };
  }

  const landmarks = rng.shuffle(LANDMARKS).slice(0, 4);
  const target = pickOr(c.lair, rng.pick(["the Smugglers' Cave", "the Sunken Vault", "the Old King's Barrow", "the Cinder Hollow"]));
  return {
    seed: rng.seed, kind: "map", title: `${rng.pick(MAP_TITLES)} ${target}`,
    lines: [`From ${landmarks[0]}, follow the water to ${landmarks[1]}.`, `At ${landmarks[2]}, turn your back to the sun.`, `Count the paces to ${landmarks[3]} and dig where the X lies.`],
    landmarks, accent: "X", footer: c.region ? `Somewhere in ${c.region}.` : "Somewhere past the edge of the known roads.",
    gmNote: `The map is ${rng.pick(["accurate", "accurate, but the treasure was moved", "a forgery meant to lure treasure-hunters into a trap", "accurate, and someone else has a copy"])}.`,
  };
}
