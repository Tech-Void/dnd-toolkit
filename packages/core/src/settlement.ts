import { createRng, type Rng } from "./rng.ts";
import { generateBattlemap, type Battlemap, type TownBuilding, type TownSize } from "./battlemap.ts";
import { generateShop, type Settlement, type Shop, type ShopItemRef, type ShopType } from "./shops.ts";
import { generateNpc, type Npc, type NpcRole } from "./npc.ts";
import { generateHook } from "./hooks.ts";
import { QUEST_ARCHETYPES } from "./sidequest.ts";

// ---------------------------------------------------------------------------
// Settlements: a place to arrive in. Who runs it, where to drink, buy and pray, who's scheming,
// what's wrong, and a map with every building where it should be.

export interface Inn {
  name: string;
  keeper: Npc;
  specialty: string;
  /** Per night, in gp. */
  roomGp: number;
  feature: string;
}

export interface Temple {
  deity: string;
  domain: string;
  priest: Npc;
  feature: string;
}

export interface Faction {
  name: string;
  goal: string;
  leader: Npc;
}

export interface Place {
  buildingId: number;
  kind: TownBuilding["kind"];
  label: string;
  /** Index into `shops` for shop buildings. */
  shop?: number;
}

export interface Town {
  seed: string;
  name: string;
  size: Settlement;
  population: number;
  description: string[];
  government: string;
  leader: Npc;
  notables: Npc[];
  inn: Inn;
  temple: Temple;
  shops: Shop[];
  factions: Faction[];
  /** What's wrong here, and the side quest type it suggests. */
  trouble: { text: string; archetype: string };
  rumors: string[];
  map: Battlemap;
  places: Place[];
}

export interface TownOptions {
  size?: Settlement;
  name?: string;
  partyLevel?: number;
  /** Shop stock to pick from (your compendium items); built-in if left out. */
  shopItems?: readonly ShopItemRef[];
  night?: boolean;
  seed?: string | number;
}

const PREFIX = ["Oak", "Mill", "Raven", "Stone", "Ash", "Bright", "Cold", "Elder", "Fox", "Green", "High", "Iron", "Kings", "Marsh", "North", "Red", "Salt", "Thorn", "West", "Wolf", "Amber", "Barrow", "Copper", "Dun", "Hollow", "Lantern", "Moss", "Pike", "Silver", "Tall",
  "Ember",
  "Fallow",
  "Glen",
  "Hearth",
  "Lark",
  "Merrow",
  "Oaken",
  "Rook",
  "Sable",
  "Swan",
  "Under",
  "Winter",
  "Yarrow",
  "Bram",
  "Cinder",
  "Heron",
];
const SUFFIX = ["ford", "bridge", "haven", "wick", "stead", "ton", "dale", "moor", "field", "hollow", "brook", "gate", "cross", "mere", "bury", "well", "watch", "fall", "hithe", "ham",
  "shire",
  "holt",
  "stow",
  "combe",
  "thorpe",
  "barrow",
  "cliff",
  "marsh",
  "reach",
  "hold",
  "wood",
  "keep",
];

