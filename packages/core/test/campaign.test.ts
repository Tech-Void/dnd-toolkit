import { describe, expect, it } from "vitest";
import {
  adjustStanding, bindHook, bindSideQuest, emptyCampaign, fromTown, generateFaction, generateHook, generateNpc, generateSideQuest, generateTown,
  meetAgain, npcMemory, npcRecord, register, setQuestStatus, standingLabel,
} from "../src/index.ts";

describe("campaign memory", () => {
  it("tracks standing (clamped) and rivals resent help", () => {
    const a = generateFaction({ kind: "guild", seed: "a" });
    const b = generateFaction({ kind: "thieves", seed: "b" });
    a.faction.rivals = [b.faction.id];
    let c = register(emptyCampaign(), { factions: [a.faction, b.faction], npcs: [a.leader, b.leader] }, 1);
    c = adjustStanding(c, a.faction.id, 2, "saved their caravan", 2);
    c = adjustStanding(c, a.faction.id, 5, "", 3);
    expect(c.factions[0]!.standing).toBe(3);
    expect(c.factions[1]!.standing).toBe(-2);
    expect(standingLabel(-2)).toBe("unfriendly");
    expect(c.log.some((l) => l.text.includes("saved their caravan"))).toBe(true);
  });

  it("remembers people and what happened", () => {
    const n = npcRecord(generateNpc({ seed: "n" }), 1);
    let c = register(emptyCampaign(), { npcs: [n] }, 1);
    c = meetAgain(c, n.id, "They lied about the map.", 4);
    expect(npcMemory(c, n.id)).toMatch(/Last seen day 4: They lied about the map/);
    // Registering the same person twice doesn't duplicate them.
    expect(register(c, { npcs: [n] }, 5).npcs).toHaveLength(1);
  });

  it("takes in a whole town", () => {
    const t = generateTown({ seed: "t" });
    const c = register(emptyCampaign(), fromTown(t, 3), 3);
    expect(c.places[0]!.name).toBe(t.name);
    expect(c.npcs.length).toBeGreaterThanOrEqual(3 + t.notables.length);
    expect(c.factions.length).toBe(t.factions.length);
    expect(c.factions.every((f) => c.npcs.some((n) => n.id === f.leaderId))).toBe(true);
  });

  it("ties a side quest to a faction the party crossed, with a friend as patron", () => {
    const enemy = generateFaction({ kind: "cult", seed: "e" });
    enemy.faction.standing = -2;
    const friend = { ...npcRecord(generateNpc({ seed: "f" }), 1), attitude: 2 };
    let c = register(emptyCampaign(), { factions: [enemy.faction], npcs: [enemy.leader, friend] }, 1);
    const q = generateSideQuest({ seed: "q", partyLevel: 4 });
    const bound = bindSideQuest(c, q, 2);
    expect(bound.quest.villainName).toContain(enemy.leader.name);
    expect(bound.quest.hook.patron).toContain(friend.name);
    expect(bound.quest.hook.text).toContain(friend.name);
    expect(bound.record.factionId).toBe(enemy.faction.id);
    c = register(c, { ...bound.add, quests: [bound.record] }, 2);
    c = setQuestStatus(c, bound.record.id, "done", 9);
    expect(c.quests[0]!.ended).toBe(9);
  });

  it("makes a new villainous faction when there's none, and binds hooks to known people", () => {
    const bound = bindSideQuest(emptyCampaign(), generateSideQuest({ seed: "z" }), 1);
    expect(bound.add.factions).toHaveLength(1);
    expect(bound.add.factions![0]!.standing).toBe(-1);
    const friend = { ...npcRecord(generateNpc({ seed: "p" }), 1), attitude: 1 };
    const hook = bindHook(register(emptyCampaign(), { npcs: [friend] }, 1), generateHook({ seed: "h" }), "s");
    expect(hook.patron).toContain(friend.name);
  });
});
