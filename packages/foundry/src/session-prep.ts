import {
  generateEncounter,
  generateLoot,
  randomSeed,
  rerollPrep,
  sessionPrep,
  TERRAINS,
  type Encounter,
  type LootResult,
  type PrepOptions,
  type PrepPart,
  type SessionPrep,
  type Terrain,
} from "@dnd-toolkit/core";
import { getCampaign } from "./campaign-store.ts";
import { getCatalog } from "./catalog.ts";
import { currentDay } from "./downtime.ts";
import { encounterHtml, lootHtml } from "./importers/journal.ts";
import { placeEncounter } from "./importers/tokens.ts";
import { ensureFolder, esc, MODULE_ID } from "./util.ts";
import { endSession, sessionEventCount, sessionNumber } from "./rewards.ts";

// ---------------------------------------------------------------------------
// Campaign → Next session: a prep page built from the campaign (quests and what's next, faction
// moves, NPCs due back, the road ahead, ready fights, rumors, loot, weather). Each part rerolls on
// its own, fights can be dropped on the scene, and the page is written to a GM journal.

interface PrepState {
  prep: SessionPrep;
  opts: PrepOptions;
  encounters: Record<string, Encounter>;
  loot: LootResult | null;
  lastDay?: number;
}

export function registerPrepSettings() {
  game.settings.register(MODULE_ID, "sessionPrep", {
    scope: "world", config: false, type: Object, default: {},
    onChange: () => Hooks.callAll(`${MODULE_ID}.campaignChanged`),
  });
}

const getPrep = (): PrepState | null => {
  const s = game.settings.get(MODULE_ID, "sessionPrep") as PrepState | Record<string, never>;
  return s && "prep" in s ? structuredClone(s as PrepState) : null;
};
const savePrep = (s: PrepState) => game.settings.set(MODULE_ID, "sessionPrep", s);

const party = () => {
  const pcs = game.actors.filter((a: any) => a.type === "character" && a.hasPlayerOwner);
  const level = pcs.length ? Math.round(pcs.reduce((n: number, a: any) => n + (Number(a.system?.details?.level) || 1), 0) / pcs.length) : 3;
  return { level: Math.max(1, Math.min(20, level)), size: Math.max(1, pcs.length || 4) };
};

async function catalog() {
  try {
    const c = await getCatalog("compendium");
    if (c.length) return c;
  } catch {}
  return getCatalog("srd");
}

/** Build the fights for a prep's encounter specs (skipping any that can't be filled). */
async function buildEncounters(prep: SessionPrep): Promise<Record<string, Encounter>> {
  const cat = await catalog();
  const { level, size } = party();
  const out: Record<string, Encounter> = {};
  for (const e of prep.encounters) {
    try {
      out[e.seed] = generateEncounter({ catalog: cat, partyLevel: level, partySize: size, difficulty: e.difficulty, tags: e.tags, seed: e.seed, loot: false });
    } catch {
      try {
        out[e.seed] = generateEncounter({ catalog: cat, partyLevel: level, partySize: size, difficulty: e.difficulty, seed: e.seed, loot: false });
      } catch {}
    }
  }
  return out;
}

const TERRAIN_KEYS = Object.keys(TERRAINS) as Terrain[];
const sel = (name: string, options: string[], value?: string, blank = "") =>
  `<select data-prep="${name}">${blank ? `<option value="">${blank}</option>` : ""}${options.map((o) => `<option value="${o}" ${o === value ? "selected" : ""}>${o}</option>`).join("")}</select>`;
const btn = (op: string, label: string, data: Record<string, string> = {}, title = "") =>
  `<button type="button" data-action="campaign" data-op="${op}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ")} ${title ? `title="${esc(title)}"` : ""}>${label}</button>`;
const reroll = (part: PrepPart | "loot") => btn("prepReroll", `<i class="fa-solid fa-dice"></i>`, { part }, "Reroll this part");

