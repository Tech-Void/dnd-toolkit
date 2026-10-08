import { createRng, randomSeed, type Rng } from "./rng.ts";
import type { BattlemapSetting } from "./battlemap.ts";
import type { Difficulty } from "./encounter.ts";
import type { MissionCheck } from "./sidequest.ts";

// ---------------------------------------------------------------------------
// Overland travel, day by day: weather, distance, navigation, foraging, and whatever the road
// throws at the party. Checks are ready to send as roll requests; fights carry their seeds.

export type Terrain = "road" | "grassland" | "forest" | "hills" | "mountains" | "swamp" | "desert" | "arctic" | "coast";
export type Climate = "temperate" | "cold" | "hot";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Pace = "slow" | "normal" | "fast";

export const TERRAINS: Record<Terrain, { label: string; tags: string; map: BattlemapSetting; difficult: boolean; navDc: number | null; forageDc: number; danger: number }> = {
  road: { label: "Road", tags: "humanoid+bandit, grassland, forest", map: "road", difficult: false, navDc: null, forageDc: 15, danger: 0.25 },
  grassland: { label: "Grassland", tags: "grassland", map: "clearing", difficult: false, navDc: 10, forageDc: 12, danger: 0.3 },
  forest: { label: "Forest", tags: "forest", map: "clearing", difficult: true, navDc: 13, forageDc: 10, danger: 0.4 },
  hills: { label: "Hills", tags: "hill", map: "ruins", difficult: false, navDc: 12, forageDc: 12, danger: 0.35 },
  mountains: { label: "Mountains", tags: "mountain", map: "cave", difficult: true, navDc: 15, forageDc: 15, danger: 0.4 },
  swamp: { label: "Swamp", tags: "swamp", map: "clearing", difficult: true, navDc: 15, forageDc: 13, danger: 0.45 },
  desert: { label: "Desert", tags: "desert", map: "ruins", difficult: false, navDc: 15, forageDc: 18, danger: 0.35 },
  arctic: { label: "Arctic", tags: "arctic", map: "clearing", difficult: true, navDc: 15, forageDc: 18, danger: 0.4 },
  coast: { label: "Coast", tags: "coast", map: "road", difficult: false, navDc: 10, forageDc: 10, danger: 0.3 },
};

export interface Weather {
  text: string;
  /** Mechanical effect, if any. */
  effect?: string;
  /** Multiplies the day's distance. */
  speed: number;
}

export type DayEventKind = "quiet" | "encounter" | "hazard" | "discovery" | "meeting";

export interface TravelDay {
  day: number;
  id: string;
  weather: Weather;
  miles: number;
  /** Checks for the day: navigation, foraging, the event's own. */
  checks: (MissionCheck & { who: "navigator" | "watch" | "everyone" | "forager" })[];
  event: {
    kind: DayEventKind;
    text: string;
    /** For encounters: when it strikes. */
    time?: string;
    encounter?: { tags: string; difficulty: Difficulty; seed: string; map: BattlemapSetting };
    /** For discoveries that could become a side quest. */
    questKeyword?: string;
  };
}

export interface Journey {
  seed: string;
  from: string;
  to: string;
  terrain: Terrain;
  climate: Climate;
  season: Season;
  pace: Pace;
  partyLevel: number;
  foes?: string;
  encounters?: "rare" | "normal" | "frequent";
  difficultyShift?: -1 | 0 | 1;
  days: TravelDay[];
  totalMiles: number;
}

export interface TravelOptions {
  from?: string;
  to?: string;
  days?: number;
  terrain?: Terrain;
  climate?: Climate;
  season?: Season;
  pace?: Pace;
  partyLevel?: number;
  /** Monster tags for the road's fights, instead of the terrain's. */
  foes?: string;
  /** How often trouble finds them. */
  encounters?: "rare" | "normal" | "frequent";
  /** Every fight one step easier or harder. */
  difficultyShift?: -1 | 0 | 1;
  seed?: string | number;
}