const LOOKS = [
  "thatched roofs and muddy lanes", "whitewashed walls and red tile roofs", "tall, narrow timber houses leaning over the streets",
  "grey stone cottages with moss on every roof", "a jumble of old and new, built over the ruins of something older",
  "neat gardens and painted shutters", "soot-blackened brick and the smell of the smithies", "houses on stilts above the marshy ground",
  "red brick and copper gutters gone green",
  "round stone houses with turf roofs",
  "a walled old town and a sprawl of new shacks outside it",
  "canals instead of streets in the lower quarter",
  "every door painted a different bright color",
];
const KNOWN_FOR = [
  "a sharp blue cheese that travelers swear by", "the best wool in the region", "a famous duel fought in the square a century ago",
  "a bell that rings by itself on midsummer night", "a two-headed calf the locals call lucky", "a fiercely contested annual pie contest",
  "its cider, and the fights that follow it", "a statue of a hero no one can quite name", "the river that freezes in summer once a decade",
  "a long feud with the next town over", "the oldest tree in the kingdom, growing through the town hall", "a mage who retired here and never leaves the house",
  "a pickled herring nobody else can stomach",
  "the annual frog race",
  "its haunted bridge",
  "a family of famous glassblowers",
  "the coldest beer for a hundred miles",
  "a public library older than the kingdom",
];
const MOODS = [
  "Folk are friendly but nosy; strangers are news.", "Everyone is tense; something has them watching the treeline.",
  "The place is busy and loud; nobody looks twice at armed travelers.", "Quiet and suspicious; doors close as the party passes.",
  "A festival is a few days off and everyone is distracted.", "Times are hard; prices are high and tempers short.",
  "Everyone's polite, and nobody answers a straight question.",
  "The town is grieving; black ribbons hang from every door.",
  "There's a wedding today and the whole town is invited.",
];

const GOVERNMENT: Record<Settlement, [string, NpcRole][]> = {
  hamlet: [["an elder everyone listens to", "commoner"], ["the family that owns the land", "commoner"]],
  village: [["a reeve appointed by the lord", "guard"], ["an elected mayor", "merchant"], ["the village priest", "priest"]],
  town: [["a mayor and town council", "merchant"], ["a lord's appointed castellan", "noble"], ["the merchants' guild", "merchant"]],
  city: [["a ruling council of guilds", "merchant"], ["a hereditary lord", "noble"], ["a lord-mayor elected by the wealthy", "noble"]],
  metropolis: [["a royal governor", "noble"], ["an oligarchy of merchant houses", "merchant"], ["a council of mages", "mage"]],
};

const INN_ADJ = ["Prancing", "Rusty", "Sleeping", "Gilded", "Drowned", "Wandering", "Laughing", "Crooked", "Golden", "Jolly", "Dancing", "Three-Legged",
  "Hungry",
  "Silver",
  "Wise",
  "Weary",
  "One-Eyed",
  "Painted",
  "Howling",
  "Lucky",
];
const INN_NOUN = ["Stag", "Tankard", "Giant", "Goose", "Rat", "Wyvern", "Lantern", "Pony", "Kettle", "Boar", "Mermaid", "Badger",
  "Owl",
  "Griffon",
  "Ferret",
  "Anchor",
  "Crown",
  "Harp",
  "Hound",
  "Sow",
];
const SPECIALTIES = ["mutton stew thick enough to stand a spoon in", "honeyed ale", "fried river eels", "a pie whose filling changes daily and is never explained", "black bread and sharp cheese", "spiced wine served hot", "a dwarven stout that knocks out the unwary",
  "roast chicken stuffed with sage",
  "a pie of eel, apple and secrets",
  "mead so sweet it's nearly syrup",
  "goat stew and a dare to finish it",
  "fresh trout and plum brandy",
];
const INN_FEATURES = ["a bard who only knows one song, played well", "a stuffed owlbear by the fire", "a wall of carved names of every adventurer who stayed", "a back room where cards are played for high stakes", "a ghost that tidies up after closing", "a parrot that insults guests in three languages", "a notice board covered in jobs and lost cats",
  "a fortune-teller in the corner booth",
  "a resident dog that only obeys elvish",
  "an arm-wrestling table with a champion who's never lost",
  "rooms named after famous battles",
  "a well in the middle of the common room",
];

