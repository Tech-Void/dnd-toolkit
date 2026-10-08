import { createRng, puzzleSolved, sequenceOnTrack, type DungeonMap, type MapPuzzle } from "@dnd-toolkit/core";
import { faManifest, faUrl } from "./fa-assets.ts";
import { partyActors, sendRollRequest } from "./rolls.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Puzzles on the map. Each lever, plate, statue or rune is a tile with a region under it: step onto
// it and you're asked what to do (plates just press). The active GM keeps the state in a scene
// flag, turns and flips the tiles, punishes a wrong sequence, and opens the sealed door when solved.

const SOCKET = `module.${MODULE_ID}`;
const FACING = ["north", "east", "south", "west"];

interface PuzzleState {
  puzzle: MapPuzzle;
  values: number[];
  order: number[];
  solved: boolean;
}

const STEP = `await game.modules.get("${MODULE_ID}")?.api?.puzzleStep?.(region, event);`;
const FALLBACK: Record<MapPuzzle["kind"], string> = { levers: "icons/svg/target.svg", statues: "icons/svg/mystery-man.svg", plates: "icons/svg/circle.svg", runes: "icons/svg/aura.svg" };
const SLOT: Record<MapPuzzle["kind"], string> = { levers: "lever", statues: "statue", plates: "plateCircle", runes: "runeCircle" };

/** Regions, tiles and the scene flag for a dungeon's puzzles. */
export async function puzzleSceneData(map: DungeonMap, gs: number): Promise<{ regions: object[]; tiles: object[]; flags: Record<string, PuzzleState> }> {
  const regions: object[] = [];
  const tiles: object[] = [];
  const flags: Record<string, PuzzleState> = {};
  const fa = await faManifest();
  for (const p of map.puzzles ?? []) {
    flags[p.id] = { puzzle: p, values: p.elements.map((e) => e.start), order: [], solved: false };
    const art = Object.values(fa?.props?.[SLOT[p.kind]] ?? {}).flat();
    const rng = createRng(`${p.id}:art`);
    const src = art.length ? faUrl(rng.pick(art)[0]) : FALLBACK[p.kind];
    p.elements.forEach((el, i) => {
      const [x, y] = el.cell;
      const flag = { [MODULE_ID]: { puzzle: p.id, index: i } };
      tiles.push({
        texture: { src, ...(p.kind === "levers" ? { scaleY: el.start ? -1 : 1 } : {}), ...(p.kind === "runes" || p.kind === "plates" ? { tint: "#bbbbbb" } : {}) },
        x: x * gs + gs * 0.05, y: y * gs + gs * 0.05, width: gs * 0.9, height: gs * 0.9, rotation: p.kind === "statues" ? el.start * 90 : 0,
        alpha: p.kind === "runes" ? 0.75 : 1, elevation: 0, sort: 20, flags: flag,
      });
      regions.push({
        name: `${p.title}: ${el.label}`, color: "#8a5cd6",
        shapes: [{ type: "rectangle", x: x * gs, y: y * gs, width: gs, height: gs, rotation: 0, hole: false }],
        visibility: CONST.REGION_VISIBILITY.LAYER,
        behaviors: [{ type: "executeScript", name: "Interact", system: { events: ["tokenEnter"], source: STEP } }],
        flags: flag,
      });
    });
  }
  return { regions, tiles, flags };
}

/** Wall flags marking the door a puzzle opens. */
export function puzzleDoorFlag(map: DungeonMap, w: { x1: number; y1: number; x2: number; y2: number }): string | undefined {
  return (map.puzzles ?? []).find((p) => p.door.x1 === w.x1 && p.door.y1 === w.y1 && p.door.x2 === w.x2 && p.door.y2 === w.y2)?.id;
}

// --- The player steps on it ---------------------------------------------------------------

