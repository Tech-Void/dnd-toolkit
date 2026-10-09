import { challengeRequest, closeChallenge, endChaseRound, getChallenge, nudgeChallenge } from "./challenge.ts";
import { esc, MODULE_ID } from "./util.ts";

// The tracker window everyone sees for a skill challenge or a chase.

const { ApplicationV2 } = foundry.applications.api;

const skillName = (k: string) => CONFIG.DND5E?.skills?.[k]?.label ?? k;
const allSkills = () => Object.keys(CONFIG.DND5E?.skills ?? {});

export class ChallengeWindow extends ApplicationV2 {
  static #instance: ChallengeWindow | null = null;

  constructor(options: object = {}) {
    super(options);
  }

  static sync() {
    const w = (this.#instance ??= new ChallengeWindow({ id: `${MODULE_ID}-challenge` }));
    if (!getChallenge()) return w.rendered ? w.close() : undefined;
    return w.render({ force: !w.rendered });
  }

  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "dt-challenge-window"],
    window: { title: "Challenge", icon: "fa-solid fa-list-check", resizable: true },
    position: { width: 440, height: "auto" as const },
    actions: {
      roll: ChallengeWindow.#onRoll,
      other: ChallengeWindow.#onOther,
      round: () => endChaseRound(),
      nudge: (_e: Event, b: HTMLElement) => nudgeChallenge(b.dataset.field!, Number(b.dataset.delta)),
      close: () => closeChallenge(),
    },
  };

  get title() {
    return getChallenge()?.title ?? "Challenge";
  }

  async _renderHTML() {
    const c = getChallenge();
    if (!c) return "";
    const gm = game.user.isGM;
    const other = `<div class="dt-row"><select data-other>${allSkills().map((k) => `<option value="${k}">${esc(skillName(k))}</option>`).join("")}</select>
      <button type="button" data-action="other"><i class="fa-solid fa-lightbulb"></i> Try another skill</button></div>`;
    const gmRow = (inner: string) => (gm ? `<div class="dt-row dt-actions dt-talk-gm">${inner}<button type="button" data-action="close"><i class="fa-solid fa-xmark"></i> Close</button></div>` : "");
    if (c.kind === "skill") {
      const pips = (n: number, of: number, cls: string) => Array.from({ length: of }, (_, i) => `<i class="${cls} ${i < n ? "on" : ""}"></i>`).join("");
      return `<p>${esc(c.text)}</p>
        <div class="dt-chal-score"><span>Successes ${pips(c.successes, c.need, "ok")}</span><span>Failures ${pips(c.failures, c.maxFail, "bad")}</span></div>
        ${c.ended ? `<p class="dt-talk-ended"><strong>${c.ended === "won" ? "They did it!" : "It slipped away from them."}</strong></p>` : `
        <div class="dt-loot-actions">${c.skills.map((s) => `<button type="button" data-action="roll" data-skill="${s.skill}" title="${esc(s.note)}"><strong>${esc(skillName(s.skill))}</strong>: ${esc(s.note)}${gm ? ` <small>DC ${s.dc}</small>` : ""}</button>`).join("")}</div>
        ${other}<p class="dt-sub">Anything else the GM allows${gm ? ` (DC ${c.otherDc})` : ""}. Nobody uses the same skill twice in a row.</p>`}
        ${c.log.length ? `<details><summary>${c.log.length} tries</summary><ul class="dt-talk-log">${c.log.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul></details>` : ""}
        ${gmRow(`<button type="button" data-action="nudge" data-field="successes" data-delta="1">Success +</button><button type="button" data-action="nudge" data-field="failures" data-delta="1">Failure +</button>`)}`;
    }
    const track = Array.from({ length: c.escapeAt + 1 }, (_, i) => `<i class="${i === c.lead ? "on" : ""}">${i === c.lead ? "●" : ""}</i>`).join("");
    const rolled = c.rolls.map((r) => `${esc(r.who)} ${r.ok ? "✓" : "✗"}`).join(", ");
    return `<div class="dt-chase-track"><span>${c.mode === "pursue" ? "Caught" : esc(c.other)}</span><span class="dt-chase-steps">${track}</span><span>${c.mode === "pursue" ? "Gets away" : "Safe"}</span></div>
      <p class="dt-sub">Lead ${c.lead} of ${c.escapeAt}. Round ${c.round}.</p>
      ${c.ended ? `<p class="dt-talk-ended"><strong>${c.ended === "caught" ? (c.mode === "pursue" ? `They catch ${esc(c.other)}!` : `${esc(c.other)} catches them!`) : c.mode === "pursue" ? `${esc(c.other)} gets away.` : "They escape!"}</strong></p>` : `
      <p class="dt-chase-comp"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(c.complication.text)}</p>
      <div class="dt-loot-actions"><button type="button" data-action="roll" data-skill="${c.complication.skill}"><strong>${esc(skillName(c.complication.skill))}</strong>${gm ? ` <small>DC ${c.complication.dc}</small>` : ""}</button></div>
      ${other}
      <p class="dt-sub">${rolled ? `This round: ${rolled}` : "Everyone rolls once a round."}</p>`}
      ${c.log.length ? `<details><summary>${c.log.length} rounds</summary><ul class="dt-talk-log">${c.log.map((l) => `<li>${esc(l.text)}</li>`).join("")}</ul></details>` : ""}
      ${gmRow(`${c.ended ? "" : `<button type="button" data-action="round"><i class="fa-solid fa-forward"></i> ${esc(c.other)} rolls, next round</button>`}<button type="button" data-action="nudge" data-field="lead" data-delta="-1">Lead −</button><button type="button" data-action="nudge" data-field="lead" data-delta="1">Lead +</button>`)}`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  async #roll(skill: string) {
    const actor = canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
    if (!actor) return ui.notifications.warn("Select your token (or have a character assigned) first.");
    const c = getChallenge();
    if (c?.kind === "skill" && c.last[actor.name] === skill) return ui.notifications.warn(`${actor.name} used that last time: try a different skill.`);
    if (c?.kind === "chase" && c.rolls.some((r) => r.who === actor.name)) return ui.notifications.info(`${actor.name} has already rolled this round.`);
    const roll = await actor.rollSkill?.(skill, { flavor: `${actor.name}: ${c?.title ?? "challenge"}` });
    const total = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
    if (typeof total === "number") challengeRequest({ who: actor.name, skill, total });
  }

  static #onRoll(this: ChallengeWindow, _e: Event, target: HTMLElement) {
    this.#roll(target.dataset.skill!);
  }

  static #onOther(this: ChallengeWindow) {
    const skill = (this.element.querySelector("select[data-other]") as HTMLSelectElement | null)?.value;
    if (skill) this.#roll(skill);
  }
}
