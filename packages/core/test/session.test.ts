import { describe, expect, it } from "vitest";
import { emptyCampaign, generateFaction, rerollPrep, sessionPrep, type CampaignState } from "../src/index.ts";

function world(): CampaignState {
  const c = emptyCampaign();
  const a = generateFaction({ kind: "bandits", seed: "a" });
  const b = generateFaction({ kind: "church", seed: "b" });
  a.faction.standing = -2;
  a.faction.rivals = [b.faction.id];
  b.faction.standing = 1;
  a.leader.attitude = -2;
  a.leader.met = [{ day: 3, text: "Robbed them." }];
  b.leader.attitude = 2;
  b.leader.met = [{ day: 8, text: "Paid them." }];
  c.factions.push(a.faction, b.faction);
  c.npcs.push(a.leader, b.leader);
  c.places.push({ id: "p1", name: "The Sunken Keep", kind: "dungeon", notes: "", factionIds: [a.faction.id], discovered: 2 });
  c.quests.push({ id: "q1", title: "Clear the road", summary: "", giverId: b.leader.id, factionId: a.faction.id, status: "active", steps: [{ text: "Find the camp", done: true }, { text: "Deal with the leader", done: false }], reward: "100 gp", notes: "", started: 2 });
  c.log.push({ day: 2, kind: "quest", text: "Took the job." }, { day: 9, kind: "npc", text: "Met the priest again." });
  return c;
}

describe("sessionPrep", () => {
  it("pulls the next step, faction moves, NPCs and encounters from the campaign", () => {
    const c = world();
    const p = sessionPrep(c, { day: 10, partyLevel: 4, since: 5, destination: { name: "Ashford", terrain: "forest", days: 2 }, seed: "s" });
    expect(p.quests[0]).toMatchObject({ title: "Clear the road", next: "Deal with the leader", progress: [1, 2] });
    expect(p.factions[0]!.name).toBe(c.factions[0]!.name);
    expect(p.npcs.map((n) => n.name)).toContain(c.npcs[1]!.name);
    expect(p.encounters[0]).toMatchObject({ tags: "humanoid+bandit", difficulty: "high" });
    expect(p.encounters.some((e) => e.why.includes("Ashford"))).toBe(true);
    expect(p.ahead[0]).toMatch(/Ashford \(2 days through forest\)/);
    expect(p.ahead.some((l) => l.includes("Sunken Keep"))).toBe(true);
    expect(p.rumors.length).toBe(4);
    expect(p.recap).toEqual(["Day 9: Met the priest again."]);
  });
  it("works on an empty campaign and is stable per seed", () => {
    const a = sessionPrep(emptyCampaign(), { day: 1, partyLevel: 1, seed: "x" });
    expect(a.rumors.length).toBe(4);
    expect(a.encounters.length).toBeGreaterThan(0);
    expect(sessionPrep(emptyCampaign(), { day: 1, partyLevel: 1, seed: "x" })).toEqual(a);
  });
  it("rerolls one part", () => {
    const c = world();
    const o = { day: 10, partyLevel: 4, seed: "s" };
    const p = sessionPrep(c, o);
    const r = rerollPrep(c, p, o, "rumors", 2);
    expect(r.quests).toEqual(p.quests);
    expect(r.rumors).not.toEqual(p.rumors);
  });
});
