import {
  activityAvailable,
  activityDc,
  boonsFor,
  CAMP_ACTIVITIES,
  campContext,
  leadingSite,
  onWatch,
  rationsNeeded,
  TERRAINS,
  type ActivityId,
  type Boon,
  type Camper,
  type CampState,
  type NightEvent,
} from "@dnd-toolkit/core";
import {
  breakCamp,
  campAct,
  campAdvice,
  campCommand,
  cancelCamp,
  getCamp,
  getProjects,
  rationsOf,
  rollSpec,
  rollText,
  type RestMode,
} from "./downtime.ts";
import { ToolkitApp } from "./app.ts";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// The camp window everyone at the table shares: vote on a spot, drag your character onto a job,
// roll for it from your own sheet, take a watch, and watch the night play out.

const { ApplicationV2 } = foundry.applications.api;

const PHASES: [CampState["phase"], string, string][] = [
  ["site", "Choose a spot", "fa-map-pin"],
  ["setup", "Set up camp", "fa-campground"],
  ["night", "The night", "fa-moon"],
  ["morning", "Morning", "fa-sun"],
];

const BOON_ICON: Record<Boon["kind"], string> = {
  tempHp: "fa-heart-circle-plus", inspiration: "fa-star", hitDie: "fa-dice-d6", rations: "fa-drumstick-bite", material: "fa-leaf", note: "fa-circle-info", exhaustion: "fa-face-tired", loot: "fa-gem",
};

const mine = (actorId: string) => !!game.actors.get(actorId)?.isOwner;

export class CampApp extends ApplicationV2 {
  static #instance: CampApp | null = null;
  /** The camp this user closed the window on (so it doesn't keep popping back up). */
  static #dismissed: string | null = null;
  /** Click-to-assign: the camper picked up. */
  #held: string | null = null;
  #rest: RestMode | null = null;

  static open() {
    this.#instance ??= new CampApp();
    this.#dismissed = null;
    return this.#instance.render({ force: true });
  }

