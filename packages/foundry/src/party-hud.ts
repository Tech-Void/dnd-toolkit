import { conditionReminders, deathSaveLine } from "@dnd-toolkit/core";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// The party at a glance (HP, temp HP, AC, conditions, concentration, spell slots, death saves) in a
// small panel everyone sees, and a reminder at the start of each turn: what your conditions mean,
// and a death save button when you're down.

export function registerPartyHudSettings() {
  game.settings.register(MODULE_ID, "partyHud", {
    name: "Party HUD", hint: "Show the party's HP, AC, conditions and spell slots in a small panel.",
    scope: "client", config: true, type: Boolean, default: true, onChange: () => renderHud(),
  });
  game.settings.register(MODULE_ID, "turnReminders", {
    name: "Turn reminders", hint: "At the start of a character's turn, remind its player what their conditions mean, and prompt death saves at 0 HP.",
    scope: "world", config: true, type: Boolean, default: true,
  });
}

/** The player characters: assigned to a user, or owned by a player. */
export function partyActors(): any[] {
  const assigned = game.users.filter((u: any) => !u.isGM && u.character).map((u: any) => u.character);
  const list = assigned.length ? assigned : game.actors.filter((a: any) => a.type === "character" && a.hasPlayerOwner);
  return [...new Set(list)];
}

const concentratingOn = (actor: any): string | undefined => {
  const fx = [...(actor.effects ?? [])].find((e: any) => e.statuses?.has?.("concentrating"));
  return fx ? String(fx.name).split(": ").slice(1).join(": ") || undefined : undefined;
};

const statusIcon = (id: string) => CONFIG.statusEffects.find((s: any) => s.id === id);

/** Spell slot pips, e.g. "1 ●●○  2 ●○". */
function slotsHtml(actor: any): string {
  const sp = actor.system?.spells ?? {};
  const levels = Object.entries(sp)
    .filter(([, v]: [string, any]) => Number(v?.max) > 0)
    .map(([k, v]: [string, any]) => {
      const label = k === "pact" ? "P" : k.replace("spell", "");
      const pips = Array.from({ length: Number(v.max) }, (_, i) => `<i class="${i < Number(v.value) ? "full" : ""}"></i>`).join("");
      return `<span class="dt-slot" title="${k === "pact" ? "Pact" : `Level ${label}`} slots: ${v.value}/${v.max}"><b>${label}</b>${pips}</span>`;
    });
  return levels.length ? `<div class="dt-hud-slots">${levels.join("")}</div>` : "";
}

function memberHtml(actor: any): string {
  const hp = actor.system?.attributes?.hp ?? {};
  const max = Math.max(1, Number(hp.max ?? 1) + Number(hp.tempmax ?? 0));
  const value = Math.max(0, Number(hp.value ?? 0));
  const temp = Number(hp.temp ?? 0);
  const pct = Math.min(100, (value / max) * 100);
  const tempPct = Math.min(100 - pct, (temp / max) * 100);
  const tone = pct > 50 ? "ok" : pct > 25 ? "hurt" : "bad";
  const statuses = [...(actor.statuses ?? [])].filter((s: string) => s !== "dead");
  const icons = statuses.map((s: string) => {
    const fx = statusIcon(s);
    return fx ? `<img src="${fx.img ?? fx.icon}" title="${esc(game.i18n.localize(fx.name ?? fx.label ?? s))}">` : "";
  }).join("");
  const conc = concentratingOn(actor);
  const death = actor.system?.attributes?.death ?? {};
  const dying = value <= 0 && actor.type === "character";
  const ex = Number(actor.system?.attributes?.exhaustion ?? 0);
  return `<li class="dt-hud-member${dying ? " dying" : ""}" data-actor="${actor.id}">
    <img class="dt-hud-face" src="${actor.img}" alt="">
    <div class="dt-hud-body">
      <div class="dt-hud-top"><span class="dt-hud-name">${esc(actor.name)}</span>
        <span class="dt-hud-ac" title="Armor Class"><i class="fa-solid fa-shield-halved"></i> ${actor.system?.attributes?.ac?.value ?? "?"}</span></div>
      <div class="dt-hud-hp ${tone}" title="${value}/${max} HP${temp ? ` (+${temp} temp)` : ""}">
        <span class="bar" style="width:${pct}%"></span>${temp ? `<span class="temp" style="left:${pct}%;width:${tempPct}%"></span>` : ""}
        <span class="txt">${dying ? esc(deathSaveLine(Number(death.success ?? 0), Number(death.failure ?? 0))) : `${value}/${max}${temp ? ` +${temp}` : ""}`}</span>
      </div>
      ${icons || conc || ex ? `<div class="dt-hud-status">${icons}${conc ? `<span class="dt-hud-conc" title="Concentrating"><i class="fa-solid fa-brain"></i> ${esc(conc)}</span>` : ""}${ex ? `<span title="Exhaustion">Exh ${ex}</span>` : ""}</div>` : ""}
      ${slotsHtml(actor)}
    </div></li>`;
}

let el: HTMLElement | null = null;
let queued = false;

/** Draw (or remove) the HUD. Batched, so a flurry of updates redraws once. */
export function renderHud() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    let show = false;
    try {
      show = !!game.settings.get(MODULE_ID, "partyHud");
    } catch {}
    const party = show ? partyActors() : [];
    if (!party.length) {
      el?.remove();
      el = null;
      return;
    }
    if (!el) {
      el = document.createElement("section");
      el.id = "dt-party-hud";
      document.body.append(el);
      restorePosition(el);
    }
    const collapsed = readPref("collapsed") === "1";
    el.classList.toggle("collapsed", collapsed);
    el.innerHTML = `<header><i class="fa-solid fa-users"></i> Party<a class="dt-hud-toggle" title="${collapsed ? "Show" : "Hide"}"><i class="fa-solid fa-chevron-${collapsed ? "down" : "up"}"></i></a></header>
      ${collapsed ? "" : `<ol>${party.map(memberHtml).join("")}</ol>`}`;
    bind(el);
  });
}

