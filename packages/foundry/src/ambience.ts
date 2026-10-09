import { classifyAudio, MOOD_FALLBACK, MOODS, sceneMood, TIME_DARKNESS, weatherEffect, WEATHER_EFFECTS, type Mood, type TimeOfDay } from "@dnd-toolkit/core";
import { esc, MODULE_ID } from "./util.ts";

// ---------------------------------------------------------------------------
// Ambience: the audio you already have (your Data folder and installed modules), sorted into moods
// by name and turned into playlists. Scenes the toolkit makes get the playlist that fits (it plays
// when the scene is activated), fights switch to combat music, and camp nights and travel days set
// the time of day and Foundry's weather. A GM button sets any of it by hand.

interface Library {
  scanned: number;
  files: { path: string; moods: Mood[] }[];
}

export function registerAmbienceSettings() {
  game.settings.register(MODULE_ID, "audioLibrary", { scope: "world", config: false, type: Object, default: { scanned: 0, files: [] } });
  game.settings.register(MODULE_ID, "ambienceAuto", {
    name: "Ambience: automatic", hint: "Scenes the toolkit makes get a playlist from your own audio that fits them; camp nights and travel days set the time of day and weather.",
    scope: "world", config: true, type: Boolean, default: true,
  });
  game.settings.register(MODULE_ID, "combatMusic", {
    name: "Ambience: combat music", hint: "When a fight starts, switch to your combat tracks (any audio with battle, combat or fight in its name); back to the scene's ambience after.",
    scope: "world", config: true, type: Boolean, default: true,
  });
}

const on = (k: string) => {
  try {
    return !!game.settings.get(MODULE_ID, k);
  } catch {
    return false;
  }
};
const library = (): Library => game.settings.get(MODULE_ID, "audioLibrary") ?? { scanned: 0, files: [] };
const filePicker = () => foundry.applications?.apps?.FilePicker?.implementation ?? (globalThis as any).FilePicker;

const AUDIO = [".mp3", ".ogg", ".wav", ".m4a", ".flac", ".webm", ".opus"];
/** Folders not worth walking (images, game data). */
const SKIP = /^(worlds|systems|fa-assets|icons|tokens?|maps?|portraits?|images?|textures?|tiles?)$/i;

/** Walk the Data folder for audio files and sort them by mood (GM; a few seconds the first time). */
export async function scanAudio(): Promise<Library> {
  const FP = filePicker();
  const files: Library["files"] = [];
  const queue: [string, number][] = [["", 0]];
  let visited = 0;
  while (queue.length && visited < 2500) {
    const [dir, depth] = queue.shift()!;
    visited++;
    let res: any;
    try {
      res = await FP.browse("data", dir, { extensions: AUDIO });
    } catch {
      continue;
    }
    for (const f of res.files ?? []) {
      const moods = classifyAudio(f);
      if (moods.length) files.push({ path: f, moods });
    }
    if (depth < 6) for (const d of res.dirs ?? []) if (!SKIP.test(d.split("/").pop() ?? "")) queue.push([d, depth + 1]);
  }
  const lib = { scanned: Date.now(), files };
  await game.settings.set(MODULE_ID, "audioLibrary", lib);
  return lib;
}

const tracksFor = (mood: Mood) => {
  const files = library().files;
  for (const m of [mood, ...MOOD_FALLBACK[mood]]) {
    const hit = files.filter((f) => f.moods.includes(m));
    if (hit.length) return hit;
  }
  return [];
};

const trackName = (path: string) => decodeURIComponent(path.split("/").pop() ?? path).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");

/** The toolkit's playlist for a mood (made the first time), or null with no fitting audio. */
export async function moodPlaylist(mood: Mood): Promise<any> {
  const existing = game.playlists.find((p: any) => p.getFlag(MODULE_ID, "mood") === mood);
  if (existing) return existing;
  const tracks = tracksFor(mood).slice(0, 25);
  if (!tracks.length) return null;
  const label = mood.charAt(0).toUpperCase() + mood.slice(1);
  return Playlist.create({
    name: `Ambience: ${label}`, mode: CONST.PLAYLIST_MODES.SHUFFLE, fade: 2000,
    sounds: tracks.map((t) => ({ name: trackName(t.path), path: t.path, repeat: mood !== "combat", volume: 0.5 })),
    flags: { [MODULE_ID]: { mood } },
  });
}

/** Stop the toolkit's other playlists and play this one. */
async function playOnly(playlist: any) {
  for (const p of game.playlists.filter((x: any) => x.playing && x.getFlag(MODULE_ID, "mood") && x !== playlist)) await p.stopAll();
  if (playlist && !playlist.playing) await playlist.playAll();
}

export interface AmbienceOptions {
  mood?: Mood | "";
  time?: TimeOfDay | "";
  weather?: string;
}

/** Set a scene's mood (playlist), time of day (darkness) and weather. */
export async function applyAmbience(scene: any, o: AmbienceOptions) {
  const update: Record<string, unknown> = {};
  let playlist: any = null;
  if (o.mood) {
    playlist = await moodPlaylist(o.mood);
    if (playlist) update.playlist = playlist.id;
    else ui.notifications.info(`No ${o.mood} tracks among your audio (Ambience → Rescan after adding some).`);
  }
  if (o.time) update["environment.darknessLevel"] = TIME_DARKNESS[o.time];
  if (o.weather !== undefined) update.weather = o.weather;
  if (Object.keys(update).length) await scene.update(update, { animateDarkness: 4000 });
  if (playlist && scene.active) await playOnly(playlist);
}

