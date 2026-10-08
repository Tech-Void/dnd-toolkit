import { createRng, type Rng } from "./rng.ts";
import { rollWeather, TERRAINS, type Climate, type Season, type Terrain, type Weather } from "./travel.ts";
import type { BattlemapSetting } from "./battlemap.ts";
import type { Difficulty } from "./encounter.ts";
import type { MaterialTag } from "./crafting.ts";

// ---------------------------------------------------------------------------
// Making camp for a long rest, as something the table does together: pick a spot, everyone takes
// a job for the evening, the watches are set, the night plays out watch by watch, and the morning
// tallies what it all came to. Pure data; the Foundry side stores it and shows it to everyone.

export type CampPhase = "site" | "setup" | "night" | "morning";

export interface RollSpec {
  type: "skill" | "check" | "save";
  key: string;
  dc: number;
}

// --- Sites ---------------------------------------------------------------------------------

export interface CampSite {
  name: string;
  text: string;
  /** Out of the weather. */
  shelter: boolean;
  /** Fresh water close by. */
  water: boolean;
  /** Hard to find: fewer night visitors. */
  hidden: boolean;
  perk: string;
  risk?: string;
  /** Tweaks: forage DC, watch Perception, chance of trouble (×), something to scavenge. */
  mods: { forage?: number; perception?: number; danger?: number; scavenge?: boolean };
}

type SiteRow = [name: string, text: string, flags: string, perk: string, risk: string | null, mods: CampSite["mods"]];
// flags: s = shelter, w = water, h = hidden.
const SITES: Partial<Record<Terrain, SiteRow[]>> & { any: SiteRow[] } = {
  any: [
    ["Ruined waystation", "Three walls and half a roof of an old coaching inn.", "s", "Shelter, and old cellars to poke through.", "Others know this spot too.", { scavenge: true, danger: 1.2 }],
    ["Hollow beneath a great oak", "Roots form a wide, dry bowl under an ancient tree.", "sh", "Sheltered and well hidden.", "Cramped: no room for a big fire.", { danger: 0.8 }],
    ["Hilltop clearing", "A bald crown of grass with a view in every direction.", "", "The watch sees trouble coming (+2 Perception).", "Exposed to wind and weather, and the fire is seen for miles.", { perception: 2, danger: 1.15 }],
    ["Old shepherd's hut", "A stone hut with a turf roof and a cold hearth.", "s", "A proper roof and a chimney.", "Mice. Many mice.", {}],
    ["Riverside shingle", "A bend in the river where the bank flattens into pebbles.", "w", "Fresh water and easy fishing (forage DC -2).", "The rushing water drowns out approaching footsteps (-2 Perception).", { forage: -2, perception: -2 }],
    ["Abandoned campsite", "Someone else camped here not long ago: a fire ring, a lean-to, trampled grass.", "s", "A ready lean-to and a fire pit.", "Whoever left may come back.", { danger: 1.25, scavenge: true }],
  ],
  forest: [
    ["Mossy glade", "A soft clearing ringed by birches.", "w", "A spring bubbles nearby, and the woods are full of food (forage DC -2).", null, { forage: -2 }],
    ["Thicket den", "A dense knot of brambles with a hollow at its heart.", "sh", "Almost impossible to stumble on.", "Thorns snag everything; the watch can't see far (-2 Perception).", { danger: 0.7, perception: -2 }],
    ["Fallen giant tree", "A huge trunk lies on its side, its underside a natural shelter.", "s", "Dry, sheltered and easy to defend.", null, {}],
  ],
  hills: [
    ["Rock overhang", "A shelf of stone juts out over a flat ledge.", "s", "Out of the rain, with a wall at your back.", null, { danger: 0.9 }],
    ["Barrow mound", "A grassy mound with a collapsed stone entrance.", "sh", "Shelter in the entry passage.", "It's a grave. Something may object.", { scavenge: true, danger: 1.2 }],
  ],
  mountains: [
    ["Shallow cave", "A dry cave mouth, just deep enough for everyone.", "sh", "Real shelter from wind and snow.", "Something else may call it home.", { danger: 1.15 }],
    ["Pass shrine", "A tiny shrine to a mountain god, with a wall against the wind.", "s", "Shelter, and a sense of being watched over.", null, { danger: 0.85 }],
  ],
  swamp: [
    ["Raised hummock", "A dry island of land above the mire.", "", "Dry ground, at least.", "Biting insects all night.", { danger: 1.1 }],
    ["Stilt hut", "An abandoned fisher's hut on wooden legs.", "s", "Off the ground and under a roof.", "The floorboards creak with every step (watch hears it, so does everything else).", { perception: 1, danger: 1.1 }],
  ],
  desert: [
    ["Wind-carved hollow", "A bowl in the rocks out of the wind and sun.", "sh", "Shade and shelter.", "Cold at night: bring a fire.", {}],
    ["Oasis edge", "A ring of palms around a muddy pool.", "w", "Water! And dates (forage DC -4).", "Everything in the desert comes here to drink.", { forage: -4, danger: 1.3 }],
  ],
  arctic: [
    ["Snow cave", "A shelter dug into a deep drift.", "sh", "Surprisingly warm once sealed.", "Digging it out takes the evening (no fire inside).", { danger: 0.8 }],
    ["Ice-locked wreck", "A ship frozen fast in the ice, tilted at an angle.", "s", "A real roof and timber to burn.", "The ice groans all night.", { scavenge: true }],
  ],
  coast: [
    ["Sea cave", "A cave above the tide line, smelling of salt.", "s", "Sheltered, with shellfish on the rocks (forage DC -2).", "The tide comes higher than you think.", { forage: -2 }],
    ["Dune hollow", "A dip between dunes, out of the sea wind.", "h", "Hidden from the beach.", null, { danger: 0.85 }],
  ],
  road: [
    ["Wayside shrine", "A roadside shrine with a bench and a covered well.", "sw", "Water, and travelers are generally decent here.", null, { danger: 0.9 }],
    ["Milestone camp", "A well-used spot by a milestone, stones blackened by a hundred fires.", "w", "A stream and an old fire pit.", "Anyone on the road knows this spot.", { danger: 1.15 }],
  ],
  grassland: [
    ["Standing stones", "A ring of old stones on a gentle rise.", "", "Shelter from the wind between the stones.", "The stones hum on certain nights.", { scavenge: true }],
    ["Lone tree by a pond", "A single wide tree beside a reedy pond.", "w", "Water and shade.", null, {}],
  ],
};

