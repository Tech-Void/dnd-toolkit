import { createRng, type Rng } from "./rng.ts";
import { FLOOR, roomCells, roomCenter, type DungeonMap, type Room, type RoomKey, type WallSegment } from "./dungeon.ts";
import { doorCells } from "./locks.ts";

// ---------------------------------------------------------------------------
// Puzzles that live on the map: levers to set, plates to step on in order, statues to turn, runes
// to touch. Solving one opens a sealed door (or the secret door to a hidden room); the clue is
// written somewhere else in the dungeon. Pure data; the Foundry side makes it interactive.

export type MapPuzzleKind = "levers" | "plates" | "statues" | "runes";

export interface MapPuzzleElement {
  cell: [number, number];
  /** What's carved on it: "Sun", "Crown", "Fire"... */
  label: string;
  /** Levers: 0 down / 1 up. Statues: facing 0-3 (N, E, S, W). Plates and runes: unused. */
  start: number;
}

export interface MapPuzzle {
  id: string;
  kind: MapPuzzleKind;
  roomId: number;
  title: string;
  elements: MapPuzzleElement[];
  /** Levers: target state per element. Statues: target facing per element. Plates/runes: element indexes in order. */
  solution: number[];
  /** The inscription the party can find. */
  clue: string;
  clueRoomId: number;
  /** The door it opens. */
  door: Pick<WallSegment, "x1" | "y1" | "x2" | "y2">;
  /** What happens on a wrong sequence (plates and runes). */
  onFail?: { text: string; save: { ability: "dex" | "con" | "wis"; dc: number }; damage: { formula: string; type: string } };
  /** For the GM: the answer in words. */
  answer: string;
}

const SYMBOLS: [label: string, riddle: string][] = [
  ["Sun", "what rises first"], ["Moon", "the lamp of the night"], ["Star", "the sailor's guide"], ["Crown", "the king's burden"],
  ["Skull", "what waits for everyone"], ["Tree", "what grows from a seed"], ["Flame", "what eats and is never full"], ["Wave", "what runs but never walks"],
  ["Key", "what opens but is not a door"], ["Eye", "what sees but cannot weep"], ["Serpent", "what sheds and is reborn"], ["Raven", "the messenger of the dead"],
];
const ELEMENTS: [label: string, riddle: string][] = [["Fire", "what burns"], ["Water", "what drowns"], ["Earth", "what buries"], ["Air", "what carries the voice"], ["Ice", "what holds still"], ["Lightning", "what strikes once"]];
const FACINGS = ["north", "east", "south", "west"];
const ORDINALS = ["first", "second", "third", "fourth"];

const keyOf = (x: number, y: number) => `${x},${y}`;

/** Floor cells of a room against a wall (for levers and runes) or out in the open (for plates and statues). */
function spots(map: DungeonMap, room: Room, wall: boolean, avoid: Set<string>): [number, number][] {
  const floor = (x: number, y: number) => map.cells[y]?.[x] === FLOOR;
  const inRoom = new Set(roomCells(room).map(([x, y]) => keyOf(x, y)));
  return roomCells(room).filter(([x, y]) => {
    if (avoid.has(keyOf(x, y))) return false;
    const rockNear = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !floor(x + dx!, y + dy!));
    // Not in a doorway or opening: every neighbor is room or rock.
    const opening = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => floor(x + dx!, y + dy!) && !inRoom.has(keyOf(x + dx!, y + dy!)));
    return !opening && (wall ? rockNear : !rockNear);
  });
}

/** Spread picks apart (Chebyshev distance ≥ gap). */
function spread(rng: Rng, cells: [number, number][], n: number, gap: number): [number, number][] {
  const out: [number, number][] = [];
  for (const c of rng.shuffle(cells)) {
    if (out.every((o) => Math.max(Math.abs(o[0] - c[0]), Math.abs(o[1] - c[1])) >= gap)) out.push(c);
    if (out.length === n) break;
  }
  return out;
}

/** Which way (0-3) points from a cell toward a target, along the bigger axis. */
const facingToward = ([x, y]: [number, number], [tx, ty]: [number, number]) =>
  Math.abs(tx - x) > Math.abs(ty - y) ? (tx > x ? 1 : 3) : ty > y ? 2 : 0;

export interface PuzzleOptions {
  kind?: MapPuzzleKind | "random";
  partyLevel?: number;
  seed?: string | number;
}

