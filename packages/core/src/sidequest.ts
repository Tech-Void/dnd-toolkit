import { createRng, randomSeed, type Rng } from "./rng.ts";
import { composeHookText, type HookTone, type PlotHook } from "./hooks.ts";
import { generateNpc, type Npc, type NpcRole } from "./npc.ts";
import type { BattlemapSetting } from "./battlemap.ts";
import type { Difficulty, EncounterTemplate } from "./encounter.ts";

// ---------------------------------------------------------------------------
// Side quests: a short string of missions off the main road. One villain, one prize, one lair and
// one calling card run through every mission so the whole thing hangs together. Start from a
// premade quest type, a keyword ("silver serpent"), or fully random.

export type MissionKind = "lead" | "journey" | "delve" | "showdown";
export type QuestMode = "premade" | "keyword" | "random";

/** A check the party will likely face, e.g. Insight DC 13 to spot the lie. */
export interface MissionCheck {
  /** dnd5e skill code ("ins") or ability for a save ("dex"). */
  key: string;
  type: "skill" | "save";
  dc: number;
  why: string;
}

export interface Mission {
  id: string;
  kind: MissionKind;
  title: string;
  objective: string;
  location: string;
  /** The clue that points to the next mission. */
  leadsTo: string;
  map?: { type: "dungeon" | "cave" | "battlemap"; seed: string; setting?: BattlemapSetting };
  /** Monster tag queries from most to least specific; the first one that fits the party is used. */
  encounter?: { tags: string[]; difficulty: Difficulty; template?: EncounterTemplate; seed: string };
  checks: MissionCheck[];
  npc?: Npc;
  rewardGp: number;
  hoard?: { seed: string; cr: number };
}

export interface SideQuest {
  seed: string;
  mode: QuestMode;
  /** Quest type id, e.g. "dragon". */
  archetype: string;
  title: string;
  hook: PlotHook;
  /** The threads every mission shares. */
  villainName: string;
  macguffin: string;
  lair: string;
  sigil: string;
  region: string;
  /** Monster tags for the villain's forces (fallback chain) and for the villain themself. */
  tags: string[];
  bossTags: string[];
  partyLevel: number;
  /** Every fight one step easier or harder (kept for rerolls). */
  difficultyShift?: number;
  missions: Mission[];
}

export interface SideQuestOptions {
  mode?: QuestMode;
  /** Quest type for premade mode (random if empty). */
  archetype?: string;
  /** For keyword mode, e.g. "silver serpent". */
  keyword?: string;
  partyLevel?: number;
  tone?: HookTone;
  /** Number of missions, 2 to 5. */
  length?: number;
  /** Monster tags for the villain's forces and for the villain, instead of the quest type's. */
  foes?: string;
  boss?: string;
  /** Every fight one step easier or harder. */
  difficultyShift?: -1 | 0 | 1;
  seed?: string | number;
}

type CheckSpec = [key: string, type: "skill" | "save", why: string];

interface MissionSpec {
  objective: string;
  location?: string;
  map?: "dungeon" | "cave" | BattlemapSetting;
  checks: CheckSpec[];
  npc?: NpcRole;
  /** Fight the villain's forces ("minions") or the villain ("boss"). */
  foes?: "minions" | "boss";
  template?: EncounterTemplate;
  leadsTo: string;
}

interface Archetype {
  id: string;
  label: string;
  tone: Exclude<HookTone, "any">;
  tags: string[];
  bossTags: string[];
  /** "{name}, ..." */
  villains: string[];
  names: string[];
  macguffins: string[];
  lairs: string[];
  sigils: string[];
  patrons: string[];
  /** Goal for the hook, with placeholders. */
  goals: string[];
  twists: string[];
  /** Steps written for this quest type; any kind left out uses the shared pool. */
  missions: Partial<Record<MissionKind, MissionSpec[]>>;
}

// --- Shared mission pools: used when a quest type has none of its own for a step. -------------

const GENERIC: Record<MissionKind, MissionSpec[]> = {
  lead: [
    { objective: "Find the witness who saw {name}'s people, and get the truth out of them", npc: "commoner", checks: [["ins", "skill", "notice what the witness leaves out"]], leadsTo: "The witness describes {sigil}, and the road toward {region}." },
    { objective: "Search the last victim's rooms for anything about {macguffin}", npc: "scholar", checks: [["inv", "skill", "find the letter hidden in the lining of a coat"]], leadsTo: "The letter bears {sigil} and names a meeting place in {region}." },
    { objective: "Lean on the fence who's been moving goods for {name}", npc: "criminal", checks: [["itm", "skill", "scare a name out of the fence"], ["ins", "skill", "tell whether the fence is lying"]], leadsTo: "The fence gives up the route {name}'s people use through {region}." },
    { objective: "Buy drinks for the tavern regulars until someone talks about {name}", npc: "innkeeper", checks: [["per", "skill", "get the regulars talking"], ["con", "save", "keep up with a dwarf's drinking"]], leadsTo: "A drunk trapper swears he saw {sigil} near {lair}." },
    { objective: "Ask the town archivist what happened the last time {sigil} appeared", npc: "scholar", checks: [["his", "skill", "find the old account in the records"]], leadsTo: "Sixty years ago, it all started at {lair}." },
    { objective: "Follow the one survivor home and find out why they're lying", npc: "commoner", checks: [["ste", "skill", "tail the survivor unseen"], ["ins", "skill", "read their fear"]], leadsTo: "The survivor was paid to stay quiet, in coins marked with {sigil}." },
  ],
  journey: [
    { objective: "Travel the old road into {region}, where {name}'s scouts are watching", map: "road", foes: "minions", checks: [["prc", "skill", "spot the ambush before it springs"]], leadsTo: "One of the scouts carries orders marked with {sigil}." },
    { objective: "Slip past the camp guarding the way to {lair}", map: "camp", foes: "minions", checks: [["ste", "skill", "get past the sentries unseen"]], leadsTo: "A map in the camp leader's tent shows the way into {lair}." },
    { objective: "Cross the ruins the locals in {region} won't go near", map: "ruins", foes: "minions", checks: [["dex", "save", "keep your footing when the floor gives way"]], leadsTo: "Fresh tracks and {sigil} scratched into a pillar point to {lair}." },
    { objective: "Shelter from a storm in a roadside inn, and find {name}'s people already there", map: "tavern", foes: "minions", checks: [["ins", "skill", "pick out who doesn't belong"]], leadsTo: "Their leader's purse holds a key to {lair}." },
    { objective: "Rescue the courier {name}'s people have run down in the woods", map: "clearing", foes: "minions", checks: [["sur", "skill", "find the courier before they do"]], leadsTo: "The courier's message was a warning about {lair}." },
    { objective: "Win safe passage through a toll the locals have set up in {region}", map: "road", checks: [["per", "skill", "bargain your way through"], ["dec", "skill", "talk your way through"]], leadsTo: "The toll-keepers know exactly where {name} hides." },
  ],
  delve: [
    { objective: "Get inside {lair} and find where {macguffin} is kept", map: "dungeon", foes: "minions", checks: [["dex", "save", "survive the trap at the threshold"], ["ath", "skill", "force the stuck gate"]], leadsTo: "Whoever holds {macguffin} has taken it deeper in, to {name}." },
    { objective: "Fight through the outer halls of {lair}", map: "cave", foes: "minions", checks: [["sur", "skill", "find the way through the dark passages"]], leadsTo: "The inner sanctum lies beyond, and {name} knows they're coming." },
    { objective: "Find a back way into {lair} before the front gate's guards change", map: "cave", foes: "minions", checks: [["inv", "skill", "find the hidden entrance"], ["ath", "skill", "climb the sheer approach"]], leadsTo: "The back way comes out right beneath {name}'s rooms." },
    { objective: "Free the prisoners held in {lair}", map: "dungeon", foes: "minions", checks: [["slt", "skill", "pick the cell locks quietly"]], leadsTo: "One prisoner knows {name}'s weakness." },
    { objective: "Steal the plans from {name}'s war room in {lair}", map: "dungeon", foes: "minions", checks: [["ste", "skill", "slip past the patrols"], ["inv", "skill", "find the plans among the clutter"]], leadsTo: "The plans show where and when {name} will strike next." },
  ],
  showdown: [
    { objective: "Confront {name} and take back {macguffin}", foes: "boss", template: "leader", checks: [["wis", "save", "hold firm against {name}'s last trick"]], leadsTo: "{twist}" },
    { objective: "Stop {name} at the moment of triumph", foes: "boss", template: "leader", checks: [["ath", "skill", "reach {name} before it's too late"]], leadsTo: "{twist}" },
    { objective: "Chase {name} down as they flee with {macguffin}", map: "road", foes: "boss", template: "elite", checks: [["ath", "skill", "keep pace in the chase"]], leadsTo: "{twist}" },
  ],
};

