import { describe, expect, it } from "vitest";
import { normalizeText, parsedFacts, parseText } from "../src/index.ts";

// Samples are SRD 5.1 text (CC-BY-4.0), laid out the way it pastes from a PDF, the 2024 rules
// and D&D Beyond.

const FIREBALL = `Fireball
3rd-level evocation
Casting Time: 1 action
Range: 150 feet
Components: V, S, M (a tiny ball of bat guano and sulfur)
Duration: Instantaneous
A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.
The fire spreads around corners. It ignites flammable objects in the area that aren't being worn or carried.
At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.`;

const FIREBALL_2024 = `Fireball
Level 3 Evocation (Sorcerer, Wizard)
Casting Time: Action
Range: 150 feet
Components: V, S, M (a ball of bat guano and sulfur)
Duration: Instantaneous
A bright streak flashes from you to a point you choose within range and then blossoms with a low roar into a fiery explosion. Each creature in a 20-foot-radius Sphere centered on that point makes a Dexterity saving throw, taking 8d6 Fire damage on a failed save or half as much damage on a successful one.
Using a Higher-Level Spell Slot. The damage increases by 1d6 for each spell slot level above 3.`;

const FIREBALL_DDB = `Fireball
Level
3rd
Casting Time
1 Action
Range/Area
150 ft. (20 ft. )
Components
V, S, M *
Duration
Instantaneous
School
Evocation
Attack/Save
DEX Save
Damage/Effect
Fire
A bright streak flashes from your pointing finger to a point you choose within range and then blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-radius sphere centered on that point must make a Dexterity saving throw. A target takes 8d6 fire damage on a failed save, or half as much damage on a successful one.
At Higher Levels. When you cast this spell using a spell slot of 4th level or higher, the damage increases by 1d6 for each slot level above 3rd.`;

const CURE_WOUNDS = `Cure Wounds
1st-level evocation
Casting Time: 1 action
Range: Touch
Components: V, S
Duration: Instantaneous
A creature you touch regains a number of hit points equal to 1d8 + your spellcasting ability modifier. This spell has no effect on undead or constructs.
At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d8 for each slot level above 1st.`;

const FIRE_BOLT = `Fire Bolt
Evocation cantrip
Casting Time: 1 action
Range: 120 feet
Components: V, S
Duration: Instantaneous
You hurl a mote of fire at a creature or object within range. Make a ranged spell attack against the target. On a hit, the target takes 1d10 fire damage. A flammable object hit by this spell ignites if it isn't being worn or carried.
This spell's damage increases by 1d10 when you reach 5th level (2d10), 11th level (3d10), and 17th level (4d10).`;

const HOLD_PERSON = `Hold Person
2nd-level enchantment
Casting Time: 1 action
Range: 60 feet
Components: V, S, M (a small, straight piece of
iron)
Duration: Concentration, up to 1 minute
Choose a humanoid that you can see within range. The target must succeed on a Wisdom saving throw or be paralyzed for the duration.`;

const FLAME_TONGUE = `Flame Tongue
Weapon (any sword), rare (requires attunement)
You can use a bonus action to speak this magic sword's command word, causing flames to erupt from the blade. These flames shed bright light in a 40-foot radius and dim light for an additional 40 feet. While the sword is ablaze, it deals an extra 2d6 fire damage to any target it hits.`;

const CLOAK = `Cloak of Protection
Wondrous item, uncommon (requires attunement)
You gain a +1 bonus to AC and saving throws while you wear this cloak.`;

const WAND = `Wand of Lightning Bolts
Wand, rare (requires attunement by a spellcaster)
This wand has 7 charges. While holding it, you can use an action to expend 1 or more of its charges to cast the lightning bolt spell (save DC 15) from it.
The wand regains 1d6 + 1 expended charges daily at dawn. If you expend the wand's last charge, roll a d20. On a 1, the wand crumbles into ashes and is destroyed.`;

const POTION = `Potion of Healing
Potion, common
You regain 2d4 + 2 hit points when you drink this potion.`;