/** Region script: runs on the mover's client and asks them what they do. */
export async function puzzleStep(region: any, event: any) {
  if (!event.user?.isSelf) return;
  const { puzzle: id, index } = region.flags?.[MODULE_ID] ?? {};
  const state: PuzzleState | undefined = region.parent?.getFlag(MODULE_ID, `puzzles.${id}`);
  if (!state || state.solved) return;
  const p = state.puzzle;
  const el = p.elements[index];
  if (!el) return;
  const act = (action: string) => sendAct({ sceneId: region.parent.id, id, index, action, who: event.data?.token?.name ?? "Someone" });
  if (p.kind === "plates") return act("press");
  const DialogV2 = foundry.applications?.api?.DialogV2;
  if (!DialogV2) return;
  const prompt: Record<string, [string, { action: string; label: string; icon: string }[]]> = {
    levers: [`A lever marked with a ${el.label}. It's ${state.values[index] ? "up" : "down"}.`, [{ action: "pull", label: "Pull it", icon: "fa-solid fa-hand" }]],
    statues: [`A statue of a ${el.label}, facing ${FACING[state.values[index]!]}. It sits on a worn turntable.`, [{ action: "left", label: "Turn left", icon: "fa-solid fa-rotate-left" }, { action: "right", label: "Turn right", icon: "fa-solid fa-rotate-right" }]],
    runes: [`A rune of ${el.label}, faintly warm.`, [{ action: "touch", label: "Touch it", icon: "fa-solid fa-hand-sparkles" }]],
  };
  const [text, buttons] = prompt[p.kind]!;
  const choice = await DialogV2.wait({
    window: { title: p.title, icon: "fa-solid fa-puzzle-piece" },
    content: `<p>${esc(text)}</p>`,
    buttons: [...buttons.map((b) => ({ ...b, callback: () => b.action })), { action: "leave", label: "Leave it" }],
    rejectClose: false,
  });
  if (choice && choice !== "leave") act(choice);
}

interface Act {
  sceneId: string;
  id: string;
  index: number;
  action: string;
  who: string;
}

function sendAct(a: Act) {
  if (game.users.activeGM?.isSelf) applyAct(a);
  else game.socket.emit(SOCKET, { kind: "puzzleAct", act: a });
}

// --- The GM keeps score ---------------------------------------------------------------------

async function applyAct(a: Act) {
  const scene = game.scenes.get(a.sceneId);
  const state: PuzzleState | undefined = scene?.getFlag(MODULE_ID, `puzzles.${a.id}`);
  if (!scene || !state || state.solved) return;
  const p = state.puzzle;
  const el = p.elements[a.index]!;
  const tile = scene.tiles.find((t: any) => t.getFlag(MODULE_ID, "puzzle") === a.id && t.getFlag(MODULE_ID, "index") === a.index);
  let flavor = "";
  if (p.kind === "levers") {
    state.values[a.index] = state.values[a.index] ? 0 : 1;
    await tile?.update({ "texture.scaleY": state.values[a.index] ? -1 : 1 });
    flavor = `${a.who} pulls the ${el.label} lever ${state.values[a.index] ? "up" : "down"}. Clunk.`;
  } else if (p.kind === "statues") {
    state.values[a.index] = (state.values[a.index]! + (a.action === "left" ? 3 : 1)) % 4;
    await tile?.update({ rotation: state.values[a.index]! * 90 });
    flavor = `With a grinding of stone, the ${el.label} turns to face ${FACING[state.values[a.index]!]}.`;
  } else {
    if (state.order.includes(a.index)) return;
    state.order.push(a.index);
    await tile?.update({ alpha: 1, "texture.tint": p.kind === "runes" ? "#9fd8ff" : "#ffffff" });
    flavor = p.kind === "runes" ? `The ${el.label} rune flares with light under ${a.who}'s hand.` : `The ${el.label} plate sinks under ${a.who}'s foot with a click.`;
    if (!sequenceOnTrack(p, state.order)) {
      await failSequence(scene, state, a.who);
      return;
    }
  }
  ChatMessage.create({ speaker: { alias: p.title }, content: `<p><em>${esc(flavor)}</em></p>` });
  if (puzzleSolved(p, state)) await solve(scene, state);
  else await scene.setFlag(MODULE_ID, `puzzles.${a.id}`, state);
}

