import { createRng, type Battlemap, type DungeonMap, type FurnitureKind, type Ground, type PropKind, type RoomKey, type Rng } from "@dnd-toolkit/core";
import { MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Forgotten Adventures art for the map painters. The manifest (built by
// scripts/build-fa-manifest.py) lists the files by slot; Foundry serves them from a folder linked
// into its Data directory. Each map picks one look per slot from its seed (one kind of tree, one
// wood tone, one roof), so it hangs together, and only the images it uses are loaded.

/** An image and its size in grid squares (props: footprint; textures: one tile). */
export interface ArtImage {
  img: HTMLImageElement;
  w: number;
  h: number;
  /** The variant code, e.g. "A1", which pairs trees with their shadows. */
  code?: string;
}

type Entry = [path: string, w: number, h: number];
interface Manifest {
  version: number;
  pxPerSquare: number;
  props: Record<string, Record<string, Entry[]>>;
  textures: Record<string, Record<string, Entry[]>>;
  /** Looping animations by slot. */
  effects?: Record<string, Record<string, Entry[]>>;
}

let manifest: Promise<Manifest | null> | null = null;
const images = new Map<string, Promise<HTMLImageElement | null>>();

/** Where the art lives, relative to Foundry's Data folder (module setting). Empty turns it off. */
export const faRoot = (): string => {
  try {
    return String(game.settings.get(MODULE_ID, "faRoot") ?? "").replace(/\/+$/, "");
  } catch {
    return "fa-assets";
  }
};

export function registerFaSettings() {
  game.settings.register(MODULE_ID, "faRoot", {
    name: "Forgotten Adventures art folder",
    hint: "Folder (inside Foundry's Data directory) holding FA_Assets_Webp, used to paint generated maps. Leave empty to use the built-in painted look.",
    scope: "world",
    config: true,
    type: String,
    default: "fa-assets",
    onChange: () => {
      manifest = null;
      images.clear();
    },
  });
}

export const faUrl = (path: string) => `${faRoot()}/${path}`.split("/").map(encodeURIComponent).join("/");

function loadImage(path: string): Promise<HTMLImageElement | null> {
  let p = images.get(path);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = faUrl(path);
    });
    images.set(path, p);
  }
  return p;
}

/** The manifest, if the art is installed and reachable (checked once). */
export function faManifest(): Promise<Manifest | null> {
  if (!faRoot()) return Promise.resolve(null);
  manifest ??= (async () => {
    try {
      const res = await fetch(`modules/${MODULE_ID}/fa-manifest.json`);
      if (!res.ok) return null;
      const m: Manifest = await res.json();
      // Make sure the folder is really there: load one small texture.
      const probe = Object.values(m.props.bush ?? {})[0]?.[0];
      if (!probe || !(await loadImage(probe[0]))) {
        console.warn(`${MODULE_ID} | Forgotten Adventures art not found under "${faRoot()}"; using the painted look.`);
        return null;
      }
      return m;
    } catch (err) {
      console.warn(`${MODULE_ID} | FA manifest`, err);
      return null;
    }
  })();
  return manifest;
}

const CODE = /_([A-Z]\d+)_\d+x\d+\.webp$/;

/** One map's palette: a family or two per slot, chosen by seed. */
export class FaKit {
  readonly #m: Manifest;
  readonly #rng: Rng;
  readonly #picked = new Map<string, Entry[]>();

  constructor(m: Manifest, seed: string) {
    this.#m = m;
    this.#rng = createRng(`${seed}:fa`);
  }

