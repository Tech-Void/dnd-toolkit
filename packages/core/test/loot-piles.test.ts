import { describe, expect, it } from "vitest";
import { containerChoices, generateLoot, harvest, lootLine, makePile, takeFromPile, trapRolls, tryContainer, type LootResult } from "../src/index.ts";

const loot = (patch: Partial<LootResult> = {}): LootResult => ({
  ...generateLoot({ cr: 3, mode: "hoard", seed: "piles", extras: false }),
  coins: { cp: 0, sp: 5, ep: 0, gp: 34, pp: 0 },
  items: [
    { name: "Potion of healing", kind: "consumable", quantity: 1, valueGp: 50 },
    { name: "Wolf pelt", kind: "part", quantity: 2, valueGp: 4, harvest: { skill: "sur", dc: 11 }, note: "Harvest: DC 11 Survival check, 10 minutes. Sells to tanners." },
  ],
  container: undefined,
  ...patch,
});

describe("loot piles", () => {
  it("takes everything but the parts, and harvests parts with a check", () => {
    const p = makePile(loot(), { id: "a", kind: "body" });
    expect(p.open).toBe(true);
    expect(lootLine(p.loot)).toBe("34 gp, 5 sp, Potion of healing, 2× Wolf pelt");
    const { taken, pile } = takeFromPile(p, "all", true);
    expect(taken.items.map((i) => i.name)).toEqual(["Potion of healing"]);
    expect(taken.coins.gp).toBe(34);
    expect(pile.loot.items.map((i) => i.name)).toEqual(["Wolf pelt"]);
    const fail = harvest(pile, 0, 8);
    expect(fail.ok).toBe(false);
    expect(fail.pile.loot.items).toEqual([]);
    const ok = harvest(pile, 0, 12);
    expect(ok.item?.harvest).toBeUndefined();
    expect(ok.item?.note).toBe("Sells to tanners.");
  });

  it("hidden piles give nothing until found", () => {
    const p = makePile(loot(), { id: "b", kind: "cache", hidden: true, searchDc: 15 });
    expect(takeFromPile(p, "all", true).taken.items).toEqual([]);
  });

  it("locked, trapped chests: pick, inspect, disarm, open", () => {
    let p = makePile(loot({ container: { name: "iron-bound chest", lockDc: 15, trap: "Poison needle. A needle in the lock: 1 piercing damage and a DC 13 Constitution save or 2d10 poison damage.", trapDc: 13 } }), { id: "c", kind: "treasure" });
    expect(p.name).toBe("Iron-bound chest");
    expect(containerChoices(p)).toEqual(["pick", "force", "inspect"]);
    expect(tryContainer(p, "open").outcome).toBe("stillLocked");
    expect(tryContainer(p, "pick", 10).noisy).toBe(true);
    p = tryContainer(p, "pick", 16).pile;
    expect(containerChoices(p)).toEqual(["open", "inspect"]);
    p = tryContainer(p, "inspect", 14).pile;
    expect(p.container!.trap!.state).toBe("found");
    expect(containerChoices(p)).toEqual(["open", "disarm"]);
    p = tryContainer(p, "disarm", 13).pile;
    const r = tryContainer(p, "open");
    expect(r.outcome).toBe("opened");
    expect(r.pile.open).toBe(true);
  });

  it("opening an armed chest springs it, forcing a bad disarm too", () => {
    const p = makePile(loot({ container: { name: "chest", trap: "Spring blade. A blade snaps out: +7 to hit, 4d10 slashing damage.", trapDc: 14 } }), { id: "d", kind: "treasure" });
    const r = tryContainer(p, "open");
    expect(r.sprung).toBe(true);
    expect(r.pile.open).toBe(true);
    expect(trapRolls(p.container!.trap!.text)).toEqual({ attack: 7, damage: { formula: "4d10", type: "slashing" }, save: undefined });
  });

  it("a mimic bites whoever touches it", () => {
    const p = makePile(loot({ container: { name: "chest", lockDc: 12, trap: "Mimic. The chest is a mimic. Roll initiative.", trapDc: 12 } }), { id: "e", kind: "treasure" });
    expect(p.container!.mimic).toBe(true);
    expect(p.container!.locked).toBe(false);
    expect(tryContainer(p, "open").outcome).toBe("mimic");
    expect(tryContainer(p, "inspect", 16).outcome).toBe("mimicFound");
  });

  it("parses saves out of trap text", () => {
    expect(trapRolls("DC 13 Constitution save or 2d10 poison damage")).toEqual({ save: { ability: "con", dc: 13 }, damage: { formula: "2d10", type: "poison" }, attack: undefined });
  });
});