// --- Premade quest types -------------------------------------------------------

export const QUEST_ARCHETYPES: Archetype[] = [
  {
    id: "bandits", label: "Bandit hideout", tone: "heroic",
    tags: ["humanoid+bandit", "humanoid+criminal", "humanoid"], bossTags: ["humanoid+bandit+leader", "humanoid+leader", "humanoid"],
    villains: ["{name}, leader of the {gang}", "{name}, a bandit queen with a code of her own", "{name}, a deserter turned highway robber"],
    names: ["Red Mara", "Old Knuckles", "Vex Hollowhand", "Sable Jory", "the Duke of Ditches", "Wren Ashby"],
    macguffins: ["the tax wagon's strongbox", "the baron's kidnapped daughter", "a crate of alchemist's fire", "the mayor's signet ring", "the village's winter grain"],
    lairs: ["an old quarry", "a ruined watchtower", "a cave behind a waterfall", "a burned-out mill"],
    sigils: ["a red handprint", "a crow feather bound in black thread", "a coin bent double"],
    patrons: ["a merchant who lost everything on the road", "the overworked village constable", "the baron's steward"],
    goals: ["recover {macguffin} from {name}'s gang", "put an end to the raids on the roads through {region}"],
    twists: ["the bandits are robbing a corrupt baron to feed the village", "{name} is the patron's estranged sibling", "the constable takes a cut of every robbery"],
    missions: {
      lead: [{ objective: "Question the merchant who survived the last robbery", npc: "merchant", checks: [["ins", "skill", "tell what the merchant isn't saying"]], leadsTo: "The merchant remembers {sigil} on the attackers' cloaks." }],
      journey: [{ objective: "Bait the road with a fake wagon and wait for {name}'s riders", map: "road", foes: "minions", template: "squad", checks: [["dec", "skill", "sell the wagon as a rich target"], ["prc", "skill", "see them coming"]], leadsTo: "A captured rider can be made to talk about {lair}." }],
      delve: [{ objective: "Raid the gang's hideout in {lair}", map: "cave", foes: "minions", checks: [["ste", "skill", "take the lookouts quietly"]], leadsTo: "{name} isn't here, but the ledger says where they sleep tonight." }],
      showdown: [{ objective: "Take down {name} at the gang's camp", map: "camp", foes: "boss", template: "leader", checks: [["per", "skill", "talk the gang into abandoning their leader"]], leadsTo: "{twist}" }],
    },
  },
  {
    id: "dragon", label: "Dragon hunt", tone: "heroic",
    tags: ["kobold", "humanoid+lizardfolk", "dragon"], bossTags: ["dragon"],
    villains: ["{name}, a {color} dragon", "{name}, a {color} dragon grown fat on the valley's herds"],
    names: ["Vorthax", "Ilsyr the Pale", "Kethendrael", "Smolderjaw", "Auraxis", "Sythara"],
    macguffins: ["the dragon's stolen egg", "the town's tribute", "a dragon-scale shield", "the drowned king's crown"],
    lairs: ["a volcanic caldera", "the abandoned dwarf hold", "a sea cave", "an iced-over mountain peak"],
    sigils: ["a scorched claw mark", "a shed scale the size of a shield", "a kobold war-banner"],
    patrons: ["a village elder with burn scars", "a dragonslayer too old to finish the job", "a sage who has studied the beast for years"],
    goals: ["drive {name} out of {region} for good", "take back {macguffin} before {name} returns"],
    twists: ["{name} is guarding the last egg of her kind", "the patron wants the hoard, not the town's safety", "another, older dragon is the real threat"],
    missions: {
      lead: [{ objective: "Learn {name}'s weakness from the sage who studied it", npc: "scholar", checks: [["arc", "skill", "work out the dragon's breath and its weakness"], ["his", "skill", "recall the last time it came down from the mountains"]], leadsTo: "The sage traces the kobolds' supply line to {lair}." }],
      journey: [{ objective: "Cross the dragon's hunting grounds in {region}, past {name}'s kobold scouts", map: "ruins", foes: "minions", checks: [["sur", "skill", "find a way through country the dragon has picked clean"]], leadsTo: "The kobolds carry tribute toward {lair}." }],
      delve: [{ objective: "Fight through the kobold warrens beneath {lair}", map: "cave", foes: "minions", template: "horde", checks: [["dex", "save", "dodge the kobolds' falling-rock trap"]], leadsTo: "Something vast breathes in the dark below: {name} is waiting." }],
      showdown: [{ objective: "Face {name} in the heart of {lair}", map: "cave", foes: "boss", template: "solo", checks: [["wis", "save", "stand firm against {name}'s frightful presence"]], leadsTo: "{twist}" }],
    },
  },
  {
    id: "undead", label: "Necromancer's tomb", tone: "horror",
    tags: ["undead"], bossTags: ["undead+caster", "undead+leader", "humanoid+caster", "undead"],
    villains: ["{name}, a necromancer", "{name}, a priest who stopped believing in death"],
    names: ["Vessaline Morrow", "the Grey Abbot", "Ilvar Bonewright", "Mother Ashgrave", "Corvin Hale"],
    macguffins: ["the Book of Quiet Hours", "the bones of the town's founder", "a soul gem", "the bell from the old chapel"],
    lairs: ["the catacombs below the chapel", "a barrow on the moor", "a sunken crypt", "a plague house sealed for a century"],
    sigils: ["a black candle", "a bone wind-chime", "a grave-dirt sigil"],
    patrons: ["a gravedigger who hasn't slept in a week", "the village priest", "a widow whose husband came home"],
    goals: ["stop the dead rising from the {region} graveyards", "recover {macguffin} before {name} finishes the ritual"],
    twists: ["{name} is trying to raise a lost child", "the patron sold {name} the bodies", "the dead are rising to warn of something worse"],
    missions: {
      lead: [{ objective: "Find out who's been opening the graves", npc: "priest", checks: [["inv", "skill", "read the disturbed graves"], ["rel", "skill", "recognize the rites used"]], leadsTo: "The grave-dirt is the black clay found only near {lair}." }],
      journey: [{ objective: "Cross the old cemetery after dark", map: "ruins", foes: "minions", checks: [["wis", "save", "keep your nerve as the dead rise"]], leadsTo: "The walking dead all shamble the same way: toward {lair}." }],
      delve: [{ objective: "Descend into {lair}", map: "dungeon", foes: "minions", checks: [["con", "save", "resist the grave-rot in the air"]], leadsTo: "Chanting echoes from below: {name} has begun." }],
      showdown: [{ objective: "Stop {name}'s ritual before it completes", map: "dungeon", foes: "boss", template: "leader", checks: [["arc", "skill", "disrupt the ritual circle"]], leadsTo: "{twist}" }],
    },
  },
  {
    id: "cult", label: "Cult ritual", tone: "intrigue",
    tags: ["cult", "humanoid+cult", "fiend"], bossTags: ["cult+leader", "humanoid+caster", "fiend"],
    villains: ["{name} of the {order}", "{name}, the {order}'s speaker"],
    names: ["the Hollow Prophet", "Sister Ilse", "the Masked Speaker", "Brother Fen", "Mother Vey"],
    macguffins: ["a kidnapped acolyte", "the star-metal idol", "the city's water supply", "the true name of a sleeping god"],
    lairs: ["a temple beneath the harbor", "the abandoned observatory", "a merchant's wine cellar", "a chapel the maps forgot"],
    sigils: ["a circle of seven candles", "a coiled-serpent brand", "a painted eye"],
    patrons: ["a frightened acolyte who escaped", "a guard captain who trusts no one", "a scholar of forbidden faiths"],
    goals: ["find {macguffin} before the {order}'s ritual", "unmask the {order}'s hand in {region}'s council"],
    twists: ["the patron is a cultist trying to stop a rival sect", "the god is real, and listening", "half the city watch wears the mark"],
    missions: {
      lead: [{ objective: "Follow the escaped acolyte's story to the cult's recruiter", npc: "criminal", checks: [["ins", "skill", "spot the recruiter in the crowd"], ["dec", "skill", "pass as a willing convert"]], leadsTo: "The recruiter's tattoo is {sigil}; the next meeting is in {lair}." }],
      journey: [{ objective: "Shadow the cult's procession through {region}", map: "ruins", foes: "minions", checks: [["ste", "skill", "follow without being seen"]], leadsTo: "The procession disappears into {lair}." }],
      delve: [{ objective: "Infiltrate {lair} during the gathering", map: "dungeon", foes: "minions", checks: [["dec", "skill", "keep the disguise"], ["inv", "skill", "find the hidden stair"]], leadsTo: "The ritual chamber lies below, and {name} is presiding." }],
      showdown: [{ objective: "Break up the ritual and stop {name}", map: "dungeon", foes: "boss", template: "leader", checks: [["wis", "save", "resist the chanting"]], leadsTo: "{twist}" }],
    },
  },
  {
    id: "beast", label: "Monster hunt", tone: "heroic",
    tags: ["beast", "monstrosity"], bossTags: ["monstrosity+solo", "monstrosity", "beast"],
    villains: ["{name}, a {beast} grown huge and cunning", "{name}, a {beast} that hunts people now"],
    names: ["Old Scratch", "the Widowmaker", "Gnasher", "the Grey Terror", "Red Ruin"],
    macguffins: ["the missing hunters", "the bounty the baron posted", "the beast's den full of bones and baubles"],
    lairs: ["a den in the deep woods", "a gorge littered with bones", "a hollow under a dead oak", "the old bear caves"],
    sigils: ["claw marks higher than a man can reach", "a tuft of bloodied fur", "a gnawed bone"],
    patrons: ["a hunter with a bandaged arm", "a shepherd whose flock is gone", "the baron, offering a bounty"],
    goals: ["kill {name} before it takes another child", "find out what happened to {macguffin}"],
    twists: ["{name} is defending its young", "someone has been feeding it on purpose", "there are two of them"],
    missions: {
      lead: [{ objective: "Talk to the hunter who survived {name}", npc: "commoner", checks: [["nat", "skill", "work out what kind of creature it is"], ["med", "skill", "read the wounds"]], leadsTo: "The hunter marks the last sighting deep in {region}." }],
      journey: [{ objective: "Track {name} through {region}", map: "clearing", foes: "minions", checks: [["sur", "skill", "follow the trail"]], leadsTo: "The trail ends at {lair}." }],
      delve: [
        { objective: "Clear the creatures that have moved in around {lair}, following {name}'s kills", map: "cave", foes: "minions", checks: [["ste", "skill", "get close without waking them"]], leadsTo: "Something huge stirs deeper in." },
        { objective: "Set a trap for {name} with bait near {lair}, and deal with what comes first", map: "clearing", foes: "minions", checks: [["sur", "skill", "build a trap that will hold"]], leadsTo: "The scavengers scatter; {name} is coming." },
      ],
      showdown: [{ objective: "Bring down {name}", map: "cave", foes: "boss", template: "solo", checks: [["str", "save", "break free when it pins you"]], leadsTo: "{twist}" }],
    },
  },
  {
    id: "goblins", label: "Goblin warren", tone: "heroic",
    tags: ["goblinoid"], bossTags: ["goblinoid+leader", "goblinoid"],
    villains: ["{name}, the self-crowned goblin king", "{name}, a hobgoblin warlord with big plans"],
    names: ["King Gutbrand", "the Snaggle Queen", "Boss Kreek", "Warlord Haz'ruk"],
    macguffins: ["the miller's children", "the dwarven forge-hammer", "the village's only cow (it matters)", "a wagon of iron ingots"],
    lairs: ["a warren under the old hill", "the flooded mine", "a ruined keep crawling with goblins"],
    sigils: ["a wolf-skull banner", "a bent iron crown", "mud-daubed goblin glyphs"],
    patrons: ["a furious dwarf smith", "the miller, sick with worry", "a halfling sheriff out of her depth"],
    goals: ["rescue {macguffin} from {name}", "stop {name}'s raids before winter"],
    twists: ["the goblins were driven out of their home by something worse", "{name} has a captive wizard building weapons", "the goblins want to negotiate"],
    missions: {},
  },
  {
    id: "lycan", label: "Werewolf curse", tone: "horror",
    tags: ["lycanthrope", "beast"], bossTags: ["lycanthrope"],
    villains: ["{name}, alpha of a cursed pack", "{name}, who spreads the curse on purpose"],
    names: ["Greymane", "Lady Ysolde", "Old Wick", "the Hound of Marrow Lane"],
    macguffins: ["a bitten child", "the silver bells of the chapel", "the cure, if it exists"],
    lairs: ["a hunting lodge in the woods", "the old mill by the river", "a ring of standing stones"],
    sigils: ["a carved wolf's head", "a door stripped of its silver", "a muddy paw print"],
    patrons: ["a parent whose child was bitten", "a silversmith who knows too much", "the reeve, hiding a bite of his own"],
    goals: ["find {name} before the full moon", "save {macguffin} before the curse takes hold"],
    twists: ["the patron is already infected", "{name} wants to be cured", "the curse came from a druid's revenge"],
    missions: {},
  },
  {
    id: "smugglers", label: "Smugglers' cove", tone: "intrigue",
    tags: ["humanoid+criminal", "humanoid+bandit", "humanoid"], bossTags: ["humanoid+criminal+leader", "humanoid+leader"],
    villains: ["{name}, captain of the {ship}", "{name}, who runs every smuggler on the coast"],
    names: ["Captain Saltgrave", "Mother Brine", "Jasper Quill", "the Eel"],
    macguffins: ["a crate that hums at night", "a smuggled prisoner", "the harbor master's ledgers", "a cargo of dream-dust"],
    lairs: ["a sea cave under the cliffs", "the wreck in the bay", "a warehouse on the black docks"],
    sigils: ["a tattooed eel", "a false customs crest", "a green lantern signal"],
    patrons: ["a harbor master under pressure", "a customs officer nobody trusts", "a fisher who saw too much"],
    goals: ["find out what {name} is bringing ashore", "recover {macguffin} before the next tide"],
    twists: ["the cargo is refugees", "the harbor master is {name}'s partner", "a rival crew is about to raid them too"],
    missions: {},
  },
  {
    id: "fey", label: "Fey bargain", tone: "mystery",
    tags: ["fey"], bossTags: ["hag", "fey+leader", "fey"],
    villains: ["{name}, a hag who keeps old bargains", "{name}, a fey noble bored of mortals"],
    names: ["Granny Nettle", "the Thistle Prince", "Aunt Moss", "Lady Gloaming"],
    macguffins: ["a child swapped for a changeling", "a stolen voice", "the town's memories of a single day", "a promise owed three generations"],
    lairs: ["a ring of mushrooms that's bigger inside", "a cottage that moves at night", "the hollow hill"],
    sigils: ["a ring of toadstools", "a pressed four-leaf clover", "a footprint that ends mid-step"],
    patrons: ["a mother who doesn't recognize her child", "a fiddler missing his voice", "the oldest woman in the village"],
    goals: ["undo {name}'s bargain over {macguffin}", "win back {macguffin} by the fey's rules"],
    twists: ["the patron made the bargain in the first place", "{name} is bound by a stricter master", "breaking the deal frees something worse"],
    missions: {},
  },
  {
    id: "haunt", label: "Haunted manor", tone: "horror",
    tags: ["undead"], bossTags: ["undead+leader", "undead"],
    villains: ["{name}, the manor's restless lord", "the ghost of {name}, who won't leave"],
    names: ["Lord Ashcombe", "Lady Verena Hale", "the Weeping Bride", "Master Crowl"],
    macguffins: ["the deed to the manor", "the heir who went inside", "a will hidden in the walls"],
    lairs: ["Ashcombe Manor", "the old Hale house", "the manor on Crow Hill"],
    sigils: ["a portrait turned to the wall", "a frost handprint", "a funeral lily"],
    patrons: ["the new owner of the manor", "a sibling of the missing heir", "the estate's lawyer"],
    goals: ["lay {name} to rest", "find {macguffin} inside the house"],
    twists: ["{name} was murdered and wants justice", "the patron was the murderer", "the haunting protects the house from something below"],
    missions: {},
  },
  {
    id: "pirates", label: "Pirate raid", tone: "heroic",
    tags: ["humanoid+pirate", "humanoid+bandit", "sahuagin, merfolk", "humanoid"], bossTags: ["humanoid+pirate+leader", "humanoid+bandit+leader", "humanoid+leader"],
    villains: ["{name}, captain of the {ship}", "{name}, the terror of the southern coast"],
    names: ["Captain Ironjaw", "Black Sal", "the Gull King", "Bloody Annalise", "Dandy Pell", "Captain Mournful"],
    macguffins: ["the harbor's bell", "the governor's niece", "a chest of minted gold", "the lighthouse lens", "the only charts of the reef"],
    lairs: ["a ship at anchor in a hidden cove", "a pirate town built on a wreck", "the sea caves under the lighthouse", "an island fort"],
    sigils: ["a black flag with a gull skull", "a tattooed anchor", "a doubloon with a hole through it"],
    patrons: ["the harbor master", "a merchant whose ship was taken", "a navy officer with no ship"],
    goals: ["get {macguffin} back from {name}", "stop {name}'s raids on the {region} coast"],
    twists: ["{name} raids only ships carrying slaves", "the governor hired {name} to start a war", "the crew will mutiny if offered a better captain"],
    missions: {
      journey: [{ objective: "Take a fishing boat out and get aboard one of {name}'s ships", map: "road", foes: "minions", checks: [["ath", "skill", "climb the hull in the swell"]], leadsTo: "The captured logbook names the cove." }],
      showdown: [{ objective: "Duel {name} on the deck of the flagship", map: "road", foes: "boss", template: "leader", checks: [["acr", "skill", "keep your feet on the rolling deck"]], leadsTo: "{twist}" }],
    },
  },
  {
    id: "giants", label: "Giant raid", tone: "heroic",
    tags: ["giant", "humanoid+orc", "beast"], bossTags: ["giant+leader", "giant"],
    villains: ["{name}, a hill giant chief who wants a kingdom", "{name}, a frost giant raider", "{name}, an ogre warlord with giant allies"],
    names: ["Grumbar Thunderfoot", "Old Mother Skarn", "Hrothgar the Hungry", "Kul the Unmoving", "Thrymma"],
    macguffins: ["the town's grain stores", "the dwarven runestone", "the king's prize bull", "the bell from the abbey"],
    lairs: ["a giant's steading in the hills", "a ruined giant fortress", "a glacier cave", "a crude fort of felled trees"],
    sigils: ["footprints the size of wagons", "boulders hurled through walls", "a skull-and-antler totem"],
    patrons: ["a farmer whose barn was flattened", "the mayor, desperate", "a dwarf with a grudge against giants"],
    goals: ["stop {name}'s raids before winter", "recover {macguffin} from {name}'s steading"],
    twists: ["{name} is fleeing something even bigger", "the giants were promised the land by a forged treaty", "{name}'s young are prisoners in the town"],
    missions: {
      journey: [{ objective: "Track the raiders' path of destruction into the hills", map: "ruins", foes: "minions", checks: [["sur", "skill", "follow the trail of smashed fences"]], leadsTo: "The trail ends at {lair}." }],
      delve: [{ objective: "Sneak into {lair} while the giants feast", map: "cave", foes: "minions", checks: [["ste", "skill", "creep between the sleeping giants"]], leadsTo: "{name} sits on a throne of logs in the great hall." }],
    },
  },
  {
    id: "orcs", label: "Orc warband", tone: "heroic",
    tags: ["orc", "humanoid+orc", "goblinoid", "beast"], bossTags: ["orc+leader", "humanoid+leader", "orc"],
    villains: ["{name}, warchief of the {tribe}", "{name}, an orc shaman who sees visions of war"],
    names: ["Grom Splitjaw", "Ulka Bloodmane", "Karg the Unbroken", "Mother Rakka"],
    macguffins: ["the border fort's banner", "a chieftain's stolen bride", "the spear of the old war", "the pass itself"],
    lairs: ["a war camp in the badlands", "a captured border fort", "a sacred cave of the tribe"],
    sigils: ["a red hand on the rocks", "a broken spear planted at crossroads", "drums at night"],
    patrons: ["the fort's last surviving officer", "an orc defector", "a ranger who's been watching them"],
    goals: ["break the {tribe} before they reach the valley", "win back {macguffin} from {name}"],
    twists: ["the orcs are running from a famine the lord caused", "{name} will accept a duel of honor instead of war", "a human noble is arming them"],
    missions: {
      lead: [{ objective: "Talk to the orc defector who knows the warband's plans", npc: "soldier", checks: [["ins", "skill", "judge whether the defector is honest"], ["itm", "skill", "earn the defector's respect"]], leadsTo: "The warband gathers at {lair} before the full moon." }],
    },
  },
  {
    id: "aberration", label: "Thing from below", tone: "horror",
    tags: ["aberration", "humanoid+cult", "ooze"], bossTags: ["aberration+solo", "aberration+leader", "aberration"],
    villains: ["{name}, a thing from beyond the stars", "{name}, a mind that dreams people into servants"],
    names: ["the Whispering Deep", "the Unblinking", "the Many-Mouthed", "the Pale Choir"],
    macguffins: ["the miners who went too deep", "the town's dreams", "a meteorite that sings", "the mayor's mind"],
    lairs: ["the mine that broke into something old", "a crater in the woods", "the drowned temple beneath the lake"],
    sigils: ["dreams of an eye opening", "people humming the same tune", "nosebleeds and lost time"],
    patrons: ["a miner who escaped and won't sleep", "a priest whose faith is cracking", "a sage who saw the signs before"],
    goals: ["seal away {name} before it wakes fully", "bring back {macguffin}"],
    twists: ["the patron is already one of its servants", "it was summoned by accident by children", "killing it frees what it was guarding"],
    missions: {
      lead: [{ objective: "Interview the sleepless survivors without catching what they have", npc: "commoner", checks: [["wis", "save", "keep the whispers out of your own head"], ["med", "skill", "find what's wrong with them"]], leadsTo: "All of them drew the same map: {lair}." }],
    },
  },
  {
    id: "elemental", label: "Elemental rift", tone: "mystery",
    tags: ["elemental", "fire, water, air, earth", "construct"], bossTags: ["elemental+solo", "elemental+leader", "elemental"],
    villains: ["{name}, a rogue elementalist", "{name}, a cult that worships the raw elements", "{name}, a bound elemental lord breaking free"],
    names: ["Magister Cinderhall", "the Stormborn", "Ylva of the Deep Earth", "the Burning Choir"],
    macguffins: ["the binding stone", "a staff that holds the rift shut", "the elementalist's apprentice", "the weather itself"],
    lairs: ["a tower struck by lightning every night", "a volcano that woke up", "a whirlpool that hasn't stopped in a week", "a quarry where the stone walks"],
    sigils: ["scorched circles on the ground", "rain that falls upward", "stones that float"],
    patrons: ["a terrified apprentice", "farmers whose fields are flooding in a drought", "a wizard's guild in a panic"],
    goals: ["close the rift at {lair}", "take back {macguffin} before the rift tears wider"],
    twists: ["the rift is the only thing keeping a worse plane out", "{name} is trying to close it, not open it", "the patron opened it"],
    missions: {
      delve: [{ objective: "Climb into {lair} as the elements run wild", map: "cave", foes: "minions", checks: [["con", "save", "endure the raging elements"], ["arc", "skill", "read the patterns of the rift"]], leadsTo: "At the heart, {name} holds the rift open." }],
    },
  },
  {
    id: "construct", label: "Rogue construct", tone: "mystery",
    tags: ["construct", "golem", "humanoid+mage"], bossTags: ["golem", "construct+solo", "construct"],
    villains: ["{name}, a golem whose maker is long dead", "{name}, a clockwork mind that wants to improve people", "{name}, an artificer who lost control of their creations"],
    names: ["Unit Seven", "the Iron Abbot", "Master Gearwright", "the Brass Shepherd"],
    macguffins: ["the control rod", "the artificer's daughter", "the town's iron", "a heart of living crystal"],
    lairs: ["an abandoned dwarven forge", "a clocktower workshop", "a sealed vault under the mint"],
    sigils: ["iron missing from every house", "ticking in the walls at night", "oil-stained footprints"],
    patrons: ["a blacksmith whose anvil was stolen", "the artificer's guild", "the clockmaker's apprentice"],
    goals: ["shut down {name} for good", "find {macguffin} before {name} uses it"],
    twists: ["{name} is protecting the town from its creator", "it only wants to be told it's alive", "the patron is a construct and doesn't know it"],
    missions: {},
  },
  {
    id: "demons", label: "Demonic incursion", tone: "horror",
    tags: ["demon", "fiend", "cult"], bossTags: ["demon+leader", "fiend+solo", "fiend"],
    villains: ["{name}, a demon summoned by fools", "{name}, a cult leader with a demon's voice in their head"],
    names: ["Ul'zharek", "the Smiling Hunger", "Sister Vesh", "the Pit-Prince"],
    macguffins: ["the summoning circle's keystone", "a child marked by the demon", "the abbey's holy relic", "a name the demon must never learn"],
    lairs: ["a ruined abbey", "a cellar that smells of brimstone", "a ring of black stones on the moor"],
    sigils: ["milk turning to blood", "animals fleeing town", "a burned handprint on doors"],
    patrons: ["a priest who lost a duel of faith", "a frightened summoner who regrets everything", "the abbess"],
    goals: ["banish {name} before the new moon", "keep {macguffin} out of {name}'s hands"],
    twists: ["the demon was summoned to stop something worse", "the patron is bound to the demon by contract", "banishing it requires a willing sacrifice"],
    missions: {},
  },
  {
    id: "underdark", label: "Underdark expedition", tone: "exploration",
    tags: ["underdark", "drow", "aberration", "ooze"], bossTags: ["drow+leader", "aberration+leader", "underdark"],
    villains: ["{name}, a drow matron with ambitions on the surface", "{name}, a mind flayer colony's elder", "{name}, a duergar slaver"],
    names: ["Matron Ilvara", "Velkyn Xorlarrin", "the Elder Brain", "Gorvak Ironhand"],
    macguffins: ["the surface folk taken below", "a map of the deep roads", "a crystal that lights the dark", "the dwarven king's lost heir"],
    lairs: ["a drow outpost in a vast cavern", "a duergar slave mine", "a fungus forest around a sunless lake"],
    sigils: ["a spider sigil scratched in chalk", "people vanishing near the mines", "tunnels that weren't there yesterday"],
    patrons: ["a dwarf miner who broke through into the dark", "a drow exile", "a deep gnome scout"],
    goals: ["bring back {macguffin} from the dark below", "stop {name}'s raids up the old mine shafts"],
    twists: ["the drow exile is a spy", "the captives don't want to come back", "{name} is at war with something worse down there"],
    missions: {
      journey: [{ objective: "Descend the old mine shaft into the dark", map: "cave", foes: "minions", checks: [["sur", "skill", "keep your bearings underground"], ["con", "save", "breathe the bad air"]], leadsTo: "Glowing fungus lights the way toward {lair}." }],
    },
  },
];

