import { approaches, moodLabel, SKILL_FOR, talkDc, type Approach } from "@dnd-toolkit/core";
import { adjustTalk, endTalk, getTalk, talkRequest } from "./talk.ts";
import { esc, MODULE_ID } from "./util.ts";

// The conversation window: mood meter, patience, what they've told, and the approaches to try.

const { ApplicationV2 } = foundry.applications.api;

const LABEL: Record<Approach, [string, string]> = {
  persuade: ["Persuade", "fa-handshake"],
  appeal: ["Appeal to what they want", "fa-heart"],
  deceive: ["Deceive", "fa-mask"],
  intimidate: ["Intimidate", "fa-hand-fist"],
  insight: ["Read them (Insight)", "fa-eye"],
};

export class TalkWindow extends ApplicationV2 {
  static #instance: TalkWindow | null = null;

  constructor(options: object = {}) {
    super(options);
  }

  /** Open, redraw or close to match the current conversation. */
  static sync() {
    const t = getTalk();
    const w = (this.#instance ??= new TalkWindow({ id: `${MODULE_ID}-talk` }));
    if (!t) return w.rendered ? w.close() : undefined;
    return w.render({ force: !w.rendered });
  }

  static DEFAULT_OPTIONS = {
    classes: [MODULE_ID, "dt-talk-window"],
    window: { title: "Conversation", icon: "fa-solid fa-comments", resizable: true },
    position: { width: 420, height: "auto" as const },
    actions: {
      try: TalkWindow.#onTry,
      mood: (_e: Event, b: HTMLElement) => adjustTalk("mood", Number(b.dataset.delta)),
      patience: (_e: Event, b: HTMLElement) => adjustTalk("patience", Number(b.dataset.delta)),
      end: () => endTalk(),
    },
  };

  get title() {
    return getTalk() ? `Talking with ${getTalk()!.name}` : "Conversation";
  }

  async _renderHTML() {
    const t = getTalk();
    if (!t) return `<p class="dt-empty">Nobody's talking.</p>`;
    const gm = game.user.isGM;
    const meter = [-3, -2, -1, 0, 1, 2, 3].map((i) => `<i class="${i === t.mood ? "on" : ""} m${i}"></i>`).join("");
    const told = t.info.slice(0, t.told);
    const ended = t.ended ? { agreed: "They agreed.", cowed: "They gave in (for now).", walked: "They've stopped talking.", hostile: "It's turned hostile." }[t.ended] : "";
    return `<div class="dt-talk-head">
        <div class="dt-standing s${t.mood}"><span class="dt-talk-meter">${meter}</span><b>${moodLabel(t.mood)}</b></div>
        <span class="dt-talk-patience" title="Patience: each failure costs some">${"<i class='fa-solid fa-hourglass-half'></i>".repeat(Math.max(0, t.patience))}</span>
      </div>
      ${t.ask ? `<p><strong>The ask:</strong> ${esc(t.ask)}</p>` : ""}
      <p class="dt-sub">${esc(t.personality)}.</p>
      ${t.motiveKnown ? `<p><i class="fa-solid fa-eye"></i> Wants to ${esc(t.motive)}.</p>` : gm ? `<p class="dt-gm">Wants to ${esc(t.motive)} (hidden).</p>` : ""}
      ${told.length ? `<ul class="dt-talk-told">${told.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      ${t.secretTold ? `<p class="dt-loot-warn"><i class="fa-solid fa-key"></i> ${esc(t.secret)}</p>` : gm ? `<p class="dt-gm">Secret: ${esc(t.secret)}</p>` : ""}
      ${ended ? `<p class="dt-talk-ended"><strong>${ended}</strong></p>` : `<div class="dt-loot-actions">${approaches(t).map((a) => `<button type="button" data-action="try" data-approach="${a}"><i class="fa-solid ${LABEL[a][1]}"></i> ${LABEL[a][0]}${gm ? ` <small>DC ${talkDc(t, a)}</small>` : ""}</button>`).join("")}</div>`}
      ${t.log.length ? `<details><summary>${t.log.length} exchange${t.log.length === 1 ? "" : "s"}</summary><ul class="dt-talk-log">${t.log.map((l) => `<li><strong>${esc(l.who)}</strong> (${l.total}${gm ? ` vs ${l.dc}` : ""}): ${esc(l.text)}</li>`).join("")}</ul></details>` : ""}
      ${gm ? `<div class="dt-row dt-actions dt-talk-gm">
        <button type="button" data-action="mood" data-delta="-1" title="Mood down">Mood −</button><button type="button" data-action="mood" data-delta="1" title="Mood up">Mood +</button>
        <button type="button" data-action="patience" data-delta="1" title="More patience">Patience +</button>
        <button type="button" data-action="end"><i class="fa-solid fa-flag-checkered"></i> End and remember</button></div>` : ""}`;
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result;
  }

  static async #onTry(this: TalkWindow, _e: Event, target: HTMLElement) {
    const approach = target.dataset.approach as Approach;
    const t = getTalk();
    const actor = canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
    if (!t || !actor) return ui.notifications.warn("Select your token (or have a character assigned) first.");
    const roll = await actor.rollSkill?.(SKILL_FOR[approach], { flavor: `${actor.name}: ${LABEL[approach][0].toLowerCase()} (${t.name})` });
    const total = roll?.total ?? (Array.isArray(roll) ? roll[0]?.total : undefined);
    if (typeof total === "number") talkRequest(approach, total, actor.name);
  }
}
