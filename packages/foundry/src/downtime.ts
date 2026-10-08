import {
  advanceProject,
  boonsFor,
  campContext,
  createRng,
  LANGUAGE_LABELS,
  materialTagFor,
  resolveActivity,
  resolveCheck,
  restAdvice,
  scavengeFind,
  SKILL_LABELS,
  startNight,
  subjectLabel,
  TOOL_LABELS,
  trainingSpeed,
  BOOK_BONUS,
  MAX_BOOK_BONUS,
  type ActivityId,
  type Boon,
  type CampState,
  type LootItem,
  type MaterialStack,
  type Project,
  type RollSpec,
} from "@dnd-toolkit/core";
import { compendiumItem, resolveItemData } from "./importers/items.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// The shared plumbing for camp and downtime: the camp lives in a world setting the GM writes
// (players send their choices over the socket), projects live on each character, and the day
// counter moves only when the GM says so.

const SOCKET = `module.${MODULE_ID}`;
const gmIds = () => game.users.filter((u: any) => u.isGM).map((u: any) => u.id);

export function registerDowntimeSettings(onCampChange: () => void) {
  game.settings.register(MODULE_ID, "camp", { scope: "world", config: false, type: Object, default: null, onChange: onCampChange });
  game.settings.register(MODULE_ID, "day", { scope: "world", config: false, type: Number, default: 1, onChange: () => Hooks.callAll(`${MODULE_ID}.downtimeChanged`) });
}

export const getCamp = (): CampState | null => game.settings.get(MODULE_ID, "camp") ?? null;
export const currentDay = (): number => game.settings.get(MODULE_ID, "day") ?? 1;
export const setDay = (n: number) => game.settings.set(MODULE_ID, "day", Math.max(1, Math.round(n)));

async function saveCamp(state: CampState | null) {
  await game.settings.set(MODULE_ID, "camp", state ? structuredClone(state) : null);
}

// --- Rolling from a character's own sheet ---------------------------------------------------

/** Roll a skill, ability check, save or tool check for an actor; returns the total (null if cancelled). */
export async function rollSpec(actor: any, spec: Pick<RollSpec, "type" | "key"> | { type: "tool"; key: string }, flavor: string): Promise<number | null> {
  const opts = { flavor };
  let roll: any;
  if (spec.type === "skill") roll = await actor.rollSkill?.(spec.key, opts);
  else if (spec.type === "save") roll = await actor.rollAbilitySave?.(spec.key, opts);
  else if (spec.type === "check") roll = await actor.rollAbilityTest?.(spec.key, opts);
  else {
    const [label, ability] = TOOL_LABELS[spec.key] ?? [spec.key, "int"];
    const item = [...(actor.items ?? [])].find((i: any) => i.type === "tool" && (i.system?.type?.baseItem === spec.key || i.name.toLowerCase() === label.toLowerCase()));
    roll = item?.rollToolCheck ? await item.rollToolCheck(opts) : actor.rollToolCheck ? await actor.rollToolCheck(spec.key, opts) : await actor.rollAbilityTest?.(ability, opts);
  }
  const r = Array.isArray(roll) ? roll[0] : roll;
  return typeof r?.total === "number" ? r.total : null;
}

/** "Survival DC 12", "Smith's Tools DC 14". */
export function rollText(spec: { type: string; key: string; dc?: number }): string {
  const abilities: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  const label = spec.type === "skill" ? SKILL_LABELS[spec.key] ?? spec.key
    : spec.type === "tool" ? TOOL_LABELS[spec.key]?.[0] ?? spec.key
    : spec.type === "save" ? `${abilities[spec.key] ?? spec.key} save` : `${abilities[spec.key] ?? spec.key} check`;
  return `${label}${spec.dc ? ` DC ${spec.dc}` : ""}`;
}

// --- Camp actions ---------------------------------------------------------------------------

export type CampAction =
  | { type: "vote"; actorId: string; site: number }
  | { type: "job"; actorId: string; job: ActivityId | null; target?: string; projectId?: string }
  | { type: "watch"; actorId: string; watch: number }
  | { type: "result"; actorId: string; total: number }
  | { type: "eventRoll"; eventId: string; actorId: string; name: string; total: number }
  | { type: "fire"; on: boolean };

