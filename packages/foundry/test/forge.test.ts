import { beforeAll, describe, expect, it } from "vitest";
import { forgeItem } from "@dnd-toolkit/core";
import { forgedItemData } from "../src/importers/forge.ts";

beforeAll(() => {
  // Just enough Foundry: a dnd5e world with no item compendiums, so items are built from scratch.
  Object.assign(globalThis, {
    game: { system: { id: "dnd5e" }, packs: [] },
    CONST: { ACTIVE_EFFECT_MODES: { ADD: 2, UPGRADE: 4, OVERRIDE: 5 } },
  });
});

describe("forgedItemData", () => {
  it("builds a magic weapon with bonus, extra damage and attunement", async () => {
    const it = forgeItem({ kind: "weapon", rarity: "very rare", theme: "cold", base: "Greataxe", seed: "axe" });
    const data = await forgedItemData(it);
    expect(data).toMatchObject({ name: it.name, type: "weapon" });
    expect(data.system).toMatchObject({ magicalBonus: 3, rarity: "veryRare", attunement: "required", price: { value: it.valueGp, denomination: "gp" } });
    expect(data.system.properties).toContain("mgc");
    expect(data.system.damage.parts).toContainEqual(["2d6", "cold"]);
  });

  it("builds a wand that rolls its power: charges, save DC, damage and area", async () => {
    const it = forgeItem({ kind: "wand", base: "wand", rarity: "rare", theme: "fire", seed: "wand" });
    const { system } = await forgedItemData(it);
    expect(system.type).toEqual({ value: "wand" });
    expect(system.uses).toMatchObject({ value: 5, max: "5", per: "dawn", recovery: "1d4+1" });
    expect(system.actionType).toBe("save");
    expect(system.save).toEqual({ ability: "dex", dc: 15, scaling: "flat" });
    expect(system.damage.parts).toEqual([["5d6", "fire"]]);
    expect(system.target).toMatchObject({ value: 15, units: "ft", type: "cone" });
  });

  it("turns worn properties into Active Effects and armor into real AC", async () => {
    const ring = forgeItem({ kind: "wondrous", base: "ring", rarity: "rare", seed: "ring" });
    const data = await forgedItemData(ring);
    expect(data.system.type).toEqual({ value: "trinket" });
    expect(data.effects).toHaveLength(ring.effects.length);
    for (const e of data.effects) {
      expect(e.transfer).toBe(true);
      expect(e.changes[0].key).toMatch(/^system\./);
      expect([2, 4, 5]).toContain(e.changes[0].mode);
    }
    const plate = await forgedItemData(forgeItem({ kind: "armor", base: "Plate Armor", rarity: "uncommon", seed: "plate" }));
    expect(plate.system).toMatchObject({ type: { value: "heavy" }, armor: { value: 18, dex: 0, magicalBonus: 1 } });
  });
});
