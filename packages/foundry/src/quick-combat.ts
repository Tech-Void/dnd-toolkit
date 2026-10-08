import { attackOutcome, effectFor, halve, resultLine, type EffectKind } from "@dnd-toolkit/core";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Quick combat: pick an action, click a target, and it resolves. The attack is rolled against the
// target's AC (or the target rolls its save), damage is rolled and applied with resistances, and
// a little effect plays: a slash, an arrow, a fire bolt, a burst, a healing glow. The player only
// chooses advantage, normal or disadvantage. Damage goes through the GM (players can't edit
// monsters), with an Undo button in the GM's log.

const SOCKET = `module.${MODULE_ID}`;
export type RollMode = "normal" | "advantage" | "disadvantage";

export function registerQuickCombatSettings() {
  game.settings.register(MODULE_ID, "quickCombat", {
    name: "Quick combat", hint: "Pick an action, click a target, and the attack, save, damage and effect resolve by themselves (with an action bar on each player's turn).",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "quickCombatBar", {
    name: "Quick combat: show my action bar on my turn", scope: "client", config: true, type: Boolean, default: true,
  });
}

export const quickCombatOn = () => {
  try {
    return !!game.settings.get(MODULE_ID, "quickCombat");
  } catch {
    return false;
  }
};

// --- What an item does ------------------------------------------------------------------------

const itemInfo = (item: any) => {
  const sys = item.system ?? {};
  const types = (sys.damage?.parts ?? []).map(([, t]: [string, string]) => t).filter(Boolean);
  return {
    actionType: sys.actionType as string | undefined,
    damageTypes: types as string[],
    weapon: sys.type?.baseItem ?? item.name,
    area: !!item.hasAreaTarget,
    spell: item.type === "spell",
  };
};

/** Things worth a button: weapons in hand, spells and features that attack, force a save or heal. */
export function quickActions(actor: any): any[] {
  return [...(actor?.items ?? [])].filter((i: any) => {
    const t = i.system?.actionType;
    if (!t || t === "util" || t === "other" || t === "abil") return false;
    if (i.type === "weapon" && i.system?.equipped === false && actor.type === "character") return false;
    if (i.type === "spell" && actor.type === "character") {
      const prep = i.system?.preparation;
      if (i.system.level > 0 && prep?.mode === "prepared" && !prep.prepared) return false;
    }
    return ["weapon", "spell", "feat", "consumable"].includes(i.type);
  });
}

/** Does using it spend something (a slot, a use, a charge)? Then dnd5e's own use() runs first. */
const spends = (item: any) => (item.type === "spell" && item.system.level > 0 && item.system.preparation?.mode !== "atwill" && item.system.preparation?.mode !== "innate")
  || !!item.system?.uses?.max || item.type === "consumable" || !!item.system?.recharge?.value;

// --- Picking a target -------------------------------------------------------------------------

/** Wait for a click on a token (Esc or right-click cancels). */
export function pickToken(prompt: string): Promise<any | null> {
  return new Promise((resolve) => {
    const view: HTMLElement = canvas.app.view;
    ui.notifications.info(prompt);
    const prev = view.style.cursor;
    view.style.cursor = "crosshair";
    const done = (token: any) => {
      view.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      view.style.cursor = prev;
      resolve(token);
    };
    const onDown = (ev: PointerEvent) => {
      ev.stopImmediatePropagation();
      ev.preventDefault();
      if (ev.button === 2) return done(null);
      const p = canvas.mousePosition ?? canvas.canvasCoordinatesFromClient?.({ x: ev.clientX, y: ev.clientY });
      const hit = [...canvas.tokens.placeables].reverse().find((t: any) => t.visible && t.bounds?.contains(p.x, p.y));
      if (hit) done(hit);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      done(null);
    };
    view.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  });
}

/** Tokens inside a placed measured template. */
function tokensInTemplate(t: any): any[] {
  const shape = t?.object?.shape;
  if (!shape) return [];
  return canvas.tokens.placeables.filter((tok: any) => shape.contains(tok.center.x - t.x, tok.center.y - t.y));
}

// --- Resolving ---------------------------------------------------------------------------------

interface Applied {
  targetUuid: string;
  damages: { value: number; type: string }[];
}

/** Put an item's area template down at a chosen spot (monsters aiming their breath). */
async function placeTemplate(item: any, aim: { x: number; y: number; direction: number }) {
  const preview = (globalThis as any).dnd5e?.canvas?.AbilityTemplate?.fromItem(item);
  if (!preview) return null;
  const data = preview.document.toObject();
  Object.assign(data, { x: aim.x, y: aim.y, direction: aim.direction });
  const [doc] = await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [data]);
  return doc ?? null;
}