// --- Keywords ------------------------------------------------------------------------

const COLORS = ["red", "blue", "green", "black", "white", "silver", "gold", "brass", "bronze", "copper"];
/** Where each dragon makes its home. */
const DRAGON_LAIRS: Record<string, string> = {
  red: "a volcanic caldera", gold: "a sunlit cliffside ruin", brass: "desert ruins half-buried in sand", blue: "a canyon of glassy sand",
  bronze: "a sea cave under the cliffs", green: "a rotting forest hollow", black: "a drowned temple in the swamp", white: "an ice cave on a frozen peak",
  silver: "an iced-over mountain peak", copper: "the abandoned dwarf hold",
};

interface Motif {
  match: RegExp;
  /** Builds the villain's creature and tags from the keyword's words. */
  build: (words: string[]) => { creature: string; tags: string[]; bossTags: string[]; archetype: string; color?: string };
}

const MOTIFS: Motif[] = [
  // Named factions first, so "a bandit queen" is about bandits, not courts.
  { match: /\b(goblin|hobgoblin|bugbear)s?\b/, build: () => ({ creature: "a goblin warlord", archetype: "goblins", tags: ["goblinoid"], bossTags: ["goblinoid+leader", "goblinoid"] }) },
  { match: /\b(bandit|outlaw|highway|thief|thieves|rogue)s?\b/, build: () => ({ creature: "an outlaw captain", archetype: "bandits", tags: ["humanoid+bandit", "humanoid"], bossTags: ["humanoid+bandit+leader", "humanoid+leader"] }) },
  {
    match: /\b(serpent|snake|viper|naga|wyrm|dragon|drake|coil|scale)s?\b/,
    build: (w) => {
      const color = COLORS.find((c) => w.includes(c));
      if (color || w.some((x) => /wyrm|dragon|drake/.test(x))) {
        return { creature: `a ${color ?? "great"} dragon`, color, archetype: "dragon", tags: ["kobold", "humanoid+lizardfolk", "dragon"], bossTags: [...(color ? [`dragon+${color}`] : []), "dragon", "snake, naga"] };
      }
      return { creature: "a monstrous serpent", archetype: "beast", tags: ["snake, naga", "beast"], bossTags: ["naga", "snake", "monstrosity"] };
    },
  },
  { match: /\b(wolf|wolves|hound|moon|howl|fang|pack)\b/, build: () => ({ creature: "a werewolf", archetype: "lycan", tags: ["lycanthrope", "wolf", "beast"], bossTags: ["lycanthrope", "wolf"] }) },
  { match: /\b(bone|skull|grave|tomb|crypt|death|lich|ghost|wraith|shade|dead|corpse)s?\b/, build: () => ({ creature: "a necromancer", archetype: "undead", tags: ["undead"], bossTags: ["undead+caster", "undead+leader", "undead"] }) },
  { match: /\b(spider|web|silk|weaver)s?\b/, build: () => ({ creature: "a spider-queen", archetype: "beast", tags: ["spider", "beast"], bossTags: ["spider", "monstrosity"] }) },
  { match: /\b(pirate|corsair|gull|anchor|ship|captain|flag|cutlass|plunder)s?\b/, build: () => ({ creature: "a pirate captain", archetype: "pirates", tags: ["humanoid+pirate", "humanoid+bandit", "humanoid"], bossTags: ["humanoid+pirate+leader", "humanoid+leader"] }) },
  { match: /\b(sea|tide|drowned|reef|salt|wave)s?\b/, build: () => ({ creature: "a power from beneath the waves", archetype: "smugglers", tags: ["sahuagin, merfolk", "coast"], bossTags: ["sahuagin+leader", "coast"] }) },
  { match: /\b(giant|ogre|troll|titan|boulder)s?\b/, build: () => ({ creature: "a giant raider", archetype: "giants", tags: ["giant", "humanoid+orc"], bossTags: ["giant+leader", "giant"] }) },
  { match: /\b(orc|warband|tusk|warchief)s?\b/, build: () => ({ creature: "an orc warchief", archetype: "orcs", tags: ["orc", "humanoid+orc"], bossTags: ["orc+leader", "orc"] }) },
  { match: /\b(eye|tentacle|void|star|dream|madness|whisper)s?\b/, build: () => ({ creature: "a thing from beyond", archetype: "aberration", tags: ["aberration", "humanoid+cult"], bossTags: ["aberration+solo", "aberration"] }) },
  { match: /\b(storm|thunder|lightning|tempest|quake|magma|rift)s?\b/, build: () => ({ creature: "an elemental power", archetype: "elemental", tags: ["elemental"], bossTags: ["elemental+solo", "elemental"] }) },
  { match: /\b(iron|clock|gear|golem|brass|cog|engine)s?\b/, build: () => ({ creature: "a rogue construct", archetype: "construct", tags: ["construct", "golem"], bossTags: ["golem", "construct"] }) },
  { match: /\b(demon|abyss|pit|hell|brimstone|infernal)s?\b/, build: () => ({ creature: "a demon", archetype: "demons", tags: ["demon", "fiend", "cult"], bossTags: ["demon+leader", "fiend"] }) },
  { match: /\b(underdark|drow|deep|dark|mine)s?\b/, build: () => ({ creature: "a power of the deep dark", archetype: "underdark", tags: ["underdark", "drow", "aberration"], bossTags: ["drow+leader", "underdark"] }) },
  { match: /\b(flame|fire|ember|ash|cinder|burning|blaze|sun)s?\b/, build: () => ({ creature: "a fire-touched cult leader", archetype: "cult", tags: ["fire", "cult"], bossTags: ["fire", "cult+leader", "elemental"] }) },
  { match: /\b(frost|ice|winter|snow|frozen|rime)\b/, build: () => ({ creature: "a creature of the deep winter", archetype: "beast", tags: ["ice, frost, winter", "arctic"], bossTags: ["frost, ice, winter", "arctic"] }) },
  { match: /\b(crown|throne|king|queen|court|mask|whisper|coin|ledger|knife|rose)s?\b/, build: () => ({ creature: "a schemer in fine clothes", archetype: "cult", tags: ["humanoid+criminal", "cult", "humanoid"], bossTags: ["humanoid+leader", "humanoid"] }) },
  { match: /\b(blood|vampire|night|crimson)s?\b/, build: () => ({ creature: "a vampire", archetype: "undead", tags: ["undead", "cult"], bossTags: ["vampire", "undead+leader", "undead"] }) },
  { match: /\b(thorn|root|briar|green|wood|bramble|fey|glade)s?\b/, build: () => ({ creature: "a fey with a grudge", archetype: "fey", tags: ["fey", "plant"], bossTags: ["hag", "fey"] }) },
];