  /** The camp changed: show it to everyone (unless they closed it), or close when it's over. */
  static refresh() {
    const s = getCamp();
    if (!s) {
      this.#instance?.close();
      return;
    }
    if (this.#instance?.rendered) this.#instance.render();
    else if (this.#dismissed !== s.id) this.open();
  }

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-camp`,
    classes: [MODULE_ID, "dt-camp"],
    window: { title: "Camp", icon: "fa-solid fa-campground", resizable: true },
    position: { width: 900, height: 760 },
    actions: {
      vote: CampApp.#onVote,
      chooseSite: CampApp.#onChooseSite,
      fire: CampApp.#onFire,
      hold: CampApp.#onHold,
      assignJob: CampApp.#onAssignJob,
      clearJob: CampApp.#onClearJob,
      rollJob: CampApp.#onRollJob,
      clearResult: CampApp.#onClearResult,
      assignWatch: CampApp.#onAssignWatch,
      toNight: CampApp.#onToNight,
      reveal: CampApp.#onReveal,
      toMorning: CampApp.#onToMorning,
      rollEvent: CampApp.#onRollEvent,
      settle: CampApp.#onSettle,
      fight: CampApp.#onFight,
      breakCamp: CampApp.#onBreakCamp,
      cancelCamp: CampApp.#onCancel,
    },
  };

  async close(options?: object) {
    CampApp.#dismissed = getCamp()?.id ?? null;
    return super.close(options);
  }

  // --- Rendering ----------------------------------------------------------------------

  async _renderHTML() {
    const s = getCamp();
    if (!s) return `<p class="dt-empty">No one is camping right now.</p>`;
    const gm = game.user.isGM;
    const site = campContext(s).site;
    const step = PHASES.findIndex(([p]) => p === s.phase);
    const stepper = PHASES.map(([, label, icon], i) => `<span class="dt-camp-step ${i === step ? "active" : i < step ? "done" : ""}"><i class="fa-solid ${icon}"></i> ${label}</span>`).join('<i class="fa-solid fa-chevron-right dt-camp-sep"></i>');
    const header = `
      <header class="dt-camp-head">
        <div class="dt-camp-title"><i class="fa-solid fa-campground"></i> <strong>Day ${s.day}</strong> · ${esc(TERRAINS[s.terrain].label)} · ${esc(s.weather.text)}${site ? ` · ${esc(site.name)}` : ""}</div>
        ${s.weather.effect ? `<div class="dt-camp-weather"><i class="fa-solid fa-cloud"></i> ${esc(s.weather.effect)}</div>` : ""}
        <div class="dt-camp-steps">${stepper}</div>
      </header>`;
    const body = s.phase === "site" ? this.#siteHtml(s, gm) : s.phase === "setup" ? this.#setupHtml(s, gm) : s.phase === "night" ? this.#nightHtml(s) : this.#morningHtml(s, gm);
    const footer = gm ? `<footer class="dt-camp-gm"><span class="dt-camp-gm-label"><i class="fa-solid fa-crown"></i> GM</span>${this.#gmButtons(s)}<button type="button" class="dt-camp-cancel" data-action="cancelCamp" title="End camp without applying anything"><i class="fa-solid fa-xmark"></i> Cancel camp</button></footer>` : "";
    return `<div class="dt-camp-shell">${header}<div class="dt-camp-body">${body}</div>${footer}</div>`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  #portrait(c: Camper, extra = "") {
    const drag = mine(c.actorId) || game.user.isGM;
    return `<span class="dt-chip ${this.#held === c.actorId ? "held" : ""} ${extra}" ${drag ? `draggable="true" data-drag-actor="${c.actorId}" data-action="hold" data-actor="${c.actorId}"` : ""} title="${esc(c.name)}">
      <img src="${esc(c.img)}" alt=""><span>${esc(c.name.split(" ")[0]!)}</span></span>`;
  }

  #siteHtml(s: CampState, gm: boolean) {
    const lead = leadingSite(s);
    const myVotes = s.campers.filter((c) => mine(c.actorId));
    return `
      <p class="dt-camp-hint">Where do you bed down tonight? ${myVotes.length ? "Vote for a spot." : ""}</p>
      <div class="dt-site-grid">${s.sites.map((site, i) => {
        const voters = s.campers.filter((c) => s.votes[c.actorId] === i);
        return `<div class="dt-site ${Object.keys(s.votes).length && i === lead ? "leading" : ""}">
          <h3>${esc(site.name)}</h3>
          <p class="dt-site-text">${esc(site.text)}</p>
          <div class="dt-site-tags">
            ${site.shelter ? `<span class="dt-tag good"><i class="fa-solid fa-house"></i> Shelter</span>` : `<span class="dt-tag"><i class="fa-solid fa-cloud-rain"></i> Open sky</span>`}
            ${site.water ? `<span class="dt-tag good"><i class="fa-solid fa-droplet"></i> Water</span>` : ""}
            ${site.hidden ? `<span class="dt-tag good"><i class="fa-solid fa-eye-slash"></i> Hidden</span>` : ""}
            ${site.mods.scavenge ? `<span class="dt-tag"><i class="fa-solid fa-magnifying-glass"></i> Something to find</span>` : ""}
          </div>
          <p class="dt-perk"><i class="fa-solid fa-plus"></i> ${esc(site.perk)}</p>
          ${site.risk ? `<p class="dt-risk"><i class="fa-solid fa-minus"></i> ${esc(site.risk)}</p>` : ""}
          <div class="dt-voters">${voters.map((c) => this.#portrait(c, "small")).join("")}</div>
          <div class="dt-site-buttons">
            ${myVotes.length ? `<button type="button" data-action="vote" data-site="${i}"><i class="fa-solid fa-hand"></i> Vote</button>` : ""}
            ${gm ? `<button type="button" data-action="chooseSite" data-site="${i}"><i class="fa-solid fa-campground"></i> Camp here</button>` : ""}
          </div>
        </div>`;
      }).join("")}</div>`;
  }

  #setupHtml(s: CampState, gm: boolean) {
    const ctx = campContext(s);
    const ids = Object.keys(CAMP_ACTIVITIES) as ActivityId[];
    const cards = ids.map((id) => {
      const a = CAMP_ACTIVITIES[id];
      const ok = activityAvailable(id, ctx);
      const dc = activityDc(id, ctx);
      const who = s.campers.filter((c) => c.job === id);
      return `<div class="dt-job ${ok ? "" : "disabled"}" ${ok ? `data-drop-job="${id}" data-action="assignJob" data-job="${id}"` : ""} title="${esc(a.blurb)}">
        <div class="dt-job-head"><i class="fa-solid ${a.icon}"></i> <strong>${esc(a.label)}</strong></div>
        <div class="dt-job-roll">${a.roll ? esc(rollText({ ...a.roll, dc: dc ?? undefined })) : a.project ? "2 hours of progress" : "No roll"}</div>
        <p class="dt-job-blurb">${esc(ok ? a.blurb : a.fire ? "Needs a fire." : "Nothing to search for here.")}</p>
        <div class="dt-job-who">${who.map((c) => this.#portrait(c, "small")).join("")}</div>
      </div>`;
    }).join("");

    const rows = s.campers.map((c) => {
      const a = c.job ? CAMP_ACTIVITIES[c.job] : null;
      const owner = mine(c.actorId);
      const others = s.campers.filter((o) => o.actorId !== c.actorId);
      const projects = a?.project ? getProjects(game.actors.get(c.actorId) ?? { getFlag: () => [] }).filter((p) => p.status === "active" || p.status === "check") : [];
      const pick = a?.target
        ? `<select data-camp-target="${c.actorId}" ${owner && !c.result ? "" : "disabled"}><option value="">Who?</option>${others.map((o) => `<option value="${o.actorId}" ${c.target === o.actorId ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>`
        : a?.project
          ? projects.length
            ? `<select data-camp-project="${c.actorId}" ${owner ? "" : "disabled"}><option value="">Which project?</option>${projects.map((p) => `<option value="${p.id}" ${c.projectId === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>`
            : `<span class="dt-muted">No approved projects yet (open Projects to propose one).</span>`
          : "";
      const result = c.result
        ? `<span class="dt-result ${c.result.success ? "ok" : "bad"}">${a?.roll ? `${c.result.total} vs ${c.result.dc} ${c.result.success ? "✓" : "✗"} · ` : ""}${esc(c.result.text)}</span>${gm ? ` <a data-action="clearResult" data-actor="${c.actorId}" title="Let them roll again"><i class="fa-solid fa-rotate-left"></i></a>` : ""}`
        : a?.roll && (owner || gm)
          ? `<button type="button" class="dt-roll-btn" data-action="rollJob" data-actor="${c.actorId}"><i class="fa-solid fa-dice-d20"></i> Roll ${esc(rollText({ ...a.roll, dc: activityDc(c.job!, ctx) ?? undefined }))}</button>`
          : a && !a.roll && (owner || gm)
            ? `<button type="button" class="dt-roll-btn" data-action="rollJob" data-actor="${c.actorId}"><i class="fa-solid fa-check"></i> Settle in</button>`
            : `<span class="dt-muted">${a ? "Waiting to roll…" : "Choosing…"}</span>`;
      return `<div class="dt-camper-row">
        ${this.#portrait(c)}
        <div class="dt-camper-job">${a ? `<i class="fa-solid ${a.icon}"></i> ${esc(a.label)}${owner && !c.result ? ` <a data-action="clearJob" data-actor="${c.actorId}" title="Pick something else"><i class="fa-solid fa-xmark"></i></a>` : ""}` : `<span class="dt-muted">${owner ? "Drag your portrait onto a job (or click it, then the job)" : "No job yet"}</span>`}</div>
        <div class="dt-camper-pick">${pick}</div>
        <div class="dt-camper-result">${result}</div>
      </div>`;
    }).join("");

    const need = rationsNeeded(s.campers.length, ctx.site);
    const have = s.campers.reduce((n, c) => n + rationsOf(game.actors.get(c.actorId)), 0);
    const food = s.trackFood
      ? `<div class="dt-camp-food ${have < need.food ? "short" : ""}"><i class="fa-solid fa-drumstick-bite"></i> Tonight needs ${need.food} ration${need.food === 1 ? "" : "s"}${need.water ? ` and ${need.water} skins of water` : " (fresh water here)"}; the party carries ${have}.${have < need.food ? " Someone goes hungry unless the foragers and hunters come through." : ""}</div>`
      : "";
    return `
      <div class="dt-camp-bar">
        <button type="button" class="dt-fire ${s.fire ? "lit" : ""}" data-action="fire" title="${s.fire ? "Put the fire out: harder to spot, but no hot food or songs" : "Light a fire: hot food and songs, but it can be seen"}"><i class="fa-solid fa-fire"></i> ${s.fire ? "Fire lit" : "No fire"}</button>
        <span class="dt-muted">${s.fire ? "Warm light and hot food, but it can be seen from a long way off." : "Cold and dark, but harder to find."}</span>
      </div>
      ${food}
      <h3 class="dt-camp-h"><i class="fa-solid fa-list-check"></i> The evening's jobs</h3>
      <div class="dt-job-grid">${cards}</div>
      <h3 class="dt-camp-h"><i class="fa-solid fa-users"></i> The party</h3>
      <div class="dt-camper-rows">${rows}</div>
      <h3 class="dt-camp-h"><i class="fa-solid fa-eye"></i> Watches <small>(drag portraits between watches)</small></h3>
      ${this.#watchesHtml(s, false)}`;
  }

  #watchesHtml(s: CampState, night: boolean) {
    const n = night && s.night ? s.night.watches.length : Math.max(2, Math.min(4, s.campers.length));
    const labels = s.night?.watches.map((w) => w.label) ?? ["First watch", "Second watch", "Third watch", "Dawn watch"].slice(0, n);
    return `<div class="dt-watch-row">${labels.slice(0, n).map((label, i) => {
      const revealed = night && i < s.revealed;
      const current = night && i === s.revealed - 1;
      const events = night && revealed ? (s.night?.events ?? []).filter((e) => e.watch === i) : [];
      return `<div class="dt-watch ${revealed ? "revealed" : ""} ${current ? "current" : ""}" data-drop-watch="${i}" data-action="assignWatch" data-watch="${i}">
        <div class="dt-watch-label">${esc(label)}</div>
        <div class="dt-watch-who">${onWatch(s, i).map((c) => this.#portrait(c, "small")).join("") || `<span class="dt-muted">Nobody</span>`}</div>
        ${revealed ? `<p class="dt-watch-flavor"><em>${esc(s.night!.watches[i]!.flavor)}</em></p>` : night ? `<p class="dt-muted"><i class="fa-solid fa-moon"></i> …</p>` : ""}
        ${events.map((e) => this.#eventHtml(s, e)).join("")}
      </div>`;
    }).join("")}</div>`;
  }

  #eventHtml(s: CampState, e: NightEvent) {
    const gm = game.user.isGM;
    const out = s.outcomes[e.id];
    const spec = e.check ?? e.save;
    const rollers = e.save ? s.campers : onWatch(s, e.watch);
    const rolled = new Set(out?.rolls.map((r) => r.name));
    const icons: Record<NightEvent["kind"], string> = { encounter: "fa-dragon", visitor: "fa-person-walking", thief: "fa-mask", weather: "fa-cloud-showers-heavy", omen: "fa-eye", alarm: "fa-bell" };
    return `<div class="dt-night-event ${e.kind}">
      <p><i class="fa-solid ${icons[e.kind]}"></i> <strong>${esc(e.text)}</strong></p>
      ${spec ? `<p class="dt-sub">${e.save ? "Everyone" : "The watch"}: ${esc(rollText(spec))}</p>
        <div class="dt-event-rolls">${rollers.filter((c) => !rolled.has(c.name) && (mine(c.actorId) || gm)).map((c) => `<button type="button" data-action="rollEvent" data-event="${e.id}" data-actor="${c.actorId}"><i class="fa-solid fa-dice-d20"></i> ${esc(c.name)}</button>`).join("")}
        ${(out?.rolls ?? []).map((r) => `<span class="dt-result ${r.total >= spec.dc ? "ok" : "bad"}">${esc(r.name)} ${r.total}</span>`).join("")}</div>` : ""}
      ${out?.text ? `<p class="dt-outcome ${out.passed ? "ok" : "bad"}">${esc(out.text)}</p>` : ""}
      ${gm ? `<div class="dt-event-gm">
        ${spec ? `<button type="button" data-action="settle" data-event="${e.id}" data-passed="1" title="Call it a success"><i class="fa-solid fa-check"></i></button><button type="button" data-action="settle" data-event="${e.id}" data-passed="0" title="Call it a failure"><i class="fa-solid fa-xmark"></i></button>` : ""}
        ${e.encounter ? `<button type="button" data-action="fight" data-event="${e.id}"><i class="fa-solid fa-dragon"></i> The fight</button><button type="button" data-action="fight" data-event="${e.id}" data-map="1"><i class="fa-solid fa-map"></i> Fight at camp (battlemap)</button>` : ""}
      </div>` : ""}
    </div>`;
  }

  #nightHtml(s: CampState) {
    const scouted = s.campers.some((c) => c.job === "scout" && c.result?.success);
    const hints = scouted ? (s.night?.events ?? []).map((e) => e.hint) : [];
    return `
      ${hints.length ? `<div class="dt-camp-hintbox"><i class="fa-solid fa-binoculars"></i> <strong>The scouts noticed:</strong> ${hints.map(esc).join(" ")}</div>` : ""}
      <p class="dt-camp-hint">${s.revealed ? "" : "The camp settles down. The fire burns low…"}</p>
      ${this.#watchesHtml(s, true)}`;
  }

  #morningHtml(s: CampState, gm: boolean) {
    const advice = campAdvice(s);
    const rest = this.#rest ?? advice.rest;
    const cards = s.campers.map((c) => {
      const boons = boonsFor(s, c.actorId);
      const actor = game.actors.get(c.actorId);
      const project = c.job === "study" && c.projectId && actor ? getProjects(actor).find((p) => p.id === c.projectId) : undefined;
      return `<div class="dt-morning-camper">
        ${this.#portrait(c)}
        <ul>${boons.map((b) => `<li><i class="fa-solid ${BOON_ICON[b.kind]}"></i> ${esc(b.text)}</li>`).join("")}
          ${project ? `<li><i class="fa-solid fa-book-open"></i> ${esc(project.title)}: +2 hours<div class="dt-bar"><div style="width:${Math.round((project.done / project.hours) * 100)}%"></div><div class="dt-bar-gain" style="width:${Math.round((2 / project.hours) * 100)}%"></div></div></li>` : ""}
          ${s.trackFood ? `<li><i class="fa-solid fa-utensils"></i> ${rationsOf(actor) > 0 || boons.some((b) => b.kind === "rations") ? "Eats a ration" : "Nothing to eat!"}</li>` : ""}
          ${!boons.length && !project ? `<li class="dt-muted">A plain night's sleep.</li>` : ""}
        </ul>
      </div>`;
    }).join("");
    const night = (s.night?.events ?? []).map((e) => `<li>${esc(e.text)} ${esc(s.outcomes[e.id]?.text ?? "")}</li>`).join("");
    return `
      <p class="dt-camp-hint"><i class="fa-solid fa-sun"></i> Dawn breaks over ${esc(campContext(s).site?.name ?? "the camp")}.</p>
      ${night ? `<ul class="dt-night-recap">${night}</ul>` : `<p class="dt-muted">A quiet night.</p>`}
      <div class="dt-morning-grid">${cards}</div>
      ${advice.warnings.length ? `<div class="dt-camp-warn">${advice.warnings.map((w) => `<p><i class="fa-solid fa-triangle-exclamation"></i> ${esc(w)}</p>`).join("")}</div>` : ""}
      ${gm ? `<div class="dt-rest-pick">
        <label><input type="radio" name="dt-rest" value="full" ${rest === "full" ? "checked" : ""}> Full long rest</label>
        <label><input type="radio" name="dt-rest" value="partial" ${rest === "partial" ? "checked" : ""}> Broken night (short rest only)</label>
        <label><input type="radio" name="dt-rest" value="none" ${rest === "none" ? "checked" : ""}> No rest</label>
      </div>` : `<p class="dt-muted">Waiting for the GM to break camp…</p>`}`;
  }

  #gmButtons(s: CampState) {
    if (s.phase === "site") return `<button type="button" data-action="chooseSite" data-site="${leadingSite(s)}"><i class="fa-solid fa-campground"></i> Camp at the favorite</button>`;
    if (s.phase === "setup") {
      const waiting = s.campers.filter((c) => !c.result).length;
      return `<button type="button" data-action="toNight" title="${waiting ? `${waiting} still haven't done their job; they'll just rest` : "Everyone's settled"}"><i class="fa-solid fa-moon"></i> Night falls${waiting ? ` (${waiting} not done)` : ""}</button>`;
    }
    if (s.phase === "night") {
      const n = s.night?.watches.length ?? 0;
      return s.revealed < n
        ? `<button type="button" data-action="reveal"><i class="fa-solid fa-forward-step"></i> ${s.revealed ? "Next watch" : "First watch"} (${s.revealed + 1}/${n})</button><button type="button" data-action="toMorning" title="Skip to dawn"><i class="fa-solid fa-forward-fast"></i></button>`
        : `<button type="button" data-action="toMorning"><i class="fa-solid fa-sun"></i> Dawn</button>`;
    }
    return `<button type="button" data-action="breakCamp"><i class="fa-solid fa-person-hiking"></i> Apply &amp; break camp</button>`;
  }

  _onRender() {
    const root = this.element as HTMLElement;
    // Drag a portrait onto a job or a watch.
    for (const chip of root.querySelectorAll("[data-drag-actor]") as NodeListOf<HTMLElement>) {
      chip.addEventListener("dragstart", (ev) => ev.dataTransfer?.setData("text/plain", JSON.stringify({ dtCamper: chip.dataset.dragActor })));
    }
    const dropOn = (selector: string, apply: (el: HTMLElement, actorId: string) => void) => {
      for (const zone of root.querySelectorAll(selector) as NodeListOf<HTMLElement>) {
        zone.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          zone.classList.add("dt-drop-hover");
        });
        zone.addEventListener("dragleave", () => zone.classList.remove("dt-drop-hover"));
        zone.addEventListener("drop", (ev) => {
          ev.preventDefault();
          zone.classList.remove("dt-drop-hover");
          try {
            const { dtCamper } = JSON.parse(ev.dataTransfer?.getData("text/plain") ?? "{}");
            if (dtCamper && (mine(dtCamper) || game.user.isGM)) apply(zone, dtCamper);
          } catch {
            // Not one of ours.
          }
        });
      }
    };
    dropOn("[data-drop-job]", (el, actorId) => campAct({ type: "job", actorId, job: el.dataset.dropJob as ActivityId }));
    dropOn("[data-drop-watch]", (el, actorId) => campAct({ type: "watch", actorId, watch: Number(el.dataset.dropWatch) }));
    for (const sel of root.querySelectorAll("select[data-camp-target]") as NodeListOf<HTMLSelectElement>) {
      sel.addEventListener("change", () => {
        const c = getCamp()?.campers.find((x) => x.actorId === sel.dataset.campTarget);
        if (c?.job) campAct({ type: "job", actorId: c.actorId, job: c.job, target: sel.value || undefined });
      });
    }
    for (const sel of root.querySelectorAll("select[data-camp-project]") as NodeListOf<HTMLSelectElement>) {
      sel.addEventListener("change", () => {
        const c = getCamp()?.campers.find((x) => x.actorId === sel.dataset.campProject);
        if (c?.job) campAct({ type: "job", actorId: c.actorId, job: c.job, projectId: sel.value || undefined });
      });
    }
    for (const radio of root.querySelectorAll("input[name=dt-rest]") as NodeListOf<HTMLInputElement>) {
      radio.addEventListener("change", () => (this.#rest = radio.value as RestMode));
    }
  }

  // --- Actions ------------------------------------------------------------------------

  static #onVote(this: CampApp, _e: Event, target: HTMLElement) {
    const s = getCamp();
    for (const c of s?.campers.filter((x) => mine(x.actorId)) ?? []) campAct({ type: "vote", actorId: c.actorId, site: Number(target.dataset.site) });
  }

  static #onChooseSite(this: CampApp, _e: Event, target: HTMLElement) {
    campCommand({ type: "chooseSite", site: Number(target.dataset.site) });
  }

  static #onFire(this: CampApp) {
    const s = getCamp();
    if (s) campAct({ type: "fire", on: !s.fire });
  }

  static #onHold(this: CampApp, ev: Event, target: HTMLElement) {
    ev.stopPropagation();
    const id = target.dataset.actor!;
    this.#held = this.#held === id ? null : id;
    this.render();
  }

  static #onAssignJob(this: CampApp, _e: Event, target: HTMLElement) {
    if (!this.#held) return;
    campAct({ type: "job", actorId: this.#held, job: target.dataset.job as ActivityId });
    this.#held = null;
  }

  static #onClearJob(this: CampApp, _e: Event, target: HTMLElement) {
    campAct({ type: "job", actorId: target.dataset.actor!, job: null });
  }

  static async #onRollJob(this: CampApp, _e: Event, target: HTMLElement) {
    const s = getCamp();
    const c = s?.campers.find((x) => x.actorId === target.dataset.actor);
    const actor = game.actors.get(c?.actorId);
    if (!s || !c?.job || !actor) return;
    const a = CAMP_ACTIVITIES[c.job];
    if (a.target && !c.target) return ui.notifications.warn(`Pick who ${c.name} is helping first.`);
    if (a.project && !c.projectId) return ui.notifications.warn(`Pick which project ${c.name} works on first.`);
    target.setAttribute("disabled", "");
    const total = a.roll ? await rollSpec(actor, a.roll, `${a.label} (camp)`) : 0;
    if (total === null) return target.removeAttribute("disabled");
    campAct({ type: "result", actorId: c.actorId, total });
  }

  static #onClearResult(this: CampApp, _e: Event, target: HTMLElement) {
    campCommand({ type: "clearResult", actorId: target.dataset.actor! });
  }

  static #onAssignWatch(this: CampApp, _e: Event, target: HTMLElement) {
    if (!this.#held) return;
    campAct({ type: "watch", actorId: this.#held, watch: Number(target.dataset.watch) });
    this.#held = null;
  }

  static #onToNight(this: CampApp) {
    campCommand({ type: "toNight" });
  }

  static #onReveal(this: CampApp) {
    campCommand({ type: "reveal" });
  }

  static #onToMorning(this: CampApp) {
    campCommand({ type: "toMorning" });
  }