async function failSequence(scene: any, state: PuzzleState, who: string) {
  const p = state.puzzle;
  state.order = [];
  for (const t of scene.tiles.filter((t: any) => t.getFlag(MODULE_ID, "puzzle") === p.id)) await t.update({ alpha: p.kind === "runes" ? 0.75 : 1, "texture.tint": "#bbbbbb" });
  await scene.setFlag(MODULE_ID, `puzzles.${p.id}`, state);
  const f = p.onFail;
  ChatMessage.create({ speaker: { alias: p.title }, content: `<p><strong>Wrong!</strong> ${esc(f?.text ?? "Everything resets with a heavy thud.")} Every ${p.kind === "runes" ? "rune goes dark" : "plate rises"} again.</p>` });
  if (!f) return;
  ChatMessage.create({
    speaker: { alias: "DnD Toolkit" }, whisper: game.users.filter((u: any) => u.isGM).map((u: any) => u.id),
    content: `<div class="dt-trap-card"><p><strong>${esc(p.title)}</strong>: ${esc(who)} got the order wrong.</p>
      <div class="dt-trap-buttons"><button type="button" data-dt-pz="save" data-ability="${f.save.ability}" data-dc="${f.save.dc}"><i class="fa-solid fa-dice-d20"></i> ${f.save.ability.toUpperCase()} save DC ${f.save.dc} (everyone)</button>
      <button type="button" data-dt-pz="damage" data-formula="${esc(f.damage.formula)}" data-type="${esc(f.damage.type)}"><i class="fa-solid fa-burst"></i> ${esc(f.damage.formula)} ${esc(f.damage.type)}</button></div></div>`,
  });
}

async function solve(scene: any, state: PuzzleState) {
  state.solved = true;
  await scene.setFlag(MODULE_ID, `puzzles.${state.puzzle.id}`, state);
  const wall = scene.walls.find((w: any) => w.getFlag(MODULE_ID, "puzzleDoor") === state.puzzle.id);
  if (wall) await wall.update({ door: CONST.WALL_DOOR_TYPES.DOOR, ds: CONST.WALL_DOOR_STATES.OPEN, [`flags.${MODULE_ID}.-=lock`]: null });
  ChatMessage.create({ speaker: { alias: state.puzzle.title }, content: `<p><i class="fa-solid fa-unlock"></i> <strong>Solved!</strong> A deep grinding of stone, and somewhere close by, a way opens.</p>` });
}

export function initPuzzles() {
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "puzzleAct" && game.users.activeGM?.isSelf) applyAct(msg.act);
  });
  Hooks.on("renderChatMessage", (_m: any, html: any) => {
    const root: HTMLElement = html[0] ?? html;
    for (const b of root.querySelectorAll("button[data-dt-pz]") as NodeListOf<HTMLButtonElement>) {
      if (!game.user.isGM) {
        b.remove();
        continue;
      }
      b.addEventListener("click", async () => {
        if (b.dataset.dtPz === "save") {
          await sendRollRequest({ id: foundry.utils.randomID(), prompt: "The puzzle strikes back!", type: "save", key: b.dataset.ability!, dc: Number(b.dataset.dc), showDc: true, advantage: "normal", rollMode: "publicroll", actorIds: partyActors().map((a: any) => a.id) });
        } else {
          await new (foundry.dice?.Roll ?? (globalThis as any).Roll)(b.dataset.formula!).toMessage({ flavor: `Puzzle: ${b.dataset.type} damage` });
        }
      });
    }
  });
}
