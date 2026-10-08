import { describe, expect, it } from "vitest";
import { planJourney, rerollDay, TERRAINS, type Terrain } from "../src/index.ts";

describe("planJourney", () => {
  it("is reproducible", () => {
    expect(planJourney({ seed: "same", days: 4 })).toEqual(planJourney({ seed: "same", days: 4 }));
  });

  it("plans a day at a time with weather, miles and checks", () => {
    for (const terrain of Object.keys(TERRAINS) as Terrain[]) {
      const j = planJourney({ terrain, days: 7, seed: terrain, partyLevel: 6 });
      expect(j.days).toHaveLength(7);
      expect(j.totalMiles).toBe(j.days.reduce((s, d) => s + d.miles, 0));
      for (const d of j.days) {
        expect(d.weather.text.length).toBeGreaterThan(3);
        expect(d.miles).toBeGreaterThan(0);
        // Roads need no navigator; everywhere else does.
        expect(d.checks.some((c) => c.who === "navigator")).toBe(terrain !== "road");
        if (d.event.kind === "encounter") {
          expect(d.event.encounter!.tags).toBe(TERRAINS[terrain].tags);
          expect(d.checks.some((c) => c.who === "watch" && c.key === "prc")).toBe(true);
        }
      }
    }
  });

  it("is slower through rough ground and at a slow pace", () => {
    const miles = (terrain: Terrain, pace: "slow" | "fast") => planJourney({ terrain, pace, days: 10, climate: "hot", season: "winter", seed: "m" }).totalMiles;
    expect(miles("forest", "fast")).toBeLessThan(miles("grassland", "fast"));
    expect(miles("grassland", "slow")).toBeLessThan(miles("grassland", "fast"));
  });

  it("produces every kind of event over a long trip", () => {
    const kinds = new Set(planJourney({ terrain: "forest", days: 21, seed: "long" }).days.map((d) => d.event.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it("rerolls one day and keeps the rest", () => {
    const j = planJourney({ days: 5, seed: "rr" });
    const r = rerollDay(j, j.days[2]!.id, "again");
    expect(r.days[2]!.day).toBe(3);
    expect(r.days[2]!.id).not.toBe(j.days[2]!.id);
    expect(r.days.filter((_, i) => i !== 2)).toEqual(j.days.filter((_, i) => i !== 2));
  });
});