export interface QuickOptions {
  /** Skip the click: use it on these tokens. */
  targets?: any[];
  /** Skip placing the template: put it here (pixels, degrees). */
  aim?: { x: number; y: number; direction: number };
}

/** Use an item on a target the player clicks (or every creature in its area). */
export async function quickAct(actor: any, item: any, mode: RollMode = "normal", source?: any, opts: QuickOptions = {}) {
  const token = source ?? actor.getActiveTokens?.()[0] ?? canvas.tokens.controlled[0];
  const info = itemInfo(item);
  let spellLevel = item.system?.level;
  // Spend the slot, use or charge through dnd5e (it asks which slot for spells).
  if (spends(item)) {
    const used = await item.use({ createMeasuredTemplate: false }, { createMessage: false });
    if (!used) return;
    spellLevel = used?.flags?.dnd5e?.use?.spellLevel ?? spellLevel;
  }
  let targets: any[] = [];
  if (info.area) {
    const placed = opts.aim ? await placeTemplate(item, opts.aim) : await (globalThis as any).dnd5e?.canvas?.AbilityTemplate?.fromItem(item)?.drawPreview();
    const tmpl = Array.isArray(placed) ? placed[0] : placed;
    if (!tmpl) return;
    await new Promise((r) => setTimeout(r, 120));
    targets = tokensInTemplate(tmpl).filter((t: any) => t !== token || info.actionType === "heal");
    playEffect({ kind: "burst", color: effectFor(info).color, from: token?.center, to: tmpl.object?.center ?? { x: tmpl.x, y: tmpl.y }, radius: (tmpl.distance / canvas.dimensions.distance) * canvas.grid.size, hit: true });
  } else if (item.system?.target?.type === "self") {
    targets = [token];
  } else if (opts.targets?.length) {
    targets = opts.targets;
  } else {
    const t = await pickToken(`${item.name}: click a target (Esc to cancel).`);
    if (!t) return;
    targets = [t];
  }
  if (!targets.length) return ui.notifications.info("Nobody in the area.");

  const rolls: any[] = [];
  const lines: string[] = [];
  const applied: Applied[] = [];
  const effect = effectFor(info);
  for (const target of targets) {
    const tActor = target.actor;
    if (!tActor) continue;
    const out = { attacker: token?.name ?? actor.name, item: item.name, target: target.name } as Parameters<typeof resultLine>[0];
    let critical = false;
    let dealt = true;
    let half = false;
    if (item.hasAttack) {
      const roll = await item.rollAttack({ fastForward: true, advantage: mode === "advantage", disadvantage: mode === "disadvantage", chatMessage: false });
      if (!roll) return;
      rolls.push(roll);
      const ac = Number(tActor.system?.attributes?.ac?.value ?? 10);
      const natural = Number(roll.terms?.[0]?.total ?? roll.dice?.[0]?.total ?? 10);
      const o = attackOutcome(roll.total, natural, ac, item.criticalThreshold ?? 20);
      Object.assign(out, { total: roll.total, ac, outcome: { ...o, crit: o.crit || !!roll.isCritical, hit: o.hit || !!roll.isCritical } });
      critical = out.outcome!.crit;
      dealt = out.outcome!.hit;
      floatText(target, critical ? "CRITICAL!" : dealt ? "HIT" : "MISS", critical ? "#ffd84a" : dealt ? "#ffffff" : "#9aa4b1");
    }
    if (item.hasSave && !item.hasAttack) {
      const ability = item.system.save.ability;
      const dc = item.getSaveDC?.() ?? item.system.save.dc ?? 10;
      const save = await tActor.rollAbilitySave(ability, { fastForward: true, chatMessage: false });
      if (save) rolls.push(save);
      const passed = (save?.total ?? 0) >= dc;
      out.save = { ability, dc, total: save?.total ?? 0, passed };
      // Cantrips do nothing on a save; leveled effects do half.
      if (passed) item.type === "spell" && item.system.level === 0 ? (dealt = false) : (half = true);
      floatText(target, passed ? "SAVED" : "FAILED", passed ? "#9aa4b1" : "#ff8a6a");
    }
    if (!info.area) playEffect({ ...effect, from: token?.center, to: target.center, hit: dealt });
    if (dealt && item.hasDamage) {
      const dmg: any[] = (await item.rollDamage({ critical, spellLevel, options: { fastForward: true, chatMessage: false } })) ?? [];
      const list = Array.isArray(dmg) ? dmg : [dmg];
      rolls.push(...list);
      const damages = list.map((r: any) => ({ value: half ? halve(r.total) : r.total, type: r.options?.type ?? info.damageTypes[0] ?? "bludgeoning" }));
      const total = damages.reduce((n, d) => n + d.value, 0);
      out.damage = total;
      out.types = [...new Set(damages.map((d) => d.type))];
      out.healing = info.actionType === "heal";
      applied.push({ targetUuid: tActor.uuid, damages: out.healing ? damages.map((d) => ({ ...d, type: "healing" })) : damages });
      setTimeout(() => floatText(target, out.healing ? `+${total}` : `-${total}`, out.healing ? "#5cff8a" : "#ff4a4a", 0.6), 450);
    }
    lines.push(resultLine(out));
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor, token: token?.document }),
    rolls,
    flavor: `${item.name}${mode !== "normal" ? ` (${mode})` : ""}`,
    content: `<div class="dt-qc-card">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>`,
  });
  if (applied.length) sendApply({ applied, by: token?.name ?? actor.name, item: item.name });
}

