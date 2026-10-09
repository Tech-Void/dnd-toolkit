import { innNight, innRound, nextRumor, payFrom, servicePrice, TEMPLE_SERVICES, type Coins, type Town } from "@dnd-toolkit/core";
import { getCampaign } from "./campaign-store.ts";
import { logSession } from "./rewards.ts";
import { getShop, openShopForPlayers } from "./shop-trade.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Walking into a town: a zone just inside each named building's door. A shop opens its shop window,
// the inn its keeper (rooms, a round, rumors), the temple its priests (healing and restoration for
// coin), the hall its leader (and work). The town (without its map) lives on the scene.

const SOCKET = `module.${MODULE_ID}`;
const ENTER = `await game.modules.get("${MODULE_ID}")?.api?.townEnter?.(region, event);`;

export type TownData = Omit<Town, "map">;

/** Regions for the town scene: one at each named building's door. */
export function townRegionData(t: Town, gs: number): object[] {
  return t.places.map((p, i) => {
    const b = t.map.buildings!.find((x) => x.id === p.buildingId)!;
    const [x, y] = b.door;
    return {
      name: `Enter: ${p.label}`,
      color: "#2e86c1",
      shapes: [{ type: "rectangle", x: x * gs, y: y * gs, width: gs, height: gs, rotation: 0, hole: false }],
      visibility: CONST.REGION_VISIBILITY.GAMEMASTER,
      behaviors: [{ type: "executeScript", name: "Go inside", system: { events: ["tokenMoveIn"], source: ENTER } }],
      flags: { [MODULE_ID]: { townPlace: i } },
    };
  });
}

export const sceneTown = (scene: any): TownData | null => scene?.getFlag?.(MODULE_ID, "town") ?? null;

const shopId = (t: TownData, index: number) => t.shops[index]!.seed.replace(/\W/g, "_");

/** Region script (every client; the mover's acts): open whatever this building is. */
export async function townEnter(region: any, event: any) {
  if (event.name !== "tokenMoveIn" || !event.user?.isSelf || event.user.isGM) return;
  const token = event.data?.token;
  const t = sceneTown(region.parent);
  const place = t?.places[region.getFlag(MODULE_ID, "townPlace")];
  if (!token || token.hidden || !t || !place) return;
  if (game.combats?.find((c: any) => c.started && c.scene?.id === region.parent.id)) return;
  openPlace(region.parent.id, t.places.indexOf(place), token.id);
}

/** Open a town building for the local user. */
export async function openPlace(sceneId: string, placeIndex: number, tokenId?: string) {
  const scene = game.scenes.get(sceneId);
  const t = sceneTown(scene);
  const place = t?.places[placeIndex];
  if (!t || !place) return;
  if (place.kind === "shop" && place.shop !== undefined) {
    const id = shopId(t, place.shop);
    if (getShop(id)) {
      const { ShopWindow } = await import("./shop-window.ts");
      return ShopWindow.open(id);
    }
    // First visit: the GM puts the shop's stock up.
    game.socket.emit(SOCKET, { kind: "townShop", sceneId, shop: place.shop, userId: game.user.id });
    if (game.users.activeGM?.isSelf) openShopForPlayers(t.shops[place.shop]!, [game.user.id]);
    return;
  }
  const { TownWindow } = await import("./town-window.ts");
  TownWindow.open(sceneId, placeIndex, tokenId);
}

// --- Buying services ------------------------------------------------------------------------------

export type TownRequest =
  | { op: "room" | "round"; sceneId: string; payerUuid: string; userId: string; people: number }
  | { op: "rumor"; sceneId: string; userId: string; who: string }
  | { op: "service"; sceneId: string; payerUuid: string; userId: string; service: string; targetUuid: string; condition?: string }
  | { op: "work"; sceneId: string; userId: string; who: string };

export function townRequest(msg: TownRequest) {
  game.socket.emit(SOCKET, { kind: "townOp", ...msg });
  if (game.users.activeGM?.isSelf) resolveTown(msg);
}

const say = (content: string, whisper?: string[]) => ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content, ...(whisper ? { whisper } : {}) });
const gmIds = () => game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
const noCoins = (): Coins => ({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });

/** Take `gp` from an actor the user owns; false (and a word to them) if they can't pay. */
async function charge(payerUuid: string, userId: string, gp: number, what: string): Promise<any | null> {
  const payer = await fromUuid(payerUuid);
  const user = game.users.get(userId);
  if (!payer || !user || !payer.testUserPermission(user, "OWNER")) return null;
  const purse = payFrom({ ...noCoins(), ...payer.system.currency }, gp);
  if (!purse) {
    await say(`<p>${esc(payer.name)} can't afford ${esc(what)} (${gp} gp).</p>`, [userId]);
    return null;
  }
  await payer.update({ "system.currency": purse });
  return payer;
}

export const keeperAttitude = (name: string) => getCampaign().npcs.find((n) => n.name === name)?.attitude ?? 0;

