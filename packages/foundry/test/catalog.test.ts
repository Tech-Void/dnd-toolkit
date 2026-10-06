import { describe, expect, it } from "vitest";
import { generateEncounter } from "@dnd-toolkit/core";
import { toEntry } from "../src/catalog.ts";

// Shapes as stored by dnd5e 3.x in its monsters compendium.
const raw = (name: string, cr: number, value: string, subtype = "", environment = "") => ({
  name,
  uuid: `Compendium.dnd5e.monsters.Actor.${name}`,
  cr,
  type: { value, subtype, swarm: "", custom: "" },
  environment,
  source: "test",
});

describe("toEntry", () => {
  it("reads dnd5e creature type, subtype and environment", () => {
    const orc = toEntry(raw("Orc", 0.5, "humanoid", "Orc", "Hill, Mountain"))!;
    expect(orc.type).toBe("humanoid");
    expect(orc.tags).toEqual(expect.arrayContaining(["orc", "hill", "mountain"]));
    expect(orc.roles).toEqual(["brute"]); // from the built-in list
  });

  it("marks Any Race NPCs as reskinnable", () => {
    expect(toEntry(raw("Veteran", 3, "humanoid", "Any Race"))!.tags).toContain("anyrace");
  });

  it("infers roles for creatures outside the built-in list", () => {
    expect(toEntry(raw("Hobgoblin Warlord", 6, "humanoid", "Goblinoid"))!.roles).toContain("leader");
    expect(toEntry(raw("Swamp Witch", 4, "fey"))!.roles).toContain("caster");
  });

  it("skips entries without a CR", () => {
    expect(toEntry({ ...raw("Prop", 0, "construct"), cr: null })).toBeNull();
  });

  it("feeds the encounter generator", () => {
    const catalog = [raw("Orc", 0.5, "humanoid", "Orc"), raw("Veteran", 3, "humanoid", "Any Race")].map((r) => toEntry(r)!);
    const e = generateEncounter({ catalog, partyLevel: 3, tags: "orc", seed: "t" });
    expect(e.groups.every((g) => g.name === "Orc" || g.name === "Orc Veteran")).toBe(true);
  });
});