/**
 * Multiattack at one target: each attack in turn. If the target drops partway, the rest go to
 * the nearest enemy still standing.
 */
export async function quickMulti(actor: any, plan: { item: any; count: number }[], target: any, source?: any) {
  const token = source ?? actor.getActiveTokens?.()[0];
  const alive = (t: any) => Number(t?.actor?.system?.attributes?.hp?.value ?? 0) > 0;
  let current = target;
  for (const { item, count } of plan) {
    for (let i = 0; i < count; i++) {
      if (!alive(current)) {
        const from = token?.center ?? current?.center ?? { x: 0, y: 0 };
        current = canvas.tokens.placeables
          .filter((t: any) => t !== token && alive(t) && t.document.disposition !== token?.document?.disposition)
          .sort((a: any, b: any) => Math.hypot(a.center.x - from.x, a.center.y - from.y) - Math.hypot(b.center.x - from.x, b.center.y - from.y))[0];
        if (!current) return;
      }
      await quickAct(actor, item, "normal", token, { targets: [current] });
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}

// --- Applying damage (GM) ---------------------------------------------------------------------

function sendApply(msg: { applied: Applied[]; by: string; item: string }) {
  if (game.users.activeGM?.isSelf) applyDamage(msg);
  else game.socket.emit(SOCKET, { kind: "qcApply", ...msg });
}

async function applyDamage(msg: { applied: Applied[]; by: string; item: string }) {
  const undo: { uuid: string; value: number; temp: number }[] = [];
  const lines: string[] = [];
  for (const a of msg.applied) {
    const actor = await fromUuid(a.targetUuid);
    if (!actor?.system?.attributes?.hp) continue;
    const hp = actor.system.attributes.hp;
    undo.push({ uuid: actor.uuid, value: hp.value, temp: hp.temp ?? 0 });
    await actor.applyDamage(a.damages);
    const after = actor.system.attributes.hp;
    lines.push(`${actor.name}: ${hp.value} → ${after.value} HP${after.value <= 0 ? " (down!)" : ""}`);
  }
  if (!undo.length) return;
  ChatMessage.create({
    speaker: { alias: "Quick combat" }, whisper: game.users.filter((u: any) => u.isGM).map((u: any) => u.id),
    content: `<p><small>${esc(msg.by)}, ${esc(msg.item)}:</small> ${lines.map(esc).join("; ")} <button type="button" class="dt-qc-undo" data-dt-undo><i class="fa-solid fa-rotate-left"></i> Undo</button></p>`,
    flags: { [MODULE_ID]: { undo } },
  });
}

// --- Effects ----------------------------------------------------------------------------------

interface Effect {
  kind: EffectKind;
  color: string;
  from?: { x: number; y: number };
  to: { x: number; y: number };
  hit: boolean;
  radius?: number;
}

/** Play an effect for everyone looking at this scene. */
function playEffect(e: Effect) {
  const msg = { kind: "qcEffect", sceneId: canvas.scene?.id, effect: e };
  game.socket.emit(SOCKET, msg);
  drawEffect(e);
}

function floatText(token: any, text: string, color: string, delay = 0) {
  const msg = { kind: "qcText", sceneId: canvas.scene?.id, tokenId: token.id ?? token.document?.id, text, color };
  game.socket.emit(SOCKET, msg);
  setTimeout(() => showText(msg.tokenId, text, color), delay * 1000);
}

function showText(tokenId: string, text: string, color: string) {
  const t = canvas.tokens?.get(tokenId);
  if (!t) return;
  canvas.interface?.createScrollingText?.(t.center, text, { anchor: CONST.TEXT_ANCHOR_POINTS.TOP, fontSize: 36, fill: color, stroke: 0x000000, strokeThickness: 5, duration: 1800, jitter: 0.25 });
}

/** Sequencer + JB2A when installed: the fancy versions. */
const JB2A: Partial<Record<EffectKind, string>> = {
  slash: "jb2a.melee_generic.slash.01.orange", pierce: "jb2a.melee_generic.piercing.01.orange", bludgeon: "jb2a.melee_generic.bludgeoning.1handed",
  arrow: "jb2a.arrow.physical.white.01", bolt: "jb2a.fire_bolt.orange", ray: "jb2a.scorching_ray.01.orange", burst: "jb2a.explosion.01.orange",
  heal: "jb2a.healing_generic.200px.green", aura: "jb2a.impact.004.blue",
};

function drawEffect(e: Effect) {
  if (!canvas.ready) return;
  const Seq = (globalThis as any).Sequence;
  const jb2a = game.modules.get("JB2A_DnD5e")?.active || game.modules.get("jb2a_patreon")?.active;
  if (Seq && jb2a && JB2A[e.kind] && game.modules.get("sequencer")?.active) {
    try {
      const seq = new Seq().effect().file(JB2A[e.kind]);
      if (["arrow", "bolt", "ray"].includes(e.kind) && e.from) seq.atLocation(e.from).stretchTo(e.to).missed(!e.hit);
      else seq.atLocation(e.to).scaleToObject?.(1.5);
      seq.play();
      return;
    } catch {
      // Fall through to the built-in effect.
    }
  }
  const PIXI = (globalThis as any).PIXI;
  const g = new PIXI.Graphics();
  canvas.interface.addChild(g);
  const color = Number.parseInt(e.color.slice(1), 16);
  const gs = canvas.grid.size;
  const from = e.from ?? e.to;
  const dx = e.to.x - from.x;
  const dy = e.to.y - from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const travel = ["arrow", "bolt", "ray"].includes(e.kind) ? Math.max(200, Math.min(700, dist * 0.9)) : 0;
  const total = travel + 450;
  const start = performance.now();
  const end = e.hit ? e.to : { x: e.to.x + (dx / dist) * gs * 1.5, y: e.to.y + (dy / dist) * gs * 1.5 };
  if (e.hit && ["slash", "pierce", "bludgeon", "bolt", "arrow", "ray"].includes(e.kind)) setTimeout(() => shake(e.to), travel);

  const tick = () => {
    const t = performance.now() - start;
    g.clear();
    if (t >= total) {
      canvas.app.ticker.remove(tick);
      g.destroy();
      return;
    }
    const k = Math.min(1, t / Math.max(1, travel));
    const after = Math.max(0, (t - travel) / 450);
    const fade = 1 - after;
    switch (e.kind) {
      case "arrow": {
        if (k < 1) {
          const hx = from.x + (end.x - from.x) * k;
          const hy = from.y + (end.y - from.y) * k;
          const ux = dx / dist;
          const uy = dy / dist;
          g.lineStyle(3, 0x5a3a1e, 1).moveTo(hx - ux * gs * 0.45, hy - uy * gs * 0.45).lineTo(hx, hy);
          g.lineStyle(0).beginFill(0xd8d8d8).drawPolygon([hx + ux * 10, hy + uy * 10, hx - uy * 6, hy + ux * 6, hx + uy * 6, hy - ux * 6]).endFill();
        } else if (e.hit) g.lineStyle(3, 0xffffff, fade).drawCircle(e.to.x, e.to.y, gs * 0.2 + after * gs * 0.3);
        break;
      }
      case "bolt": {
        const hx = from.x + (end.x - from.x) * k;
        const hy = from.y + (end.y - from.y) * k;
        if (k < 1) {
          for (let i = 0; i < 6; i++) g.beginFill(color, 0.15 + i * 0.12).drawCircle(hx - (dx / dist) * i * 6, hy - (dy / dist) * i * 6, 12 - i * 1.5).endFill();
        } else if (e.hit) g.beginFill(color, 0.6 * fade).drawCircle(e.to.x, e.to.y, gs * (0.3 + after * 0.5)).endFill();
        break;
      }
      case "ray": {
        g.lineStyle(8 * (1 - after * 0.8), color, 0.85 * (k < 1 ? 1 : fade)).moveTo(from.x, from.y).lineTo(from.x + (end.x - from.x) * k, from.y + (end.y - from.y) * k);
        g.lineStyle(3, 0xffffff, 0.9 * (k < 1 ? 1 : fade)).moveTo(from.x, from.y).lineTo(from.x + (end.x - from.x) * k, from.y + (end.y - from.y) * k);
        break;
      }
      case "slash": {
        const a0 = Math.atan2(dy, dx) - 1.2;
        const sweep = Math.min(1, t / 220) * 2.4;
        g.lineStyle(6, color, fade).arc(e.to.x, e.to.y, gs * 0.55, a0, a0 + sweep);
        g.lineStyle(2, 0xffffff, fade).arc(e.to.x, e.to.y, gs * 0.48, a0 + 0.2, a0 + sweep);
        break;
      }
      case "pierce": {
        const reach = Math.min(1, t / 160);
        const ux = dx / dist;
        const uy = dy / dist;
        g.lineStyle(4, color, fade).moveTo(e.to.x - ux * gs * 0.9, e.to.y - uy * gs * 0.9).lineTo(e.to.x - ux * gs * 0.9 + ux * gs * 0.9 * reach, e.to.y - uy * gs * 0.9 + uy * gs * 0.9 * reach);
        break;
      }
      case "bludgeon":
        g.lineStyle(5, color, fade).drawCircle(e.to.x, e.to.y, gs * (0.2 + Math.min(1, t / 300) * 0.5));
        break;
      case "burst": {
        const r = (e.radius ?? gs * 2) * Math.min(1, t / 250);
        g.beginFill(color, 0.35 * (1 - Math.max(0, (t - 250) / 450))).drawCircle(e.to.x, e.to.y, r).endFill();
        g.lineStyle(4, color, 0.9 * (1 - Math.max(0, (t - 250) / 450))).drawCircle(e.to.x, e.to.y, r);
        break;
      }
      case "heal": {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + t / 400;
          g.beginFill(color, fade).drawCircle(e.to.x + Math.cos(a) * gs * 0.45, e.to.y + Math.sin(a) * gs * 0.45 - (t / total) * gs * 0.6, 5).endFill();
        }
        break;
      }
      case "aura":
        g.lineStyle(6, color, fade).drawCircle(e.to.x, e.to.y, gs * (0.35 + Math.min(1, t / 300) * 0.3));
        break;
    }
  };
  canvas.app.ticker.add(tick);
}

/** A quick shudder of whatever token stands at a point. */
function shake(at: { x: number; y: number }) {
  const t = canvas.tokens.placeables.find((x: any) => x.bounds?.contains(at.x, at.y));
  const mesh = t?.mesh;
  if (!mesh) return;
  const x0 = mesh.x;
  const start = performance.now();
  const tick = () => {
    const el = performance.now() - start;
    if (el > 220) {
      mesh.x = x0;
      canvas.app.ticker.remove(tick);
      return;
    }
    mesh.x = x0 + Math.sin(el / 18) * 4 * (1 - el / 220);
  };
  canvas.app.ticker.add(tick);
}

// --- Wiring ----------------------------------------------------------------------------------

export function initQuickCombat() {
  game.socket.on(SOCKET, (msg: any) => {
    if (msg?.kind === "qcEffect" && msg.sceneId === canvas.scene?.id) drawEffect(msg.effect);
    else if (msg?.kind === "qcText" && msg.sceneId === canvas.scene?.id) showText(msg.tokenId, msg.text, msg.color);
    else if (msg?.kind === "qcApply" && game.users.activeGM?.isSelf) applyDamage(msg);
  });
  // A player's turn: bring up their action bar.
  Hooks.on("updateCombat", (combat: any, change: any) => {
    if (!quickCombatOn() || game.user.isGM || !("turn" in (change ?? {}) || "round" in (change ?? {}))) return;
    if (!game.settings.get(MODULE_ID, "quickCombatBar")) return;
    const c = combat.combatant;
    if (c?.actor?.isOwner && c.token?.object) import("./action-bar.ts").then(({ ActionBar }) => ActionBar.show(c.token.object));
  });
  Hooks.on("controlToken", (token: any, controlled: boolean) => {
    if (controlled && token.actor?.isOwner && game.combat?.started && game.combat.combatant?.tokenId === token.id && quickCombatOn()) import("./action-bar.ts").then(({ ActionBar }) => ActionBar.show(token));
  });
  Hooks.on("renderChatMessage", (message: any, html: any) => {
    const root: HTMLElement = html[0] ?? html;
    const b = root.querySelector("button[data-dt-undo]") as HTMLButtonElement | null;
    if (!b) return;
    if (!game.user.isGM) return b.remove();
    b.addEventListener("click", async () => {
      b.disabled = true;
      for (const u of message.getFlag(MODULE_ID, "undo") ?? []) {
        const actor = await fromUuid(u.uuid);
        await actor?.update({ "system.attributes.hp.value": u.value, "system.attributes.hp.temp": u.temp });
      }
      b.textContent = "Undone";
    });
  });
}