  static async #onRollEvent(this: CampApp, _e: Event, target: HTMLElement) {
    const s = getCamp();
    const ev = s?.night?.events.find((e) => e.id === target.dataset.event);
    const actor = game.actors.get(target.dataset.actor);
    const spec = ev?.check ?? ev?.save;
    if (!ev || !actor || !spec) return;
    target.setAttribute("disabled", "");
    const total = await rollSpec(actor, spec, ev.text);
    if (total === null) return target.removeAttribute("disabled");
    campAct({ type: "eventRoll", eventId: ev.id, actorId: actor.id, name: actor.name, total });
  }

  static #onSettle(this: CampApp, _e: Event, target: HTMLElement) {
    campCommand({ type: "settle", eventId: target.dataset.event!, passed: target.dataset.passed === "1" });
  }

  static async #onFight(this: CampApp, _e: Event, target: HTMLElement) {
    const s = getCamp();
    const ev = s?.night?.events.find((e) => e.id === target.dataset.event);
    if (!s || !ev?.encounter) return;
    await ToolkitApp.campFight(ev.encounter, { level: s.partyLevel, size: s.campers.length, map: target.dataset.map === "1" });
  }

  static async #onBreakCamp(this: CampApp) {
    const s = getCamp();
    if (!s) return;
    const mode = this.#rest ?? campAdvice(s).rest;
    this.#rest = null;
    await breakCamp(s, mode);
  }

  static async #onCancel(this: CampApp) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: "Cancel camp?" }, content: "<p>End camp without applying the rest, boons or food?</p>", rejectClose: false });
    if (ok) await cancelCamp();
  }
}
