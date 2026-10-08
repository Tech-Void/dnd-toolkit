import type { Rarity } from "./treasure.ts";

// Tables for the richer treasure: consumables, trade goods, trinkets with a story, everyday gear,
// grave goods, monster parts worth harvesting, and the chests it all comes in.

/** Potions and oils by rarity: [name (SRD, so it matches compendium items), value in gp]. */
export const POTIONS: Record<Rarity, [string, number][]> = {
  common: [["Potion of Healing", 50], ["Potion of Healing", 50], ["Potion of Climbing", 75]],
  uncommon: [
    ["Potion of Greater Healing", 150], ["Potion of Greater Healing", 150], ["Potion of Animal Friendship", 200], ["Potion of Fire Breath", 250],
    ["Potion of Hill Giant Strength", 300], ["Potion of Growth", 250], ["Potion of Resistance", 300], ["Potion of Water Breathing", 180],
    ["Oil of Slipperiness", 400], ["Philter of Love", 250], ["Potion of Poison", 100],
  ],
  rare: [
    ["Potion of Superior Healing", 450], ["Potion of Superior Healing", 450], ["Potion of Clairvoyance", 900], ["Potion of Diminution", 700],
    ["Potion of Gaseous Form", 800], ["Potion of Frost Giant Strength", 1000], ["Potion of Stone Giant Strength", 1000], ["Potion of Fire Giant Strength", 1200],
    ["Potion of Heroism", 750], ["Potion of Invulnerability", 1200], ["Potion of Mind Reading", 900], ["Elixir of Health", 900], ["Oil of Etherealness", 1500],
  ],
  "very rare": [
    ["Potion of Supreme Healing", 1350], ["Potion of Cloud Giant Strength", 4000], ["Potion of Flying", 3500], ["Potion of Invisibility", 3500],
    ["Potion of Longevity", 6000], ["Potion of Speed", 4500], ["Potion of Vitality", 3000], ["Oil of Sharpness", 5000],
  ],
  legendary: [["Potion of Storm Giant Strength", 15000], ["Potion of Supreme Healing", 1350]],
};

/** SRD spells by level, for spell scrolls. */
export const SCROLL_SPELLS: string[][] = [
  ["Fire Bolt", "Light", "Mage Hand", "Guidance", "Sacred Flame", "Ray of Frost", "Shocking Grasp", "Mending", "Thaumaturgy", "Prestidigitation", "Chill Touch", "Minor Illusion"],
  ["Magic Missile", "Cure Wounds", "Shield", "Sleep", "Bless", "Burning Hands", "Detect Magic", "Feather Fall", "Healing Word", "Thunderwave", "Faerie Fire", "Identify", "Charm Person", "Fog Cloud", "Protection from Evil and Good", "Comprehend Languages"],
  ["Misty Step", "Invisibility", "Hold Person", "Scorching Ray", "Lesser Restoration", "Web", "Spiritual Weapon", "Darkvision", "Knock", "Silence", "Shatter", "Spider Climb", "Levitate", "Locate Object"],
  ["Fireball", "Counterspell", "Revivify", "Fly", "Lightning Bolt", "Dispel Magic", "Haste", "Remove Curse", "Water Breathing", "Sending", "Mass Healing Word", "Spirit Guardians", "Clairvoyance", "Tongues"],
  ["Polymorph", "Banishment", "Greater Invisibility", "Dimension Door", "Stoneskin", "Wall of Fire", "Death Ward", "Freedom of Movement", "Ice Storm", "Arcane Eye", "Divination"],
  ["Cone of Cold", "Raise Dead", "Wall of Stone", "Hold Monster", "Teleportation Circle", "Greater Restoration", "Scrying", "Flame Strike", "Mass Cure Wounds", "Legend Lore"],
  ["Chain Lightning", "Disintegrate", "Heal", "True Seeing", "Globe of Invulnerability", "Sunbeam", "Harm", "Find the Path", "Contingency"],
  ["Teleport", "Finger of Death", "Plane Shift", "Regenerate", "Resurrection", "Fire Storm", "Etherealness", "Forcecage"],
  ["Dominate Monster", "Sunburst", "Earthquake", "Power Word Stun", "Mind Blank", "Holy Aura", "Incendiary Cloud"],
  ["Wish", "Meteor Swarm", "Power Word Kill", "True Resurrection", "Time Stop", "Mass Heal", "Foresight"],
];
export const SCROLL_VALUE = [15, 25, 75, 150, 300, 1500, 3000, 8000, 15000, 30000];
export const SCROLL_RARITY: Rarity[] = ["common", "common", "uncommon", "uncommon", "rare", "rare", "very rare", "very rare", "very rare", "legendary"];
/** Spell levels a scroll can have, by tier. */
export const SCROLL_LEVELS: Record<1 | 2 | 3 | 4, number[]> = { 1: [0, 1, 1, 1, 2, 2], 2: [1, 2, 3, 3, 4], 3: [3, 4, 5, 5, 6], 4: [5, 6, 7, 8, 9] };

