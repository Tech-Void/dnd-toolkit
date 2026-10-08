import { beforeAll, describe, expect, it } from "vitest";
import { parseStatblock } from "@dnd-toolkit/core";
import { createStatblockActor } from "../src/importers/statblock.ts";

let created: any = null;
beforeAll(() => {
  // A dnd5e world with no compendiums; Actor.create just records what it was given.
  Object.assign(globalThis, {
    game: { system: { id: "dnd5e" }, packs: [], folders: { find: () => ({ id: "folder" }) } },
    CONST: { ACTIVE_EFFECT_MODES: { ADD: 2, UPGRADE: 4, OVERRIDE: 5 }, TOKEN_DISPOSITIONS: { HOSTILE: -1 } },
    Actor: { create: async (data: any) => (created = data) },
  });
});

const DRAGON = `Adult Red Dragon
Huge dragon, chaotic evil
Armor Class 19 (natural armor)
Hit Points 256 (19d12 + 133)
Speed 40 ft., climb 40 ft., fly 80 ft.
STR DEX CON INT WIS CHA
27 (+8) 10 (+0) 25 (+7) 16 (+3) 13 (+1) 21 (+5)
Saving Throws Dex +6, Con +13, Wis +7, Cha +11
Skills Perception +13, Stealth +6
Damage Immunities fire
Senses blindsight 60 ft., darkvision 120 ft., passive Perception 23
Languages Common, Draconic
Challenge 17 (18,000 XP)
Legendary Resistance (3/Day). If the dragon fails a saving throw, it can choose to succeed instead.
Actions
Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.
Fire Breath (Recharge 5-6). The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.
Legendary Actions
The dragon can take 3 legendary actions, choosing from the options below.
Wing Attack (Costs 2 Actions). The dragon beats its wings. Each creature within 10 feet of the dragon must succeed on a DC 22 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage and be knocked prone.`;

describe("createStatblockActor", () => {
  it("builds a complete dnd5e NPC", async () => {
    await createStatblockActor(parseStatblock(DRAGON));
    expect(created).toMatchObject({ name: "Adult Red Dragon", type: "npc", prototypeToken: { width: 3, height: 3, disposition: -1 } });
    const sys = created.system;
    expect(sys.abilities.str).toEqual({ value: 27, proficient: 0 });
    expect(sys.abilities.dex).toEqual({ value: 10, proficient: 1 });
    expect(sys.attributes).toMatchObject({ ac: { calc: "flat", flat: 19 }, hp: { value: 256, max: 256, formula: "19d12 + 133" }, movement: { walk: 40, climb: 40, fly: 80 }, senses: { darkvision: 120, blindsight: 60 } });
    expect(sys.details).toMatchObject({ cr: 17, type: { value: "dragon" }, alignment: "chaotic evil" });
    expect(sys.traits).toMatchObject({ size: "huge", di: { value: ["fire"] }, languages: { value: ["common", "draconic"] } });
    // CR 17 → proficiency +6: Perception +13 over Wis +1 is expertise, Stealth +6 over Dex +0 is proficiency.
    expect(sys.skills).toEqual({ prc: { value: 2 }, ste: { value: 1 } });
    expect(sys.resources).toEqual({ legact: { value: 3, max: 3 }, legres: { value: 3, max: 3 } });
  });

  it("turns every feature into an item with the right action type", async () => {
    await createStatblockActor(parseStatblock(DRAGON));
    const byName = Object.fromEntries(created.items.map((i: any) => [i.name, i]));
    expect(Object.keys(byName)).toEqual(["Legendary Resistance", "Bite", "Fire Breath", "Wing Attack"]);
    expect(byName.Bite).toMatchObject({ type: "weapon", system: { attack: { bonus: "14", flat: true } } });
    expect(byName["Fire Breath"].system).toMatchObject({ type: { value: "monster" }, recharge: { value: 5, charged: true }, save: { dc: 21 } });
    expect(byName["Wing Attack"].system.activation).toMatchObject({ type: "legendary", cost: 2 });
  });
});
