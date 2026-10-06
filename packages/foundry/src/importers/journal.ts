import { crLabel, TEMPLATES, type Encounter, type LootResult, type PlotHook, type RoomKey } from "@dnd-toolkit/core";
import { ensureFolder, esc, MODULE_ID } from "../util.ts";

export function lootHtml(loot: LootResult): string {
  const coins = (Object.entries(loot.coins) as [string, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n.toLocaleString()} ${k}`)
    .join(", ");
  const items = loot.items
    .map((i) => `<li>${i.quantity > 1 ? `${i.quantity}× ` : ""}${esc(i.name)} <em>(${i.rarity ?? `${i.valueGp} gp`})</em></li>`)
    .join("");
  return `<p><strong>Coins:</strong> ${coins || "none"}</p>` +
    (items ? `<ul>${items}</ul>` : "") +
    `<p><small>Total ≈ ${loot.totalValueGp.toLocaleString()} gp · ${loot.mode} · CR ${loot.cr} · seed <code>${esc(loot.seed)}</code></small></p>`;
}

export function hookHtml(hook: PlotHook): string {
  return `<h2>${esc(hook.title)}</h2><p>${esc(hook.text)}</p>` +
    `<p><strong>GM — Twist:</strong> ${esc(hook.twist)}</p>` +
    `<p><small>${esc(hook.tone)} · seed <code>${esc(hook.seed)}</code></small></p>`;
}

/** Monster list with @UUID links (click to open the statblock), tactics, situation and terrain. */
export function encounterHtml(e: Encounter, { heading = true } = {}): string {
  const monsters = e.groups
    .map((g) => {
      const label = g.monster.uuid ? `@UUID[${g.monster.uuid}]{${esc(g.name)}}` : esc(g.name);
      return `<li>${g.count > 1 ? `${g.count}× ` : ""}${label} <em>(CR ${crLabel(g.monster.cr)}${g.role ? `, ${g.role}` : ""})</em></li>`;
    })
    .join("");
  const rating = e.rating === e.difficulty ? e.rating : `${e.rating} (asked for ${e.difficulty})`;
  return (heading ? `<h3>${esc(TEMPLATES[e.template])}</h3>` : "") +
    `<p><strong>${esc(rating)}</strong> · ${e.totalXp.toLocaleString()} / ${e.budget.toLocaleString()} XP · ${e.partySize} PCs of level ${e.partyLevel}</p>` +
    `<ul>${monsters}</ul>` +
    `<p><strong>Tactics</strong></p><ul>${e.tactics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` +
    `<p><strong>Situation:</strong> ${esc(e.situation)}</p>` +
    `<p><strong>Terrain:</strong> ${esc(e.terrain)}</p>` +
    (e.loot ? `<p><strong>Treasure</strong></p>${lootHtml(e.loot)}` : "") +
    e.warnings.map((w) => `<p><em>⚠ ${esc(w)}</em></p>`).join("") +
    `<p><small>${e.tags ? `tags <code>${esc(e.tags)}</code> · ` : ""}seed <code>${esc(e.seed)}</code></small></p>`;
}

function roomHtml(key: RoomKey): string {
  let html = `<p>${esc(key.description)}</p>`;
  if (key.encounter) html += `<h3>Encounter — ${esc(TEMPLATES[key.encounter.template])}</h3>${encounterHtml(key.encounter, { heading: false })}`;
  if (key.trap) html += `<p><strong>Trap:</strong> ${esc(key.trap)}</p>`;
  if (key.loot) html += `<h3>Treasure</h3>${lootHtml(key.loot)}`;
  return html;
}

export async function createRoomKeyJournal(name: string, keys: RoomKey[], seed: string) {
  return JournalEntry.create({
    name,
    folder: await ensureFolder("JournalEntry"),
    pages: keys.map((k, i) => ({
      name: k.title,
      type: "text",
      sort: i * 1000,
      text: { content: roomHtml(k) },
      flags: { [MODULE_ID]: { roomId: k.roomId } },
    })),
    flags: { [MODULE_ID]: { seed, kind: "roomKey" } },
  });
}

export async function createJournal(name: string, html: string, flags: object = {}) {
  return JournalEntry.create({
    name,
    folder: await ensureFolder("JournalEntry"),
    pages: [{ name, type: "text", text: { content: html } }],
    flags: { [MODULE_ID]: flags },
  });
}

export async function postToChat(html: string, gmOnly = false) {
  return ChatMessage.create({
    content: html,
    speaker: { alias: "DnD Toolkit" },
    whisper: gmOnly ? ChatMessage.getWhisperRecipients("GM") : [],
  });
}
