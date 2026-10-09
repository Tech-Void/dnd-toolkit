import { describe, expect, it } from "vitest";
import { approaches, startTalk, talkAttitudeChange, talkDc, talkSummary, tryTalk } from "../src/index.ts";

const npc = { name: "Ilsa", personality: "guarded", motive: "pay off her brother's debt", secret: "she sold the key" };

describe("social encounters", () => {
  it("warms up, tells what she knows, agrees and spills the secret", () => {
    let t = startTalk(npc, { id: "a", ask: "let us into the vault", info: ["the guard changes at midnight"], attitude: 0 });
    expect(talkDc(t, "persuade")).toBe(15);
    expect(approaches(t)).not.toContain("appeal");
    t = tryTalk(t, "insight", 13, "Wren").talk;
    expect(t.motiveKnown).toBe(true);
    expect(approaches(t)).toContain("appeal");
    let r = tryTalk(t, "persuade", 15, "Brakka");
    expect(r.talk.mood).toBe(1);
    expect(r.text).toContain("guard changes at midnight");
    r = tryTalk(r.talk, "appeal", 25, "Wren");
    expect(r.talk.mood).toBe(3);
    expect(r.talk.secretTold).toBe(true);
    expect(r.talk.ended).toBe("agreed");
    expect(talkAttitudeChange(r.talk)).toBe(2);
    expect(talkSummary(r.talk)).toContain("agreed to help");
  });
  it("catches lies, runs out of patience, and threats cost", () => {
    let t = startTalk(npc, { id: "b" });
    t = tryTalk(t, "deceive", 15, "R").talk;
    expect(talkDc(t, "deceive")).toBeGreaterThan(talkDc(t, "persuade"));
    t = tryTalk(t, "deceive", 5, "R").talk;
    expect(t.mood).toBe(-1);
    expect(t.patience).toBe(1);
    t = tryTalk(t, "persuade", 12, "R").talk;
    expect(t.ended).toBe("walked");
    const cowed = tryTalk(startTalk(npc, { id: "c" }), "intimidate", 18, "B").talk;
    expect(cowed.ended).toBe("cowed");
    expect(talkAttitudeChange(cowed)).toBe(-2);
    expect(tryTalk(startTalk(npc, { id: "d" }), "intimidate", 5, "B").talk.ended).toBe("hostile");
  });
});