/**
 * Put a puzzle in a dungeon: in a room next to the door it opens (the hidden room's secret door, or
 * a door it seals), with the clue in another room. Returns new copies of the map and key, and the
 * puzzle, or null if there's nowhere sensible for one.
 */
export function placePuzzle(map: DungeonMap, keys: readonly RoomKey[], o: PuzzleOptions = {}): { map: DungeonMap; keys: RoomKey[]; puzzle: MapPuzzle } | null {
  const rng = createRng(o.seed ?? `${map.seed}:puzzle`);
  const walls = map.walls.map((w) => ({ ...w }));
  const out: RoomKey[] = structuredClone([...keys]) as RoomKey[];
  const roomAt = (x: number, y: number) => map.rooms.find((r) => roomCells(r).some(([cx, cy]) => cx === x && cy === y));
  // The prize: a secret door into a hidden room, else a door into a room with treasure (not the entrance).
  const candidates = walls.filter((w) => w.door && !w.lock).map((w) => {
    const sides = doorCells(w).map(([x, y]) => roomAt(x, y));
    const prize = sides.find((r) => r && out.find((k) => k.roomId === r.id && (k.hidden || k.loot || k.piles?.length) && r.id !== 1));
    const front = sides.find((r) => r && r !== prize && r.id !== prize?.id);
    return { w, prize, front, weight: w.secret ? 5 : prize ? 2 : 0 };
  }).filter((c) => c.prize && c.weight > 0);
  if (!candidates.length) return null;
  const choice = rng.weighted(candidates.map((c) => [c, c.weight] as [typeof c, number]));
  const door = choice.w;
  // The puzzle sits on the near side: a room if there is one, else the room nearest the door.
  const prizeRoom = choice.prize!;
  const room = choice.front ?? [...map.rooms].filter((r) => r !== prizeRoom && !r.hidden).sort((a, b) => {
    const d = (r: Room) => Math.hypot(roomCenter(r)[0] - door.x1, roomCenter(r)[1] - door.y1);
    return d(a) - d(b);
  })[0];
  if (!room) return null;

  const avoid = new Set<string>();
  const key = out.find((k) => k.roomId === room.id);
  for (const [x, y] of key?.trapCells ?? []) avoid.add(keyOf(x, y));
  for (const p of key?.piles ?? []) avoid.add(keyOf(...p.cell));
  for (const f of key?.furniture ?? []) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) avoid.add(keyOf(x, y));
  avoid.add(keyOf(...roomCenter(room)));

  const kind: MapPuzzleKind = !o.kind || o.kind === "random" ? rng.pick(["levers", "plates", "statues", "runes"] as const) : o.kind;
  const n = rng.int(3, 4);
  const cells = spread(rng, spots(map, room, kind === "levers" || kind === "runes", avoid), n, kind === "plates" ? 1 : 2);
  if (cells.length < 3) return null;
  const dc = 11 + Math.floor((o.partyLevel ?? 3) / 3);
  const dice = ["2d6", "3d6", "4d6", "6d6"][Math.min(3, Math.floor(((o.partyLevel ?? 3) - 1) / 5))]!;
  const id = rng.int(0, 36 ** 6).toString(36);
  let puzzle: MapPuzzle;

  if (kind === "levers") {
    const labels = rng.shuffle(SYMBOLS).slice(0, cells.length);
    const solution: number[] = cells.map(() => rng.int(0, 1));
    if (!solution.some((s) => s)) solution[0] = 1;
    const raised = labels.filter((_, i) => solution[i]).map(([l]) => `the ${l}`);
    const lowered = labels.filter((_, i) => !solution[i]).map(([l]) => `the ${l}`);
    puzzle = {
      id, kind, roomId: room.id, title: "The lever wall", elements: cells.map((cell, i) => ({ cell, label: labels[i]![0], start: 0 })), solution,
      clue: `Raise ${raised.join(" and ")}; let ${lowered.length ? lowered.join(" and ") : "nothing"} sleep.`, clueRoomId: 0, door,
      answer: `Levers up: ${raised.join(", ") || "none"}. Down: ${lowered.join(", ") || "none"}.`,
    };
  } else if (kind === "statues") {
    const target = doorCells(door).find(([x, y]) => roomAt(x, y) === room) ?? doorCells(door)[0]!;
    const solution = cells.map((c) => facingToward(c, target));
    const elements = cells.map((cell, i) => ({ cell, label: rng.pick(["Knight", "Queen", "Priest", "Hound", "Lion", "Watcher"]), start: (solution[i]! + rng.int(1, 3)) % 4 }));
    puzzle = {
      id, kind, roomId: room.id, title: "The watching statues", elements, solution,
      clue: "The watchers guard the way with their eyes. Turn every gaze upon the door they keep, and it will keep no longer.", clueRoomId: 0, door,
      answer: `Each statue faces the sealed door: ${elements.map((e, i) => `${e.label} ${FACINGS[solution[i]!]}`).join(", ")}.`,
    };
  } else {
    const pool = kind === "runes" ? ELEMENTS : SYMBOLS;
    const labels = rng.shuffle(pool).slice(0, cells.length);
    const order = rng.shuffle(cells.map((_, i) => i));
    const riddle = order.map((i, k) => `${ORDINALS[k]} ${labels[i]![1]}`).join(", ");
    puzzle = {
      id, kind, roomId: room.id, title: kind === "runes" ? "The rune circle" : "The pressure plates", elements: cells.map((cell, i) => ({ cell, label: labels[i]![0], start: 0 })),
      solution: order, door,
      clue: kind === "runes" ? `Wake them in their turn: ${riddle}.` : `Walk the path of the wise: ${riddle}.`, clueRoomId: 0,
      onFail: kind === "runes"
        ? { text: "The runes flare and discharge: everyone within 10 feet of a rune is struck.", save: { ability: "con", dc }, damage: { formula: dice, type: rng.pick(["lightning", "force", "fire"]) } }
        : { text: "Darts hiss from the walls at whoever stepped wrong.", save: { ability: "dex", dc }, damage: { formula: dice, type: "piercing" } },
      answer: `In order: ${order.map((i) => labels[i]![0]).join(", ")}.`,
    };
  }

  // The clue: carved in another room the party will pass through, or in this one if there's no other.
  const clueRoom = rng.shuffle(map.rooms.filter((r) => r.id !== room.id && r !== prizeRoom && !r.hidden))[0] ?? room;
  puzzle.clueRoomId = clueRoom.id;
  const where = rng.pick(["scratched into the wall", "painted on a cracked tile", "carved around the doorframe", "written on a scrap of parchment pinned to the wall", "inlaid in silver on the floor"]);
  const note = (id: number, text: string) => {
    const k = out.find((x) => x.roomId === id);
    if (k) (k.notes ??= []).push(text);
  };
  note(clueRoom.id, `Clue for ${puzzle.title} (Room ${room.id}), ${where}: "${puzzle.clue}"`);
  note(room.id, `Puzzle: ${puzzle.title}. ${puzzle.elements.length} ${kind === "levers" ? "levers" : kind === "statues" ? "statues" : kind === "runes" ? "runes" : "plates"} marked ${puzzle.elements.map((e) => e.label).join(", ")}. The clue is in Room ${clueRoom.id}. Answer: ${puzzle.answer}${puzzle.onFail ? ` Wrong order: ${puzzle.onFail.text} (DC ${puzzle.onFail.save.dc} ${puzzle.onFail.save.ability.toUpperCase()} save, ${puzzle.onFail.damage.formula} ${puzzle.onFail.damage.type})` : ""}`);
  // Seal the door (a secret door stays secret until it opens).
  const wall = walls.find((w) => w.x1 === door.x1 && w.y1 === door.y1 && w.x2 === door.x2 && w.y2 === door.y2)!;
  if (!wall.secret) wall.lock = { kind: "sealed", forceDc: 25, rooms: [room.id, prizeRoom.id] };
  note(prizeRoom.id, `Opened by solving ${puzzle.title} in Room ${room.id}.`);
  return { map: { ...map, walls, puzzles: [...(map.puzzles ?? []), puzzle] }, keys: out, puzzle };
}

/** Is this state the solution? Levers and statues: every element right. Plates and runes: the order so far is complete and right. */
export function puzzleSolved(p: MapPuzzle, state: { values: number[]; order: number[] }): boolean {
  if (p.kind === "levers" || p.kind === "statues") return p.solution.every((s, i) => state.values[i] === s);
  return state.order.length === p.solution.length && state.order.every((v, i) => v === p.solution[i]);
}

/** For sequences: is the order so far still on track? */
export const sequenceOnTrack = (p: MapPuzzle, order: number[]) => order.every((v, i) => v === p.solution[i]);
