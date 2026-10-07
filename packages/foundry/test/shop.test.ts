import { describe, expect, it } from "vitest";
import { categoryOf, itemKey, shopItemsFrom } from "../src/importers/shop.ts";
import { itemFamily } from "../src/catalog.ts";

describe("itemKey", () => {
  it("matches DDB and SRD spellings of the same item", () => {
    expect(itemKey("Poison, Basic (vial)")).toBe(itemKey("Basic Poison"));
    expect(itemKey("Flask of Holy Water")).toBe(itemKey("Holy Water (flask)"));
    expect(itemKey("Truth Serum (Ingested)")).toBe(itemKey("Truth Serum"));
    expect(itemKey("Blowgun Needles")).toBe(itemKey("Blowgun Needle"));
    expect(itemKey("Rope, Hempen (50 feet)")).toBe(itemKey("Hempen Rope (50 feet)"));
  });

  it("keeps numeric qualifiers distinct", () => {
    expect(itemKey("Spell Scroll (1st Level)")).not.toBe(itemKey("Spell Scroll (2nd Level)"));
  });
});

describe("categoryOf", () => {
  it("maps dnd5e 3.x item types", () => {
    expect(categoryOf("weapon", "martialR", false)).toBe("weapon-ranged");
    expect(categoryOf("weapon", "simpleM", false)).toBe("weapon-melee");
    expect(categoryOf("equipment", "heavy", false)).toBe("armor-heavy");
    expect(categoryOf("equipment", "trinket", true)).toBe("wondrous");
    expect(categoryOf("consumable", "ammo", false)).toBe("ammo");
    expect(categoryOf("tool", "music", false)).toBe("instrument");
    expect(categoryOf("loot", "gem", false)).toBe("gem");
  });
});

describe("shopItemsFrom", () => {
  const item = (name: string, type: string, sub: string, price: number, rarity = "") =>
    ({ name, type, uuid: `Item.${name}`, system: { rarity, price: { value: price, denomination: "gp" }, type: { value: sub } } });

  it("dedupes spellings, keeping the first, and drops unsellable things", () => {
    const out = shopItemsFrom([
      item("Poison, Basic (vial)", "consumable", "poison", 100),
      item("Basic Poison", "consumable", "poison", 100),
      item("Pistol", "weapon", "martialR", 250),
      item("Cart", "loot", "gear", 15),
      item("Vestments", "equipment", "clothing", 0),
      item("Deck of Many Things", "equipment", "trinket", 0, "artifact"),
      item("Cloak of Protection", "equipment", "trinket", 0, "uncommon"),
    ], itemFamily);
    expect(out.map((i) => i.name)).toEqual(["Poison, Basic (vial)", "Cloak of Protection"]);
    expect(out[1]).toMatchObject({ category: "wondrous", rarity: "uncommon", uuid: "Item.Cloak of Protection" });
  });
});