/** GM-only steps. */
export type CampCommand =
  | { type: "chooseSite"; site: number }
  | { type: "toNight" }
  | { type: "reveal" }
  | { type: "toMorning" }
  | { type: "clearResult"; actorId: string }
  | { type: "settle"; eventId: string; passed: boolean };

/** Apply a player's choice to the camp (pure: returns the new state). */
export function applyCampAction(s: CampState, a: CampAction): CampState {
  const state: CampState = structuredClone(s);
  const camper = "actorId" in a ? state.campers.find((c) => c.actorId === a.actorId) : undefined;
  switch (a.type) {
    case "vote":
      if (state.phase === "site" && camper) state.votes[a.actorId] = a.site;
      break;
    case "job":
      if (state.phase === "setup" && camper && !camper.result) {
        camper.job = a.job ?? undefined;
        camper.target = a.target;
        camper.projectId = a.projectId;
      }
      break;
    case "watch":
      if ((state.phase === "setup" || state.phase === "night") && camper) camper.watch = a.watch;
      break;
    case "result": {
      if (state.phase !== "setup" || !camper?.job || camper.result) break;
      const target = state.campers.find((c) => c.actorId === camper.target);
      camper.result = resolveActivity(camper.job, a.total, camper, {
        ...campContext(state), trackFood: state.trackFood, targetName: target?.name, seed: `${state.seed}:${camper.actorId}`,
      });
      break;
    }
    case "eventRoll": {
      const out = (state.outcomes[a.eventId] ??= { text: "", passed: null, rolls: [] });
      if (!out.rolls.some((r) => r.name === a.name)) out.rolls.push({ name: a.name, total: a.total });
      const ev = state.night?.events.find((e) => e.id === a.eventId);
      const spec = ev?.check ?? ev?.save;
      if (ev && spec) {
        // Checks: anyone on watch spotting it is enough. Saves: it's per person, so the text lists who failed.
        if (ev.check) {
          const passed = out.rolls.some((r) => r.total >= spec.dc);
          out.passed = passed;
          out.text = passed ? ev.onSuccess : ev.onFailure;
        } else {
          const failed = out.rolls.filter((r) => r.total < spec.dc).map((r) => r.name);
          out.passed = !failed.length;
          out.text = failed.length ? `${failed.join(", ")}: ${ev.onFailure}` : ev.onSuccess;
        }
      }
      break;
    }
    case "fire":
      if (state.phase === "setup") state.fire = a.on;
      break;
  }
  return state;
}

export function applyCampCommand(s: CampState, c: CampCommand): CampState {
  let state: CampState = structuredClone(s);
  switch (c.type) {
    case "chooseSite":
      state.site = c.site;
      state.phase = "setup";
      break;
    case "toNight":
      state = startNight(state);
      break;
    case "reveal":
      state.revealed = Math.min((state.night?.watches.length ?? 0), state.revealed + 1);
      break;
    case "toMorning":
      state.revealed = state.night?.watches.length ?? 0;
      state.phase = "morning";
      break;
    case "clearResult": {
      const camper = state.campers.find((x) => x.actorId === c.actorId);
      if (camper) camper.result = undefined;
      break;
    }
    case "settle": {
      const ev = state.night?.events.find((e) => e.id === c.eventId);
      if (ev) state.outcomes[c.eventId] = { ...(state.outcomes[c.eventId] ?? { rolls: [] }), passed: c.passed, text: c.passed ? ev.onSuccess : ev.onFailure };
      break;
    }
  }
  return state;
}

/** Players: send a choice to the GM (or apply it, if we are the GM). */
export async function campAct(action: CampAction) {
  if (game.user.isGM) {
    const s = getCamp();
    if (s) await saveCamp(applyCampAction(s, action));
  } else game.socket.emit(SOCKET, { kind: "campAct", userId: game.user.id, action });
}

