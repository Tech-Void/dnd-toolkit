import { createRng } from "./rng.ts";
import { subjectLabel, TOOL_LABELS, type Book, type Subject } from "./books.ts";
import type { LootItem } from "./loot.ts";
import type { Rarity } from "./data/treasure.ts";

// ---------------------------------------------------------------------------
// Downtime projects: reading, training, crafting, research. Each one is a bar that fills a few hours
// at a time (evenings in camp, downtime days the GM hands out), with checks along the way that can
// speed it up or set it back. Players propose; the GM approves and sets how long it takes.

export type ProjectKind = "study" | "train" | "craft" | "research" | "custom";
export type ProjectStatus = "proposed" | "active" | "check" | "done" | "rejected";

/** A check partway through: progress stops here until it's rolled. */
export interface ProjectCheck {
  /** Fraction of the way through (0-1). */
  at: number;
  type: "skill" | "check" | "tool";
  /** Skill code, ability, or dnd5e tool key. */
  key: string;
  dc: number;
  /** What it's for, in words. */
  why: string;
  result?: { total: number; passed: boolean; text: string };
}

export type ProjectReward =
  | { kind: "proficiency"; subject: Subject }
  | { kind: "item"; item: LootItem }
  | { kind: "book"; book: Book }
  | { kind: "note"; text: string };

export interface Project {
  id: string;
  kind: ProjectKind;
  title: string;
  /** What's being trained or studied. */
  subject?: Subject;
  /** Hours of work in total, and done so far. */
  hours: number;
  done: number;
  /** Hours earned past a check that's waiting to be rolled; added once it is. */
  banked: number;
  status: ProjectStatus;
  checks: ProjectCheck[];
  /** Gold and materials it consumes when the GM approves it. */
  cost?: { gp: number; materials: { name: string; quantity: number }[] };
  /** The tool it needs (dnd5e key), for crafting. */
  tool?: string;
  reward?: ProjectReward;
  /** What happened along the way, newest last. */
  log: { day: number; text: string }[];
  /** The player's pitch, for the GM. */
  pitch?: string;
  /** The GM's note back. */
  note?: string;
  createdDay: number;
}

const pct = (n: number) => Math.round(n * 100);
export const projectId = () => Math.floor(Math.random() * 36 ** 8).toString(36).padStart(8, "0");

// --- How long things take (the GM can change any of it when approving) ---------------

/** Learning a tool or language: ten workweeks (400 hours), less a workweek per point of Intelligence modifier. */
export function trainingHours(subject: Subject, intMod = 0, already = false): number {
  const kind = subject.split(":")[0];
  if (kind === "skill") return Math.max(240, (already ? 1000 : 600) - 40 * intMod);
  return Math.max(80, 400 - 40 * intMod);
}

/** XGtE workweeks to craft a magic item, by rarity; the gold it costs; the CR of the creature its rare ingredient comes from. */
export const MAGIC_CRAFT: Record<Rarity, { weeks: number; gp: number; minCr: number }> = {
  common: { weeks: 1, gp: 50, minCr: 1 },
  uncommon: { weeks: 2, gp: 200, minCr: 1 },
  rare: { weeks: 10, gp: 2000, minCr: 4 },
  "very rare": { weeks: 25, gp: 20000, minCr: 9 },
  legendary: { weeks: 50, gp: 100000, minCr: 13 },
};

/** Hours to craft: 10 gp of progress per 8-hour day for ordinary things, workweeks by rarity for magic ones. */
export function craftingHours(valueGp: number, rarity?: Rarity): number {
  if (rarity) return MAGIC_CRAFT[rarity].weeks * 40;
  return Math.max(2, Math.ceil(valueGp / 10) * 8);
}

/** Checks along the way: one for short jobs, two for long ones, three for the very long. */
export function defaultChecks(kind: ProjectKind, hours: number, roll: { type: ProjectCheck["type"]; key: string }, dc: number): ProjectCheck[] {
  const marks = hours <= 16 ? [0.5] : hours <= 120 ? [1 / 3, 2 / 3] : [0.25, 0.5, 0.75];
  const why: Record<ProjectKind, string[]> = {
    study: ["make sense of a dense chapter", "puzzle out the author's shorthand", "work through the hardest section"],
    train: ["get past a plateau", "master a tricky technique", "prove it under pressure"],
    craft: ["get a delicate step right", "fix a flaw before it sets", "finish without ruining it"],
    research: ["find the right source", "untangle conflicting accounts", "put the pieces together"],
    custom: ["push through", "keep at it", "see it through"],
  };
  return marks.map((at, i) => ({ at, ...roll, dc, why: why[kind][i % 3]! }));
}