const DEITIES: [string, string][] = [
  ["Solenne of the Dawn", "light and new beginnings"], ["Old Marrow", "death and the dignity of graves"], ["the Harvest Mother", "fields and family"],
  ["Brannoch the Smith", "the forge and honest work"], ["the Tide Queen", "the sea and safe passage"], ["Veyra the Watcher", "justice and oaths"],
  ["the Laughing Fool", "luck and travelers"], ["Ashka of the Wilds", "the hunt and the woods"],
];
const TEMPLE_FEATURES = ["offers healing for a donation", "keeps a library open to anyone who asks", "rings a bell for every death in town", "is half-built, waiting on funds", "has a relic in a locked case that draws pilgrims", "runs an orphanage out the back",
  "is run by a single, very tired priest",
  "hosts a famous choir",
  "is guarded by an ancient, polite golem",
  "sells blessings by the copper",
  "has a crypt that's off-limits to everyone",
];

const FACTIONS: [name: string, goal: string, role: NpcRole][] = [
  ["the Millers' Guild", "get the river toll lifted, by any means", "merchant"],
  ["the Night Lanterns", "crack the old vault under the counting house", "criminal"],
  ["the town watch", "keep order, and keep their bribes coming", "guard"],
  ["the Merchants' League", "push out the competition from the next town", "merchant"],
  ["a circle of hedge witches", "protect the old grove from the woodcutters", "mage"],
  ["the old families", "put one of their own in charge", "noble"],
  ["a temperance league", "close every tavern in town", "priest"],
  ["the dockworkers' brotherhood", "win better pay before the harvest ships arrive", "commoner"],
];

const TROUBLES: Record<string, string[]> = {
  bandits: ["Bandits have been raiding the roads into {town}; the last caravan never arrived."],
  dragon: ["Livestock keeps vanishing from the hills above {town}, and something large was seen against the moon."],
  undead: ["Graves in {town}'s cemetery have been found open, from the inside."],
  cult: ["Strangers in grey have been seen at the old chapel near {town} at midnight."],
  beast: ["Something has been killing {town}'s sheep, and last night a shepherd."],
  goblins: ["Goblins have been stealing tools and children's toys from {town}'s outlying farms."],
  lycan: ["A wolf was killed near {town}, and in the morning it was a man."],
  smugglers: ["Lights on the water near {town} at night, and the harbor master isn't asking questions."],
  fey: ["Since midsummer, {town}'s children have been singing a song nobody taught them."],
  haunt: ["No one will go near the old manor outside {town} since the lights came back on."],
};

const SHOPS_BY_SIZE: Record<Settlement, [number, number]> = { hamlet: [1, 1], village: [2, 3], town: [4, 5], city: [5, 7], metropolis: [6, 8] };
const SHOP_ORDER: ShopType[] = ["general", "blacksmith", "alchemist", "weaponsmith", "armorer", "fletcher", "jeweler", "magic"];
const POPULATION: Record<Settlement, [number, number]> = { hamlet: [20, 80], village: [100, 900], town: [1000, 5000], city: [6000, 25000], metropolis: [30000, 120000] };
const MAP_SIZE: Record<Settlement, TownSize> = { hamlet: "hamlet", village: "village", town: "town", city: "city", metropolis: "city" };

const roleNpc = (rng: Rng, role: NpcRole, extra = "") => generateNpc({ role, seed: `${rng.seed}:${role}:${extra}:${rng.int(0, 1e6)}` });