const GOBLIN_ACTIONS = `Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

const DRAGON = `Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.
Fire Breath (Recharge 5-6). The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.`;

describe("normalizeText", () => {
  it("cleans PDF copy damage", () => {
    expect(normalizeText("dam-\nage – it’s fiﬁne")).toEqual(["damage - it's fifine"]);
  });
});

describe("spells", () => {
  for (const [label, text] of [["2014", FIREBALL], ["2024", FIREBALL_2024], ["D&D Beyond", FIREBALL_DDB]] as const) {
    it(`reads Fireball (${label} layout)`, () => {
      const [e] = parseText(text);
      expect(e).toMatchObject({
        kind: "spell",
        name: "Fireball",
        activation: { type: "action", cost: 1 },
        range: { value: 150, units: "ft" },
        target: { value: 20, type: "sphere", units: "ft" },
        duration: { units: "inst" },
        actionType: "save",
        save: { ability: "dex" },
        damage: [["8d6", "fire"]],
        spell: { level: 3, school: "evo", scaling: { mode: "level", formula: "1d6" } },
      });
      expect(e!.spell!.components).toMatchObject({ v: true, s: true, m: true });
      // Stat lines don't leak into the description.
      expect(e!.paragraphs.join(" ")).not.toMatch(/Casting Time|Components/);
      expect(e!.paragraphs[0]).toMatch(/^A bright streak/);
    });
  }

  it("reads healing with the casting modifier and its upcast", () => {
    const [e] = parseText(CURE_WOUNDS);
    expect(e).toMatchObject({ actionType: "heal", damage: [["1d8 + @mod", "healing"]], range: { units: "touch" }, spell: { level: 1, scaling: { mode: "level", formula: "1d8" } } });
  });

  it("reads cantrip attacks and cantrip scaling", () => {
    const [e] = parseText(FIRE_BOLT);
    expect(e).toMatchObject({ actionType: "rsak", damage: [["1d10", "fire"]], spell: { level: 0, school: "evo", scaling: { mode: "cantrip", formula: "1d10" } } });
  });

  it("reads concentration, durations and wrapped material lines", () => {
    const [e] = parseText(HOLD_PERSON);
    expect(e).toMatchObject({ concentration: true, duration: { value: 1, units: "minute" }, actionType: "save", save: { ability: "wis" } });
    expect(e!.spell!.components.material).toBe("a small, straight piece of iron");
    expect(e!.warnings).toEqual([]);
  });
});

describe("buff spells (D&D Beyond layout, no Damage/Effect value)", () => {
  // Written for this test: same shape as a D&D Beyond copy where the description follows Damage/Effect.
  const STEADY_HAND = `Steady Hand
Level
1st
Casting Time
1 Action
Range/Area
30 ft.
Components
V, S
Duration
1 Minute
School
Enchantment
Attack/Save
None
Damage/Effect
You steady the aim of up to three creatures within range. Each target gains a +1 bonus to attack rolls it makes with Ranged weapons, and a +2 bonus to AC, for the duration.

