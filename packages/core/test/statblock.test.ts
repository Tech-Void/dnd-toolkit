import { describe, expect, it } from "vitest";
import { looksLikeStatblock, parseStatblock } from "../src/index.ts";

// SRD 5.1 / 5.2 statblocks (CC-BY-4.0).

const GOBLIN = `Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 15 (leather armor, shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (-1) 14 (+2) 10 (+0) 10 (+0) 8 (-1) 8 (-1)
Skills Stealth +6
Senses darkvision 60 ft., passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.
Shortbow. Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.`;

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
Multiattack. The dragon can use its Frightful Presence. It then makes three attacks: one with its bite and two with its claws.
Bite. Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 7 (2d6) fire damage.
Claw. Melee Weapon Attack: +14 to hit, reach 5 ft., one target. Hit: 15 (2d6 + 8) slashing damage.
Fire Breath (Recharge 5-6). The dragon exhales fire in a 60-foot cone. Each creature in that area must make a DC 21 Dexterity saving throw, taking 63 (18d6) fire damage on a failed save, or half as much damage on a successful one.
Legendary Actions
The dragon can take 3 legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. The dragon regains spent legendary actions at the start of its turn.
Detect. The dragon makes a Wisdom (Perception) check.
Tail Attack. The dragon makes a tail attack.
Wing Attack (Costs 2 Actions). The dragon beats its wings. Each creature within 10 feet of the dragon must succeed on a DC 22 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage and be knocked prone.`;

const MAGE = `Mage
Medium humanoid (any race), any alignment
Armor Class 12 (15 with mage armor)
Hit Points 40 (9d8)
Speed 30 ft.
STR DEX CON INT WIS CHA
9 (-1) 14 (+2) 11 (+0) 17 (+3) 12 (+1) 11 (+0)
Saving Throws Int +6, Wis +4
Skills Arcana +6, History +6
Senses passive Perception 11
Languages any four languages
Challenge 6 (2,300 XP)
Spellcasting. The mage is a 9th-level spellcaster. Its spellcasting ability is Intelligence (spell save DC 14, +6 to hit with spell attacks). The mage has the following wizard spells prepared:
Cantrips (at will): fire bolt, light, mage hand, prestidigitation
1st level (4 slots): detect magic, mage armor, magic missile, shield
2nd level (3 slots): misty step, suggestion
3rd level (3 slots): counterspell, fireball, fly
4th level (3 slots): greater invisibility, ice storm
5th level (1 slot): cone of cold
Actions
Dagger. Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.`;

const GOBLIN_2024 = `Goblin Warrior
Small Fey (Goblinoid), Chaotic Neutral
AC 15 Initiative +2 (12)
HP 10 (3d6)
Speed 30 ft.
MOD SAVE MOD SAVE MOD SAVE
Str 8 -1 -1 Dex 15 +2 +2 Con 10 +0 +0
Int 10 +0 +0 Wis 8 -1 -1 Cha 8 -1 -1
Skills Stealth +6
Senses Darkvision 60 ft.; Passive Perception 9
Languages Common, Goblin
CR 1/4 (XP 50; PB +2)
Actions
Scimitar. Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage.
Bonus Actions
Nimble Escape. The goblin takes the Disengage or Hide action.`;

const GOBLIN_DDB = `Goblin
Small Humanoid (Goblinoid), Neutral Evil
Armor Class 15 (Leather Armor, Shield)
Hit Points 7 (2d6)
Speed 30 ft.
STR
8 (-1)
DEX
14 (+2)
CON
10 (+0)
INT
10 (+0)
WIS
8 (-1)
CHA
8 (-1)
Skills Stealth +6
Senses Darkvision 60 ft., Passive Perception 9
Languages Common, Goblin
Challenge 1/4 (50 XP)
Proficiency Bonus +2
Nimble Escape. The goblin can take the Disengage or Hide action as a bonus action on each of its turns.
Actions
Scimitar. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.`;

describe("looksLikeStatblock", () => {
  it("spots statblocks but not spells or items", () => {
    expect(looksLikeStatblock(GOBLIN)).toBe(true);
    expect(looksLikeStatblock(GOBLIN_2024)).toBe(true);
    expect(looksLikeStatblock("Fireball\n3rd-level evocation\nCasting Time: 1 action")).toBe(false);
  });
});

describe("parseStatblock", () => {
  for (const [label, text] of [["2014", GOBLIN], ["D&D Beyond", GOBLIN_DDB]] as const) {
    it(`reads a goblin (${label})`, () => {
      const g = parseStatblock(text);
      expect(g).toMatchObject({
        name: "Goblin", size: "sm", type: "humanoid", subtype: "goblinoid", alignment: "neutral evil",
        ac: { value: 15 }, hp: { value: 7, formula: "2d6" },
        speed: { walk: 30 }, abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        skills: { ste: 6 }, senses: { darkvision: 60 }, languages: ["Common", "Goblin"], cr: 0.25,
      });
      expect(g.ac.note?.toLowerCase()).toBe("leather armor, shield");
      expect(g.sections.traits.map((t) => t.name)).toEqual(["Nimble Escape"]);
      expect(g.sections.actions[0]).toMatchObject({ name: "Scimitar", attackBonus: 4, damage: [["1d6 + 2", "slashing"]] });
      expect(g.warnings).toEqual([]);
    });
  }

  it("reads a dragon: saves, immunities, senses, recharge and legendary actions", () => {
    const d = parseStatblock(DRAGON);
    expect(d).toMatchObject({
      size: "huge", type: "dragon", cr: 17, hp: { value: 256, formula: "19d12 + 133" },
      speed: { walk: 40, climb: 40, fly: 80 }, saves: { dex: 6, con: 13, wis: 7, cha: 11 },
      skills: { prc: 13, ste: 6 }, immunities: ["fire"], senses: { blindsight: 60, darkvision: 120 },
      legendaryActions: 3, legendaryResistances: 3,
    });
    expect(d.sections.actions.map((a) => a.name)).toEqual(["Multiattack", "Bite", "Claw", "Fire Breath"]);
    expect(d.sections.actions[3]).toMatchObject({ recharge: 5, save: { ability: "dex", dc: 21 } });
    expect(d.sections.legendary.map((a) => [a.name, a.activation?.cost ?? 1])).toEqual([["Detect", 1], ["Tail Attack", 1], ["Wing Attack", 2]]);
  });

  it("reads a spellcaster's spell list", () => {
    const m = parseStatblock(MAGE);
    expect(m.spellcasting).toMatchObject({ ability: "int", level: 9, dc: 14 });
    const spells = m.spellcasting!.spells;
    expect(spells.map((s) => s.name)).toEqual([
      "Fire Bolt", "Light", "Mage Hand", "Prestidigitation", "Detect Magic", "Mage Armor", "Magic Missile", "Shield",
      "Misty Step", "Suggestion", "Counterspell", "Fireball", "Fly", "Greater Invisibility", "Ice Storm", "Cone Of Cold",
    ]);
    expect(spells.every((s) => s.mode === "prepared")).toBe(true);
    expect(m.sections.actions[0]).toMatchObject({ name: "Dagger", attackBonus: 5 });
  });

  it("reads the 2024 layout: stat table saves, CR line and bonus actions", () => {
    const g = parseStatblock(GOBLIN_2024);
    expect(g).toMatchObject({
      name: "Goblin Warrior", size: "sm", type: "fey", subtype: "goblinoid", ac: { value: 15, note: undefined }, hp: { value: 10 },
      abilities: { str: 8, dex: 15, con: 10, int: 10, wis: 8, cha: 8 }, saves: {}, senses: { darkvision: 60 }, cr: 0.25,
    });
    expect(g.sections.actions[0]!.damage).toEqual([["1d6 + 2", "slashing"], ["1d4", "slashing"]]);
    expect(g.sections.bonus.map((b) => b.name)).toEqual(["Nimble Escape"]);
  });

  it("reads innate spell lists (at will, x/day)", () => {
    const s = parseStatblock(`Drow
Medium humanoid (elf), neutral evil
Armor Class 15 (chain shirt)
Hit Points 13 (3d8)
Speed 30 ft.
STR DEX CON INT WIS CHA
10 (+0) 14 (+2) 10 (+0) 11 (+0) 11 (+0) 12 (+1)
Challenge 1/4 (50 XP)
Innate Spellcasting. The drow's spellcasting ability is Charisma (spell save DC 11). It can innately cast the following spells, requiring no material components:
At will: dancing lights
1/day each: darkness, faerie fire`);
    expect(s.spellcasting).toMatchObject({ ability: "cha", dc: 11 });
    expect(s.spellcasting!.spells).toEqual([
      { name: "Dancing Lights", mode: "atwill", uses: undefined },
      { name: "Darkness", mode: "innate", uses: 1 },
      { name: "Faerie Fire", mode: "innate", uses: 1 },
    ]);
  });
});