export function prepHtml(): string {
  const s = getPrep();
  const o = s?.opts;
  const c = getCampaign();
  const places = c.places.map((p) => p.name);
  const form = `<div class="dt-row dt-prep-form">
    <label>Heading to <input type="text" data-prep="dest" list="dt-prep-places" value="${esc(o?.destination?.name ?? "")}" placeholder="(unknown)"></label>
    <datalist id="dt-prep-places">${places.map((p) => `<option value="${esc(p)}">`).join("")}</datalist>
    <label>through ${sel("terrain", TERRAIN_KEYS, o?.destination?.terrain, "—")}</label>
    <label><input type="number" data-prep="days" min="0" max="60" value="${o?.destination?.days ?? ""}" placeholder="days" style="width:4em"> days</label>
    <label>${sel("climate", ["temperate", "cold", "hot"], o?.climate ?? "temperate")}</label>
    <label>${sel("season", ["spring", "summer", "autumn", "winter"], o?.season ?? "summer")}</label>
    ${btn("prep", `<i class="fa-solid fa-wand-magic-sparkles"></i> ${s ? "Prep again" : "Prep next session"}`)}
  </div>`;
  const end = btn("prepEnd", `<i class="fa-solid fa-flag-checkered"></i> End session ${sessionNumber()} &amp; recap`, {}, `Write a recap of this session (${sessionEventCount()} things logged: XP, loot, fights, quests) for the players, and start a new one`);
  if (!s) return `${form}<p class="dt-sub">${end}</p><p class="dt-empty">Nothing prepped yet. Set where they're heading (or leave it blank) and press <em>Prep next session</em>.</p>`;
  const p = s.prep;
  const section = (title: string, icon: string, body: string, part?: PrepPart | "loot") =>
    `<div class="dt-card dt-prep"><p class="dt-enc-head"><i class="fa-solid ${icon}"></i> <strong>${title}</strong>${part ? ` ${reroll(part)}` : ""}</p>${body}</div>`;
  const list = (items: string[], empty: string) => (items.length ? `<ul>${items.join("")}</ul>` : `<p class="dt-empty">${empty}</p>`);
  return `${form}
    <p class="dt-sub">Prepped for day ${p.day}. ${end} ${btn("prepJournal", `<i class="fa-solid fa-book"></i> Write to journal`, {}, "Write (or update) the GM-only “Next session” journal")}</p>
    ${p.recap.length ? section("Since last time", "fa-clock-rotate-left", list(p.recap.map((r) => `<li>${esc(r)}</li>`), "")) : ""}
    ${section("Quests", "fa-scroll", list(p.quests.map((q) => `<li><strong>${esc(q.title)}</strong> (${q.progress[0]}/${q.progress[1]})${q.giver ? ` for ${esc(q.giver)}` : ""}: next, ${esc(q.next)}</li>`), "No active quests: lean on a hook or a faction move."))}
    ${section("Faction moves", "fa-flag", list(p.factions.map((f) => `<li><strong>${esc(f.name)}</strong> <small>(${esc(f.standing)})</small>: ${esc(f.move)}</li>`), "No factions yet."), "factions")}
    ${section("Who turns up", "fa-users", list(p.npcs.map((n) => `<li><strong>${esc(n.name)}</strong>${n.lastSeen !== undefined ? ` <small>(last seen day ${n.lastSeen})</small>` : ""} ${esc(n.why)}.</li>`), "Nobody known yet."), "npcs")}
    ${section("The road ahead", "fa-route", list(p.ahead.map((a) => `<li>${esc(a)}</li>`), ""))}
    ${section("Ready fights", "fa-skull-crossbones", p.encounters.map((e) => {
      const enc = s.encounters[e.seed];
      return `<div class="dt-prep-fight"><p><strong>${esc(e.why)}</strong> <small>${esc(e.difficulty)}${e.tags ? ` · ${esc(e.tags)}` : ""}</small>
        ${enc ? btn("prepPlace", `<i class="fa-solid fa-chess-pawn"></i> Place (hidden)`, { seed: e.seed }, "Drop them on the current scene, hidden") : ""}</p>
        ${enc ? encounterHtml(enc, { heading: false }) : `<p class="dt-empty">Nothing in the catalog fits.</p>`}</div>`;
    }).join(""), "encounters")}
    ${section("Rumors", "fa-ear-listen", list(p.rumors.map((r) => `<li>${esc(r.text)} <span class="dt-gm">${r.true ? "true" : "false"}</span></li>`), ""), "rumors")}
    ${section("Loot bundle", "fa-sack-dollar", s.loot ? lootHtml(s.loot) : "", "loot")}
    ${section("Weather", "fa-cloud-sun", `<p>${esc(p.weather.text)}${p.weather.effect ? ` <em>${esc(p.weather.effect)}</em>` : ""}</p>`, "weather")}`;
}