/** [name, value per unit, quantity dice, min tier, note]. */
export const TRADE_GOODS: [string, number, string, number, string][] = [
  ["Bolt of fine silk", 10, "1d6", 1, "Ten yards to a bolt; a tailor pays full price."],
  ["Pound of saffron", 15, "1d4", 1, "Sealed in waxed paper; it smells like money."],
  ["Pound of pepper", 2, "2d6", 1, "In small cloth bags."],
  ["Pound of cinnamon", 2, "2d6", 1, "Rolled bark in a cedar box."],
  ["Pound of cloves", 3, "1d6", 1, "In a tin with a merchant's seal."],
  ["Silver ingot", 5, "2d6", 1, "One pound each, stamped with a mint mark."],
  ["Copper ingot", 0.5, "3d6", 1, "One pound each, green at the edges."],
  ["Gold ingot", 50, "1d4", 2, "One pound each; heavy for its size."],
  ["Bundle of fox furs", 6, "1d6", 1, "Winter coats, well cured."],
  ["Cask of dwarven brandy", 25, "1d3", 1, "Heavy (40 lb a cask) and very strong."],
  ["Jar of murex purple dye", 20, "1d4", 1, "Royal purple; worth more in a city."],
  ["Bolt of linen", 2, "2d4", 1, "Ten yards to a bolt."],
  ["Crate of glass bottles", 8, "1d4", 1, "Two dozen to a crate, packed in straw. Fragile."],
  ["Ivory tusk", 30, "1d2", 1, "Carved with hunting scenes along its length."],
  ["Sack of salt", 2, "2d4", 1, "Twenty pounds a sack."],
  ["Chest of black tea", 12, "1d3", 1, "From somewhere very far away."],
  ["Amphora of olive oil", 4, "1d6", 1, "Sealed with wax and a potter's stamp."],
  ["Pound of dragon-pepper", 40, "1d4", 2, "Burns the tongue for an hour; the rich love it."],
  ["Bar of mithral", 500, "1", 3, "Light as a feather and worth a fortune to any smith."],
  ["Bar of adamantine", 600, "1", 3, "Black, dense and nearly impossible to work."],
  ["Bolt of spider-silk", 80, "1d4", 2, "Woven by giant spiders; stronger than steel wire."],
  ["Case of fine wine", 30, "1d4", 1, "A dozen bottles of a famous vintage."],
  ["Sealed crate of rare tobacco", 15, "1d3", 1, "Fragrant even through the wood."],
  ["Bundle of ermine pelts", 40, "1d4", 2, "White winter furs fit for a noble's collar."],
];