const PACE_MILES: Record<Pace, number> = { slow: 18, normal: 24, fast: 30 };

const WEATHER: Record<Climate, Record<Season, [Weather, number][]>> = (() => {
  const clear: Weather = { text: "Clear skies", speed: 1 };
  const overcast: Weather = { text: "Grey and overcast", speed: 1 };
  const wind: Weather = { text: "Strong winds", effect: "Disadvantage on ranged weapon attacks and on Wisdom (Perception) checks that rely on hearing; open flames go out.", speed: 1 };
  const rain: Weather = { text: "Steady rain", effect: "Lightly obscured beyond 100 feet; disadvantage on Perception checks relying on sight; fires are hard to light.", speed: 0.9 };
  const storm: Weather = { text: "A violent thunderstorm", effect: "Heavily obscured beyond 60 feet; disadvantage on Perception; travel is half speed; lightning strikes the tallest thing around.", speed: 0.5 };
  const fog: Weather = { text: "Thick fog until midday", effect: "Heavily obscured beyond 30 feet; navigation DC +5.", speed: 0.75 };
  const hot: Weather = { text: "Blistering heat", effect: "Without plenty of water, each traveler makes a DC 12 Constitution save at day's end or gains a level of exhaustion (disadvantage if in heavy armor).", speed: 0.9 };
  const cold: Weather = { text: "Bitter cold", effect: "Without cold-weather gear, each traveler makes a DC 10 Constitution save at day's end or gains a level of exhaustion.", speed: 0.9 };
  const snow: Weather = { text: "Heavy snowfall", effect: "Lightly obscured; the ground is difficult terrain; travel is half speed.", speed: 0.5 };
  const mild: Weather = { text: "Mild and pleasant", speed: 1 };
  return {
    temperate: {
      spring: [[clear, 3], [rain, 3], [overcast, 2], [fog, 1], [wind, 1], [storm, 1]],
      summer: [[clear, 5], [mild, 2], [storm, 1], [hot, 1], [overcast, 1]],
      autumn: [[overcast, 3], [rain, 3], [wind, 2], [fog, 2], [clear, 2]],
      winter: [[cold, 3], [snow, 2], [overcast, 2], [clear, 1], [fog, 1]],
    },
    cold: {
      spring: [[cold, 3], [overcast, 2], [snow, 1], [clear, 1]],
      summer: [[clear, 3], [overcast, 2], [rain, 2], [fog, 1]],
      autumn: [[cold, 3], [snow, 2], [wind, 2], [overcast, 1]],
      winter: [[snow, 4], [cold, 4], [wind, 2]],
    },
    hot: {
      spring: [[clear, 4], [hot, 2], [wind, 1]],
      summer: [[hot, 5], [clear, 2], [wind, 2], [storm, 1]],
      autumn: [[clear, 4], [hot, 2], [storm, 1]],
      winter: [[mild, 4], [clear, 3], [rain, 1]],
    },
  };
})();

