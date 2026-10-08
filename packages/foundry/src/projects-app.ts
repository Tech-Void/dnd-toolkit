import {
  craftPlan,
  craftProject,
  customProject,
  LANGUAGE_LABELS,
  matchMaterials,
  MATERIAL_LABELS,
  nextCheck,
  progressLabel,
  RARITIES,
  rareIngredient,
  RECIPES,
  researchProject,
  SKILL_LABELS,
  studyProject,
  subjectLabel,
  TOOL_LABELS,
  toolLabel,
  trainingHours,
  trainingProject,
  withHours,
  type Book,
  type ForgedItem,
  type LootItem,
  type Project,
  type ProjectKind,
  type Rarity,
  type Subject,
} from "@dnd-toolkit/core";
import {
  approveProject,
  currentDay,
  focusId,
  getProjects,
  grantDowntime,
  hasTool,
  materialStacks,
  proposeProject,
  readBonus,
  rejectProject,
  removeProject,
  rollProjectCheck,
  rollText,
  saveProject,
  setDay,
  speedFor,
  workOn,
} from "./downtime.ts";
import { partyActors } from "./rolls.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Projects & downtime: every character's books, training and crafting as progress bars, the
// proposal bench for starting something new, and (for the GM) approvals and downtime days.

const { ApplicationV2 } = foundry.applications.api;

const KIND_ICON: Record<ProjectKind, string> = { study: "fa-book-open", train: "fa-dumbbell", craft: "fa-hammer", research: "fa-magnifying-glass", custom: "fa-wand-sparkles" };
const KIND_LABEL: Record<ProjectKind, string> = { study: "Read a book", train: "Train", craft: "Craft", research: "Research", custom: "Something else" };
const STATUS_LABEL: Record<Project["status"], string> = { proposed: "Awaiting approval", active: "In progress", check: "Check due", done: "Done", rejected: "Not approved" };

interface Draft {
  kind: ProjectKind;
  bookId?: string;
  subject?: Subject;
  recipe?: string;
  name?: string;
  value?: number;
  rarity?: Rarity | "";
  topic?: string;
  title?: string;
  hours?: number;
  pitch?: string;
  /** A Forge item to craft. */
  forged?: ForgedItem;
}

const myActors = () => (game.user.isGM ? partyActors() : game.actors.filter((a: any) => a.isOwner && a.type === "character"));
const intMod = (actor: any) => Number(actor.system?.abilities?.int?.mod ?? 0);
const gold = (actor: any) => Number(actor.system?.currency?.gp ?? 0);

export class ProjectsApp extends ApplicationV2 {
  static #instance: ProjectsApp | null = null;
  #actorId: string | null = null;
  #draft: Draft | null = null;
  #days = 1;

  static open(actorId?: string) {
    this.#instance ??= new ProjectsApp();
    if (actorId) this.#instance.#actorId = actorId;
    return this.#instance.render({ force: true });
  }