export interface SiteOptions {
  terrain?: Terrain;
  count?: number;
  seed?: string | number;
}

/** A few spots to choose from, from the terrain's own list and the general one. */
export function campSites(o: SiteOptions = {}): CampSite[] {
  const rng = createRng(o.seed);
  const own = SITES[o.terrain ?? "road"] ?? [];
  const pool = [...rng.shuffle(own).slice(0, 2), ...rng.shuffle(SITES.any)];
  return pool.slice(0, o.count ?? 3).map(([name, text, flags, perk, risk, mods]) => ({
    name, text, shelter: flags.includes("s"), water: flags.includes("w"), hidden: flags.includes("h"), perk, risk: risk ?? undefined, mods,
  }));
}

// --- The evening's jobs --------------------------------------------------------------------

export type ActivityId = "cook" | "forage" | "hunt" | "tend" | "mend" | "perimeter" | "scout" | "pray" | "perform" | "scavenge" | "study" | "rest";

export interface CampActivity {
  id: ActivityId;
  label: string;
  /** Font Awesome icon name. */
  icon: string;
  blurb: string;
  /** The roll, before the site and weather adjust its DC. */
  roll?: RollSpec;
  /** Needs someone to help (tend wounds, perform). */
  target?: boolean;
  /** Puts the evening's two hours into a downtime project. */
  project?: boolean;
  /** Only at sites with something to scavenge. */
  scavenge?: boolean;
  /** Only makes sense with a fire. */
  fire?: boolean;
}