export async function campCommand(command: CampCommand) {
  const s = getCamp();
  if (game.user.isGM && s) await saveCamp(applyCampCommand(s, command));
}

export async function startCamp(state: CampState) {
  await saveCamp(state);
  ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content: `<p><i class="fa-solid fa-campground"></i> <strong>The party makes camp</strong> (day ${state.day}). Pick a spot!</p>` });
}

export const cancelCamp = () => saveCamp(null);

/** GM side: players' camp choices arrive here. Only actors the sender owns are accepted. */
export function initDowntimeSocket() {
  game.socket.on(SOCKET, async (msg: any) => {
    if (msg?.kind !== "campAct" || !game.users.activeGM?.isSelf) return;
    const user = game.users.get(msg.userId);
    const a: CampAction = msg.action;
    if ("actorId" in a) {
      const actor = game.actors.get(a.actorId);
      if (!actor || !user || !actor.testUserPermission(user, "OWNER")) return;
    }
    const s = getCamp();
    if (s) await saveCamp(applyCampAction(s, a));
  });
}

// --- Inventory helpers ----------------------------------------------------------------------

/** Add something to an actor's pack, stacking with a same-named item. */
export async function addToInventory(actor: any, item: LootItem) {
  const same = [...actor.items].find((i: any) => i.name === item.name && i.type !== "class" && i.type !== "spell");
  if (same && "quantity" in (same.system ?? {})) return same.update({ "system.quantity": (same.system.quantity ?? 1) + item.quantity });
  return actor.createEmbeddedDocuments("Item", [await resolveItemData(item)]);
}

/** Materials in an actor's pack: anything tagged by the toolkit, or that looks like a material by name. */
export function materialStacks(actor: any): MaterialStack[] {
  return [...(actor.items ?? [])]
    .filter((i: any) => ["loot", "consumable"].includes(i.type))
    .map((i: any): MaterialStack => ({
      id: i.id, name: i.name, quantity: i.system?.quantity ?? 1,
      valueGp: i.system?.price?.denomination === "gp" || !i.system?.price?.denomination ? Number(i.system?.price?.value ?? 0) : 0,
      tag: i.getFlag?.(MODULE_ID, "material") ?? materialTagFor(i.name), sourceCr: i.getFlag?.(MODULE_ID, "sourceCr"),
    }))
    .filter((s) => s.tag || s.sourceCr !== undefined);
}

/** Use up quantities of items by id. */
export async function consumeItems(actor: any, use: { id: string; quantity: number }[]) {
  for (const u of use) {
    const item = actor.items.get(u.id);
    if (!item) continue;
    const left = (item.system?.quantity ?? 1) - u.quantity;
    if (left > 0) await item.update({ "system.quantity": left });
    else await item.delete();
  }
}

/** Does the actor have this tool (an item, or a proficiency)? */
export function hasTool(actor: any, key: string): boolean {
  const label = TOOL_LABELS[key]?.[0]?.toLowerCase();
  return !!actor.system?.tools?.[key]?.value || [...(actor.items ?? [])].some((i: any) => i.type === "tool" && (i.system?.type?.baseItem === key || i.name.toLowerCase() === label));
}

const gp = (actor: any) => Number(actor.system?.currency?.gp ?? 0);

// --- Projects -------------------------------------------------------------------------------

export const getProjects = (actor: any): Project[] => structuredClone(actor.getFlag(MODULE_ID, "projects") ?? []);
/** Speed bonuses from books read, by subject. */
export const readBonus = (actor: any): Record<string, number> => actor.getFlag(MODULE_ID, "studied") ?? {};
export const focusId = (actor: any): string | undefined => {
  const all = getProjects(actor);
  const f = actor.getFlag(MODULE_ID, "focus");
  return all.find((p) => p.id === f && (p.status === "active" || p.status === "check"))?.id ?? all.find((p) => p.status === "active" || p.status === "check")?.id;
};

