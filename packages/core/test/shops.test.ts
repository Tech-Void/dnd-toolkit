import { describe, expect, it } from "vitest";
import { formatPrice, generateShop, roundPrice, SHOP_TYPES, type ShopType } from "../src/index.ts";

describe("prices", () => {
  it("formats and rounds like a merchant", () => {
    expect(formatPrice(12.5)).toBe("12 gp 5 sp");
    expect(formatPrice(0.01)).toBe("1 cp");
    expect(formatPrice(1500)).toBe("1,500 gp");
    expect(roundPrice(0.56)).toBe(0.6);
    expect(roundPrice(13.4)).toBe(13);
    expect(roundPrice(1234)).toBe(1235);
  });
});

describe("generateShop", () => {
  it("is reproducible", () => {
    expect(generateShop({ type: "blacksmith", seed: "s" })).toEqual(generateShop({ type: "blacksmith", seed: "s" }));
  });

  it("stocks only the shop's categories", () => {
    for (const type of Object.keys(SHOP_TYPES) as ShopType[]) {
      const def = SHOP_TYPES[type];
      const shop = generateShop({ type, settlement: "metropolis", seed: type });
      for (const e of shop.stock) {
        expect(e.item.rarity ? def.magic : def.mundane).toContain(e.item.category);
        expect(e.priceGp).toBeGreaterThan(0);
        expect(e.quantity).toBeGreaterThan(0);
      }
    }
  });

  it("respects settlement and shop rarity caps", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateShop({ type: "magic", settlement: "hamlet", seed: `h${i}` }).stock.every((e) => e.item.rarity === "common")).toBe(true);
      expect(generateShop({ type: "general", settlement: "metropolis", seed: `g${i}` }).stock.every((e) => !e.item.rarity || e.item.rarity === "common" || e.item.rarity === "uncommon")).toBe(true);
    }
  });

  it("includes staples when available", () => {
    const shop = generateShop({ type: "general", seed: "staples" });
    expect(shop.stock.some((e) => /ration/i.test(e.item.name))).toBe(true);
    expect(shop.stock.some((e) => /rope/i.test(e.item.name))).toBe(true);
  });
});