const readPref = (k: string) => {
  try {
    return localStorage.getItem(`${MODULE_ID}.hud.${k}`);
  } catch {
    return null;
  }
};
const writePref = (k: string, v: string) => {
  try {
    localStorage.setItem(`${MODULE_ID}.hud.${k}`, v);
  } catch {}
};

function restorePosition(node: HTMLElement) {
  const pos = readPref("pos")?.split(",").map(Number);
  if (pos?.length === 2 && pos.every(Number.isFinite)) {
    node.style.left = `${Math.min(window.innerWidth - 60, Math.max(0, pos[0]!))}px`;
    node.style.top = `${Math.min(window.innerHeight - 40, Math.max(0, pos[1]!))}px`;
  }
}

function bind(node: HTMLElement) {
  node.querySelector(".dt-hud-toggle")?.addEventListener("click", () => {
    writePref("collapsed", readPref("collapsed") === "1" ? "0" : "1");
    renderHud();
  });
  // Drag by the header.
  const header = node.querySelector("header") as HTMLElement;
  header.addEventListener("pointerdown", (ev) => {
    if ((ev.target as HTMLElement).closest(".dt-hud-toggle")) return;
    const start = { x: ev.clientX, y: ev.clientY, left: node.offsetLeft, top: node.offsetTop };
    const move = (e: PointerEvent) => {
      node.style.left = `${start.left + e.clientX - start.x}px`;
      node.style.top = `${start.top + e.clientY - start.y}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      writePref("pos", `${node.offsetLeft},${node.offsetTop}`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
  // Click a member: find their token (and select it if it's yours); double-click opens the sheet.
  for (const li of node.querySelectorAll("li[data-actor]") as NodeListOf<HTMLElement>) {
    const actor = game.actors.get(li.dataset.actor!);
    li.addEventListener("click", () => {
      const token = actor?.getActiveTokens?.()[0];
      if (!token) return;
      canvas.animatePan({ x: token.center.x, y: token.center.y });
      if (actor.isOwner) token.control({ releaseOthers: true });
    });
    li.addEventListener("dblclick", () => actor?.isOwner && actor.sheet.render(true));
  }
}

// --- Turn reminders ----------------------------------------------------------------------------

const isActingGm = () => game.user.isGM && (game.users.activeGM?.id ?? game.user.id) === game.user.id;

async function turnReminder(combat: any) {
  const c = combat.combatant;
  const actor = c?.actor;
  if (!actor || c.isDefeated) return;
  const hp = Number(actor.system?.attributes?.hp?.value ?? 1);
  const death = actor.system?.attributes?.death ?? {};
  const dying = actor.type === "character" && hp <= 0 && Number(death.failure ?? 0) < 3 && Number(death.success ?? 0) < 3;
  const lines = conditionReminders(dying ? [...actor.statuses].filter((s: string) => s !== "unconscious" && s !== "prone") : actor.statuses ?? [], {
    exhaustion: Number(actor.system?.attributes?.exhaustion ?? 0),
    concentratingOn: concentratingOn(actor),
  });
  if (!dying && !lines.length) return;
  // Only players' characters get a card here; monsters' conditions are on the GM's turn card.
  if (!actor.hasPlayerOwner) return;
  const owners = game.users.filter((u: any) => !u.isGM && actor.testUserPermission(u, "OWNER")).map((u: any) => u.id);
  const gms = game.users.filter((u: any) => u.isGM).map((u: any) => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: [...owners, ...gms],
    content: `<div class="dt-turn-reminder"><p><strong>${esc(c.name)}'s turn</strong></p>
      ${dying ? `<p class="dt-dying"><i class="fa-solid fa-skull"></i> ${esc(deathSaveLine(Number(death.success ?? 0), Number(death.failure ?? 0)))} Roll a death save.</p>
        <button type="button" data-dt-deathsave="${actor.uuid}"><i class="fa-solid fa-dice-d20"></i> Death save</button>` : ""}
      ${lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}</div>`,
  });
}

/** A monster's conditions for the GM's turn card: the names, with the rules on hover. */
export function monsterConditions(actor: any): string {
  const lines = conditionReminders(actor?.statuses ?? [], { exhaustion: Number(actor?.system?.attributes?.exhaustion ?? 0), concentratingOn: concentratingOn(actor) });
  return lines.map((l) => `<span class="dt-cond" title="${esc(l)}">${esc(l.split(":")[0])}</span>`).join(" ");
}

export function initPartyHud() {
  renderHud();
  const redraw = () => renderHud();
  for (const hook of ["updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateUser", "createActor", "deleteActor", "canvasReady"]) Hooks.on(hook, redraw);
  Hooks.on("updateCombat", (combat: any, change: any) => {
    if (!isActingGm() || !combat.started || !("turn" in (change ?? {}) || "round" in (change ?? {}))) return;
    if (game.settings.get(MODULE_ID, "turnReminders")) turnReminder(combat);
  });
  Hooks.on("renderChatMessage", (_m: any, html: any) => {
    const root: HTMLElement = html[0] ?? html;
    for (const b of root.querySelectorAll("button[data-dt-deathsave]") as NodeListOf<HTMLButtonElement>) {
      b.addEventListener("click", async () => {
        const actor = await fromUuid(b.dataset.dtDeathsave!);
        if (!actor?.isOwner) return ui.notifications.warn("That's not your character.");
        b.disabled = true;
        await actor.rollDeathSave({});
      });
    }
  });
}