  static refresh() {
    if (this.#instance?.rendered) this.#instance.render();
  }

  /** From the Forge: start a crafting proposal for this item. */
  static craftForged(item: ForgedItem) {
    this.#instance ??= new ProjectsApp();
    this.#instance.#draft = { kind: "craft", recipe: "custom", name: item.name, value: item.valueGp, rarity: item.rarity, forged: item };
    return this.#instance.render({ force: true });
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-projects`,
    classes: [MODULE_ID, "dt-projects"],
    window: { title: "Projects & Downtime", icon: "fa-solid fa-book-open-reader", resizable: true },
    position: { width: 760, height: 760 },
    actions: {
      pickActor: ProjectsApp.#onPickActor,
      newProject: ProjectsApp.#onNew,
      draftKind: ProjectsApp.#onDraftKind,
      cancelDraft: ProjectsApp.#onCancelDraft,
      propose: ProjectsApp.#onPropose,
      rollCheck: ProjectsApp.#onRollCheck,
      focus: ProjectsApp.#onFocus,
      approve: ProjectsApp.#onApprove,
      reject: ProjectsApp.#onReject,
      pace: ProjectsApp.#onPace,
      addHours: ProjectsApp.#onAddHours,
      finish: ProjectsApp.#onFinish,
      remove: ProjectsApp.#onRemove,
      grant: ProjectsApp.#onGrant,
      dayShift: ProjectsApp.#onDayShift,
    },
  };

  #actor(): any {
    const actors = myActors();
    return actors.find((a: any) => a.id === this.#actorId) ?? actors[0] ?? null;
  }

  async _renderHTML() {
    const gm = game.user.isGM;
    const actors = myActors();
    const actor = this.#actor();
    const pending = gm ? actors.reduce((n: number, a: any) => n + getProjects(a).filter((p) => p.status === "proposed").length, 0) : 0;
    const top = `<div class="dt-proj-top">
      <span class="dt-day"><i class="fa-solid fa-calendar-day"></i> Day ${currentDay()}</span>
      ${gm ? `<span class="dt-day-shift"><a data-action="dayShift" data-by="-1" title="Back a day"><i class="fa-solid fa-minus"></i></a><a data-action="dayShift" data-by="1" title="Forward a day"><i class="fa-solid fa-plus"></i></a></span>
        <span class="dt-grant"><input type="number" min="1" max="60" value="${this.#days}" data-grant-days> <button type="button" data-action="grant" title="Each character puts 8 hours a day into their starred project"><i class="fa-solid fa-hourglass-half"></i> Grant downtime days</button></span>
        ${pending ? `<span class="dt-pending"><i class="fa-solid fa-bell"></i> ${pending} awaiting approval</span>` : ""}` : ""}
    </div>`;
    const tabs = `<div class="dt-proj-tabs">${actors.map((a: any) => {
      const n = getProjects(a).filter((p) => p.status === "proposed").length;
      return `<button type="button" class="${a.id === actor?.id ? "active" : ""}" data-action="pickActor" data-actor="${a.id}"><img src="${esc(a.img)}" alt=""> ${esc(a.name)}${gm && n ? ` <span class="dt-dot">${n}</span>` : ""}</button>`;
    }).join("")}</div>`;
    if (!actor) return `${top}<p class="dt-empty">No characters to show. Players see the characters they own; the GM sees every player character.</p>`;

    const projects = getProjects(actor);
    const order: Project["status"][] = ["check", "active", "proposed", "done", "rejected"];
    projects.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    const bonus = Object.entries(readBonus(actor)).filter(([, v]) => v > 0);
    const focus = focusId(actor);
    const open = projects.filter((p) => p.status !== "done" && p.status !== "rejected");
    const closed = projects.filter((p) => p.status === "done" || p.status === "rejected");
    return `${top}${tabs}
      <section class="dt-proj-body">
        ${bonus.length ? `<p class="dt-bonuses"><i class="fa-solid fa-book"></i> From books read: ${bonus.map(([s, v]) => `<span class="dt-tag good">${esc(subjectLabel(s))} +${Math.round(v * 100)}%</span>`).join(" ")}</p>` : ""}
        ${open.length ? open.map((p) => this.#card(actor, p, p.id === focus)).join("") : `<p class="dt-empty">No projects yet.</p>`}
        ${this.#draft ? this.#builderHtml(actor) : actor.isOwner ? `<button type="button" class="dt-new-project" data-action="newProject"><i class="fa-solid fa-plus"></i> Start a new project</button>` : ""}
        ${closed.length ? `<details class="dt-proj-done"><summary>Finished and declined (${closed.length})</summary>${closed.map((p) => this.#card(actor, p, false)).join("")}</details>` : ""}
      </section>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  #card(actor: any, p: Project, focused: boolean) {
    const gm = game.user.isGM;
    const owner = actor.isOwner;
    const pct = Math.round((p.done / Math.max(1, p.hours)) * 100);
    const speed = speedFor(actor, p);
    const check = nextCheck(p);
    const marks = p.checks.map((c) => `<span class="dt-mark ${c.result ? (c.result.passed ? "passed" : "failed") : ""}" style="left:${c.at * 100}%" title="${esc(c.why)}${c.result ? `: ${c.result.total} vs ${c.dc}` : ` (${rollText({ type: c.type, key: c.key, dc: c.dc })})`}"></span>`).join("");
    const reward = p.reward?.kind === "proficiency" ? `Reward: proficiency in ${subjectLabel(p.reward.subject)}`
      : p.reward?.kind === "item" ? `Makes: ${p.reward.item.quantity > 1 ? `${p.reward.item.quantity}× ` : ""}${p.reward.item.name}`
      : p.reward?.kind === "book" ? p.reward.book.kind === "skill" && p.reward.book.subject ? `Once read: training in ${subjectLabel(p.reward.book.subject)} goes 25% faster` : p.reward.book.kind === "spells" ? `Spells inside: ${(p.reward.book.spells ?? []).join(", ")}` : "Once read: something worth knowing"
      : "";
    const meta = [
      progressLabel(p),
      speed > 1 ? `×${speed} speed from books` : "",
      p.tool ? `${toolLabel(p.tool)}${hasTool(actor, p.tool) ? "" : " (missing!)"}` : "",
      p.cost?.gp ? `${p.cost.gp} gp` : "",
      p.cost?.materials.length ? p.cost.materials.map((m) => `${m.quantity}× ${m.name}`).join(", ") : "",
    ].filter(Boolean).map(esc).join(" · ");
    let actions = "";
    if (p.status === "check" && check) {
      actions = `<div class="dt-check-due"><i class="fa-solid fa-flag"></i> <strong>Check:</strong> ${esc(check.why)} (${esc(rollText({ type: check.type, key: check.key, dc: check.dc }))})
        ${owner ? `<button type="button" data-action="rollCheck" data-project="${p.id}"><i class="fa-solid fa-dice-d20"></i> Roll</button>` : ""}
        ${p.banked ? `<span class="dt-muted">${p.banked} h waiting</span>` : ""}</div>`;
    } else if (p.status === "proposed") {
      actions = gm
        ? `<div class="dt-approve">
            <label>Hours <input type="number" min="1" value="${p.hours}" data-edit-hours="${p.id}"></label>
            <span class="dt-pace"><a data-action="pace" data-project="${p.id}" data-by="0.5">Fast ×½</a><a data-action="pace" data-project="${p.id}" data-by="1.5">Slow ×1½</a></span>
            <label>Check DC <input type="number" min="5" max="30" value="${p.checks[0]?.dc ?? 12}" data-edit-dc="${p.id}"></label>
            <input type="text" placeholder="Note to the player (optional)" data-edit-note="${p.id}">
            <button type="button" data-action="approve" data-project="${p.id}"><i class="fa-solid fa-check"></i> Approve</button>
            <button type="button" data-action="reject" data-project="${p.id}"><i class="fa-solid fa-xmark"></i></button>
          </div>`
        : `<p class="dt-muted"><i class="fa-solid fa-hourglass"></i> Waiting for the GM. <a data-action="remove" data-project="${p.id}">Withdraw</a></p>`;
    } else if (p.status === "active" && gm) {
      actions = `<div class="dt-gm-row"><a data-action="addHours" data-project="${p.id}" data-hours="2">+2 h</a><a data-action="addHours" data-project="${p.id}" data-hours="8">+1 day</a><a data-action="addHours" data-project="${p.id}" data-hours="40">+1 week</a><a data-action="finish" data-project="${p.id}">Finish now</a></div>`;
    }
    return `<div class="dt-project status-${p.status}">
      <div class="dt-project-head">
        <i class="fa-solid ${KIND_ICON[p.kind]}"></i> <strong>${esc(p.title)}</strong>
        <span class="dt-badge ${p.status}">${STATUS_LABEL[p.status]}</span>
        ${p.status === "active" || p.status === "check" ? `<a class="dt-star ${focused ? "on" : ""}" data-action="focus" data-project="${p.id}" title="${focused ? "Downtime days go into this project" : "Put downtime days into this project"}"><i class="fa-${focused ? "solid" : "regular"} fa-star"></i></a>` : ""}
        ${(gm || p.status === "done" || p.status === "rejected") ? `<a class="dt-remove" data-action="remove" data-project="${p.id}" title="Remove"><i class="fa-solid fa-trash"></i></a>` : ""}
      </div>
      <div class="dt-pbar"><div class="dt-pfill" style="width:${pct}%"></div>${marks}<span class="dt-pct">${pct}%</span></div>
      <div class="dt-project-meta">${meta}</div>
      ${reward ? `<div class="dt-project-reward"><i class="fa-solid fa-gift"></i> ${esc(reward)}</div>` : ""}
      ${p.pitch ? `<div class="dt-pitch"><i class="fa-solid fa-quote-left"></i> ${esc(p.pitch)}</div>` : ""}
      ${p.note ? `<div class="dt-gm-note"><i class="fa-solid fa-crown"></i> ${esc(p.note)}</div>` : ""}
      ${actions}
      ${p.log.length > 1 ? `<details class="dt-log"><summary>Log</summary><ul>${p.log.slice().reverse().map((l) => `<li><span>Day ${l.day}</span> ${esc(l.text)}</li>`).join("")}</ul></details>` : ""}
    </div>`;
  }

  // --- The proposal bench -----------------------------------------------------------------

  #builderHtml(actor: any) {
    const d = this.#draft!;
    const kinds = (Object.keys(KIND_LABEL) as ProjectKind[]).map((k) => `<button type="button" class="${d.kind === k ? "active" : ""}" data-action="draftKind" data-kind="${k}"><i class="fa-solid ${KIND_ICON[k]}"></i> ${KIND_LABEL[k]}</button>`).join("");
    const preview = this.#preview(actor);
    return `<div class="dt-builder">
      <div class="dt-builder-kinds">${kinds}</div>
      <div class="dt-builder-body">${this.#fields(actor)}</div>
      ${preview ? `<div class="dt-builder-preview">
        <p><strong>${esc(preview.project.title)}</strong> · about ${preview.project.hours} hours${preview.speed > 1 ? ` (×${preview.speed} with your books, so ${Math.round(preview.project.hours / preview.speed)})` : ""} · ${preview.project.checks.length} check${preview.project.checks.length === 1 ? "" : "s"} along the way</p>
        <p class="dt-muted">That's about ${Math.ceil(preview.project.hours / preview.speed / 8)} downtime day${Math.ceil(preview.project.hours / preview.speed / 8) === 1 ? "" : "s"}, or ${Math.ceil(preview.project.hours / preview.speed / 2)} evenings in camp. The GM sets the final length.</p>
        ${preview.lines.map((l) => `<p class="${l.ok ? "dt-ok" : "dt-bad"}"><i class="fa-solid fa-${l.ok ? "check" : "xmark"}"></i> ${esc(l.text)}</p>`).join("")}
      </div>` : ""}
      <textarea data-draft="pitch" rows="2" placeholder="Your pitch to the GM: why, how, who's teaching you… (optional)">${esc(d.pitch ?? "")}</textarea>
      <div class="dt-builder-buttons">
        <button type="button" data-action="propose" ${preview ? "" : "disabled"}><i class="fa-solid fa-paper-plane"></i> Propose to the GM</button>
        <button type="button" data-action="cancelDraft">Cancel</button>
      </div>
    </div>`;
  }

  #fields(actor: any) {
    const d = this.#draft!;
    const opt = (v: string, label: string, sel?: string) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(label)}</option>`;
    if (d.kind === "study") {
      const books = this.#books(actor);
      return books.length
        ? `<label>Book <select data-draft="bookId"><option value="">Choose a book from your pack…</option>${books.map((b) => opt(b.id, b.name, d.bookId)).join("")}</select></label>
          ${d.bookId ? `<p class="dt-muted">${esc(books.find((b) => b.id === d.bookId)?.book.blurb ?? "")}</p>` : ""}`
        : `<p class="dt-muted">No books in ${esc(actor.name)}'s pack. Books turn up in treasure (and the GM can hand you one).</p>`;
    }
    if (d.kind === "train") {
      const group = (label: string, list: [string, string][]) => `<optgroup label="${label}">${list.map(([v, l]) => opt(v, l, d.subject)).join("")}</optgroup>`;
      return `<label>Learn <select data-draft="subject"><option value="">Choose a skill, tool or language…</option>
        ${group("Tools", Object.entries(TOOL_LABELS).map(([k, [l]]) => [`tool:${k}`, l]))}
        ${group("Languages", Object.entries(LANGUAGE_LABELS).filter(([k]) => k !== "common").map(([k, l]) => [`lang:${k}`, l]))}
        ${group("Skills (the GM's call)", Object.entries(SKILL_LABELS).map(([k, l]) => [`skill:${k}`, l]))}
      </select></label><p class="dt-muted">You'll need a teacher or a good book; the GM decides what counts.</p>`;
    }
    if (d.kind === "craft") {
      const cats = [...new Set(RECIPES.map((r) => r.category))];
      return `<label>Make <select data-draft="recipe"><option value="">Choose a recipe…</option>
        ${cats.map((c) => `<optgroup label="${c[0]!.toUpperCase()}${c.slice(1)}">${RECIPES.filter((r) => r.category === c).map((r) => opt(r.id, r.name, d.recipe)).join("")}</optgroup>`).join("")}
        ${opt("custom", "Something else (any item)…", d.recipe)}
      </select></label>
      ${d.recipe === "custom" ? `<div class="dt-row">
        <label>Item <input type="text" data-draft="name" value="${esc(d.name ?? "")}" placeholder="e.g. Longsword, Cloak of Elvenkind"></label>
        <label>Price (gp) <input type="number" min="0" data-draft="value" value="${d.value ?? ""}"></label>
        <label>Magic <select data-draft="rarity">${opt("", "Not magic", d.rarity ?? "")}${RARITIES.map((r) => opt(r, r, d.rarity ?? "")).join("")}</select></label>
      </div>` : ""}
      ${d.recipe && d.recipe !== "custom" ? `<p class="dt-muted">${esc(RECIPES.find((r) => r.id === d.recipe)?.note ?? "")}</p>` : ""}`;
    }
    if (d.kind === "research") return `<label>What do you want to find out? <input type="text" data-draft="topic" value="${esc(d.topic ?? "")}" placeholder="e.g. who forged the black blade"></label><label>Hours <input type="number" min="1" data-draft="hours" value="${d.hours ?? 24}"></label>`;
    return `<label>What are you doing? <input type="text" data-draft="title" value="${esc(d.title ?? "")}" placeholder="e.g. Build a raft, write a ballad, earn the guild's trust"></label><label>Hours <input type="number" min="1" data-draft="hours" value="${d.hours ?? 16}"></label>`;
  }