async function resolveTown(msg: TownRequest) {
  const scene = game.scenes.get(msg.sceneId);
  const t = sceneTown(scene);
  if (!t) return;
  const inn = t.inn;
  switch (msg.op) {
    case "room": {
      const gp = innNight(inn.roomGp, msg.people);
      const payer = await charge(msg.payerUuid, msg.userId, gp, "the rooms");
      if (!payer) return;
      await say(`<p><i class="fa-solid fa-bed"></i> <strong>${esc(payer.name)}</strong> pays ${esc(inn.keeper.name)} ${gp} gp for rooms at ${esc(inn.name)} tonight. A safe, warm long rest.</p>`);
      await logSession({ kind: "note", text: `Stayed at ${inn.name} (${gp} gp)` });
      return;
    }
    case "round": {
      const gp = innRound(msg.people);
      const payer = await charge(msg.payerUuid, msg.userId, gp, "a round");
      if (!payer) return;
      await say(`<p><i class="fa-solid fa-beer-mug-empty"></i> <strong>${esc(payer.name)}</strong> buys a round of ${esc(inn.specialty)} for the house. Tongues loosen.</p>`);
      // A round always buys a rumor.
      return resolveTown({ op: "rumor", sceneId: msg.sceneId, userId: msg.userId, who: payer.name });
    }
    case "rumor": {
      const told: number[] = scene.getFlag(MODULE_ID, "rumorsTold") ?? [];
      const r = nextRumor(t.rumors, told);
      if (!r) return;
      await scene.setFlag(MODULE_ID, "rumorsTold", [...told, r.index]);
      await say(`<p><i class="fa-solid fa-ear-listen"></i> ${esc(inn.keeper.name)} leans in to ${esc(msg.who)}: <em>"${esc(r.text)}"</em></p>`);
      return;
    }
    case "work": {
      await say(`<p><i class="fa-solid fa-landmark"></i> ${esc(msg.who)} asks ${esc(t.leader.name)} about work. <em>${esc(t.trouble.text)}</em></p>`);
      await say(`<p>${esc(msg.who)} asked about the trouble in ${esc(t.name)}. To build it out: Side Quest tab, quest type <strong>${esc(t.trouble.archetype)}</strong> (or the Settlement tab's trouble button).</p>`, gmIds());
      return;
    }
    case "service": {
      const s = TEMPLE_SERVICES.find((x) => x.id === msg.service);
      const target = await fromUuid(msg.targetUuid);
      if (!s || !target) return;
      const gp = servicePrice(s, t.size, keeperAttitude(t.temple.priest.name));
      const payer = await charge(msg.payerUuid, msg.userId, gp, s.name);
      if (!payer) return;
      let result = "";
      if (s.effect === "heal" && s.formula) {
        const Roll = foundry.dice?.Roll ?? (globalThis as any).Roll;
        const roll = await new Roll(s.formula).evaluate();
        await roll.toMessage({ flavor: `${s.name} for ${target.name}` });
        await target.applyDamage?.([{ value: roll.total, type: "healing" }]);
        result = `${target.name} is healed for ${roll.total}.`;
      } else if (s.effect === "condition") {
        const lift = msg.condition && s.conditions?.includes(msg.condition) ? [msg.condition] : (s.conditions ?? []).filter((c) => target.statuses?.has(c));
        for (const c of lift) await target.toggleStatusEffect?.(c, { active: false });
        result = lift.length ? `${target.name} is no longer ${lift.join(" or ")}.` : `${target.name} feels cleansed.`;
      } else if (s.effect === "exhaustion") {
        const ex = Number(target.system?.attributes?.exhaustion ?? 0);
        if (ex > 0) await target.update({ "system.attributes.exhaustion": ex - 1 });
        result = ex > 0 ? `${target.name}'s exhaustion eases (level ${ex - 1}).` : `${target.name} is restored.`;
      } else {
        result = `The rite is done; the GM tells what happens.`;
        await say(`<p>${esc(payer.name)} paid for <strong>${esc(s.name)}</strong> on ${esc(target.name)} at the temple of ${esc(t.temple.deity)}. Resolve it by hand.</p>`, gmIds());
      }
      await say(`<p><i class="fa-solid fa-hands-praying"></i> ${esc(t.temple.priest.name)} performs <strong>${esc(s.name)}</strong> for ${esc(target.name)} (${gp} gp, paid by ${esc(payer.name)}). ${esc(result)}</p>`);
      await logSession({ kind: "note", text: `${s.name} for ${target.name} at the temple (${gp} gp)` });
      return;
    }
  }
}

export function initTowns() {
  game.socket.on(SOCKET, (msg: any) => {
    if (!game.users.activeGM?.isSelf) return;
    if (msg?.kind === "townOp") resolveTown(msg);
    if (msg?.kind === "townShop") {
      const t = sceneTown(game.scenes.get(msg.sceneId));
      const shop = t?.shops[msg.shop];
      if (shop) openShopForPlayers(shop, [msg.userId], { showGm: false });
    }
  });
}
