import { describe, expect, it } from "vitest";
import { BASE_WEAPONS, forgedSubtitle, forgeItem, forgeItems, generateLoot, RARITIES, type ForgeKind } from "../src/index.ts";

describe("forgeItem", () => {
  it("is reproducible", () => {
    expect(forgeItem({ seed: "same" })).toEqual(forgeItem({ seed: "same" }));
  });

  it("honors kind, rarity, theme and base", () => {
    const sword = forgeItem({ kind: "weapon", rarity: "rare", theme: "fire", base: "longsword", seed: "s" });
    expect(sword).toMatchObject({ kind: "weapon", itemType: "weapon", base: "Longsword", rarity: "rare", theme: "fire", bonus: 2 });
    expect(sword.damage).toEqual([{ formula: "1d6", type: "fire" }]);
    expect(forgedSubtitle(sword)).toMatch(/^Weapon \(longsword\), rare/);

    const ring = forgeItem({ kind: "wondrous", base: "ring", rarity: "uncommon", seed: "r" });
    expect(ring).toMatchObject({ base: "Ring", itemType: "equipment" });
    expect(ring.properties.length).toBeGreaterThan(0);
  });

  it("scales with rarity", () => {
    const bonus = RARITIES.map((rarity) => forgeItem({ kind: "weapon", rarity, seed: "scale" }).bonus);
    expect(bonus).toEqual([0, 1, 2, 3, 3]);
    const dcs = RARITIES.slice(1).map((rarity) => forgeItem({ kind: "wand", rarity, seed: "w" }).power!.save!.dc);
    expect(dcs).toEqual([13, 15, 17, 19]);
  });

  it("gives every kind real mechanics and sensible attunement", () => {
    for (const kind of ["weapon", "armor", "wondrous", "wand", "relic"] as ForgeKind[]) {
      for (let i = 0; i < 25; i++) {
        const it = forgeItem({ kind, rarity: kind === "relic" ? undefined : "rare", seed: `${kind}${i}` });
        expect(it.name.length).toBeGreaterThan(3);
        expect(it.properties.length).toBeGreaterThan(0);
        if (it.effects.length || it.power) expect(it.attunement).toBe(true);
        for (const e of it.effects) expect(e.key).toMatch(/^system\./);
        if (kind === "wand") expect(it.power?.charges).toBeGreaterThan(0);
        if (kind === "relic") {
          expect(it.rarity).toBe("legendary");
          expect(it.history && it.drawback).toBeTruthy();
          expect(it.power).toBeDefined();
        }
        if (it.itemType === "weapon") expect(BASE_WEAPONS.map(([n]) => n)).toContain(it.base);
      }
    }
  });

  it("forges batches with distinct items", () => {
    const hoard = forgeItems(8, { seed: "hoard", partyLevel: 12 });
    expect(hoard).toHaveLength(8);
    expect(new Set(hoard.map((i) => i.name)).size).toBeGreaterThan(5);
  });
});

describe("forged loot", () => {
  it("swaps a hoard's magic items for unique forged ones of the same rarity", () => {
    let magic = 0;
    for (let i = 0; i < 20; i++) {
      const loot = generateLoot({ cr: 12, mode: "hoard", forge: true, seed: `fl${i}` });
      for (const item of loot.items.filter((it) => it.kind === "magic")) {
        magic++;
        expect(item.forged).toBeDefined();
        expect(item.forged!.rarity).toBe(item.rarity);
        expect(item.name).toBe(item.forged!.name);
      }
    }
    expect(magic).toBeGreaterThan(10);
  });
});