export function generateTown(opts: TownOptions = {}): Town {
  const rng = createRng(opts.seed);
  const size: Settlement = opts.size ?? rng.weighted([["hamlet", 1], ["village", 3], ["town", 3], ["city", 1]] as const);
  const name = opts.name?.trim() || `${rng.pick(PREFIX)}${rng.pick(SUFFIX)}`;
  const [minPop, maxPop] = POPULATION[size];
  const population = Math.round(rng.int(minPop, maxPop) / 10) * 10 || rng.int(minPop, maxPop);
  const [government, leaderRole] = rng.pick(GOVERNMENT[size]);
  const leader = roleNpc(rng, leaderRole, "leader");

  const inn: Inn = {
    name: `The ${rng.pick(INN_ADJ)} ${rng.pick(INN_NOUN)}`,
    keeper: roleNpc(rng, "innkeeper", "inn"),
    specialty: rng.pick(SPECIALTIES),
    roomGp: { hamlet: 0.2, village: 0.5, town: 0.8, city: 2, metropolis: 4 }[size],
    feature: rng.pick(INN_FEATURES),
  };
  const [deity, domain] = rng.pick(DEITIES);
  const temple: Temple = { deity, domain, priest: roleNpc(rng, "priest", "temple"), feature: rng.pick(TEMPLE_FEATURES) };

  const [minShops, maxShops] = SHOPS_BY_SIZE[size];
  const shopCount = rng.int(minShops, maxShops);
  // The basics first, then specialists the bigger places can support.
  const types = [...SHOP_ORDER.slice(0, 2), ...rng.shuffle(SHOP_ORDER.slice(2, size === "village" ? 4 : SHOP_ORDER.length))].slice(0, shopCount);
  const shops = types.map((type, i) => generateShop({ type, settlement: size, items: opts.shopItems, seed: `${rng.seed}:shop:${i}` }));

  const factions = rng.shuffle(FACTIONS).slice(0, size === "hamlet" ? 1 : size === "village" ? 2 : size === "town" ? 3 : 4)
    .map(([fname, goal, role]) => ({ name: fname, goal, leader: roleNpc(rng, role, fname) }));
  const notables = rng.shuffle(["guard", "scholar", "commoner", "criminal", "soldier", "mage"] as NpcRole[])
    .slice(0, size === "hamlet" ? 1 : size === "village" ? 2 : 4).map((role) => roleNpc(rng, role, "notable"));

  const archetype = rng.pick(QUEST_ARCHETYPES).id;
  const trouble = { text: rng.pick(TROUBLES[archetype] ?? ["Something is wrong in {town}, and nobody will say what."]).replace("{town}", name), archetype };
  const hooks = Array.from({ length: 3 }, (_, i) => generateHook({ seed: `${rng.seed}:rumor:${i}`, partyLevel: opts.partyLevel }));
  const rumors = [
    `Someone's looking for help to ${hooks[0]!.goal}, out at ${hooks[0]!.location}.`,
    `Word is ${factions[0]!.name} is trying to ${factions[0]!.goal}.`,
    `${capitalize(inn.keeper.name)} at ${inn.name} owes money to the wrong people.`,
    `They say ${hooks[1]!.villain} has been seen near ${hooks[1]!.location}.`,
    trouble.text,
    `${capitalize(temple.priest.name)} at the temple of ${deity} ${temple.priest.secret}.`,
  ].slice(0, size === "hamlet" ? 3 : 5);

  const map = generateBattlemap({ setting: "town", townSize: MAP_SIZE[size], night: opts.night, title: name, seed: `${rng.seed}:map` });
  // Biggest buildings for the temple and the inn, then the hall and shops; the rest are homes.
  const byArea = [...(map.buildings ?? [])].sort((a, b) => b.w * b.h - a.w * a.h);
  const places: Place[] = [];
  const claim = (kind: Place["kind"], label: string, shop?: number) => {
    const building = byArea.shift();
    if (!building) return;
    building.kind = kind;
    building.label = label;
    places.push({ buildingId: building.id, kind, label, shop });
  };
  claim("temple", `Temple of ${deity}`);
  claim("inn", inn.name);
  if (size !== "hamlet" && size !== "village") claim("hall", size === "town" ? "Town hall" : "Council hall");
  shops.forEach((shop, i) => claim("shop", shop.name, i));
  for (const b of byArea) b.label = "House";

  return {
    seed: rng.seed,
    name,
    size,
    population,
    description: [`${name} is a ${size} of about ${population.toLocaleString("en-US")} people: ${rng.pick(LOOKS)}.`, `It's known for ${rng.pick(KNOWN_FOR)}.`, rng.pick(MOODS)],
    government,
    leader,
    notables,
    inn,
    temple,
    shops,
    factions,
    trouble,
    rumors,
    map,
    places,
  };
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