const QUIET = [
  "The road is empty and the miles pass easily.", "A herd of deer crosses ahead, unbothered.", "They pass a farmhouse; the farmer waves and offers water.",
  "Long, uneventful hours; someone tells a story that goes on far too long.", "They find a good campsite with clean water and dry wood.",
  "Distant smoke on the horizon, but it's only a charcoal burner.",
];
const HAZARDS: Record<string, [string, string, "skill" | "save", string][]> = {
  any: [
    ["A river in flood blocks the way; fording it is dangerous", "ath", "skill", "ford the swollen river (failure: swept 50 feet downstream, 1d6 bludgeoning, a pack lost)"],
    ["A rockslide thunders down the slope", "dex", "save", "get clear of the rockslide (2d10 bludgeoning on a failure)"],
    ["A bridge has rotted through", "ath", "skill", "climb across the broken bridge"],
    ["Someone's horse throws a shoe and goes lame", "ani", "skill", "nurse the horse along (failure: it slows the party; lose a quarter of the day)"],
  ],
  swamp: [["Sucking mud hides deep sinkholes", "str", "save", "pull free of the sinkhole before it swallows you"], ["Swarms of biting insects rise at dusk", "con", "save", "shake off the swamp fever (failure: poisoned until a long rest)"]],
  mountains: [["The path narrows to a ledge above a long drop", "dex", "save", "keep your footing on the crumbling ledge"], ["Thin air saps everyone's strength", "con", "save", "push on through the altitude sickness"]],
  desert: [["A sandstorm rolls in", "con", "save", "endure the sandstorm (failure: a level of exhaustion)"], ["The water skins have been leaking", "sur", "skill", "find water before nightfall"]],
  arctic: [["Thin ice over a frozen lake", "dex", "save", "get off the cracking ice"], ["A whiteout erases the trail", "sur", "skill", "keep your bearings in the whiteout"]],
  forest: [["The trail vanishes into thick undergrowth", "sur", "skill", "find the way through"], ["A patch of razorvine blocks the path", "dex", "save", "push through the razorvine (1d10 slashing on a failure)"]],
};
const DISCOVERIES: [string, string | undefined][] = [
  ["A ruined watchtower, its door hanging open; fresh boot prints lead inside", "the ruined watchtower"],
  ["A shrine to a forgotten god, with an offering bowl still warm", "the forgotten shrine"],
  ["An abandoned campsite with a half-burned letter in the fire", undefined],
  ["A wrecked wagon, its cargo scattered and its driver gone", "the vanished driver"],
  ["A cave mouth breathing cold air, and scratch marks around it", "the breathing cave"],
  ["A standing stone that hums when touched", "the humming stone"],
  ["A battlefield from an old war; something glints among the bones", "the old battlefield"],
  ["A lone tower where a light burns at night, though the door is bricked up", "the bricked tower"],
  ["A hanged man at the crossroads, with a note pinned to his coat", "the crossroads hanging"],
  ["An orchard heavy with fruit in the wrong season", "the wrong-season orchard"],
];
const MEETINGS = [
  "A merchant caravan heading the other way; they'll trade and share news of the road ahead.",
  "Pilgrims on their way to a shrine, who ask to travel together for safety.",
  "A patrol of the lord's soldiers, who want to know the party's business.",
  "A lone traveler who claims to be a cartographer, and asks far too many questions.",
  "Refugees fleeing something they won't describe.",
  "A traveling tinker with a cart full of oddities, a few of them magical.",
  "A wounded messenger who begs them to carry a sealed letter onward.",
  "A rival adventuring party, heading for the same place for the same reason.",
];
const TIMES = ["at dawn, as camp is struck", "around midday", "late in the afternoon", "at dusk", "during the first watch", "in the dead of night, during the last watch"];

const dayId = (rng: Rng) => Math.floor(rng.next() * 36 ** 6).toString(36).padStart(6, "0");

type DayRules = Required<Omit<TravelOptions, "seed" | "from" | "to" | "foes" | "encounters" | "difficultyShift">> & Pick<TravelOptions, "foes" | "encounters" | "difficultyShift">;
const FREQUENCY = { rare: 0.5, normal: 1, frequent: 1.6 };
const DIFFS: Difficulty[] = ["low", "moderate", "high", "deadly"];

/** Weather for one day (or night), by climate and season. */
export function rollWeather(climate: Climate, season: Season, seed?: string | number): Weather {
  return createRng(seed).weighted(WEATHER[climate][season]);
}