/** Odd little things with a story attached: [item, hook]. */
export const TRINKETS: [string, string][] = [
  ["A tarnished signet ring with three crows", "The crest belongs to a family everyone thinks died out twenty years ago."],
  ["A child's wooden horse, lovingly repainted", "A name is carved on the base, and a woman in the nearest town has been searching for that child."],
  ["A brass compass that points south", "It points at something, not to the south pole; follow it far enough and you'll find out what."],
  ["Half of a torn map", "The other half is tattooed on someone's back."],
  ["A love letter, never sent", "Addressed to someone who is now very powerful and very married."],
  ["A glass eye that blinks when no one is looking", "It belonged to a wizard who would like it back."],
  ["A pawn ticket from a city shop", "Redeemable for 'one sword, unusual'. It's paid up for another month."],
  ["A wax-sealed vial of seawater", "The seal bears a sea-elf's mark; breaking it calls something."],
  ["A tin soldier missing its head", "The matching head is in a noble's toy box, three towns away, with a secret inside."],
  ["A set of loaded dice", "They're weighted to roll sevens, and they belong to a gambling den's owner."],
  ["A locket with a portrait of a stranger", "The portrait changes to show whoever last held it in their final moments."],
  ["A ledger page of debts", "Every name on it is crossed out except one, and it's someone the party knows."],
  ["A silver whistle no dog will come to", "Something else will."],
  ["An iron key with no lock", "It fits a door that isn't built yet."],
  ["A pressed flower that never wilts", "It only grows on one grave in the world."],
  ["A pipe carved like a laughing dragon", "Smoke from it forms tiny shapes; sometimes words."],
  ["A bag of 31 teeth", "Human, all molars. There's a receipt."],
  ["A wanted poster for a much younger version of someone the party knows", "The reward is still unpaid."],
  ["A small bronze bell engraved with a temple's name", "The temple was destroyed a century ago; the bell still rings at its old service hours."],
  ["A jar of buttons, each from a different uniform", "One belongs to a regiment that officially never existed."],
  ["A deck of cards with one extra card", "The extra card shows the person holding the deck."],
  ["A wooden mask with no eye holes", "Wearing it, you can see perfectly, but only the past."],
  ["A miniature portrait of a cat in noble finery", "The cat is the true heir to a minor barony, and the will says so."],
  ["A coin from a kingdom no one has heard of", "Sages say that kingdom is three hundred years in the future."],
  ["A crude clay figure of an owl", "Children in the next village leave them at a cave they won't talk about."],
  ["A bundle of letters tied with black ribbon", "A spy's correspondence: half of it is in code."],
  ["A shard of mirror wrapped in silk", "It reflects a room that isn't here."],
  ["A thumb-sized ivory chess piece (the black queen)", "The rest of the set is in a dragon's hoard, and the dragon wants it complete."],
  ["A fishhook made of bone", "Anything caught on it tells one truth before it dies."],
  ["A seed in a locked silver case", "Planted, it grows a tree that hasn't been seen since the elves left."],
  ["A torn page from a holy book, heavily annotated", "The notes argue with the god, and the god seems to have answered."],
  ["A bloodstained guild token", "The Lantern Guild pays well, no questions, for its members' tokens."],
  ["A music box that plays a funeral march", "Every bard who hears it swears it's a melody they wrote themselves."],
  ["A lock of red hair tied with gold thread", "A witch would trade a favor for it, and it's best not to ask why."],
  ["A tiny cage with a door that won't open", "Something in it chirps at night."],
  ["A stone with a hole worn through it", "Looking through the hole shows invisible things, for a moment, once a day."],
];

/** Everyday kit people carry: [name, value, min tier]. */
export const GEAR: [string, number, number][] = [
  ["Thieves' Tools", 25, 1], ["Healer's Kit", 5, 1], ["Hooded Lantern", 5, 1], ["Climber's Kit", 25, 1], ["Manacles", 2, 1],
  ["Crowbar", 2, 1], ["Silk Rope (50 feet)", 10, 1], ["Disguise Kit", 25, 1], ["Poisoner's Kit", 50, 1], ["Basic Poison", 100, 1],
  ["Alchemist's Fire", 50, 1], ["Acid", 25, 1], ["Antitoxin", 50, 1], ["Holy Water", 25, 1], ["Caltrops", 1, 1], ["Ball Bearings", 1, 1],
  ["Navigator's Tools", 25, 1], ["Forgery Kit", 15, 1], ["Hunting Trap", 5, 1], ["Magnifying Glass", 100, 2], ["Spyglass", 1000, 2],
  ["Signal Whistle", 1, 1], ["Herbalism Kit", 5, 1], ["Smoke bomb", 25, 1], ["Grappling Hook", 2, 1], ["Tinderbox", 1, 1],
];

/** Things buried with the dead: [name, value, note]. */
export const GRAVE_GOODS: [string, number, string][] = [
  ["Funerary mask of beaten copper", 25, "The face is calm and young. The skull behind it was not."],
  ["Silver-threaded burial shroud", 10, "Bad luck to sell, say the superstitious; good money, says everyone else."],
  ["Jade burial amulet", 75, "Carved with a prayer for safe passage in an old script."],
  ["Bronze ceremonial dagger", 15, "Never sharpened; it was made to be buried."],
  ["Gilded skull cap", 50, "Thin gold leaf over bone, fit for a minor lord."],
  ["Clay servant figurines", 5, "Little workers to serve their master in the afterlife."],
  ["Ivory prayer beads", 30, "Worn smooth by a lifetime of worry."],
  ["Lacquered ancestor tablet", 20, "The family it names would pay well to have it back."],
  ["Tarnished silver circlet", 90, "Its owner was someone important, once."],
  ["Grave-coin pouch", 12, "Old coins of a dead kingdom, placed on the eyes. Collectors pay a little over face value."],
  ["Obsidian mirror", 40, "Buried face-down, so the dead couldn't see themselves."],
  ["Bundle of preserved funeral flowers", 5, "Still faintly fragrant after centuries."],
];