/** What a keyword means for the quest: villain creature, monster tags and the closest quest type. */
export function keywordTheme(keyword: string): { creature: string; tags: string[]; bossTags: string[]; archetype: string; color?: string } {
  const words = keyword.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const motif = MOTIFS.find((m) => m.match.test(words.join(" ")));
  if (motif) return motif.build(words);
  // Unknown words are tried as monster names ("manticore", "owlbear"), then any monster.
  const nameTags = words.filter((w) => w.length >= 4 && !["the", "of"].includes(w));
  return { creature: `a creature called ${keyword}`, archetype: "beast", tags: [...nameTags, "monstrosity", "beast"], bossTags: [...nameTags, "monstrosity+solo", "monstrosity"] };
}

// --- Generation ---------------------------------------------------------------------------

const REGIONS = ["the Ashfen", "the Greywold", "the Saltmarsh coast", "the Hollow Hills", "the Brightwater valley", "the Thornwood", "the Iron Downs", "the Mirefields"];
const GANGS = ["Crow Knives", "Gallows Boys", "Ditch Wolves", "Red Hands"];
const ORDERS = ["Drowned Choir", "Ninth Candle", "Ashen Eye", "Coiled Path"];
const SHIPS = ["Black Gull", "Widow's Wake", "Lucky Mistake", "Salt Saint", "Iron Maiden"];
const TRIBES = ["Bloody Tusk", "Broken Spear", "Red Moon", "Ash Wolf"];
const BEASTS = ["owlbear", "manticore", "wyvern", "giant spider", "chimera", "bulette"];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const DIFFS: Difficulty[] = ["low", "moderate", "high", "deadly"];
const shiftDifficulty = (d: Difficulty, by: number): Difficulty => DIFFS[Math.max(0, Math.min(3, DIFFS.indexOf(d) + by))]!;
const titleCase = (s: string) => s.split(" ").map((w) => (/^(of|the|and)$/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ").replace(/^./, (c) => c.toUpperCase());
const dcFor = (level: number, hard = false) => Math.min(25, 10 + Math.floor(level / 3) + (hard ? 4 : 1));
const randomId = (rng: Rng) => Math.floor(rng.next() * 36 ** 6).toString(36).padStart(6, "0");

interface Threads {
  name: string;
  villain: string;
  macguffin: string;
  lair: string;
  sigil: string;
  region: string;
  twist: string;
}

const fill = (text: string, t: Threads) =>
  text.replace(/\{name\}/g, t.name).replace(/\{villain\}/g, t.villain).replace(/\{macguffin\}/g, t.macguffin)
    .replace(/\{lair\}/g, t.lair).replace(/\{sigil\}/g, t.sigil).replace(/\{region\}/g, t.region).replace(/\{twist\}/g, `Afterward, the truth comes out: ${t.twist.replace(/\.$/, "")}.`);

function buildMission(rng: Rng, kind: MissionKind, a: Archetype, q: { threads: Threads; tags: string[]; bossTags: string[]; level: number; rewardGp: number; shift?: number }): Mission {
  const own = a.missions[kind] ?? [];
  // Prefer the quest type's own steps; the shared ones add variety and rerolls.
  const spec = own.length && rng.chance(0.75) ? rng.pick(own) : rng.pick([...own, ...GENERIC[kind]]);
  const t = q.threads;
  const id = randomId(rng);
  const m: Mission = {
    id,
    kind,
    title: "",
    objective: capitalize(fill(spec.objective, t)),
    location: spec.location ? fill(spec.location, t) : kind === "lead" ? rng.pick(["the market square", "a dockside tavern", "the temple steps", "a farmhouse outside town", "the town jail"]) : kind === "journey" ? `on the way through ${t.region}` : t.lair,
    leadsTo: capitalize(fill(spec.leadsTo, t)),
    checks: spec.checks.map(([key, type, why]) => ({ key, type, dc: dcFor(q.level, kind === "showdown"), why: fill(why, t) })),
    rewardGp: kind === "showdown" ? q.rewardGp : Math.round(q.rewardGp / 4 / 10) * 10,
  };
  if (spec.npc) m.npc = generateNpc({ role: spec.npc, seed: `${id}:npc` });
  const mapKind = spec.map ?? (kind === "delve" ? rng.pick(["dungeon", "cave"] as const) : kind === "showdown" ? rng.pick(["dungeon", "cave"] as const) : undefined);
  if (mapKind) m.map = mapKind === "dungeon" || mapKind === "cave" ? { type: mapKind, seed: randomId(rng) } : { type: "battlemap", seed: randomId(rng), setting: mapKind };
  if (spec.foes) {
    m.encounter = {
      tags: spec.foes === "boss" ? q.bossTags : q.tags,
      difficulty: shiftDifficulty(spec.foes === "boss" ? rng.pick(["high", "deadly"] as const) : kind === "journey" ? rng.pick(["low", "moderate"] as const) : "moderate", q.shift ?? 0),
      template: spec.template,
      seed: randomId(rng),
    };
  }
  if (kind === "delve" || kind === "showdown") m.hoard = { seed: randomId(rng), cr: q.level + (kind === "showdown" ? 2 : 0) };
  const gist = m.objective.split(/,| and (?=[a-z])/)[0]!;
  const label = { lead: "The lead", journey: "The road", delve: "The delve", showdown: "The showdown" }[kind];
  m.title = `${label}: ${gist.charAt(0).toLowerCase()}${gist.slice(1)}`;
  return m;
}

/** Which mission kinds make up a quest of a given length. The showdown is always last. */
function shape(rng: Rng, length: number): MissionKind[] {
  const n = Math.max(2, Math.min(5, length));
  if (n === 2) return [rng.pick(["lead", "journey", "delve"] as const), "showdown"];
  if (n === 3) return [rng.pick(["lead", "journey"] as const), "delve", "showdown"];
  if (n === 4) return ["lead", "journey", "delve", "showdown"];
  return ["lead", "journey", rng.pick(["lead", "journey"] as const), "delve", "showdown"];
}

export function generateSideQuest(opts: SideQuestOptions = {}): SideQuest {
  const keyword = opts.keyword?.trim() ?? "";
  const mode: QuestMode = opts.mode ?? (keyword ? "keyword" : opts.archetype ? "premade" : "random");
  // A keyword is its own seed, so "silver serpent" always gives the same quest.
  const rng = createRng(opts.seed ?? (mode === "keyword" && keyword ? keyword.toLowerCase() : undefined));
  const partyLevel = Math.max(1, Math.min(20, opts.partyLevel ?? 3));

  let archetype: Archetype;
  let tags: string[];
  let bossTags: string[];
  let name: string;
  let villain: string;
  let dragonColor: string | undefined;
  if (mode === "keyword" && keyword) {
    const theme = keywordTheme(keyword);
    dragonColor = theme.color;
    archetype = QUEST_ARCHETYPES.find((a) => a.id === theme.archetype) ?? QUEST_ARCHETYPES[0]!;
    tags = theme.tags;
    bossTags = theme.bossTags;
    name = `the ${titleCase(keyword.replace(/^the\s+/i, ""))}`;
    villain = `${name}, ${theme.creature}`;
  } else {
    archetype = (mode === "premade" && QUEST_ARCHETYPES.find((a) => a.id === opts.archetype)) || rng.pick(QUEST_ARCHETYPES);
    tags = archetype.tags;
    bossTags = archetype.bossTags;
    name = rng.pick(archetype.names);
    const color = rng.pick(COLORS);
    if (archetype.id === "dragon") {
      bossTags = [`dragon+${color}`, ...bossTags];
      dragonColor = color;
    }
    if (archetype.id === "beast") {
      const beast = rng.pick(BEASTS);
      bossTags = [beast, ...bossTags];
      villain = rng.pick(archetype.villains).replace("{beast}", beast);
    } else villain = rng.pick(archetype.villains);
    villain = villain.replace("{color}", color).replace("{gang}", rng.pick(GANGS)).replace("{order}", rng.pick(ORDERS)).replace("{ship}", rng.pick(SHIPS)).replace("{tribe}", rng.pick(TRIBES));
    villain = villain.replace("{name}", name);
  }
  const region = rng.pick(REGIONS);
  const threads: Threads = {
    name,
    villain,
    macguffin: rng.pick(archetype.macguffins),
    lair: dragonColor ? DRAGON_LAIRS[dragonColor]! : rng.pick(archetype.lairs),
    sigil: rng.pick(archetype.sigils),
    region,
    twist: "",
  };
  // Fill the names into the quest type's text ({gang}, {order}... come from the villain line).
  const order = /of the (.+)$|the (.+)'s speaker/.exec(villain);
  const gang = /leader of the (.+)$/.exec(villain);
  const tribe = /warchief of the (.+)$/.exec(villain);
  const extra = (s: string) => s.replace("{order}", order?.[1] ?? order?.[2] ?? "order").replace("{gang}", gang?.[1] ?? "gang").replace("{tribe}", tribe?.[1] ?? "warband");
  threads.twist = fill(extra(rng.pick(archetype.twists)), threads);

  const tone = opts.tone && opts.tone !== "any" ? opts.tone : archetype.tone;
  const rewardGp = Math.round((partyLevel * partyLevel * 25 + rng.int(0, partyLevel * 50)) / 10) * 10;
  const goal = fill(extra(rng.pick(archetype.goals)), threads);
  const hookParts: Omit<PlotHook, "text" | "seed"> = {
    title: mode === "keyword" && keyword ? titleCase(name) : `${archetype.label}: ${titleCase(name)}`,
    patron: rng.pick(archetype.patrons),
    location: threads.lair,
    goal,
    complication: rng.pick([`${name}'s people have eyes in town`, `the trail runs through ${region}, and winter is coming`, `the patron can only pay half until it's done`, `someone else wants ${threads.macguffin} too`]),
    villain,
    deadline: rng.pick(["before the next full moon", "within three days", "before the snows close the pass", "by the end of the week"]),
    rewardGp,
    bonusReward: rng.pick(["a favor owed by the patron", "first pick of the villain's hoard", "the town's undying gratitude", "a deed to land in " + region]),
    twist: threads.twist,
    tone,
    partyLevel,
  };
  const hook: PlotHook = { ...hookParts, seed: `${rng.seed}:hook`, text: composeHookText(hookParts) };

  // Your own picks come first; the quest type's are the fallback.
  if (opts.foes?.trim()) tags = [opts.foes.trim(), ...tags];
  if (opts.boss?.trim()) bossTags = [opts.boss.trim(), ...bossTags];
  const q = { threads, tags, bossTags, level: partyLevel, rewardGp, shift: opts.difficultyShift ?? 0 };
  const missions = shape(rng, opts.length ?? 3).map((kind) => buildMission(rng, kind, archetype, q));
  return {
    seed: rng.seed, mode, archetype: archetype.id, title: `Side quest: ${hookParts.title}`, hook,
    villainName: name, macguffin: threads.macguffin, lair: threads.lair, sigil: threads.sigil, region,
    tags, bossTags, partyLevel, difficultyShift: opts.difficultyShift ?? 0, missions,
  };
}

/** Replace one mission with a fresh one of the same kind, keeping the quest's threads. */
export function rerollMission(q: SideQuest, id: string, seed: string | number = randomSeed()): SideQuest {
  const rng = createRng(seed);
  const archetype = QUEST_ARCHETYPES.find((a) => a.id === q.archetype) ?? QUEST_ARCHETYPES[0]!;
  const threads: Threads = { name: q.villainName, villain: q.hook.villain, macguffin: q.macguffin, lair: q.lair, sigil: q.sigil, region: q.region, twist: q.hook.twist };
  const ctx = { threads, tags: q.tags, bossTags: q.bossTags, level: q.partyLevel, rewardGp: q.hook.rewardGp, shift: q.difficultyShift ?? 0 };
  return { ...q, missions: q.missions.map((m) => (m.id === id ? buildMission(rng, m.kind, archetype, ctx) : m)) };
}

/** For the UI: premade quest types. */
export const QUEST_TYPES: [id: string, label: string][] = QUEST_ARCHETYPES.map((a) => [a.id, a.label]);

/** Kept for callers that only need a villain's monster tags. */
export function tagsForVillain(villain: string): string {
  return keywordTheme(villain).tags[0] ?? "humanoid";
}