export const CAMP_ACTIVITIES: Record<ActivityId, CampActivity> = {
  cook: { id: "cook", label: "Cook a hot meal", icon: "fa-bowl-food", blurb: "A good meal puts heart into everyone: temporary hit points for the whole camp.", roll: { type: "skill", key: "sur", dc: 10 }, fire: true },
  forage: { id: "forage", label: "Forage", icon: "fa-seedling", blurb: "Berries, roots, clean water and herbs for brewing.", roll: { type: "skill", key: "sur", dc: 12 } },
  hunt: { id: "hunt", label: "Hunt", icon: "fa-crosshairs", blurb: "Meat for the pot (and to smoke for later), maybe a hide.", roll: { type: "skill", key: "sur", dc: 14 } },
  tend: { id: "tend", label: "Tend wounds", icon: "fa-kit-medical", blurb: "Clean and bind someone's injuries: they recover an extra Hit Die.", roll: { type: "skill", key: "med", dc: 12 }, target: true },
  mend: { id: "mend", label: "Mend gear", icon: "fa-screwdriver-wrench", blurb: "Sharpen blades, patch armor, restring bows.", roll: { type: "check", key: "int", dc: 12 } },
  perimeter: { id: "perimeter", label: "Set alarms", icon: "fa-bell", blurb: "Tripwires and tin cans around the camp: the watch has advantage, and nothing surprises the camp.", roll: { type: "skill", key: "sur", dc: 12 } },
  scout: { id: "scout", label: "Scout the area", icon: "fa-binoculars", blurb: "Walk the surroundings before dark: fewer nasty surprises, and a hint of what's out there.", roll: { type: "skill", key: "prc", dc: 13 } },
  pray: { id: "pray", label: "Pray or meditate", icon: "fa-hands-praying", blurb: "Quiet devotion: advantage on the first saving throw tomorrow.", roll: { type: "skill", key: "rel", dc: 12 } },
  perform: { id: "perform", label: "Stories and songs", icon: "fa-guitar", blurb: "Lift someone's spirits around the fire: they wake inspired.", roll: { type: "skill", key: "prf", dc: 12 }, target: true, fire: true },
  scavenge: { id: "scavenge", label: "Search the site", icon: "fa-magnifying-glass", blurb: "There's something left behind here worth finding.", roll: { type: "skill", key: "inv", dc: 13 }, scavenge: true },
  study: { id: "study", label: "Work on a project", icon: "fa-book-open", blurb: "Two hours on a book, training or crafting project.", project: true },
  rest: { id: "rest", label: "Turn in early", icon: "fa-bed", blurb: "Sleep long and deep: an extra Hit Die back.", },
};

export interface CampContext {
  terrain: Terrain;
  weather: Weather;
  site?: CampSite | null;
  fire: boolean;
}

const harsh = (w: Weather) => /rain|storm|snow|cold|wind/i.test(w.text);

/** The DC for a job here and now: the site, the weather and the lack of a fire all matter. */
export function activityDc(id: ActivityId, ctx: CampContext): number | null {
  const a = CAMP_ACTIVITIES[id];
  if (!a.roll) return null;
  let dc = a.roll.dc;
  if (id === "forage") dc = TERRAINS[ctx.terrain].forageDc + (ctx.site?.mods.forage ?? 0);
  if (id === "hunt") dc = TERRAINS[ctx.terrain].forageDc + 2 + (ctx.site?.mods.forage ?? 0);
  if ((id === "cook" || id === "mend") && harsh(ctx.weather) && !ctx.site?.shelter) dc += 2;
  if (id === "cook" && !ctx.fire) dc += 5;
  if (id === "scout" && /fog|storm|snow/i.test(ctx.weather.text)) dc += 3;
  return Math.max(5, dc);
}

/** Whether a job can be picked here. */
export const activityAvailable = (id: ActivityId, ctx: CampContext) => {
  const a = CAMP_ACTIVITIES[id];
  return (!a.scavenge || !!ctx.site?.mods.scavenge) && (!a.fire || ctx.fire);
};

export type BoonKind = "tempHp" | "inspiration" | "hitDie" | "rations" | "material" | "note" | "exhaustion" | "loot";

export interface Boon {
  kind: BoonKind;
  /** "all" or an actor id. */
  to: string;
  amount?: number;
  text: string;
  item?: { name: string; quantity: number; valueGp: number; material?: MaterialTag };
}

export interface ActivityResult {
  total: number;
  dc: number;
  success: boolean;
  text: string;
  boons: Boon[];
}