  /** Entries for a slot from `families` of its families (all of them when 0). */
  entries(slot: string, families = 1, texture = false): Entry[] {
    const key = `${texture ? "t" : "p"}:${slot}`;
    let got = this.#picked.get(key);
    if (!got) {
      const fams = Object.values((texture ? this.#m.textures : this.#m.props)[slot] ?? {});
      got = (families ? this.#rng.shuffle(fams).slice(0, families) : fams).flat();
      this.#picked.set(key, got);
    }
    return got;
  }

  async load(entries: Entry[], max = 24): Promise<ArtImage[]> {
    const chosen = entries.length > max ? this.#rng.shuffle(entries).slice(0, max) : entries;
    const loaded = await Promise.all(chosen.map(async ([path, w, h]) => {
      const img = await loadImage(path);
      return img ? { img, w, h, code: CODE.exec(path)?.[1] } : null;
    }));
    return loaded.filter(Boolean) as ArtImage[];
  }

  async texture(slot: string): Promise<ArtImage | null> {
    const [first] = await this.load(this.entries(slot, 1, true), 1);
    return first ?? null;
  }
}

/** Everything a battlemap needs painted, ready to draw. */
export interface MapArt {
  textures: Partial<Record<Ground, ArtImage>>;
  props: Partial<Record<PropKind, ArtImage[]>>;
  treeShadows: ArtImage[];
  /** Small scenery scattered on open ground (flowers, stones, rubble…), by ground type. */
  decor: Partial<Record<Ground, ArtImage[]>>;
  roofs: ArtImage[];
  walls: { timber?: ArtImage; stone?: ArtImage; door?: ArtImage[]; window?: ArtImage[] };
  /** Light fittings: wall torches (bracket on the right edge) and freestanding lamps. */
  lights: { wall: ArtImage[]; post: ArtImage[] };
}

/** Which FA slots each of our prop kinds draws from (several families for cluttered things). */
const PROP_SLOTS: Record<PropKind, [slot: string, families: number][]> = {
  tree: [["tree", 1]], bush: [["bush", 2]], boulder: [["boulder", 1]], log: [["log", 1]], stalagmite: [["stalagmite", 2]],
  mushrooms: [["mushrooms", 3]], rubble: [["rubble", 3]], pillar: [["pillar", 1]], altar: [["altar", 2]], table: [["table", 2]],
  chair: [["chair", 2]], barrel: [["barrel", 4]], crate: [["crate", 5]], counter: [["counter", 1]], shelf: [["shelf", 2], ["bookcase", 1]],
  bed: [["bed", 3]], chest: [["chest", 3]], hearth: [["hearth", 2]], rug: [["rug", 3]], stairs: [["stairs", 1]], campfire: [["campfire", 2]],
  tent: [["tent", 2]], cart: [["cart", 2]], well: [["well", 1]],
  tombstone: [["tombstone", 2]], grave: [["grave", 1]], statue: [["statue", 2]], pew: [["pew", 1]], boat: [["boat", 2]], crops: [["crops", 2]],
  hay: [["hay", 2]], fence: [["fence", 1]], mineCart: [["mineCart", 1]], support: [["support", 1]], deadTree: [["bareTree", 1]], reeds: [["reeds", 2]],
};

const OUTDOOR = new Set(["clearing", "road", "camp", "ruins", "town", "graveyard", "bridge", "farm", "docks"]);

/** Load the art for one battlemap (or null when FA isn't installed). */
export async function battlemapArt(m: Battlemap): Promise<MapArt | null> {
  const fa = await faManifest();
  if (!fa) return null;
  const kit = new FaKit(fa, m.seed);
  const used = new Set(m.props.map((p) => p.kind));
  const ground = new Set(m.ground.flat());
  const winter = /snow|winter|frost/i.test(m.notes.join(" "));
  const art: MapArt = { textures: {}, props: {}, treeShadows: [], decor: {}, roofs: [], walls: {}, lights: { wall: [], post: [] } };

  const tex: Partial<Record<Ground, string>> = {
    grass: m.setting === "swamp" ? "marsh" : m.setting === "clearing" && kit.entries("forest", 1, true).length && createRng(m.seed).chance(0.4) ? "forest" : "grass",
    dirt: "dirt", road: m.setting === "town" ? "cobble" : "path", mud: "mud",
    stone: m.setting === "ruins" || m.setting === "town" ? "flagstone" : m.setting === "shop" || m.setting === "tavern" ? "cobble" : "tiles",
    wood: "wood", cave: "cave", water: m.setting === "swamp" ? "swampWater" : "water", rock: "rock",
  };
  await Promise.all([...ground].map(async (g) => {
    const t = tex[g] && (await kit.texture(tex[g]!));
    if (t) art.textures[g] = t;
  }));

  await Promise.all([...used].map(async (kind) => {
    const slots = kind === "tree" && winter ? [["bareTree", 1] as [string, number]] : kind === "pillar" && m.setting === "ruins" ? [["pillarBroken", 2] as [string, number]] : PROP_SLOTS[kind];
    const entries = slots.flatMap(([slot, n]) => kit.entries(slot, n));
    const loaded = await kit.load(entries, kind === "tree" ? 12 : 16);
    if (loaded.length) art.props[kind] = loaded;
  }));
  if (art.props.tree?.length && !winter) art.treeShadows = await kit.load(kit.entries("treeShadow", 0), 30);

  // A scatter of small things on open ground.
  const decor: Partial<Record<Ground, [string, number][]>> = OUTDOOR.has(m.setting)
    ? { grass: [["flowers", 2], ["grassTuft", 1], ["rock", 1]], dirt: [["rock", 1], ["grassTuft", 1]], road: m.setting === "town" ? [["puddle", 1]] : [["rock", 1], ["puddle", 1]], stone: m.setting === "ruins" ? [["rubblePiece", 2], ["debris", 1]] : [] }
    : m.setting === "cave" || m.setting === "mine" ? { cave: [["rubblePiece", 2], ["bones", 1], ["mushrooms", 1]] }
    : m.setting === "swamp" ? { mud: [["puddle", 1], ["rock", 1]], grass: [["flowers", 1], ["grassTuft", 1]] } : {};
  await Promise.all((Object.entries(decor) as [Ground, [string, number][]][]).map(async ([g, slots]) => {
    if (!ground.has(g) || !slots.length) return;
    const loaded = await kit.load(slots.flatMap(([s, n]) => kit.entries(s, n)).filter(([, w, h]) => w <= 1 && h <= 1), 12);
    if (loaded.length) art.decor[g] = loaded;
  }));
  if (m.buildings?.length) art.roofs = await kit.load(kit.entries("roof", 3, true), 6);
  if (m.walls.some((w) => w.door)) art.walls.door = await kit.load(kit.entries("door", 1), 6);
  if (m.walls.some((w) => w.window)) art.walls.window = await kit.load(kit.entries("window", 1), 4);
  if (m.lights.some((l) => l.animation === "torch")) {
    [art.lights.wall, art.lights.post] = await Promise.all([kit.load(kit.entries("wallTorch", 0), 2), kit.load(kit.entries("streetLamp", 1), 4)]);
  }
  if (m.walls.some((w) => !w.door && !w.window)) {
    if (m.setting === "ruins") art.walls.stone = (await kit.texture("flagstone")) ?? undefined;
    else art.walls.timber = (await kit.texture("timber")) ?? undefined;
  }
  return art;
}

/** Art for a dungeon or cave: floor and rock textures, and clutter for along the walls. */
export interface DungeonArt {
  floor?: ArtImage;
  rock?: ArtImage;
  /** Small things to leave lying around, by how often they turn up. */
  clutter: ArtImage[];
  /** For the lair: bones and remains. */
  remains: ArtImage[];
  doors: ArtImage[];
  torches: ArtImage[];
  braziers: ArtImage[];
  candles: ArtImage[];
  /** Art for the furniture of rooms with a purpose. */
  furniture: Partial<Record<FurnitureKind, ArtImage[]>>;
}

/** FA slots for each kind of room furniture: [slot, families]. */
const FURNITURE_SLOTS: Record<FurnitureKind, [string, number]> = {
  bed: ["bed", 2], bedroll: ["bedroll", 3], table: ["table", 2], chair: ["chair", 1], bench: ["bench", 1], barrel: ["barrel", 3], crate: ["crate", 4],
  sack: ["sack", 3], weaponRack: ["weaponRack", 3], chest: ["chest", 2], altar: ["altar", 1], coffin: ["coffin", 2], sarcophagus: ["sarcophagus", 2],
  bookcase: ["bookcase", 1], shelf: ["shelf", 2], rug: ["rug", 2], pillar: ["pillar", 1], bones: ["bones", 3], skeleton: ["skeleton", 2],
  campfire: ["campfire", 1], forge: ["forge", 1], anvil: ["anvil", 1], mineCart: ["mineCart", 1], support: ["support", 1], cauldron: ["cauldron", 1],
  cage: ["cage", 1], chains: ["chains", 2], pew: ["pew", 1], cupboard: ["cupboard", 1], bookstand: ["bookstand", 1], desk: ["desk", 1],
  glassware: ["glassware", 6], hay: ["hay", 2], throne: ["throne", 1], mushrooms: ["mushrooms", 2], rubble: ["rubblePiece", 2], candles: ["candles", 2],
};

export async function dungeonArt(map: DungeonMap, keys: readonly RoomKey[] = []): Promise<DungeonArt | null> {
  const fa = await faManifest();
  if (!fa) return null;
  const kit = new FaKit(fa, map.seed);
  const cave = map.style === "cave";
  const small = (entries: [string, number, number][]) => entries.filter(([, w, h]) => w <= 1 && h <= 1);
  const [floor, rock, clutter, remains] = await Promise.all([
    kit.texture(cave ? "cave" : createRng(map.seed).chance(0.5) ? "tiles" : "flagstone"),
    kit.texture("rock"),
    kit.load(small(cave
      ? [...kit.entries("rubblePiece", 2), ...kit.entries("mushrooms", 2), ...kit.entries("bones", 1)]
      : [...kit.entries("rubblePiece", 2), ...kit.entries("debris", 1), ...kit.entries("barrel", 2), ...kit.entries("crate", 3), ...kit.entries("sack", 3)]), 20),
    kit.load([...kit.entries("skeleton", 2), ...small(kit.entries("bones", 2))], 8),
  ]);
  const [doors, torches, braziers, candles] = await Promise.all([
    cave ? [] : kit.load(kit.entries("door", 1), 6),
    kit.load(kit.entries("wallTorch", 0), 2),
    kit.load(kit.entries("brazier", 1), 4),
    kit.load(kit.entries("candles", 2), 6),
  ]);
  const furniture: DungeonArt["furniture"] = {};
  const kinds = new Set(keys.flatMap((k) => (k.furniture ?? []).map((f) => f.kind)));
  await Promise.all([...kinds].map(async (kind) => {
    const [slot, families] = FURNITURE_SLOTS[kind];
    const loaded = await kit.load(kit.entries(slot, families), 12);
    if (loaded.length) furniture[kind] = loaded;
  }));
  return { floor: floor ?? undefined, rock: rock ?? undefined, clutter, remains, doors, torches, braziers, candles, furniture };
}