function readOpts(root: HTMLElement, prev?: PrepOptions): PrepOptions {
  const v = (k: string) => ((root.querySelector(`[data-prep="${k}"]`) as HTMLInputElement | null)?.value ?? "").trim();
  const dest = v("dest");
  const terrain = v("terrain") as Terrain | "";
  const days = Number(v("days")) || undefined;
  return {
    day: currentDay(),
    partyLevel: party().level,
    climate: (v("climate") || "temperate") as PrepOptions["climate"],
    season: (v("season") || "summer") as PrepOptions["season"],
    destination: dest || terrain ? { name: dest || "the next stop", terrain: terrain || undefined, days } : undefined,
    since: prev?.day,
    seed: randomSeed(),
  };
}

/** Campaign tab buttons for the Next session view. Returns true if it handled the op. */
export async function prepAction(op: string, d: DOMStringMap, root: HTMLElement): Promise<boolean> {
  const s = getPrep();
  switch (op) {
    case "prep": {
      const opts = readOpts(root, s?.lastDay !== undefined ? { ...s.opts, day: s.lastDay } : undefined);
      ui.notifications.info("Prepping the next session…");
      const prep = sessionPrep(getCampaign(), opts);
      const loot = generateLoot({ cr: prep.lootCr, mode: "hoard", seed: `${prep.seed}:loot` });
      await savePrep({ prep, opts, encounters: await buildEncounters(prep), loot, lastDay: s?.prep.day });
      return true;
    }
    case "prepReroll": {
      if (!s) return true;
      const part = d.part as PrepPart | "loot";
      if (part === "loot") s.loot = generateLoot({ cr: s.prep.lootCr, mode: "hoard", seed: randomSeed() });
      else {
        s.prep = rerollPrep(getCampaign(), s.prep, s.opts, part, randomSeed());
        if (part === "encounters") s.encounters = await buildEncounters(s.prep);
      }
      await savePrep(s);
      return true;
    }
    case "prepPlace": {
      const enc = s?.encounters[d.seed!];
      if (!enc) return true;
      if (!canvas.scene) {
        ui.notifications.warn("Open a scene first.");
        return true;
      }
      await placeEncounter(enc, { hidden: true });
      ui.notifications.info("Placed (hidden). Reveal them when the fight starts.");
      return true;
    }
    case "prepEnd":
      await endSession();
      return true;
    case "prepJournal": {
      if (!s) return true;
      await writeJournal(s);
      return true;
    }
  }
  return false;
}

async function writeJournal(s: PrepState) {
  const p = s.prep;
  const ul = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : "<p><em>None.</em></p>");
  const html = `${p.recap.length ? `<h2>Since last time</h2>${ul(p.recap.map(esc))}` : ""}
    <h2>Quests</h2>${ul(p.quests.map((q) => `<strong>${esc(q.title)}</strong> (${q.progress[0]}/${q.progress[1]}): next, ${esc(q.next)}`))}
    <h2>Faction moves</h2>${ul(p.factions.map((f) => `<strong>${esc(f.name)}</strong> (${esc(f.standing)}): ${esc(f.move)}`))}
    <h2>Who turns up</h2>${ul(p.npcs.map((n) => `<strong>${esc(n.name)}</strong> ${esc(n.why)}.`))}
    <h2>The road ahead</h2>${ul(p.ahead.map(esc))}
    <h2>Ready fights</h2>${p.encounters.map((e) => `<h3>${esc(e.why)}</h3>${s.encounters[e.seed] ? encounterHtml(s.encounters[e.seed]!, { heading: false }) : "<p><em>Nothing fits.</em></p>"}`).join("")}
    <h2>Rumors</h2>${ul(p.rumors.map((r) => `${esc(r.text)} <em>(${r.true ? "true" : "false"})</em>`))}
    ${s.loot ? `<h2>Loot bundle</h2>${lootHtml(s.loot)}` : ""}
    <h2>Weather</h2><p>${esc(p.weather.text)}${p.weather.effect ? ` <em>${esc(p.weather.effect)}</em>` : ""}</p>`;
  const name = `Next session (day ${p.day})`;
  let journal = game.journal.find((j: any) => j.getFlag(MODULE_ID, "kind") === "sessionPrep");
  if (journal) {
    await journal.update({ name });
    const page = journal.pages.contents[0];
    if (page) await page.update({ name, "text.content": html });
  } else {
    journal = await JournalEntry.create({ name, folder: await ensureFolder("JournalEntry"), ownership: { default: 0 }, flags: { [MODULE_ID]: { kind: "sessionPrep" } }, pages: [{ name, type: "text", text: { content: html } }] });
  }
  journal.sheet.render(true);
}