/** Harvestable parts by creature type: [part, value multiplier, skill, who buys it]. */
export const PARTS: Record<string, [string, number, "sur" | "nat" | "arc" | "med" | "rel" | "inv", string][]> = {
  beast: [["pelt", 1, "sur", "furriers and leatherworkers"], ["teeth and claws", 0.5, "sur", "charm-makers"], ["musk glands", 0.7, "med", "perfumers and apothecaries"], ["meat", 0.3, "sur", "cooks, or the party's own pot"]],
  monstrosity: [["hide", 1, "sur", "armorers"], ["organs (preserved)", 1.5, "med", "apothecaries and alchemists"], ["eyes", 1, "arc", "wizards and alchemists"], ["claws", 1.2, "nat", "carvers and weaponsmiths"]],
  dragon: [["scales", 3, "sur", "armorers (dragon-scale armor needs a lot of them)"], ["teeth", 1.5, "sur", "weaponsmiths"], ["heart's blood (vial)", 4, "arc", "wizards and alchemists"]],
  fiend: [["horns", 1.5, "rel", "collectors of the forbidden"], ["ichor (vial)", 2, "arc", "warlocks and alchemists"]],
  undead: [["grave dust (pouch)", 1, "rel", "necromancers (and temples, to destroy it)"], ["ectoplasm (jar)", 2, "arc", "wizards"]],
  aberration: [["eye", 2, "arc", "wizards and sages"], ["ink sac", 1.5, "nat", "scribes and alchemists"]],
  elemental: [["essence (bottled)", 2.5, "arc", "artificers and wizards"], ["core stone", 2, "arc", "artificers"]],
  construct: [["arcane core", 3, "arc", "artificers"], ["fittings and gears", 0.8, "inv", "tinkers"]],
  plant: [["heartwood", 1.2, "nat", "carpenters and druids"], ["seed pods", 0.8, "nat", "herbalists"]],
  fey: [["wing dust (pouch)", 2, "arc", "enchanters"], ["glamoured hair", 1, "arc", "hedge witches"]],
  celestial: [["feathers", 3, "rel", "temples"]],
  giant: [["teeth", 0.6, "sur", "carvers"], ["braided hair (rope)", 0.5, "sur", "ropemakers"]],
  ooze: [["acidic residue (jar)", 1.5, "nat", "alchemists"]],
};
export const SKILL_NAMES = { sur: "Wisdom (Survival)", nat: "Intelligence (Nature)", arc: "Intelligence (Arcana)", med: "Wisdom (Medicine)", rel: "Intelligence (Religion)", inv: "Intelligence (Investigation)" } as const;

/** Containers by theme: [name, can be locked]. */
export const CONTAINERS: Record<string, [string, boolean][]> = {
  humanoid: [["iron-bound chest", true], ["battered strongbox", true], ["lacquered coffer", true], ["brass-bound sea chest", true], ["false-bottomed crate", false], ["locked desk drawer", true]],
  undead: [["stone sarcophagus", true], ["burial niche sealed with plaster", false], ["funerary urn", false], ["lead-lined coffin", true]],
  beast: [["nest of bones and rags", false], ["heap in the back of the den", false]],
  monstrosity: [["nest of bones and rags", false], ["midden heap", false], ["victim's rotted pack", false]],
  dragon: [["glittering heap", false], ["toppled treasure chest", true]],
  fiend: [["iron coffer etched with sigils", true], ["blackened reliquary", true]],
  aberration: [["pulsing membrane sac", false], ["sealed stone jar", true]],
  giant: [["huge leather sack", false], ["chest the size of a cart", true]],
  construct: [["vault compartment", true]],
  plant: [["tangle of roots", false]],
  ooze: [["puddle of half-dissolved belongings", false]],
  fey: [["hollow tree stump", false], ["music box far too big inside", true]],
  celestial: [["silver reliquary", true]],
  elemental: [["crystal geode", false]],
};

/** Container traps: [name, effect with {dmg} and {dc}]. */
export const CONTAINER_TRAPS: [string, string][] = [
  ["Poison needle", "A needle in the lock: 1 piercing damage and a DC {dc} Constitution save or {dmg} poison damage and poisoned for 1 hour."],
  ["Glyph of warding", "A glyph on the lid explodes: DC {dc} Dexterity save, {dmg} fire damage (half on a success) to everyone within 20 feet."],
  ["Gas reservoir", "Opening it releases a cloud: DC {dc} Constitution save or {dmg} poison damage and unconscious for 1 minute."],
  ["Spring blade", "A blade snaps out of the lid: +{atk} to hit, {dmg} slashing damage."],
  ["Alarm", "A bell rings somewhere deeper in, and everything nearby comes to look."],
  ["Acid vial", "A vial in the lid shatters over the opener: DC {dc} Dexterity save, {dmg} acid damage (half on a success)."],
  ["Mimic", "The chest is a mimic. Roll initiative."],
];
