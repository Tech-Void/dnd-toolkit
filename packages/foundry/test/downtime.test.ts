import { describe, expect, it } from "vitest";
import { newCamp } from "@dnd-toolkit/core";
import { applyCampAction, applyCampCommand, rollText } from "../src/downtime.ts";

const camp = () => newCamp({
  terrain: "forest",
  weather: { text: "Clear skies", speed: 1 },
  campers: [{ actorId: "a", name: "Ana", img: "", level: 4 }, { actorId: "b", name: "Bo", img: "", level: 4 }],
  seed: "t",
});

describe("camp state", () => {
  it("takes votes, then the GM's pick", () => {
    let s = applyCampAction(camp(), { type: "vote", actorId: "a", site: 1 });
    expect(s.votes).toEqual({ a: 1 });
    s = applyCampCommand(s, { type: "chooseSite", site: 1 });
    expect(s.phase).toBe("setup");
    expect(s.site).toBe(1);
    // Votes only count while choosing.
    expect(applyCampAction(s, { type: "vote", actorId: "b", site: 0 }).votes).toEqual({ a: 1 });
  });

  it("assigns jobs, resolves rolls once, and lets the GM undo", () => {
    let s = applyCampCommand(camp(), { type: "chooseSite", site: 0 });
    s = applyCampAction(s, { type: "job", actorId: "a", job: "cook" });
    s = applyCampAction(s, { type: "result", actorId: "a", total: 18 });
    expect(s.campers[0]!.result?.success).toBe(true);
    // A second result (or a job change) after rolling is ignored.
    expect(applyCampAction(s, { type: "result", actorId: "a", total: 1 }).campers[0]!.result?.total).toBe(18);
    expect(applyCampAction(s, { type: "job", actorId: "a", job: "hunt" }).campers[0]!.job).toBe("cook");
    s = applyCampCommand(s, { type: "clearResult", actorId: "a" });
    expect(s.campers[0]!.result).toBeUndefined();
  });

  it("plays the night watch by watch and settles events from the watch's rolls", () => {
    let s = applyCampCommand(camp(), { type: "chooseSite", site: 0 });
    s = applyCampCommand(s, { type: "toNight" });
    expect(s.phase).toBe("night");
    s = applyCampCommand(s, { type: "reveal" });
    expect(s.revealed).toBe(1);
    const ev = s.night!.events.find((e) => e.check);
    if (ev) {
      s = applyCampAction(s, { type: "eventRoll", eventId: ev.id, actorId: "a", name: "Ana", total: 1 });
      expect(s.outcomes[ev.id]!.passed).toBe(false);
      s = applyCampAction(s, { type: "eventRoll", eventId: ev.id, actorId: "b", name: "Bo", total: 30 });
      expect(s.outcomes[ev.id]!.passed).toBe(true);
      expect(s.outcomes[ev.id]!.text).toBe(ev.onSuccess);
    }
    s = applyCampCommand(s, { type: "toMorning" });
    expect(s.phase).toBe("morning");
  });

  it("writes rolls in words", () => {
    expect(rollText({ type: "skill", key: "sur", dc: 12 })).toBe("Survival DC 12");
    expect(rollText({ type: "tool", key: "herb", dc: 10 })).toBe("Herbalism Kit DC 10");
    expect(rollText({ type: "save", key: "con" })).toBe("Constitution save");
  });
});
