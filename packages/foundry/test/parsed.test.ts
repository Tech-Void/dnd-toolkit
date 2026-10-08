import { beforeAll, describe, expect, it } from "vitest";
import { parseText } from "@dnd-toolkit/core";
import { parsedItemData } from "../src/importers/parsed.ts";

beforeAll(() => {
  // A dnd5e world with no item compendiums, so everything is built from scratch.
  Object.assign(globalThis, {
    game: { system: { id: "dnd5e" }, packs: [] },
    CONST: { ACTIVE_EFFECT_MODES: { ADD: 2, UPGRADE: 4, OVERRIDE: 5 } },
  });
});

const build = async (text: string, i = 0) => parsedItemData(parseText(text)[i]!);

describe("parsedItemData", () => {
  it("builds a working dnd5e spell", async () => {
    const data = await build(`Fireball
3rd-level evocation
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (a tiny ball of bat guano and sulfur)
Duration: Instantaneous
Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.
At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.`);
    expect(data).toMatchObject({ name: "Fireball", type: "spell" });
    expect(data.system).toMatchObject({
      level: 3,
      school: "evo",
      properties: ["vocal", "somatic", "material"],
      materials: { value: "a tiny ball of bat guano and sulfur" },
      activation: { type: "action", cost: 1 },
      range: { value: 150, units: "ft" },
      target: { value: 20, units: "ft", type: "sphere" },
      duration: { units: "inst" },
      actionType: "save",
      save: { ability: "dex", dc: null, scaling: "spell" },
      damage: { parts: [["8d6", "fire"]] },
      scaling: { mode: "level", formula: "1d6" },
    });
  });

  it("builds monster attacks with a flat to-hit and breath weapons with recharge", async () => {
    const text = `Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.
Fire Breath (Recharge 5-6). The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.`;
    const bite = await build(text, 0);
    expect(bite).toMatchObject({ type: "weapon", system: { type: { value: "natural" }, attack: { bonus: "14", flat: true }, actionType: "mwak" } });
    expect(bite.system.damage.parts).toEqual([["2d10 + 8", "piercing"], ["2d6", "fire"]]);
    const breath = await build(text, 1);
    expect(breath).toMatchObject({ type: "feat", system: { recharge: { value: 5, charged: true }, save: { ability: "dex", dc: 21, scaling: "flat" }, target: { value: 60, type: "cone" } } });
  });

  it("builds magic items with rarity, attunement, charges and effects", async () => {
    const wand = await build(`Wand of Lightning Bolts
Wand, rare (requires attunement by a spellcaster)
This wand has 7 charges. The wand regains 1d6 + 1 expended charges daily at dawn.`);
    expect(wand).toMatchObject({ type: "consumable", system: { type: { value: "wand" }, rarity: "rare", attunement: "required", uses: { value: 7, max: "7", per: "dawn", recovery: "1d6+1" } } });
    const cloak = await build(`Cloak of Protection
Wondrous item, uncommon (requires attunement)
You gain a +1 bonus to AC and saving throws while you wear this cloak.`);
    expect(cloak.system).toMatchObject({ type: { value: "clothing" }, rarity: "uncommon", attunement: "required" });
    expect(cloak.effects.map((e: any) => e.changes[0])).toEqual([
      { key: "system.attributes.ac.bonus", mode: 2, value: "+1" },
      { key: "system.bonuses.abilities.save", mode: 2, value: "+1" },
    ]);
  });

  it("puts a spell's buff on it as an effect for its targets, lasting the spell's duration", async () => {
    const data = await build(`Steady Hand
1st-level enchantment
Casting Time: 1 action
Range: 30 feet
Components: V, S
Duration: Concentration, up to 10 minutes
Each target gains a +1 bonus to attack rolls it makes with ranged weapons.`);
    expect(data.effects).toEqual([expect.objectContaining({
      name: "Steady Hand",
      transfer: false,
      duration: { seconds: 600 },
      changes: [{ key: "system.bonuses.rwak.attack", mode: 2, value: "+1" }],
    })]);
    expect(data.system.properties).toContain("concentration");
  });
});