// --- Progress ---------------------------------------------------------------------------

/** The next check that hasn't been rolled. */
export const nextCheck = (p: Project) => p.checks.find((c) => !c.result);

/**
 * Put hours into a project (already multiplied by any speed bonus). It stops at an unrolled check
 * (the rest is banked) and finishes at its total. Returns a new project and what happened.
 */
export function advanceProject(p: Project, hours: number, day: number): { project: Project; events: string[] } {
  const project: Project = { ...p, checks: p.checks.map((c) => ({ ...c })), log: [...p.log] };
  const events: string[] = [];
  if (project.status !== "active" && project.status !== "check") return { project, events };
  if (project.status === "check") {
    project.banked += hours;
    return { project, events };
  }
  let left = hours + project.banked;
  project.banked = 0;
  const check = nextCheck(project);
  const stop = check ? check.at * project.hours : project.hours;
  const step = Math.min(left, Math.max(0, stop - project.done));
  project.done = round(project.done + step);
  left -= step;
  if (check && project.done >= stop - 1e-6) {
    project.status = "check";
    project.banked = round(left);
    events.push(`Reached ${pct(check.at)}%: a check to ${check.why}.`);
    project.log.push({ day, text: `Reached ${pct(check.at)}% and needs a check to ${check.why}.` });
  } else if (project.done >= project.hours - 1e-6) {
    project.done = project.hours;
    project.status = "done";
    events.push("Finished!");
    project.log.push({ day, text: "Finished." });
  } else if (step > 0) {
    project.log.push({ day, text: `+${round(step)} hours (${pct(project.done / project.hours)}%).` });
  }
  return { project, events };
}

/**
 * Roll the waiting check. A success is a breakthrough (+10% of the project, +20% if by 5 or more);
 * a failure is a setback (-5%, or -10% and wasted materials if by 5 or more). Banked hours then apply.
 */
export function resolveCheck(p: Project, total: number, day: number): { project: Project; text: string; events: string[] } {
  const project: Project = { ...p, checks: p.checks.map((c) => ({ ...c })), log: [...p.log] };
  const check = nextCheck(project);
  if (!check || project.status !== "check") return { project, text: "", events: [] };
  const margin = total - check.dc;
  const passed = margin >= 0;
  const swing = passed ? (margin >= 5 ? 0.2 : 0.1) : margin <= -5 ? -0.1 : -0.05;
  const text = passed
    ? margin >= 5 ? "A real breakthrough: everything clicks into place." : "Good progress: it comes together."
    : margin <= -5 ? `A bad setback${project.kind === "craft" ? ", and some materials are ruined (10% of the cost again)" : ""}.` : "A frustrating setback.";
  check.result = { total, passed, text };
  const before = project.done;
  // A setback can't undo a check already passed.
  const floor = Math.max(0, ...project.checks.filter((c) => c.result && c !== check).map((c) => c.at * project.hours));
  project.done = round(Math.max(floor, Math.min(project.hours, project.done + swing * project.hours)));
  project.status = "active";
  project.log.push({ day, text: `${passed ? "✓" : "✗"} ${check.why}: ${total} vs DC ${check.dc}. ${text} (${project.done > before ? "+" : ""}${round(project.done - before)} h)` });
  const events = [text];
  // Carry on with banked hours (which may run into the next check or finish it).
  const banked = project.banked;
  project.banked = 0;
  if (project.done >= project.hours - 1e-6 && !nextCheck(project)) {
    project.done = project.hours;
    project.status = "done";
    project.log.push({ day, text: "Finished." });
    events.push("Finished!");
    return { project, text, events };
  }
  const next = advanceProject(project, banked, day);
  return { project: next.project, text, events: [...events, ...next.events] };
}

const round = (n: number) => Math.round(n * 10) / 10;

