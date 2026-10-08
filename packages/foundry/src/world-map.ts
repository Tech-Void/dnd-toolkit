import {
  addWorldPlaces,
  advanceTrip,
  generateWorld,
  randomSeed,
  startTrip,
  TERRAINS,
  worldPlace,
  worldRoute,
  type Climate,
  type Pace,
  type Terrain,
  type WorldMap,
  type WorldPlace,
  type WorldPlaceKind,
} from "@dnd-toolkit/core";
import { getCampaign } from "./campaign-store.ts";
import { uploadImage } from "./importers/scene.ts";
import { WORLD_CELL_PX, worldToBlob } from "./render-world.ts";
import { ensureFolder, esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// The region map as a scene: the painted map, a pin for every place (linked to its journal page,
// hidden from players until the GM shows them that page), and a party marker that walks the route
// as the days pass. The Travel tab plans trips between pins.

type StoredWorld = WorldMap & { sceneId?: string; atlasId?: string; pages?: Record<string, string> };

export function registerWorldSettings() {
  game.settings.register(MODULE_ID, "worldMap", { scope: "world", config: false, type: Object, default: {} });
}

export const getWorld = (): StoredWorld | null => {
  const w = game.settings.get(MODULE_ID, "worldMap") as StoredWorld;
  return w && Array.isArray(w.cells) && w.cells.length ? structuredClone(w) : null;
};
const saveWorld = (w: StoredWorld) => game.settings.set(MODULE_ID, "worldMap", w);

const ICON: Record<WorldPlaceKind, string> = {
  city: "icons/svg/city.svg", town: "icons/svg/village.svg", village: "icons/svg/house.svg", dungeon: "icons/svg/ruins.svg",
  lair: "icons/svg/cave.svg", landmark: "icons/svg/obelisk.svg", temple: "icons/svg/temple.svg",
};

const center = (x: number, y: number) => ({ x: (x + 0.5) * WORLD_CELL_PX, y: (y + 0.5) * WORLD_CELL_PX });

/** The GM-only atlas journal: a page per place (show a page to the players to reveal its pin). */
async function ensureAtlas(w: StoredWorld) {
  let atlas = (w.atlasId && game.journal.get(w.atlasId)) || null;
  atlas ??= await JournalEntry.create({ name: "World atlas", folder: await ensureFolder("JournalEntry"), ownership: { default: 0 }, flags: { [MODULE_ID]: { kind: "atlas" } } });
  w.atlasId = atlas.id;
  w.pages ??= {};
  const c = getCampaign();
  const missing = w.places.filter((p) => !w.pages![p.id] || !atlas.pages.get(w.pages![p.id]));
  if (missing.length) {
    const made = await atlas.createEmbeddedDocuments("JournalEntryPage", missing.map((p) => {
      const known = c.places.find((x) => x.id === p.campaignId);
      const terrain = TERRAINS[(w.cells[p.y * w.w + p.x] as Terrain) ?? "grassland"]?.label ?? "";
      return { name: p.name, type: "text", ownership: { default: 0 }, text: { content: `<p><em>${esc(p.kind)}${terrain ? `, in the ${esc(terrain.toLowerCase())}` : ""}</em></p>${known?.notes ? `<p>${esc(known.notes)}</p>` : "<p></p>"}` } };
    }));
    missing.forEach((p, i) => (w.pages![p.id] = made[i].id));
  }
  return atlas;
}

const noteData = (w: StoredWorld, p: WorldPlace) => ({
  entryId: w.atlasId, pageId: w.pages?.[p.id], ...center(p.x, p.y),
  texture: { src: ICON[p.kind] }, iconSize: p.kind === "city" ? 48 : 36, text: p.name, fontSize: p.kind === "city" ? 28 : 22,
  textAnchor: CONST.TEXT_ANCHOR_POINTS.BOTTOM, flags: { [MODULE_ID]: { place: p.id } },
});

const partyData = (w: StoredWorld) => {
  const r = WORLD_CELL_PX * 0.45;
  const c = center(w.party.x, w.party.y);
  return {
    x: c.x - r, y: c.y - r, shape: { type: "e", width: r * 2, height: r * 2 },
    fillType: 1, fillColor: "#c0392b", fillAlpha: 0.75, strokeWidth: 4, strokeColor: "#fff3d6", strokeAlpha: 1,
    text: "Party", fontSize: 22, textColor: "#ffffff", flags: { [MODULE_ID]: { partyMarker: true } },
  };
};

const routeData = (w: StoredWorld) => {
  const pts = (w.trip?.path ?? []).map(([x, y]) => center(x, y));
  if (pts.length < 2) return null;
  const x0 = Math.min(...pts.map((p) => p.x));
  const y0 = Math.min(...pts.map((p) => p.y));
  return {
    x: x0, y: y0, shape: { type: "p", width: Math.max(...pts.map((p) => p.x)) - x0, height: Math.max(...pts.map((p) => p.y)) - y0, points: pts.flatMap((p) => [p.x - x0, p.y - y0]) },
    strokeWidth: 6, strokeColor: "#c0392b", strokeAlpha: 0.7, fillType: 0, bezierFactor: 0.4, flags: { [MODULE_ID]: { routeLine: true } },
  };
};

/** Paint the map and make its scene (or a fresh one, replacing the old map). */
export async function createWorldScene(w: StoredWorld) {
  const src = await uploadImage(await worldToBlob(w), `world-${w.seed.replace(/[^\w-]/g, "_")}-${Date.now()}.webp`);
  await ensureAtlas(w);
  const scene = await Scene.create({
    name: "World map", folder: await ensureFolder("Scene"), width: w.w * WORLD_CELL_PX, height: w.h * WORLD_CELL_PX, padding: 0,
    backgroundColor: "#2c3e46", background: { src },
    grid: { type: CONST.GRID_TYPES.SQUARE, size: WORLD_CELL_PX, distance: w.milesPerCell, units: "mi", alpha: 0 },
    tokenVision: false, fog: { exploration: false }, journal: w.atlasId,
    notes: w.places.map((p) => noteData(w, p)), drawings: [partyData(w)],
    flags: { [MODULE_ID]: { kind: "world", seed: w.seed } },
  });
  w.sceneId = scene.id;
  await saveWorld(w);
  return scene;
}

/** Move the marker (and redraw the route line) to match the stored map. */
async function syncScene(w: StoredWorld) {
  const scene = w.sceneId && game.scenes.get(w.sceneId);
  if (!scene) return;
  const marker = scene.drawings.find((d: any) => d.getFlag(MODULE_ID, "partyMarker"));
  const data = partyData(w);
  if (marker) await marker.update({ x: data.x, y: data.y }, { animate: true });
  else await scene.createEmbeddedDocuments("Drawing", [data]);
  const old = scene.drawings.filter((d: any) => d.getFlag(MODULE_ID, "routeLine")).map((d: any) => d.id);
  if (old.length) await scene.deleteEmbeddedDocuments("Drawing", old);
  const route = routeData(w);
  if (route) await scene.createEmbeddedDocuments("Drawing", [route]);
  // Pins for places added since.
  const pinned = new Set(scene.notes.map((n: any) => n.getFlag(MODULE_ID, "place")));
  const fresh = w.places.filter((p) => !pinned.has(p.id));
  if (fresh.length) await scene.createEmbeddedDocuments("Note", fresh.map((p) => noteData(w, p)));
}

// --- The Travel tab's world card ----------------------------------------------------------------

export interface TravelPatch {
  from?: string;
  to?: string;
  days?: number;
  terrain?: Terrain;
}

const placeOptions = (w: StoredWorld, value: string, here = false) =>
  `${here ? `<option value="party" ${value === "party" ? "selected" : ""}>Where the party is</option>` : ""}${[...w.places].sort((a, b) => a.name.localeCompare(b.name)).map((p) => `<option value="${p.id}" ${p.id === value ? "selected" : ""}>${esc(p.name)} (${p.kind})</option>`).join("")}`;

const wbtn = (op: string, label: string, title = "", data: Record<string, string> = {}) =>
  `<button type="button" data-action="world" data-op="${op}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")} ${title ? `title="${esc(title)}"` : ""}>${label}</button>`;

/** The world map card at the top of the Travel tab. `nextMiles` is the planned journey's next day. */
export function worldCardHtml(pace: Pace, nextMiles?: number): string {
  const w = getWorld();
  if (!w) {
    return `<div class="dt-card dt-world"><p class="dt-enc-head"><i class="fa-solid fa-earth-europe"></i> <strong>World map</strong></p>
      <p class="dt-sub">Generate a region map with your campaign's places (and some new ones), roads and rivers. Then plan trips between places here and watch the party marker move as the days pass.</p>
      <div class="dt-row">
        <label>Climate <select data-world="climate"><option>temperate</option><option>cold</option><option>hot</option></select></label>
        <label>Seed <input type="text" data-world="seed" placeholder="random"></label>
        ${wbtn("generate", `<i class="fa-solid fa-wand-magic-sparkles"></i> Generate world map`)}
      </div></div>`;
  }
  const at = w.party.at ? worldPlace(w, w.party.at)?.name : undefined;
  const trip = w.trip;
  const dest = trip ? worldPlace(w, trip.to)?.name : undefined;
  return `<div class="dt-card dt-world">
    <p class="dt-enc-head"><i class="fa-solid fa-earth-europe"></i> <strong>World map</strong> ·
      ${trip ? `on the way to <strong>${esc(dest ?? "?")}</strong>: ${Math.round(trip.done)} of ${trip.miles} miles, day ${trip.day}` : at ? `the party is at <strong>${esc(at)}</strong>` : "the party is out in the wilds"}
      ${wbtn("open", `<i class="fa-solid fa-map"></i> Open`, "View the world map scene")}</p>
    ${trip ? `<div class="dt-world-bar"><span style="width:${Math.round((trip.done / Math.max(1, trip.miles)) * 100)}%"></span></div>
      <div class="dt-row dt-actions">
        ${wbtn("walk", `<i class="fa-solid fa-person-hiking"></i> Walk a day (${nextMiles ?? (pace === "slow" ? 18 : pace === "fast" ? 30 : 24)} mi)`, "Move the party marker one day along the route", { miles: String(nextMiles ?? (pace === "slow" ? 18 : pace === "fast" ? 30 : 24)) })}
        ${wbtn("arrive", `<i class="fa-solid fa-flag-checkered"></i> Arrive`, "Skip to the destination")}
        ${wbtn("cancel", `<i class="fa-solid fa-xmark"></i>`, "Call off the trip (the party stays where it is)")}
      </div>` : ""}
    <div class="dt-row">
      <label>From <select data-world="from">${placeOptions(w, "party", true)}</select></label>
      <label>To <select data-world="to">${placeOptions(w, trip?.to ?? "")}</select></label>
      ${wbtn("route", `<i class="fa-solid fa-route"></i> Plan the trip`, "Find the way (by road where it can), fill in the journey below and draw the route on the map")}
    </div>
    <div class="dt-row dt-actions">
      ${wbtn("sync", `<i class="fa-solid fa-rotate"></i> Add campaign places`, "Put places added to the campaign since on the map")}
      ${wbtn("repaint", `<i class="fa-solid fa-paintbrush"></i> New scene`, "Repaint the map into a new scene (pins and marker included)")}
      ${wbtn("forget", `<i class="fa-solid fa-trash"></i>`, "Forget this world map (the scene stays)")}
    </div></div>`;
}

/** World card buttons. Returns changes for the travel form when a trip is planned. */
export async function worldAction(op: string, d: DOMStringMap, root: HTMLElement, pace: Pace): Promise<TravelPatch | void> {
  const v = (k: string) => ((root.querySelector(`[data-world="${k}"]`) as HTMLInputElement | null)?.value ?? "").trim();
  let w = getWorld();
  switch (op) {
    case "generate": {
      ui.notifications.info("Painting the world map…");
      const c = getCampaign();
      const world: StoredWorld = generateWorld({ seed: v("seed") || randomSeed(), climate: (v("climate") || "temperate") as Climate, places: c.places });
      const scene = await createWorldScene(world);
      scene.view();
      return;
    }
    case "open": {
      const scene = w?.sceneId && game.scenes.get(w.sceneId);
      if (scene) return void scene.view();
      if (w) return void (await createWorldScene(w)).view();
      return;
    }
    case "repaint":
      if (w) (await createWorldScene(w)).view();
      return;
    case "forget":
      if (w && (await foundry.applications.api.DialogV2.confirm({ window: { title: "Forget the world map?" }, content: "<p>The scene and atlas stay; the Travel tab stops tracking this map.</p>" }))) await game.settings.set(MODULE_ID, "worldMap", {});
      return;
    case "sync": {
      if (!w) return;
      const before = w.places.length;
      w = { ...w, ...addWorldPlaces(w, getCampaign().places) };
      await ensureAtlas(w);
      await saveWorld(w);
      await syncScene(w);
      ui.notifications.info(w.places.length > before ? `Added ${w.places.length - before} place(s) to the map.` : "Every campaign place is already on the map.");
      return;
    }
    case "route": {
      if (!w) return;
      const fromId = v("from");
      const to = worldPlace(w, v("to"));
      const from = fromId === "party" ? { ...w.party, id: w.party.at ?? "party", name: (w.party.at && worldPlace(w, w.party.at)?.name) || "the wilds" } : worldPlace(w, fromId);
      if (!from || !to) return void ui.notifications.warn("Pick where they're going.");
      const start = { x: Math.round(from.x), y: Math.round(from.y) };
      const route = worldRoute(w, start, to);
      if (!route) return void ui.notifications.warn(`There's no way over land to ${to.name}.`);
      w = { ...w, ...startTrip(w, "id" in from ? from.id : "party", to.id, route) };
      await saveWorld(w);
      await syncScene(w);
      const mix = (Object.entries(route.terrain) as [Terrain, number][]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, f]) => `${Math.round(f * 100)}% ${TERRAINS[t].label.toLowerCase()}`).join(", ");
      ui.notifications.info(`${route.miles} miles to ${to.name} (${mix}): about ${route.days[pace]} day${route.days[pace] === 1 ? "" : "s"}.`);
      return { from: from.name, to: to.name, days: Math.min(21, route.days[pace]), terrain: route.main };
    }
    case "walk":
    case "arrive":
    case "cancel": {
      if (!w?.trip) return;
      w = op === "cancel" ? { ...w, trip: undefined, party: { x: Math.round(w.party.x), y: Math.round(w.party.y) } } : { ...w, ...advanceTrip(w, op === "arrive" ? Infinity : Number(d.miles) || 24) };
      if (op === "cancel" || !w.trip) delete (w as Partial<StoredWorld>).trip;
      await saveWorld(w);
      await syncScene(w);
      if (op !== "cancel" && !w.trip && w.party.at) ui.notifications.info(`The party reaches ${worldPlace(w, w.party.at)?.name}.`);
      return;
    }
  }
}
