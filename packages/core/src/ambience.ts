// ---------------------------------------------------------------------------
// Ambience: which mood fits a scene, which of your audio files fit which mood (by their names),
// how dark each time of day is, and which of Foundry's weather effects matches a weather line.

export type Mood = "dungeon" | "cave" | "town" | "tavern" | "forest" | "wilderness" | "sea" | "farm" | "temple" | "night" | "storm" | "combat" | "travel" | "crypt";

export const MOODS: Mood[] = ["dungeon", "cave", "crypt", "town", "tavern", "temple", "forest", "wilderness", "farm", "sea", "night", "storm", "travel", "combat"];

const WORDS: Record<Mood, RegExp> = {
  dungeon: /dungeon|underground|catacomb|prison|cellar|sewer|vault/i,
  cave: /cave|cavern|mine|underdark|grotto/i,
  crypt: /crypt|tomb|grave|haunt|undead|necro|ghost|spooky|horror/i,
  town: /town|city|village|market|street|crowd|people|bustl|square|harbou?r town/i,
  tavern: /tavern|inn\b|pub|bar\b|alehouse|feast|talking|chatter/i,
  temple: /temple|church|chant|choir|monaster|shrine|cathedral|holy/i,
  forest: /forest|wood|jungle|grove|bird|elven/i,
  wilderness: /wild|plain|field|meadow|hill|mountain|wind|desert|camp ?fire|campfire/i,
  farm: /farm|chicken|barn|pasture|cow|rural|countryside/i,
  sea: /sea\b|ocean|dock|port|harbou?r|ship|wave|shore|beach|coast/i,
  night: /night|cricket|owl|nocturn/i,
  storm: /storm|rain|thunder|blizzard|snow/i,
  combat: /combat|battle|fight|boss|war\b|action|epic|clash/i,
  travel: /travel|journey|adventure|road|overworld|theme|main theme|explor/i,
};

/** The moods an audio file fits, from its path. */
export function classifyAudio(path: string): Mood[] {
  const name = decodeURIComponent(path).replace(/[_\-.]+/g, " ");
  return MOODS.filter((m) => WORDS[m].test(name));
}

/** The mood for a scene the toolkit made, from its kind and setting. */
export function sceneMood(kind?: string, setting?: string, style?: string): Mood {
  if (kind === "world") return "travel";
  if (kind === "dungeon" || kind === undefined && style) return style === "cave" ? "cave" : "dungeon";
  const s = setting ?? "";
  if (/tavern|inn/.test(s)) return "tavern";
  if (/town|market|street|village|city/.test(s)) return "town";
  if (/temple|shrine/.test(s)) return "temple";
  if (/graveyard|crypt|tomb/.test(s)) return "crypt";
  if (/docks|bridge|coast|beach|ship/.test(s)) return "sea";
  if (/farm/.test(s)) return "farm";
  if (/forest|clearing|grove|swamp/.test(s)) return "forest";
  if (/cave|mine/.test(s)) return "cave";
  if (/camp|road|ruins|hills|wild/.test(s)) return "wilderness";
  return kind === "town" ? "town" : "wilderness";
}

/** Fallback moods when you have no tracks for the exact one. */
export const MOOD_FALLBACK: Record<Mood, Mood[]> = {
  dungeon: ["cave", "crypt"], cave: ["dungeon"], crypt: ["dungeon", "night"], town: ["tavern", "farm"], tavern: ["town"],
  temple: ["town"], forest: ["wilderness", "night"], wilderness: ["forest", "travel"], farm: ["town", "wilderness"],
  sea: ["town", "wilderness"], night: ["forest", "wilderness"], storm: ["wilderness"], travel: ["wilderness", "forest"], combat: [],
};

export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

/** Scene darkness for a time of day (indoors and underground ignore it). */
export const TIME_DARKNESS: Record<TimeOfDay, number> = { dawn: 0.35, day: 0, dusk: 0.5, night: 0.85 };

/** Foundry's weather effect for a weather line ("Heavy rain and wind" → "rainStorm"). */
export function weatherEffect(text: string, season?: string): string {
  const t = text.toLowerCase();
  if (/blizzard|whiteout/.test(t)) return "blizzard";
  if (/snow|sleet|flurr/.test(t)) return "snow";
  if (/storm|thunder|downpour|heavy rain|gale/.test(t)) return "rainStorm";
  if (/rain|drizzle|shower/.test(t)) return "rain";
  if (/fog|mist|haze/.test(t)) return "fog";
  if (/wind|gust|breez/.test(t) && season === "autumn") return "autumnLeaves";
  if (/wind|gust/.test(t)) return "leaves";
  return "";
}

export const WEATHER_EFFECTS: [id: string, label: string][] = [["", "Clear"], ["rain", "Rain"], ["rainStorm", "Storm"], ["fog", "Fog"], ["snow", "Snow"], ["blizzard", "Blizzard"], ["leaves", "Wind and leaves"], ["autumnLeaves", "Autumn leaves"]];
