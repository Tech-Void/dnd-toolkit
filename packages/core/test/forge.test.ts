import { describe, expect, it } from "vitest";
import { BASE_WEAPONS, curseItem, disguisedItem, liftCurse, blankItem, blankPower, effectText, EFFECT_CATALOG, forgedProperties, powerText, forgedSubtitle, forgeItem, forgeItems, generateLoot, RARITIES, type ForgeKind } from "../src/index.ts";

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
    expect(forgedProperties(ring).length).toBeGreaterThan(0);
  });

  it("scales with rarity", () => {
    const bonus = RARITIES.map((rarity) => forgeItem({ kind: "weapon", rarity, seed: "scale" }).bonus);
    expect(bonus).toEqual([0, 1, 2, 3, 3]);
    const dcs = RARITIES.slice(1).map((rarity) => blankPower("blast", rarity, "fire").save!.dc);
    expect(dcs).toEqual([13, 15, 17, 19]);
    const dice = RARITIES.slice(1).map((rarity) => blankPower("blast", rarity, "fire").damage!.formula);
    expect(dice).toEqual(["3d6", "5d6", "7d6", "9d6"]);
  });

  it("gives every kind real mechanics and sensible attunement", () => {
    for (const kind of ["weapon", "armor", "wondrous", "wand", "relic"] as ForgeKind[]) {
      for (let i = 0; i < 25; i++) {
        const it = forgeItem({ kind, rarity: kind === "relic" ? undefined : "rare", seed: `${kind}${i}` });
        expect(it.name.length).toBeGreaterThan(3);
        expect(forgedProperties(it).length).toBeGreaterThan(0);
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

describe("forge variety and text", () => {
  it("rolls every kind of power and weapon property across seeds", () => {
    const powers = new Set<string>();
    const props = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const wand = forgeItem({ kind: "wand", rarity: "rare", seed: `p${i}` });
      powers.add(wand.power!.kind);
      const blade = forgeItem({ kind: "weapon", rarity: "very rare", seed: `w${i}` });
      if (blade.critThreshold) props.add("keen");
      if (blade.critDamage) props.add("vicious");
      if (blade.bane) props.add("bane");
    }
    expect([...powers].sort()).toEqual(["blast", "bolt", "heal", "utility"]);
    expect([...props].sort()).toEqual(["bane", "keen", "vicious"]);
  });

  it("curses when asked, and never by default", () => {
    expect(Array.from({ length: 30 }, (_, i) => forgeItem({ seed: `c${i}`, rarity: "rare" })).some((it) => it.cursed)).toBe(false);
    const cursed = forgeItem({ kind: "wondrous", rarity: "rare", curse: "always", seed: "curse" });
    expect(cursed.cursed).toBe(true);
    expect(cursed.attunement).toBe(true);
    expect(forgedSubtitle(cursed)).toMatch(/cursed$/);
  });

  it("describes every catalog effect and power in words", () => {
    for (const t of EFFECT_CATALOG) {
      const text = effectText({ label: t.label, key: t.key, mode: t.mode, value: t.sample });
      expect(text).toMatch(/\.$/);
      expect(text).not.toMatch(/system\./);
    }
    for (const kind of ["blast", "bolt", "heal", "utility"] as const) {
      expect(powerText(blankPower(kind, "rare", "cold"))).toMatch(/charges/);
    }
  });

  it("re-describes an item from its numbers after editing", () => {
    const it = blankItem("weapon");
    it.bonus = 2;
    it.critThreshold = 19;
    it.effects.push({ label: "Fire", key: "system.traits.dr.value", mode: "add", value: "fire" });
    expect(forgedProperties(it)).toEqual([
      "You gain a +2 bonus to attack and damage rolls made with this magic weapon.",
      "Attacks with it score a critical hit on a roll of 19 or 20.",
      "You have resistance to fire damage.",
    ]);
  });
});

describe("curses", () => {
  it("curses, recurses and lifts without touching the rest of the item", () => {
    const base = forgeItem({ kind: "wondrous", rarity: "rare", seed: "clean" });
    const cursed = curseItem(base, "c1");
    expect(cursed.cursed).toBe(true);
    expect(cursed.attunement).toBe(true);
    expect(cursed.notes.filter((n) => n.startsWith("Curse.")).length).toBe(1);
    // Rerolling swaps the curse rather than stacking them.
    const again = curseItem(cursed, "c2");
    expect(again.notes.filter((n) => n.startsWith("Curse.")).length).toBe(1);
    expect(again.effects.filter((e) => e.label.startsWith("Curse:")).length).toBeLessThanOrEqual(1);
    const lifted = liftCurse(again);
    expect(lifted).toMatchObject({ cursed: undefined, effects: base.effects, notes: base.notes });
  });

  it("disguises a cursed item as a harmless one", () => {
    const cursed = curseItem(forgeItem({ kind: "weapon", base: "Longsword", rarity: "rare", seed: "d" }), "x");
    const disguise = disguisedItem(cursed);
    expect(disguise.name).toBe("Fine Longsword");
    expect(disguise.properties.join(" ")).not.toMatch(/Curse|vulnerable|-1 bonus/);
  });

  it("can curse forged hoard loot", () => {
    const items = Array.from({ length: 10 }, (_, i) => generateLoot({ cr: 12, mode: "hoard", forge: true, curse: "always", seed: `cl${i}` }))
      .flatMap((l) => l.items.filter((it) => it.forged));
    expect(items.length).toBeGreaterThan(3);
    expect(items.every((it) => it.forged!.cursed || it.forged!.kind === "relic")).toBe(true);
  });
});