function rollDay(rng: Rng, n: number, o: DayRules): TravelDay {
  const t = TERRAINS[o.terrain];
  const weather = rng.weighted(WEATHER[o.climate][o.season]);
  const miles = Math.round(PACE_MILES[o.pace] * (t.difficult ? 0.5 : 1) * weather.speed);
  const checks: TravelDay["checks"] = [];
  if (t.navDc !== null) {
    const fogged = weather.text.startsWith("Thick fog") ? 5 : 0;
    checks.push({ key: "sur", type: "skill", dc: t.navDc + fogged + (o.pace === "fast" ? 2 : 0), why: "keep the party on course (failure: lost for 1d6 hours)", who: "navigator" });
  }
  checks.push({ key: "sur", type: "skill", dc: t.forageDc, why: "forage enough food and water for the day", who: "forager" });

  const danger = (t.danger + (o.pace === "slow" ? -0.05 : 0)) * FREQUENCY[o.encounters ?? "normal"];
  const roll = rng.next();
  let event: TravelDay["event"];
  if (roll < danger) {
    const time = rng.pick(TIMES);
    event = {
      kind: "encounter",
      time,
      text: `Trouble ${time}.`,
      encounter: {
        tags: o.foes?.trim() || t.tags,
        difficulty: DIFFS[Math.max(0, Math.min(3, DIFFS.indexOf(rng.weighted([["low", 3], ["moderate", 4], ["high", 1]] as const)) + (o.difficultyShift ?? 0)))]!,
        seed: randomSeedFrom(rng),
        map: t.map,
      },
    };
    // The watch gets a chance to see it coming (stealthy foes: passive Perception may not be enough).
    checks.push({ key: "prc", type: "skill", dc: 12 + Math.floor(o.partyLevel / 4), why: "spot the danger before it's on top of you", who: "watch" });
  } else if (roll < danger + 0.15) {
    const [text, key, type, why] = rng.pick([...(HAZARDS[o.terrain] ?? []), ...HAZARDS.any!]);
    event = { kind: "hazard", text: `${text}.` };
    checks.push({ key, type, dc: 10 + Math.floor(o.partyLevel / 3) + rng.int(1, 3), why, who: "everyone" });
  } else if (roll < danger + 0.3) {
    const [text, keyword] = rng.pick(DISCOVERIES);
    event = { kind: "discovery", text: `${text}.`, questKeyword: keyword };
    checks.push({ key: "inv", type: "skill", dc: 12, why: "learn what happened here", who: "everyone" });
  } else if (roll < danger + 0.45) {
    event = { kind: "meeting", text: rng.pick(MEETINGS) };
  } else {
    event = { kind: "quiet", text: rng.pick(QUIET) };
  }
  return { day: n, id: dayId(rng), weather, miles, checks, event };
}

const randomSeedFrom = (rng: Rng) => Math.floor(rng.next() * 36 ** 6).toString(36);

export function planJourney(opts: TravelOptions = {}): Journey {
  const rng = createRng(opts.seed);
  const o = {
    days: Math.max(1, Math.min(21, opts.days ?? 3)),
    terrain: opts.terrain ?? "road",
    climate: opts.climate ?? "temperate",
    season: opts.season ?? rng.pick(["spring", "summer", "autumn", "winter"] as const),
    pace: opts.pace ?? "normal",
    partyLevel: Math.max(1, Math.min(20, opts.partyLevel ?? 3)),
    foes: opts.foes,
    encounters: opts.encounters,
    difficultyShift: opts.difficultyShift,
  };
  const days = Array.from({ length: o.days }, (_, i) => rollDay(rng, i + 1, o));
  return {
    seed: rng.seed,
    from: opts.from?.trim() || "the last town",
    to: opts.to?.trim() || "their destination",
    ...o,
    days,
    totalMiles: days.reduce((sum, d) => sum + d.miles, 0),
  };
}

/** Reroll one day, keeping the rest of the trip. */
export function rerollDay(j: Journey, id: string, seed: string | number = randomSeed()): Journey {
  const rng = createRng(seed);
  const days = j.days.map((d) => (d.id === id ? rollDay(rng, d.day, { ...j, days: j.days.length }) : d));
  return { ...j, days, totalMiles: days.reduce((sum, d) => sum + d.miles, 0) };
}