// --- Building proposals -------------------------------------------------------------------

export interface ProposalOptions {
  day?: number;
  pitch?: string;
}

/** Read a book. Skill books make training that subject faster once finished. */
export function studyProject(book: Book, o: ProposalOptions = {}): Project {
  const dc = book.kind === "spells" ? 13 : book.kind === "lore" ? 11 : 12;
  const key = book.kind === "spells" ? "arc" : book.kind === "lore" ? "his" : "inv";
  return base("study", `Read: ${book.title}`, book.hours, defaultChecks("study", book.hours, { type: "skill", key }, dc), o, {
    subject: book.subject, reward: { kind: "book", book },
  });
}

/** Learn a skill, tool or language. */
export function trainingProject(subject: Subject, o: ProposalOptions & { intMod?: number; already?: boolean } = {}): Project {
  const hours = trainingHours(subject, o.intMod ?? 0, o.already);
  const [kind, key = ""] = subject.split(":");
  const roll = kind === "skill" ? { type: "skill" as const, key } : kind === "tool" ? { type: "tool" as const, key } : { type: "check" as const, key: "int" };
  return base("train", `Train: ${subjectLabel(subject)}${o.already ? " (expertise)" : ""}`, hours, defaultChecks("train", hours, roll, 12), o, {
    subject, reward: { kind: "proficiency", subject },
  });
}

/** Make something. `tool` is a dnd5e tool key; materials and gold are consumed on approval. */
export function craftProject(item: LootItem, o: ProposalOptions & { tool: string; hours?: number; gp: number; materials?: { name: string; quantity: number }[]; dc?: number }): Project {
  const hours = o.hours ?? craftingHours(item.valueGp, item.kind === "magic" ? item.rarity : undefined);
  const dc = o.dc ?? (item.kind === "magic" ? 10 + ["common", "uncommon", "rare", "very rare", "legendary"].indexOf(item.rarity ?? "common") * 3 + 2 : 12);
  return base("craft", `Craft: ${item.quantity > 1 ? `${item.quantity}× ` : ""}${item.name}`, hours, defaultChecks("craft", hours, { type: "tool", key: o.tool }, dc), o, {
    tool: o.tool, cost: { gp: o.gp, materials: o.materials ?? [] }, reward: { kind: "item", item },
  });
}

/** Dig into a question: libraries, sages, rumors. */
export function researchProject(topic: string, o: ProposalOptions & { hours?: number; dc?: number } = {}): Project {
  const hours = o.hours ?? 24;
  return base("research", `Research: ${topic}`, hours, defaultChecks("research", hours, { type: "skill", key: "inv" }, o.dc ?? 13), o, {
    reward: { kind: "note", text: `The GM reveals what was learned about ${topic}.` },
  });
}

/** Anything else the player dreams up. */
export function customProject(title: string, o: ProposalOptions & { hours?: number; key?: string; dc?: number } = {}): Project {
  const hours = o.hours ?? 16;
  return base("custom", title, hours, defaultChecks("custom", hours, { type: "check", key: o.key ?? "int" }, o.dc ?? 12), o, {});
}

function base(kind: ProjectKind, title: string, hours: number, checks: ProjectCheck[], o: ProposalOptions, extra: Partial<Project>): Project {
  return {
    id: projectId(), kind, title, hours, done: 0, banked: 0, status: "proposed", checks, log: [{ day: o.day ?? 1, text: "Proposed." }],
    pitch: o.pitch, createdDay: o.day ?? 1, ...extra,
  };
}

/** Change a proposal's length (keeping its checks at the same fractions). */
export const withHours = (p: Project, hours: number): Project => ({ ...p, hours: Math.max(1, Math.round(hours)) });

/** "12 / 40 h · 30%" */
export const progressLabel = (p: Project) => `${round(p.done)} / ${p.hours} h · ${pct(p.done / Math.max(1, p.hours))}%`;

/** The dnd5e tool label for a key. */
export const toolLabel = (key?: string) => (key ? TOOL_LABELS[key]?.[0] ?? key : "");

/** A seeded id, for tests and generated projects. */
export const seededId = (seed: string | number) => createRng(seed).int(0, 36 ** 8).toString(36).padStart(8, "0");
