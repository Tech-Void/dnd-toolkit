import { describe, expect, it } from "vitest";
import {
  addWave,
  encounterXp,
  generateEncounter,
  isUnaskedExotic,
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
    // Blank tags theme around a random creature type, and not every type can make every shape.
    for (const template of ["solo", "elite", "leader", "squad", "horde"] as EncounterTemplate[]) {
      let honored = 0;
      for (let i = 0; i < 20; i++) {
        const e = generateEncounter({ partyLevel: 6, partySize: 4, template, seed: `t-${template}${i}` });
        if (e.template === template) honored++;
        else expect(e.warnings.length).toBeGreaterThan(0);
      }
      expect(honored).toBeGreaterThanOrEqual(8);
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

describe("exotic variants", () => {
  const exotic = (n: string) => /^Were|^Half-/.test(n);

  it("leaves lycanthropes and half-dragons out of a plain race query, waves included", () => {
    for (let i = 0; i < 40; i++) {
      let e = generateEncounter({ partyLevel: 5, tags: "humans", template: i % 2 ? "elite" : "auto", seed: `hum${i}` });
      e = addWave(e, { seed: `humw${i}` });
      for (const g of [...e.groups, ...e.waves![0]!.groups]) expect(exotic(g.monster.name)).toBe(false);
    }
  });

  it("still uses them when asked for", () => {
    expect(isUnaskedExotic(byName("Wererat"), parseTags("human"))).toBe(true);
    expect(isUnaskedExotic(byName("Wererat"), parseTags("human+lycanthrope"))).toBe(false);
    expect(isUnaskedExotic(byName("Wererat"), parseTags("wererat"))).toBe(false);
    expect(isUnaskedExotic(byName("Half-Red Dragon Veteran"), parseTags("humanoid+dragon"))).toBe(false);
    expect(isUnaskedExotic(byName("Veteran"), parseTags("human"))).toBe(false);
    const e = generateEncounter({ partyLevel: 4, tags: "lycanthrope", seed: "were" });
    expect(e.groups.every((g) => g.monster.tags.includes("lycanthrope"))).toBe(true);
  });
});

describe("locking groups", () => {
  it("keeps locked groups and rebuilds the rest within budget", () => {
    for (let i = 0; i < 40; i++) {
      const first = generateEncounter({ partyLevel: 5, tags: "humanoid+orc", seed: `lock${i}` });
      const keep = first.groups[0]!;
      const next = generateEncounter({ partyLevel: 5, tags: "humanoid+orc", race: first.race, locked: [keep], seed: `relock${i}` });
      expect(next.groups).toContainEqual(keep);
      expect(next.groups.filter((g) => g.monster.id === keep.monster.id)).toHaveLength(1);
      expect(next.budget).toBe(first.budget);
      expect(next.totalXp).toBeLessThanOrEqual(next.budget * 1.1);
      for (const g of next.groups) expect(g.name === "Orc" || g.name.startsWith("Orc ")).toBe(true);
    }
  });

  it("sticks to the locked creature type when the query names none", () => {
    for (let i = 0; i < 30; i++) {
      const first = generateEncounter({ partyLevel: 6, seed: `type${i}` });
      const keep = first.groups.at(-1)!;
      const next = generateEncounter({ partyLevel: 6, locked: [keep], seed: `retype${i}` });
      for (const g of next.groups) expect(g.monster.type).toBe(keep.monster.type);
    }
  });

  it("returns just the locked groups when they fill the creature cap", () => {
    const first = generateEncounter({ partyLevel: 4, seed: "full" });
    const count = first.groups.reduce((n, g) => n + g.count, 0);
    const next = generateEncounter({ partyLevel: 4, locked: first.groups, maxCreatures: count, seed: "full2" });
    expect(next.groups).toEqual(first.groups);
    expect(next.totalXp).toBe(first.totalXp);
  });
});

describe("addWave", () => {
  it("adds themed reinforcements at about half the budget, in round order", () => {
    for (let i = 0; i < 30; i++) {
      let e = generateEncounter({ partyLevel: 5, tags: "undead", seed: `wave${i}` });
      e = addWave(addWave(e, { seed: `w1-${i}` }), { seed: `w2-${i}` });
      const [a, b] = e.waves!;
      expect(a!.round).toBeGreaterThanOrEqual(2);
      expect(b!.round).toBeGreaterThan(a!.round);
      for (const w of e.waves!) {
        expect(w.xp).toBeLessThanOrEqual(e.budget * 0.5 * 1.1);
        expect(w.groups.every((g) => g.monster.type === "undead")).toBe(true);
      }
      expect(encounterXp(e)).toBe(e.totalXp + a!.xp + b!.xp);
    }
  });

  it("is reproducible and leaves the original untouched", () => {
    const e = generateEncounter({ partyLevel: 3, seed: "orig" });
    expect(addWave(e, { seed: "s" })).toEqual(addWave(e, { seed: "s" }));
    expect(e.waves).toBeUndefined();
  });
});