  /** Books in the pack: toolkit books, plus anything that looks like one. */
  #books(actor: any): { id: string; name: string; book: Book }[] {
    return [...actor.items]
      .map((i: any) => {
        const book: Book | undefined = i.getFlag?.(MODULE_ID, "book");
        if (book) return { id: i.id, name: i.name, book };
        if (i.type === "loot" && /book|tome|manual|journal|grimoire|treatise|diary|codex|primer/i.test(i.name)) {
          return { id: i.id, name: i.name, book: { seed: i.id, kind: "lore", title: i.name, author: "", hours: 8, valueGp: 0, blurb: "A book from the pack; the GM decides what's in it." } as Book };
        }
        return null;
      })
      .filter(Boolean) as { id: string; name: string; book: Book }[];
  }

  /** The project this draft would propose, and what's ready or missing. */
  #preview(actor: any): { project: Project; speed: number; lines: { ok: boolean; text: string }[] } | null {
    const d = this.#draft!;
    const day = currentDay();
    const lines: { ok: boolean; text: string }[] = [];
    let project: Project | null = null;
    if (d.kind === "study" && d.bookId) {
      const b = this.#books(actor).find((x) => x.id === d.bookId);
      if (b) project = studyProject(b.book, { day });
    } else if (d.kind === "train" && d.subject) {
      const [kind, key = ""] = d.subject.split(":");
      const already = kind === "skill" ? (actor.system?.skills?.[key]?.value ?? 0) >= 1 : kind === "tool" ? !!actor.system?.tools?.[key]?.value : (actor.system?.traits?.languages?.value ?? []).includes?.(key);
      if (already && kind !== "skill") lines.push({ ok: false, text: `${actor.name} already knows ${subjectLabel(d.subject)}.` });
      project = trainingProject(d.subject, { day, intMod: intMod(actor), already: kind === "skill" && already });
      lines.push({ ok: true, text: `${trainingHours(d.subject, intMod(actor), already)} hours (ten workweeks, less one per point of Intelligence modifier).` });
    } else if (d.kind === "craft" && d.recipe) {
      const stacks = materialStacks(actor);
      if (d.recipe !== "custom") {
        const r = RECIPES.find((x) => x.id === d.recipe)!;
        const match = matchMaterials(r.materials, stacks);
        lines.push({ ok: hasTool(actor, r.tool), text: `${toolLabel(r.tool)}${hasTool(actor, r.tool) ? "" : ": you don't have them"}` });
        for (const m of r.materials) {
          const miss = match.missing.find((x) => x.tag === m.tag);
          lines.push({ ok: !miss, text: `${m.quantity}× ${MATERIAL_LABELS[m.tag]}${miss ? `: short by ${miss.quantity}` : `: ${match.use.filter((u) => stacks.find((s) => s.id === u.id && (s.tag ?? "") === m.tag) || true).map((u) => `${u.quantity}× ${u.name}`).join(", ")}`}` });
        }
        if (r.gp) lines.push({ ok: gold(actor) >= r.gp, text: `${r.gp} gp (you have ${gold(actor)})` });
        project = craftProject({ ...r.output, quantity: r.output.quantity } as LootItem, { day, tool: r.tool, hours: r.hours, gp: r.gp, dc: r.dc, materials: match.use.map((u) => ({ name: u.name, quantity: u.quantity })) });
      } else if (d.name?.trim() && (d.value ?? 0) >= 0) {
        const item: LootItem = d.forged
          ? { name: d.forged.name, kind: "magic", quantity: 1, valueGp: d.forged.valueGp, rarity: d.forged.rarity, forged: d.forged }
          : { name: d.name.trim(), kind: d.rarity ? "magic" : "gear", quantity: 1, valueGp: d.value ?? 0, rarity: d.rarity || undefined };
        const plan = craftPlan(item);
        lines.push({ ok: hasTool(actor, plan.tool), text: `${toolLabel(plan.tool)}${hasTool(actor, plan.tool) ? "" : ": you don't have them"}` });
        lines.push({ ok: gold(actor) >= plan.gp, text: `${plan.gp} gp in materials (you have ${gold(actor)})` });
        const materials: { name: string; quantity: number }[] = [];
        if (plan.ingredientCr !== undefined) {
          const rare = rareIngredient(stacks, plan.ingredientCr);
          lines.push({ ok: !!rare, text: rare ? `Rare ingredient: ${rare.name}` : `A rare ingredient from a creature of CR ${plan.ingredientCr} or higher (harvest one!)` });
          if (rare) materials.push({ name: rare.name, quantity: 1 });
          lines.push({ ok: true, text: "Magic items also need the formula and usually a spellcaster's touch; the GM decides." });
        }
        project = craftProject(item, { day, tool: plan.tool, hours: plan.hours, gp: plan.gp, dc: plan.dc, materials });
      }
    } else if (d.kind === "research" && d.topic?.trim()) {
      project = researchProject(d.topic.trim(), { day, hours: d.hours });
    } else if (d.kind === "custom" && d.title?.trim()) {
      project = customProject(d.title.trim(), { day, hours: d.hours });
    }
    if (!project) return null;
    return { project: { ...project, pitch: d.pitch?.trim() || undefined }, speed: speedFor(actor, project), lines };
  }

  _onRender() {
    const root = this.element as HTMLElement;
    for (const el of root.querySelectorAll("[data-draft]") as NodeListOf<HTMLInputElement>) {
      const read = () => {
        if (!this.#draft) return;
        const key = el.dataset.draft as keyof Draft;
        (this.#draft as any)[key] = el.type === "number" ? Number(el.value) : el.value;
      };
      el.addEventListener("input", read);
      // Changing a choice redraws the preview.
      if (el.tagName === "SELECT" || el.type === "number") el.addEventListener("change", () => {
        read();
        this.render();
      });
    }
    const days = root.querySelector("[data-grant-days]") as HTMLInputElement | null;
    days?.addEventListener("change", () => (this.#days = Math.max(1, Number(days.value) || 1)));
  }

  // --- Actions ------------------------------------------------------------------------

  static #onPickActor(this: ProjectsApp, _e: Event, target: HTMLElement) {
    this.#actorId = target.dataset.actor!;
    this.#draft = null;
    this.render();
  }

  static #onNew(this: ProjectsApp) {
    this.#draft = { kind: "study" };
    this.render();
  }

  static #onDraftKind(this: ProjectsApp, _e: Event, target: HTMLElement) {
    this.#draft = { kind: target.dataset.kind as ProjectKind, pitch: this.#draft?.pitch };
    this.render();
  }

  static #onCancelDraft(this: ProjectsApp) {
    this.#draft = null;
    this.render();
  }

  static async #onPropose(this: ProjectsApp) {
    const actor = this.#actor();
    const preview = actor && this.#draft ? this.#preview(actor) : null;
    if (!preview) return;
    await proposeProject(actor, preview.project);
    this.#draft = null;
    ui.notifications.info("Proposed. The GM will set how long it takes.");
    this.render();
  }

  static async #onRollCheck(this: ProjectsApp, _e: Event, target: HTMLElement) {
    target.setAttribute("disabled", "");
    await rollProjectCheck(this.#actor(), target.dataset.project!);
  }

  static async #onFocus(this: ProjectsApp, _e: Event, target: HTMLElement) {
    await this.#actor()?.setFlag(MODULE_ID, "focus", target.dataset.project);
    this.render();
  }

  #project(target: HTMLElement): Project | undefined {
    return getProjects(this.#actor()).find((p) => p.id === target.dataset.project);
  }

  static async #onApprove(this: ProjectsApp, _e: Event, target: HTMLElement) {
    const actor = this.#actor();
    const p = this.#project(target);
    if (!p) return;
    const root = this.element as HTMLElement;
    const hours = Number((root.querySelector(`[data-edit-hours="${p.id}"]`) as HTMLInputElement)?.value) || p.hours;
    const dc = Number((root.querySelector(`[data-edit-dc="${p.id}"]`) as HTMLInputElement)?.value) || undefined;
    const note = (root.querySelector(`[data-edit-note="${p.id}"]`) as HTMLInputElement)?.value.trim() || undefined;
    const edited = { ...withHours(p, hours), checks: p.checks.map((c) => ({ ...c, dc: dc ?? c.dc })) };
    await approveProject(actor, edited, note);
  }

  static async #onReject(this: ProjectsApp, _e: Event, target: HTMLElement) {
    const p = this.#project(target);
    const note = ((this.element as HTMLElement).querySelector(`[data-edit-note="${p?.id}"]`) as HTMLInputElement)?.value.trim() || undefined;
    if (p) await rejectProject(this.#actor(), p, note);
  }

  static #onPace(this: ProjectsApp, _e: Event, target: HTMLElement) {
    const input = (this.element as HTMLElement).querySelector(`[data-edit-hours="${target.dataset.project}"]`) as HTMLInputElement | null;
    if (input) input.value = String(Math.max(1, Math.round(Number(input.value) * Number(target.dataset.by))));
  }

  static async #onAddHours(this: ProjectsApp, _e: Event, target: HTMLElement) {
    const events = await workOn(this.#actor(), target.dataset.project!, Number(target.dataset.hours));
    if (events.length) ui.notifications.info(events.join(" "));
  }

  static async #onFinish(this: ProjectsApp, _e: Event, target: HTMLElement) {
    const p = this.#project(target);
    if (!p) return;
    await saveProject(this.#actor(), { ...p, done: p.hours, status: "done", checks: p.checks.map((c) => c.result ? c : { ...c, result: { total: 0, passed: true, text: "Waved through by the GM." } }), log: [...p.log, { day: currentDay(), text: "Finished (by the GM)." }] });
  }

  static async #onRemove(this: ProjectsApp, _e: Event, target: HTMLElement) {
    await removeProject(this.#actor(), target.dataset.project!);
  }

  static async #onGrant(this: ProjectsApp) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Grant downtime" },
      content: `<p>Give everyone <strong>${this.#days} day${this.#days > 1 ? "s" : ""}</strong> of downtime? Each character puts 8 hours a day into their starred project, and the day counter moves forward.</p>`,
      rejectClose: false,
    });
    if (ok) await grantDowntime(partyActors(), this.#days);
  }

  static async #onDayShift(this: ProjectsApp, _e: Event, target: HTMLElement) {
    await setDay(currentDay() + Number(target.dataset.by));
    this.render();
  }
}
