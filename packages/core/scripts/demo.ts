// Quick look at the generators without Foundry: `npm run demo [seed] [tags]`
import { crLabel, encounterSummary, generateDungeon, generateEncounter, generateHook, generateLoot, renderAscii, stockDungeon } from "../src/index.ts";

const seed = process.argv[2] ?? "demo";
const tags = process.argv[3] ?? "";

const map = generateDungeon({ seed });
console.log(`Dungeon (seed "${seed}") — ${map.rooms.length} rooms, ${map.walls.length} walls, ${map.walls.filter((w) => w.door).length} doors\n`);
console.log(renderAscii(map));

console.log(`\nRoom key${tags ? ` (monsters: ${tags})` : ""}:`);
for (const k of stockDungeon(map, { partyLevel: 3, tags })) {
  const extras = [k.encounter && encounterSummary(k.encounter), k.trap, k.loot && `hoard ~${k.loot.totalValueGp} gp`].filter(Boolean);
  console.log(`  ${k.title}: ${k.description}${extras.length ? `\n      ${extras.join("\n      ")}` : ""}`);
}

console.log(`\nEncounters for 4 level-5 PCs${tags ? `, tags "${tags}"` : ""}:`);
for (const difficulty of ["low", "moderate", "high", "deadly"] as const) {
  const e = generateEncounter({ partyLevel: 5, partySize: 4, difficulty, tags, seed: `${seed}:${difficulty}`, loot: true });
  console.log(`\n  [${difficulty}] ${e.template} — ${e.totalXp}/${e.budget} XP, rates ${e.rating}`);
  for (const g of e.groups) console.log(`    ${g.count}× ${g.name} (CR ${crLabel(g.monster.cr)}, ${g.role})`);
  for (const t of e.tactics) console.log(`    • ${t}`);
  console.log(`    Situation: ${e.situation}\n    Terrain: ${e.terrain}`);
  for (const w of e.warnings) console.log(`    ⚠ ${w}`);
}

console.log("\nHoard (CR 7):");
console.dir(generateLoot({ cr: 7, mode: "hoard", seed }), { depth: 3 });

console.log("\nPlot hook:");
const hook = generateHook({ seed, partyLevel: 3 });
console.log(`  ${hook.title}\n  ${hook.text}\n  Twist: ${hook.twist}`);
