import { describe, expect, it } from "vitest";
import {
  activityAvailable,
  activityDc,
  advanceProject,
  boonsFor,
  BOOK_BONUS,
  campContext,
  campSites,
  craftPlan,
  craftProject,
  generateBook,
  generateLoot,
  leadingSite,
  matchMaterials,
  materialTagFor,
  newCamp,
  planNight,
  rareIngredient,
  RECIPES,
  resolveActivity,
  resolveCheck,
  restAdvice,
  startNight,
  studyProject,
  trainingHours,
  trainingProject,
  trainingSpeed,
  type CampState,
  type Project,
} from "../src/index.ts";

const campers = [
  { actorId: "a", name: "Ana", img: "", level: 5 },
  { actorId: "b", name: "Bo", img: "", level: 5 },
  { actorId: "c", name: "Cy", img: "", level: 5 },
];

describe("camp", () => {
  it("offers terrain sites and spreads the party over the watches", () => {
    const s = newCamp({ terrain: "mountains", campers, seed: "c" });
    expect(s.sites).toHaveLength(3);
    expect(s.phase).toBe("site");
    expect(new Set(s.campers.map((c) => c.watch)).size).toBe(3);
    for (let i = 0; i < 10; i++) expect(campSites({ terrain: "desert", seed: i }).every((x) => x.name && x.perk)).toBe(true);
  });

  it("counts votes for the favorite site", () => {
    const s: CampState = { ...newCamp({ campers, seed: "v" }), votes: { a: 2, b: 2, c: 0 } };
    expect(leadingSite(s)).toBe(2);
  });

  it("adjusts job DCs for the place, the weather and the fire", () => {
    const base = newCamp({ terrain: "forest", campers, seed: "d", weather: { text: "Steady rain", speed: 1 } });
    const ctx = campContext({ ...base, site: null });
    expect(activityDc("cook", ctx)).toBe(12);
    expect(activityDc("cook", { ...ctx, fire: false })).toBe(17);
    expect(activityDc("forage", ctx)).toBe(10);
    expect(activityAvailable("perform", { ...ctx, fire: false })).toBe(false);
    expect(activityAvailable("scavenge", ctx)).toBe(false);
  });

  it("turns rolls into boons", () => {
    const ctx = { terrain: "forest" as const, weather: { text: "Clear", speed: 1 }, site: null, fire: true, trackFood: true };
    const cook = resolveActivity("cook", 20, campers[0]!, ctx);
    expect(cook.success).toBe(true);
    expect(cook.boons[0]).toMatchObject({ kind: "tempHp", to: "all" });
    expect(cook.boons[0]!.amount).toBe(10); // great success doubles (3 + 2) × 2
    expect(resolveActivity("cook", 3, campers[0]!, ctx).boons).toHaveLength(0);
    const forage = resolveActivity("forage", 15, campers[0]!, ctx);
    expect(forage.boons.map((b) => b.kind)).toEqual(["rations", "material"]);
    expect(forage.boons[1]!.item?.material).toBe("herbs");
    const tend = resolveActivity("tend", 13, { ...campers[1]!, target: "a" }, { ...ctx, targetName: "Ana" });
    expect(tend.boons[0]).toMatchObject({ kind: "hitDie", to: "a", amount: 1 });
    expect(resolveActivity("forage", 15, campers[0]!, { ...ctx, trackFood: false }).boons.map((b) => b.kind)).toEqual(["material"]);
  });

  it("plans a night that the scouts and a hidden site make safer", () => {
    const count = (o: Partial<Parameters<typeof planNight>[0]>) =>
      Array.from({ length: 300 }, (_, i) => planNight({ terrain: "swamp", weather: { text: "Clear", speed: 1 }, partyLevel: 5, watches: 3, fire: true, seed: i, ...o }))
        .filter((n) => n.events.some((e) => e.kind === "encounter")).length;
    const plain = count({});
    expect(count({ scouted: true, fire: false })).toBeLessThan(plain);
    const night = planNight({ terrain: "forest", weather: { text: "Clear", speed: 1 }, partyLevel: 3, watches: 4, fire: true, seed: "n" });
    expect(night.watches).toHaveLength(4);
    for (const e of night.events) expect(e.watch).toBeLessThan(4);
  });

  it("collects boons and advises on the rest", () => {
    let s = newCamp({ campers, seed: "m", trackFood: false });
    s = { ...s, phase: "setup", site: 0 };
    s.campers[0]!.job = "cook";
    s.campers[0]!.result = resolveActivity("cook", 15, s.campers[0]!, { ...campContext(s), trackFood: false });
    s = startNight(s);
    expect(s.phase).toBe("night");
    expect(boonsFor(s, "b").some((b) => b.kind === "tempHp")).toBe(true);
    expect(restAdvice({ weather: { text: "Bitter cold", speed: 1 }, site: null, fire: false }).warnings.length).toBe(2);
    expect(restAdvice({ weather: { text: "Clear", speed: 1 }, fire: true, foughtAtNight: true }).rest).toBe("partial");
  });
});

