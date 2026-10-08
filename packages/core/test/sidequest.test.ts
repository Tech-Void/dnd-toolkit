import { describe, expect, it } from "vitest";
import { generateSideQuest, keywordTheme, QUEST_TYPES, rerollMission, tagsForVillain } from "../src/index.ts";

describe("generateSideQuest", () => {
  it("is reproducible", () => {
    expect(generateSideQuest({ seed: "same", partyLevel: 4 })).toEqual(generateSideQuest({ seed: "same", partyLevel: 4 }));
  });

  it("strings missions together and ends on a showdown", () => {
    for (const length of [2, 3, 4, 5]) {
      for (let i = 0; i < 10; i++) {
        const q = generateSideQuest({ seed: `q${length}${i}`, partyLevel: 6, length });
        expect(q.missions).toHaveLength(length);
        expect(q.missions.at(-1)!.kind).toBe("showdown");
        expect(new Set(q.missions.map((m) => m.id)).size).toBe(length);
        for (const m of q.missions) {
          expect(m.objective.length).toBeGreaterThan(10);
          expect(m.leadsTo.length).toBeGreaterThan(5);
          // Fights carry the quest's monster theme and a map to fight on.
          if (m.encounter) {
            expect([q.tags, q.bossTags]).toContainEqual(m.encounter.tags);
            expect(m.map).toBeDefined();
          }
          if (m.kind === "lead") expect(m.npc?.name).toBeTruthy();
          for (const c of m.checks) expect(c.dc).toBeGreaterThanOrEqual(10);
        }
        expect(["high", "deadly"]).toContain(q.missions.at(-1)!.encounter!.difficulty);
      }
    }
  });

  it("rerolls one mission and leaves the rest", () => {
    const q = generateSideQuest({ seed: "rr", partyLevel: 5, length: 4 });
    const target = q.missions[2]!;
    const next = rerollMission(q, target.id, "again");
    expect(next.missions[2]!.kind).toBe(target.kind);
    expect(next.missions[2]!.id).not.toBe(target.id);
    expect(next.missions.filter((_, i) => i !== 2)).toEqual(q.missions.filter((_, i) => i !== 2));
  });

  it("themes the fights on the villain", () => {
    expect(tagsForVillain("a lich's apprentice who wants a promotion")).toBe("undead");
    expect(tagsForVillain("a bandit queen with a code of honor")).toMatch(/bandit/);
    expect(tagsForVillain("an ambitious goblin king")).toBe("goblinoid");
  });
});

describe("focused side quests", () => {
  it("keeps one villain, prize and lair running through every mission", () => {
    for (const [id] of QUEST_TYPES) {
      const q = generateSideQuest({ mode: "premade", archetype: id, partyLevel: 6, length: 4, seed: id });
      expect(q.archetype).toBe(id);
      const text = q.missions.map((m) => `${m.objective} ${m.location} ${m.leadsTo}`).join(" ");
      expect(text).toContain(q.villainName);
      expect(text).toContain(q.lair);
      expect(q.missions.at(-1)!.encounter!.tags).toEqual(q.bossTags);
      expect(q.hook.villain).toContain(q.villainName);
    }
  });

  it("reads keywords: a silver serpent is a silver dragon in an icy lair", () => {
    const theme = keywordTheme("silver serpent");
    expect(theme).toMatchObject({ archetype: "dragon", color: "silver" });
    expect(theme.bossTags[0]).toBe("dragon+silver");
    const q = generateSideQuest({ mode: "keyword", keyword: "Silver Serpent", partyLevel: 8 });
    expect(q.title).toBe("Side quest: The Silver Serpent");
    expect(q.villainName).toBe("the Silver Serpent");
    expect(q.lair).toMatch(/ice|iced/);
    // The keyword is the seed: same words, same quest.
    expect(generateSideQuest({ mode: "keyword", keyword: "silver serpent", partyLevel: 8 })).toEqual(generateSideQuest({ mode: "keyword", keyword: "silver serpent", partyLevel: 8 }));
  });

  it("maps other keywords to fitting quests, and unknown words to monster names", () => {
    expect(keywordTheme("plain serpent")).toMatchObject({ archetype: "beast" });
    expect(keywordTheme("the howling moon").archetype).toBe("lycan");
    expect(keywordTheme("crypt of whispers").archetype).toBe("undead");
    expect(keywordTheme("manticore").bossTags[0]).toBe("manticore");
  });
});