export interface Camper {
  actorId: string;
  name: string;
  img: string;
  level: number;
  job?: ActivityId;
  /** Who they're helping (tend, perform). */
  target?: string;
  /** Project the evening goes into (study job). */
  projectId?: string;
  result?: ActivityResult;
  /** Which watch they stand (index). */
  watch: number;
}

/** What a job came to, given the roll. */
export function resolveActivity(id: ActivityId, total: number, c: Pick<Camper, "actorId" | "name" | "level" | "target">, ctx: CampContext & { trackFood: boolean; targetName?: string; seed?: string | number }): ActivityResult {
  const rng = createRng(ctx.seed ?? `${id}:${total}`);
  const dc = activityDc(id, ctx) ?? 0;
  const success = !CAMP_ACTIVITIES[id].roll || total >= dc;
  const great = total >= dc + 5;
  const who = ctx.targetName ?? "a companion";
  const res = (text: string, boons: Boon[] = []): ActivityResult => ({ total, dc, success, text, boons });
  const tempHp = Math.max(2, Math.ceil(c.level / 2) + 2) * (great ? 2 : 1);
  switch (id) {
    case "cook":
      if (!success) return res(total <= dc - 5 ? "Burnt, gritty and grim. Someone's stomach will regret it (DC 10 Constitution save or poisoned until midday)." : "Edible. Barely. Nobody complains out loud.");
      return res(great ? "A feast! Everyone goes to sleep warm and happy." : "A hot, filling stew.", [{ kind: "tempHp", to: "all", amount: tempHp, text: `${tempHp} temporary hit points from ${c.name}'s cooking` }]);
    case "forage": {
      if (!success) return res("Slim pickings: a handful of sour berries.");
      const food = rng.int(1, 6) + Math.floor((total - dc) / 2);
      const herbs = rng.int(1, great ? 4 : 2);
      const boons: Boon[] = [{ kind: "material", to: c.actorId, text: `${herbs} bundle${herbs > 1 ? "s" : ""} of wild herbs`, item: { name: "Wild herbs", quantity: herbs, valueGp: 1, material: "herbs" } }];
      if (ctx.trackFood) boons.unshift({ kind: "rations", to: c.actorId, amount: food, text: `${food} days of food and water` });
      return res(`Found ${ctx.trackFood ? `${food} days' worth of food and ` : ""}${herbs} bundle${herbs > 1 ? "s" : ""} of useful herbs.`, boons);
    }
    case "hunt": {
      if (!success) return res(total <= dc - 5 ? "Nothing, and something big was hunting too: the night is a little more dangerous." : "Hours of waiting, nothing to show for it.");
      const meat = rng.int(2, 4) + (great ? 2 : 0);
      const boons: Boon[] = [{ kind: "material", to: c.actorId, text: `${meat} portions of meat`, item: { name: "Fresh meat", quantity: meat, valueGp: 0.5, material: "meat" } }];
      if (great) boons.push({ kind: "material", to: c.actorId, text: "a good hide", item: { name: "Deer hide", quantity: 1, valueGp: 2, material: "hide" } });
      if (ctx.trackFood) boons.unshift({ kind: "rations", to: c.actorId, amount: meat, text: `${meat} days of food` });
      return res(great ? "A clean kill: plenty of meat and a hide worth keeping." : "A brace of rabbits and a plump bird.", boons);
    }
    case "tend": {
      if (!success) return res(`${who}'s wounds are cleaned, but it doesn't help much.`);
      const dice = great ? 2 : 1;
      return res(`${who}'s wounds are properly treated${great ? ", and a lingering ailment eases" : ""}.`, [
        { kind: "hitDie", to: c.target ?? "all", amount: dice, text: `${dice} extra Hit ${dice > 1 ? "Dice" : "Die"} back (tended by ${c.name})` },
        ...(great ? [{ kind: "note" as const, to: c.target ?? "all", text: "One disease or the poisoned condition ends." }] : []),
      ]);
    }
    case "mend":
      if (!success) return res("Patched, but it'll need doing again.");
      return res(great ? "Everyone's kit is in top shape." : "Two companions' gear is sharpened and patched.", [
        { kind: "note", to: great ? "all" : c.actorId, text: `Well-kept gear: +1 to the first attack roll tomorrow (${great ? "everyone" : "the mender and one friend"})` },
      ]);
    case "perimeter":
      if (!success) return res("A few cans on a string. Better than nothing, maybe.");
      return res("The camp is ringed with tripwires and tin cans.", [{ kind: "note", to: "all", text: "Alarms set: the watch has advantage on Perception, and the camp can't be surprised." }]);
    case "scout":
      if (!success) return res("A walk in the dusk, nothing learned.");
      return res(great ? "The area is clear, and they know exactly where trouble would come from." : "They find the lay of the land, and some tracks worth knowing about.", [{ kind: "note", to: "all", text: "Scouted: less chance of trouble tonight, and the GM shares what's out there." }]);
    case "pray":
      if (!success) return res("The quiet doesn't come tonight.");
      return res(great ? "A deep peace settles over the whole camp." : "A calm, clear mind.", [{ kind: "note", to: great ? "all" : c.actorId, text: "Blessed rest: advantage on the first saving throw tomorrow." }]);
    case "perform":
      if (!success) return res("The story falls flat; someone yawns pointedly.");
      return res(`${great ? "The whole camp is roaring with laughter" : `${who} laughs until they cry`}.`, [{ kind: "inspiration", to: great ? "all" : (c.target ?? "all"), text: `Inspired by ${c.name}'s ${rng.pick(["tale", "song", "jokes", "ballad"])}` }]);
    case "scavenge":
      if (!success) return res("Rubbish, rot and rat droppings.");
      return res(great ? "A real find, tucked away where nobody looked." : "A few things worth taking.", [{ kind: "loot", to: c.actorId, amount: great ? 2 : 1, text: great ? "a stash worth having" : "a few odds and ends" }]);
    case "study":
      return res("Two quiet hours of work by the firelight.");
    case "rest":
      return res("Sleeps like a stone.", [{ kind: "hitDie", to: c.actorId, amount: 1, text: "1 extra Hit Die back (deep sleep)" }]);
  }
}

// --- The night ---------------------------------------------------------------------------

export type NightEventKind = "encounter" | "visitor" | "thief" | "weather" | "omen" | "alarm";

export interface NightEvent {
  id: string;
  watch: number;
  kind: NightEventKind;
  /** What the watch sees or hears. */
  text: string;
  /** A hint the scouts would have picked up. */
  hint: string;
  /** The watch's roll to notice in time. */
  check?: RollSpec;
  onSuccess: string;
  onFailure: string;
  encounter?: { tags: string; difficulty: Difficulty; seed: string; map: BattlemapSetting };
  /** Weather events: a Constitution save for anyone without shelter. */
  save?: RollSpec;
}

export interface Night {
  watches: { label: string; flavor: string }[];
  events: NightEvent[];
}

const FLAVOR = [
  "The fire pops and settles.", "An owl calls, and another answers far away.", "Stars wheel slowly overhead.", "Wind moves through the grass like a sigh.",
  "Somewhere, water drips steadily.", "A fox barks twice in the distance.", "The cold creeps in at the edges of the blankets.", "Someone mutters in their sleep.",
  "Moonlight silvers everything for a moment, then clouds swallow it.", "Insects sing, then all go quiet at once, then start again.", "A falling star.", "Embers glow red in the dark.",
];

const VISITORS = [
  ["A lone traveler with a lantern asks to share the fire", "They're harmless, with news from the road ahead.", "They're gone at dawn, and so is someone's coin purse (1d10 gp)."],
  ["A wounded messenger staggers into the firelight", "They have a sealed letter and are being followed.", "They collapse by the fire. Their pursuers arrive an hour later."],
  ["A child appears at the edge of the light and says nothing", "It's a fey creature, curious and harmless if treated kindly; it leaves a gift (a silver acorn).", "It plays tricks all night: knots in bootlaces, salt in the water."],
  ["A hunched peddler with a creaking cart", "They'll trade: a few potions and oddities at fair prices.", "They try to sell the party something cursed."],
  ["A ghostly figure walks past the camp without seeing it", "Following it leads to an old grave and a forgotten name (a side quest hook).", "It turns and looks straight at the sleepers. Everyone has bad dreams."],
] as const;
const THIEVES = [
  ["Something rustles in the packs", "A raccoon, caught in the act and chased off.", "By morning, a day of food is gone (or a small item, if no one counts food)."],
  ["A small shape slips toward the horses", "A goblin scout, caught and maybe questioned.", "One mount is missing, or a pack has been slit open."],
  ["Faint footsteps circle the camp", "A scavenger, scared off by a shout.", "A random small item is missing in the morning."],
] as const;
const OMENS: [string, string][] = [
  ["Distant lights bob on the horizon, then vanish", "The lights mark an old battlefield where something waits."],
  ["Everyone dreams the same dream of a burning tower", "The tower is real, and two days' walk away."],
  ["A howl that sounds almost like a word", "Something is hunting in these hills, and it can talk."],
  ["The fire burns green for a moment", "A ley line runs under the camp; spells feel a little stronger here."],
  ["A raven lands on the watch's knee, stares, and flies off", "Someone is watching the party through that raven."],
];
const WEATHER_TURN = [
  ["A sudden downpour", "Rain hammers down for hours."],
  ["A bitter frost", "The temperature plunges after midnight."],
  ["Howling wind", "The wind tears at the tents and scatters the fire."],
] as const;

const DIFFS: Difficulty[] = ["low", "moderate", "high", "deadly"];

export interface NightOptions {
  terrain: Terrain;
  weather: Weather;
  partyLevel: number;
  watches: number;
  site?: CampSite | null;
  fire: boolean;
  scouted?: boolean;
  alarms?: boolean;
  /** Extra danger from a botched hunt. */
  stirred?: boolean;
  frequency?: "rare" | "normal" | "frequent";
  foes?: string;
  seed?: string | number;
}

/** Watch names for 2-4 watches through the night. */
export function watchLabels(n: number): string[] {
  if (n <= 2) return ["First watch (dusk to midnight)", "Second watch (midnight to dawn)"];
  if (n === 3) return ["First watch (dusk to 11)", "Middle watch (11 to 3)", "Dawn watch (3 to dawn)"];
  return ["First watch (dusk to 10)", "Second watch (10 to 1)", "Third watch (1 to 4)", "Dawn watch (4 to dawn)"];
}

/** Watches for a party: two for two or fewer, up to four. */
export const watchCount = (campers: number) => Math.max(2, Math.min(4, campers));

/** What happens tonight, and when. */
export function planNight(o: NightOptions): Night {
  const rng = createRng(o.seed);
  const n = Math.max(2, Math.min(4, o.watches));
  const watches = watchLabels(n).map((label) => ({ label, flavor: rng.pick(FLAVOR) }));
  const t = TERRAINS[o.terrain];
  const freq = { rare: 0.6, normal: 1, frequent: 1.5 }[o.frequency ?? "normal"];
  let danger = t.danger * freq * (o.site?.mods.danger ?? 1) * (o.site?.hidden ? 0.75 : 1) * (o.fire ? 1.2 : 1) * (o.scouted ? 0.6 : 1) * (o.stirred ? 1.3 : 1);
  danger = Math.min(0.85, danger);
  const events: NightEvent[] = [];
  const perception = (dc: number): RollSpec => ({ type: "skill", key: "prc", dc: Math.max(8, dc - (o.site?.mods.perception ?? 0)) });
  const id = () => rng.int(0, 36 ** 6).toString(36);
  if (rng.chance(danger)) {
    const difficulty = DIFFS[rng.weighted([[0, 3], [1, 4], [2, 2]] as const)]!;
    events.push({
      id: id(), watch: rng.int(0, n - 1), kind: "encounter",
      text: rng.pick(["Shapes move at the edge of the firelight", "A twig snaps, close by, then another", "The horses stamp and pull at their tethers", "Eyes catch the light, low in the brush"]) + ".",
      hint: "Fresh tracks circle the camp: something is out there, and it's been watching.",
      check: perception(12 + Math.floor(o.partyLevel / 4) + (o.alarms ? -5 : 0)),
      onSuccess: "The watch raises the alarm in time: everyone is awake and armed when they come.",
      onFailure: o.alarms ? "The alarms go off just in time, so the camp isn't surprised, but sleepers wake without their armor." : "They're in the camp before anyone shouts. Sleepers wake surprised and without their armor.",
      encounter: { tags: o.foes?.trim() || t.tags, difficulty, seed: id(), map: t.map === "road" ? "clearing" : t.map },
    });
  }
  // Something else, maybe: a visitor, a thief, an omen or a turn in the weather.
  if (rng.chance(0.55)) {
    const kind = rng.weighted([["visitor", 3], ["thief", 2], ["omen", 2], ["weather", o.site?.shelter ? 0 : 2], ["alarm", 2]] as const);
    const watch = rng.int(0, n - 1);
    if (kind === "visitor") {
      const [text, good, bad] = rng.pick(VISITORS);
      events.push({ id: id(), watch, kind, text: `${text}.`, hint: "Someone else is travelling the same way, a few hours behind.", check: { type: "skill", key: "ins", dc: 13 }, onSuccess: good, onFailure: bad });
    } else if (kind === "thief") {
      const [text, good, bad] = rng.pick(THIEVES);
      events.push({ id: id(), watch, kind, text: `${text}.`, hint: "Little paw prints and scattered crumbs: something has raided camps here before.", check: perception(13), onSuccess: good, onFailure: bad });
    } else if (kind === "omen") {
      const [text, meaning] = rng.pick(OMENS);
      events.push({ id: id(), watch, kind, text: `${text}.`, hint: "The locals say strange things are seen around here at night.", check: { type: "skill", key: "arc", dc: 13 }, onSuccess: `They understand it: ${meaning}`, onFailure: "Nobody can make sense of it. It lingers in their thoughts." });
    } else if (kind === "weather") {
      const [text, detail] = rng.pick(WEATHER_TURN);
      events.push({
        id: id(), watch, kind, text: `${text}. ${detail}`, hint: "The sky is turning; a change in the weather is coming tonight.",
        save: { type: "save", key: "con", dc: 12 }, onSuccess: "They weather it.",
        onFailure: "A miserable night: no Hit Dice back from this rest (or a level of exhaustion in freezing cold).",
      });
    } else {
      events.push({ id: id(), watch, kind: "alarm", text: "A crash in the dark, then silence.", hint: "Deer have been coming down to drink at night.", check: perception(11), onSuccess: "Just a deer. Everyone settles back down.", onFailure: "The whole camp jumps up, weapons out, at a deer. Nobody sleeps well after that." });
    }
  }
  events.sort((a, b) => a.watch - b.watch);
  return { watches, events };
}

// --- Morning -----------------------------------------------------------------------------

export interface RestAdvice {
  rest: "full" | "partial";
  /** Things the GM might want to roll or rule on. */
  warnings: string[];
}

/** Was it a good night? The weather, the shelter, the fire, and what happened all count. */
export function restAdvice(o: { weather: Weather; site?: CampSite | null; fire: boolean; foughtAtNight?: boolean; badWeatherNight?: boolean }): RestAdvice {
  const warnings: string[] = [];
  const cold = /cold|snow|frost/i.test(o.weather.text);
  if ((harsh(o.weather) || o.badWeatherNight) && !o.site?.shelter) warnings.push("No shelter from the weather: each camper makes a DC 12 Constitution save or regains no Hit Dice.");
  if (cold && !o.fire) warnings.push("A cold night without a fire: each camper makes a DC 10 Constitution save or gains a level of exhaustion.");
  if (o.foughtAtNight) warnings.push("The night was interrupted by a fight. If it lasted long, call it a short rest instead.");
  return { rest: o.foughtAtNight ? "partial" : "full", warnings };
}

/** Everyone eats and drinks: rations needed tonight (water is free beside a stream). */
export const rationsNeeded = (campers: number, site?: CampSite | null) => ({ food: campers, water: site?.water ? 0 : campers });

// --- The whole camp ------------------------------------------------------------------------

export interface CampState {
  id: string;
  seed: string;
  day: number;
  phase: CampPhase;
  terrain: Terrain;
  climate: Climate;
  season: Season;
  weather: Weather;
  trackFood: boolean;
  fire: boolean;
  frequency: "rare" | "normal" | "frequent";
  partyLevel: number;
  foes?: string;
  sites: CampSite[];
  /** actorId → site index. */
  votes: Record<string, number>;
  site: number | null;
  campers: Camper[];
  night: Night | null;
  /** How many watches the GM has played out. */
  revealed: number;
  /** eventId → what happened. */
  outcomes: Record<string, { text: string; passed: boolean | null; rolls: { name: string; total: number }[] }>;
}

export interface NewCampOptions {
  terrain?: Terrain;
  climate?: Climate;
  season?: Season;
  weather?: Weather;
  trackFood?: boolean;
  frequency?: "rare" | "normal" | "frequent";
  partyLevel?: number;
  foes?: string;
  day?: number;
  campers: Omit<Camper, "watch">[];
  seed?: string | number;
}

export function newCamp(o: NewCampOptions): CampState {
  const rng = createRng(o.seed);
  const terrain = o.terrain ?? "forest";
  const climate = o.climate ?? "temperate";
  const season = o.season ?? "summer";
  const n = watchCount(o.campers.length);
  return {
    id: rng.int(0, 36 ** 8).toString(36), seed: rng.seed, day: o.day ?? 1, phase: "site", terrain, climate, season,
    weather: o.weather ?? rollWeather(climate, season, `${rng.seed}:weather`), trackFood: !!o.trackFood, fire: true, frequency: o.frequency ?? "normal",
    partyLevel: o.partyLevel ?? 3, foes: o.foes, sites: campSites({ terrain, seed: `${rng.seed}:sites` }), votes: {}, site: null,
    campers: o.campers.map((c, i) => ({ ...c, watch: i % n })), night: null, revealed: 0, outcomes: {},
  };
}

export const campContext = (s: CampState): CampContext => ({ terrain: s.terrain, weather: s.weather, site: s.site === null ? null : s.sites[s.site], fire: s.fire });

/** The most-voted site (ties go to the first). */
export function leadingSite(s: CampState): number {
  const tally = s.sites.map((_, i) => Object.values(s.votes).filter((v) => v === i).length);
  return tally.indexOf(Math.max(...tally));
}

/** Plan the night from how the evening went. */
export function startNight(s: CampState, seed: string | number = `${s.seed}:night`): CampState {
  const did = (id: ActivityId, ok = true) => s.campers.some((c) => c.job === id && (!ok || c.result?.success));
  const night = planNight({
    terrain: s.terrain, weather: s.weather, partyLevel: s.partyLevel, watches: watchCount(s.campers.length), site: campContext(s).site, fire: s.fire,
    scouted: did("scout"), alarms: did("perimeter"), stirred: s.campers.some((c) => c.job === "hunt" && c.result && c.result.total <= c.result.dc - 5),
    frequency: s.frequency, foes: s.foes, seed,
  });
  // Keep watch assignments inside the night's watches.
  return { ...s, phase: "night", night, revealed: 0, campers: s.campers.map((c) => ({ ...c, watch: Math.min(c.watch, night.watches.length - 1) })) };
}

/** Every boon from the evening's jobs, for the morning. */
export const campBoons = (s: CampState): Boon[] => s.campers.flatMap((c) => c.result?.boons ?? []);

/** Boons that land on one camper ("all" ones included). */
export const boonsFor = (s: CampState, actorId: string) => campBoons(s).filter((b) => b.to === "all" || b.to === actorId);

/** Who's on a watch. */
export const onWatch = (s: CampState, watch: number) => s.campers.filter((c) => c.watch === watch);

/** Random small finds for the "search the site" job. */
export function scavengeFind(rng: Rng, level: number): { name: string; valueGp: number }[] {
  const finds = [
    ["A rusted but serviceable lantern", 3], ["A purse with a few old coins", 5 + level], ["A sealed bottle of decent wine", 10], ["A whetstone and a good knife", 4],
    ["A bundle of arrows, still straight", 1], ["A battered holy symbol", 5], ["A map fragment of the area", 2], ["A tinderbox and dry kindling", 1],
    ["A small silver ring", 10 + level * 2], ["A potion bottle with something still in it", 25],
  ] as const;
  return rng.shuffle([...finds]).slice(0, rng.int(1, 2)).map(([name, valueGp]) => ({ name, valueGp }));
}