/** Save one project; if this finished it, hand out the reward. */
export async function saveProject(actor: any, project: Project) {
  const all = getProjects(actor);
  const prev = all.find((p) => p.id === project.id);
  const next = prev ? all.map((p) => (p.id === project.id ? project : p)) : [...all, project];
  await actor.setFlag(MODULE_ID, "projects", next);
  if (project.status === "done" && prev?.status !== "done") await completeProject(actor, project);
  Hooks.callAll(`${MODULE_ID}.downtimeChanged`);
}

export async function removeProject(actor: any, id: string) {
  await actor.setFlag(MODULE_ID, "projects", getProjects(actor).filter((p) => p.id !== id));
  Hooks.callAll(`${MODULE_ID}.downtimeChanged`);
}

/** Hours of work go further with books read on the subject. */
export const speedFor = (actor: any, p: Project) => (p.kind === "train" && p.subject ? trainingSpeed(readBonus(actor), p.subject) : 1);

/** Put hours into a project (book bonuses applied). */
export async function workOn(actor: any, id: string, hours: number): Promise<string[]> {
  const p = getProjects(actor).find((x) => x.id === id);
  if (!p) return [];
  const { project, events } = advanceProject(p, hours * speedFor(actor, p), currentDay());
  await saveProject(actor, project);
  return events;
}

/** The owner rolls the check a project is waiting on. */
export async function rollProjectCheck(actor: any, id: string) {
  const p = getProjects(actor).find((x) => x.id === id);
  const check = p?.checks.find((c) => !c.result);
  if (!p || !check || p.status !== "check") return;
  const total = await rollSpec(actor, { type: check.type === "tool" ? "tool" : check.type, key: check.key } as any, `${p.title}: ${check.why}`);
  if (total === null) return;
  const { project, text } = resolveCheck(p, total, currentDay());
  await saveProject(actor, project);
  ui.notifications.info(`${p.title}: ${text}`);
}

/** Players: propose a project (the GM gets a whisper). */
export async function proposeProject(actor: any, project: Project) {
  await saveProject(actor, { ...project, status: "proposed", createdDay: currentDay() });
  ChatMessage.create({
    speaker: { alias: actor.name },
    whisper: [...new Set([...gmIds(), game.user.id])],
    content: `<p><i class="fa-solid fa-feather"></i> <strong>${esc(actor.name)}</strong> proposes a project: <strong>${esc(project.title)}</strong> (${project.hours} h suggested).${project.pitch ? `<br><em>${esc(project.pitch)}</em>` : ""}</p><p><small>Open Projects to approve it.</small></p>`,
  });
}

/** GM: approve, paying its gold and materials from the character. */
export async function approveProject(actor: any, project: Project, note?: string) {
  const warnings: string[] = [];
  if (project.cost?.gp) {
    if (gp(actor) < project.cost.gp) warnings.push(`${actor.name} only has ${gp(actor)} gp of the ${project.cost.gp} gp needed; the rest is on credit.`);
    await actor.update({ "system.currency.gp": Math.max(0, gp(actor) - project.cost.gp) });
  }
  if (project.cost?.materials.length) {
    const use = project.cost.materials.map((m) => ({ id: [...actor.items].find((i: any) => i.name === m.name)?.id, quantity: m.quantity })).filter((u) => u.id) as { id: string; quantity: number }[];
    await consumeItems(actor, use);
  }
  const day = currentDay();
  await saveProject(actor, { ...project, status: "active", note, log: [...project.log, { day, text: `Approved: ${project.hours} hours${project.cost?.gp ? `, ${project.cost.gp} gp` : ""}.` }] });
  for (const w of warnings) ui.notifications.warn(w);
  ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: actorWhisper(actor), content: `<p><i class="fa-solid fa-check"></i> The GM approved <strong>${esc(project.title)}</strong> for ${esc(actor.name)}: ${project.hours} hours.${note ? `<br><em>${esc(note)}</em>` : ""}</p>` });
}

export async function rejectProject(actor: any, project: Project, note?: string) {
  await saveProject(actor, { ...project, status: "rejected", note, log: [...project.log, { day: currentDay(), text: "Not approved." }] });
  ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: actorWhisper(actor), content: `<p>The GM passed on <strong>${esc(project.title)}</strong>.${note ? ` <em>${esc(note)}</em>` : ""}</p>` });
}

