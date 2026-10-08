import { beforeAll, describe, expect, it } from "vitest";
import { passives, rollLabel, summarize, type RequestState } from "../src/rolls.ts";

const actors: Record<string, any> = {
  a: { name: "Ana", system: { skills: { prc: { passive: 15 } } } },
  b: { name: "Bo", system: { skills: { prc: { passive: 9 } } } },
  c: { name: "Cy", system: { skills: { prc: { passive: 12 } } } },
};
beforeAll(() => {
  Object.assign(globalThis, { game: { actors: { get: (id: string) => actors[id] } } });
});

const state = (results: RequestState["results"], dc: number | null = 13): RequestState => ({
  request: { id: "r", prompt: "", type: "skill", key: "prc", dc, showDc: false, advantage: "normal", rollMode: "gmroll", actorIds: ["a", "b", "c"] },
  results,
  sentAt: 0,
});

describe("roll requests", () => {
  it("labels rolls", () => {
    expect(rollLabel({ type: "skill", key: "prc" })).toBe("Perception check");
    expect(rollLabel({ type: "save", key: "dex" })).toBe("Dexterity saving throw");
  });

  it("summarizes as results arrive, with a group result once everyone has rolled", () => {
    expect(summarize(state({ a: { actorId: "a", actorName: "Ana", total: 17, passed: true } }))).toBe("Ana 17 ✓, Bo …, Cy …");
    const all = state({
      a: { actorId: "a", actorName: "Ana", total: 17, passed: true },
      b: { actorId: "b", actorName: "Bo", total: 6, passed: false },
      c: { actorId: "c", actorName: "Cy", total: 14, passed: true },
    });
    expect(summarize(all)).toBe("Ana 17 ✓, Bo 6 ✗, Cy 14 ✓ — group succeeds (2/3)");
  });

  it("reads passive scores", () => {
    expect(passives("prc", ["a", "b", "c"]).map((p) => p.passive)).toEqual([15, 9, 12]);
  });
});
