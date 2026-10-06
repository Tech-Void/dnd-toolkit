import { describe, expect, it } from "vitest";
import {
  generateEncounter,
  matchesQuery,
  normalizeTag,
  parseTags,
  rateEncounter,
  SRD_MONSTERS,
  xpBudget,
  xpForCr,
  type EncounterTemplate,
} from "../src/index.ts";

const byName = (n: string) => SRD_MONSTERS.find((m) => m.name === n)!;

describe("tags", () => {
  it("normalizes plurals and synonyms", () => {
    expect(["elves", "Orcs", "humans", "dwarves", "woods", "crypt", "boss", "monstrosities"].map(normalizeTag))
      .toEqual(["elf", "orc", "human", "dwarf", "forest", "crypt", "solo", "monstrosity"]);
  });

  it("parses AND / OR / exclude", () => {
    expect(parseTags("humanoid+humans, orc -leader")).toEqual({ clauses: [["humanoid", "human"], ["orc"]], exclude: ["leader"] });
  });

  it("matches creature types strictly and other words loosely", () => {
    const giant = parseTags("giant");
    expect(matchesQuery(byName("Hill Giant"), giant)).toBe(true);
    expect(matchesQuery(byName("Giant Rat"), giant)).toBe(false);
    expect(matchesQuery(byName("Young Red Dragon"), parseTags("red"))).toBe(true);
  });

  it("lets anyrace statblocks stand in for a race", () => {
    const q = parseTags("humanoid+elf");
    expect(matchesQuery(byName("Veteran"), q)).toBe(false);
    expect(matchesQuery(byName("Veteran"), q, "elf")).toBe(true);
    expect(matchesQuery(byName("Drow"), q, "elf")).toBe(true);
    expect(matchesQuery(byName("Orc"), q, "elf")).toBe(false);
  });
});

describe("budgets", () => {
  it("uses per-character budgets", () => {
    expect(xpBudget(1, 4, "low")).toBe(200);
    expect(xpBudget(5, 4, "moderate")).toBe(3000);
    expect(xpBudget(20, 1, "high")).toBe(22000);
    expect(xpBudget(5, 4, "deadly")).toBe(6600);
    expect(rateEncounter(3000, 5, 4)).toBe("moderate");
    expect(rateEncounter(10, 5, 4)).toBe("trivial");
  });
});

describe("generateEncounter", () => {
  it("is reproducible", () => {
    const opts = { partyLevel: 5, tags: "undead", seed: "repro" };
    expect(generateEncounter(opts)).toEqual(generateEncounter(opts));
  });

  it("stays within budget across many seeds and levels", () => {
    for (let i = 0; i < 200; i++) {
      const level = (i % 20) + 1;
      const e = generateEncounter({ partyLevel: level, partySize: 4, difficulty: "moderate", seed: `b${i}` });
      if (e.warnings.length) continue;
      expect(e.totalXp).toBeLessThanOrEqual(e.budget * 1.1);
      expect(e.totalXp).toBeGreaterThan(e.budget * 0.4);
      expect(e.totalXp).toBe(e.groups.reduce((s, g) => s + g.count * xpForCr(g.monster.cr), 0));
    }
  });

  it("only uses monsters matching the tags, with race reskins", () => {
    for (let i = 0; i < 30; i++) {
      const e = generateEncounter({ partyLevel: 4, tags: "humanoid+orc", seed: `orc${i}` });
      expect(e.race).toBe("orc");
      for (const g of e.groups) {
        expect(g.monster.type).toBe("humanoid");
        expect(g.name === "Orc" || g.name.startsWith("Orc ")).toBe(true);
      }
    }
  });

  it("honors each template when possible", () => {
    for (const template of ["solo", "elite", "leader", "squad", "horde"] as EncounterTemplate[]) {
      const e = generateEncounter({ partyLevel: 6, partySize: 4, template, seed: `t-${template}` });
      expect(e.template).toBe(template);
    }
  });

  it("falls back with a warning when nothing fits", () => {
    const e = generateEncounter({ partyLevel: 1, partySize: 1, difficulty: "low", tags: "adult+red", seed: "x" });
    expect(e.groups[0]!.monster.name).toBe("Adult Red Dragon");
    expect(e.warnings.length).toBe(1);
  });

  it("throws on tags that match nothing", () => {
    expect(() => generateEncounter({ partyLevel: 3, tags: "flumph", seed: "x" })).toThrow(/No monsters/);
  });
});