Using a Higher-Level Spell Slot. You can target one additional creature for each slot level above 1.`;

  it("keeps the description, the range and the buff", () => {
    const [e] = parseText(STEADY_HAND);
    expect(e).toMatchObject({ name: "Steady Hand", target: { value: 3, type: "creature" }, range: { value: 30, units: "ft" }, duration: { value: 1, units: "minute" }, actionType: "util", spell: { level: 1, school: "enc" } });
    expect(e!.paragraphs[0]).toMatch(/^You steady the aim/);
    expect(e!.paragraphs.join(" ")).not.toMatch(/30 ft\.|Enchantment|None/);
    expect(e!.targetEffects).toEqual([
      { label: "Attack bonus", key: "system.bonuses.rwak.attack", mode: "add", value: "+1" },
      { label: "AC bonus", key: "system.attributes.ac.bonus", mode: "add", value: "+2" },
    ]);
    expect(e!.warnings.join(" ")).toMatch(/adds targets/);
  });

  it("still takes a short Damage/Effect value when there is one", () => {
    const [e] = parseText(FIREBALL_DDB);
    expect(e!.paragraphs[0]).toMatch(/^A bright streak/);
    expect(e!.paragraphs.join(" ")).not.toMatch(/^Fire\b/);
  });
});

describe("magic items", () => {
  it("reads weapons: base, rarity, attunement and extra damage", () => {
    const [e] = parseText(FLAME_TONGUE);
    expect(e).toMatchObject({ kind: "item", name: "Flame Tongue", damage: [["2d6", "fire"]], item: { itemType: "weapon", base: "Longsword", rarity: "rare", attunement: true } });
  });

  it("turns worn bonuses into effects", () => {
    const [e] = parseText(CLOAK);
    expect(e!.item).toMatchObject({ itemType: "equipment", subtype: "clothing", rarity: "uncommon", attunement: true });
    expect(e!.item!.effects.map((f) => f.key)).toEqual(["system.attributes.ac.bonus", "system.bonuses.abilities.save"]);
  });

  it("reads charges, dawn recovery and spell casting", () => {
    const [e] = parseText(WAND);
    expect(e!.item).toMatchObject({ itemType: "consumable", subtype: "wand", rarity: "rare", attunement: true });
    expect(e!.uses).toEqual({ max: 7, per: "dawn", recovery: "1d6+1" });
    expect(e!.warnings.join(" ")).toMatch(/lightning bolt/);
  });

  it("reads potions as healing consumables", () => {
    const [e] = parseText(POTION);
    expect(e).toMatchObject({ actionType: "heal", damage: [["2d4 + 2", "healing"]], item: { itemType: "consumable", subtype: "potion", rarity: "common" } });
  });
});

describe("monster actions", () => {
  it("splits a statblock's actions and reads attacks", () => {
    const [scimitar, shortbow] = parseText(GOBLIN_ACTIONS);
    expect(scimitar).toMatchObject({ name: "Scimitar", kind: "action", actionType: "mwak", attackBonus: 4, range: { value: 5, units: "ft" }, damage: [["1d6 + 2", "slashing"]] });
    expect(shortbow).toMatchObject({ name: "Shortbow", actionType: "rwak", attackBonus: 4, range: { value: 80, long: 320 }, damage: [["1d6 + 2", "piercing"]] });
  });

  it("reads riders, breath weapons and recharge", () => {
    const [bite, breath] = parseText(DRAGON);
    expect(bite!.damage).toEqual([["2d10 + 8", "piercing"], ["2d6", "fire"]]);
    expect(breath).toMatchObject({ name: "Fire Breath", recharge: 5, actionType: "save", save: { ability: "dex", dc: 21 }, target: { value: 60, type: "cone" }, damage: [["18d6", "fire"]] });
  });

  it("reads 2024 attack lines, per-day uses and bonus actions", () => {
    const [a, b, c] = parseText(`Scimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage.
Spit Venom (3/Day). The cobra spits at a creature it can see within 30 feet. The target makes a DC 12 Constitution saving throw, taking 10 (3d6) Poison damage on a failed save.
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.`);
    expect(a).toMatchObject({ actionType: "mwak", attackBonus: 4, damage: [["1d6 + 2", "slashing"]] });
    expect(b).toMatchObject({ uses: { max: 3, per: "day" }, save: { ability: "con", dc: 12 }, damage: [["3d6", "poison"]] });
    expect(c).toMatchObject({ kind: "feature", activation: { type: "bonus" } });
  });
});

describe("parsedFacts", () => {
  it("summarizes what was found", () => {
    const facts = Object.fromEntries(parsedFacts(parseText(FIREBALL)[0]!));
    expect(facts).toMatchObject({ Spell: "Level 3 evocation", Area: "20-ft sphere", Save: "spell DC Dexterity", Damage: "8d6 fire" });
  });
});