const actorWhisper = (actor: any) => [...new Set([...gmIds(), ...game.users.filter((u: any) => !u.isGM && actor.testUserPermission(u, "OWNER")).map((u: any) => u.id)])];

/** Hand out what a finished project earns. */
async function completeProject(actor: any, p: Project) {
  const r = p.reward;
  let detail = "";
  if (r?.kind === "book") {
    const b = r.book;
    if (b.kind === "skill" && b.subject) {
      const read: string[] = actor.getFlag(MODULE_ID, "readBooks") ?? [];
      if (!read.includes(b.title)) {
        const studied = readBonus(actor);
        const now = Math.min(MAX_BOOK_BONUS, (studied[b.subject] ?? 0) + BOOK_BONUS);
        await actor.setFlag(MODULE_ID, "studied", { ...studied, [b.subject]: now });
        await actor.setFlag(MODULE_ID, "readBooks", [...read, b.title]);
        detail = `Training in ${subjectLabel(b.subject)} now goes ${Math.round(now * 100)}% faster.`;
      } else detail = "They'd read it before; it's a good refresher, nothing more.";
    } else if (b.kind === "lore") {
      detail = "They learned something.";
      ChatMessage.create({ speaker: { alias: b.title }, whisper: actorWhisper(actor), content: `<p><strong>${esc(actor.name)} learns:</strong> ${esc(b.secret ?? "")}</p>` });
    } else if (b.spells?.length) {
      const wizard = [...actor.items].some((i: any) => i.type === "class" && /wizard/i.test(i.name));
      const added: string[] = [];
      if (wizard) {
        for (const name of b.spells) {
          if ([...actor.items].some((i: any) => i.type === "spell" && i.name === name)) continue;
          const spell = await compendiumItem(name);
          if (spell?.type !== "spell") continue;
          const data = spell.toObject();
          delete data._id;
          data.system.preparation = { ...data.system.preparation, mode: "prepared", prepared: false };
          await actor.createEmbeddedDocuments("Item", [data]);
          added.push(name);
        }
      }
      detail = added.length ? `Copied into their spellbook: ${added.join(", ")}. (Copying normally costs 50 gp per spell level, if you use that rule.)` : `It holds ${b.spells.join(", ")}.`;
    }
  } else if (r?.kind === "proficiency") {
    const [kind, key = ""] = r.subject.split(":");
    if (kind === "skill") {
      const cur = actor.system?.skills?.[key]?.value ?? 0;
      await actor.update({ [`system.skills.${key}.value`]: cur >= 1 ? 2 : 1 });
      detail = cur >= 1 ? `Expertise in ${subjectLabel(r.subject)}.` : `Proficient in ${subjectLabel(r.subject)}.`;
    } else if (kind === "tool") {
      await actor.update({ [`system.tools.${key}`]: { ...(actor.system?.tools?.[key] ?? {}), value: 1, ability: TOOL_LABELS[key]?.[1] ?? "int" } });
      detail = `Proficient with ${subjectLabel(r.subject)}.`;
    } else {
      const langs = new Set<string>(actor.system?.traits?.languages?.value ?? []);
      langs.add(key);
      await actor.update({ "system.traits.languages.value": [...langs] });
      detail = `Speaks ${LANGUAGE_LABELS[key] ?? key}.`;
    }
  } else if (r?.kind === "item") {
    await addToInventory(actor, r.item);
    detail = `${r.item.quantity > 1 ? `${r.item.quantity}× ` : ""}${r.item.name} added to their pack.`;
  } else if (p.kind === "research" || p.kind === "custom") {
    detail = "The GM will tell them what came of it.";
    ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, whisper: gmIds(), content: `<p>${esc(actor.name)} finished <strong>${esc(p.title)}</strong>. Time to tell them what they found.</p>` });
  }
  ChatMessage.create({
    speaker: { alias: actor.name },
    content: `<div class="dt-done-card"><p><i class="fa-solid fa-star"></i> <strong>${esc(actor.name)}</strong> finished <strong>${esc(p.title)}</strong>!</p>${detail ? `<p>${esc(detail)}</p>` : ""}</div>`,
  });
  await logJourney(`${actor.name} finished ${p.title}. ${detail}`);
}

