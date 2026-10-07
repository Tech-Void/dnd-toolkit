import { describe, expect, it } from "vitest";
import { generateNpc, NPC_ROLES, npcSummary, npcTraits, SRD_MONSTERS, type NpcRole } from "../src/index.ts";

describe("generateNpc", () => {
  it("is reproducible", () => {
    expect(generateNpc({ seed: "same" })).toEqual(generateNpc({ seed: "same" }));
  });

  it("honors role, race and name", () => {
    const n = generateNpc({ role: "guard", race: "dwarf", name: "Thora", seed: "g" });
    expect(n).toMatchObject({ role: "guard", race: "dwarf", name: "Thora" });
    expect(NPC_ROLES.guard.occupations).toContain(n.occupation);
    expect(["Guard", "Veteran"]).toContain(n.statblock);
    expect(npcSummary(n)).toMatch(/^Thora, .+ dwarf /);
  });

  it("only uses statblocks that exist in the SRD catalog", () => {
    const names = new Set(SRD_MONSTERS.map((m) => m.name));
    for (const def of Object.values(NPC_ROLES)) for (const [statblock] of def.statblocks) expect(names.has(statblock)).toBe(true);
  });

  it("varies across seeds and gives every race a name", () => {
    const npcs = Array.from({ length: 60 }, (_, i) => generateNpc({ seed: `v${i}` }));
    expect(new Set(npcs.map((n) => n.name)).size).toBeGreaterThan(40);
    expect(new Set(npcs.map((n) => n.role)).size).toBe(Object.keys(NPC_ROLES).length);
    for (const race of ["human", "dwarf", "halfling", "elf", "half-elf", "gnome", "half-orc", "tiefling", "dragonborn"]) {
      expect(generateNpc({ race, seed: race }).name.length).toBeGreaterThan(1);
    }
  });

  it("marks the secret and statblock as GM-only", () => {
    const traits = npcTraits(generateNpc({ role: "criminal" as NpcRole, seed: "c" }));
    expect(traits.filter(([, , gm]) => gm).map(([label]) => label)).toEqual(["Secret", "Statblock"]);
  });
});