/** Set after a travel day's battlemap is asked for, used by the next toolkit scene made. */
let pending: AmbienceOptions | null = null;
export const queueAmbience = (o: AmbienceOptions) => (pending = o);
export const travelAmbience = (weatherText: string, season: string, time?: string): AmbienceOptions => ({
  weather: weatherEffect(weatherText, season),
  time: /night|watch|midnight/.test(time ?? "") ? "night" : /dusk|evening/.test(time ?? "") ? "dusk" : /dawn|morning/.test(time ?? "") ? "dawn" : "day",
});

/** The GM's ambience panel for the current scene. */
export async function ambienceDialog() {
  const scene = canvas.scene;
  if (!scene) return ui.notifications.warn("Open a scene first.");
  const lib = library();
  const counts = (m: Mood) => lib.files.filter((f) => f.moods.includes(m)).length;
  const flags = scene.flags?.[MODULE_ID] ?? {};
  const auto = sceneMood(flags.kind, flags.setting);
  const DialogV2 = foundry.applications.api.DialogV2;
  const choice = await DialogV2.wait({
    window: { title: `Ambience: ${scene.name}`, icon: "fa-solid fa-music" },
    content: `<div class="dt-ambience">
      <p class="dt-sub">${lib.scanned ? `${lib.files.length} tracks found in your audio.` : "Your audio hasn't been scanned yet: Rescan finds it (Data folder and modules)."}</p>
      <label>Mood <select name="mood"><option value="">(leave as is)</option>${MOODS.map((m) => `<option value="${m}" ${m === auto ? "selected" : ""}>${m}${counts(m) ? ` (${counts(m)})` : " (no tracks)"}</option>`).join("")}</select></label>
      <label>Time <select name="time"><option value="">(leave as is)</option>${(["dawn", "day", "dusk", "night"] as TimeOfDay[]).map((t) => `<option value="${t}">${t}</option>`).join("")}</select></label>
      <label>Weather <select name="weather"><option value="keep">(leave as is)</option>${WEATHER_EFFECTS.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join("")}</select></label></div>`,
    buttons: [
      { action: "apply", label: "Apply", default: true, callback: (_e: Event, b: any) => ({ mood: b.form.elements.mood.value, time: b.form.elements.time.value, weather: b.form.elements.weather.value }) },
      { action: "scan", label: "Rescan audio" },
      { action: "stop", label: "Stop music" },
    ],
    rejectClose: false,
  });
  if (!choice) return;
  if (choice === "scan") {
    ui.notifications.info("Looking through your audio…");
    const l = await scanAudio();
    // Rebuild playlists from the new library next time they're used.
    for (const p of game.playlists.filter((x: any) => x.getFlag(MODULE_ID, "mood"))) await p.delete();
    return ui.notifications.info(`Found ${l.files.length} tracks that fit a mood.`);
  }
  if (choice === "stop") {
    for (const p of game.playlists.filter((x: any) => x.playing && x.getFlag(MODULE_ID, "mood"))) await p.stopAll();
    return;
  }
  await applyAmbience(scene, { mood: choice.mood, time: choice.time, weather: choice.weather === "keep" ? undefined : choice.weather });
}

// --- Wiring ---------------------------------------------------------------------------------------

let beforeCombat: string[] = [];
let lastCampPhase = "";

export function initAmbience() {
  const gm = () => !!game.users.activeGM?.isSelf;
  // New toolkit scenes get their mood (and a travel day's weather).
  Hooks.on("createScene", async (scene: any) => {
    const f = scene.flags?.[MODULE_ID];
    if (!gm() || !f?.kind || !on("ambienceAuto")) return;
    if (!library().scanned) await scanAudio();
    const extra = pending;
    pending = null;
    await applyAmbience(scene, { mood: sceneMood(f.kind, f.setting), ...(extra ?? {}) });
  });
  // Fights: combat music, then back.
  Hooks.on("combatStart", async () => {
    if (!gm() || !on("combatMusic")) return;
    const music = await moodPlaylist("combat");
    if (!music) return;
    beforeCombat = game.playlists.filter((p: any) => p.playing && p !== music).map((p: any) => p.id);
    await playOnly(music);
  });
  Hooks.on("deleteCombat", async () => {
    if (!gm() || !on("combatMusic")) return;
    const music = game.playlists.find((p: any) => p.getFlag(MODULE_ID, "mood") === "combat");
    if (!music?.playing) return;
    await music.stopAll();
    const back = beforeCombat.map((id) => game.playlists.get(id)).filter(Boolean);
    const scenePl = canvas.scene?.playlist;
    for (const p of back.length ? back : scenePl ? [scenePl] : []) await p.playAll();
    beforeCombat = [];
  });
  // Camp: night falls when the watches start, dawn comes in the morning.
  Hooks.on("updateSetting", (setting: any) => {
    if (setting.key !== `${MODULE_ID}.camp` || !gm() || !on("ambienceAuto") || !canvas.scene) return;
    const camp = game.settings.get(MODULE_ID, "camp");
    const phase = camp?.phase ?? "";
    if (phase === lastCampPhase) return;
    lastCampPhase = phase;
    if (phase === "night") applyAmbience(canvas.scene, { time: "night", weather: weatherEffect(camp.weather?.text ?? "", camp.season) });
    else if (phase === "morning") applyAmbience(canvas.scene, { time: "dawn" });
  });
}