/** GM: give everyone a number of downtime days; each character's focused project gets 8 hours a day. */
export async function grantDowntime(actors: any[], days: number) {
  const lines: string[] = [];
  for (const actor of actors) {
    const id = focusId(actor);
    if (!id) continue;
    const p = getProjects(actor).find((x) => x.id === id)!;
    const events = await workOn(actor, id, days * 8);
    const after = getProjects(actor).find((x) => x.id === id)!;
    lines.push(`<li><strong>${esc(actor.name)}</strong>: ${esc(p.title)}, ${Math.round((after.done / after.hours) * 100)}%${events.length ? ` (${esc(events.join(" "))})` : ""}</li>`);
  }
  await setDay(currentDay() + days);
  ChatMessage.create({ speaker: { alias: "DnD Toolkit" }, content: `<p><i class="fa-solid fa-hourglass-half"></i> <strong>${days} day${days > 1 ? "s" : ""} of downtime</strong> (now day ${currentDay()}).</p>${lines.length ? `<ul>${lines.join("")}</ul>` : ""}` });
  await logJourney(`${days} day${days > 1 ? "s" : ""} of downtime.`);
}

// --- The journey log --------------------------------------------------------------------------

/** Append a line to the Journey Log journal, under today's page. */
export async function logJourney(line: string, day = currentDay()) {
  let journal = game.journal.find((j: any) => j.getFlag(MODULE_ID, "kind") === "journeyLog");
  journal ??= await JournalEntry.create({ name: "Journey Log", flags: { [MODULE_ID]: { kind: "journeyLog" } }, ownership: { default: 2 } });
  const name = `Day ${day}`;
  const page = journal.pages.find((p: any) => p.name === name);
  const li = `<li>${esc(line)}</li>`;
  if (page) await page.update({ "text.content": (page.text.content ?? "").replace(/<\/ul>\s*$/, `${li}</ul>`) || `<ul>${li}</ul>` });
  else await journal.createEmbeddedDocuments("JournalEntryPage", [{ name, type: "text", sort: day * 100, text: { content: `<ul>${li}</ul>` } }]);
}

// --- Breaking camp ------------------------------------------------------------------------------

export type RestMode = "full" | "partial" | "none";

/** GM: apply the night (rest, boons, food, project hours), post the morning report, and close camp. */
export async function breakCamp(s: CampState, mode: RestMode) {
  const rng = createRng(`${s.seed}:morning`);
  const lines: string[] = [];
  const actors = s.campers.map((c) => game.actors.get(c.actorId)).filter(Boolean);
  for (const actor of actors) {
    if (mode === "full") await actor.longRest?.({ dialog: false, chat: false, newDay: true });
    else if (mode === "partial") await actor.shortRest?.({ dialog: false, chat: false, autoHD: false });
  }
  for (const c of s.campers) {
    const actor = game.actors.get(c.actorId);
    if (!actor) continue;
    const got: string[] = [];
    for (const b of boonsFor(s, c.actorId)) got.push(...(await applyBoon(actor, b, s, rng, mode)));
    if (s.trackFood) got.push(await eat(actor, s));
    if (c.job === "study" && c.projectId) {
      const events = await workOn(actor, c.projectId, 2);
      const p = getProjects(actor).find((x) => x.id === c.projectId);
      if (p) got.push(`${p.title}: ${Math.round((p.done / p.hours) * 100)}%${events.length ? ` (${events.join(" ")})` : ""}`);
    }
    lines.push(`<li><strong>${esc(c.name)}</strong>${got.filter(Boolean).length ? `: ${got.filter(Boolean).map(esc).join("; ")}` : ""}</li>`);
  }
  const events = (s.night?.events ?? []).map((e) => s.outcomes[e.id]?.text ? `${e.text} ${s.outcomes[e.id]!.text}` : e.text);
  const restLabel = { full: "a full long rest", partial: "a broken night (short rest only)", none: "no rest at all" }[mode];
  await ChatMessage.create({
    speaker: { alias: "DnD Toolkit" },
    content: `<div class="dt-morning-card"><h3><i class="fa-solid fa-sun"></i> Morning, day ${s.day + 1}</h3>
      <p>${esc(s.site !== null ? s.sites[s.site]!.name : "Camp")}: ${esc(restLabel)}.</p>
      ${events.length ? `<p><em>${events.map(esc).join(" ")}</em></p>` : ""}<ul>${lines.join("")}</ul></div>`,
  });
  await logJourney(`Camped at ${s.site !== null ? s.sites[s.site]!.name : "camp"} (${s.weather.text.toLowerCase()}): ${restLabel}.${events.length ? ` ${events.join(" ")}` : ""}`, s.day);
  await setDay(s.day + 1);
  await saveCamp(null);
}

