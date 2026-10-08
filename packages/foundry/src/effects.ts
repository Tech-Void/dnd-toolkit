import { createRng, roomCells, roomCenter, type Battlemap, type DungeonLight, type DungeonMap, type RoomKey } from "@dnd-toolkit/core";
import { faManifest, faUrl } from "./fa-assets.ts";
import { MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Living scenery: Forgotten Adventures' looping animations as video tiles on generated scenes.
// Fire in the hearths and braziers, fireflies over a night meadow, flies over the larder, dust
// in the library, sparkles in the summoning circle, water dripping in caves.

/** An animation to place, in grid units (top-left corner and size). */
export interface EffectTile {
  slot: string;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha?: number;
}

export function registerEffectSettings() {
  game.settings.register(MODULE_ID, "faAnimations", {
    name: "Animated scenery",
    hint: "Put Forgotten Adventures' animated fire, fireflies, dust, flies and sparkles on generated scenes (needs the FA art folder).",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

const enabled = () => {
  try {
    return game.settings.get(MODULE_ID, "faAnimations") !== false;
  } catch {
    return true;
  }
};

const centered = (slot: string, cx: number, cy: number, size: number, alpha?: number): EffectTile => ({ slot, x: cx - size / 2, y: cy - size / 2, w: size, h: size, alpha });

/** Animations for a battlemap. */
export function battlemapEffects(m: Battlemap): EffectTile[] {
  const rng = createRng(`${m.seed}:fx`);
  const out: EffectTile[] = [];
  for (const p of m.props) {
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    if (p.kind === "campfire") out.push(centered("animFire", cx, cy, 1.6));
    if (p.kind === "hearth") out.push(centered("animFire", cx, cy, 1.1));
  }
  const open = (g: string) => {
    const cells: [number, number][] = [];
    for (let y = 1; y < m.height - 1; y++) for (let x = 1; x < m.width - 1; x++) if (m.ground[y]![x] === g) cells.push([x, y]);
    return cells;
  };
  const scatter = (slot: string, cells: [number, number][], count: number, size: number, alpha?: number) => {
    for (const [x, y] of rng.shuffle(cells).slice(0, count)) out.push(centered(slot, x + 0.5, y + 0.5, size, alpha));
  };
  const area = m.width * m.height;
  if (m.night && ["clearing", "swamp", "farm", "bridge", "graveyard", "camp"].includes(m.setting)) scatter("fireflies", [...open("grass"), ...open("mud")], Math.round(area / 180), 4);
  if (m.setting === "swamp") scatter("flies", open("mud"), Math.round(area / 250), 2);
  if (m.setting === "farm") scatter("flies", open("dirt"), 1, 2);
  if (m.setting === "ruins" || m.setting === "temple") scatter("dust", open("stone"), Math.round(area / 300), 5, 0.7);
  if (m.setting === "cave" || m.setting === "mine") {
    const wet = m.props.filter((p) => p.kind === "stalagmite").map((p): [number, number] => [p.x, p.y]);
    scatter("drops", wet.length ? wet : open("cave"), 3, 2);
    for (const p of m.props.filter((q) => q.kind === "mushrooms").slice(0, 3)) out.push(centered("spores", p.x + 0.5, p.y + 0.5, 3, 0.8));
  }
  return out;
}

const DUSTY = /Library|Study|Sanctum|Storeroom|Entry hall|Vestry|Reliquary|Tomb/;
const FLIES = /Ossuary|Larder|Den|Catacomb|Embalming|Nest|Holding cells/;
const ARCANE = /Summoning circle|Sanctum|Ritual chamber|Laboratory/;

/** Animations for a dungeon or cave: its lights, and whatever its rooms are for. */
export function dungeonEffects(map: DungeonMap, keys: readonly RoomKey[], lights: readonly DungeonLight[]): EffectTile[] {
  const rng = createRng(`${map.seed}:fx`);
  const out: EffectTile[] = [];
  for (const l of lights) {
    if (l.kind === "campfire") out.push(centered("animFire", l.x, l.y, 1.6));
    else if (l.kind === "brazier") out.push(centered("animBrazier", l.x, l.y, 1));
    else if (l.kind === "torch") {
      // The flame sits just off the wall bracket, toward the room.
      const cx = Math.floor(l.x) + 0.5;
      const cy = Math.floor(l.y) + 0.5;
      const dx = Math.sign(l.x - cx);
      const dy = Math.sign(l.y - cy);
      out.push(centered("animBrazier", cx - dx * 0.08, cy - dy * 0.08, 0.55));
    } else if (l.kind === "fungi") out.push(centered("spores", l.x, l.y, 3, 0.8));
    else if (l.kind === "crystal") out.push(centered("sparkles", l.x, l.y, 2));
  }
  for (const k of keys) {
    const room = map.rooms.find((r) => r.id === k.roomId);
    if (!room) continue;
    const [cx, cy] = roomCenter(room);
    const label = `${k.purpose ?? ""} ${k.title}`;
    const spot = () => rng.pick(roomCells(room));
    if (DUSTY.test(label)) out.push(centered("dust", cx + 0.5, cy + 0.5, Math.min(6, Math.max(room.w, room.h)), 0.7));
    if (FLIES.test(label)) {
      const [x, y] = spot();
      out.push(centered("flies", x + 0.5, y + 0.5, 2));
    }
    if (ARCANE.test(label)) out.push(centered("sparkles", cx + 0.5, cy + 0.5, 3));
    if (/Fungus grove/.test(label)) for (let i = 0; i < 2; i++) {
      const [x, y] = spot();
      out.push(centered("spores", x + 0.5, y + 0.5, 3, 0.8));
    }
  }
  if (map.style === "cave") for (let i = 0; i < 3; i++) {
    const room = rng.pick(map.rooms);
    const [x, y] = rng.pick(roomCells(room));
    out.push(centered("drops", x + 0.5, y + 0.5, 2));
  }
  return out;
}

/** Tile data for the scene (video tiles that loop silently), or nothing without FA. */
export async function effectTiles(effects: EffectTile[], gs: number, seed: string): Promise<object[]> {
  if (!effects.length || !enabled()) return [];
  const fa = await faManifest();
  if (!fa?.effects) return [];
  const rng = createRng(`${seed}:fxpick`);
  return effects.flatMap((e) => {
    const files = Object.values(fa.effects?.[e.slot] ?? {}).flat();
    if (!files.length) return [];
    const [path] = rng.pick(files);
    return [{
      texture: { src: faUrl(path) },
      x: Math.round(e.x * gs), y: Math.round(e.y * gs), width: Math.round(e.w * gs), height: Math.round(e.h * gs),
      alpha: e.alpha ?? 1, elevation: 0, sort: 10,
      video: { loop: true, autoplay: true, volume: 0 },
      flags: { [MODULE_ID]: { effect: e.slot } },
    }];
  });
}
