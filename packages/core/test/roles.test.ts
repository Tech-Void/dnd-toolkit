import { describe, expect, it } from "vitest";
import { deriveRoles, generateLoot, plainText, type StatSummary } from "../src/index.ts";

const base: StatSummary = { name: "Thing", cr: 2, hp: 40, legendary: false, spellLevel: 0, spellCount: 0, meleeAttacks: 1, rangedAttacks: 0, walk: 30, fly: 0, features: [], text: "" };

describe("plainText", () => {
  it("unwraps Foundry enrichers and HTML", () => {
    expect(plainText("<p>The target is &amp;Reference[restrained]{restrained} [[/save con 14]] by @UUID[Actor.x]{Webs}.</p>"))
      .toBe(" the target is restrained by webs. ");
  });
});

describe("deriveRoles", () => {
  it("reads common statblock shapes", () => {
    expect(deriveRoles({ ...base, legendary: true, cr: 17 })[0]).toBe("solo");
    expect(deriveRoles({ ...base, name: "Orc War Chief" })[0]).toBe("leader");
    expect(deriveRoles({ ...base, spellLevel: 9 })[0]).toBe("caster");
    expect(deriveRoles({ ...base, rangedAttacks: 2 })[0]).toBe("artillery");
    expect(deriveRoles({ ...base, text: "the target is restrained by webbing" })).toContain("controller");
    expect(deriveRoles({ ...base, features: ["Nimble Escape"] })).toContain("skirmisher");
    expect(deriveRoles(base)).toEqual(["brute"]);
  });

  it("ignores conditions the creature only resists", () => {
    expect(deriveRoles({ ...base, text: "advantage on saving throws against being charmed or frightened" })).not.toContain("controller");
  });

  it("treats a backup ranged weapon on a tough creature as melee", () => {
    expect(deriveRoles({ ...base, name: "Hill Giant", cr: 5, hp: 105, rangedAttacks: 1 })[0]).toBe("brute");
    expect(deriveRoles({ ...base, name: "Scout", cr: 0.5, hp: 16, rangedAttacks: 1 })[0]).toBe("artillery");
  });
});

describe("loot with a compendium pool", () => {
  it("draws magic items from the pool and keeps their UUIDs", () => {
    const pool = { rare: [{ name: "Flame Tongue Longsword", rarity: "rare" as const, uuid: "Compendium.x.Item.ft", valueGp: 5000 }] };
    const loot = generateLoot({ cr: 12, mode: "hoard", seed: "pool", magicItems: { ...pool, "very rare": pool.rare, uncommon: pool.rare, legendary: pool.rare } });
    for (const i of loot.items.filter((i) => i.kind === "magic")) expect(i.uuid).toBe("Compendium.x.Item.ft");
  });
});
