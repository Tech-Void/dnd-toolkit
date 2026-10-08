import { crLabel, encounterSummary, encounterXp, rateEncounter, TEMPLATES, type Encounter, type EncounterGroup, type LootItem, type LootResult, type PlotHook, type RoomKey, type SideQuest, type Journey } from "@dnd-toolkit/core";
import { ensureFolder, esc, MODULE_ID } from "../util.ts";

/** Loot sections in reading order, with their headings. */
const LOOT_GROUPS: [LootItem["kind"][], string][] = [
  [["magic"], "Magic items"], [["consumable"], "Potions and scrolls"], [["gem", "art"], "Valuables"], [["trade"], "Trade goods"],
  [["gear"], "Gear"], [["trinket"], "Curiosities"], [["part"], "Worth harvesting"], [["key"], "Keys"],
];

const lootValue = (i: LootItem) => (i.kind === "key" ? "" : i.rarity && (i.kind === "magic" || i.kind === "consumable") ? i.rarity : `${i.valueGp.toLocaleString()} gp${i.quantity > 1 ? " each" : ""}`);

export function lootHtml(loot: LootResult): string {
  const coins = (Object.entries(loot.coins) as [string, number][])
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n.toLocaleString()} ${k}`)
    .join(", ");
  const c = loot.container;
  const container = c
    ? `<p><strong>In ${/^[aeiou]/i.test(c.name) ? "an" : "a"} ${esc(c.name)}.</strong>${c.lockDc ? ` Locked: DC ${c.lockDc} thieves' tools (or break it open, DC ${c.lockDc + 2} Strength).` : ""}${c.trap ? ` <strong>Trapped</strong> (spot and disarm DC ${c.trapDc}): ${esc(c.trap)}` : ""}</p>`
    : "";
  const groups = LOOT_GROUPS.map(([kinds, title]) => {
    const items = loot.items.filter((i) => kinds.includes(i.kind));
    if (!items.length) return "";
    const rows = items.map((i) => `<li>${i.quantity > 1 ? `${i.quantity}× ` : ""}${esc(i.name)}${lootValue(i) ? ` <em>(${esc(lootValue(i))})</em>` : ""}${i.note ? `<br><small>${esc(i.note)}</small>` : ""}</li>`).join("");
    return `<p><strong>${title}</strong></p><ul>${rows}</ul>`;
  }).join("");
  return container + `<p><strong>Coins:</strong> ${coins || "none"}</p>` +
    (loot.notes?.length ? `<p><em>${loot.notes.map(esc).join(" ")}</em></p>` : "") +
    groups +
    `<p><small>Total ≈ ${loot.totalValueGp.toLocaleString()} gp · ${loot.mode}${loot.theme ? ` · ${esc(loot.theme)}` : ""} · CR ${loot.cr} · seed <code>${esc(loot.seed)}</code></small></p>`;
}

export function hookHtml(hook: PlotHook): string {
  return `<h2>${esc(hook.title || "Untitled hook")}</h2><p>${esc(hook.text)}</p>` +
    (hook.villain ? `<p><strong>GM — Villain:</strong> ${esc(hook.villain)}</p>` : "") +
    (hook.twist ? `<p><strong>GM — Twist:</strong> ${esc(hook.twist)}</p>` : "") +
    `<p><small>${esc(hook.tone)} · seed <code>${esc(hook.seed)}</code></small></p>`;
}

/** Monster list with @UUID links (click to open the statblock), tactics, situation and terrain. */
const monsterList = (groups: readonly EncounterGroup[]) =>
  `<ul>${groups
    .map((g) => {
      const label = g.monster.uuid ? `@UUID[${g.monster.uuid}]{${esc(g.name)}}` : esc(g.name);
      return `<li>${g.count > 1 ? `${g.count}× ` : ""}${label} <em>(CR ${crLabel(g.monster.cr)}${g.role ? `, ${g.role}` : ""})</em></li>`;
    })
    .join("")}</ul>`;

export function wavesHtml(e: Encounter): string {
  if (!e.waves?.length) return "";
  const total = encounterXp(e);
  return `<p><strong>Waves</strong> · ${total.toLocaleString()} XP in all, ${rateEncounter(total, e.partyLevel, e.partySize)}</p>` +
    e.waves.map((w) => `<p><em>Round ${w.round}</em> · ${w.xp.toLocaleString()} XP · ${esc(w.arrival)}</p>${monsterList(w.groups)}`).join("");
}

export function encounterHtml(e: Encounter, { heading = true } = {}): string {
  const rating = e.rating === e.difficulty ? e.rating : `${e.rating} (asked for ${e.difficulty})`;
  return (heading ? `<h3>${esc(TEMPLATES[e.template])}</h3>` : "") +
    `<p><strong>${esc(rating)}</strong> · ${e.totalXp.toLocaleString()} / ${e.budget.toLocaleString()} XP · ${e.partySize} PCs of level ${e.partyLevel}</p>` +
    monsterList(e.groups) +
    `<p><strong>Tactics</strong></p><ul>${e.tactics.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` +
    wavesHtml(e) +
    `<p><strong>Situation:</strong> ${esc(e.situation)}</p>` +
    `<p><strong>Terrain:</strong> ${esc(e.terrain)}</p>` +
    (e.loot ? `<p><strong>Treasure</strong></p>${lootHtml(e.loot)}` : "") +
    e.warnings.map((w) => `<p><em>⚠ ${esc(w)}</em></p>`).join("") +
    `<p><small>${e.tags ? `tags <code>${esc(e.tags)}</code> · ` : ""}seed <code>${esc(e.seed)}</code></small></p>`;
}

function roomHtml(key: RoomKey): string {
  let html = `<p>${esc(key.description)}</p>`;
  if (key.encounter) html += `<h3>Encounter — ${esc(TEMPLATES[key.encounter.template])}</h3>${encounterHtml(key.encounter, { heading: false })}`;
  if (key.notes?.length) html += `<h3>Doors and keys</h3><ul>${key.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
  if (key.trap) {
    html += `<p><strong>Trap:</strong> ${esc(key.trap)}</p>`;
    if (key.trapCells?.length) html += `<p><em>Its trigger is marked on the map (red squares, GM only). A token that steps on it stops, the game pauses and you get a card with the rolls; a character whose passive score beats the DC spots it a step early.</em></p>`;
  }
  if (key.piles?.length) {
    html += key.piles.map((p) => `<h3>Loot pile</h3><p>${esc(p.note)} <em>DC ${p.dc} Wisdom (Perception) or Intelligence (Investigation) to find.</em></p>${lootHtml(p.loot)}`).join("");
  } else if (key.loot) html += `<h3>Treasure</h3>${lootHtml(key.loot)}`;
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

/** A whole side quest: the hook, then each mission with its fight, checks and rewards. */
export function sideQuestHtml(q: SideQuest, encounters: Map<string, Encounter> = new Map()): string {
  const missions = q.missions.map((m, i) => {
    const enc = encounters.get(m.id);
    return `<h3>${i + 1}. ${esc(m.title)}</h3><p>${esc(m.objective)}. <em>${esc(m.location)}</em></p>` +
      (m.npc ? `<p><strong>Contact:</strong> ${esc(m.npc.name)}, ${esc(m.npc.occupation)}. ${esc(m.npc.personality)}; wants to ${esc(m.npc.motive)}.</p>` : "") +
      (enc ? `<p><strong>Fight:</strong> ${esc(encounterSummary(enc))}</p>` : "") +
      (m.map ? `<p><strong>Map:</strong> ${esc(m.map.type === "battlemap" ? `${m.map.setting} battlemap` : m.map.type)}, seed <code>${esc(m.map.seed)}</code></p>` : "") +
      (m.checks.length ? `<p><strong>Checks:</strong> ${m.checks.map((c) => esc(`${c.key.toUpperCase()} DC ${c.dc} to ${c.why}`)).join("; ")}</p>` : "") +
      `<p><strong>Reward:</strong> ${m.rewardGp} gp${m.hoard ? " and a hoard" : ""}. ${esc(m.leadsTo)}</p>`;
  }).join("");
  return `<h2>${esc(q.title)}</h2><p>${esc(q.hook.text)}</p>` +
    `<p><strong>GM — Villain:</strong> ${esc(q.hook.villain)}. <strong>Prize:</strong> ${esc(q.macguffin)}. <strong>Lair:</strong> ${esc(q.lair)}. <strong>Their mark:</strong> ${esc(q.sigil)}.</p>` +
    `<p><strong>GM — Twist:</strong> ${esc(q.hook.twist)}</p>` + missions;
}

/** A journey, day by day. */
export function journeyHtml(j: Journey): string {
  const days = j.days.map((d) =>
    `<h3>Day ${d.day}: ${esc(d.weather.text)}, ${d.miles} miles</h3>` +
    (d.weather.effect ? `<p><em>${esc(d.weather.effect)}</em></p>` : "") +
    `<p>${esc(d.event.text)}</p>` +
    `<ul>${d.checks.map((c) => `<li>${esc(c.who)}: ${esc(c.key.toUpperCase())} ${c.type === "save" ? "save" : "check"} DC ${c.dc} to ${esc(c.why)}</li>`).join("")}</ul>`).join("");
  return `<h2>${esc(j.from)} to ${esc(j.to)}</h2><p>${j.days.length} days through ${esc(j.terrain)}, ${esc(j.season)}, at a ${esc(j.pace)} pace: ${j.totalMiles} miles.</p>` + days;
}