async function applyBoon(actor: any, b: Boon, s: CampState, rng: ReturnType<typeof createRng>, mode: RestMode): Promise<string[]> {
  switch (b.kind) {
    case "tempHp": {
      const temp = actor.system?.attributes?.hp?.temp ?? 0;
      if ((b.amount ?? 0) > temp) await actor.update({ "system.attributes.hp.temp": b.amount });
      return [`${b.amount} temp HP`];
    }
    case "inspiration":
      await actor.update({ "system.attributes.inspiration": true });
      return ["inspired"];
    case "hitDie": {
      if (mode === "none") return [];
      let left = b.amount ?? 1;
      for (const cls of [...actor.items].filter((i: any) => i.type === "class")) {
        const used = cls.system?.hitDiceUsed ?? 0;
        const back = Math.min(used, left);
        if (back) await cls.update({ "system.hitDiceUsed": used - back });
        left -= back;
        if (!left) break;
      }
      return [`+${b.amount} Hit ${b.amount === 1 ? "Die" : "Dice"}`];
    }
    case "rations":
      await addToInventory(actor, { name: "Rations (1 day)", kind: "gear", quantity: b.amount ?? 1, valueGp: 0.5 });
      return [`+${b.amount} rations`];
    case "material":
      if (b.item) await addToInventory(actor, { name: b.item.name, kind: "part", quantity: b.item.quantity, valueGp: b.item.valueGp, material: b.item.material });
      return [b.text];
    case "loot": {
      const finds = scavengeFind(rng, s.partyLevel).slice(0, b.amount ?? 1);
      for (const f of finds) await addToInventory(actor, { name: f.name, kind: "trinket", quantity: 1, valueGp: f.valueGp });
      return [`found ${finds.map((f) => f.name.toLowerCase()).join(" and ")}`];
    }
    case "note":
      return [b.text];
    default:
      return [];
  }
}

/** Eat a ration if there is one. */
async function eat(actor: any, s: CampState): Promise<string> {
  const ration = [...actor.items].find((i: any) => /ration/i.test(i.name) && (i.system?.quantity ?? 0) > 0);
  if (!ration) return "went hungry (no rations)";
  const left = (ration.system.quantity ?? 1) - 1;
  if (left > 0) await ration.update({ "system.quantity": left });
  else await ration.delete();
  return s.site !== null && s.sites[s.site]!.water ? "ate (fresh water nearby)" : "ate and drank";
}

/** The GM's suggestion for the morning, from how the night went. */
export function campAdvice(s: CampState) {
  const fought = (s.night?.events ?? []).some((e) => e.kind === "encounter");
  const badWeather = (s.night?.events ?? []).some((e) => e.kind === "weather");
  return restAdvice({ weather: s.weather, site: s.site === null ? null : s.sites[s.site], fire: s.fire, foughtAtNight: fought, badWeatherNight: badWeather });
}

/** Rations each camper has, for the food tracker. */
export const rationsOf = (actor: any) => [...(actor?.items ?? [])].filter((i: any) => /ration/i.test(i.name)).reduce((n: number, i: any) => n + (i.system?.quantity ?? 0), 0);