describe("projects", () => {
  it("stops at checks, banks the rest, and finishes", () => {
    const p = { ...trainingProject("tool:thief", { intMod: 2 }), status: "active" as const };
    expect(p.hours).toBe(320);
    expect(p.checks.map((c) => c.at)).toEqual([0.25, 0.5, 0.75]);
    let r = advanceProject(p, 100, 1);
    expect(r.project.status).toBe("check");
    expect(r.project.done).toBe(80);
    expect(r.project.banked).toBe(20);
    const ok = resolveCheck(r.project, 20, 2);
    expect(ok.project.checks[0]!.result?.passed).toBe(true);
    // +20% for beating it by 5 (64 h), then the 20 banked hours run into the 50% check.
    expect(ok.project.done).toBe(160);
    expect(ok.project.status).toBe("check");
    expect(ok.project.banked).toBe(4);
    r = { project: ok.project, events: [] };
    const bad = resolveCheck(r.project, 1, 4);
    expect(bad.project.done).toBeLessThan(r.project.done);
    expect(bad.project.done).toBeGreaterThanOrEqual(80); // never below a passed check
  });

  it("finishes short projects in one go after their check", () => {
    const book = generateBook({ kind: "lore", seed: "l" });
    const start: Project = { ...studyProject(book), status: "active" };
    const p = advanceProject(start, start.hours, 1).project;
    expect(p.status).toBe("check");
    const done = resolveCheck(p, 20, 1).project;
    expect(done.status).toBe("done");
  });

  it("follows the training and crafting rules", () => {
    expect(trainingHours("lang:elvish", 0)).toBe(400);
    expect(trainingHours("lang:elvish", 9)).toBe(80);
    expect(trainingHours("skill:ath", 0)).toBe(600);
    expect(craftPlan({ name: "Longsword", kind: "gear", valueGp: 15 })).toMatchObject({ tool: "smith", gp: 8, hours: 16 });
    expect(craftPlan({ name: "Cloak of Protection", kind: "magic", valueGp: 300, rarity: "uncommon" })).toMatchObject({ hours: 80, gp: 200, ingredientCr: 1, tool: "leatherworker" });
    const c = craftProject({ name: "Potion of Healing", kind: "consumable", quantity: 1, valueGp: 50 }, { tool: "herb", hours: 8, gp: 15 });
    expect(c.reward?.kind).toBe("item");
    expect(c.checks[0]!.type).toBe("tool");
  });
});

describe("crafting materials", () => {
  it("recognizes materials by name", () => {
    expect(materialTagFor("Dire Wolf pelt")).toBe("hide");
    expect(materialTagFor("Young Red Dragon heart's blood (vial)")).toBe("essence");
    expect(materialTagFor("Wild herbs")).toBe("herbs");
    expect(materialTagFor("Silver ingot")).toBe("metal");
    expect(materialTagFor("Rope")).toBeUndefined();
  });

  it("matches recipe materials from the pack, cheapest first", () => {
    const stacks = [
      { id: "1", name: "Wild herbs", quantity: 1, valueGp: 1, tag: "herbs" as const },
      { id: "2", name: "Moonpetal", quantity: 3, valueGp: 5, tag: "herbs" as const },
      { id: "3", name: "Owlbear organs (preserved)", quantity: 1, valueGp: 20, sourceCr: 3 },
    ];
    const healing = RECIPES.find((r) => r.id === "healing")!;
    const m = matchMaterials(healing.materials, stacks);
    expect(m.ok).toBe(true);
    expect(m.use).toEqual([{ id: "1", name: "Wild herbs", quantity: 1, valueGp: 1 }, { id: "2", name: "Moonpetal", quantity: 1, valueGp: 5 }]);
    const greater = matchMaterials(RECIPES.find((r) => r.id === "greater-healing")!.materials, stacks);
    expect(greater.ok).toBe(true);
    expect(matchMaterials([{ tag: "scales", quantity: 1 }], stacks).missing).toEqual([{ tag: "scales", quantity: 1 }]);
    expect(rareIngredient(stacks, 1)?.id).toBe("3");
    expect(rareIngredient(stacks, 4)).toBeUndefined();
  });

  it("tags harvested parts with their source CR", () => {
    const parts = Array.from({ length: 20 }, (_, i) => generateLoot({ cr: 6, seed: `p${i}`, creatures: [{ name: "Owlbear", type: "monstrosity", cr: 3 }] }))
      .flatMap((l) => l.items.filter((it) => it.kind === "part"));
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) {
      expect(p.sourceCr).toBe(3);
      expect(p.material).toBeDefined();
    }
  });
});

describe("books", () => {
  it("writes skill, lore and spell books", () => {
    const skill = generateBook({ subject: "tool:thief", seed: "s" });
    expect(skill.kind).toBe("skill");
    expect(skill.title).toContain("Thieves' Tools");
    expect(generateBook({ kind: "lore", seed: "l" }).secret).toBeTruthy();
    expect(generateBook({ kind: "spells", tier: 3, seed: "w" }).spells!.length).toBeGreaterThan(1);
  });

  it("speeds training by 25% a book, up to 50%", () => {
    expect(trainingSpeed({}, "tool:thief")).toBe(1);
    expect(trainingSpeed({ "tool:thief": BOOK_BONUS }, "tool:thief")).toBe(1.25);
    expect(trainingSpeed({ "tool:thief": 0.75 }, "tool:thief")).toBe(1.5);
  });

  it("turns up in treasure", () => {
    const books = Array.from({ length: 40 }, (_, i) => generateLoot({ cr: 6, mode: "hoard", theme: "humanoid", seed: `b${i}` })).flatMap((l) => l.items.filter((it) => it.kind === "book"));
    expect(books.length).toBeGreaterThan(5);
    for (const b of books) expect(b.book?.hours).toBeGreaterThan(0);
  });
});
